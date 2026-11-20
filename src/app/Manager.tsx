import * as React from "react";
import { createPortal } from "react-dom";
import { CocktailPourStage, type CocktailGarnish, type CocktailVessel } from "@/components/ui/cocktail-pour";
import { CODE_HASH, GB_URL } from "./config";
import { byOrder, clone, missing, newId, photoUrl, sha256, store, toPourItem } from "./data";
import { canPush, deleteFile, GitHubError, loadDb, putDb, putPhoto } from "./github";
import { ideaIngredients, loadIdeas, matchIdea, type CdbDrink } from "./ideas";
import { gbCall } from "./guestbook";
import { GROUPS, NOT_BASE, type Category, type Cocktail, type Db, type GuestMessage, type Ingredient } from "./types";
import { BusyButton, errMsg, Sheet, useArmed, useToast } from "./ui";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*                         Session: GitHub-backed store                       */
/* -------------------------------------------------------------------------- */

export interface Session {
  token: string;
  code: string;
}

export function useAdminStore(onDb: (db: Db) => void) {
  const [db, setDb] = React.useState<Db | null>(null);
  const sha = React.useRef("");
  const dbRef = React.useRef<Db | null>(null);
  const queue = React.useRef<Promise<unknown>>(Promise.resolve());
  const [session, setSession] = React.useState<Session | null>(null);

  const apply = React.useCallback((d: Db) => {
    dbRef.current = d;
    setDb(d);
    onDb(d);
  }, [onDb]);

  const open = React.useCallback(async (s: Session) => {
    const r = await loadDb(s.token);
    sha.current = r.sha;
    apply(r.db);
    setSession(s);
  }, [apply]);

  /** Changes go one at a time, and replay if GitHub changed meanwhile. */
  const mutate = React.useCallback(<T,>(fn: (d: Db) => T, msg: string): Promise<T> => {
    const job = queue.current.then(async () => {
      if (!session || !dbRef.current) throw new Error("Manager fermé");
      let draft = clone(dbRef.current);
      let res = fn(draft);
      try {
        sha.current = await putDb(session.token, draft, sha.current, msg);
      } catch (e) {
        if (!(e instanceof GitHubError) || (e.status !== 409 && e.status !== 422)) throw e;
        const r = await loadDb(session.token);
        sha.current = r.sha;
        draft = clone(r.db);
        res = fn(draft);
        sha.current = await putDb(session.token, draft, sha.current, msg);
      }
      apply(draft);
      return res;
    });
    queue.current = job.catch(() => {});
    return job;
  }, [session, apply]);

  const close = () => setSession(null);
  return { db, session, open, mutate, close };
}

type Store = ReturnType<typeof useAdminStore>;

/* -------------------------------------------------------------------------- */
/*                                   Login                                    */
/* -------------------------------------------------------------------------- */

function Login({ store: s, errorText }: { store: Store; errorText: string }) {
  const [code, setCode] = React.useState("");
  const [key, setKey] = React.useState("");
  const [err, setErr] = React.useState("");
  const [shake, setShake] = React.useState(0);
  const saved = store.get("gh_token");
  const [needKey, setNeedKey] = React.useState(!saved);

  const submit = async () => {
    setErr("");
    if ((await sha256(code.trim())) !== CODE_HASH) {
      setErr("Code incorrect");
      setCode("");
      setShake((n) => n + 1);
      return;
    }
    let token = saved || "";
    if (needKey) {
      token = key.trim();
      if (!token) return setErr("Colle ta clé GitHub");
      try {
        if (!(await canPush(token))) return setErr("Cette clé ne peut pas modifier le dépôt");
      } catch (e) {
        return setErr(errMsg(e));
      }
      store.set("gh_token", token);
    }
    try {
      await s.open({ token, code: code.trim() });
    } catch (e) {
      if (e instanceof GitHubError && e.status === 401) {
        store.del("gh_token");
        setNeedKey(true);
        return setErr("Clé GitHub refusée ou expirée. Colle une nouvelle clé.");
      }
      setErr(errMsg(e) || errorText);
    }
  };

  return (
    <div className="pad rise" style={{ paddingTop: 18 }} dir="ltr">
      <h1 className="h1 big">Manager</h1>
      <form key={shake} className={shake ? "shake" : ""} style={{ marginTop: 28 }} onSubmit={(e) => { e.preventDefault(); }}>
        <div className="field">
          <label htmlFor="code">Code d'accès</label>
          <input className="input" id="code" type="password" inputMode="numeric" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
        {needKey && (
          <div className="field">
            <label htmlFor="ghkey">Clé GitHub (une seule fois sur cet appareil)</label>
            <input className="input" id="ghkey" type="password" autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="github_pat_…" value={key} onChange={(e) => setKey(e.target.value)} />
          </div>
        )}
        <BusyButton type="submit" className="btn full" style={{ marginTop: 18 }} onRun={submit}>Entrer</BusyButton>
        <p className="err">{err}</p>
      </form>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 Manager                                    */
/* -------------------------------------------------------------------------- */

type Edit =
  | { type: "ing"; obj: Ingredient | null }
  | { type: "ckt"; obj: Cocktail | null }
  | { type: "cat"; obj: Category | null }
  | { type: "ideas" };

const VESSELS: [CocktailVessel | "", string][] = [
  ["", "Automatique"], ["coupe", "Coupe"], ["martini", "Verre à martini"], ["rocks", "Tumbler (whisky)"], ["highball", "Verre long"], ["copper-mug", "Mug en cuivre"],
];
const GARNISHES: [CocktailGarnish, string][] = [
  ["none", "Aucune"], ["lemon", "Rondelle de citron"], ["twist", "Zeste de citron"], ["orange", "Rondelle d'orange"], ["mint", "Menthe"], ["basil", "Basilic"], ["cherry", "Cerise"],
];

export function Manager({ store: s, gb, setGb, onExit, errorText }: {
  store: Store;
  gb: GuestMessage[];
  setGb: (g: GuestMessage[]) => void;
  onExit: () => void;
  errorText: string;
}) {
  const toast = useToast();
  const [tab, setTab] = React.useState<"ing" | "ckt" | "cat" | "gb">("ing");
  const [edit, setEdit] = React.useState<Edit | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const { armed, arm } = useArmed();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const pendingPhoto = React.useRef<{ kind: "cocktail" | "categorie"; id: string } | null>(null);

  React.useEffect(() => {
    if (s.session && GB_URL) gbCall<GuestMessage[]>("getGuestbook").then(setGb).catch(() => {});
  }, [s.session, setGb]);

  if (!s.session || !s.db) return <Login store={s} errorText={errorText} />;
  const db = s.db;
  const ings = db.ingredients;
  const cats = db.categories.slice().sort(byOrder);
  const catName = (id: string) => cats.find((c) => c.id === id)?.nom_fr || id;
  const ingName = (r: string) => (r.startsWith("cat:") ? catName(r.slice(4)) : ings.find((x) => x.id === r)?.nom_fr || r);
  const bases = cats.filter((c) => !NOT_BASE.includes(c.id));

  const openEdit = (e: Edit) => {
    setEdit(e);
    setSheetOpen(true);
  };
  const closeSheet = () => setSheetOpen(false);

  /* ---------------- photos ---------------- */
  const pickPhoto = (kind: "cocktail" | "categorie", id: string) => {
    pendingPhoto.current = { kind, id };
    fileRef.current?.click();
  };
  const onFile = async (f: File | undefined) => {
    const target = pendingPhoto.current;
    pendingPhoto.current = null;
    if (!f || !target || !s.session) return;
    toast("Envoi de la photo…");
    try {
      const data = await resize(f);
      const path = `photos/${target.kind === "categorie" ? (target.id === "about" ? "about" : "cat_" + target.id) : target.id}_${Date.now().toString(36)}.jpg`;
      await putPhoto(s.session.token, path, data.split(",")[1], "Photo : " + target.id);
      let old = "";
      await s.mutate((d) => {
        if (target.kind === "categorie" && target.id === "about") {
          old = d.about.photo;
          d.about.photo = path;
          return;
        }
        const row = (target.kind === "categorie" ? d.categories : d.cocktails).find((x) => x.id === target.id);
        if (row) {
          old = row.photo;
          row.photo = path;
        }
      }, "Photo : " + target.id);
      if (old && old !== path && !/^https?:/.test(old)) deleteFile(s.session.token, old, "Ancienne photo : " + target.id).catch(() => {});
      toast("Photo enregistrée");
    } catch (e) {
      toast("Échec : " + errMsg(e));
    }
  };

  /* ---------------- tabs ---------------- */
  const none = <div className="row"><span className="row-sub">Aucun</span></div>;

  const ingTab = GROUPS.map(([g, label], gi) => {
    const items = ings.filter((i) => i.groupe === g);
    return (
      <React.Fragment key={g}>
        <div className="sec"><h3>{label}</h3>{gi === 0 && <button className="add" onClick={() => openEdit({ type: "ing", obj: null })}>+ Ingrédient</button>}</div>
        <div className="box">
          {items.length ? items.map((i) => (
            <div key={i.id} className={cn("row", !i.dispo && "off")}>
              <button className="row-main" onClick={() => openEdit({ type: "ing", obj: i })}>
                {i.couleur ? <span className="thumb" style={{ width: 18, height: 18, borderRadius: 9, background: i.couleur, border: "1px solid rgba(28,26,23,.25)" }} /> : null}
                <span className="row-txt"><span className="row-title">{i.nom_fr}</span>{i.base && <span className="row-sub">{catName(i.base)}</span>}</span>
              </button>
              <button
                className="switch"
                aria-pressed={i.dispo}
                aria-label={`${i.nom_fr} disponible`}
                onClick={() => s.mutate((d) => { const x = d.ingredients.find((y) => y.id === i.id); if (x) x.dispo = !x.dispo; }, (i.dispo ? "Plus dispo : " : "Dispo : ") + i.id).catch((e) => toast("Échec : " + errMsg(e)))}
              />
            </div>
          )) : none}
        </div>
      </React.Fragment>
    );
  });

  const cocktails = db.cocktails.slice().sort(byOrder).map((c) => ({ ...c, manque: missing(c, ings) }));
  const ok = cocktails.filter((c) => !c.manque.length);
  const ko = cocktails.filter((c) => c.manque.length);
  const cktRow = (c: (typeof cocktails)[number]) => (
    <div key={c.id} className={cn("row", c.manque.length > 0 && "off")}>
      <button className="row-main" onClick={() => openEdit({ type: "ckt", obj: c })}>
        <span className="thumb" style={c.photo ? { backgroundImage: `url('${photoUrl(c.photo, true)}')` } : undefined} />
        <span className="row-txt"><span className="row-title">{c.nom}</span><span className="row-sub">{c.manque.length ? "Manque : " + c.manque.map(ingName).join(", ") : catName(c.categorie)}</span></span>
      </button>
    </div>
  );
  const cktTab = (
    <>
      <div className="sec">
        <h3>Disponibles · {ok.length}</h3>
        <span style={{ display: "flex", gap: 8 }}>
          <button className="add" style={{ background: "var(--soft)", color: "var(--ink)" }} onClick={() => openEdit({ type: "ideas" })}>Idées</button>
          <button className="add" onClick={() => openEdit({ type: "ckt", obj: null })}>+ Cocktail</button>
        </span>
      </div>
      <div className="box">{ok.length ? ok.map(cktRow) : none}</div>
      <div className="sec"><h3>Indisponibles · {ko.length}</h3></div>
      <div className="box">{ko.length ? ko.map(cktRow) : none}</div>
    </>
  );

  const catTab = (
    <>
      <div className="sec"><h3>Catégories</h3><button className="add" onClick={() => openEdit({ type: "cat", obj: null })}>+ Catégorie</button></div>
      <div className="box">
        {cats.map((c) => (
          <div key={c.id} className="row">
            <button className="row-main" onClick={() => openEdit({ type: "cat", obj: c })}>
              <span className="thumb" style={c.photo ? { backgroundImage: `url('${photoUrl(c.photo, true)}')` } : undefined} />
              <span className="row-txt"><span className="row-title">{c.nom_fr}</span></span>
            </button>
            <button className="mini" onClick={() => pickPhoto("categorie", c.id)}>{c.photo ? "Photo" : "+ Photo"}</button>
          </div>
        ))}
      </div>
      <div className="sec"><h3>Page About</h3></div>
      <div className="box">
        <div className="row">
          <span className="thumb" style={db.about.photo ? { backgroundImage: `url('${photoUrl(db.about.photo, true)}')` } : undefined} />
          <span className="row-title" style={{ flex: 1 }}>Ta photo</span>
          <button className="mini" onClick={() => pickPhoto("categorie", "about")}>{db.about.photo ? "Changer" : "Ajouter"}</button>
        </div>
      </div>
    </>
  );

  const gbTab = !GB_URL ? (
    <><div className="sec"><h3>Livre d'or</h3></div><div className="box"><div className="row"><span className="row-sub">Pas encore relié.</span></div></div></>
  ) : (
    <>
      <div className="sec"><h3>Messages · {gb.length}</h3></div>
      <div className="box">
        {gb.length ? gb.map((m) => (
          <div key={m.id} className="row">
            <span className="row-wrap"><strong>{m.nom || "Anonyme"}</strong> · <span style={{ color: "var(--mute)" }}>{new Date(m.date).toLocaleDateString("fr-FR")}</span>{"\n"}{m.message}</span>
            <BusyButton className={cn("mini", armed === "gb" + m.id && "armed")} onRun={async () => {
              if (!arm("gb" + m.id)) return;
              try { setGb(await gbCall<GuestMessage[]>("deleteGuestMessage", s.session!.code, m.id)); toast("Message effacé"); }
              catch (e) { toast("Échec : " + errMsg(e)); }
            }}>{armed === "gb" + m.id ? "Sûr ?" : "Effacer"}</BusyButton>
          </div>
        )) : none}
      </div>
    </>
  );

  const tabs: [typeof tab, string][] = [["ing", "Ingrédients"], ["ckt", "Cocktails"], ["cat", "Catégories"], ["gb", "Livre d'or"]];

  return (
    <div dir="ltr">
      <div className="pad" style={{ paddingTop: 18 }}><h1 className="h1 big">Manager</h1></div>
      <div className="seg tabs">
        {tabs.map(([k, l]) => <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === "ing" && ingTab}
      {tab === "ckt" && cktTab}
      {tab === "cat" && catTab}
      {tab === "gb" && gbTab}
      <p className="row-sub" style={{ textAlign: "center", margin: "26px 24px 0", whiteSpace: "normal" }}>Les invités voient les changements 1 à 2 minutes après.</p>
      <button className="logout" onClick={() => { s.close(); onExit(); }}>Quitter le Manager</button>
      <button className={cn("logout", armed === "forget" && "armed")} style={{ marginTop: 0 }} onClick={() => {
        if (!arm("forget")) return;
        store.del("gh_token");
        s.close();
        onExit();
        toast("Clé oubliée");
      }}>{armed === "forget" ? "Sûr ? Touche encore" : "Oublier la clé GitHub de cet appareil"}</button>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; onFile(f); }} />
      {createPortal(
        <Sheet open={sheetOpen} onClose={closeSheet}>
          {edit?.type === "ing" && <IngredientSheet key={edit.obj?.id || "new"} s={s} obj={edit.obj} bases={bases} close={closeSheet} />}
          {edit?.type === "ckt" && <CocktailSheet key={edit.obj?.id || "new-" + (edit.obj?.nom || "")} s={s} obj={edit.obj} cats={cats} bases={bases} close={closeSheet} pickPhoto={pickPhoto} reopen={(c) => openEdit({ type: "ckt", obj: c })} />}
          {edit?.type === "cat" && <CategorySheet key={edit.obj?.id || "new"} s={s} obj={edit.obj} close={closeSheet} />}
          {edit?.type === "ideas" && <IdeasSheet ings={ings} mine={db.cocktails} onAdd={(c) => { openEdit({ type: "ckt", obj: c }); toast("Complète le style et la phrase, puis enregistre"); }} />}
        </Sheet>,
        document.body,
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Sheets                                    */
/* -------------------------------------------------------------------------- */

function Actions({ isNew, onDelete, onSave, close, err }: { isNew: boolean; onDelete: () => Promise<void>; onSave: () => Promise<void>; close: () => void; err: string }) {
  const { armed, arm } = useArmed();
  return (
    <>
      <p className="err">{err}</p>
      <div className="actions">
        {isNew ? <button className="btn ghost" onClick={close}>Annuler</button>
          : <BusyButton className={cn("btn danger", armed === "del" && "armed")} onRun={async () => { if (arm("del")) await onDelete(); }}>{armed === "del" ? "Confirmer" : "Supprimer"}</BusyButton>}
        <BusyButton className="btn" onRun={onSave}>Enregistrer</BusyButton>
      </div>
    </>
  );
}

function Translations({ children }: { children: React.ReactNode }) {
  return <details><summary>Traductions (hébreu, anglais) ›</summary>{children}</details>;
}

function IngredientSheet({ s, obj, bases, close }: { s: Store; obj: Ingredient | null; bases: Category[]; close: () => void }) {
  const toast = useToast();
  const [f, setF] = React.useState<Ingredient>(obj ? { ...obj } : { id: "", groupe: "alcool", base: bases[0]?.id || "", nom_fr: "", nom_he: "", nom_en: "", dispo: true, couleur: "#EEF0EC", opacite: 0.2, dose: 2 });
  const [err, setErr] = React.useState("");
  const set = (p: Partial<Ingredient>) => setF((x) => ({ ...x, ...p }));
  const liquid = !!f.couleur;
  return (
    <div dir="ltr">
      <h2>{obj ? "Ingrédient" : "Nouvel ingrédient"}</h2>
      <div className="field"><label htmlFor="f_nom">Nom</label><input className="input" id="f_nom" value={f.nom_fr} onChange={(e) => set({ nom_fr: e.target.value })} /></div>
      <div className="field"><label htmlFor="f_groupe">Type</label>
        <select className="input" id="f_groupe" value={f.groupe} onChange={(e) => set({ groupe: e.target.value as Ingredient["groupe"] })}>
          {GROUPS.map(([g, l]) => <option key={g} value={g}>{l}</option>)}
        </select></div>
      {f.groupe === "alcool" && (
        <div className="field"><label htmlFor="f_base">Catégorie d'alcool</label>
          <select className="input" id="f_base" value={f.base} onChange={(e) => set({ base: e.target.value })}>
            {bases.map((b) => <option key={b.id} value={b.id}>{b.nom_fr}</option>)}
          </select></div>
      )}
      <div className="row" style={{ marginTop: 14, border: "none" }}>
        <span className="row-title" style={{ flex: 1 }}>Disponible</span>
        <button className="switch" aria-pressed={f.dispo} aria-label="Disponible" onClick={() => set({ dispo: !f.dispo })} />
      </div>
      <div className="row" style={{ border: "none" }}>
        <span className="row-title" style={{ flex: 1 }}>C'est un liquide (versé dans le verre)</span>
        <button className="switch" aria-pressed={liquid} aria-label="Liquide" onClick={() => set({ couleur: liquid ? "" : "#E8E2D2", opacite: liquid ? 0 : 0.5 })} />
      </div>
      {liquid && (
        <>
          <div className="field"><label htmlFor="f_col">Couleur du liquide</label>
            <input className="input" id="f_col" type="color" value={f.couleur} onChange={(e) => set({ couleur: e.target.value })} style={{ height: 52, padding: 6 }} /></div>
          <div className="field"><label htmlFor="f_op">Transparent ↔ opaque</label>
            <input id="f_op" type="range" min={0} max={1} step={0.05} value={f.opacite ?? 0.5} onChange={(e) => set({ opacite: Number(e.target.value) })} /></div>
        </>
      )}
      <Translations>
        <div className="field"><label htmlFor="f_he">Nom en hébreu</label><input className="input" id="f_he" dir="rtl" value={f.nom_he} onChange={(e) => set({ nom_he: e.target.value })} /></div>
        <div className="field"><label htmlFor="f_en">Nom en anglais</label><input className="input" id="f_en" value={f.nom_en} onChange={(e) => set({ nom_en: e.target.value })} /></div>
      </Translations>
      <Actions isNew={!obj} close={close} err={err}
        onDelete={async () => {
          const usedBy = s.db!.cocktails.filter((c) => c.ingredients.includes(f.id)).map((c) => c.nom);
          if (usedBy.length) return setErr("Utilisé dans : " + usedBy.join(", ") + ". Retire-le de ces cocktails d'abord.");
          try { await s.mutate((d) => { d.ingredients = d.ingredients.filter((x) => x.id !== f.id); }, "Suppression ingrédient : " + f.id); close(); toast("Supprimé"); }
          catch (e) { setErr(errMsg(e)); }
        }}
        onSave={async () => {
          const clean: Ingredient = { ...f, nom_fr: f.nom_fr.trim(), nom_he: f.nom_he.trim(), nom_en: f.nom_en.trim(), base: f.groupe === "alcool" ? f.base : "" };
          if (!clean.nom_fr) return setErr("Le nom est obligatoire");
          try {
            await s.mutate((d) => {
              const ex = obj && d.ingredients.find((x) => x.id === obj.id);
              if (ex) Object.assign(ex, clean);
              else d.ingredients.push({ ...clean, id: newId(clean.nom_fr), dose: clean.groupe === "alcool" ? 2 : clean.groupe === "sirop" ? 0.5 : 1 });
            }, "Ingrédient : " + clean.nom_fr);
            close();
            toast("Enregistré");
          } catch (e) { setErr(errMsg(e)); }
        }} />
    </div>
  );
}

function CocktailSheet({ s, obj, cats, bases, close, pickPhoto, reopen }: {
  s: Store; obj: Cocktail | null; cats: Category[]; bases: Category[]; close: () => void;
  pickPhoto: (k: "cocktail", id: string) => void; reopen: (c: Cocktail) => void;
}) {
  const toast = useToast();
  const db = s.db!;
  const blank: Cocktail = { id: "", nom: "", categorie: cats[0]?.id || "autres", style_fr: "", style_he: "", style_en: "", phrase_fr: "", phrase_he: "", phrase_en: "", ingredients: [], photo: "", ordre: 0 };
  const [f, setF] = React.useState<Cocktail>(obj ? clone(obj) : blank);
  const [err, setErr] = React.useState("");
  const set = (p: Partial<Cocktail>) => setF((x) => ({ ...x, ...p }));
  const live = obj?.id ? db.cocktails.find((c) => c.id === obj.id) : undefined;
  const photo = live?.photo ?? f.photo;
  const toggle = (r: string) => set({ ingredients: f.ingredients.includes(r) ? f.ingredients.filter((x) => x !== r) : [...f.ingredients, r] });
  const chip = (r: string, label: string) => (
    <button key={r} className="chip" aria-pressed={f.ingredients.includes(r)} onClick={() => toggle(r)}>{label}</button>
  );
  const preview = React.useMemo(() => toPourItem(f, db.ingredients, "fr"), [f, db.ingredients]);
  const previewKey = [preview.vessel, preview.garnish, preview.ice, f.ingredients.join(","), JSON.stringify(f.doses || {})].join("|");

  return (
    <div dir="ltr">
      <h2>{obj?.id ? obj.nom : obj?.nom || "Nouveau cocktail"}</h2>
      <div className="field"><label>Le verre (aperçu)</label>
        <CocktailPourStage item={preview} replay={hash(previewKey)} className="mx-auto max-w-[300px]" />
      </div>
      <div className="field"><label htmlFor="f_verre">Verre</label>
        <select className="input" id="f_verre" value={f.verre || ""} onChange={(e) => set({ verre: (e.target.value || undefined) as CocktailVessel | undefined })}>
          {VESSELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select></div>
      <div className="row" style={{ border: "none" }}>
        <span className="row-title" style={{ flex: 1 }}>Glaçons</span>
        <button className="switch" aria-pressed={preview.ice} aria-label="Glaçons" onClick={() => set({ glace: !preview.ice })} />
      </div>
      <div className="field"><label htmlFor="f_garn">Garniture</label>
        <select className="input" id="f_garn" value={f.garniture || "none"} onChange={(e) => set({ garniture: e.target.value as CocktailGarnish })}>
          {GARNISHES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select></div>
      {f.doses && Object.keys(f.doses).length > 0 && (
        <div className="row" style={{ border: "none" }}>
          <span className="row-sub" style={{ flex: 1, whiteSpace: "normal" }}>Doses du verre : réglées à la main.</span>
          <button className="mini" onClick={() => set({ doses: undefined })}>Recalculer</button>
        </div>
      )}
      <div className="field"><label>Photo</label>
        <div className="photo-row">
          <span className="thumb" style={photo ? { backgroundImage: `url('${photoUrl(photo, true)}')` } : undefined} />
          <button className="mini" onClick={() => { if (!obj?.id) return setErr("Enregistre d'abord le cocktail, puis ajoute la photo."); pickPhoto("cocktail", obj.id); }}>{photo ? "Changer la photo" : "Ajouter une photo"}</button>
        </div></div>
      <div className="field"><label htmlFor="f_nom">Nom</label><input className="input" id="f_nom" value={f.nom} onChange={(e) => set({ nom: e.target.value })} /></div>
      <div className="field"><label htmlFor="f_cat">Catégorie</label>
        <select className="input" id="f_cat" value={f.categorie} onChange={(e) => set({ categorie: e.target.value })}>
          {cats.map((k) => <option key={k.id} value={k.id}>{k.nom_fr}</option>)}
        </select></div>
      <div className="field"><label htmlFor="f_style">Style</label><input className="input" id="f_style" placeholder="Frais · Acidulé" value={f.style_fr} onChange={(e) => set({ style_fr: e.target.value })} /></div>
      <div className="field"><label htmlFor="f_phrase">Phrase</label><textarea className="input" id="f_phrase" value={f.phrase_fr} onChange={(e) => set({ phrase_fr: e.target.value })} /></div>
      <div className="field"><label>Ingrédients</label>
        <div className="chip-group"><p>Alcool de base, n'importe quelle bouteille</p><div className="chips">{bases.map((b) => chip("cat:" + b.id, b.nom_fr))}</div></div>
        {GROUPS.map(([g, l]) => {
          const items = db.ingredients.filter((i) => i.groupe === g);
          return items.length ? <div key={g} className="chip-group"><p>{l}</p><div className="chips">{items.map((i) => chip(i.id, i.nom_fr))}</div></div> : null;
        })}
      </div>
      <Translations>
        <div className="field"><label htmlFor="f_style_he">Style en hébreu</label><input className="input" id="f_style_he" dir="rtl" value={f.style_he} onChange={(e) => set({ style_he: e.target.value })} /></div>
        <div className="field"><label htmlFor="f_phrase_he">Phrase en hébreu</label><textarea className="input" id="f_phrase_he" dir="rtl" value={f.phrase_he} onChange={(e) => set({ phrase_he: e.target.value })} /></div>
        <div className="field"><label htmlFor="f_style_en">Style en anglais</label><input className="input" id="f_style_en" value={f.style_en} onChange={(e) => set({ style_en: e.target.value })} /></div>
        <div className="field"><label htmlFor="f_phrase_en">Phrase en anglais</label><textarea className="input" id="f_phrase_en" value={f.phrase_en} onChange={(e) => set({ phrase_en: e.target.value })} /></div>
      </Translations>
      <Actions isNew={!obj?.id} close={close} err={err}
        onDelete={async () => {
          try { await s.mutate((d) => { d.cocktails = d.cocktails.filter((x) => x.id !== f.id); }, "Suppression cocktail : " + f.id); close(); toast("Supprimé"); }
          catch (e) { setErr(errMsg(e)); }
        }}
        onSave={async () => {
          const nom = f.nom.trim();
          if (!nom) return setErr("Le nom est obligatoire");
          if (!f.ingredients.length) return setErr("Ajoute au moins un ingrédient");
          // keep only the doses of ingredients still in the cocktail
          const doses = f.doses ? Object.fromEntries(Object.entries(f.doses).filter(([r]) => f.ingredients.includes(r))) : undefined;
          const clean: Cocktail = { ...f, nom, doses: doses && Object.keys(doses).length ? doses : undefined };
          try {
            const id = await s.mutate((d) => {
              const ex = obj?.id && d.cocktails.find((x) => x.id === obj.id);
              if (ex) { Object.assign(ex, clean); return ex.id; }
              const nid = newId(nom);
              const max = d.cocktails.reduce((m, c) => Math.max(m, Number(c.ordre) || 0), 0);
              d.cocktails.push({ ...clean, id: nid, ordre: max + 1, photo: /^https:\/\//.test(clean.photo) ? clean.photo : "" });
              return nid;
            }, "Cocktail : " + nom);
            if (!obj?.id) {
              toast("Enregistré, tu peux ajouter la photo");
              reopen({ ...clean, id, photo: /^https:\/\//.test(clean.photo) ? clean.photo : "" });
            } else {
              close();
              toast("Enregistré");
            }
          } catch (e) { setErr(errMsg(e)); }
        }} />
    </div>
  );
}

function CategorySheet({ s, obj, close }: { s: Store; obj: Category | null; close: () => void }) {
  const toast = useToast();
  const [f, setF] = React.useState<Category>(obj ? { ...obj } : { id: "", nom_fr: "", nom_he: "", nom_en: "", ordre: 0, photo: "" });
  const [err, setErr] = React.useState("");
  const set = (p: Partial<Category>) => setF((x) => ({ ...x, ...p }));
  return (
    <div dir="ltr">
      <h2>{obj ? obj.nom_fr : "Nouvelle catégorie"}</h2>
      <div className="field"><label htmlFor="f_nom">Nom</label><input className="input" id="f_nom" value={f.nom_fr} onChange={(e) => set({ nom_fr: e.target.value })} /></div>
      <Translations>
        <div className="field"><label htmlFor="f_he">Nom en hébreu</label><input className="input" id="f_he" dir="rtl" value={f.nom_he} onChange={(e) => set({ nom_he: e.target.value })} /></div>
        <div className="field"><label htmlFor="f_en">Nom en anglais</label><input className="input" id="f_en" value={f.nom_en} onChange={(e) => set({ nom_en: e.target.value })} /></div>
      </Translations>
      <Actions isNew={!obj} close={close} err={err}
        onDelete={async () => {
          const d0 = s.db!;
          const usedBy = d0.cocktails.filter((c) => c.categorie === f.id).map((c) => c.nom).concat(d0.ingredients.filter((i) => i.base === f.id).map((i) => i.nom_fr));
          if (usedBy.length) return setErr("Utilisée par : " + usedBy.join(", ") + ". Change-les de catégorie d'abord.");
          try { await s.mutate((d) => { d.categories = d.categories.filter((x) => x.id !== f.id); }, "Suppression catégorie : " + f.id); close(); toast("Supprimée"); }
          catch (e) { setErr(errMsg(e)); }
        }}
        onSave={async () => {
          const clean = { nom_fr: f.nom_fr.trim(), nom_he: f.nom_he.trim(), nom_en: f.nom_en.trim() };
          if (!clean.nom_fr) return setErr("Le nom est obligatoire");
          try {
            await s.mutate((d) => {
              const ex = obj && d.categories.find((x) => x.id === obj.id);
              if (ex) Object.assign(ex, clean);
              else d.categories.push({ ...clean, id: newId(clean.nom_fr), photo: "", ordre: d.categories.reduce((m, c) => Math.max(m, Number(c.ordre) || 0), 0) + 1 });
            }, "Catégorie : " + clean.nom_fr);
            close();
            toast("Enregistré");
          } catch (e) { setErr(errMsg(e)); }
        }} />
    </div>
  );
}

function IdeasSheet({ ings, mine, onAdd }: { ings: Ingredient[]; mine: Cocktail[]; onAdd: (c: Cocktail) => void }) {
  const [all, setAll] = React.useState<CdbDrink[] | null>(null);
  const [err, setErr] = React.useState("");
  React.useEffect(() => { loadIdeas().then(setAll).catch((e) => setErr(errMsg(e))); }, []);
  const names = new Set(mine.map((c) => c.nom.toLowerCase()));
  const now: [CdbDrink, ReturnType<typeof matchIdea>][] = [];
  const one: typeof now = [];
  (all || []).forEach((d) => {
    if (names.has(d.strDrink.toLowerCase())) return;
    const m = matchIdea(d, ings);
    if (!m.ids.length) return;
    if (!m.missing.length) now.push([d, m]);
    else if (m.missing.length === 1) one.push([d, m]);
  });
  const byName = (a: (typeof now)[number], b: (typeof now)[number]) => a[0].strDrink.localeCompare(b[0].strDrink);
  now.sort(byName);
  one.sort(byName);
  const row = ([d, m]: (typeof now)[number]) => (
    <div key={d.idDrink} className="row">
      <span className="thumb" style={d.strDrinkThumb ? { backgroundImage: `url('${d.strDrinkThumb}/preview')` } : undefined} />
      <span className="row-txt" style={{ flex: 1 }}>
        <span className="row-title">{d.strDrink}</span>
        <span className="row-sub" style={{ whiteSpace: "normal" }}>{m.missing.length ? "Manque : " + m.missing.join(", ") : ideaIngredients(d).join(" · ")}</span>
      </span>
      <button className="mini" onClick={() => onAdd({
        id: "", nom: d.strDrink, categorie: m.cat, style_fr: "", style_he: "", style_en: "", phrase_fr: "", phrase_he: "", phrase_en: "",
        ingredients: m.ids, photo: d.strDrinkThumb || "", ordre: 0,
      })}>Ajouter</button>
    </div>
  );
  return (
    <div dir="ltr">
      <h2>Idées</h2>
      <p className="row-sub" style={{ whiteSpace: "normal", margin: "8px 0 0" }}>D'après ton stock, dans la base TheCocktailDB (recettes en anglais).</p>
      <div style={{ marginTop: 18 }}>
        {err ? <p className="err">{err}. Réessaie plus tard.</p> : !all ? <p className="empty" style={{ padding: "40px 0" }}><span className="spin" /></p> : (
          <>
            <div className="sec" style={{ margin: "0 0 10px" }}><h3>Faisables maintenant · {now.length}</h3></div>
            <div className="box" style={{ margin: 0 }}>{now.length ? now.map(row) : <div className="row"><span className="row-sub">Aucun</span></div>}</div>
            <div className="sec" style={{ margin: "24px 0 10px" }}><h3>Il manque un ingrédient · {one.length}</h3></div>
            <div className="box" style={{ margin: 0 }}>{one.length ? one.slice(0, 60).map(row) : <div className="row"><span className="row-sub">Aucun</span></div>}</div>
          </>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function resize(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const im = new Image();
    const url = URL.createObjectURL(file);
    im.onload = () => {
      const max = 1400;
      const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(im.naturalWidth * k);
      c.height = Math.round(im.naturalHeight * k);
      c.getContext("2d")!.drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL("image/jpeg", 0.85));
    };
    im.onerror = rej;
    im.src = url;
  });
}

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CocktailPourMenu, CocktailPourStage } from "@/components/ui/cocktail-pour";
import { GB_URL } from "./config";
import { computePub, photoUrl, pick, store, toPourItem, type Pub } from "./data";
import { gbCall } from "./guestbook";
import { ABOUT, BAR, tr } from "./i18n";
import { Manager, useAdminStore } from "./Manager";
import type { Cocktail, Db, GuestMessage, Lang } from "./types";
import { Burger, Chevron, ChevronBack, Cross, Img, Lock, useDragToClose, useToast } from "./ui";
import { cn } from "@/lib/utils";

type View = "home" | "cat" | "surprise" | "guestbook" | "about" | "manager";

export default function App() {
  const toast = useToast();
  const reduce = useReducedMotion() ?? false;
  const [lang, setLangState] = React.useState<Lang>(((store.get("lang") as Lang) || "fr"));
  const [db, setDb] = React.useState<Db | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [stack, setStack] = React.useState<View[]>(["home"]);
  const [dir, setDir] = React.useState(1);
  const [curCat, setCurCat] = React.useState<string | null>(null);
  const [menu, setMenu] = React.useState(false);
  const [acc, setAcc] = React.useState(false);
  const [gb, setGb] = React.useState<GuestMessage[]>([]);
  const admin = useAdminStore(setDb);
  const live = !!admin.session; // Manager open: photos read straight from GitHub

  const t = (k: string) => tr(lang, k);
  const view = stack[stack.length - 1];

  /* data */
  React.useEffect(() => {
    fetch("data.json?t=" + Date.now(), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("data.json"))))
      .then((d: Db) => setDb(d))
      .catch(() => {
        setFailed(true);
        toast(tr(lang, "error"));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pub: Pub | null = React.useMemo(() => (db ? computePub(db) : null), [db]);

  /* language and direction */
  React.useEffect(() => {
    document.documentElement.lang = lang;
    document.body.dir = lang === "he" ? "rtl" : "ltr";
  }, [lang]);
  const setLang = (l: Lang) => {
    setLangState(l);
    store.set("lang", l);
  };

  /* navigation */
  const go = (v: View, reset = true) => {
    setDir(1);
    setStack((s) => (reset ? ["home", v] : [...s, v]));
  };
  const back = () => {
    setDir(-1);
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  };
  const goHome = () => {
    setDir(-1);
    setStack(["home"]);
  };
  const fromMenu = (v: View) => {
    setMenu(false);
    if (view !== v) go(v);
  };
  const openCat = (id: string) => {
    setMenu(false);
    setCurCat(id);
    if (view !== "cat") go("cat");
  };

  const cats = pub ? pub.categories.filter((c) => pub.cocktails.some((k) => k.categorie === c.id)) : [];
  const catLabel = (id: string) => {
    const c = pub?.categories.find((x) => x.id === id);
    return c ? pick(c, "nom", lang) : id;
  };
  const ingLabel = (r: string) => {
    if (r.startsWith("cat:")) return catLabel(r.slice(4));
    const l = pub?.labels[r];
    return l ? l[lang] || l.fr : r;
  };
  const card = (c: Cocktail, i: number) => (
    <article key={c.id} className="ck rise" style={{ "--i": i } as React.CSSProperties}>
      <div className="ph">{c.photo ? <Img src={photoUrl(c.photo, live)} alt={c.nom} /> : <span className="ph-word">{c.nom}</span>}</div>
      <div className="ck-head"><h2 className="ck-name">{c.nom}</h2><span className="ck-style">{pick(c, "style", lang)}</span></div>
      {pick(c, "phrase", lang) && <p className="ck-phrase">{pick(c, "phrase", lang)}</p>}
      <p className="ck-ing">{c.ingredients.map(ingLabel).join(" · ")}</p>
    </article>
  );

  /* views */
  const render = (v: View): React.ReactNode => {
    if (!pub) return failed ? <p className="empty rise">{t("error")}</p> : null;
    if (v === "home")
      return (
        <>
          <div className="pad rise" style={{ paddingTop: 18 }}><p className="eyebrow">{BAR}</p><h1 className="h1 big">{t("choose")}</h1></div>
          {cats.length ? (
            <div className="cat-grid">
              {cats.map((c, i) => (
                <button key={c.id} className="cat rise" style={{ "--i": i + 1 } as React.CSSProperties} onClick={() => openCat(c.id)}>
                  <div className="ph">{c.photo ? <Img src={photoUrl(c.photo, live)} alt={catLabel(c.id)} /> : <span className="ph-word">{catLabel(c.id)}</span>}</div>
                  <span className="cat-name">{catLabel(c.id)}</span>
                </button>
              ))}
            </div>
          ) : <p className="empty rise">{t("empty")}</p>}
        </>
      );
    if (v === "cat") return <CategoryView key={curCat} pub={pub} cat={curCat} lang={lang} title={catLabel(curCat || "")} card={card} />;
    if (v === "surprise") return <SurpriseView pub={pub} lang={lang} t={t} catLabel={catLabel} card={card} />;
    if (v === "guestbook") return <GuestbookView lang={lang} t={t} gb={gb} setGb={setGb} />;
    if (v === "about") {
      const a = ABOUT[lang] || ABOUT.fr;
      return (
        <>
          <div className="pad rise" style={{ paddingTop: 18 }}><p className="eyebrow">{BAR}</p><h1 className="h1 big">{a.title}</h1></div>
          {pub.aboutPhoto && <div className="pad rise" style={{ "--i": 1, marginTop: 24 } as React.CSSProperties}><div className="ph about-ph"><Img src={photoUrl(pub.aboutPhoto, live)} alt="David Kosman" /></div></div>}
          <div className="pad">{a.p.map((x, i) => <p key={i} className="lead rise" style={{ "--i": i + 2 } as React.CSSProperties}>{x}</p>)}</div>
        </>
      );
    }
    return <Manager store={admin} gb={gb} setGb={setGb} onExit={goHome} errorText={t("error")} />;
  };

  const s = 32 * dir * (lang === "he" ? -1 : 1);
  return (
    <>
      <div id="app">
        <header className="top" dir="ltr">
          <button className={cn("icon-btn", stack.length < 2 && "hide")} onClick={back} aria-label="Retour"><ChevronBack /></button>
          <button className="icon-btn" onClick={() => setMenu(true)} aria-label="Menu" aria-expanded={menu} aria-controls="drawer"><Burger /></button>
        </header>
        <main>
          <AnimatePresence initial={false}>
            <motion.section
              key={view + (view === "cat" ? curCat : "")}
              className="view active"
              initial={reduce ? { opacity: 0 } : { opacity: 0, x: s }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: -s }}
              transition={{ duration: reduce ? 0.2 : 0.32, ease: [0.23, 1, 0.32, 1] }}
            >
              {render(view)}
            </motion.section>
          </AnimatePresence>
        </main>
      </div>
      <Drawer
        open={menu}
        onClose={() => setMenu(false)}
        acc={acc}
        setAcc={setAcc}
        cats={cats.map((c) => ({ id: c.id, label: catLabel(c.id) }))}
        openCat={openCat}
        go={fromMenu}
        lang={lang}
        setLang={setLang}
        t={t}
      />
      <div className={cn("splash", pub || failed ? "out" : "")}><span>{BAR}</span></div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*                Category: the pour stage, the names, the card                */
/* -------------------------------------------------------------------------- */

function CategoryView({ pub, cat, lang, title, card }: {
  pub: Pub; cat: string | null; lang: Lang; title: string; card: (c: Cocktail, i: number) => React.ReactNode;
}) {
  const list = pub.cocktails.filter((c) => c.categorie === cat);
  const [sel, setSel] = React.useState(list[0]?.id);
  const items = React.useMemo(() => list.map((c) => toPourItem(c, lang)), [list, lang]);
  const current = list.find((c) => c.id === sel) || list[0];
  return (
    <>
      <div className="pad rise" style={{ paddingTop: 18 }}><h1 className="h1 big">{title}</h1></div>
      <div className="pad rise" style={{ "--i": 1, marginTop: 22 } as React.CSSProperties}>
        <CocktailPourMenu items={items} value={current?.id} onValueChange={setSel} label={title} />
      </div>
      {current && (
        <div className="list" key={current.id}>{card(current, 2)}</div>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Surprise                                 */
/* -------------------------------------------------------------------------- */

function SurpriseView({ pub, lang, t, catLabel, card }: {
  pub: Pub; lang: Lang; t: (k: string) => string; catLabel: (id: string) => string; card: (c: Cocktail, i: number) => React.ReactNode;
}) {
  const draw = React.useCallback((not?: string) => {
    const all = pub.cocktails;
    const pool = all.length > 1 ? all.filter((c) => c.id !== not) : all;
    return pool[Math.floor(Math.random() * pool.length)];
  }, [pub.cocktails]);
  const [c, setC] = React.useState<Cocktail | undefined>(() => draw());
  if (!c) return <p className="empty rise">{t("empty")}</p>;
  return (
    <>
      <div className="pad rise" style={{ paddingTop: 18 }}><p className="eyebrow">{catLabel(c.categorie)}</p><h1 className="h1 big">{t("surprise")}</h1></div>
      <div className="pad rise" style={{ "--i": 1, marginTop: 22 } as React.CSSProperties}>
        <CocktailPourStage item={toPourItem(c, lang)} />
      </div>
      <button className="again rise" style={{ "--i": 2 } as React.CSSProperties} onClick={() => setC(draw(c.id))}>{t("another")}</button>
      <div className="list" key={c.id}>{card(c, 3)}</div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Guestbook                                 */
/* -------------------------------------------------------------------------- */

function GuestbookView({ lang, t, gb, setGb }: { lang: Lang; t: (k: string) => string; gb: GuestMessage[]; setGb: (g: GuestMessage[]) => void }) {
  const toast = useToast();
  const [loaded, setLoaded] = React.useState(false);
  const [nom, setNom] = React.useState("");
  const [msg, setMsg] = React.useState("");
  const [out, setOut] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    gbCall<GuestMessage[]>("getGuestbook").then(setGb).catch(() => toast(t("error"))).finally(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const fmt = (d: string) => {
    try { return new Date(d).toLocaleDateString(lang === "he" ? "he-IL" : lang === "en" ? "en-GB" : "fr-FR", { day: "numeric", month: "long", year: "numeric" }); }
    catch { return ""; }
  };
  return (
    <>
      <div className="pad rise" style={{ paddingTop: 18 }}><p className="eyebrow">{BAR}</p><h1 className="h1 big">{t("guestbook")}</h1></div>
      <form className="pad rise" style={{ "--i": 1, margin: "8px 0 30px" } as React.CSSProperties} onSubmit={async (e) => {
        e.preventDefault();
        if (!msg.trim()) return setOut({ ok: false, text: t("gbEmpty") });
        setBusy(true);
        try {
          setGb(await gbCall<GuestMessage[]>("addGuestMessage", nom, msg.trim()));
          setNom(""); setMsg(""); setOut({ ok: true, text: t("thanks") });
        } catch { setOut({ ok: false, text: t("error") }); }
        finally { setBusy(false); }
      }}>
        <div className="field"><label htmlFor="gb_nom">{t("gbName")}</label><input className="input" id="gb_nom" maxLength={40} autoComplete="given-name" value={nom} onChange={(e) => setNom(e.target.value)} /></div>
        <div className="field"><label htmlFor="gb_msg">{t("gbMsg")}</label><textarea className="input" id="gb_msg" maxLength={500} value={msg} onChange={(e) => setMsg(e.target.value)} /></div>
        <button className="btn full" type="submit" style={{ marginTop: 16 }} disabled={busy}>{busy ? <span className="spin" /> : t("send")}</button>
        <p className={cn("err", out?.ok && "ok")}>{out?.text}</p>
      </form>
      <div>
        {!loaded ? <p className="empty">{t("loading")}</p> : gb.length ? gb.map((m, i) => (
          <div key={m.id} className="gb-item rise" style={{ "--i": Math.min(i, 8) } as React.CSSProperties}>
            <p className="gb-msg">{m.message}</p>
            <p className="gb-meta">{m.nom ? m.nom + " · " : ""}{fmt(m.date)}</p>
          </div>
        )) : <p className="empty">{t("noMsg")}</p>}
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*                                    Menu                                    */
/* -------------------------------------------------------------------------- */

function Drawer({ open, onClose, acc, setAcc, cats, openCat, go, lang, setLang, t }: {
  open: boolean; onClose: () => void; acc: boolean; setAcc: (v: boolean) => void;
  cats: { id: string; label: string }[]; openCat: (id: string) => void; go: (v: View) => void;
  lang: Lang; setLang: (l: Lang) => void; t: (k: string) => string;
}) {
  const ref = React.useRef<HTMLElement>(null);
  useDragToClose(ref, "x", open, onClose);
  return (
    <>
      <div className={cn("veil", open && "on")} onClick={onClose} />
      <nav ref={ref} id="drawer" className={cn("drawer", open && "on")} aria-label="Menu">
        <button className="icon-btn drawer-close" onClick={onClose} aria-label="Fermer"><Cross /></button>
        <div className={acc ? "open" : ""}>
          <button className="d-big" aria-expanded={acc} onClick={() => setAcc(!acc)}>{t("drinks")}<Chevron /></button>
          <div className={cn("acc", acc && "open")}><div>
            {cats.map((c) => <button key={c.id} className="d-sub" onClick={() => openCat(c.id)}>{c.label}</button>)}
          </div></div>
        </div>
        <div className="d-sep" />
        <button className="d-big" onClick={() => go("surprise")}>{t("surprise")}</button>
        {GB_URL && <button className="d-big" onClick={() => go("guestbook")}>{t("guestbook")}</button>}
        <button className="d-big" onClick={() => go("about")}>{t("about")}</button>
        <div style={{ flex: 1, minHeight: 20 }} />
        <p className="eyebrow" style={{ marginBottom: 10 }}>{t("lang")}</p>
        <div className="seg" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))" }} dir="ltr">
          {([["fr", "FR"], ["he", "עב"], ["en", "EN"]] as [Lang, string][]).map(([k, l]) => (
            <button key={k} aria-pressed={lang === k} onClick={() => setLang(k)}>{l}</button>
          ))}
        </div>
        <button className="d-manager" onClick={() => go("manager")}><Lock />{t("manager")}</button>
      </nav>
    </>
  );
}

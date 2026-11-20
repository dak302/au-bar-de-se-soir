import type { CocktailPourItem, CocktailVessel } from "@/components/ui/cocktail-pour";
import { BRANCH, REPO } from "./config";
import type { Cocktail, Db, Ingredient, Lang } from "./types";

export const isOn = (v: unknown) => v === true || String(v).toUpperCase() === "TRUE";
export const byOrder = (a: { ordre?: number }, b: { ordre?: number }) => (Number(a.ordre) || 0) - (Number(b.ordre) || 0);
export const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o));

export const store = {
  get(k: string) {
    try { return localStorage.getItem(k); } catch { return null; }
  },
  set(k: string, v: string) {
    try { localStorage.setItem(k, v); } catch { /* private mode */ }
  },
  del(k: string) {
    try { localStorage.removeItem(k); } catch { /* private mode */ }
  },
};

/** Ingredients a cocktail still lacks (cat:gin = any available gin). */
export function missing(c: Cocktail, ings: Ingredient[]) {
  return (c.ingredients || []).filter((r) => {
    if (r.startsWith("cat:")) {
      const b = r.slice(4);
      return !ings.some((i) => i.base === b && isOn(i.dispo));
    }
    const i = ings.find((x) => x.id === r);
    return !(i && isOn(i.dispo));
  });
}

export interface Pub {
  categories: Db["categories"];
  aboutPhoto: string;
  cocktails: Cocktail[];
  labels: Record<string, { fr: string; he: string; en: string }>;
}

/** What guests see: only cocktails whose every ingredient is available. */
export function computePub(d: Db): Pub {
  const visible = d.cocktails.filter((c) => !missing(c, d.ingredients).length).sort(byOrder);
  const labels: Pub["labels"] = {};
  visible.forEach((c) =>
    c.ingredients.forEach((r) => {
      if (r.startsWith("cat:") || labels[r]) return;
      const i = d.ingredients.find((x) => x.id === r);
      if (i) labels[r] = { fr: i.nom_fr, he: i.nom_he, en: i.nom_en };
    }),
  );
  return { categories: d.categories.slice().sort(byOrder), aboutPhoto: d.about?.photo || "", cocktails: visible, labels };
}

export const pick = (o: unknown, f: string, lang: Lang): string => {
  const r = o as Record<string, string> | undefined;
  return (r && (r[`${f}_${lang}`] || r[`${f}_fr`])) || "";
};

/** Photo address. In the Manager, read straight from GitHub (visible at once, before the site republishes). */
export function photoUrl(p: string, live: boolean) {
  if (!p) return "";
  if (/^(https?:|data:)/.test(p)) return p;
  return live ? `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${p}` : p;
}

export function newId(text: string) {
  const base =
    String(text || "x").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 24) || "x";
  return base + "_" + Math.random().toString(36).slice(2, 6);
}

export async function sha256(s: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* -------------------------------------------------------------------------- */
/*                         From a cocktail to a pour                          */
/* -------------------------------------------------------------------------- */

export const DEFAULT_COLOUR = "#E9C27A";

/** The glass a cocktail goes in when none was chosen. */
export function defaultVessel(c: Cocktail): CocktailVessel {
  if (c.ingredients.includes("ginger_beer")) return "copper-mug";
  if (c.ingredients.includes("eau_gazeuse")) return "highball";
  if (c.categorie === "whisky" || c.ingredients.includes("campari")) return "rocks";
  return "coupe";
}

/** One liquid, one colour: the cocktail as it looks in the glass. */
export function toPourItem(c: Cocktail, lang: Lang): CocktailPourItem {
  const vessel = c.verre || defaultVessel(c);
  const fill = vessel === "martini" ? 0.8 : vessel === "coupe" ? 0.82 : 0.78;
  return {
    id: c.id,
    name: c.nom,
    subtitle: pick(c, "style", lang),
    description: pick(c, "phrase", lang),
    vessel,
    layers: [{ color: c.couleur || DEFAULT_COLOUR, alpha: c.opacite ?? 0.85, amount: fill }],
    ice: c.glace ?? ["rocks", "highball", "copper-mug"].includes(vessel),
    foam: c.mousse || 0,
    garnish: c.garniture || "none",
  };
}

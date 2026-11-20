import type { CocktailPourItem, CocktailVessel, PourLayer } from "@/components/ui/cocktail-pour";
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

const SODA = ["ginger_beer", "eau_gazeuse"];
const GROUP_ORDER = { alcool: 0, liqueur: 1, frais: 2, sirop: 3, bitters: 4 } as const;
const BASE_COLOUR: Record<string, [string, number]> = {
  whisky: ["#D99A3E", 0.72],
  tequila: ["#F0ECE0", 0.16],
};

/** The glass a cocktail goes in when none was chosen. */
export function defaultVessel(c: Cocktail): CocktailVessel {
  if (c.ingredients.some((r) => SODA.includes(r))) return c.ingredients.includes("ginger_beer") ? "copper-mug" : "highball";
  if (c.categorie === "whisky" || c.ingredients.includes("campari")) return "rocks";
  return "coupe";
}

/** Colour of an ingredient (a "cat:" one takes the first bottle on the shelf). */
function colourOf(r: string, ings: Ingredient[]): [string, number] | null {
  let ing: Ingredient | undefined;
  if (r.startsWith("cat:")) {
    const b = r.slice(4);
    ing = ings.find((i) => i.base === b && isOn(i.dispo)) || ings.find((i) => i.base === b);
    if (!ing?.couleur) return BASE_COLOUR[b] || ["#EEF0EC", 0.16];
  } else {
    ing = ings.find((i) => i.id === r);
  }
  if (!ing || !ing.couleur) return null;
  return [ing.couleur, ing.opacite ?? 0.5];
}

/** Parts per ingredient: the cocktail's own doses, else worked out from the ingredients. */
export function dosesOf(c: Cocktail, ings: Ingredient[]): Record<string, number> {
  if (c.doses && Object.keys(c.doses).length) return c.doses;
  const rank = (r: string) => {
    if (SODA.includes(r)) return 9;
    if (r.startsWith("cat:")) return -1;
    const i = ings.find((x) => x.id === r);
    return i ? GROUP_ORDER[i.groupe] ?? 5 : 5;
  };
  const out: Record<string, number> = {};
  c.ingredients
    .slice()
    .sort((a, b) => rank(a) - rank(b))
    .forEach((r) => {
      const i = r.startsWith("cat:") ? null : ings.find((x) => x.id === r);
      out[r] = r.startsWith("cat:") ? 2 : i?.dose ?? 1;
    });
  return out;
}

export function toPourItem(c: Cocktail, ings: Ingredient[], lang: Lang): CocktailPourItem {
  const vessel = c.verre || defaultVessel(c);
  const fill = vessel === "martini" ? 0.8 : vessel === "coupe" ? 0.82 : 0.78;
  const doses = dosesOf(c, ings);
  const parts = Object.entries(doses)
    .map(([r, d]) => ({ col: colourOf(r, ings), d: Number(d) || 0 }))
    .filter((p): p is { col: [string, number]; d: number } => !!p.col && p.d > 0);
  const total = parts.reduce((s, p) => s + p.d, 0) || 1;
  const layers: PourLayer[] = parts.map((p) => ({ color: p.col[0], alpha: p.col[1], amount: (p.d / total) * fill }));
  return {
    id: c.id,
    name: c.nom,
    subtitle: pick(c, "style", lang),
    description: pick(c, "phrase", lang),
    vessel,
    layers: layers.length ? layers : [{ color: "#EEF0EC", alpha: 0.2, amount: fill }],
    blend: c.melange ?? 1,
    ice: c.glace ?? ["rocks", "highball", "copper-mug"].includes(vessel),
    foam: c.mousse || 0,
    garnish: c.garniture || "none",
  };
}

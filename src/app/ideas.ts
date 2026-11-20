import type { Ingredient } from "./types";

/** TheCocktailDB: ~600 public cocktails (in English), queried only from the Manager. */
const CDB = "https://www.thecocktaildb.com/api/json/v1/1/search.php?f=";

export interface CdbDrink {
  idDrink: string;
  strDrink: string;
  strDrinkThumb?: string;
  strAlcoholic?: string;
  [k: string]: string | undefined;
}

/** TheCocktailDB ingredient names -> the bar's ingredients (cat:… = any bottle of that kind). */
const CDB_MAP: Record<string, string> = {
  vodka: "cat:vodka", gin: "cat:gin", tequila: "cat:tequila",
  rum: "cat:rhum", "light rum": "cat:rhum", "white rum": "cat:rhum", "dark rum": "cat:rhum", "gold rum": "cat:rhum", "spiced rum": "cat:rhum",
  whiskey: "cat:whisky", whisky: "cat:whisky", scotch: "cat:whisky", bourbon: "cat:whisky", "blended whiskey": "cat:whisky", "rye whiskey": "cat:whisky", "irish whiskey": "cat:whisky",
  lemon: "citron", "lemon juice": "citron", "lemon peel": "citron", "juice of lemon": "citron",
  lime: "citron_vert", "lime juice": "citron_vert", "lime peel": "citron_vert",
  "sugar syrup": "sirop_sucre", "simple syrup": "sirop_sucre", sugar: "sirop_sucre", "powdered sugar": "sirop_sucre", "demerara sugar": "sirop_sucre", "brown sugar": "sirop_sucre",
  honey: "miel", "honey syrup": "miel",
  mint: "menthe", basil: "basilic", "ginger beer": "ginger_beer",
  "soda water": "eau_gazeuse", "carbonated water": "eau_gazeuse", "club soda": "eau_gazeuse",
  "angostura bitters": "angostura", bitters: "angostura",
  "triple sec": "cointreau", cointreau: "cointreau", "orange liqueur": "cointreau",
  campari: "campari", "sweet vermouth": "martini_rosso", "red vermouth": "martini_rosso", vermouth: "martini_rosso",
  amaretto: "liq_amande", kahlua: "liq_cafe", "coffee liqueur": "liq_cafe", espresso: "espresso", coffee: "espresso",
  "passion fruit syrup": "sirop_passion", "passion fruit juice": "sirop_passion", passoa: "liq_passion",
  "strawberry liqueur": "liq_fraise", "strawberry schnapps": "liq_fraise", "creme de cacao": "liq_chocolat", "chocolate liqueur": "liq_chocolat",
};
const CDB_SKIP = ["ice", "water", "salt", "crushed ice"];

export function ideaIngredients(d: CdbDrink) {
  const out: string[] = [];
  for (let i = 1; i <= 15; i++) {
    const v = (d["strIngredient" + i] || "").trim();
    if (v) out.push(v);
  }
  return out;
}

export function matchIdea(d: CdbDrink, ings: Ingredient[]) {
  const ids: string[] = [];
  const missing: string[] = [];
  const have = (r: string) =>
    r.startsWith("cat:") ? ings.some((i) => i.base === r.slice(4) && i.dispo) : !!ings.find((i) => i.id === r)?.dispo;
  ideaIngredients(d).forEach((name) => {
    const k = name.toLowerCase();
    if (CDB_SKIP.includes(k)) return;
    let r = CDB_MAP[k];
    if (!r) r = ings.find((x) => (x.nom_en || "").toLowerCase() === k)?.id || "";
    if (r && !ids.includes(r)) ids.push(r);
    if (!r || !have(r)) missing.push(name);
  });
  const base = ids.find((r) => r.startsWith("cat:"));
  const cat = (d.strAlcoholic || "").toLowerCase().startsWith("non") ? "sansalcool" : base ? base.slice(4) : "autres";
  return { ids, missing, cat };
}

let cache: CdbDrink[] | null = null;
let pending: Promise<CdbDrink[]> | null = null;

export function loadIdeas(): Promise<CdbDrink[]> {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = (async () => {
      const letters = "abcdefghijklmnopqrstuvwxyz0123456789".split("");
      const all: CdbDrink[] = [];
      for (let i = 0; i < letters.length; i += 6) {
        const res = await Promise.all(
          letters.slice(i, i + 6).map((l) =>
            fetch(CDB + l).then((r) => (r.ok ? r.json() : { drinks: null })).catch(() => ({ drinks: null })),
          ),
        );
        res.forEach((j: { drinks: CdbDrink[] | null }) => (j.drinks || []).forEach((d) => all.push(d)));
      }
      if (!all.length) throw new Error("TheCocktailDB ne répond pas");
      cache = all;
      return all;
    })().finally(() => {
      pending = null;
    });
  }
  return pending;
}

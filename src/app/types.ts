import type { CocktailGarnish, CocktailVessel } from "@/components/ui/cocktail-pour";

export type Lang = "fr" | "he" | "en";
export type Group = "alcool" | "liqueur" | "sirop" | "frais" | "bitters";

export interface Ingredient {
  id: string;
  groupe: Group;
  base: string;
  nom_fr: string;
  nom_he: string;
  nom_en: string;
  dispo: boolean;
}

export interface Cocktail {
  id: string;
  nom: string;
  categorie: string;
  style_fr: string;
  style_he: string;
  style_en: string;
  phrase_fr: string;
  phrase_he: string;
  phrase_en: string;
  ingredients: string[];
  photo: string;
  ordre: number;
  verre?: CocktailVessel;
  glace?: boolean;
  garniture?: CocktailGarnish;
  mousse?: number;
  /** The cocktail's colour in the glass, "#rrggbb" (one liquid, one colour). */
  couleur?: string;
  /** 0 = clear, 1 = fully opaque. */
  opacite?: number;
}

export interface Category {
  id: string;
  nom_fr: string;
  nom_he: string;
  nom_en: string;
  ordre: number;
  photo: string;
}

export interface Db {
  about: { photo: string };
  categories: Category[];
  ingredients: Ingredient[];
  cocktails: Cocktail[];
}

export interface GuestMessage {
  id: string;
  nom: string;
  message: string;
  date: string;
}

export const GROUPS: [Group, string][] = [
  ["alcool", "Alcools de base"],
  ["liqueur", "Liqueurs et apéritifs"],
  ["sirop", "Sirops"],
  ["frais", "Frais et softs"],
  ["bitters", "Bitters"],
];
export const NOT_BASE = ["autres", "sansalcool"];

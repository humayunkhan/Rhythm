export const FACETS = ["fresh", "citrus", "green", "aquatic", "fruity", "floral", "sweet", "spicy", "woody", "amber", "musky", "smoky", "earthy", "powdery"] as const;
export type Facet = (typeof FACETS)[number];
export type FacetVector = Record<Facet, number>;

export const FAMILIES = ["citrus", "aromatic", "green", "aquatic", "fruity", "floral", "white-floral", "spicy", "gourmand", "woody", "amber", "animalic"] as const;
export type Family = (typeof FAMILIES)[number];

export type Position = "top" | "heart" | "base";

export interface IfraInfo {
  /** Max % in finished fine fragrance (IFRA category 4). null = no limit modelled. */
  cat4: number | null;
  status: "restricted" | "specification" | "not-modelled";
  note?: string;
}

export interface Note {
  id: string;
  name: string;
  family: Family;
  position: Position;
  /** All 1-10. */
  sillage: number;
  projection: number;
  longevity: number;
  strength: number;
  /** Typical use as % of the fragrance concentrate. */
  dose: [number, number];
  ifra: IfraInfo;
  facets: FacetVector;
  pairs: string[];
  description: string;
}

export interface Accord {
  id: string;
  name: string;
  family: Family;
  description: string;
  character: string[];
  /** note id -> parts */
  parts: Record<string, number>;
  foundIn: string[];
  products: string[];
}

export interface Perfume {
  name: string;
  house: string;
  year: number;
  style: string;
  top: string[];
  heart: string[];
  base: string[];
}

export interface FormulaItem {
  noteId: string;
  /** Parts of the concentrate. Normalised to 100 by the engine. */
  parts: number;
}

export type ConcentrationId = "parfum" | "edp" | "edt" | "edc" | "mist" | "oil" | "solid";
export type ProductId = "fine" | "lip" | "body" | "rinse" | "candle";
export type Strength = "mild" | "moderate" | "bold";
export type Mood = "gentle" | "refreshing" | "romantic" | "sensual" | "mysterious" | "uplifting" | "cozy" | "elegant";

export interface Brief {
  seeds: string[];
  strength: Strength;
  mood: Mood;
  season?: "any" | "spring" | "summer" | "autumn" | "winter";
  occasion?: "any" | "daily" | "work" | "evening" | "special";
  expression?: "any" | "feminine" | "masculine" | "shared";
  avoid?: string[];
  /** Notes every composition must use, alongside the seeds. */
  require?: string[];
  /** note id -> user affinity from -1 to 1, learned from feedback. */
  taste?: Record<string, number>;
  /** Target facets the user steered towards, -1 to 1. */
  steer?: Partial<FacetVector>;
  /** 0-1: how far the engine may wander from known pairings. */
  adventure?: number;
  /** Notes the previous generation used; new dreams lean away from them. */
  recent?: string[];
}

export interface Issue {
  severity: "info" | "warn" | "block";
  code: string;
  message: string;
  noteId?: string;
}

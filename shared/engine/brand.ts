import type { Facet, FacetVector, Mood } from "../types";
import { dominantFacets } from "./generate";
import { hashString, mulberry32 } from "./rng";

export const BOTTLES = [
  { id: "column", name: "Column", blurb: "Tall, architectural, quietly modern." },
  { id: "flacon", name: "Flacon", blurb: "Curved shoulders and a classic round cap." },
  { id: "apothecary", name: "Apothecary", blurb: "Square glass with a ground stopper." },
  { id: "orb", name: "Orb", blurb: "A sculptural sphere that catches the light." },
  { id: "facet", name: "Facet", blurb: "Gem-cut geometry for maximum drama." },
  { id: "travel", name: "Atomiser", blurb: "A slim metal spray for the pocket." },
] as const;
export type BottleId = (typeof BOTTLES)[number]["id"];

export const PACKAGING = [
  { id: "matte", name: "Soft-touch matte", blurb: "Velvety card with tone-on-tone foil." },
  { id: "foil", name: "Gilded luxe", blurb: "Deep colour with a bold metallic band." },
  { id: "kraft", name: "Eco kraft", blurb: "Recycled card with a letterpress stamp." },
  { id: "arch", name: "Art deco", blurb: "Stepped arches and fine metallic linework." },
] as const;
export type PackagingId = (typeof PACKAGING)[number]["id"];

export interface Branding {
  name: string;
  tagline: string;
  story: string;
  bottle: BottleId;
  packaging: PackagingId;
  glass: string;
  accent: string;
  label: string;
}

export const DEFAULT_BRANDING: Branding = { name: "Untitled Cadence", tagline: "", story: "", bottle: "column", packaging: "matte", glass: "#d8a657", accent: "#f4e3bf", label: "#14101c" };

const FACET_COLOR: Record<Facet, string> = {
  fresh: "#a9e4dc", citrus: "#f4d35e", green: "#8fbf6a", aquatic: "#6db7d9", fruity: "#ec7f7b", floral: "#eda6c3",
  sweet: "#e8b77a", spicy: "#d4693c", woody: "#9a6b43", amber: "#d48a2e", musky: "#c7b4ae", smoky: "#6f6673", earthy: "#6c6a3e", powdery: "#d9c7e8",
};
export const facetColor = (f: Facet) => FACET_COLOR[f];

function hexToRgb(h: string) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
export function mixColors(colors: [string, number][]): string {
  const total = colors.reduce((s, [, w]) => s + w, 0) || 1;
  const c = [0, 0, 0];
  for (const [hex, w] of colors) hexToRgb(hex).forEach((v, i) => { c[i] += (v * w) / total; });
  return `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}
export function scentColor(f: FacetVector): string {
  return mixColors(dominantFacets(f, 3).map((k, i) => [FACET_COLOR[k], f[k] * (3 - i)] as [string, number]));
}

const FIRST: Record<string, string[]> = {
  fresh: ["Glass", "Alba", "Clear"], citrus: ["Solaire", "Zest", "Citra"], green: ["Verdant", "Fern", "Sève"], aquatic: ["Tide", "Marée", "Azure"],
  fruity: ["Orchard", "Nectar", "Velvet"], floral: ["Petal", "Fleur", "Bloom"], sweet: ["Sucre", "Golden", "Honeyed"], spicy: ["Ember", "Saffra", "Spice"],
  woody: ["Timber", "Cèdre", "Grove"], amber: ["Ambre", "Sable", "Dusk"], musky: ["Skin", "Soie", "Bare"], smoky: ["Smoke", "Noir", "Fumée"],
  earthy: ["Terra", "Moss", "Humus"], powdery: ["Poudre", "Iris", "Hush"],
};
const SECOND = ["Cadence", "Rhapsody", "Nocturne", "Refrain", "Étude", "Sonata", "Tempo", "Reverie", "Canon", "Coda"];

const TAGLINES: Record<Mood, string[]> = {
  gentle: ["A whisper you can wear.", "Softness, composed."],
  refreshing: ["First light, bottled.", "Clarity on skin."],
  romantic: ["A love letter in petals.", "Written for two."],
  sensual: ["Closer than skin.", "Slow-burning warmth."],
  mysterious: ["What the night keeps.", "Never fully revealed."],
  uplifting: ["Bottled sunrise.", "Joy, in a high register."],
  cozy: ["The warmth of coming home.", "Wrapped in golden hours."],
  elegant: ["Quiet, unmistakable poise.", "Effortless composure."],
};

/** Offline brand suggestions derived from the scent. The optional AI layer can refine these. */
export function suggestBranding(facets: FacetVector, mood: Mood, seedText: string, nonce = 0): Branding[] {
  const rng = mulberry32(hashString(seedText) + nonce * 131);
  const top = dominantFacets(facets, 2);
  const glass = scentColor(facets);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length)];
  const bottleBy: Partial<Record<Mood, BottleId[]>> = {
    refreshing: ["column", "apothecary"], romantic: ["flacon", "orb"], mysterious: ["facet", "apothecary"], elegant: ["column", "flacon"],
    gentle: ["orb", "flacon"], sensual: ["orb", "facet"], cozy: ["apothecary", "orb"], uplifting: ["orb", "column"],
  };
  const used = new Set<string>();
  return [0, 1, 2].map((i) => {
    let name = "";
    do {
      name = `${pick(FIRST[top[i % 2]] ?? ["Pure"])} ${pick(SECOND)}`;
    } while (used.has(name));
    used.add(name);
    return {
      name,
      tagline: pick(TAGLINES[mood]),
      story: `${name} takes its character from ${top.join(" and ")} facets, told with a ${mood} voice from first spray to final trace.`,
      bottle: pick(bottleBy[mood] ?? ["column"]),
      packaging: pick(PACKAGING).id,
      glass,
      accent: i === 1 ? "#e9c46a" : i === 2 ? "#e6e1ea" : "#f4e3bf",
      label: "#14101c",
    };
  });
}

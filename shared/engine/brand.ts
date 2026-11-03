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
  { id: "obelisk", name: "Obelisk", blurb: "A tapering monolith with a heavy base." },
  { id: "bell", name: "Bell", blurb: "A domed silhouette with a wide, steady skirt." },
  { id: "tablet", name: "Tablet", blurb: "A flat, wide slab like a polished stone tablet." },
  { id: "teardrop", name: "Teardrop", blurb: "A single falling drop of scent." },
  { id: "hexagon", name: "Hexagon", blurb: "Honeycomb geometry, crisp and graphic." },
  { id: "amphora", name: "Amphora", blurb: "An ancient urn with a gently swelling belly." },
  { id: "cube", name: "Cube", blurb: "Thick-walled, weighty, unapologetically bold." },
  { id: "pebble", name: "Pebble", blurb: "A soft, river-smoothed organic form." },
] as const;
export type BottleId = (typeof BOTTLES)[number]["id"];

export const CAPS = [
  { id: "classic", name: "Classic" },
  { id: "sphere", name: "Sphere" },
  { id: "cube", name: "Cube" },
  { id: "tower", name: "Tower" },
  { id: "gem", name: "Gem" },
  { id: "disc", name: "Disc" },
  { id: "stone", name: "Stone" },
  { id: "bulb", name: "Bulb atomiser" },
] as const;
export type CapId = (typeof CAPS)[number]["id"];

export const FINISHES = [
  { id: "clear", name: "Crystal clear" },
  { id: "frosted", name: "Frosted" },
  { id: "lacquered", name: "Lacquered" },
  { id: "smoked", name: "Smoked" },
  { id: "iridescent", name: "Iridescent" },
  { id: "ombre", name: "Ombré" },
] as const;
export type FinishId = (typeof FINISHES)[number]["id"];

export const LABEL_STYLES = [
  { id: "plate", name: "Plate" },
  { id: "band", name: "Band" },
  { id: "seal", name: "Seal" },
  { id: "engraved", name: "Engraved" },
] as const;
export type LabelStyleId = (typeof LABEL_STYLES)[number]["id"];

export const PACKAGING = [
  { id: "matte", name: "Soft-touch matte", blurb: "Velvety card with tone-on-tone foil." },
  { id: "foil", name: "Gilded luxe", blurb: "Deep colour with a bold metallic band." },
  { id: "kraft", name: "Eco kraft", blurb: "Recycled card with a letterpress stamp." },
  { id: "arch", name: "Art deco", blurb: "Stepped arches and fine metallic linework." },
  { id: "marble", name: "Marble", blurb: "Veined stone print with a polished feel." },
  { id: "botanical", name: "Botanical", blurb: "Line-drawn leaves and stems wrap the box." },
  { id: "minimal", name: "Gallery white", blurb: "Bright white card, tiny type, lots of air." },
  { id: "velvet", name: "Velvet case", blurb: "A plush jewel-box with an embossed monogram." },
  { id: "geometric", name: "Bauhaus", blurb: "Bold circles and blocks in the scent's colours." },
  { id: "window", name: "Window box", blurb: "An arched cut-out that reveals the bottle." },
  { id: "gradient", name: "Sunset gradient", blurb: "A soft colour wash from liquid to accent." },
  { id: "ribbon", name: "Satin ribbon", blurb: "Wrapped in a crossed satin ribbon and bow." },
  { id: "celestial", name: "Celestial", blurb: "A night sky of foil stars and a crescent moon." },
  { id: "waves", name: "Wave print", blurb: "Overlapping Japanese wave arcs in fine foil." },
  { id: "terrazzo", name: "Terrazzo", blurb: "Speckled stone chips in the scent's colours." },
  { id: "pinstripe", name: "Pinstripe", blurb: "Tailored vertical stripes with a crest." },
  { id: "leather", name: "Stitched leather", blurb: "Grained hide with saddle stitching." },
  { id: "iridescent", name: "Iridescent", blurb: "A holographic shimmer that shifts with the light." },
  { id: "pleated", name: "Pleated paper", blurb: "Origami folds that catch soft shadows." },
] as const;
export type PackagingId = (typeof PACKAGING)[number]["id"];

/** Curated colour stories for liquid, accent (cap, label, foil) and lettering. */
export const PALETTES = [
  { id: "champagne", name: "Champagne", glass: "#d8a657", accent: "#f4e3bf", label: "#14101c" },
  { id: "noir", name: "Noir & gold", glass: "#2a2230", accent: "#e9c46a", label: "#e9c46a" },
  { id: "rose-quartz", name: "Rose quartz", glass: "#f2b8c6", accent: "#c98b6b", label: "#4a2533" },
  { id: "ocean", name: "Deep ocean", glass: "#3b8fb5", accent: "#e6e1ea", label: "#0d2533" },
  { id: "emerald", name: "Emerald", glass: "#2f8f6a", accent: "#e9c46a", label: "#0f2a1f" },
  { id: "ivory", name: "Ivory & silver", glass: "#f3ead8", accent: "#c9ccd3", label: "#2b2b2b" },
  { id: "amethyst", name: "Amethyst", glass: "#8b5fbf", accent: "#e6e1ea", label: "#1f1230" },
  { id: "ember", name: "Ember", glass: "#c4512c", accent: "#2a1e18", label: "#f4e3bf" },
  { id: "sage", name: "Sage", glass: "#a3b18a", accent: "#f3ead8", label: "#2f3a26" },
  { id: "midnight", name: "Midnight", glass: "#1d2a5c", accent: "#c9ccd3", label: "#e6e1ea" },
  { id: "citrine", name: "Citrine", glass: "#f4d35e", accent: "#ffffff", label: "#3a2e05" },
  { id: "blush", name: "Blush & copper", glass: "#f6d5c8", accent: "#b87333", label: "#3b1f14" },
  { id: "oxblood", name: "Oxblood", glass: "#6b1d2a", accent: "#d8a657", label: "#f4e3bf" },
  { id: "glacier", name: "Glacier", glass: "#cfe8ef", accent: "#9fb7c4", label: "#16323d" },
] as const;

/** Swatches for picking each colour on its own. */
export const SWATCHES = {
  glass: ["#d8a657", "#f4d35e", "#f2b8c6", "#ec7f7b", "#c4512c", "#6b1d2a", "#8b5fbf", "#3b8fb5", "#cfe8ef", "#2f8f6a", "#a3b18a", "#f3ead8", "#2a2230", "#1d2a5c"],
  accent: ["#f4e3bf", "#e9c46a", "#d8a657", "#c98b6b", "#b87333", "#c9ccd3", "#e6e1ea", "#ffffff", "#2a2230", "#14101c", "#6b1d2a", "#2f8f6a"],
  label: ["#14101c", "#2b2b2b", "#3b1f14", "#0d2533", "#0f2a1f", "#1f1230", "#ffffff", "#f4e3bf", "#e9c46a", "#e6e1ea"],
};

export interface Branding {
  name: string;
  tagline: string;
  story: string;
  bottle: BottleId;
  packaging: PackagingId;
  cap: CapId;
  finish: FinishId;
  labelStyle: LabelStyleId;
  glass: string;
  accent: string;
  label: string;
}

export const DEFAULT_BRANDING: Branding = { name: "Untitled Cadence", tagline: "", story: "", bottle: "column", packaging: "matte", cap: "classic", finish: "clear", labelStyle: "plate", glass: "#d8a657", accent: "#f4e3bf", label: "#14101c" };

export const isHex = (s: unknown): s is string => typeof s === "string" && /^#[0-9a-f]{6}$/i.test(s);

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

const luminance = (hex: string) => {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** Dark ink on light grounds, light ink on dark ones. */
export const inkFor = (ground: string) => (luminance(ground) > 0.5 ? "#14101c" : "#f4eee6");

const DIRECTIONS: { name: string; bottles: BottleId[]; caps: CapId[]; finishes: FinishId[]; labels: LabelStyleId[]; packs: PackagingId[]; metals: string[] }[] = [
  { name: "Heritage", bottles: ["flacon", "apothecary", "amphora", "bell", "facet"], caps: ["classic", "gem", "sphere", "bulb"], finishes: ["clear", "ombre"], labels: ["plate", "seal"], packs: ["foil", "arch", "velvet", "marble", "ribbon", "leather", "pinstripe", "celestial"], metals: ["#e9c46a", "#d8a657", "#f4e3bf"] },
  { name: "Modern", bottles: ["column", "obelisk", "cube", "tablet", "hexagon", "travel"], caps: ["cube", "tower", "disc"], finishes: ["frosted", "lacquered", "smoked", "clear"], labels: ["band", "engraved"], packs: ["minimal", "geometric", "matte", "gradient", "terrazzo", "iridescent"], metals: ["#c9ccd3", "#e6e1ea", "#14101c", "#ffffff"] },
  { name: "Sculptural", bottles: ["pebble", "teardrop", "orb", "bell", "amphora"], caps: ["stone", "sphere", "disc"], finishes: ["frosted", "iridescent", "ombre"], labels: ["engraved", "seal"], packs: ["kraft", "botanical", "window", "marble", "pleated", "waves"], metals: ["#c98b6b", "#b87333", "#f3ead8"] },
];
const MOOD_LEAN: Partial<Record<Mood, number>> = { elegant: 0, romantic: 0, mysterious: 0, refreshing: 1, uplifting: 1, gentle: 2, cozy: 2, sensual: 2 };

/** Offline brand suggestions derived from the scent: three distinct design directions. The optional AI layer can refine these. */
export function suggestBranding(facets: FacetVector, mood: Mood, seedText: string, nonce = 0): (Branding & { direction: string })[] {
  const rng = mulberry32(hashString(seedText) + nonce * 131);
  const top = dominantFacets(facets, 2);
  const scent = scentColor(facets);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length)];
  const lean = MOOD_LEAN[mood] ?? 0;
  const used = new Set<string>();
  return [0, 1, 2].map((i) => {
    const dir = DIRECTIONS[(lean + i) % DIRECTIONS.length];
    let name = "";
    for (let tries = 0; tries < 20 && (!name || used.has(name)); tries++) name = `${pick(FIRST[top[i % 2]] ?? ["Pure"])} ${pick(SECOND)}`;
    used.add(name);
    // Each direction tints the liquid differently: true to the scent, deepened, or softened.
    const glass = i === 0 ? scent : i === 1 ? mixColors([[scent, 3], ["#1a1424", 1]]) : mixColors([[scent, 2], ["#fff6e6", 1]]);
    const accent = pick(dir.metals);
    const labelStyle = pick(dir.labels);
    const finish = pick(dir.finishes);
    const ground = labelStyle === "engraved" ? (finish === "lacquered" || finish === "smoked" ? glass : mixColors([[glass, 1], ["#ffffff", 1]])) : accent;
    return {
      direction: dir.name,
      name,
      tagline: pick(TAGLINES[mood]),
      story: `${name} takes its character from ${top.join(" and ")} facets, told with a ${mood} voice from first spray to final trace.`,
      bottle: pick(dir.bottles),
      cap: pick(dir.caps),
      finish,
      labelStyle,
      packaging: pick(dir.packs),
      glass,
      accent,
      label: inkFor(ground),
    };
  });
}

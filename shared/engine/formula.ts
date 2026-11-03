import { note, NOTE_BY_ID } from "../data/notes";
import model from "../generated/model.json";
import { compound, fmtDilution, type Compounding, type DilutionMap } from "./dilution";
import { FACETS, type ConcentrationId, type FacetVector, type FormulaItem, type Issue, type Note, type Position, type ProductId } from "../types";

export interface Concentration {
  id: ConcentrationId;
  name: string;
  /** % concentrate in the finished product. */
  pct: number;
  carrier: "alcohol" | "oil" | "wax";
  /** Share of the carrier that is water, when alcohol based. */
  water: number;
  blurb: string;
}

export const CONCENTRATIONS: Concentration[] = [
  { id: "parfum", name: "Extrait de Parfum", pct: 25, carrier: "alcohol", water: 0, blurb: "Richest and closest to skin, lasting all day." },
  { id: "edp", name: "Eau de Parfum", pct: 18, carrier: "alcohol", water: 0.05, blurb: "The modern standard: full-bodied and long-lasting." },
  { id: "edt", name: "Eau de Toilette", pct: 10, carrier: "alcohol", water: 0.1, blurb: "Brighter and lighter, ideal for daytime." },
  { id: "edc", name: "Eau de Cologne", pct: 4, carrier: "alcohol", water: 0.2, blurb: "A brisk, refreshing splash." },
  { id: "mist", name: "Body Mist", pct: 2, carrier: "alcohol", water: 0.35, blurb: "Barely-there veil to spray generously." },
  { id: "oil", name: "Perfume Oil", pct: 20, carrier: "oil", water: 0, blurb: "Intimate, alcohol-free roll-on." },
  { id: "solid", name: "Solid Perfume", pct: 15, carrier: "wax", water: 0, blurb: "Pocketable balm in a wax base." },
];
export const concentration = (id: ConcentrationId) => CONCENTRATIONS.find((c) => c.id === id) ?? CONCENTRATIONS[1];

export const PRODUCTS: { id: ProductId; name: string; ifraCat: string; factor: number; phototoxicApplies: boolean }[] = [
  { id: "fine", name: "Fine fragrance", ifraCat: "Category 4", factor: 1, phototoxicApplies: true },
  { id: "lip", name: "Lip products", ifraCat: "Category 1", factor: 0.1, phototoxicApplies: true },
  { id: "body", name: "Body lotion", ifraCat: "Category 5A", factor: 0.5, phototoxicApplies: true },
  { id: "rinse", name: "Soap and shower gel", ifraCat: "Category 9", factor: 2, phototoxicApplies: false },
  { id: "candle", name: "Candles and home", ifraCat: "Category 12", factor: 10, phototoxicApplies: false },
];

/** Indicative limit in the finished product. Only the category 4 value is sourced; other categories are conservative Rhythm estimates. */
export function limitFor(n: Note, product: ProductId = "fine"): number | null {
  if (n.ifra.cat4 == null) return null;
  const p = PRODUCTS.find((x) => x.id === product) ?? PRODUCTS[0];
  if (!p.phototoxicApplies && n.ifra.note?.includes("Phototoxic")) return null;
  return Math.round(n.ifra.cat4 * p.factor * 1000) / 1000;
}

const emb = new Map(model.ids.map((id, i) => [id, model.embedding.slice(i * model.dims, (i + 1) * model.dims)]));
const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);
const facetArr = (n: Note) => FACETS.map((f) => n.facets[f]);
const cosine = (a: number[], b: number[]) => dot(a, b) / ((Math.hypot(...a) * Math.hypot(...b)) || 1);

/** How well two notes work together, 0-1. Learned embedding, facet similarity and curated pairings. */
export function affinity(a: string, b: string): number {
  if (a === b) return 1;
  const na = NOTE_BY_ID.get(a);
  const nb = NOTE_BY_ID.get(b);
  if (!na || !nb) return 0.4;
  const ea = emb.get(a);
  const eb = emb.get(b);
  const learned = ea && eb ? (dot(ea, eb) + 1) / 2 : 0.5;
  const similar = cosine(facetArr(na), facetArr(nb));
  const curated = na.pairs.includes(b) || nb.pairs.includes(a) ? 1 : 0;
  return Math.min(1, 0.6 * learned + 0.15 * similar + 0.25 * curated);
}

export function normalise(items: FormulaItem[]): FormulaItem[] {
  const total = items.reduce((s, i) => s + Math.max(0, i.parts), 0) || 1;
  return items.map((i) => ({ ...i, parts: (Math.max(0, i.parts) / total) * 100 }));
}

export interface Analysis {
  pyramid: Record<Position, number>;
  facets: FacetVector;
  /** 0-100 */
  sillage: number;
  projection: number;
  longevity: number;
  strength: number;
  harmony: number;
  structure: number;
  score: number;
  ifra: { noteId: string; finishedPct: number; limit: number | null; ratio: number | null; status: Note["ifra"]["status"] }[];
  issues: Issue[];
  /** How the formula is compounded from the user's stock dilutions; set when dilutions were given. */
  dose?: Compounding;
}

export const PYRAMID_TARGET: Record<Position, [number, number]> = { top: [12, 35], heart: [25, 55], base: [20, 55] };

/**
 * Scores a formula. With the user's stock dilutions, performance and IFRA levels follow the aromatic
 * strength those stocks can actually reach, and a formula that can't reach its type loses score.
 */
export function analyse(items: FormulaItem[], concId: ConcentrationId = "edp", product: ProductId = "fine", dil?: DilutionMap): Analysis {
  const conc = concentration(concId);
  const dose = dil ? compound(items, concId, dil) : undefined;
  const pct = dose?.effectivePct ?? conc.pct;
  const ns = normalise(items).filter((i) => NOTE_BY_ID.has(i.noteId));
  const pyramid: Record<Position, number> = { top: 0, heart: 0, base: 0 };
  const facets = Object.fromEntries(FACETS.map((f) => [f, 0])) as FacetVector;
  const issues: Issue[] = [];
  let sil = 0, pro = 0, lon = 0, str = 0;
  for (const i of ns) {
    const n = note(i.noteId);
    const w = i.parts / 100;
    pyramid[n.position] += i.parts;
    for (const f of FACETS) facets[f] += n.facets[f] * w * Math.sqrt(n.strength / 5);
    sil += n.sillage * w;
    pro += n.projection * w;
    lon += n.longevity * w;
    str += n.strength * w;
  }
  const concBoost = Math.sqrt(pct / 18);
  // Slow solvents from the stocks hold the scent closer to skin and a little longer.
  const fix = dose?.fixative ?? 0;
  const clamp100 = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

  let pairTotal = 0, pairWeight = 0;
  for (let a = 0; a < ns.length; a++) for (let b = a + 1; b < ns.length; b++) {
    const w = Math.sqrt(ns[a].parts * ns[b].parts);
    pairTotal += affinity(ns[a].noteId, ns[b].noteId) * w;
    pairWeight += w;
  }
  // Calibrated on the corpus: random 11-note blends average 0.39 and the best real pyramids reach 0.59.
  const harmony = clamp100(pairWeight ? ((pairTotal / pairWeight - 0.39) / 0.17) * 100 : 0);

  let structure = 100;
  for (const pos of ["top", "heart", "base"] as Position[]) {
    const [lo, hi] = PYRAMID_TARGET[pos];
    const v = pyramid[pos];
    const off = v < lo ? lo - v : v > hi ? v - hi : 0;
    structure -= off * 2.2;
    if (off > 0) issues.push({ severity: off > 8 ? "warn" : "info", code: `pyramid-${pos}`, message: `${pos[0].toUpperCase()}${pos.slice(1)} notes are ${v.toFixed(0)}% of the concentrate; aim for ${lo} to ${hi}%.` });
  }

  const ifra = ns.map((i) => {
    const n = note(i.noteId);
    const finishedPct = (i.parts / 100) * pct;
    const limit = limitFor(n, product);
    const ratio = limit ? finishedPct / limit : null;
    if (ratio != null && ratio > 1) issues.push({ severity: "block", code: "ifra", noteId: n.id, message: `${n.name} is ${finishedPct.toFixed(2)}% of the finished product, above the indicative ${limit}% limit.` });
    else if (ratio != null && ratio > 0.8) issues.push({ severity: "info", code: "ifra-near", noteId: n.id, message: `${n.name} is close to its indicative limit.` });
    if (i.parts > n.dose[1] * 1.5) issues.push({ severity: "warn", code: "overdose", noteId: n.id, message: `${n.name} at ${i.parts.toFixed(1)}% is far above its typical ${n.dose[1]}% and may dominate.` });
    return { noteId: n.id, finishedPct, limit, ratio, status: n.ifra.status };
  });
  if (ns.length < 5) issues.push({ severity: "info", code: "sparse", message: "Fewer than five notes can smell thin; consider a supporting material." });

  structure = clamp100(structure);
  for (const x of dose?.issues ?? []) issues.push(x);
  const blocked = issues.some((x) => x.severity === "block");
  // A formula the stocks can't make as specified is scored down in proportion to the shortfall.
  const shortfall = dose ? Math.min(15, 15 * (1 - dose.effectivePct / dose.targetPct)) : 0;
  const score = clamp100(0.5 * harmony + 0.5 * structure - (blocked ? 25 : 0) - shortfall);
  return {
    pyramid, facets,
    sillage: clamp100((sil / 10) * 100 * concBoost * (1 - 0.6 * fix)),
    projection: clamp100((pro / 10) * 100 * concBoost * (1 - 0.6 * fix)),
    longevity: clamp100((lon / 10) * 100 * concBoost * (1 + 0.4 * fix)),
    strength: clamp100((str / 10) * 100 * concBoost),
    harmony, structure, score, ifra, issues, dose,
  };
}

export interface BatchRow { label: string; noteId?: string; pct: number; grams: number; ml: number; drops?: number; stock?: string }

/**
 * A make-up sheet. With stock dilutions, each note is weighed as its stock and the stocks' solvent
 * takes the place of some carrier. Densities are working approximations: concentrate 0.95,
 * ethanol 0.789, carrier oil 0.92, wax 0.95.
 */
export function batchSheet(items: FormulaItem[], concId: ConcentrationId, volumeMl: number, dil?: DilutionMap): { rows: BatchRow[]; totalGrams: number } {
  const conc = concentration(concId);
  const dose = dil ? compound(items, concId, dil) : undefined;
  const stockShare = new Map(dose?.rows.map((r) => [r.noteId, r]) ?? []);
  const concentrateMl = volumeMl * ((dose ? dose.stockPct : conc.pct) / 100);
  const pureMl = volumeMl * ((dose ? dose.effectivePct : conc.pct) / 100);
  const rows: BatchRow[] = normalise(items).sort((a, b) => b.parts - a.parts).map((i) => {
    const r = stockShare.get(i.noteId);
    const ml = (i.parts / 100) * pureMl / (r ? r.dilution.pct / 100 : 1);
    const grams = ml * 0.95;
    const stock = r && r.dilution.pct < 100 ? fmtDilution(r.dilution) : undefined;
    return { label: note(i.noteId).name + (stock ? ` (${stock})` : ""), noteId: i.noteId, pct: i.parts, grams, ml, drops: Math.round(ml * 25), stock };
  });
  const carrierMl = Math.max(0, volumeMl - concentrateMl);
  const round = (r: BatchRow) => r;
  if (conc.carrier === "alcohol") {
    const waterMl = carrierMl * conc.water;
    const ethanolMl = carrierMl - waterMl;
    rows.push(round({ label: "Perfumer's alcohol (ethanol)", pct: 0, grams: ethanolMl * 0.789, ml: ethanolMl }));
    if (waterMl > 0) rows.push(round({ label: "Distilled water", pct: 0, grams: waterMl, ml: waterMl }));
  } else if (conc.carrier === "oil") {
    rows.push(round({ label: "Fractionated coconut or jojoba oil", pct: 0, grams: carrierMl * 0.92, ml: carrierMl }));
  } else {
    rows.push(round({ label: "Beeswax and jojoba base", pct: 0, grams: carrierMl * 0.95, ml: carrierMl }));
  }
  return { rows, totalGrams: rows.reduce((s, r) => s + r.grams, 0) };
}

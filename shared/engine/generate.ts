import { note, NOTE_BY_ID, NOTES } from "../data/notes";
import { FACETS, type Brief, type ConcentrationId, type Facet, type FacetVector, type FormulaItem, type Mood, type Note, type Position, type ProductId, type Strength } from "../types";
import { affinity, analyse, concentration, limitFor, normalise, PYRAMID_TARGET, type Analysis } from "./formula";
import { hashString, mulberry32 } from "./rng";
import { simulate } from "./simulate";

type Weights = Partial<Record<Facet, number>>;

export const MOOD_FACETS: Record<Mood, Weights> = {
  gentle: { powdery: 0.7, musky: 0.6, floral: 0.4, smoky: -0.8, spicy: -0.4 },
  refreshing: { fresh: 1, citrus: 0.8, green: 0.6, aquatic: 0.6, amber: -0.5, smoky: -0.5, sweet: -0.3 },
  romantic: { floral: 1, sweet: 0.3, powdery: 0.4, musky: 0.3, smoky: -0.3 },
  sensual: { musky: 0.9, amber: 0.8, sweet: 0.3, floral: 0.3, fresh: -0.3 },
  mysterious: { smoky: 1, earthy: 0.6, woody: 0.5, amber: 0.5, fresh: -0.5, fruity: -0.3 },
  uplifting: { citrus: 0.9, fruity: 0.5, fresh: 0.7, floral: 0.3, smoky: -0.6, earthy: -0.4 },
  cozy: { sweet: 0.8, amber: 0.7, powdery: 0.3, woody: 0.3, aquatic: -0.5, fresh: -0.3 },
  elegant: { powdery: 0.6, woody: 0.5, floral: 0.5, earthy: 0.2, fruity: -0.3, sweet: -0.2 },
};
const SEASON_FACETS: Record<string, Weights> = {
  spring: { floral: 0.5, green: 0.5, fresh: 0.3 },
  summer: { citrus: 0.5, aquatic: 0.5, fresh: 0.5, amber: -0.3, sweet: -0.2 },
  autumn: { woody: 0.5, spicy: 0.5, amber: 0.3 },
  winter: { amber: 0.6, sweet: 0.3, smoky: 0.3, spicy: 0.3, aquatic: -0.4 },
};
const OCCASION_FACETS: Record<string, Weights> = {
  daily: { fresh: 0.3, musky: 0.2, smoky: -0.2 },
  work: { fresh: 0.3, powdery: 0.2, smoky: -0.4, sweet: -0.2 },
  evening: { amber: 0.4, smoky: 0.3, musky: 0.3 },
  special: { floral: 0.3, amber: 0.3, powdery: 0.2 },
};
const EXPRESSION_FACETS: Record<string, Weights> = {
  feminine: { floral: 0.4, sweet: 0.2, fruity: 0.2, powdery: 0.2 },
  masculine: { woody: 0.4, spicy: 0.2, smoky: 0.2, earthy: 0.2, floral: -0.2 },
  shared: { fresh: 0.2, woody: 0.2, musky: 0.2 },
};

export const STRENGTH_PLAN: Record<Strength, { pyramid: Record<Position, number>; slots: Record<Position, number>; conc: ConcentrationId; strengthBias: number }> = {
  mild: { pyramid: { top: 30, heart: 45, base: 25 }, slots: { top: 3, heart: 3, base: 3 }, conc: "edt", strengthBias: -0.35 },
  moderate: { pyramid: { top: 25, heart: 40, base: 35 }, slots: { top: 3, heart: 4, base: 4 }, conc: "edp", strengthBias: 0 },
  bold: { pyramid: { top: 15, heart: 35, base: 50 }, slots: { top: 3, heart: 4, base: 5 }, conc: "parfum", strengthBias: 0.35 },
};

export function facetFit(n: Note, weights: Weights): number {
  let s = 0;
  for (const [k, v] of Object.entries(weights)) s += n.facets[k as Facet] * (v as number);
  return s;
}

export interface Candidate {
  id: string;
  name: string;
  items: FormulaItem[];
  concentration: ConcentrationId;
  analysis: Analysis;
  profile: string;
  rationale: string[];
}

function targetPyramid(strength: Strength, mood: Mood): Record<Position, number> {
  const p = { ...STRENGTH_PLAN[strength].pyramid };
  if (mood === "refreshing" || mood === "uplifting") { p.top += 7; p.base -= 7; }
  if (mood === "mysterious" || mood === "cozy" || mood === "sensual") { p.top -= 5; p.base += 5; }
  return p;
}

export interface BalanceGoals {
  longevity?: number;
  sillage?: number;
  freshness?: number;
  sweetness?: number;
  warmth?: number;
}

export interface BalanceOptions {
  concentration?: ConcentrationId;
  product?: ProductId;
  pyramid?: Record<Position, number>;
  goals?: BalanceGoals;
}

export interface BalanceResult {
  items: FormulaItem[];
  changes: string[];
  before: Analysis;
  after: Analysis;
}

/** Scales to the requested pyramid and goals, then enforces dose ranges and hard indicative IFRA caps. */
export function balance(input: FormulaItem[], opts: BalanceOptions = {}): BalanceResult {
  const concId = opts.concentration ?? "edp";
  const product = opts.product ?? "fine";
  const conc = concentration(concId);
  const known = input.filter((i) => NOTE_BY_ID.has(i.noteId));
  const before = analyse(known, concId, product);
  const hardCap = (id: string) => {
    const lim = limitFor(note(id), product);
    return lim == null ? 100 : ((lim * 0.95) / conc.pct) * 100;
  };
  let items = normalise(known);
  const g = opts.goals ?? {};
  items = items.map((i) => {
    const n = note(i.noteId);
    const boost = 1
      + (g.longevity ?? 0) * ((n.longevity - 5) / 10)
      + (g.sillage ?? 0) * ((n.sillage - 5) / 10)
      + (g.freshness ?? 0) * (n.facets.fresh + n.facets.citrus - n.facets.amber) * 0.5
      + (g.sweetness ?? 0) * (n.facets.sweet - 0.2) * 0.8
      + (g.warmth ?? 0) * (n.facets.amber + n.facets.spicy - n.facets.fresh) * 0.5;
    return { ...i, parts: i.parts * Math.max(0.2, boost) };
  });
  const present = (pos: Position) => items.some((i) => note(i.noteId).position === pos);
  const hasGoalLongevity = (g.longevity ?? 0) !== 0;
  const pyramid = opts.pyramid ?? (hasGoalLongevity ? undefined : (() => {
    // No explicit target: pull only what falls outside the accepted ranges.
    const a = analyse(items, concId, product).pyramid;
    const out = { ...a };
    for (const pos of ["top", "heart", "base"] as Position[]) {
      const [lo, hi] = PYRAMID_TARGET[pos];
      out[pos] = Math.min(hi - 2, Math.max(lo + 2, a[pos]));
    }
    return out;
  })());

  for (let round = 0; round < 40; round++) {
    items = normalise(items);
    if (pyramid) {
      const totals: Record<Position, number> = { top: 0, heart: 0, base: 0 };
      for (const i of items) totals[note(i.noteId).position] += i.parts;
      items = items.map((i) => {
        const pos = note(i.noteId).position;
        return present(pos) && totals[pos] > 0 ? { ...i, parts: i.parts * (1 + 0.5 * (pyramid[pos] / totals[pos] - 1)) } : i;
      });
    }
    items = items.map((i) => {
      const n = note(i.noteId);
      const [lo, hi] = n.dose;
      return { ...i, parts: Math.min(hardCap(i.noteId), Math.max(Math.min(lo, hardCap(i.noteId)), Math.min(hi * 1.25, i.parts))) };
    });
  }
  // Hard caps must survive normalisation, so excess goes only to notes with headroom.
  items = normalise(items);
  for (let round = 0; round < 25; round++) {
    let excess = 0;
    items = items.map((i) => {
      const cap = hardCap(i.noteId);
      if (i.parts > cap) { excess += i.parts - cap; return { ...i, parts: cap }; }
      return i;
    });
    if (excess < 1e-6) break;
    const open = items.filter((i) => i.parts < hardCap(i.noteId) - 1e-6);
    const room = open.reduce((s, i) => s + i.parts, 0);
    if (!room) break;
    items = items.map((i) => (i.parts < hardCap(i.noteId) - 1e-6 ? { ...i, parts: i.parts + (excess * i.parts) / room } : i));
  }
  items = items.map((i) => ({ ...i, parts: Math.round(i.parts * 100) / 100 }));
  const after = analyse(items, concId, product);
  const changes: string[] = [];
  const beforeMap = new Map(normalise(known).map((i) => [i.noteId, i.parts]));
  for (const i of items) {
    const was = beforeMap.get(i.noteId) ?? 0;
    if (Math.abs(i.parts - was) >= 0.5) changes.push(`${note(i.noteId).name}: ${was.toFixed(1)}% to ${i.parts.toFixed(1)}%`);
  }
  return { items, changes, before, after };
}

const ADJECTIVES: Record<Mood, string[]> = {
  gentle: ["Hushed", "Velvet", "Soft", "Tender", "Quiet"],
  refreshing: ["Clear", "Glass", "Morning", "Crisp", "Silver"],
  romantic: ["Rose", "Blush", "Serenade", "Moonlit", "Petal"],
  sensual: ["Bare", "Midnight", "Skin", "Slow", "Ember"],
  mysterious: ["Veiled", "Obsidian", "Shadow", "Hidden", "Noir"],
  uplifting: ["Golden", "Solar", "Bright", "Radiant", "High"],
  cozy: ["Hearth", "Amber", "Woollen", "Harbour", "Honeyed"],
  elegant: ["Atelier", "Ivory", "Salon", "Grand", "Pale"],
};
const NOUNS = ["Cadence", "Refrain", "Sonata", "Measure", "Nocturne", "Tempo", "Prelude", "Ballad", "Echo", "Etude", "Reverie", "Overture", "Interlude", "Waltz", "Aria"];

function describe(items: FormulaItem[], a: Analysis, mood: Mood): string {
  const top = (pos: Position) => {
    const ranked = items.filter((i) => note(i.noteId).position === pos).sort((x, y) => y.parts - x.parts).slice(0, 2);
    return ranked.map((i) => note(i.noteId).name.toLowerCase()).join(" and ") || "nothing";
  };
  const facets = (Object.entries(a.facets) as [Facet, number][]).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([f]) => f);
  const wear = a.longevity > 70 ? "lingers for many hours" : a.longevity > 50 ? "stays through the day" : "keeps close and fades gracefully";
  const reach = a.sillage > 65 ? "fills a room" : a.sillage > 45 ? "leaves a noticeable trail" : "stays near the skin";
  return `A ${mood} ${facets.join(", ")} composition. It opens on ${top("top")}, unfolds into ${top("heart")}, and settles on ${top("base")}. It ${reach} and ${wear}.`;
}

/** Builds distinct, IFRA-capped candidates around the user's seeds and preferences. */
export function generate(brief: Brief, count = 4, seed?: number): Candidate[] {
  const seeds = brief.seeds.filter((s) => NOTE_BY_ID.has(s));
  if (seeds.length < 2) throw new Error("Choose at least two notes");
  const avoid = new Set(brief.avoid ?? []);
  const plan = STRENGTH_PLAN[brief.strength];
  const baseSeed = seed ?? hashString(JSON.stringify(brief));
  const adventure = brief.adventure ?? 0.3;
  const weights: Weights[] = [
    MOOD_FACETS[brief.mood],
    (brief.season && SEASON_FACETS[brief.season]) || {},
    (brief.occasion && OCCASION_FACETS[brief.occasion]) || {},
    (brief.expression && EXPRESSION_FACETS[brief.expression]) || {},
    brief.steer ?? {},
  ];
  const results: Candidate[] = [];

  for (let attempt = 0; attempt < count * 8 && results.length < count; attempt++) {
    const rng = mulberry32(baseSeed + attempt * 977);
    const chosen = new Set(seeds);
    const counts: Record<Position, number> = { top: 0, heart: 0, base: 0 };
    for (const s of seeds) counts[note(s).position]++;

    for (const pos of ["base", "heart", "top"] as Position[]) {
      while (counts[pos] < plan.slots[pos]) {
        let best: Note | null = null;
        let bestScore = -Infinity;
        for (const n of NOTES) {
          if (n.position !== pos || chosen.has(n.id) || avoid.has(n.id)) continue;
          let fit = 0;
          for (const s of chosen) fit += affinity(s, n.id) * (seeds.includes(s) ? 1.5 : 0.6);
          fit /= chosen.size;
          const pref = weights.reduce((sum, w) => sum + facetFit(n, w), 0);
          const sameFamily = [...chosen].filter((c) => note(c).family === n.family).length;
          const strengthFit = plan.strengthBias * ((n.strength - 5) / 5);
          const score = fit * 7 + pref * 0.45 + strengthFit + (brief.taste?.[n.id] ?? 0) * 0.9
            - sameFamily * 0.28 + (rng() - 0.5) * (0.35 + adventure * 1.1);
          if (score > bestScore) { bestScore = score; best = n; }
        }
        if (!best) break;
        chosen.add(best.id);
        counts[pos]++;
      }
    }

    const pyramid = targetPyramid(brief.strength, brief.mood);
    const raw: FormulaItem[] = [...chosen].map((id) => {
      const n = note(id);
      const mid = (n.dose[0] + n.dose[1]) / 2;
      const emphasis = seeds.includes(id) ? 1.35 : 0.85 + rng() * 0.3;
      return { noteId: id, parts: mid * emphasis };
    });
    const { items, after } = balance(raw, { concentration: plan.conc, pyramid });
    const signature = new Set(items.map((i) => i.noteId));
    const overlaps = results.some((r) => {
      const other = new Set(r.items.map((i) => i.noteId));
      const shared = [...signature].filter((x) => other.has(x)).length;
      return shared / new Set([...signature, ...other]).size > 0.72;
    });
    if (overlaps) continue;
    const adj = ADJECTIVES[brief.mood];
    const name = `${adj[Math.floor(rng() * adj.length)]} ${NOUNS[Math.floor(rng() * NOUNS.length)]}`;
    results.push({
      id: `${baseSeed.toString(36)}-${attempt}`,
      name,
      items: items.sort((a, b) => b.parts - a.parts),
      concentration: plan.conc,
      analysis: after,
      profile: describe(items, after, brief.mood),
      rationale: [...chosen].filter((id) => !seeds.includes(id)).slice(0, 4).map((id) => {
        const partner = seeds.slice().sort((a, b) => affinity(b, id) - affinity(a, id))[0];
        return `${note(id).name} supports ${note(partner).name}.`;
      }),
    });
  }
  return results;
}

/** Records human guidance. Liked notes gain affinity, disliked notes lose it. */
export function learnFromFeedback(taste: Record<string, number>, items: FormulaItem[], direction: 1 | -1): Record<string, number> {
  const out = { ...taste };
  for (const i of normalise(items)) {
    const delta = direction * 0.25 * Math.min(1, i.parts / 15 + 0.3);
    out[i.noteId] = Math.max(-1, Math.min(1, (out[i.noteId] ?? 0) + delta));
  }
  return out;
}

export const STEERS: { id: string; label: string; steer: Weights }[] = [
  { id: "fresher", label: "Fresher", steer: { fresh: 1, citrus: 0.5, amber: -0.4 } },
  { id: "warmer", label: "Warmer", steer: { amber: 1, spicy: 0.4, fresh: -0.4 } },
  { id: "sweeter", label: "Sweeter", steer: { sweet: 1 } },
  { id: "drier", label: "Drier", steer: { sweet: -0.8, woody: 0.7 } },
  { id: "floral", label: "More floral", steer: { floral: 1 } },
  { id: "darker", label: "Darker", steer: { smoky: 0.9, earthy: 0.6, citrus: -0.3 } },
  { id: "softer", label: "Softer", steer: { powdery: 0.8, musky: 0.6, smoky: -0.6 } },
];

export function mergeSteer(a: Weights = {}, b: Weights = {}): Weights {
  const out: Weights = { ...a };
  for (const f of FACETS) if (b[f] != null) out[f] = Math.max(-1.5, Math.min(1.5, (out[f] ?? 0) + (b[f] as number)));
  return out;
}

/** Notes that would most improve the formula, with the reason shown to the user. */
export function suggestAdditions(items: FormulaItem[], limit = 5): { noteId: string; reason: string; gain: number }[] {
  const present = new Set(items.map((i) => i.noteId));
  const a = analyse(items);
  const need: Position | null = a.pyramid.top < PYRAMID_TARGET.top[0] ? "top" : a.pyramid.heart < PYRAMID_TARGET.heart[0] ? "heart" : a.pyramid.base < PYRAMID_TARGET.base[0] ? "base" : null;
  return NOTES.filter((n) => !present.has(n.id)).map((n) => {
    const fit = items.reduce((s, i) => s + affinity(i.noteId, n.id) * i.parts, 0) / (items.reduce((s, i) => s + i.parts, 0) || 1);
    const gain = fit + (need === n.position ? 0.2 : 0);
    const partner = items.slice().sort((x, y) => affinity(y.noteId, n.id) - affinity(x.noteId, n.id))[0];
    const reason = need === n.position ? `Fills your thin ${need} layer and pairs with ${partner ? note(partner.noteId).name : "the blend"}.` : `Pairs well with ${partner ? note(partner.noteId).name : "the blend"}.`;
    return { noteId: n.id, reason, gain };
  }).sort((x, y) => y.gain - x.gain).slice(0, limit);
}

export function dominantFacets(f: FacetVector, n = 3): Facet[] {
  return (Object.entries(f) as [Facet, number][]).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
}

export { simulate };

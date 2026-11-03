import { NOTE_BY_ID } from "../data/notes";
import type { ConcentrationId, FormulaItem } from "../types";
import type { Compounding } from "./dilution";
import { concentration, normalise } from "./formula";

export interface Environment {
  /** Celsius. Heat speeds evaporation. */
  temperature: number;
  skin: "dry" | "normal" | "oily";
}
export const DEFAULT_ENV: Environment = { temperature: 24, skin: "normal" };

export const TIMES = [0, 0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24];

export interface Simulation {
  times: number[];
  series: { noteId: string; values: number[] }[];
  total: number[];
  sillageM: number[];
  projectionCm: number[];
  /** Hours until the scent falls below the detection threshold. */
  lifespan: number;
  /** Hours each note stays perceptible. */
  lastsFor: Record<string, number>;
}

const THRESHOLD = 0.035;

/**
 * A first-order evaporation model with Stevens' power-law perception. It is an educated estimate
 * built from editorial note metrics, not a measurement: real skin, weather and materials differ.
 */
export function simulate(items: FormulaItem[], concId: ConcentrationId = "edp", env: Environment = DEFAULT_ENV, times: number[] = TIMES, dose?: Pick<Compounding, "effectivePct" | "fixative">): Simulation {
  const conc = concentration(concId);
  // With stock dilutions, the aromatics the stocks can actually reach set the load.
  const load = (dose?.effectivePct ?? conc.pct) / 18;
  const fix = dose?.fixative ?? 0;
  const ns = normalise(items).flatMap((i) => {
    const n = NOTE_BY_ID.get(i.noteId);
    return n ? [{ item: i, n }] : [];
  });
  const baseShare = ns.filter((x) => x.n.position === "base").reduce((s, x) => s + x.item.parts, 0) / 100;
  const heat = Math.pow(1.04, env.temperature - 24);
  const skin = env.skin === "dry" ? 1.2 : env.skin === "oily" ? 0.85 : 1;
  const carrier = conc.carrier === "alcohol" ? 1 : 0.7;
  // Base materials and non-alcohol carriers slow the evaporation of everything else.
  const rateScale = (heat * skin * carrier) / (1 + 0.4 * baseShare + 1.5 * fix);

  const rate = (longevity: number) => (Math.LN2 / (0.15 * Math.exp(0.42 * longevity))) * rateScale;
  const perceive = (share: number, strength: number, remaining: number) => {
    const v = Math.pow(share * (strength / 6) * load * remaining, 0.5);
    return v < THRESHOLD ? 0 : v;
  };

  const series = ns.map(({ item, n }) => ({
    noteId: n.id,
    values: times.map((t) => perceive(item.parts / 100, n.strength, Math.exp(-rate(n.longevity) * t))),
  }));
  const total = times.map((_, ti) => series.reduce((s, x) => s + x.values[ti], 0));
  const weighted = (key: "sillage" | "projection", ti: number) =>
    ns.reduce((s, { n }, i) => s + series[i].values[ti] * n[key], 0) / 10;
  const spread = 1 - 0.6 * fix;
  const sillageM = times.map((_, ti) => Math.min(5, weighted("sillage", ti) * 1.5 * spread));
  const projectionCm = times.map((_, ti) => Math.min(120, weighted("projection", ti) * 40 * spread));

  const lastsFor: Record<string, number> = {};
  for (const { item, n } of ns) {
    const share = (item.parts / 100) * (n.strength / 6) * load;
    const needed = (THRESHOLD * THRESHOLD) / share;
    lastsFor[n.id] = needed >= 1 ? 0 : Math.log(1 / needed) / rate(n.longevity);
  }
  return { times, series, total, sillageM, projectionCm, lifespan: Math.max(0, ...Object.values(lastsFor)), lastsFor };
}

/** Notes perceptible at a moment, strongest first, with their share of the scent. */
export function scentAt(sim: Simulation, hour: number): { noteId: string; share: number; value: number }[] {
  const { times } = sim;
  let hi = times.findIndex((t) => t >= hour);
  if (hi < 0) hi = times.length - 1;
  const lo = Math.max(0, hi - 1);
  const f = times[hi] === times[lo] ? 0 : (hour - times[lo]) / (times[hi] - times[lo]);
  const rows = sim.series.map((s) => ({ noteId: s.noteId, value: s.values[lo] + (s.values[hi] - s.values[lo]) * f }));
  const total = rows.reduce((s, r) => s + r.value, 0) || 1;
  return rows.filter((r) => r.value > 0).map((r) => ({ ...r, share: r.value / total })).sort((a, b) => b.value - a.value);
}

import { NOTE_BY_ID } from "../data/notes";
import type { ConcentrationId, FormulaItem, Note } from "../types";
import { concentration, normalise } from "./formula";

/**
 * Perfumers rarely weigh raw materials neat: each is kept as a stock dilution, and the formula is
 * compounded from those stocks. IFRA Standards cap materials in the finished product; they do not
 * prescribe a dilution solvent. The solvents below are the common working choices.
 */
export const SOLVENTS = [
  { id: "ethanol", name: "Perfumer's alcohol (ethanol)", short: "ethanol", kind: "volatile", blurb: "The standard for alcohol-based fragrance: evaporates cleanly and lifts the top notes." },
  { id: "dpg", name: "DPG (dipropylene glycol)", short: "DPG", kind: "fixative", blurb: "Near-odourless and slow to evaporate. Common for resins and absolutes; it softens projection slightly." },
  { id: "tec", name: "TEC (triethyl citrate)", short: "TEC", kind: "fixative", blurb: "Low-odour, alcohol-friendly and slow to evaporate. A common DPG alternative." },
  { id: "ipm", name: "IPM (isopropyl myristate)", short: "IPM", kind: "oil", blurb: "Light, oily ester for perfume oils and solids. It does not suit alcohol sprays well." },
  { id: "fco", name: "Fractionated coconut or jojoba oil", short: "carrier oil", kind: "oil", blurb: "Carrier oil for roll-ons and balms. It clouds alcohol sprays." },
] as const;
export type SolventId = (typeof SOLVENTS)[number]["id"];
export const SOLVENT_IDS = SOLVENTS.map((s) => s.id) as [SolventId, ...SolventId[]];
export const solvent = (id: SolventId) => SOLVENTS.find((s) => s.id === id) ?? SOLVENTS[0];

export interface Dilution {
  /** % of the pure material in the stock; 100 means neat. */
  pct: number;
  solvent: SolventId;
}
/** A user's own stock dilutions, by note id. Notes without an entry use Rhythm's default. */
export type DilutionMap = Record<string, Dilution>;

/** Common working strengths, from neat to a trace dilution. */
export const DILUTION_STEPS = [100, 50, 25, 20, 10, 5, 3, 1, 0.1];

// Thick resins and balsams are hard to weigh neat, and dissolve better in a glycol than in alcohol.
const VISCOUS = new Set(["labdanum", "benzoin", "tolu-balsam", "myrrh", "vanilla", "tonka-bean", "oakmoss", "honey", "beeswax", "castoreum"]);

/** Rhythm's recommended stock for a note: potent materials go weaker so they can be dosed accurately. */
export function defaultDilution(n: Pick<Note, "id" | "strength">): Dilution {
  const pct = n.strength >= 9 ? 1 : n.strength >= 8 ? 10 : n.strength >= 7 ? 25 : 50;
  return { pct: VISCOUS.has(n.id) ? Math.min(pct, 50) : pct, solvent: VISCOUS.has(n.id) ? "dpg" : "ethanol" };
}

export function dilutionFor(id: string, user?: DilutionMap): Dilution {
  const own = user?.[id];
  if (own && own.pct > 0 && own.pct <= 100) return own;
  const n = NOTE_BY_ID.get(id);
  return n ? defaultDilution(n) : { pct: 100, solvent: "ethanol" };
}

export const fmtDilution = (d: Dilution) => (d.pct >= 100 ? "neat" : `${+d.pct.toFixed(2)}% in ${solvent(d.solvent).short}`);

export interface CompoundRow { noteId: string; dilution: Dilution; pure: number; stock: number }
export interface Compounding {
  rows: CompoundRow[];
  /** Aromatic % the concentration type asks for. */
  targetPct: number;
  /** Aromatic % actually reachable with these stocks; lower than the target when the stocks are too weak. */
  effectivePct: number;
  /** % of the finished product taken up by the stock blend. */
  stockPct: number;
  /** % of the finished product that is dilution solvent, by solvent. */
  solventPct: Partial<Record<SolventId, number>>;
  /** Share (0-1) of slow-evaporating solvent in an alcohol product; it holds the scent closer and longer. */
  fixative: number;
  issues: { severity: "info" | "warn"; code: string; message: string }[];
}

/**
 * Compounds a formula from the user's stocks. Item parts are the pure material, as designed; each is
 * weighed as `parts / dilution` of its stock. The stocks' solvent counts towards the bottle, so very
 * weak stocks can leave no room to reach the type's aromatic strength.
 */
export function compound(items: FormulaItem[], concId: ConcentrationId, dil?: DilutionMap): Compounding {
  const conc = concentration(concId);
  const rows: CompoundRow[] = normalise(items.filter((i) => NOTE_BY_ID.has(i.noteId))).map((i) => {
    const d = dilutionFor(i.noteId, dil);
    return { noteId: i.noteId, dilution: d, pure: i.parts, stock: i.parts / (d.pct / 100) };
  });
  const stockPerPure = rows.reduce((s, r) => s + r.stock, 0) / 100 || 1;
  const needed = conc.pct * stockPerPure;
  const effectivePct = needed <= 100 ? conc.pct : 100 / stockPerPure;
  const k = effectivePct / 100;
  const solventPct: Partial<Record<SolventId, number>> = {};
  for (const r of rows) if (r.dilution.pct < 100) solventPct[r.dilution.solvent] = (solventPct[r.dilution.solvent] ?? 0) + (r.stock - r.pure) * k;
  const slow = (["dpg", "tec", "ipm", "fco"] as SolventId[]).reduce((s, id) => s + (solventPct[id] ?? 0), 0);
  const issues: Compounding["issues"] = [];
  if (effectivePct < conc.pct * 0.98) {
    const weakest = rows.slice().sort((a, b) => b.stock - a.stock).slice(0, 2).map((r) => `${NOTE_BY_ID.get(r.noteId)!.name} (${fmtDilution(r.dilution)})`);
    issues.push({ severity: "warn", code: "dilution-strength", message: `Your stock dilutions can reach only ${effectivePct.toFixed(1)}% aromatics, below the ${conc.pct}% a ${conc.name} needs, so it will perform weaker. Use stronger stocks for ${weakest.join(" and ")}, or choose a lighter type.` });
  }
  if (conc.carrier !== "alcohol" && (solventPct.ethanol ?? 0) > 2) {
    issues.push({ severity: "warn", code: "dilution-ethanol", message: `Ethanol from your dilutions makes up ${solventPct.ethanol!.toFixed(1)}% of this ${conc.carrier === "oil" ? "oil" : "balm"}. Dilute in IPM, carrier oil or DPG instead.` });
  }
  const oily = (solventPct.ipm ?? 0) + (solventPct.fco ?? 0);
  if (conc.carrier === "alcohol" && oily > 1) {
    issues.push({ severity: "warn", code: "dilution-oil", message: `Oil-based dilutions make up ${oily.toFixed(1)}% of this alcohol spray and may cloud it. Prefer ethanol, DPG or TEC.` });
  }
  return { rows, targetPct: conc.pct, effectivePct, stockPct: Math.min(100, needed), solventPct, fixative: conc.carrier === "alcohol" ? slow / 100 : 0, issues };
}

import { describe, expect, it } from "vitest";
import { ACCORDS, PERFUMES } from "../shared/data/catalog";
import { NOTE_BY_ID, NOTES } from "../shared/data/notes";
import { analyse, batchSheet, CONCENTRATIONS, limitFor } from "../shared/engine/formula";
import { balance, generate, learnFromFeedback } from "../shared/engine/generate";
import { scentAt, simulate } from "../shared/engine/simulate";
import { trainModel } from "../shared/engine/train";
import { FACETS, type Mood, type Strength } from "../shared/types";

describe("catalogue integrity", () => {
  it("has unique note ids and resolvable references", () => {
    expect(new Set(NOTES.map((n) => n.id)).size).toBe(NOTES.length);
    const missing = new Set<string>();
    for (const n of NOTES) for (const p of n.pairs) if (!NOTE_BY_ID.has(p)) missing.add(`${n.id}->${p}`);
    for (const a of ACCORDS) for (const id of Object.keys(a.parts)) if (!NOTE_BY_ID.has(id)) missing.add(`${a.id}->${id}`);
    for (const p of PERFUMES) for (const id of [...p.top, ...p.heart, ...p.base]) if (!NOTE_BY_ID.has(id)) missing.add(`${p.name}->${id}`);
    expect([...missing]).toEqual([]);
  });
  it("has valid metrics", () => {
    for (const n of NOTES) {
      for (const v of [n.sillage, n.projection, n.longevity, n.strength]) expect(v).toBeGreaterThanOrEqual(1);
      expect(n.dose[0]).toBeLessThan(n.dose[1]);
      for (const f of FACETS) expect(Number.isFinite(n.facets[f])).toBe(true);
    }
  });
});

describe("training", () => {
  it("ranks held-out pairings above random pairs", () => {
    const m = trainModel();
    expect(m.embedding.length).toBe(m.ids.length * m.dims);
    expect(m.metrics.heldOutAuc).toBeGreaterThan(0.6);
  }, 60000);
});

describe("generation", () => {
  const moods: Mood[] = ["gentle", "refreshing", "romantic", "sensual", "mysterious", "uplifting", "cozy", "elegant"];
  const strengths: Strength[] = ["mild", "moderate", "bold"];

  it("always includes seeds, respects avoid list and never exceeds IFRA guards", () => {
    for (const mood of moods) for (const strength of strengths) {
      const out = generate({ seeds: ["lemon", "jasmine", "oud"], mood, strength, avoid: ["rose"] });
      expect(out.length).toBeGreaterThan(0);
      for (const c of out) {
        const ids = c.items.map((i) => i.noteId);
        for (const s of ["lemon", "jasmine", "oud"]) expect(ids).toContain(s);
        expect(ids).not.toContain("rose");
        expect(c.items.reduce((s, i) => s + i.parts, 0)).toBeCloseTo(100, 0);
        expect(c.analysis.issues.filter((x) => x.code === "ifra")).toEqual([]);
      }
    }
  });
  it("is deterministic for a brief and returns distinct candidates", () => {
    const brief = { seeds: ["bergamot", "rose"], mood: "elegant" as const, strength: "moderate" as const };
    const a = generate(brief);
    expect(a).toEqual(generate(brief));
    expect(new Set(a.map((c) => c.items.map((i) => i.noteId).sort().join())).size).toBe(a.length);
  });
  it("moves towards refreshing or smoky preference", () => {
    const seeds = ["bergamot", "cedarwood"];
    const fresh = generate({ seeds, mood: "refreshing", strength: "mild" })[0].analysis.facets;
    const dark = generate({ seeds, mood: "mysterious", strength: "bold" })[0].analysis.facets;
    expect(fresh.fresh).toBeGreaterThan(dark.fresh);
    expect(dark.smoky).toBeGreaterThan(fresh.smoky);
  });
  it("uses human taste", () => {
    const seeds = ["bergamot", "rose"];
    const base = { seeds, mood: "romantic" as const, strength: "moderate" as const };
    const disliked = generate(base)[0].items.map((i) => i.noteId).filter((i) => !seeds.includes(i))[0];
    const taste = { [disliked]: -1 };
    const hits = generate({ ...base, taste }).filter((c) => c.items.some((i) => i.noteId === disliked)).length;
    expect(hits).toBeLessThan(generate(base).filter((c) => c.items.some((i) => i.noteId === disliked)).length + 1);
    expect(learnFromFeedback({}, [{ noteId: "rose", parts: 100 }], 1).rose).toBeGreaterThan(0);
  });
  it("rejects fewer than two seeds", () => {
    expect(() => generate({ seeds: ["rose"], mood: "gentle", strength: "mild" })).toThrow();
  });
});

describe("balancing", () => {
  it("fixes an IFRA breach and a lopsided pyramid", () => {
    const bad = [{ noteId: "oakmoss", parts: 40 }, { noteId: "bergamot", parts: 40 }, { noteId: "rose", parts: 10 }, { noteId: "sandalwood", parts: 10 }];
    expect(analyse(bad).issues.some((i) => i.code === "ifra")).toBe(true);
    const { after, changes } = balance(bad);
    expect(after.issues.filter((i) => i.code === "ifra")).toEqual([]);
    expect(changes.length).toBeGreaterThan(0);
  });
  it("respects a higher concentration's tighter cap", () => {
    const items = [{ noteId: "lime", parts: 30 }, { noteId: "rose", parts: 40 }, { noteId: "sandalwood", parts: 30 }];
    for (const c of CONCENTRATIONS) expect(balance(items, { concentration: c.id }).after.issues.filter((i) => i.code === "ifra")).toEqual([]);
  });
  it("increases longevity on request", () => {
    const items = generate({ seeds: ["lemon", "rose"], mood: "uplifting", strength: "moderate" })[0].items;
    expect(balance(items, { goals: { longevity: 1 } }).after.longevity).toBeGreaterThanOrEqual(analyse(items).longevity);
  });
  it("exempts phototoxic limits on rinse-off", () => {
    expect(limitFor(NOTE_BY_ID.get("bergamot")!, "rinse")).toBeNull();
    expect(limitFor(NOTE_BY_ID.get("oakmoss")!, "lip")).toBeLessThan(0.1);
  });
});

describe("simulation", () => {
  const items = [{ noteId: "lemon", parts: 30 }, { noteId: "jasmine", parts: 30 }, { noteId: "patchouli", parts: 40 }];
  it("fades top notes first and leaves the base last", () => {
    const sim = simulate(items);
    expect(sim.lastsFor.lemon).toBeLessThan(sim.lastsFor.jasmine);
    expect(sim.lastsFor.jasmine).toBeLessThan(sim.lastsFor.patchouli);
    expect(sim.total[0]).toBeGreaterThan(sim.total[sim.total.length - 1]);
    expect(scentAt(sim, 8)[0].noteId).toBe("patchouli");
    for (let i = 1; i < sim.sillageM.length; i++) expect(sim.sillageM[i]).toBeLessThanOrEqual(sim.sillageM[i - 1] + 1e-9);
  });
  it("evaporates faster in heat and is stronger at higher concentration", () => {
    expect(simulate(items, "edp", { temperature: 35, skin: "normal" }).lifespan).toBeLessThan(simulate(items, "edp", { temperature: 15, skin: "normal" }).lifespan);
    expect(simulate(items, "parfum").total[0]).toBeGreaterThan(simulate(items, "edc").total[0]);
  });
});

describe("batch", () => {
  it("volumes add up", () => {
    const { rows } = batchSheet([{ noteId: "rose", parts: 50 }, { noteId: "oud", parts: 50 }], "edp", 50);
    expect(rows.reduce((s, r) => s + r.ml, 0)).toBeCloseTo(50, 5);
    expect(rows.some((r) => r.label.includes("ethanol"))).toBe(true);
  });
});

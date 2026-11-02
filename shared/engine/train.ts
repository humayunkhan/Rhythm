import { ACCORDS, PERFUMES } from "../data/catalog";
import { NOTES } from "../data/notes";
import { mulberry32 } from "./rng";

export interface ModelFile {
  version: number;
  ids: string[];
  dims: number;
  /** Flattened rows, unit-length note embeddings. */
  embedding: number[];
  metrics: { documents: number; pairs: number; heldOutAuc: number };
}

type Doc = { weights: Map<string, number> };

/** Every perfume, accord and curated pairing is one "document" of notes that work together. */
export function buildCorpus(): Doc[] {
  const docs: Doc[] = [];
  for (const p of PERFUMES) docs.push({ weights: new Map([...p.top, ...p.heart, ...p.base].map((id) => [id, 1])) });
  for (const a of ACCORDS) {
    const max = Math.max(...Object.values(a.parts));
    docs.push({ weights: new Map(Object.entries(a.parts).map(([id, w]) => [id, 0.5 + 0.5 * (w / max)])) });
  }
  for (const n of NOTES) for (const pair of n.pairs) docs.push({ weights: new Map([[n.id, 1], [pair, 1]]) });
  return docs;
}

function ppmi(docs: Doc[], ids: string[]): number[][] {
  const index = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;
  const co = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (const d of docs) {
    const entries = [...d.weights].filter(([id]) => index.has(id));
    for (const [a, wa] of entries) for (const [b, wb] of entries) {
      if (a !== b) co[index.get(a)!][index.get(b)!] += wa * wb;
    }
  }
  const row = co.map((r) => r.reduce((s, v) => s + v, 0));
  const total = row.reduce((s, v) => s + v, 0) || 1;
  return co.map((r, i) => r.map((v, j) => {
    if (!v || !row[i] || !row[j]) return 0;
    return Math.max(0, Math.log((v * total) / (row[i] * row[j])));
  }));
}

/** Truncated symmetric eigendecomposition by orthogonal iteration. */
function embed(m: number[][], dims: number, seed: number): number[][] {
  const n = m.length;
  const rng = mulberry32(seed);
  let q = Array.from({ length: dims }, () => Array.from({ length: n }, () => rng() - 0.5));
  const orthonormalise = (vs: number[][]) => {
    for (let i = 0; i < vs.length; i++) {
      for (let j = 0; j < i; j++) {
        const dot = vs[i].reduce((s, v, k) => s + v * vs[j][k], 0);
        vs[i] = vs[i].map((v, k) => v - dot * vs[j][k]);
      }
      const norm = Math.hypot(...vs[i]) || 1;
      vs[i] = vs[i].map((v) => v / norm);
    }
    return vs;
  };
  const mul = (v: number[]) => m.map((r) => r.reduce((s, x, k) => s + x * v[k], 0));
  q = orthonormalise(q);
  for (let it = 0; it < 40; it++) q = orthonormalise(q.map(mul));
  const values = q.map((v) => Math.hypot(...mul(v)));
  return Array.from({ length: n }, (_, i) => {
    const row = q.map((v, d) => v[i] * Math.sqrt(values[d]));
    const norm = Math.hypot(...row) || 1;
    return row.map((x) => x / norm);
  });
}

const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);

/** Holds out a sample of known pairings and measures whether they outrank random pairs. */
function heldOutAuc(ids: string[], dims: number, seed: number): number {
  const rng = mulberry32(seed + 1);
  const docs = buildCorpus();
  const index = new Map(ids.map((id, i) => [id, i]));
  const key = (a: string, b: string) => [a, b].sort().join("|");
  const known = new Set<string>();
  for (const d of docs) {
    const k = [...d.weights.keys()].filter((id) => index.has(id));
    for (const a of k) for (const b of k) if (a < b) known.add(key(a, b));
  }
  const held = [...known].filter(() => rng() < 0.1);
  const heldSet = new Set(held);
  const trainDocs: Doc[] = docs.map((d) => {
    const k = [...d.weights.keys()];
    // A note is removed from a document when it would otherwise reveal a held-out pair.
    const keep = k.filter((a, i) => !k.slice(0, i).some((b) => heldSet.has(key(a, b))));
    return { weights: new Map(keep.map((id) => [id, d.weights.get(id)!])) };
  });
  const e = embed(ppmi(trainDocs, ids), dims, seed);
  const score = (p: string) => {
    const [a, b] = p.split("|");
    return dot(e[index.get(a)!], e[index.get(b)!]);
  };
  const negatives: string[] = [];
  while (negatives.length < held.length) {
    const a = ids[Math.floor(rng() * ids.length)];
    const b = ids[Math.floor(rng() * ids.length)];
    if (a !== b && !known.has(key(a, b))) negatives.push(key(a, b));
  }
  let wins = 0;
  let total = 0;
  for (const pos of held) {
    const s = score(pos);
    for (let i = 0; i < 50; i++) {
      const neg = negatives[Math.floor(rng() * negatives.length)];
      const t = score(neg);
      wins += s > t ? 1 : s === t ? 0.5 : 0;
      total++;
    }
  }
  return total ? wins / total : 0.5;
}

export function trainModel(dims = 24, seed = 7): ModelFile {
  const ids = NOTES.map((n) => n.id);
  const docs = buildCorpus();
  const e = embed(ppmi(docs, ids), dims, seed);
  return {
    version: 1,
    ids,
    dims,
    embedding: e.flat().map((v) => Math.round(v * 1000) / 1000),
    metrics: {
      documents: docs.length,
      pairs: docs.reduce((s, d) => s + (d.weights.size * (d.weights.size - 1)) / 2, 0),
      heldOutAuc: Math.round(heldOutAuc(ids, dims, seed) * 1000) / 1000,
    },
  };
}

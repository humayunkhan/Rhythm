import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { NOTES } from "../../shared/data/notes";
import { defaultDilution, DILUTION_STEPS, fmtDilution, SOLVENTS, type Dilution, type DilutionMap, type SolventId } from "../../shared/engine/dilution";
import { FAMILIES, type Family } from "../../shared/types";
import { NoteIcon } from "../components/NoteIcon";
import { api, FAMILY_META, loadDraft, useSession } from "../lib";

const same = (a: Dilution, b: Dilution) => Math.abs(a.pct - b.pct) < 1e-9 && a.solvent === b.solvent;

/** Every note's stock dilution: Rhythm's recommendation until the user changes it. Saved to the account. */
export default function Dilutions() {
  const { user, ready, setUser } = useSession();
  const [map, setMap] = useState<DilutionMap>(() => user?.dilutions ?? {});
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Family | "all" | "draft" | "custom">("all");
  const [status, setStatus] = useState<{ s: "idle" | "saving" | "saved" | "error"; msg?: string }>({ s: "idle" });
  const draftIds = useMemo(() => new Set(loadDraft().items.map((i) => i.noteId)), []);
  const loaded = useRef(false);

  // The session can arrive after the first render; take the saved map once it does.
  useEffect(() => {
    if (user && !loaded.current) { loaded.current = true; setMap(user.dilutions ?? {}); }
  }, [user]);

  const savedKey = JSON.stringify(user?.dilutions ?? {});
  const key = JSON.stringify(map);
  useEffect(() => {
    if (!user || !loaded.current || key === savedKey) return;
    const t = setTimeout(async () => {
      setStatus({ s: "saving" });
      try {
        const r = await api("/me", { method: "PATCH", body: { dilutions: map } });
        setUser(r.user);
        setStatus({ s: "saved" });
      } catch (e) { setStatus({ s: "error", msg: (e as Error).message }); }
    }, 600);
    return () => clearTimeout(t);
  }, [key, savedKey, user, map, setUser]);

  if (!ready) return <div className="page-loading" role="status">Loading…</div>;
  if (!user) return <Navigate to="/login?next=/dilutions" replace />;

  const set = (id: string, d: Dilution) => {
    const def = defaultDilution(NOTES.find((n) => n.id === id)!);
    setMap((m) => {
      const next = { ...m };
      // A choice equal to the recommendation is stored as "default", so later improvements reach it.
      if (same(d, def)) delete next[id]; else next[id] = d;
      return next;
    });
  };
  const s = q.trim().toLowerCase();
  const rows = NOTES.filter((n) => (!s || n.name.toLowerCase().includes(s))
    && (filter === "all" || (filter === "draft" ? draftIds.has(n.id) : filter === "custom" ? !!map[n.id] : n.family === filter)));
  const custom = Object.keys(map).length;

  return (
    <div className="dilutions">
      <div className="catalog-head">
        <h1>My dilutions</h1>
        <p className="muted">How you keep each raw material. The Formula Studio compounds every formula from these stocks, so its strength, projection, sillage, longevity, scores and make-up sheet follow them.</p>
      </div>

      <div className="dil-guide panel">
        <div>
          <h3>Why dilute</h3>
          <p>Perfumers rarely weigh materials neat. Each one is kept as a stock dilution so small amounts can be weighed accurately and potent materials don't overwhelm the blend.
            Rhythm recommends a starting strength for every note: 50% for most materials, 25% or 10% for strong ones, 1% for the most potent, and 50% in DPG for thick resins.</p>
          <p>Weaker stocks bring more solvent into the bottle. When the stocks are too weak to reach the type you chose (for example 18% aromatics for an Eau de Parfum),
            the Studio shows the strength you can actually reach and prorates every performance figure and the score.</p>
        </div>
        <div>
          <h3>Which solvent</h3>
          <ul className="dil-solvents">{SOLVENTS.map((x) => <li key={x.id}><b>{x.name}.</b> {x.blurb}</li>)}</ul>
          <p className="muted small-note">IFRA Standards set the maximum level of each material in the finished product; they do not prescribe a dilution solvent. Perfumer's alcohol suits alcohol sprays; DPG or TEC suit resins and absolutes; IPM or a carrier oil suit perfume oils and balms. Check each supplier's safety data sheet.</p>
        </div>
      </div>

      <div className="dil-bar">
        <input type="search" value={q} placeholder="Search a note" aria-label="Search notes" onChange={(e) => setQ(e.target.value)} />
        <select value={filter} aria-label="Show" onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="all">All notes</option>
          <option value="draft">In my current formula ({draftIds.size})</option>
          <option value="custom">Changed by me ({custom})</option>
          {FAMILIES.map((f) => <option key={f} value={f}>{FAMILY_META[f].label}</option>)}
        </select>
        <span className={`save-status${status.s === "error" ? " warn" : status.s === "saved" ? " good" : " muted"}`} role="status">
          {status.s === "saving" ? "Saving…" : status.s === "saved" ? "Saved to your account" : status.s === "error" ? `Not saved: ${status.msg}` : `${custom} changed from Rhythm's defaults`}
        </span>
        {custom > 0 && <button className="btn ghost small" onClick={() => { if (confirm("Reset every note to Rhythm's recommended dilution?")) setMap({}); }}>Reset all to defaults</button>}
        <Link className="btn small" to="/create">Back to the Studio</Link>
      </div>

      <div className="table-wrap">
        <table className="formula dil-table">
          <thead><tr><th>Note</th><th>Layer</th><th className="num">Strength</th><th>Rhythm default</th><th>Your stock</th><th>Solvent</th><th><span className="sr">Reset</span></th></tr></thead>
          <tbody>
            {rows.map((n) => {
              const def = defaultDilution(n);
              const own = map[n.id];
              const d = own ?? def;
              const preset = DILUTION_STEPS.includes(d.pct);
              return (
                <tr key={n.id} className={own ? "custom" : ""}>
                  <td><span className="note-cell"><NoteIcon n={n} />{n.name}</span></td>
                  <td className="cap">{n.position}</td>
                  <td className="num">{n.strength}/10</td>
                  <td className="muted">{fmtDilution(def)}</td>
                  <td>
                    <span className="dil-pct">
                      <select value={preset ? String(d.pct) : "custom"} aria-label={`${n.name} stock strength`} onChange={(e) => set(n.id, { ...d, pct: e.target.value === "custom" ? 15 : +e.target.value })}>
                        {DILUTION_STEPS.map((v) => <option key={v} value={v}>{v === 100 ? "100% (neat)" : `${v}%`}</option>)}
                        <option value="custom">Other…</option>
                      </select>
                      {!preset && <input type="number" min="0.01" max="100" step="0.01" value={d.pct} aria-label={`${n.name} stock strength, percent`} onChange={(e) => { const v = +e.target.value; if (v > 0 && v <= 100) set(n.id, { ...d, pct: v }); }} />}
                    </span>
                  </td>
                  <td>
                    <select value={d.solvent} disabled={d.pct >= 100} aria-label={`${n.name} solvent`} onChange={(e) => set(n.id, { ...d, solvent: e.target.value as SolventId })}>
                      {SOLVENTS.map((x) => <option key={x.id} value={x.id}>{x.short}</option>)}
                    </select>
                  </td>
                  <td>{own && <button className="link-btn" onClick={() => set(n.id, def)}>Default</button>}</td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={7} className="muted">No notes match.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

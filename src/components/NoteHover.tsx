import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ACCORDS } from "../../shared/data/catalog";
import { NOTE_BY_ID, note } from "../../shared/data/notes";
import { facetColor } from "../../shared/engine/brand";
import { dominantFacets } from "../../shared/engine/generate";
import { simulate } from "../../shared/engine/simulate";
import { FAMILY_META, fmtDuration, noteColor } from "../lib";
import { accordIcon } from "../icons";
import { timeX } from "./viz";
import { NoteIcon } from "./NoteIcon";

const METRICS = [
  { key: "sillage", label: "Sillage", hint: "How far the trail reaches" },
  { key: "projection", label: "Projection", hint: "How strongly it radiates" },
  { key: "longevity", label: "Longevity", hint: "How long it lasts" },
  { key: "strength", label: "Strength", hint: "How loud it is in a blend" },
] as const;

/** Radial gauge for the four 1-10 performance metrics. */
function MetricDial({ value, label, color }: { value: number; label: string; color: string }) {
  const r = 17, c = 2 * Math.PI * r;
  return (
    <div className="dial">
      <svg viewBox="0 0 44 44" width="44" height="44" aria-hidden="true">
        <circle cx="22" cy="22" r={r} fill="none" className="dial-track" strokeWidth="5" />
        <circle cx="22" cy="22" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(value / 10) * c * 0.75} ${c}`} transform="rotate(135 22 22)" />
        <text x="22" y="26" textAnchor="middle" fontSize="12" fontWeight="700" className="dial-val">{value}</text>
      </svg>
      <small>{label}</small>
    </div>
  );
}

/** How a note fades on skin when worn alone, on the same time scale as the Studio. */
function FadeCurve({ id, color }: { id: string; color: string }) {
  const { d, life } = useMemo(() => {
    const sim = simulate([{ noteId: id, parts: 100 }], "edp");
    const max = Math.max(...sim.series[0].values, 0.001);
    const pts = sim.times.map((t, i) => `${(timeX(t) * 200).toFixed(1)} ${(46 - (sim.series[0].values[i] / max) * 40).toFixed(1)}`);
    return { d: `M0 46 L${pts.join(" L")} L200 46 Z`, life: sim.lastsFor[id] ?? 0 };
  }, [id]);
  return (
    <div className="fade-curve">
      <svg viewBox="0 0 200 50" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id={`fc-${id}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".9" /><stop offset="1" stopColor={color} stopOpacity=".05" /></linearGradient></defs>
        <path d={d} fill={`url(#fc-${id})`} stroke={color} strokeWidth="1.2" />
      </svg>
      <div className="fade-axis"><span>Spray</span><span>1 h</span><span>6 h</span><span>24 h</span></div>
      <p className="muted">Worn alone it stays perceptible for about <b>{life >= 24 ? "24 h+" : fmtDuration(life)}</b>.</p>
    </div>
  );
}

export function NoteCard({ id, selected = [], onToggle }: { id: string; selected?: string[]; onToggle?: (id: string) => void }) {
  const n = note(id);
  const color = noteColor(n);
  const facets = dominantFacets(n.facets, 5).filter((f) => n.facets[f] > 0.05);
  const max = Math.max(...facets.map((f) => n.facets[f]), 0.01);
  const pairs = n.pairs.filter((p) => NOTE_BY_ID.has(p)).slice(0, 6);
  const accords = ACCORDS.filter((a) => id in a.parts).slice(0, 3);
  const picked = selected.filter((s) => s !== id);
  const goodWithPicked = picked.filter((p) => n.pairs.includes(p) || note(p).pairs.includes(id));
  return (
    <div className="note-card" style={{ "--c": color } as React.CSSProperties}>
      <header>
        <NoteIcon n={n} big />
        <div>
          <b>{n.name}</b>
          <small>{FAMILY_META[n.family].label} · {n.position} note · typical {n.dose[0]}–{n.dose[1]}%</small>
        </div>
      </header>
      <p>{n.description}</p>
      <div className="dials">{METRICS.map((m) => <MetricDial key={m.key} value={n[m.key]} label={m.label} color={color} />)}</div>
      <div className="facet-strip">
        {facets.map((f) => <span key={f}><i style={{ width: `${(n.facets[f] / max) * 100}%`, background: facetColor(f) }} /><em>{f}</em></span>)}
      </div>
      <FadeCurve id={id} color={color} />
      {goodWithPicked.length > 0 && <p className="good-text small">✓ Pairs well with your {goodWithPicked.map((p) => note(p).name).join(", ")}</p>}
      {pairs.length > 0 && (
        <div className="note-recs">
          <small className="eyebrow">Recommended with</small>
          <div className="chips small">
            {pairs.map((p) => {
              const on = selected.includes(p);
              return onToggle
                ? <button key={p} type="button" className={`chip${on ? " on" : ""}`} aria-pressed={on} onClick={() => onToggle(p)}><NoteIcon n={note(p)} />{note(p).name}{on ? " ✓" : " +"}</button>
                : <span key={p} className="tag"><NoteIcon n={note(p)} />{note(p).name}</span>;
            })}
          </div>
        </div>
      )}
      {accords.length > 0 && <p className="muted small">Classic in: {accords.map((a) => `${accordIcon(a)} ${a.name}`).join(" · ")}</p>}
      {n.ifra.status === "restricted" && <p className="warn-text small">Restricted by IFRA: max {n.ifra.cat4}% in fine fragrance{n.ifra.note ? `. ${n.ifra.note}` : ""}.</p>}
    </div>
  );
}

/**
 * Hover (or keyboard focus) on any element registered through `bind` opens a rich note card next to it.
 * The card itself is hoverable, so its recommendations can be clicked.
 */
export function useNoteHover() {
  const [state, setState] = useState<{ id: string; rect: DOMRect } | null>(null);
  const openTimer = useRef(0);
  const closeTimer = useRef(0);
  const cancelClose = () => clearTimeout(closeTimer.current);
  const close = useCallback(() => { clearTimeout(openTimer.current); closeTimer.current = window.setTimeout(() => setState(null), 180); }, []);
  useEffect(() => () => { clearTimeout(openTimer.current); clearTimeout(closeTimer.current); }, []);
  useEffect(() => {
    if (!state) return;
    const hide = () => setState(null);
    window.addEventListener("scroll", hide, { passive: true });
    return () => window.removeEventListener("scroll", hide);
  }, [state]);
  const bind = (id: string) => ({
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      cancelClose();
      const rect = e.currentTarget.getBoundingClientRect();
      clearTimeout(openTimer.current);
      openTimer.current = window.setTimeout(() => setState({ id, rect }), state ? 60 : 280);
    },
    onMouseLeave: close,
    onFocus: (e: React.FocusEvent<HTMLElement>) => { cancelClose(); setState({ id, rect: e.currentTarget.getBoundingClientRect() }); },
    onBlur: close,
  });
  const render = (content: (id: string) => ReactNode) => {
    if (!state) return null;
    const W = 330;
    const { rect } = state;
    const right = rect.right + 12 + W < window.innerWidth;
    const left = right ? rect.right + 12 : Math.max(8, rect.left - W - 12);
    const fitsLeft = right || rect.left - W - 12 >= 8;
    const style: React.CSSProperties = fitsLeft
      ? { left, top: Math.max(8, Math.min(rect.top - 20, window.innerHeight - 520)) }
      : { left: Math.max(8, Math.min(rect.left, window.innerWidth - W - 8)), top: rect.bottom + 8 };
    // Rendered into the body: an animated or clipped ancestor would otherwise trap a fixed-position card.
    return createPortal(
      <div className="note-pop" role="tooltip" style={{ ...style, width: W }} onMouseEnter={cancelClose} onMouseLeave={close}>
        {content(state.id)}
      </div>,
      document.body,
    );
  };
  return { bind, render, hide: () => setState(null) };
}

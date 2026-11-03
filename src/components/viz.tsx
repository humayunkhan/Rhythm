import { useEffect, useMemo, useRef, useState } from "react";
import { note, NOTE_BY_ID } from "../../shared/data/notes";
import { facetColor } from "../../shared/engine/brand";
import { analyse } from "../../shared/engine/formula";
import { scentAt, type Simulation } from "../../shared/engine/simulate";
import { FACETS, type FacetVector, type FormulaItem, type Position } from "../../shared/types";
import { fmtDuration, noteColor } from "../lib";
import { noteIcon, noteIconFilter } from "../icons";
import { NoteIcon } from "./NoteIcon";

const HOURS = 24;
// Each tick gets an equal slice of width, so the fast opening is as readable as the long drydown.
const TICKS = [0, 0.25, 1, 3, 6, 12, 24];
export const timeX = (h: number) => {
  const c = Math.max(0, Math.min(HOURS, h));
  let i = 1;
  while (i < TICKS.length - 1 && TICKS[i] < c) i++;
  return (i - 1 + (c - TICKS[i - 1]) / (TICKS[i] - TICKS[i - 1])) / (TICKS.length - 1);
};
export const timeH = (x: number) => {
  const f = Math.max(0, Math.min(1, x)) * (TICKS.length - 1);
  const i = Math.min(TICKS.length - 2, Math.floor(f));
  return TICKS[i] + (f - i) * (TICKS[i + 1] - TICKS[i]);
};
const xOf = (h: number, w: number) => timeX(h) * w;
const hOf = (x: number, w: number) => timeH(x / w);
const tickLabel = (h: number) => (h === 0 ? "Spray" : h < 1 ? `${Math.round(h * 60)} min` : `${h} h`);

export const PHASES = [
  { label: "Opening", from: 0, to: 0.5 },
  { label: "Heart", from: 0.5, to: 3 },
  { label: "Drydown", from: 3, to: 10 },
  { label: "Last trace", from: 10, to: 24 },
];

const colorOf = (id: string) => {
  const n = NOTE_BY_ID.get(id);
  return n ? noteColor(n) : "#888";
};

const interp = (sim: Simulation, values: number[], h: number) => {
  const { times } = sim;
  let hi = times.findIndex((t) => t >= h);
  if (hi < 0) hi = times.length - 1;
  const lo = Math.max(0, hi - 1);
  const f = times[hi] === times[lo] ? 0 : (h - times[lo]) / (times[hi] - times[lo]);
  return values[lo] + (values[hi] - values[lo]) * f;
};

export type RiverActions = { onDose: (id: string, factor: number) => void; onRemove: (id: string) => void };

const tickText = (h: number) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : `${h.toFixed(h < 10 ? 1 : 0)} h`);

/**
 * The scent river: every note as a stream over 24 hours, by strength or as a share of the blend.
 * Hover a stream for its details, click it to adjust that note, and drag anywhere to move through time.
 */
export function ScentRiver({ sim, hour, onHour, mode = "strength", actions, doses }: {
  sim: Simulation; hour: number; onHour: (h: number) => void; mode?: "strength" | "blend"; actions?: RiverActions; doses?: Record<string, number>;
}) {
  const W = 900, H = 300, PAD = 26, BASE = H - 26;
  const ref = useRef<SVGSVGElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ h: number; id: string | null; x: number; y: number } | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [legendHover, setLegendHover] = useState<string | null>(null);
  const down = useRef<{ x: number; y: number } | null>(null);
  const ordered = useMemo(() => {
    const lasts = sim.series.map((s) => ({ s, last: sim.lastsFor[s.noteId] ?? 0 }));
    return lasts.sort((a, b) => b.last - a.last).map((x) => x.s);
  }, [sim]);
  const samples = useMemo(() => Array.from({ length: 140 }, (_, i) => hOf((i / 139) * W, W)), []);
  const { paths, labels, stacks } = useMemo(() => {
    const maxTotal = Math.max(...sim.total, 0.01);
    const span = BASE - PAD;
    const stacks = samples.map((h) => {
      const raw = ordered.map((s) => interp(sim, s.values, h));
      const total = raw.reduce((a, b) => a + b, 0);
      const k = mode === "blend" ? (total > 0.001 ? span / total : 0) : span / maxTotal;
      const vals = raw.map((v) => v * k);
      const sum = vals.reduce((a, b) => a + b, 0);
      return { vals, start: mode === "blend" ? PAD : PAD + (span - sum) / 2 };
    });
    const labels: { id: string; x: number; y: number; t: number }[] = [];
    const paths = ordered.map((s, k) => {
      const lower: string[] = [], upper: string[] = [];
      let best = { t: 0, x: 0, y: 0 };
      samples.forEach((h, i) => {
        const before = stacks[i].vals.slice(0, k).reduce((a, b) => a + b, 0);
        const y0 = stacks[i].start + before;
        const t = stacks[i].vals[k];
        const x = xOf(h, W);
        if (t > best.t && x > 70 && x < W - 70) best = { t, x, y: y0 + t / 2 };
        upper.push(`${x.toFixed(1)} ${y0.toFixed(1)}`);
        lower.unshift(`${x.toFixed(1)} ${(y0 + t).toFixed(1)}`);
      });
      if (best.t > 11) labels.push({ id: s.noteId, ...best });
      return { id: s.noteId, d: `M${upper.join("L")}L${lower.join("L")}Z` };
    });
    return { paths, labels, stacks };
  }, [ordered, samples, sim, mode, BASE]);

  const toView = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { vx: ((e.clientX - r.left) / r.width) * W, vy: ((e.clientY - r.top) / r.height) * H, px: e.clientX - r.left, py: e.clientY - r.top };
  };
  /** The stream under a point, found from the same stacks that draw the chart. */
  const bandAt = (vx: number, vy: number) => {
    const i = Math.max(0, Math.min(samples.length - 1, Math.round((vx / W) * (samples.length - 1))));
    let y = stacks[i].start;
    for (let k = 0; k < ordered.length; k++) {
      const t = stacks[i].vals[k];
      if (vy >= y && vy <= y + t && t > 0.4) return ordered[k].noteId;
      y += t;
    }
    return null;
  };
  const onDown = (e: React.PointerEvent) => {
    ref.current!.setPointerCapture(e.pointerId);
    down.current = { x: e.clientX, y: e.clientY };
    onHour(hOf(toView(e).vx, W));
  };
  const onMove = (e: React.PointerEvent) => {
    const { vx, vy, px, py } = toView(e);
    const h = hOf(vx, W);
    if (ref.current!.hasPointerCapture(e.pointerId)) { onHour(h); setHover(null); return; }
    setHover({ h, id: bandAt(vx, vy), x: px, y: py });
  };
  const onUp = (e: React.PointerEvent) => {
    const d = down.current;
    down.current = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return;
    const { vx, vy } = toView(e);
    const id = bandAt(vx, vy);
    setFocus(id && id !== focus ? id : null);
  };
  const lit = legendHover ?? hover?.id ?? focus;
  const cx = xOf(hour, W);
  const shareAt = (id: string, h: number) => {
    const s = sim.series.find((x) => x.noteId === id);
    const v = s ? interp(sim, s.values, h) : 0;
    const total = sim.series.reduce((a, x) => a + interp(sim, x.values, h), 0) || 1;
    return v / total;
  };
  const lasts = (id: string) => { const l = sim.lastsFor[id] ?? 0; return l >= 24 ? "24 h+" : fmtDuration(l); };
  const legend = useMemo(() => ordered.slice().reverse(), [ordered]);
  const focusNote = focus ? NOTE_BY_ID.get(focus) : undefined;
  const tipNote = hover?.id ? NOTE_BY_ID.get(hover.id) : undefined;

  return (
    <div className="river-wrap" ref={wrap}>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className={`river${lit ? " lit" : ""}`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => setHover(null)}
        role="img" aria-label="Stream chart of each note over 24 hours. Hover a stream for details, click it to adjust, drag to move through time.">
        <defs>
          {paths.map((p) => (
            <linearGradient key={p.id} id={`rv-${p.id}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={colorOf(p.id)} stopOpacity=".98" />
              <stop offset="1" stopColor={colorOf(p.id)} stopOpacity=".6" />
            </linearGradient>
          ))}
          <filter id="rv-glow" x="-5%" y="-20%" width="110%" height="140%"><feGaussianBlur stdDeviation="5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        {PHASES.map((p, i) => (
          <g key={p.label}>
            <rect x={xOf(p.from, W)} y={PAD - 4} width={xOf(p.to, W) - xOf(p.from, W)} height={BASE - PAD + 8} className={i % 2 ? "river-phase alt" : "river-phase"} />
            <text x={(xOf(p.from, W) + xOf(p.to, W)) / 2} y={14} textAnchor="middle" className={`river-phase-label${hour >= p.from && hour < p.to ? " on" : ""}`}>{p.label}</text>
          </g>
        ))}
        {TICKS.map((h) => <line key={h} x1={xOf(h, W)} x2={xOf(h, W)} y1={PAD - 4} y2={BASE + 4} className="river-grid" />)}
        <g>{paths.map((p) => <path key={p.id} d={p.d} fill={`url(#rv-${p.id})`} className={`river-band${lit === p.id ? " on" : ""}`} filter={lit === p.id ? "url(#rv-glow)" : undefined} />)}</g>
        <g className="river-labels" pointerEvents="none">{labels.map((l) => {
          const n = NOTE_BY_ID.get(l.id);
          if (!n) return null;
          // The icon is its own text so it can be recoloured like everywhere else; the pair stays centred on the band.
          const fs = l.t < 18 ? 10.5 : 12.5;
          const x0 = l.x - (fs * 1.3 + n.name.length * fs * 0.52) / 2;
          return (
            <g key={l.id} opacity={lit && lit !== l.id ? 0.3 : 1} fontSize={fs}>
              <text x={x0 + fs * 0.55} y={l.y} textAnchor="middle" dominantBaseline="central" style={{ filter: noteIconFilter(n) }}>{noteIcon(n)}</text>
              <text x={x0 + fs * 1.3} y={l.y} dominantBaseline="central">{n.name}</text>
            </g>
          );
        })}</g>
        {TICKS.map((h) => <text key={h} x={Math.min(Math.max(xOf(h, W), 18), W - 16)} y={H - 6} textAnchor="middle" className="river-tick">{tickLabel(h)}</text>)}
        {hover && <line x1={xOf(hover.h, W)} x2={xOf(hover.h, W)} y1={PAD - 4} y2={BASE + 4} className="river-hover" />}
        <line x1={cx} x2={cx} y1={PAD - 6} y2={BASE + 6} className="river-now" />
        <circle cx={cx} cy={BASE + 6} r="5" className="river-now-dot" />
      </svg>
      {hover && tipNote && (
        <div className="river-tip" style={{ left: Math.min(hover.x + 16, (wrap.current?.clientWidth ?? 600) - 236), top: Math.max(0, hover.y - 80), "--c": colorOf(tipNote.id) } as React.CSSProperties}>
          <b><NoteIcon n={tipNote} />{tipNote.name}</b>
          <small>{tipNote.position} note{doses?.[tipNote.id] != null && ` · ${doses[tipNote.id].toFixed(1)}% of the formula`}</small>
          <div className="river-tip-row"><span>At {tickText(hover.h)}</span><b>{Math.round(shareAt(tipNote.id, hover.h) * 100)}% of the scent</b></div>
          <div className="river-tip-bar"><i style={{ width: `${Math.round(shareAt(tipNote.id, hover.h) * 100)}%` }} /></div>
          <div className="river-tip-row"><span>Perceptible for</span><b>{lasts(tipNote.id)}</b></div>
          {actions && <small className="muted">Click the stream to adjust it</small>}
        </div>
      )}
      {focusNote && actions && (
        <div className="river-focus" style={{ "--c": colorOf(focusNote.id) } as React.CSSProperties} role="group" aria-label={`Adjust ${focusNote.name}`}>
          <NoteIcon n={focusNote} big />
          <span className="river-focus-text"><b>{focusNote.name}</b><small>{doses?.[focusNote.id] != null ? `${doses[focusNote.id].toFixed(1)}% of the formula` : focusNote.position} · perceptible for {lasts(focusNote.id)}</small></span>
          <button type="button" className="btn small" onClick={() => actions.onDose(focusNote.id, 1 / 1.25)} title="Use 20% less">− Softer</button>
          <button type="button" className="btn small" onClick={() => actions.onDose(focusNote.id, 1.25)} title="Use 25% more">+ Stronger</button>
          <button type="button" className="btn small ghost" onClick={() => { actions.onRemove(focusNote.id); setFocus(null); }}>Remove</button>
          <button type="button" className="icon-btn" aria-label="Close" onClick={() => setFocus(null)}>×</button>
        </div>
      )}
      <div className="river-legend" aria-label="Notes, from first to fade to longest lasting">
        {legend.map((s) => {
          const n = NOTE_BY_ID.get(s.noteId);
          if (!n) return null;
          const gone = (sim.lastsFor[n.id] ?? 0) < hour;
          return (
            <button key={n.id} type="button" className={`legend-chip${focus === n.id ? " on" : ""}${gone ? " gone" : ""}`} style={{ "--c": colorOf(n.id) } as React.CSSProperties}
              aria-pressed={focus === n.id} onMouseEnter={() => setLegendHover(n.id)} onMouseLeave={() => setLegendHover(null)} onFocus={() => setLegendHover(n.id)} onBlur={() => setLegendHover(null)}
              onClick={() => setFocus(focus === n.id ? null : n.id)}>
              <i /><NoteIcon n={n} />{n.name}<small>{lasts(n.id)}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A large, keyboard-friendly time scrubber aligned with the river, with phase shortcuts. */
export function TimeScrubber({ hour, onHour }: { hour: number; onHour: (h: number) => void }) {
  const pos = timeX(hour);
  return (
    <div className="scrubber">
      <div className="scrub-phases">
        {PHASES.map((p) => {
          const on = hour >= p.from && (hour < p.to || (p.to === 24 && hour <= 24));
          return (
            <button key={p.label} type="button" className={on ? "on" : ""} style={{ left: `${timeX(p.from) * 100}%`, width: `${(timeX(p.to) - timeX(p.from)) * 100}%` }} onClick={() => onHour(p.from === 0 ? 0.1 : p.from + (p.to - p.from) * 0.3)}>{p.label}</button>
          );
        })}
      </div>
      <div className="scrub-track" style={{ "--pos": `${pos * 100}%` } as React.CSSProperties}>
        <div className="scrub-fill" />
        <input type="range" min="0" max="1000" step="1" value={Math.round(pos * 1000)} aria-label="Time after spraying"
          aria-valuetext={hour < 1 ? `${Math.round(hour * 60)} minutes` : `${hour.toFixed(1)} hours`} onChange={(e) => onHour(timeH(+e.target.value / 1000))} />
      </div>
    </div>
  );
}

/** A live particle aura around a wearer. Radius follows modelled sillage, colours follow what remains at this hour. */
export function SillageAura({ sim, hour }: { sim: Simulation; hour: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const state = useRef({ radius: 0, palette: [] as { color: string; share: number }[] });
  const metres = interp(sim, sim.sillageM, hour);

  useEffect(() => {
    state.current.radius = metres;
    state.current.palette = scentAt(sim, hour).slice(0, 7).map((s) => ({ color: colorOf(s.noteId), share: s.share }));
  }, [sim, hour, metres]);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    type P = { a: number; d: number; s: number; size: number; pick: number; life: number };
    const parts: P[] = Array.from({ length: 260 }, () => ({ a: Math.random() * 6.283, d: Math.random(), s: 0.0007 + Math.random() * 0.002, size: 0.8 + Math.random() * 2.6, pick: Math.random(), life: Math.random() * 6.283 }));
    let raf = 0;
    let shown = 0;
    const draw = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const W = c.clientWidth, H = c.clientHeight;
      if (c.width !== W * dpr) { c.width = W * dpr; c.height = H * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2;
      const unit = Math.min(W, H) / 2 / 5.4; // pixels per metre
      shown += (state.current.radius - shown) * 0.07;
      const R = Math.max(0, shown) * unit;
      ctx.lineWidth = 1;
      ctx.font = "11px Manrope Variable, sans-serif";
      const css = getComputedStyle(c);
      const gridC = css.getPropertyValue("--viz-grid").trim() || "rgba(255,255,255,.09)";
      const textC = css.getPropertyValue("--viz-text").trim() || "rgba(200,191,209,.6)";
      for (const m of [1, 2, 3, 4, 5]) {
        ctx.strokeStyle = gridC;
        ctx.setLineDash([3, 5]);
        ctx.beginPath(); ctx.arc(cx, cy, m * unit, 0, 6.283); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = textC;
        ctx.fillText(`${m} m`, cx + m * unit * 0.72, cy - m * unit * 0.72);
      }
      const pal = state.current.palette;
      if (pal.length && R > 0) {
        const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, R);
        grad.addColorStop(0, pal[0].color + "88");
        grad.addColorStop(0.75, pal[Math.min(1, pal.length - 1)].color + "33");
        grad.addColorStop(1, pal[0].color + "00");
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.283); ctx.fill();
        for (const p of parts) {
          p.d += p.s; p.a += 0.0016 * Math.sin(p.life); p.life += 0.01;
          if (p.d > 1) { p.d = 0; p.a = Math.random() * 6.283; }
          let acc = 0; let color = pal[0].color;
          for (const x of pal) { acc += x.share; if (p.pick <= acc) { color = x.color; break; } }
          const rr = p.d * R;
          ctx.globalAlpha = Math.pow(1 - p.d, 0.55) * 0.95;
          ctx.fillStyle = color;
          ctx.beginPath(); ctx.arc(cx + Math.cos(p.a) * rr, cy + Math.sin(p.a) * rr, p.size, 0, 6.283); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      // Wearer seen from above.
      ctx.fillStyle = css.getPropertyValue("--text").trim() || "#fff6e6";
      ctx.beginPath(); ctx.ellipse(cx, cy, 15, 8, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = css.getPropertyValue("--bg").trim() || "#120d1a";
      ctx.beginPath(); ctx.arc(cx, cy, 5, 0, 6.283); ctx.fill();
      if (visible) raf = reduce ? window.setTimeout(draw, 300) : requestAnimationFrame(draw);
    };
    // Off-screen, the aura costs nothing.
    let visible = false;
    const io = new IntersectionObserver(([e]) => {
      const was = visible;
      visible = e.isIntersecting;
      if (visible && !was) draw();
    });
    io.observe(c);
    return () => {
      visible = false;
      io.disconnect();
      cancelAnimationFrame(raf);
      clearTimeout(raf);
    };
  }, []);

  return (
    <figure className="viz-figure">
      <canvas ref={canvas} className="aura" role="img" aria-label={`Top-down view: scent reaches about ${metres.toFixed(1)} metres from the wearer at this hour.`} />
      <figcaption><b>{metres.toFixed(1)} m</b> scent trail at this hour, seen from above</figcaption>
    </figure>
  );
}

/** Side-on sound-wave style pulses leaving the wrist; their reach shows projection. */
export function ProjectionWaves({ sim, hour }: { sim: Simulation; hour: number }) {
  const cm = interp(sim, sim.projectionCm, hour);
  const W = 420, H = 220, X0 = 58, CM = (W - X0 - 20) / 120;
  const reach = cm * CM;
  const ry = Math.min(reach, H / 2 - 30);
  const label = cm > 70 ? "Noticed across a table" : cm > 35 ? "Noticed at conversation distance" : cm > 10 ? "Noticed in a close moment" : cm > 0 ? "A skin scent" : "Gone";
  return (
    <figure className="viz-figure">
      <svg viewBox={`0 0 ${W} ${H}`} className="waves" role="img" aria-label={`Projection about ${Math.round(cm)} centimetres. ${label}.`}>
        <defs>
          <radialGradient id="wv"><stop offset="0" stopColor="#e5b567" stopOpacity=".55" /><stop offset="1" stopColor="#e5b567" stopOpacity="0" /></radialGradient>
          <clipPath id="wvclip"><rect x={X0} y="0" width={W} height={H} /></clipPath>
        </defs>
        {[30, 60, 90, 120].map((v) => (
          <g key={v}>
            <line x1={X0 + v * CM} x2={X0 + v * CM} y1={22} y2={H - 26} className="viz-grid" strokeDasharray="3 5" />
            <text x={X0 + v * CM} y={H - 8} fontSize="11" className="viz-text" textAnchor="middle">{v} cm</text>
          </g>
        ))}
        <g clipPath="url(#wvclip)">
          <ellipse cx={X0} cy={H / 2 - 8} rx={Math.max(reach, 1)} ry={Math.max(ry, 1)} fill="url(#wv)" />
          {reach > 2 && [0, 1, 2, 3, 4].map((i) => (
            <ellipse key={i} cx={X0} cy={H / 2 - 8} rx={reach} ry={ry} fill="none" stroke="#e5b567" strokeWidth="1.4" className="wave" style={{ animationDelay: `${i * 0.6}s`, transformOrigin: `${X0}px ${H / 2 - 8}px` }} />
          ))}
        </g>
        <rect x="0" y={H / 2 - 22} width={X0 - 4} height="28" rx="14" fill="#e6d3c0" />
        <circle cx={X0} cy={H / 2 - 8} r="4" fill="#120d1a" stroke="#e6d3c0" />
      </svg>
      <figcaption><b>{Math.round(cm)} cm</b> {label.toLowerCase()}</figcaption>
    </figure>
  );
}

export function facetsAt(sim: Simulation, hour: number): FacetVector {
  const out = Object.fromEntries(FACETS.map((f) => [f, 0])) as FacetVector;
  for (const s of scentAt(sim, hour)) {
    const n = NOTE_BY_ID.get(s.noteId);
    if (!n) continue;
    for (const f of FACETS) out[f] += n.facets[f] * s.share;
  }
  return out;
}

export function FacetRadar({ facets, size = 340 }: { facets: FacetVector; size?: number }) {
  const C = 170, R = 118;
  const max = Math.max(...Object.values(facets), 0.3);
  const pt = (i: number, v: number) => {
    const a = (i / FACETS.length) * 2 * Math.PI - Math.PI / 2;
    return [C + Math.cos(a) * R * v, C + Math.sin(a) * R * v] as const;
  };
  const shape = FACETS.map((f, i) => pt(i, facets[f] / max).join(",")).join(" ");
  return (
    <svg viewBox="0 0 340 340" width="100%" style={{ maxWidth: size }} role="img" aria-label={`Scent facets: ${FACETS.filter((f) => facets[f] / max > 0.5).join(", ")}`}>
      {[0.25, 0.5, 0.75, 1].map((r) => <polygon key={r} points={FACETS.map((_, i) => pt(i, r).join(",")).join(" ")} fill="none" className="viz-grid" />)}
      <polygon points={shape} fill="#e5b56755" stroke="#e5b567" strokeWidth="2" style={{ transition: "all .4s" }} />
      {FACETS.map((f, i) => {
        const [x, y] = pt(i, 1.17);
        return (
          <g key={f}>
            <circle cx={pt(i, facets[f] / max)[0]} cy={pt(i, facets[f] / max)[1]} r="3.5" fill={facetColor(f)} />
            <text x={x} y={y} fontSize="11" className="viz-text" textAnchor="middle" dominantBaseline="middle">{f}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** How long each note stays perceptible. Bars fade toward the end of each note's life. */
export function NoteLifetimes({ sim, items, hour }: { sim: Simulation; items: FormulaItem[]; hour: number }) {
  const rows = items.filter((i) => NOTE_BY_ID.has(i.noteId)).map((i) => ({ id: i.noteId, life: sim.lastsFor[i.noteId] ?? 0 })).sort((a, b) => a.life - b.life);
  return (
    <div className="lifetimes">
      {rows.map(({ id, life }) => {
        const n = note(id);
        const alive = life > hour;
        const c = colorOf(id);
        return (
          <div key={id} className={`life-row${alive ? "" : " gone"}`}>
            <span className="life-name"><NoteIcon n={n} />{n.name}</span>
            <div className="life-track">
              <div className="life-bar" style={{ width: `${Math.max(0.5, timeX(life) * 100)}%`, background: `linear-gradient(90deg, ${c}, ${c}22)` }} />
              <div className="life-cursor" style={{ left: `${timeX(hour) * 100}%` }} />
            </div>
            <span className="life-val">{life >= HOURS ? "24 h+" : fmtDuration(life)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Pyramid({ items }: { items: FormulaItem[] }) {
  const known = items.filter((i) => NOTE_BY_ID.has(i.noteId));
  const p = analyse(known).pyramid;
  const row = (pos: Position) => known.filter((i) => note(i.noteId).position === pos).sort((a, b) => b.parts - a.parts);
  const tiers: { pos: Position; label: string; w: number }[] = [
    { pos: "top", label: "Top", w: 44 }, { pos: "heart", label: "Heart", w: 72 }, { pos: "base", label: "Base", w: 100 },
  ];
  return (
    <div className="pyramid">
      {tiers.map((t) => (
        <div key={t.pos} className="tier" style={{ width: `${t.w}%` }}>
          <div className="tier-head"><b>{t.label}</b><span>{p[t.pos].toFixed(0)}%</span></div>
          <div className="tier-notes">{row(t.pos).map((i) => <span key={i.noteId}><NoteIcon n={note(i.noteId)} />{note(i.noteId).name}</span>)}{!row(t.pos).length && <span className="muted">Empty</span>}</div>
        </div>
      ))}
    </div>
  );
}

export function ScoreRing({ value, label, size = 86 }: { value: number; label: string; size?: number }) {
  const r = 34, c = 2 * Math.PI * r;
  return (
    <div className="ring">
      <svg viewBox="0 0 86 86" width={size} height={size} aria-hidden="true">
        <circle cx="43" cy="43" r={r} fill="none" className="ring-track" strokeWidth="6" />
        <circle cx="43" cy="43" r={r} fill="none" stroke="#e5b567" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(value / 100) * c} ${c}`} transform="rotate(-90 43 43)" style={{ transition: "stroke-dasharray .5s" }} />
        <text x="43" y="49" textAnchor="middle" fontSize="20" className="ring-val" fontWeight="600">{value}</text>
      </svg>
      <span>{label}</span>
    </div>
  );
}

export function MetricBars({ note: n }: { note: { sillage: number; projection: number; longevity: number; strength: number } }) {
  const rows: [string, number][] = [["Sillage", n.sillage], ["Projection", n.projection], ["Longevity", n.longevity], ["Strength", n.strength]];
  return (
    <div className="metric-bars">
      {rows.map(([k, v]) => (
        <div key={k}><span>{k}</span><div className="bar"><div style={{ width: `${v * 10}%` }} /></div><b>{v.toFixed(v % 1 ? 1 : 0)}</b></div>
      ))}
    </div>
  );
}

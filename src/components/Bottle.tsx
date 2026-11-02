import { useId } from "react";

type Branding = { name: string; tagline?: string; bottle: string; packaging?: string; glass: string; accent: string; label: string };

const SHAPES: Record<string, { body: string; neckY: number; capX: number; capW: number; capH: number; capR: number; labelY: number; labelW: number; level: number }> = {
  column: { body: "M78 80 h44 a6 6 0 0 1 6 6 v190 a10 10 0 0 1 -10 10 h-36 a10 10 0 0 1 -10 -10 v-190 a6 6 0 0 1 6 -6z", neckY: 66, capX: 84, capW: 32, capH: 42, capR: 3, labelY: 170, labelW: 50, level: 112 },
  flacon: { body: "M84 84 h32 c30 12 44 40 44 84 v62 c0 34 -18 56 -48 56 h-24 c-30 0 -48 -22 -48 -56 v-62 c0 -44 14 -72 44 -84z", neckY: 70, capX: 80, capW: 40, capH: 40, capR: 20, labelY: 180, labelW: 86, level: 124 },
  apothecary: { body: "M72 92 l20 -12 h16 l20 12 h6 a10 10 0 0 1 10 10 v174 a10 10 0 0 1 -10 10 h-68 a10 10 0 0 1 -10 -10 v-174 a10 10 0 0 1 10 -10z", neckY: 66, capX: 82, capW: 36, capH: 30, capR: 15, labelY: 176, labelW: 78, level: 118 },
  orb: { body: "M100 82 a102 102 0 0 1 0 204 a102 102 0 0 1 0 -204z", neckY: 68, capX: 86, capW: 28, capH: 30, capR: 14, labelY: 186, labelW: 110, level: 130 },
  facet: { body: "M78 84 h44 l46 62 v70 l-46 70 h-44 l-46 -70 v-70z", neckY: 70, capX: 76, capW: 48, capH: 38, capR: 1, labelY: 184, labelW: 80, level: 126 },
  travel: { body: "M86 84 h28 a6 6 0 0 1 6 6 v190 a6 6 0 0 1 -6 6 h-28 a6 6 0 0 1 -6 -6 v-190 a6 6 0 0 1 6 -6z", neckY: 66, capX: 84, capW: 32, capH: 58, capR: 8, labelY: 180, labelW: 34, level: 110 },
};

const words = (s: string) => s.trim().split(/\s+/).slice(0, 3);

export function Bottle({ branding, fill = 1, width = 200 }: { branding: Branding; fill?: number; width?: number }) {
  const uid = useId().replace(/:/g, "");
  const s = SHAPES[branding.bottle] ?? SHAPES.column;
  const top = s.level + (286 - s.level) * (1 - Math.max(0, Math.min(1, fill)));
  const nameWords = words(branding.name || "Rhythm");
  return (
    <svg viewBox="0 0 200 310" width={width} className="bottle" role="img" aria-label={`${branding.bottle} bottle for ${branding.name || "your fragrance"}`}>
      <defs>
        <clipPath id={`c${uid}`}><path d={s.body} /></clipPath>
        <linearGradient id={`l${uid}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={branding.glass} stopOpacity="0.75" /><stop offset="1" stopColor={branding.glass} stopOpacity="1" /></linearGradient>
        <linearGradient id={`m${uid}`} x1="0" x2="1"><stop offset="0" stopColor={branding.accent} /><stop offset=".5" stopColor="#fff" stopOpacity=".9" /><stop offset="1" stopColor={branding.accent} /></linearGradient>
        <linearGradient id={`s${uid}`} x1="0" x2="1"><stop offset="0" stopColor="#fff" stopOpacity=".38" /><stop offset=".22" stopColor="#fff" stopOpacity="0" /><stop offset=".9" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#fff" stopOpacity=".2" /></linearGradient>
      </defs>
      <ellipse cx="100" cy="294" rx="70" ry="8" fill={branding.glass} opacity=".25" />
      <rect x={s.capX} y={s.neckY - s.capH} width={s.capW} height={s.capH} rx={s.capR} fill={`url(#m${uid})`} />
      <rect x="90" y={s.neckY} width="20" height="20" fill={branding.accent} opacity=".75" />
      <path d={s.body} fill="#ffffff" fillOpacity=".09" stroke="#ffffff" strokeOpacity=".4" />
      <g clipPath={`url(#c${uid})`}>
        <rect x="0" y={top} width="200" height={310 - top} fill={`url(#l${uid})`} style={{ transition: "y .6s ease" }} />
        <rect x="0" y="60" width="200" height="240" fill={`url(#s${uid})`} />
      </g>
      <g textAnchor="middle" fill={branding.label}>
        <rect x={100 - s.labelW / 2} y={s.labelY - 24} width={s.labelW} height={18 + nameWords.length * 15} rx="2" fill={branding.accent} opacity=".94" />
        {nameWords.map((w, i) => (
          <text key={i} x="100" y={s.labelY - 8 + i * 15} fontFamily="Cormorant Garamond, serif" fontSize={s.labelW < 50 ? 8 : 13} fontWeight="600">{w}</text>
        ))}
      </g>
    </svg>
  );
}

export function Box({ branding, typeLabel = "Eau de Parfum", width = 170 }: { branding: Branding; typeLabel?: string; width?: number }) {
  const uid = useId().replace(/:/g, "");
  const pack = branding.packaging ?? "matte";
  const base = pack === "kraft" ? "#b08a5e" : branding.glass;
  const ink = pack === "kraft" ? "#2a1e12" : branding.accent;
  const name = branding.name || "Rhythm";
  return (
    <svg viewBox="0 0 200 270" width={width} className="bottle" role="img" aria-label={`${pack} packaging for ${name}`}>
      <defs>
        <linearGradient id={`b${uid}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={base} /><stop offset="1" stopColor={base} stopOpacity=".62" /></linearGradient>
      </defs>
      <path d="M152 28 l26 -14 v222 l-26 18z" fill={base} opacity=".5" />
      <path d="M26 28 l26 -14 h126 l-26 14z" fill={base} opacity=".8" />
      <rect x="26" y="28" width="126" height="226" fill="#120d1a" />
      <rect x="26" y="28" width="126" height="226" fill={`url(#b${uid})`} />
      {pack === "foil" && <rect x="26" y="168" width="126" height="26" fill={ink} />}
      {pack === "arch" && [0, 1, 2, 3].map((i) => <path key={i} d={`M${40 + i * 8} 220 V${108 + i * 12} a${49 - i * 8} ${49 - i * 8} 0 0 1 ${98 - i * 16} 0 V220`} fill="none" stroke={ink} strokeWidth="1" />)}
      {pack === "matte" && <rect x="36" y="38" width="106" height="206" fill="none" stroke={ink} strokeOpacity=".6" />}
      {pack === "kraft" && <circle cx="89" cy="104" r="34" fill="none" stroke={ink} strokeWidth="1.5" strokeDasharray="3 3" />}
      <g textAnchor="middle" fill={ink}>
        {words(name).map((w, i) => <text key={i} x="89" y={100 + i * 22} fontFamily="Cormorant Garamond, serif" fontSize="20" fontWeight="600">{w}</text>)}
        <text x="89" y="232" fontSize="7" letterSpacing="3" fontFamily="Manrope Variable, sans-serif">{typeLabel.toUpperCase()}</text>
      </g>
    </svg>
  );
}

import { useId } from "react";
import { mixColors } from "../../shared/engine/brand";

type Branding = { name: string; tagline?: string; bottle: string; packaging?: string; cap?: string; finish?: string; labelStyle?: string; glass: string; accent: string; label: string };

type Shape = { body: string; neckY: number; capX: number; capW: number; capH: number; capR: number; labelY: number; labelW: number; level: number; bottom?: number };

const SHAPES: Record<string, Shape> = {
  column: { body: "M78 80 h44 a6 6 0 0 1 6 6 v190 a10 10 0 0 1 -10 10 h-36 a10 10 0 0 1 -10 -10 v-190 a6 6 0 0 1 6 -6z", neckY: 66, capX: 84, capW: 32, capH: 42, capR: 3, labelY: 170, labelW: 50, level: 112 },
  flacon: { body: "M84 84 h32 c30 12 44 40 44 84 v62 c0 34 -18 56 -48 56 h-24 c-30 0 -48 -22 -48 -56 v-62 c0 -44 14 -72 44 -84z", neckY: 70, capX: 80, capW: 40, capH: 40, capR: 20, labelY: 180, labelW: 86, level: 124 },
  apothecary: { body: "M72 92 l20 -12 h16 l20 12 h6 a10 10 0 0 1 10 10 v174 a10 10 0 0 1 -10 10 h-68 a10 10 0 0 1 -10 -10 v-174 a10 10 0 0 1 10 -10z", neckY: 66, capX: 82, capW: 36, capH: 30, capR: 15, labelY: 176, labelW: 78, level: 118 },
  orb: { body: "M100 82 a102 102 0 0 1 0 204 a102 102 0 0 1 0 -204z", neckY: 68, capX: 86, capW: 28, capH: 30, capR: 14, labelY: 186, labelW: 110, level: 130 },
  facet: { body: "M78 84 h44 l46 62 v70 l-46 70 h-44 l-46 -70 v-70z", neckY: 70, capX: 76, capW: 48, capH: 38, capR: 1, labelY: 184, labelW: 80, level: 126 },
  travel: { body: "M86 84 h28 a6 6 0 0 1 6 6 v190 a6 6 0 0 1 -6 6 h-28 a6 6 0 0 1 -6 -6 v-190 a6 6 0 0 1 6 -6z", neckY: 66, capX: 84, capW: 32, capH: 58, capR: 8, labelY: 180, labelW: 34, level: 110 },
  obelisk: { body: "M84 82 h32 l16 194 a10 10 0 0 1 -10 10 h-44 a10 10 0 0 1 -10 -10z", neckY: 66, capX: 86, capW: 28, capH: 46, capR: 2, labelY: 196, labelW: 54, level: 114 },
  bell: { body: "M90 82 h20 c4 40 58 70 58 150 v44 a10 10 0 0 1 -10 10 h-116 a10 10 0 0 1 -10 -10 v-44 c0 -80 54 -110 58 -150z", neckY: 66, capX: 84, capW: 32, capH: 36, capR: 16, labelY: 214, labelW: 100, level: 132 },
  tablet: { body: "M40 120 h120 a14 14 0 0 1 14 14 v138 a14 14 0 0 1 -14 14 h-120 a14 14 0 0 1 -14 -14 v-138 a14 14 0 0 1 14 -14z", neckY: 100, capX: 78, capW: 44, capH: 30, capR: 4, labelY: 204, labelW: 112, level: 142 },
  teardrop: { body: "M100 84 c30 50 66 92 66 138 a66 66 0 0 1 -132 0 c0 -46 36 -88 66 -138z", neckY: 70, capX: 86, capW: 28, capH: 36, capR: 14, labelY: 222, labelW: 92, level: 132 },
  hexagon: { body: "M100 84 l64 36 v130 l-64 36 l-64 -36 v-130z", neckY: 66, capX: 84, capW: 32, capH: 34, capR: 2, labelY: 192, labelW: 96, level: 122 },
  amphora: { body: "M86 84 h28 v14 c0 14 40 26 40 80 c0 50 -18 80 -22 98 a10 10 0 0 1 -10 10 h-44 a10 10 0 0 1 -10 -10 c-4 -18 -22 -48 -22 -98 c0 -54 40 -66 40 -80z", neckY: 66, capX: 84, capW: 32, capH: 34, capR: 16, labelY: 192, labelW: 82, level: 124 },
  cube: { body: "M50 110 h100 a8 8 0 0 1 8 8 v160 a8 8 0 0 1 -8 8 h-100 a8 8 0 0 1 -8 -8 v-160 a8 8 0 0 1 8 -8z", neckY: 90, capX: 72, capW: 56, capH: 44, capR: 3, labelY: 202, labelW: 92, level: 132 },
  pebble: { body: "M100 118 c50 0 72 42 72 88 c0 50 -30 80 -72 80 c-42 0 -72 -30 -72 -80 c0 -46 22 -88 72 -88z", neckY: 98, capX: 82, capW: 36, capH: 30, capR: 15, labelY: 210, labelW: 100, level: 142 },
};

const words = (s: string) => s.trim().split(/\s+/).slice(0, 3);

/** The cap sits on the neck; "classic" keeps each bottle's own proportions. */
function Cap({ kind, s, fill }: { kind: string; s: Shape; fill: string }) {
  const y = s.neckY;
  switch (kind) {
    case "sphere": return <circle cx="100" cy={y - 20} r="21" fill={fill} />;
    case "cube": return <rect x="78" y={y - 42} width="44" height="42" rx="3" fill={fill} />;
    case "tower": return <path d={`M88 ${y} v-56 l12 -10 l12 10 v56z`} fill={fill} />;
    case "gem": return <path d={`M80 ${y - 30} l20 -22 l20 22 l-20 30z`} fill={fill} stroke="#fff" strokeOpacity=".35" />;
    case "disc": return <rect x="66" y={y - 14} width="68" height="14" rx="7" fill={fill} />;
    case "stone": return <path d={`M78 ${y} c-6 -20 6 -38 24 -38 c18 0 28 16 22 38z`} fill={fill} />;
    case "bulb": return (
      <g>
        <rect x="92" y={y - 12} width="16" height="12" fill={fill} />
        <path d={`M108 ${y - 6} c20 0 22 -8 30 -8`} fill="none" stroke={fill} strokeWidth="3" />
        <ellipse cx="152" cy={y - 12} rx="16" ry="20" fill={fill} />
        <path d={`M152 ${y + 8} v18`} stroke={fill} strokeWidth="2" />
        <path d={`M146 ${y + 26} h12 l-2 14 h-8z`} fill={fill} />
      </g>
    );
    default: return <rect x={s.capX} y={y - s.capH} width={s.capW} height={s.capH} rx={s.capR} fill={fill} />;
  }
}

export function Bottle({ branding, fill = 1, width = 200 }: { branding: Branding; fill?: number; width?: number }) {
  const uid = useId().replace(/:/g, "");
  const s = SHAPES[branding.bottle] ?? SHAPES.column;
  const finish = branding.finish ?? "clear";
  const labelStyle = branding.labelStyle ?? "plate";
  const top = s.level + (286 - s.level) * (1 - Math.max(0, Math.min(1, fill)));
  const nameWords = words(branding.name || "Rhythm");
  const small = s.labelW < 50;
  const opaque = finish === "lacquered";
  const liquidLow = finish === "ombre" ? branding.accent : branding.glass;
  return (
    <svg viewBox="0 0 200 310" width={width} className="bottle" role="img" aria-label={`${branding.bottle} bottle for ${branding.name || "your fragrance"}`}>
      <defs>
        <clipPath id={`c${uid}`}><path d={s.body} /></clipPath>
        <linearGradient id={`l${uid}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={branding.glass} stopOpacity={finish === "ombre" ? 1 : 0.75} /><stop offset="1" stopColor={liquidLow} stopOpacity="1" /></linearGradient>
        <linearGradient id={`m${uid}`} x1="0" x2="1"><stop offset="0" stopColor={branding.accent} /><stop offset=".5" stopColor="#fff" stopOpacity=".9" /><stop offset="1" stopColor={branding.accent} /></linearGradient>
        <linearGradient id={`s${uid}`} x1="0" x2="1"><stop offset="0" stopColor="#fff" stopOpacity=".38" /><stop offset=".22" stopColor="#fff" stopOpacity="0" /><stop offset=".9" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#fff" stopOpacity=".2" /></linearGradient>
        <linearGradient id={`i${uid}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff9ad5" /><stop offset=".35" stopColor="#8fe3ff" /><stop offset=".7" stopColor="#ffe08a" /><stop offset="1" stopColor="#c69bff" /></linearGradient>
      </defs>
      <ellipse cx="100" cy="294" rx="70" ry="8" fill={branding.glass} opacity=".25" />
      <Cap kind={branding.cap ?? "classic"} s={s} fill={`url(#m${uid})`} />
      <rect x="90" y={s.neckY} width="20" height="20" fill={branding.accent} opacity=".75" />
      <path d={s.body} fill={opaque ? branding.glass : "#ffffff"} fillOpacity={opaque ? 1 : finish === "frosted" ? 0.22 : 0.09} stroke="#ffffff" strokeOpacity=".4" />
      <g clipPath={`url(#c${uid})`}>
        {!opaque && <rect x="0" y={top} width="200" height={310 - top} fill={`url(#l${uid})`} opacity={finish === "frosted" ? 0.7 : 1} style={{ transition: "y .6s ease" }} />}
        {finish === "frosted" && <rect x="0" y="60" width="200" height="240" fill="#ffffff" opacity=".18" />}
        {finish === "smoked" && <rect x="0" y="60" width="200" height="240" fill="#0b0810" opacity=".42" />}
        {finish === "iridescent" && <rect x="0" y="60" width="200" height="240" fill={`url(#i${uid})`} opacity=".32" />}
        {opaque && <rect x="0" y={top} width="200" height="2" fill="#fff" opacity=".35" />}
        <rect x="0" y="60" width="200" height="240" fill={`url(#s${uid})`} />
      </g>
      <g textAnchor="middle" fill={branding.label}>
        {labelStyle === "plate" && <rect x={100 - s.labelW / 2} y={s.labelY - 24} width={s.labelW} height={18 + nameWords.length * 15} rx="2" fill={branding.accent} opacity=".94" />}
        {labelStyle === "band" && <rect x="0" y={s.labelY - 22} width="200" height={14 + nameWords.length * 15} fill={branding.accent} opacity=".94" clipPath={`url(#c${uid})`} />}
        {labelStyle === "seal" && <circle cx="100" cy={s.labelY - 6 + (nameWords.length - 1) * 7} r={Math.min(s.labelW / 2, 22 + nameWords.length * 6)} fill={branding.accent} stroke={branding.label} strokeOpacity=".4" opacity=".95" />}
        {nameWords.map((w, i) => (
          <text key={i} x="100" y={s.labelY - 8 + i * 15} fontFamily="Cormorant Garamond, serif" fontSize={small ? 8 : labelStyle === "seal" ? 11 : 13} fontWeight="600" letterSpacing={labelStyle === "engraved" ? 1.5 : 0} opacity={labelStyle === "engraved" ? 0.85 : 1}>{labelStyle === "engraved" ? w.toUpperCase() : w}</text>
        ))}
      </g>
    </svg>
  );
}

export function Box({ branding, typeLabel = "Eau de Parfum", width = 170 }: { branding: Branding; typeLabel?: string; width?: number }) {
  const uid = useId().replace(/:/g, "");
  const pack = branding.packaging ?? "matte";
  const light = pack === "minimal" || pack === "marble" || pack === "pleated" || pack === "iridescent";
  const base = pack === "kraft" ? "#b08a5e" : pack === "minimal" ? "#f6f3ee" : pack === "marble" ? "#ece8e4" : pack === "pleated" ? "#efe9df" : pack === "iridescent" ? "#e9e4f2"
    : pack === "velvet" || pack === "celestial" ? mixColors([[branding.glass, 1], ["#120d1a", 1.4]])
    : pack === "leather" ? mixColors([[branding.glass, 1], ["#3a2414", 1.6]])
    : pack === "terrazzo" ? "#ede6dc" : branding.glass;
  const ink = pack === "kraft" ? "#2a1e12" : light || pack === "terrazzo" ? (branding.label === "#f4eee6" ? "#14101c" : branding.label) : branding.accent;
  const name = branding.name || "Rhythm";
  const rng = (i: number) => ((Math.sin(i * 12.9898 + name.length * 78.233) * 43758.5453) % 1 + 1) % 1;
  const nameY = pack === "window" ? 66 : pack === "velvet" ? 122 : pack === "minimal" ? 132 : pack === "celestial" ? 150 : pack === "ribbon" ? 96 : 100;
  return (
    <svg viewBox="0 0 200 270" width={width} className="bottle box" role="img" aria-label={`${pack} packaging for ${name}`}>
      <defs>
        <linearGradient id={`b${uid}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={base} /><stop offset="1" stopColor={base} stopOpacity={light || pack === "terrazzo" ? 1 : 0.62} /></linearGradient>
        <linearGradient id={`g${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={branding.accent} /><stop offset="1" stopColor={branding.glass} /></linearGradient>
        <linearGradient id={`h${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffb3d9" /><stop offset=".3" stopColor="#b3e5ff" /><stop offset=".55" stopColor="#d9ffcc" /><stop offset=".8" stopColor="#ffe6b3" /><stop offset="1" stopColor="#e0c3ff" />
        </linearGradient>
        <linearGradient id={`s${uid}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity=".22" /><stop offset=".35" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".18" /></linearGradient>
        <pattern id={`p${uid}`} width="12" height="10" patternUnits="userSpaceOnUse">
          <path d="M0 10 a6 6 0 0 1 12 0 M3 10 a3 3 0 0 1 6 0" fill="none" stroke={ink} strokeOpacity=".55" strokeWidth=".7" />
        </pattern>
        <clipPath id={`k${uid}`}><rect x="26" y="28" width="126" height="226" /></clipPath>
      </defs>
      <ellipse cx="100" cy="258" rx="80" ry="8" fill="#000" opacity=".25" />
      <path d="M152 28 l26 -14 v222 l-26 18z" fill={base} opacity=".5" />
      <path d="M152 28 l26 -14 v222 l-26 18z" fill="#000" opacity=".22" />
      <path d="M26 28 l26 -14 h126 l-26 14z" fill={base} opacity=".85" />
      <path d="M26 28 l26 -14 h126 l-26 14z" fill="#fff" opacity=".12" />
      <rect x="26" y="28" width="126" height="226" fill="#120d1a" />
      <rect x="26" y="28" width="126" height="226" fill={pack === "gradient" ? `url(#g${uid})` : pack === "iridescent" ? `url(#h${uid})` : `url(#b${uid})`} />
      <g clipPath={`url(#k${uid})`}>
        {pack === "foil" && <rect x="26" y="168" width="126" height="26" fill={ink} />}
        {pack === "arch" && [0, 1, 2, 3].map((i) => <path key={i} d={`M${40 + i * 8} 220 V${108 + i * 12} a${49 - i * 8} ${49 - i * 8} 0 0 1 ${98 - i * 16} 0 V220`} fill="none" stroke={ink} strokeWidth="1" />)}
        {pack === "matte" && <rect x="36" y="38" width="106" height="206" fill="none" stroke={ink} strokeOpacity=".6" />}
        {pack === "kraft" && <><circle cx="89" cy="104" r="34" fill="none" stroke={ink} strokeWidth="1.5" strokeDasharray="3 3" /><path d="M26 210 h126" stroke={ink} strokeOpacity=".4" strokeDasharray="2 4" /></>}
        {pack === "marble" && [0, 1, 2, 3, 4].map((i) => <path key={i} d={`M${10 + i * 34} 28 c${20 - i * 6} 40 ${-30 + i * 9} 80 ${10 + i * 4} 120 s${-20 + i * 5} 70 ${6 + i * 3} 110`} fill="none" stroke="#8a8590" strokeOpacity={0.25 + (i % 2) * 0.2} strokeWidth={0.6 + (i % 3) * 0.5} />)}
        {pack === "botanical" && [0, 1, 2].map((i) => (
          <g key={i} stroke={ink} strokeOpacity=".7" fill="none" strokeWidth="1">
            <path d={`M${44 + i * 44} 254 C${40 + i * 44} 200 ${56 + i * 40} 160 ${48 + i * 44} 120`} />
            {[0, 1, 2, 3].map((k) => <path key={k} d={`M${46 + i * 44 + (k % 2 ? 2 : -2)} ${236 - k * 30} q${k % 2 ? 16 : -16} -6 ${k % 2 ? 18 : -18} -20`} />)}
          </g>
        ))}
        {pack === "minimal" && <line x1="70" y1="150" x2="108" y2="150" stroke={ink} strokeWidth=".8" />}
        {pack === "velvet" && <>
          <rect x="32" y="34" width="114" height="214" rx="6" fill="none" stroke={branding.accent} strokeOpacity=".5" />
          <circle cx="89" cy="70" r="16" fill="none" stroke={branding.accent} strokeWidth="1.2" />
          <text x="89" y="76" textAnchor="middle" fontFamily="Cormorant Garamond, serif" fontSize="17" fill={branding.accent}>{name[0]?.toUpperCase()}</text>
        </>}
        {pack === "geometric" && <>
          <circle cx="120" cy="64" r="44" fill={branding.accent} opacity=".85" />
          <rect x="26" y="196" width="64" height="58" fill={branding.label} opacity=".5" />
          <path d="M152 254 L100 254 L152 190z" fill={mixColors([[branding.glass, 1], ["#ffffff", 1]])} opacity=".8" />
        </>}
        {pack === "window" && <path d="M58 226 V140 a31 31 0 0 1 62 0 V226z" fill="#0b0810" stroke={ink} strokeWidth="1.5" />}
        {pack === "window" && <rect x="74" y="160" width="30" height="62" rx="4" fill={branding.glass} opacity=".85" />}
        {pack === "ribbon" && <>
          <rect x="80" y="28" width="18" height="226" fill={branding.accent} opacity=".92" />
          <rect x="26" y="172" width="126" height="18" fill={branding.accent} opacity=".92" />
          <rect x="80" y="28" width="5" height="226" fill="#fff" opacity=".18" />
          <path d="M89 181 c-22 -22 -36 -6 -24 6 c8 8 18 0 24 -6z M89 181 c22 -22 36 -6 24 6 c-8 8 -18 0 -24 -6z" fill={branding.accent} stroke="#000" strokeOpacity=".2" />
          <path d="M86 186 l-10 26 l8 -4 l4 8z M92 186 l10 26 l-8 -4 l-4 8z" fill={branding.accent} />
          <circle cx="89" cy="181" r="5" fill={mixColors([[branding.accent, 2], ["#000", 1]])} />
        </>}
        {pack === "celestial" && <>
          {Array.from({ length: 34 }, (_, i) => <circle key={i} cx={30 + rng(i) * 118} cy={32 + rng(i + 50) * 218} r={0.5 + rng(i + 99) * 1.4} fill={branding.accent} opacity={0.4 + rng(i + 7) * 0.6} />)}
          <path d="M106 66 a24 24 0 1 0 22 32 a19 19 0 1 1 -22 -32z" fill={branding.accent} />
          {[[52, 92], [120, 210], [60, 220]].map(([x, y], i) => <path key={i} d={`M${x} ${y - 6} l1.6 4.4 l4.4 1.6 l-4.4 1.6 l-1.6 4.4 l-1.6 -4.4 l-4.4 -1.6 l4.4 -1.6z`} fill={branding.accent} />)}
        </>}
        {pack === "waves" && <rect x="26" y="150" width="126" height="104" fill={`url(#p${uid})`} />}
        {pack === "terrazzo" && Array.from({ length: 46 }, (_, i) => {
          const colors = [branding.glass, branding.accent, branding.label, mixColors([[branding.glass, 1], ["#ffffff", 1]])];
          const x = 28 + rng(i) * 122, y = 30 + rng(i + 31) * 222, r = 1.5 + rng(i + 63) * 5;
          return <path key={i} d={`M${x} ${y - r} l${r * 0.9} ${r * 0.6} l${-r * 0.3} ${r} l${-r * 1.1} ${-r * 0.2}z`} fill={colors[i % 4]} opacity=".85" transform={`rotate(${rng(i + 9) * 360} ${x} ${y})`} />;
        })}
        {pack === "pinstripe" && <>
          {Array.from({ length: 16 }, (_, i) => <line key={i} x1={30 + i * 8} x2={30 + i * 8} y1="28" y2="254" stroke={ink} strokeOpacity=".28" strokeWidth=".7" />)}
          <rect x="54" y="60" width="70" height="80" fill={base} />
          <path d="M89 196 l14 6 v16 c0 10 -8 16 -14 18 c-6 -2 -14 -8 -14 -18 v-16z" fill="none" stroke={ink} strokeWidth="1.2" />
          <text x="89" y="222" textAnchor="middle" fontFamily="Cormorant Garamond, serif" fontSize="13" fill={ink}>{name[0]?.toUpperCase()}</text>
        </>}
        {pack === "leather" && <>
          {Array.from({ length: 70 }, (_, i) => <circle key={i} cx={28 + rng(i) * 122} cy={30 + rng(i + 70) * 222} r={0.6 + rng(i + 140) * 0.8} fill="#000" opacity=".25" />)}
          <rect x="33" y="35" width="112" height="212" rx="5" fill="none" stroke={branding.accent} strokeOpacity=".75" strokeDasharray="4 3" strokeWidth="1.3" />
          <rect x="44" y="60" width="90" height="80" rx="3" fill="#000" opacity=".18" />
        </>}
        {pack === "iridescent" && <rect x="26" y="28" width="126" height="226" fill="#fff" opacity=".25" style={{ mixBlendMode: "overlay" }} />}
        {pack === "pleated" && Array.from({ length: 9 }, (_, i) => (
          <path key={i} d={`M${26 + i * 14} 28 l14 0 l-7 226 l-7 0z`} fill={i % 2 ? "#000" : "#fff"} opacity={i % 2 ? 0.07 : 0.35} />
        ))}
      </g>
      <rect x="26" y="28" width="126" height="226" fill={`url(#s${uid})`} pointerEvents="none" />
      <g textAnchor="middle" fill={pack === "iridescent" ? "#2a2238" : ink}>
        {words(name).map((w, i) => <text key={i} x="89" y={nameY + i * 22} fontFamily={pack === "minimal" ? "Manrope Variable, sans-serif" : "Cormorant Garamond, serif"} fontSize={pack === "minimal" ? 11 : 20} letterSpacing={pack === "minimal" ? 2 : 0} fontWeight="600">{pack === "minimal" ? w.toUpperCase() : w}</text>)}
        <text x="89" y="242" fontSize="7" letterSpacing="3" fontFamily="Manrope Variable, sans-serif">{typeLabel.toUpperCase()}</text>
      </g>
    </svg>
  );
}

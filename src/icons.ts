import type { Accord, Family, Mood, Note } from "../shared/types";

/**
 * A recognisable picture for every catalogue note. Where no emoji shows the material itself, the
 * nearest shape is recoloured (a lime is a green lemon, a fig a purple pear), so no note borrows
 * a different ingredient's picture or an abstract dot.
 */
const TINT = {
  lime: "hue-rotate(55deg) saturate(1.4)",
  yellowGreen: "hue-rotate(28deg) saturate(1.2)",
  pinkCitrus: "hue-rotate(-28deg) saturate(1.3)",
  purple: "hue-rotate(185deg) saturate(1.2) brightness(.8)",
  plum: "hue-rotate(-95deg) saturate(1.1) brightness(.75)",
  pink: "hue-rotate(105deg) saturate(1.2)",
  white: "grayscale(1) brightness(1.35) drop-shadow(0 0 1px rgb(0 0 0 / .45))",
  cream: "sepia(.35) grayscale(.4) brightness(1.3) drop-shadow(0 0 1px rgb(0 0 0 / .4))",
  dark: "grayscale(1) brightness(.45) drop-shadow(0 0 1px rgb(255 255 255 / .35))",
  brown: "sepia(1) saturate(1.6) brightness(.65)",
  amber: "sepia(1) saturate(3.5) hue-rotate(-12deg) brightness(.95)",
  crocus: "hue-rotate(-70deg) saturate(1.2)",
  lilac: "brightness(1.2) saturate(.7)",
  golden: "sepia(.6) saturate(1.8) brightness(.9)",
  olive: "sepia(.5) hue-rotate(40deg) saturate(1.2) brightness(.85)",
} as const;

type Icon = { e: string; tint?: keyof typeof TINT };
const NOTE_ICONS: Record<string, Icon> = {
  bergamot: { e: "🍋", tint: "yellowGreen" }, lemon: { e: "🍋" }, "sweet-orange": { e: "🍊" }, mandarin: { e: "🍊" }, grapefruit: { e: "🍊", tint: "pinkCitrus" },
  lime: { e: "🍋", tint: "lime" }, yuzu: { e: "🍋", tint: "golden" }, petitgrain: { e: "🌿" }, neroli: { e: "🌼", tint: "white" }, lemongrass: { e: "🌾", tint: "lime" },
  lavender: { e: "🪻" }, rosemary: { e: "🌿" }, "clary-sage": { e: "🌿", tint: "olive" }, basil: { e: "🌿" }, mint: { e: "🌱" }, thyme: { e: "🌿", tint: "olive" },
  "juniper-berry": { e: "🫐" }, artemisia: { e: "🌿", tint: "olive" }, eucalyptus: { e: "🍃" },
  "green-tea": { e: "🍵" }, galbanum: { e: "🌱", tint: "lime" }, "violet-leaf": { e: "🍃" }, "fig-leaf": { e: "🍃" }, "cut-grass": { e: "🌱" }, "tomato-leaf": { e: "🌿" }, bamboo: { e: "🎋" },
  "sea-salt": { e: "🧂" }, "marine-breeze": { e: "🌊" }, rain: { e: "🌧️" }, lotus: { e: "🪷" }, cucumber: { e: "🥒" }, driftwood: { e: "🪵", tint: "cream" },
  blackcurrant: { e: "🫐", tint: "dark" }, peach: { e: "🍑" }, apple: { e: "🍏" }, pear: { e: "🍐" }, raspberry: { e: "🍓", tint: "pink" }, plum: { e: "🍑", tint: "plum" },
  fig: { e: "🍐", tint: "purple" }, coconut: { e: "🥥" }, pineapple: { e: "🍍" }, melon: { e: "🍈" }, cherry: { e: "🍒" },
  rose: { e: "🌹" }, peony: { e: "🌸" }, violet: { e: "🪻", tint: "purple" }, iris: { e: "⚜️" }, geranium: { e: "🌺", tint: "pink" }, muguet: { e: "🔔", tint: "white" }, mimosa: { e: "🌼" },
  lilac: { e: "🪻", tint: "lilac" }, freesia: { e: "🌷" }, hyacinth: { e: "🪻" }, osmanthus: { e: "🏵️" }, narcissus: { e: "🌼", tint: "cream" },
  jasmine: { e: "🌼", tint: "white" }, tuberose: { e: "💮" }, "orange-blossom": { e: "🌸", tint: "white" }, "ylang-ylang": { e: "🌼", tint: "golden" }, gardenia: { e: "🌹", tint: "white" }, tiare: { e: "🌺", tint: "white" }, magnolia: { e: "🌷", tint: "cream" },
  "black-pepper": { e: "🫘", tint: "dark" }, "pink-pepper": { e: "🫐", tint: "pink" }, cardamom: { e: "🫛" }, cinnamon: { e: "🪵", tint: "brown" }, clove: { e: "🥀", tint: "brown" }, nutmeg: { e: "🌰" },
  ginger: { e: "🫚" }, saffron: { e: "🌷", tint: "crocus" }, carnation: { e: "🌺" },
  vanilla: { e: "🍦" }, "tonka-bean": { e: "🫘" }, almond: { e: "🌰", tint: "cream" }, honey: { e: "🍯" }, caramel: { e: "🍮" }, coffee: { e: "☕" }, cocoa: { e: "🍫" },
  heliotrope: { e: "🪻", tint: "lilac" }, praline: { e: "🍬" }, rum: { e: "🥃" },
  sandalwood: { e: "🪵", tint: "cream" }, cedarwood: { e: "🌲" }, vetiver: { e: "🌾", tint: "olive" }, patchouli: { e: "🍂" }, oud: { e: "🪵", tint: "dark" }, hinoki: { e: "🌲", tint: "olive" },
  pine: { e: "🌲" }, "birch-tar": { e: "🔥" }, oakmoss: { e: "🌿", tint: "olive" }, "guaiac-wood": { e: "🪵" },
  amber: { e: "💎", tint: "amber" }, labdanum: { e: "🍯", tint: "brown" }, benzoin: { e: "🍯" }, incense: { e: "🪔" }, myrrh: { e: "🏺" }, "tolu-balsam": { e: "🫙" }, tobacco: { e: "🍂", tint: "brown" },
  ambergris: { e: "🐋" }, ambroxan: { e: "✨" }, "white-musk": { e: "☁️" }, "skin-musk": { e: "🫧" }, ambrette: { e: "🌰", tint: "olive" }, leather: { e: "👜" }, suede: { e: "🧤" },
  castoreum: { e: "🦫" }, civet: { e: "🐾" }, beeswax: { e: "🐝" },
  sage: { e: "🌿", tint: "olive" }, verbena: { e: "🌿", tint: "yellowGreen" },
};

export const FAMILY_ICON: Record<Family, string> = {
  citrus: "🍋", aromatic: "🌿", green: "🍃", aquatic: "🌊", fruity: "🍑", floral: "🌸", "white-floral": "💮",
  spicy: "🌶️", gourmand: "🍯", woody: "🪵", amber: "🕯️", animalic: "🐾",
};

const iconOf = (n: Pick<Note, "id" | "family">): Icon => NOTE_ICONS[n.id] ?? { e: FAMILY_ICON[n.family] ?? "•" };
/** The note's picture. Pair it with `noteIconFilter` wherever it is shown, so its colour is right too. */
export const noteIcon = (n: Pick<Note, "id" | "family">) => iconOf(n).e;
/** The CSS filter that recolours the note's picture, if it needs one. */
export const noteIconFilter = (n: Pick<Note, "id" | "family">) => {
  const t = iconOf(n).tint;
  return t ? TINT[t] : undefined;
};

const ACCORD_WORDS: [RegExp, string][] = [
  [/chypre|moss/i, "🌿"], [/fougere|lavender/i, "🪻"], [/oud/i, "🪵"], [/amber|oriental/i, "🕯️"], [/white|bouquet/i, "💐"], [/rose/i, "🌹"],
  [/cologne|citrus/i, "🍋"], [/marine|ozone|aquatic|sea/i, "🌊"], [/green|garden/i, "🌱"], [/iris|powder/i, "⚜️"], [/leather/i, "👜"],
  [/gourmand|vanilla|caramel/i, "🍮"], [/tobacco/i, "🍂"], [/incense|smok/i, "🪔"], [/musk|skin|clean/i, "☁️"], [/wood|cedar|sandal/i, "🪵"],
  [/spice|spicy/i, "🌶️"], [/tea/i, "🍵"], [/fruit|berry/i, "🍓"],
];
/** An icon that says what an accord smells like. */
export const accordIcon = (a: Pick<Accord, "name" | "family">) => ACCORD_WORDS.find(([re]) => re.test(a.name))?.[1] ?? FAMILY_ICON[a.family];

export const MOOD_META: Record<Mood, { icon: string; blurb: string; colors: [string, string] }> = {
  gentle: { icon: "🕊️", blurb: "Powdery, musky, kind", colors: ["#f3d9e4", "#c9b8e8"] },
  refreshing: { icon: "💧", blurb: "Citrus, green, airy", colors: ["#9fe3d6", "#6db7d9"] },
  romantic: { icon: "🌹", blurb: "Petals and soft sweetness", colors: ["#f2a0b5", "#c0577a"] },
  sensual: { icon: "🌙", blurb: "Warm skin, amber, musk", colors: ["#d48a5e", "#7a2f4a"] },
  mysterious: { icon: "🔮", blurb: "Smoke, earth, shadow", colors: ["#6a4c93", "#1f1830"] },
  uplifting: { icon: "☀️", blurb: "Sunny citrus and fruit", colors: ["#ffd76a", "#f39a4b"] },
  cozy: { icon: "🧣", blurb: "Vanilla, amber, wool", colors: ["#e8b77a", "#9b5b34"] },
  elegant: { icon: "🎻", blurb: "Iris, woods, polish", colors: ["#e9dcc6", "#9a8ab0"] },
};

import type { Accord, Family, Perfume } from "../types";

const a = (name: string, family: Family, description: string, character: string, parts: Record<string, number>, foundIn: string, products: string): Accord => ({
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  name, family, description,
  character: character.split(","),
  parts,
  foundIn: foundIn ? foundIn.split(",") : [],
  products: products.split(","),
});

/** Original accord structures: starting points, not recreations of any commercial formula. */
export const ACCORDS: Accord[] = [
  a("Classic Chypre", "woody", "The contrast of bright citrus against dark moss, patchouli and labdanum.", "bittersweet,elegant,mossy", { bergamot: 30, rose: 12, jasmine: 8, patchouli: 18, labdanum: 12, oakmoss: 2, vetiver: 10, "white-musk": 8 }, "Mitsouko,Coco Mademoiselle,Aromatics Elixir", "Fine fragrance,Luxury soap"),
  a("Fougere", "aromatic", "Lavender and coumarin over moss: the barbershop archetype.", "clean,herbal,classic", { lavender: 35, geranium: 10, "tonka-bean": 20, oakmoss: 2, bergamot: 18, cedarwood: 15 }, "Sauvage,Drakkar Noir,Azzaro Pour Homme", "Fine fragrance,Aftershave,Shaving cream"),
  a("Oriental Amber", "amber", "Vanilla, labdanum and benzoin in a glowing, resinous embrace.", "warm,opulent,enveloping", { amber: 30, labdanum: 15, benzoin: 20, vanilla: 25, "tonka-bean": 10 }, "Shalimar,Opium,Black Opium", "Fine fragrance,Candles,Body cream"),
  a("White Bouquet", "white-floral", "A luminous, narcotic mass of white petals.", "radiant,creamy,romantic", { jasmine: 35, tuberose: 15, "orange-blossom": 25, "ylang-ylang": 10, "white-musk": 15 }, "Fracas,J'adore,Alien", "Fine fragrance,Body lotion,Hair mist"),
  a("Rose-Oud", "woody", "The great Middle Eastern pairing: velvet petals over dark resinous wood.", "regal,dark,intense", { rose: 40, oud: 15, saffron: 3, patchouli: 15, amber: 17, sandalwood: 10 }, "Oud Wood,Portrait of a Lady,Baccarat Rouge 540", "Fine fragrance,Attar,Home incense"),
  a("Eau de Cologne", "citrus", "A sparkling citrus and herb splash in the 18th-century tradition.", "bright,clean,fleeting", { bergamot: 30, lemon: 20, neroli: 12, petitgrain: 15, rosemary: 8, lavender: 10, "white-musk": 5 }, "Acqua di Parma Colonia,4711,Eau Sauvage", "Cologne,Linen spray,Soap"),
  a("Marine Ozone", "aquatic", "Salt air and clean musk; the transparent freshness of open water.", "airy,clean,mineral", { "marine-breeze": 20, "sea-salt": 15, bergamot: 25, cedarwood: 15, "white-musk": 25 }, "Acqua di Gio,Light Blue,Cool Water", "Fine fragrance,Shower gel,Deodorant"),
  a("Green Garden", "green", "Snapped stems, wet leaves and garden herbs.", "dewy,crisp,natural", { galbanum: 3, "cut-grass": 12, "violet-leaf": 8, "tomato-leaf": 7, muguet: 30, hyacinth: 15, "white-musk": 25 }, "Vent Vert,Chanel No. 19,Un Jardin sur le Nil", "Fine fragrance,Candles,Home spray"),
  a("Powdery Iris", "floral", "Lipstick-soft violet and iris over creamy musk.", "soft,elegant,nostalgic", { iris: 30, violet: 20, heliotrope: 15, "skin-musk": 20, sandalwood: 15 }, "Dior Homme,Iris Silver Mist,Infusion d'Iris", "Fine fragrance,Face powder,Body cream"),
  a("Gourmand Vanilla", "gourmand", "A dessert-table comfort of caramel and warm cream.", "sweet,edible,cozy", { vanilla: 40, caramel: 15, praline: 15, "tonka-bean": 15, sandalwood: 15 }, "Angel,La Vie Est Belle,Black Opium", "Fine fragrance,Body scrub,Candles"),
  a("Smoked Leather", "animalic", "Birch smoke and tanned hide, softened with iris.", "dark,refined,rugged", { leather: 40, "birch-tar": 3, iris: 12, saffron: 3, labdanum: 22, cedarwood: 20 }, "Tuscan Leather,Bandit,Cuir de Russie", "Fine fragrance,Beard oil"),
  a("Sacred Smoke", "amber", "Frankincense and myrrh curling through cold stone.", "meditative,cool,austere", { incense: 40, myrrh: 15, "black-pepper": 5, cedarwood: 20, "guaiac-wood": 20 }, "Avignon,Passage d'Enfer,Wonderwood", "Fine fragrance,Home incense,Candles"),
  a("Creamy Woods", "woody", "Milky sandalwood and soft musks; skin-like tranquillity.", "serene,milky,intimate", { sandalwood: 45, cedarwood: 15, "skin-musk": 20, ambrette: 5, cardamom: 5, vanilla: 10 }, "Santal 33,Bois des Iles,Samsara", "Fine fragrance,Massage oil,Body lotion"),
  a("Spiced Citrus", "spicy", "Sparkling peel over warm kitchen spice.", "festive,bright,warm", { "sweet-orange": 40, cinnamon: 1, clove: 2, cardamom: 7, ginger: 10, vanilla: 20, cedarwood: 20 }, "Eau d'Orange Verte,Declaration,Noir de Noir", "Candles,Room spray,Fine fragrance"),
  a("Solar Tropic", "white-floral", "Coconut, tiare and warm skin on a white-sand beach.", "sunny,languid,happy", { coconut: 20, tiare: 30, "ylang-ylang": 10, vanilla: 15, "sea-salt": 10, sandalwood: 15 }, "Soleil Blanc,Beyond Paradise,Bronze Goddess", "Fine fragrance,Sun oil,Body mist"),
  a("Fruity Rose", "floral", "A modern, juicy rose lifted by berries and pink pepper.", "playful,bright,youthful", { rose: 40, raspberry: 12, blackcurrant: 8, "pink-pepper": 5, patchouli: 15, "white-musk": 20 }, "Miss Dior,Coco Mademoiselle,Flowerbomb", "Fine fragrance,Hair mist,Body lotion"),
  a("Clean Laundry", "animalic", "Sun-dried cotton and soft aldehydic air.", "clean,fresh,comforting", { "white-musk": 55, muguet: 15, bergamot: 15, cedarwood: 15 }, "Clean Warm Cotton,Molecule 01,Glossier You", "Detergent,Fabric softener,Fine fragrance"),
  a("Tobacco Honey", "amber", "Cured pipe leaf drizzled with honey and rum.", "boozy,warm,masculine", { tobacco: 30, honey: 8, rum: 7, "tonka-bean": 20, vanilla: 15, labdanum: 10, cedarwood: 10 }, "Tobacco Vanille,Herod,Jazz Club", "Fine fragrance,Beard oil,Candles"),
  a("Tea Ceremony", "green", "Steamed leaf, yuzu and hinoki; calm, clear and meditative.", "calm,transparent,zen", { "green-tea": 35, yuzu: 12, hinoki: 18, bamboo: 10, "white-musk": 25 }, "Bvlgari Eau Parfumee,The Noir 29,Wood Sage & Sea Salt", "Fine fragrance,Spa products,Room spray"),
  a("Mineral Driftwood", "aquatic", "Salted wood, sage and warm ambergris on a cold shore.", "windswept,dry,mineral", { driftwood: 30, "sea-salt": 15, sage: 15, ambergris: 15, grapefruit: 10, vetiver: 15 }, "Wood Sage & Sea Salt,Sel Marin,Bleu de Chanel", "Fine fragrance,Reed diffuser,Beard oil"),
  a("Dark Fruit", "fruity", "Plum, rum and patchouli in a heavy velvet cloak.", "boozy,seductive,deep", { plum: 30, rum: 5, rose: 20, patchouli: 20, labdanum: 10, vanilla: 15 }, "Feminite du Bois,Black Afgano,Tom Ford Noir", "Fine fragrance,Candles"),
  a("Spring Blossom", "floral", "Peony and lilac after rain.", "airy,tender,dewy", { peony: 30, lilac: 15, muguet: 15, freesia: 15, pear: 5, "white-musk": 20 }, "Chloe,Daisy,Pleasures", "Fine fragrance,Body lotion,Hand cream"),
  a("Mossy Forest", "woody", "Pine needles and damp bark in deep shade.", "cool,earthy,wild", { pine: 15, "juniper-berry": 15, vetiver: 25, cedarwood: 30, oakmoss: 2, patchouli: 13 }, "Pino Silvestre,Silver Mountain Water,Encre Noire", "Fine fragrance,Candles,Soap"),
  a("Warm Skin Musk", "animalic", "Ambrette and soft resins for a my-skin-but-better effect.", "intimate,soft,sensual", { "skin-musk": 45, ambrette: 10, ambroxan: 10, sandalwood: 20, benzoin: 15 }, "Musc Ravageur,Narciso,Kiehl's Original Musk", "Fine fragrance,Body oil"),
  a("Coffee House", "gourmand", "Dark roast with cardamom, cocoa and vanilla foam.", "roasted,addictive,urban", { coffee: 25, cardamom: 7, cocoa: 13, vanilla: 30, patchouli: 10, cedarwood: 15 }, "Black Opium,Coffee Break,A*Men", "Fine fragrance,Candles,Body scrub"),
];

const p = (name: string, house: string, year: number, style: string, top: string, heart: string, base: string): Perfume => ({
  name, house, year, style,
  top: top.split(","), heart: heart.split(","), base: base.split(","),
});

/**
 * Publicly described olfactive pyramids (approximate, simplified to Rhythm's note vocabulary).
 * Actual formulas are trade secrets and none are reproduced. Brands belong to their owners;
 * Rhythm has no affiliation with them.
 */
export const PERFUMES: Perfume[] = [
  p("Chanel No. 5", "Chanel", 1921, "Floral aldehyde", "bergamot,lemon,neroli,ylang-ylang", "jasmine,rose,muguet,iris", "sandalwood,vetiver,vanilla,amber,white-musk,oakmoss"),
  p("Mitsouko", "Guerlain", 1919, "Fruity chypre", "bergamot,peach", "rose,jasmine,ylang-ylang", "oakmoss,vetiver,cinnamon,labdanum,sandalwood"),
  p("Shalimar", "Guerlain", 1925, "Oriental", "bergamot,lemon,mandarin", "iris,jasmine,rose,patchouli,vetiver", "vanilla,tonka-bean,incense,benzoin,leather,labdanum"),
  p("Opium", "YSL", 1977, "Spicy oriental", "plum,mandarin,clove,pink-pepper", "jasmine,rose,carnation,cinnamon,ylang-ylang", "myrrh,labdanum,benzoin,vanilla,patchouli,sandalwood,cedarwood"),
  p("Angel", "Mugler", 1992, "Gourmand", "bergamot,blackcurrant,mandarin", "honey,raspberry,peach,plum,jasmine", "patchouli,praline,caramel,vanilla,tonka-bean,cocoa"),
  p("Acqua di Gio", "Armani", 1995, "Aquatic", "lime,lemon,bergamot,sweet-orange,marine-breeze", "jasmine,lotus,rose,muguet,peach", "cedarwood,sea-salt,white-musk,amber,patchouli"),
  p("CK One", "Calvin Klein", 1994, "Citrus aromatic", "lemon,bergamot,pineapple,mandarin,cardamom", "muguet,jasmine,violet,rose,nutmeg", "green-tea,white-musk,cedarwood,sandalwood,amber,oakmoss"),
  p("Aventus", "Creed", 2010, "Fruity chypre", "pineapple,bergamot,blackcurrant,apple", "birch-tar,patchouli,jasmine,rose", "white-musk,oakmoss,ambergris,vanilla"),
  p("Sauvage", "Dior", 2015, "Aromatic fougere", "bergamot,pink-pepper", "lavender,geranium,black-pepper,vetiver,patchouli", "ambroxan,cedarwood,labdanum"),
  p("Coco Mademoiselle", "Chanel", 2001, "Modern chypre", "sweet-orange,mandarin,bergamot", "rose,jasmine", "patchouli,white-musk,vanilla,vetiver,tonka-bean"),
  p("J'adore", "Dior", 1999, "White floral", "pear,melon,peach,bergamot,mandarin", "jasmine,tuberose,rose,violet,muguet", "white-musk,vanilla,cedarwood,plum"),
  p("Baccarat Rouge 540", "MFK", 2015, "Amber woody", "saffron,jasmine", "amber,cedarwood", "ambroxan,labdanum"),
  p("Santal 33", "Le Labo", 2011, "Woody", "cardamom,iris,violet", "ambrette,cedarwood", "sandalwood,leather,amber,white-musk"),
  p("Black Opium", "YSL", 2014, "Gourmand", "pear,pink-pepper,sweet-orange", "coffee,jasmine,almond", "vanilla,patchouli,cedarwood"),
  p("Light Blue", "D&G", 2001, "Citrus aquatic", "lemon,apple,cedarwood", "bamboo,jasmine,rose", "cedarwood,white-musk,amber"),
  p("Tobacco Vanille", "Tom Ford", 2007, "Tobacco gourmand", "tobacco,cinnamon,clove", "tonka-bean,vanilla,cocoa", "benzoin,sandalwood,honey"),
  p("Oud Wood", "Tom Ford", 2007, "Woody oriental", "cardamom,black-pepper", "oud,sandalwood,vetiver", "tonka-bean,vanilla,amber"),
  p("Tuscan Leather", "Tom Ford", 2007, "Leather", "saffron,raspberry", "leather,jasmine", "amber,labdanum,oud"),
  p("Portrait of a Lady", "Frederic Malle", 2010, "Rose oriental", "rose,raspberry,clove,cinnamon", "patchouli,incense,sandalwood", "white-musk,benzoin,amber"),
  p("La Vie Est Belle", "Lancome", 2012, "Fruity gourmand", "blackcurrant,pear", "iris,jasmine,orange-blossom", "praline,vanilla,patchouli,tonka-bean"),
  p("Fracas", "Robert Piguet", 1948, "White floral", "bergamot,hyacinth,mandarin", "tuberose,jasmine,orange-blossom,gardenia,iris", "sandalwood,white-musk,vetiver,oakmoss"),
  p("Eau Sauvage", "Dior", 1966, "Aromatic citrus", "lemon,bergamot,rosemary,basil", "jasmine,carnation,iris,rose", "vetiver,oakmoss,white-musk,amber"),
  p("Vent Vert", "Balmain", 1947, "Green floral", "galbanum,lime,basil,sweet-orange", "hyacinth,muguet,rose,violet", "oakmoss,sandalwood,white-musk,iris"),
  p("Chanel No. 19", "Chanel", 1971, "Green iris", "galbanum,bergamot,neroli", "iris,rose,muguet,narcissus", "oakmoss,vetiver,sandalwood,leather,white-musk"),
  p("Bandit", "Robert Piguet", 1944, "Leather chypre", "galbanum,artemisia,neroli", "jasmine,tuberose,rose,ylang-ylang", "leather,oakmoss,vetiver,castoreum,patchouli,civet"),
  p("Terre d'Hermes", "Hermes", 2006, "Woody citrus", "sweet-orange,grapefruit,pink-pepper", "geranium,black-pepper,sage", "vetiver,cedarwood,patchouli,benzoin"),
  p("Encre Noire", "Lalique", 2006, "Woody", "cedarwood,pine", "vetiver,incense", "white-musk,oakmoss,sandalwood"),
  p("Avignon", "CdG", 2002, "Incense", "incense,bergamot", "myrrh,labdanum", "vanilla,patchouli,cedarwood"),
  p("A*Men", "Mugler", 1996, "Gourmand fougere", "lavender,bergamot,mint", "coffee,honey,patchouli", "tonka-bean,vanilla,caramel,amber,cedarwood"),
  p("Un Jardin sur le Nil", "Hermes", 2005, "Green citrus", "grapefruit,tomato-leaf,mandarin", "lotus,peony,cut-grass", "cedarwood,white-musk,incense"),
  p("Wood Sage & Sea Salt", "Jo Malone", 2014, "Mineral woody", "ambrette,sea-salt", "sage,grapefruit", "driftwood,ambergris"),
  p("Philosykos", "Diptyque", 1996, "Green fig", "fig-leaf,bergamot", "fig,coconut", "cedarwood,sandalwood,white-musk"),
  p("Iris Silver Mist", "Serge Lutens", 1994, "Iris", "galbanum,clary-sage", "iris,carnation,violet", "cedarwood,sandalwood,vetiver,white-musk,benzoin"),
  p("Daisy", "Marc Jacobs", 2007, "Fresh floral", "blackcurrant,grapefruit,raspberry", "violet,jasmine,muguet", "white-musk,sandalwood,cedarwood"),
  p("Molecule 01", "Escentric", 2006, "Skin musk", "ambroxan", "ambroxan,white-musk", "skin-musk,cedarwood"),
  p("Hypnotic Poison", "Dior", 2001, "Almond oriental", "almond,plum,coconut", "jasmine,tuberose,rose,heliotrope", "vanilla,sandalwood,white-musk"),
  p("Pleasures", "Estee Lauder", 1995, "Fresh floral", "freesia,blackcurrant,muguet", "peony,rose,lilac,jasmine", "sandalwood,white-musk,patchouli"),
  p("Cool Water", "Davidoff", 1988, "Aquatic fougere", "marine-breeze,mint,rosemary,lavender", "sandalwood,jasmine,geranium,neroli", "white-musk,oakmoss,cedarwood,tobacco,amber"),
];

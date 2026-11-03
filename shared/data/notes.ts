import { FACETS, type Facet, type FacetVector, type Family, type IfraInfo, type Note, type Position } from "../types";

/**
 * Original, hand-authored perfumery knowledge. No record here is copied from Fragrantica or any
 * other database. Metrics are editorial 1-10 estimates. IFRA figures are indicative conservative
 * guards for category 4 and must be checked against the current IFRA Standards before real use.
 *
 * Row: name | family | position | sillage,projection,longevity,strength | doseMin,doseMax |
 *      ifra (number, "spec", or empty) ; ifra note | facets | pairs | description
 */
const FAMILY_FACETS: Record<Family, Partial<FacetVector>> = {
  citrus: { fresh: 0.8, citrus: 1, fruity: 0.2 },
  aromatic: { fresh: 0.7, green: 0.5, spicy: 0.2, woody: 0.2 },
  green: { green: 1, fresh: 0.6, earthy: 0.2 },
  aquatic: { aquatic: 1, fresh: 0.8, musky: 0.1 },
  fruity: { fruity: 1, sweet: 0.5, fresh: 0.2 },
  floral: { floral: 1, sweet: 0.2, powdery: 0.2 },
  "white-floral": { floral: 1, sweet: 0.4, musky: 0.2 },
  spicy: { spicy: 1, amber: 0.2, woody: 0.2 },
  gourmand: { sweet: 1, amber: 0.3, powdery: 0.2 },
  woody: { woody: 1, earthy: 0.3, amber: 0.1 },
  amber: { amber: 1, sweet: 0.4, smoky: 0.2, woody: 0.2 },
  animalic: { musky: 1, smoky: 0.3, earthy: 0.2 },
};

const ROWS = `
Bergamot|citrus|top|5,6,2,5|5,20|0.4;Phototoxic when cold-pressed; bergapten-free grades are less restricted|floral:.2,green:.2|lemon,neroli,lavender,jasmine,vetiver|Sparkling, tea-bright citrus with a soft floral shimmer. The classic opening of colognes and chypres.
Lemon|citrus|top|4,6,1,6|3,15|2;Phototoxic when cold-pressed|green:.2|bergamot,verbena,basil,rosemary,neroli|Sharp, sunlit zest that reads clean and instantly energising.
Sweet Orange|citrus|top|4,5,2,5|3,15||sweet:.3,fruity:.4|clove,neroli,cinnamon,vanilla,bergamot|Juicy and round, a happy citrus that leans towards fruit.
Mandarin|citrus|top|4,5,2,4|3,15||sweet:.4,fruity:.4|neroli,jasmine,bergamot,vanilla,ylang-ylang|Tender, candied peel with a playful sweetness.
Grapefruit|citrus|top|5,7,2,6|2,12|4;Phototoxic when cold-pressed|green:.3,fruity:.2|vetiver,pink-pepper,mint,rose,cedarwood|Bitter and sparkling, with a modern, slightly sulphurous bite.
Lime|citrus|top|4,6,1,6|1,8|0.7;Phototoxic when cold-pressed; distilled grades are less restricted|green:.4|basil,ginger,mint,coconut,vetiver|Tart and green, a tropical snap that disappears quickly.
Yuzu|citrus|top|4,5,2,5|1,8||green:.3,floral:.1|green-tea,ginger,neroli,hinoki,white-musk|Delicate Japanese citrus, airy and aromatic.
Petitgrain|citrus|top|4,5,3,5|2,10||green:.7,woody:.3,floral:.2|neroli,bergamot,lavender,rosemary,oakmoss|Bitter leaf-and-twig citrus that gives colognes their backbone.
Neroli|citrus|heart|6,6,3,6|1,6||floral:.9,green:.2,sweet:.2|orange-blossom,bergamot,jasmine,petitgrain,white-musk|Luminous bitter-orange blossom: honeyed, green and clean at once.
Lemongrass|citrus|top|5,7,2,7|0.5,4|spec;Citral-rich material; sensitisation limit applies|green:.5|ginger,basil,geranium,vetiver,lime|Grassy lemon with a rugged, herbal edge.
Lavender|aromatic|top|6,6,4,6|3,20||floral:.5,woody:.2,powdery:.2|tonka,bergamot,rosemary,geranium,vanilla|Herbal, clean and calming. The soul of the fougere family.
Rosemary|aromatic|top|5,6,2,6|1,8||green:.5,woody:.3|lavender,lemon,cedarwood,sage,petitgrain|Camphorous, resinous and bracing.
Clary Sage|aromatic|heart|6,5,4,5|1,8||amber:.3,musky:.2,earthy:.2|lavender,ambergris,bergamot,sandalwood,tobacco|Warm, tea-like herb with a natural ambery facet.
Basil|aromatic|top|5,6,2,6|0.5,4|spec;Methyl eugenol content must be controlled|green:.7,spicy:.3|lemon,lime,mint,tomato-leaf,neroli|Peppery kitchen herb, sweet and green.
Mint|aromatic|top|6,8,2,8|0.2,3||green:.4,fresh:1|lime,grapefruit,lavender,tonka,green-tea|Cooling and piercing; a small amount lifts everything around it.
Thyme|aromatic|top|5,6,3,7|0.2,3||spicy:.4,woody:.2|lavender,rosemary,oakmoss,cedarwood,geranium|Dry, medicinal, sun-baked herb.
Juniper Berry|aromatic|top|5,6,3,5|1,6||woody:.4,green:.3,spicy:.2|grapefruit,pink-pepper,cedarwood,vetiver,lavender|Gin-like, resinous, crisp and clear.
Artemisia|aromatic|top|5,6,3,6|0.5,4||green:.6,earthy:.3,spicy:.2|lavender,oakmoss,patchouli,leather,cedarwood|Bitter, wormwood-like herb with a dark green edge.
Eucalyptus|aromatic|top|5,8,2,8|0.2,2||green:.3,fresh:1|mint,rosemary,cedarwood,lavender,lemon|Icy, camphorous, clinical freshness.
Green Tea|green|heart|3,3,3,3|1,8||fresh:.6,floral:.2,woody:.1|bergamot,yuzu,jasmine,white-musk,mint|Transparent, slightly smoky leaf. Calm and quietly modern.
Galbanum|green|top|6,8,4,9|0.2,3||earthy:.4,woody:.2|iris,hyacinth,oakmoss,violet-leaf,narcissus|Intensely bitter, snapped-stem green. Thrilling in tiny doses.
Violet Leaf|green|heart|5,6,4,7|0.2,3||aquatic:.2,earthy:.3,floral:.2|violet,iris,galbanum,cucumber,sandalwood|Watery, metallic cut-leaf green.
Fig Leaf|green|heart|4,4,5,5|1,8|spec;Fig leaf absolute is prohibited by IFRA, so this note means a safe reconstruction|fruity:.4,woody:.3,sweet:.2,earthy:.2|coconut,cedarwood,cassis,sandalwood,white-musk|Milky sap and warm green shade under a Mediterranean tree.
Cut Grass|green|top|4,6,1,6|0.2,3||fresh:.8|hyacinth,tomato-leaf,muguet,mint,vetiver|Dewy, vivid and fleeting; the smell of a just-mown lawn.
Tomato Leaf|green|heart|4,5,3,7|0.2,2||earthy:.4,spicy:.1|basil,fig-leaf,cassis,galbanum,vetiver|Pungent, sappy, garden-vine green.
Bamboo|green|heart|2,3,3,3|1,8||fresh:.7,aquatic:.3,woody:.2|green-tea,white-musk,lotus,yuzu,cedarwood|Light, hollow, watery green.
Sea Salt|aquatic|heart|4,5,4,4|0.5,5||musky:.3,earthy:.1|driftwood,sage,ambergris,grapefruit,white-musk|Mineral skin after swimming; a warm crystalline salinity.
Marine Breeze|aquatic|top|6,7,3,6|0.5,4||fresh:1,green:.1|bergamot,lotus,cedarwood,white-musk,sea-salt|Ozonic and airy, a stiff wind off open water.
Rain|aquatic|top|4,5,2,4|0.5,4||earthy:.3,green:.3|vetiver,muguet,green-tea,iris,cut-grass|Petrichor-tinted air after a downpour.
Lotus|aquatic|heart|3,4,3,4|1,8||floral:.7,sweet:.2|bamboo,bergamot,white-musk,green-tea,peony|Translucent water flower, cool and serene.
Cucumber|aquatic|top|3,4,2,4|0.5,4||green:.6,fresh:1|violet-leaf,mint,melon,lotus,white-musk|Crisp, watery, refreshing garden note.
Driftwood|aquatic|base|5,5,7,5|2,12||woody:.8,earthy:.3,smoky:.2|sea-salt,sage,vetiver,ambergris,cedarwood|Sun-bleached, salted timber.
Blackcurrant|fruity|top|6,7,3,7|0.5,5||green:.5,floral:.1|rose,muguet,grapefruit,cedarwood,peony|Tart, leafy berry with a feline, catty edge.
Peach|fruity|top|5,5,4,5|1,8||floral:.3,musky:.2|rose,jasmine,oakmoss,white-musk,osmanthus|Velvety, ripe and softly skin-like.
Apple|fruity|top|4,6,2,5|1,8||fresh:.6,green:.3|cinnamon,cedarwood,lavender,rose,vanilla|Crunchy and bright with a clean snap.
Pear|fruity|top|4,5,2,4|1,8||fresh:.4,green:.3|freesia,white-musk,cedarwood,jasmine,patchouli|Juicy, watery, gently sweet.
Raspberry|fruity|top|5,6,3,6|0.5,5||floral:.2|rose,violet,patchouli,vanilla,ambroxan|Jammy, tart, a touch mischievous.
Plum|fruity|heart|6,6,5,6|0.5,5||amber:.3,spicy:.2|rose,oud,cinnamon,patchouli,incense|Dark, boozy, velvet-skinned fruit.
Fig|fruity|heart|4,4,5,5|1,8||woody:.3,green:.3|fig-leaf,coconut,sandalwood,cedarwood,white-musk|Creamy, milky fruit flesh; quiet and comforting.
Coconut|fruity|heart|5,4,5,5|0.5,5||sweet:.5,musky:.3|tiare,vanilla,sandalwood,lime,fig-leaf|Solar, creamy and beach-warm.
Pineapple|fruity|top|6,7,3,7|0.5,5||fresh:.3|birch-tar,bergamot,patchouli,oakmoss,apple|Sharp, tropical, sparkling sweetness.
Rose|floral|heart|7,6,5,7|2,15|spec;Natural rose oils carry methyl eugenol limits|fruity:.2,sweet:.2,spicy:.1|oud,patchouli,jasmine,geranium,pink-pepper|Velvety and multifaceted: honey, spice, citrus and petals. The queen of perfumery.
Peony|floral|heart|4,5,3,4|1,10||fresh:.4,fruity:.3|rose,muguet,pear,white-musk,lotus|Rosy, watery and fresh; a modern airy floral.
Violet|floral|heart|5,4,4,4|1,8||powdery:.8,sweet:.4,woody:.2|iris,violet-leaf,rose,raspberry,sandalwood|Sweet, powder-soft and nostalgic.
Iris|floral|heart|5,4,8,5|0.5,6||powdery:1,earthy:.4,woody:.3|violet,sandalwood,galbanum,vetiver,tonka|Cool, buttery, rooty luxury, like lipstick and suede.
Geranium|floral|heart|6,6,4,6|1,10||green:.4,fresh:.4,spicy:.1|rose,lavender,vetiver,bergamot,patchouli|Minty-rosy leaf, crisp and bridging.
Muguet|floral|heart|5,6,3,5|1,8|spec;Reconstructed; several traditional lily-of-the-valley materials are restricted or banned|fresh:.6,green:.4|jasmine,rose,cut-grass,white-musk,peony|Dewy, bell-like, spring-garden transparency.
Mimosa|floral|heart|5,4,5,4|0.5,6||powdery:.7,sweet:.5,green:.2|violet,iris,heliotrope,almond,sandalwood|Sunny, honeyed, cucumber-tinged pollen.
Lilac|floral|heart|5,5,3,5|1,6||green:.3,powdery:.3|muguet,heliotrope,rose,almond,white-musk|Soft, almondy springtime blossom.
Freesia|floral|heart|4,5,3,4|1,8||fresh:.7,fruity:.2|pear,muguet,peony,white-musk,jasmine|Peppery, sheer, and clean as cold air.
Hyacinth|floral|top|6,7,3,7|0.5,5||green:.8,earthy:.2|galbanum,muguet,narcissus,iris,cut-grass|Cool, green-stemmed, slightly inky blossom.
Osmanthus|floral|heart|6,5,5,5|0.5,5||fruity:.8,sweet:.3,earthy:.2|peach,green-tea,leather,iris,sandalwood|Apricot and suede in a single flower.
Narcissus|floral|heart|7,6,6,8|0.2,3||green:.5,earthy:.4,smoky:.2|hyacinth,jasmine,galbanum,leather,tobacco|Narcotic, haylike, hauntingly green.
Jasmine|white-floral|heart|8,7,6,8|1,10|spec;Absolutes carry allergen specifications|fruity:.3|rose,bergamot,sandalwood,ylang-ylang,vanilla|Radiant, narcotic and faintly animalic. A pillar of fine perfumery.
Tuberose|white-floral|heart|9,8,7,9|0.5,6||sweet:.5,green:.2|jasmine,coconut,orange-blossom,vanilla,sandalwood|Creamy, buttery, enormous: the diva of white flowers.
Orange Blossom|white-floral|heart|7,6,5,6|1,8||fresh:.2|neroli,jasmine,vanilla,honey,white-musk|Sweet, soapy, bridal radiance.
Ylang-Ylang|white-floral|heart|7,6,6,7|0.5,6|0.8;Indicative guard for isoeugenol-related content|sweet:.5,fruity:.3,spicy:.2|jasmine,vanilla,sandalwood,mandarin,coconut|Custard-banana floral with a tropical languor.
Gardenia|white-floral|heart|7,6,5,7|0.5,6||green:.3,earthy:.2|tuberose,jasmine,coconut,sandalwood,rose|Velvety, mushroomy, intoxicating petals.
Tiare|white-floral|heart|6,5,5,5|0.5,6||sweet:.3|coconut,ylang-ylang,vanilla,sandalwood,sea-salt|Warm Polynesian flower, sunscreen-sweet and happy.
Magnolia|white-floral|heart|5,5,4,4|1,8||citrus:.5,fresh:.5|bergamot,peony,rose,white-musk,cedarwood|Lemon-cream petals, luminous and calm.
Black Pepper|spicy|top|6,7,3,7|0.5,5||woody:.3,fresh:.2|incense,vetiver,rose,bergamot,leather|Dry, electric heat that sharpens everything nearby.
Pink Pepper|spicy|top|6,7,3,6|0.5,5||fresh:.4,floral:.3,fruity:.2|rose,grapefruit,patchouli,cedarwood,neroli|Rosy, sparkling spice, the modern perfumer's favourite.
Cardamom|spicy|top|6,6,3,6|0.3,4||fresh:.5,green:.2,woody:.1|bergamot,rose,oud,coffee,sandalwood|Cool green spice, aromatic and elegant.
Cinnamon|spicy|heart|7,7,5,8|0.1,1.5|0.1;Conservative guard; cinnamal is a strong sensitiser|sweet:.5,woody:.2|orange,clove,vanilla,apple,benzoin|Hot, sweet bark with festive warmth.
Clove|spicy|heart|7,7,6,8|0.1,1.5|0.5;Eugenol-rich material; sensitisation limit applies|sweet:.2,smoky:.2|rose,carnation,orange,vanilla,benzoin|Medicinal, sweet and intense.
Nutmeg|spicy|heart|5,5,4,5|0.3,3||woody:.3,sweet:.2|lavender,rose,sandalwood,tonka,bergamot|Warm, soft, slightly soapy spice.
Ginger|spicy|top|6,7,3,6|0.3,4||fresh:.7,citrus:.3|lime,lemongrass,cardamom,yuzu,sandalwood|Zesty, tingling, fresh-root heat.
Saffron|spicy|heart|7,6,6,7|0.1,2||amber:.5,earthy:.3,smoky:.2,leathery:.0|oud,rose,leather,amber,jasmine|Metallic, hay-leather glow. Instantly opulent.
Carnation|spicy|heart|6,6,5,6|0.5,5|0.5;Eugenol-related guard|floral:.9,sweet:.2|clove,rose,ylang-ylang,vanilla,iris|Peppery, clove-tinged vintage floral.
Vanilla|gourmand|base|7,5,9,6|1,12||amber:.4,powdery:.2|tonka,benzoin,sandalwood,jasmine,rose|Warm, creamy, deeply comforting. Few notes are so universally loved.
Tonka Bean|gourmand|base|6,5,9,6|0.5,8|1.6;Coumarin-rich; indicative guard|powdery:.4,woody:.2,green:.1|lavender,vanilla,sandalwood,almond,tobacco|Almond, hay and tobacco in a soft, sweet glow.
Almond|gourmand|heart|5,5,5,5|0.3,4||powdery:.4|heliotrope,cherry,vanilla,mimosa,tonka|Marzipan warmth with a bitter edge.
Honey|gourmand|heart|7,5,7,7|0.2,4||floral:.4,amber:.4,musky:.2|rose,orange-blossom,tobacco,beeswax,vanilla|Sticky, animal-sweet and golden.
Caramel|gourmand|heart|6,5,7,6|0.2,4||amber:.3|vanilla,coffee,tonka,praline,patchouli|Burnt-sugar richness.
Coffee|gourmand|heart|6,6,6,7|0.2,4||smoky:.5,earthy:.3,woody:.2|vanilla,cardamom,patchouli,tonka,rose|Dark-roasted, bittersweet, addictive.
Cocoa|gourmand|base|5,4,7,5|0.3,4||earthy:.4,powdery:.3|patchouli,vanilla,tonka,orange,oud|Dry, bitter chocolate powder.
Heliotrope|gourmand|heart|6,5,7,5|0.5,5||powdery:.9,floral:.5|almond,vanilla,mimosa,iris,sandalwood|Cherry-pie blossom, soft as cosmetic powder.
Praline|gourmand|base|7,6,8,7|0.3,5||amber:.3,woody:.1|vanilla,caramel,patchouli,tonka,jasmine|Toasted nuts in hot sugar.
Rum|gourmand|top|6,6,4,6|0.2,3||amber:.5,woody:.3,spicy:.2|tobacco,vanilla,oud,plum,tonka|Boozy, dark, molasses-warm.
Sandalwood|woody|base|5,4,9,5|2,15||sweet:.3,musky:.3,powdery:.2|rose,jasmine,vanilla,iris,cardamom|Creamy, milky, serene wood; a beautiful fixative.
Cedarwood|woody|base|5,5,8,5|2,15||earthy:.2,smoky:.1,fresh:.1|vetiver,bergamot,lavender,rose,white-musk|Dry pencil shavings: clean and structural.
Vetiver|woody|base|6,6,9,7|1,10||earthy:.7,smoky:.4,green:.3|grapefruit,bergamot,cedarwood,iris,patchouli|Rooty, smoky, damp-earth elegance.
Patchouli|woody|base|7,6,10,8|1,10||earthy:.9,sweet:.2,amber:.2|rose,vanilla,bergamot,oud,vetiver|Dark, camphorous earth, essential to chypres and modern gourmands.
Oud|woody|base|10,9,10,10|0.2,5||smoky:.7,earthy:.5,amber:.4,musky:.4|rose,saffron,amber,sandalwood,incense|Dense, medicinal, resinous and regal. Usually a reconstruction in modern perfumery.
Hinoki|woody|heart|4,4,6,4|1,8||fresh:.6,green:.3,citrus:.2|yuzu,green-tea,incense,white-musk,cedarwood|Lemony Japanese cypress, clear as a temple bath.
Pine|woody|top|6,7,4,6|0.5,5||green:.7,fresh:.7|juniper-berry,rosemary,cedarwood,incense,oakmoss|Bright, resinous forest air.
Birch Tar|woody|base|8,7,10,10|0.05,1|spec;Use only rectified grades|smoky:1,earthy:.2,musky:.3|leather,pineapple,vetiver,incense,oud|Tarry, campfire smoke; a defining leather material.
Oakmoss|woody|base|6,5,10,7|0.1,2|0.1;Tightly restricted; requires low-atranol grades|earthy:1,green:.6,smoky:.2|bergamot,patchouli,rose,labdanum,vetiver|Inky, damp forest floor. The foundation of the chypre.
Guaiac Wood|woody|base|6,5,9,6|0.5,6||smoky:.8,sweet:.2,amber:.2|incense,rose,oud,vanilla,cedarwood|Smoky, rosy, tar-tinged wood.
Amber|amber|base|7,6,9,6|2,15||sweet:.3,powdery:.2|vanilla,labdanum,benzoin,oud,saffron|A warm resin-vanilla fantasy accord, glowing and enveloping.
Labdanum|amber|base|8,6,10,8|0.5,8||smoky:.4,musky:.4,earthy:.2|oakmoss,vanilla,rose,benzoin,oud|Sticky, leathery, sun-baked resin; the heart of amber.
Benzoin|amber|base|5,4,9,5|1,10||sweet:.7,powdery:.3|vanilla,cinnamon,rose,sandalwood,incense|Sweet balsamic warmth, like vanilla wrapped in resin.
Incense|amber|base|7,7,9,8|0.5,6||smoky:.9,woody:.3,citrus:.2,spicy:.2|oud,rose,black-pepper,hinoki,guaiac-wood|Cool, lemony smoke rising through stone.
Myrrh|amber|base|6,5,9,6|0.5,5||smoky:.4,earthy:.5,spicy:.2|incense,rose,oud,vanilla,labdanum|Bitter, mushroomy, ancient balsam.
Tolu Balsam|amber|base|5,4,9,5|0.5,6|spec;Crude Peru balsam is prohibited; tolu and treated extracts are used under specification|sweet:.6,spicy:.2|vanilla,benzoin,cinnamon,tonka,tobacco|Soft, cinnamic, honeyed resin.
Tobacco|amber|base|7,6,9,7|0.3,5||smoky:.5,sweet:.4,earthy:.4,woody:.3|honey,vanilla,tonka,rum,leather|Sweet cured leaf, pipe-room warmth.
Ambergris|animalic|base|7,6,10,5|0.5,6||aquatic:.5,amber:.4,earthy:.2|sea-salt,sage,bergamot,white-musk,sandalwood|Salty, radiant skin warmth. Always a synthetic reconstruction here.
Ambroxan|animalic|base|8,8,10,6|1,10||amber:.6,woody:.5,fresh:.2|grapefruit,cedarwood,raspberry,white-musk,vetiver|Clean mineral radiance that hums on skin for days.
White Musk|animalic|base|6,4,10,3|2,15||fresh:.4,powdery:.5,sweet:.1|bergamot,jasmine,pear,cedarwood,peony|Clean-laundry softness that extends everything around it.
Skin Musk|animalic|base|5,3,10,3|1,10||powdery:.4,sweet:.2,amber:.2|iris,sandalwood,rose,vanilla,ambrette|An intimate second-skin warmth.
Ambrette|animalic|base|5,4,9,5|0.2,4||fruity:.4,floral:.2,powdery:.3|iris,skin-musk,neroli,pear,sandalwood|Pear-tinged vegetal musk from hibiscus seed.
Leather|animalic|base|8,7,10,8|0.5,6||smoky:.8,earthy:.3,woody:.2|birch-tar,iris,saffron,tobacco,rose|Tanned hide, smoky and refined. A reconstruction.
Suede|animalic|base|5,4,9,4|0.5,6||powdery:.7,sweet:.1|iris,osmanthus,white-musk,sandalwood,violet|Soft, peach-skin, velvety leather.
Castoreum|animalic|base|7,6,10,8|0.1,2||smoky:.5,earthy:.4,sweet:.2|leather,labdanum,rose,vanilla,tobacco|A cruelty-free reconstruction of warm, leathery animalic depth.
Civet|animalic|base|8,7,10,9|0.05,1||earthy:.5,floral:.2|jasmine,rose,labdanum,oakmoss,ylang-ylang|A synthetic reconstruction: diffusive, skin-hot, and thrilling in a trace.
Beeswax|animalic|base|6,4,9,6|0.2,3||sweet:.8,amber:.3|honey,tobacco,rose,benzoin,sandalwood|Warm honeyed wax with a gently animal purr.
Sage|aromatic|heart|5,5,4,5|0.5,5||green:.5,woody:.3,spicy:.2|sea-salt,lavender,ambergris,driftwood,bergamot|Dry, silvery, mineral herb.
Verbena|citrus|top|4,6,2,6|1,8|spec;Lemon verbena oil is prohibited by IFRA, so this note means a safe reconstruction|green:.4,floral:.2|lemon,neroli,basil,mint,white-musk|Green lemon, cool, herbal and pristine.
Melon|fruity|top|5,5,3,5|0.2,3||aquatic:.6,fresh:.5|cucumber,lotus,muguet,white-musk,peach|Dewy, watery honeydew; pure 90s transparency.
Cherry|fruity|heart|6,6,4,6|0.3,4||floral:.2|almond,rose,vanilla,tonka,heliotrope|Syrupy, almond-kissed red fruit.
`;

const PAIR_ALIASES: Record<string, string> = { tonka: "tonka-bean", cassis: "blackcurrant", orange: "sweet-orange" };

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function facetsFor(family: Family, extra: string): FacetVector {
  const v = Object.fromEntries(FACETS.map((f) => [f, 0])) as FacetVector;
  Object.assign(v, FAMILY_FACETS[family]);
  for (const kv of extra.split(",")) {
    const [k, val] = kv.split(":");
    if (FACETS.includes(k as Facet)) v[k as Facet] = Number(val);
  }
  return v;
}

function parseIfra(s: string): IfraInfo {
  const [value, ...rest] = s.split(";");
  const note = rest.join(";").trim() || undefined;
  if (value === "spec") return { cat4: null, status: "specification", note };
  if (value) return { cat4: Number(value), status: "restricted", note };
  return { cat4: null, status: "not-modelled" };
}

export const NOTES: Note[] = ROWS.trim().split("\n").map((row) => {
  const [name, family, position, metrics, dose, ifra, facets, pairs, description] = row.split("|");
  const [sillage, projection, longevity, strength] = metrics.split(",").map(Number);
  const [lo, hi] = dose.split(",").map(Number);
  return {
    id: slug(name),
    name,
    family: family as Family,
    position: position as Position,
    sillage,
    projection,
    longevity,
    strength,
    dose: [lo, hi] as [number, number],
    ifra: parseIfra(ifra),
    facets: facetsFor(family as Family, facets),
    pairs: pairs.split(",").map((p) => PAIR_ALIASES[p] ?? p),
    description,
  };
});

export const NOTE_BY_ID = new Map(NOTES.map((n) => [n.id, n]));
export const note = (id: string) => {
  const n = NOTE_BY_ID.get(id);
  if (!n) throw new Error(`Unknown note: ${id}`);
  return n;
};

/** Merges admin-imported notes over the bundled catalogue. */
export function applyNoteOverrides(rows: Note[]) {
  for (const row of rows) {
    const i = NOTES.findIndex((n) => n.id === row.id);
    if (i >= 0) NOTES[i] = row;
    else NOTES.push(row);
    NOTE_BY_ID.set(row.id, row);
  }
}

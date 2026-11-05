/**
 * De meubelbibliotheek: gangbare meubels met Belgische standaardmaten (mm).
 *
 * Elk meubel heeft een vorm (`shape`) die zowel de lijntekening op het plan
 * als het 3D-model bepaalt, en een paar instellingen (aantal zitplaatsen,
 * deuren…). De rugzijde ligt in de eigen assen aan -diepte/2: die kant komt
 * tegen de muur.
 */

export type Category = "zitten" | "tafels" | "slapen" | "opbergen" | "keuken" | "badkamer" | "werken" | "sfeer";

export const CATEGORY_LABEL: Record<Category, string> = {
  zitten: "Zitten",
  tafels: "Tafels en stoelen",
  slapen: "Slapen",
  opbergen: "Kasten",
  keuken: "Keuken",
  badkamer: "Badkamer",
  werken: "Werken",
  sfeer: "Sfeer",
};

export type Shape =
  | "sofa"
  | "hoeksofa"
  | "fauteuil"
  | "poef"
  | "salontafel"
  | "salontafel-rond"
  | "tafel"
  | "tafel-rond"
  | "stoel"
  | "kruk"
  | "bed"
  | "nachtkastje"
  | "kleerkast"
  | "kast-laag"
  | "boekenkast"
  | "keukenkast"
  | "kookplaat"
  | "spoelbak"
  | "vaatwasser"
  | "koelkast"
  | "hoge-kast"
  | "eiland"
  | "bad"
  | "douche"
  | "lavabo"
  | "wc"
  | "radiator"
  | "wasmachine"
  | "bureau"
  | "bureaustoel"
  | "tapijt"
  | "plant"
  | "staanlamp"
  | "tv";

/** Kleurfamilie van het meubel: welke materialen je kan kiezen. */
export type Finish = "stof" | "hout" | "front" | "sanitair" | "metaal" | "tapijt" | "plant";

export interface FurnitureDef {
  id: string;
  name: string;
  category: Category;
  shape: Shape;
  w: number;
  d: number;
  h: number;
  /** Tegen een muur zetten (de rug tegen de muur), of vrij in de ruimte. */
  wall: boolean;
  /** Aanpasbare maten (min/max), anders vast. */
  resize?: { w?: [number, number]; d?: [number, number]; h?: [number, number] };
  /** Instellingen per vorm: zitplaatsen, deuren, kussens, stoelen… */
  opt?: { n?: number; left?: boolean; stoelen?: number };
  finish: Finish;
  /** Standaardkleur (zie FINISHES). */
  color: string;
}

const D = (
  id: string,
  name: string,
  category: Category,
  shape: Shape,
  [w, d, h]: [number, number, number],
  finish: Finish,
  color: string,
  extra: Partial<FurnitureDef> = {},
): FurnitureDef => ({ id, name, category, shape, w, d, h, wall: true, finish, color, ...extra });

export const LIBRARY: FurnitureDef[] = [
  // zitten
  D("sofa-2", "Zetel 2-zit", "zitten", "sofa", [180, 90, 82], "stof", "grijs", { opt: { n: 2 }, resize: { w: [140, 240] } }),
  D("sofa-3", "Zetel 3-zit", "zitten", "sofa", [225, 95, 82], "stof", "grijs", { opt: { n: 3 }, resize: { w: [190, 300] } }),
  D("hoeksofa", "Hoekzetel", "zitten", "hoeksofa", [280, 200, 82], "stof", "beige", { resize: { w: [220, 340], d: [160, 260] } }),
  D("hoeksofa-l", "Hoekzetel (links)", "zitten", "hoeksofa", [280, 200, 82], "stof", "beige", { opt: { left: true }, resize: { w: [220, 340], d: [160, 260] } }),
  D("fauteuil", "Fauteuil", "zitten", "fauteuil", [85, 85, 80], "stof", "groen", { wall: false }),
  D("poef", "Poef", "zitten", "poef", [60, 60, 42], "stof", "beige", { wall: false, resize: { w: [40, 120], d: [40, 120] } }),
  D("salontafel", "Salontafel", "zitten", "salontafel", [120, 60, 40], "hout", "eik", { wall: false, resize: { w: [80, 160], d: [50, 90] } }),
  D("salontafel-rond", "Ronde salontafel", "zitten", "salontafel-rond", [80, 80, 40], "hout", "eik", { wall: false, resize: { w: [50, 110] } }),
  D("tv-meubel", "Tv-meubel", "zitten", "kast-laag", [180, 40, 50], "hout", "eik", { opt: { n: 3 }, resize: { w: [100, 260] } }),
  D("tv", "Tv (65 inch)", "zitten", "tv", [145, 25, 85], "metaal", "zwart", { resize: { w: [100, 190] } }),

  // tafels en stoelen
  D("tafel-4", "Eettafel 4 personen", "tafels", "tafel", [140, 90, 75], "hout", "eik", { wall: false, opt: { stoelen: 4 }, resize: { w: [120, 180], d: [80, 100] } }),
  D("tafel-6", "Eettafel 6 personen", "tafels", "tafel", [200, 100, 75], "hout", "eik", { wall: false, opt: { stoelen: 6 }, resize: { w: [180, 240], d: [90, 110] } }),
  D("tafel-8", "Eettafel 8 personen", "tafels", "tafel", [260, 105, 75], "hout", "noot", { wall: false, opt: { stoelen: 8 }, resize: { w: [240, 320], d: [95, 120] } }),
  D("tafel-rond", "Ronde tafel 4 personen", "tafels", "tafel-rond", [120, 120, 75], "hout", "eik", { wall: false, opt: { stoelen: 4 }, resize: { w: [100, 150] } }),
  D("stoel", "Stoel", "tafels", "stoel", [45, 52, 82], "hout", "eik", { wall: false }),
  D("barkruk", "Barkruk", "tafels", "kruk", [40, 40, 75], "metaal", "zwart", { wall: false }),

  // slapen
  D("bed-90", "Bed 90 × 200", "slapen", "bed", [90, 200, 50], "stof", "wit", { opt: { n: 1 } }),
  D("bed-140", "Bed 140 × 200", "slapen", "bed", [140, 200, 50], "stof", "wit", { opt: { n: 2 } }),
  D("bed-160", "Bed 160 × 200", "slapen", "bed", [160, 200, 50], "stof", "wit", { opt: { n: 2 } }),
  D("bed-180", "Bed 180 × 200", "slapen", "bed", [180, 200, 50], "stof", "wit", { opt: { n: 2 } }),
  D("kinderbed", "Kinderbedje 70 × 140", "slapen", "bed", [76, 146, 90], "hout", "wit", { opt: { n: 1, left: true } }),
  D("nachtkastje", "Nachtkastje", "slapen", "nachtkastje", [45, 40, 50], "hout", "eik"),
  D("kleerkast-2", "Kleerkast 2 deuren", "slapen", "kleerkast", [100, 60, 220], "front", "wit", { opt: { n: 2 }, resize: { w: [80, 120] } }),
  D("kleerkast-3", "Kleerkast 3 deuren", "slapen", "kleerkast", [150, 60, 220], "front", "wit", { opt: { n: 3 }, resize: { w: [120, 180] } }),
  D("kleerkast-4", "Kleerkast 4 deuren", "slapen", "kleerkast", [200, 60, 220], "front", "wit", { opt: { n: 4 }, resize: { w: [160, 300] } }),
  D("commode", "Ladekast", "slapen", "kast-laag", [100, 50, 85], "hout", "eik", { opt: { n: 2 }, resize: { w: [60, 160] } }),

  // kasten
  D("boekenkast", "Boekenkast", "opbergen", "boekenkast", [100, 35, 200], "hout", "eik", { opt: { n: 5 }, resize: { w: [40, 240] } }),
  D("dressoir", "Dressoir", "opbergen", "kast-laag", [180, 45, 80], "hout", "noot", { opt: { n: 3 }, resize: { w: [120, 240] } }),
  D("kast-hoog", "Hoge kast", "opbergen", "kleerkast", [80, 40, 200], "front", "wit", { opt: { n: 2 }, resize: { w: [40, 120] } }),
  D("schoenenkast", "Schoenenkast", "opbergen", "kast-laag", [80, 30, 100], "front", "wit", { opt: { n: 2 }, resize: { w: [60, 120] } }),

  // keuken
  D("onderkast-60", "Onderkast 60", "keuken", "keukenkast", [60, 60, 90], "front", "wit", { opt: { n: 1 }, resize: { w: [30, 120] } }),
  D("onderkast-90", "Onderkast 90", "keuken", "keukenkast", [90, 60, 90], "front", "wit", { opt: { n: 2 } }),
  D("kookplaat", "Kookplaat 60", "keuken", "kookplaat", [60, 60, 90], "front", "wit", { opt: { n: 4 } }),
  D("kookplaat-90", "Kookplaat 90", "keuken", "kookplaat", [90, 60, 90], "front", "wit", { opt: { n: 5 } }),
  D("spoelbak", "Spoelbak", "keuken", "spoelbak", [80, 60, 90], "front", "wit", { opt: { n: 1 } }),
  D("spoelbak-2", "Dubbele spoelbak", "keuken", "spoelbak", [120, 60, 90], "front", "wit", { opt: { n: 2 } }),
  D("vaatwasser", "Vaatwasser", "keuken", "vaatwasser", [60, 60, 90], "front", "wit"),
  D("koelkast", "Koelkast", "keuken", "koelkast", [60, 65, 200], "front", "wit"),
  D("amerikaanse-koelkast", "Amerikaanse koelkast", "keuken", "koelkast", [91, 72, 178], "metaal", "inox", { opt: { n: 2 } }),
  D("ovenkast", "Hoge kast met oven", "keuken", "hoge-kast", [60, 60, 215], "front", "wit"),
  D("eiland", "Kookeiland", "keuken", "eiland", [240, 100, 90], "front", "wit", { wall: false, resize: { w: [150, 360], d: [80, 130] } }),
  D("eiland-kook", "Kookeiland met kookplaat", "keuken", "eiland", [240, 100, 90], "front", "wit", { wall: false, opt: { n: 1 }, resize: { w: [150, 360], d: [80, 130] } }),

  // badkamer
  D("bad-170", "Bad 170 × 75", "badkamer", "bad", [170, 75, 58], "sanitair", "wit"),
  D("bad-180", "Bad 180 × 80", "badkamer", "bad", [180, 80, 58], "sanitair", "wit"),
  D("vrijstaand-bad", "Vrijstaand bad", "badkamer", "bad", [170, 80, 60], "sanitair", "wit", { wall: false, opt: { n: 1 } }),
  D("douche-90", "Douche 90 × 90", "badkamer", "douche", [90, 90, 200], "sanitair", "wit"),
  D("douche-120", "Inloopdouche 120 × 90", "badkamer", "douche", [120, 90, 200], "sanitair", "wit", { opt: { n: 1 }, resize: { w: [90, 180], d: [80, 120] } }),
  D("lavabo", "Lavabo", "badkamer", "lavabo", [60, 46, 85], "front", "eik", { opt: { n: 1 }, resize: { w: [50, 100] } }),
  D("lavabo-2", "Dubbele lavabo", "badkamer", "lavabo", [120, 46, 85], "front", "eik", { opt: { n: 2 }, resize: { w: [100, 180] } }),
  D("wc", "Hangtoilet", "badkamer", "wc", [36, 54, 40], "sanitair", "wit"),
  D("handdoekradiator", "Handdoekradiator", "badkamer", "radiator", [50, 10, 120], "metaal", "wit", { opt: { n: 1 } }),
  D("wasmachine", "Wasmachine", "badkamer", "wasmachine", [60, 60, 85], "sanitair", "wit"),
  D("droogkast", "Droogkast", "badkamer", "wasmachine", [60, 60, 85], "sanitair", "wit"),

  // werken
  D("bureau", "Bureau", "werken", "bureau", [140, 70, 75], "hout", "eik", { resize: { w: [100, 200], d: [60, 90] } }),
  D("bureaustoel", "Bureaustoel", "werken", "bureaustoel", [62, 62, 110], "stof", "zwart", { wall: false }),
  D("archiefkast", "Archiefkast", "werken", "kast-laag", [80, 40, 110], "front", "wit", { opt: { n: 2 } }),

  // sfeer
  D("tapijt", "Tapijt", "sfeer", "tapijt", [200, 300, 1], "tapijt", "zand", { wall: false, resize: { w: [60, 400], d: [60, 400] } }),
  D("tapijt-rond", "Rond tapijt", "sfeer", "tapijt", [200, 200, 1], "tapijt", "grijs", { wall: false, opt: { n: 1 }, resize: { w: [80, 300] } }),
  D("plant", "Plant", "sfeer", "plant", [50, 50, 140], "plant", "groen", { wall: false, resize: { w: [30, 100], h: [40, 220] } }),
  D("staanlamp", "Staande lamp", "sfeer", "staanlamp", [40, 40, 160], "metaal", "zwart", { wall: false }),
  D("radiator", "Radiator", "sfeer", "radiator", [100, 10, 60], "metaal", "wit", { resize: { w: [40, 200] } }),
].map((d) => ({ ...d, w: d.w * 10, d: d.d * 10, h: d.h * 10, resize: d.resize && scaleRange(d.resize) }));

function scaleRange(r: NonNullable<FurnitureDef["resize"]>): FurnitureDef["resize"] {
  const s = (v?: [number, number]) => (v ? ([v[0] * 10, v[1] * 10] as [number, number]) : undefined);
  return { w: s(r.w), d: s(r.d), h: s(r.h) };
}

const BY_ID = new Map(LIBRARY.map((d) => [d.id, d]));
export const furnitureDef = (id: string): FurnitureDef | null => BY_ID.get(id) ?? null;

/* ------------------------------------------------------------------ */
/* Kleuren en materialen per familie                                    */
/* ------------------------------------------------------------------ */

export interface Swatch {
  id: string;
  label: string;
  color: string;
}

export const FINISHES: Record<Finish, Swatch[]> = {
  stof: [
    { id: "grijs", label: "Lichtgrijs", color: "#a7a6a2" },
    { id: "antraciet", label: "Antraciet", color: "#4a4c50" },
    { id: "beige", label: "Beige", color: "#cbbca3" },
    { id: "wit", label: "Gebroken wit", color: "#e9e5dc" },
    { id: "groen", label: "Olijfgroen", color: "#7b8261" },
    { id: "blauw", label: "Blauw", color: "#556a85" },
    { id: "roest", label: "Roest", color: "#a5603d" },
    { id: "zwart", label: "Zwart", color: "#2c2d30" },
  ],
  hout: [
    { id: "eik", label: "Eik", color: "#c09a6b" },
    { id: "noot", label: "Noot", color: "#6f4b33" },
    { id: "wit", label: "Wit gelakt", color: "#efede8" },
    { id: "zwart", label: "Zwart", color: "#2f3033" },
  ],
  front: [
    { id: "wit", label: "Wit", color: "#f1f0ec" },
    { id: "greige", label: "Greige", color: "#b8b0a3" },
    { id: "groen", label: "Saliegroen", color: "#9aa58e" },
    { id: "blauw", label: "Nachtblauw", color: "#2f3b4d" },
    { id: "eik", label: "Eik", color: "#c09a6b" },
    { id: "zwart", label: "Mat zwart", color: "#2b2c2e" },
  ],
  sanitair: [
    { id: "wit", label: "Wit", color: "#f6f6f4" },
    { id: "zwart", label: "Mat zwart", color: "#2b2c2e" },
  ],
  metaal: [
    { id: "zwart", label: "Zwart", color: "#26272a" },
    { id: "inox", label: "Inox", color: "#b9bcbf" },
    { id: "wit", label: "Wit", color: "#eeeeec" },
    { id: "messing", label: "Messing", color: "#b39257" },
  ],
  tapijt: [
    { id: "zand", label: "Zand", color: "#d7c9b0" },
    { id: "grijs", label: "Grijs", color: "#a4a29d" },
    { id: "terracotta", label: "Terracotta", color: "#b77a5a" },
    { id: "blauw", label: "Blauw", color: "#6c7f99" },
  ],
  plant: [{ id: "groen", label: "Groen", color: "#5b7a4a" }],
};

export function finishColor(def: FurnitureDef, id?: string): Swatch {
  const list = FINISHES[def.finish];
  return list.find((s) => s.id === (id ?? def.color)) ?? list.find((s) => s.id === def.color) ?? list[0];
}

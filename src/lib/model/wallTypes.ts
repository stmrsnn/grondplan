/**
 * Muurtypes zoals in de Belgische bouwpraktijk, met hun opbouw in lagen.
 *
 * De lagen staan van buiten naar binnen (bij een binnenmuur: van links naar
 * rechts, meestal symmetrisch). Alle diktes zijn ruwbouwmaten in mm, zonder
 * pleisterwerk, zoals op een bouwplan.
 */
import type { Wall } from "./types";

export type Material =
  | "gevelsteen"
  | "snelbouw"
  | "baksteen"
  | "gipsblok"
  | "isolatie" // harde isolatie (PIR/PUR, EPS)
  | "wol" // zachte isolatie (minerale wol)
  | "spouw" // luchtspouw
  | "beton"
  | "gips"; // gipskartonplaat

export interface Layer {
  material: Material;
  thickness: number;
}

export interface WallType {
  id: string;
  name: string;
  /** Uitleg in één zin voor leken. */
  hint: string;
  layers: Layer[];
  /** Bedoeld als gevel (heeft een binnen- en buitenkant). */
  exterior: boolean;
  loadBearing: boolean;
}

export const MATERIAL_LABEL: Record<Material, string> = {
  gevelsteen: "Gevelsteen",
  snelbouw: "Snelbouwsteen",
  baksteen: "Volle baksteen",
  gipsblok: "Gipsblok",
  isolatie: "Isolatie (PIR)",
  wol: "Minerale wol",
  spouw: "Luchtspouw",
  beton: "Beton",
  gips: "Gipsplaat",
};

export const WALL_TYPES: WallType[] = [
  {
    id: "spouw-38",
    name: "Spouwmuur 38 cm",
    hint: "Nieuwbouw volgens EPB: gevelsteen, luchtspouw, 12 cm isolatie en een dragend binnenblad.",
    exterior: true,
    loadBearing: true,
    layers: [
      { material: "gevelsteen", thickness: 90 },
      { material: "spouw", thickness: 30 },
      { material: "isolatie", thickness: 120 },
      { material: "snelbouw", thickness: 140 },
    ],
  },
  {
    id: "spouw-35",
    name: "Spouwmuur 35 cm",
    hint: "Iets oudere spouwmuur met 9 cm isolatie.",
    exterior: true,
    loadBearing: true,
    layers: [
      { material: "gevelsteen", thickness: 90 },
      { material: "spouw", thickness: 30 },
      { material: "isolatie", thickness: 90 },
      { material: "snelbouw", thickness: 140 },
    ],
  },
  {
    id: "vol-29",
    name: "Volle muur 29 cm",
    hint: "Bestaande gevel zonder isolatie, typisch voor oudere woningen.",
    exterior: true,
    loadBearing: true,
    layers: [{ material: "baksteen", thickness: 290 }],
  },
  {
    id: "vol-29-iso",
    name: "Volle muur + binnenisolatie",
    hint: "Oude volle muur, aan de binnenkant geïsoleerd en afgewerkt met gipsplaat.",
    exterior: true,
    loadBearing: true,
    layers: [
      { material: "baksteen", thickness: 290 },
      { material: "isolatie", thickness: 60 },
      { material: "gips", thickness: 13 },
    ],
  },
  {
    id: "binnen-14",
    name: "Dragende binnenmuur 14 cm",
    hint: "Snelbouwsteen die vloeren draagt.",
    exterior: false,
    loadBearing: true,
    layers: [{ material: "snelbouw", thickness: 140 }],
  },
  {
    id: "binnen-9",
    name: "Binnenmuur 9 cm",
    hint: "Niet-dragende scheidingsmuur in snelbouwsteen.",
    exterior: false,
    loadBearing: false,
    layers: [{ material: "snelbouw", thickness: 90 }],
  },
  {
    id: "binnen-10",
    name: "Gipsblokken 10 cm",
    hint: "Lichte, niet-dragende scheidingsmuur.",
    exterior: false,
    loadBearing: false,
    layers: [{ material: "gipsblok", thickness: 100 }],
  },
  {
    id: "gipswand-10",
    name: "Gipskartonwand 10 cm",
    hint: "Metalen profielen met minerale wol, aan beide kanten een gipsplaat.",
    exterior: false,
    loadBearing: false,
    layers: [
      { material: "gips", thickness: 13 },
      { material: "wol", thickness: 74 },
      { material: "gips", thickness: 13 },
    ],
  },
  {
    id: "beton-20",
    name: "Betonwand 20 cm",
    hint: "Gegoten of geprefabriceerd beton, bv. voor een kelder.",
    exterior: false,
    loadBearing: true,
    layers: [{ material: "beton", thickness: 200 }],
  },
];

const BY_ID = new Map(WALL_TYPES.map((t) => [t.id, t]));

export function wallType(id: string | undefined): WallType | null {
  return (id && BY_ID.get(id)) || null;
}

export function typeThickness(t: WallType): number {
  return t.layers.reduce((s, l) => s + l.thickness, 0);
}

export const DEFAULT_EXTERIOR_TYPE = "spouw-38";
export const DEFAULT_INTERIOR_TYPE = "binnen-9";

/**
 * Lagen van een muur. Een muur zonder (passend) type wordt getekend als één
 * laag metselwerk van zijn dikte.
 */
export function wallLayers(w: Pick<Wall, "type" | "thickness" | "kind">): Layer[] {
  const t = wallType(w.type);
  if (t && typeThickness(t) === w.thickness) return t.layers;
  return [{ material: w.kind === "exterior" ? "baksteen" : "snelbouw", thickness: w.thickness }];
}

/** Het type dat bij een dikte hoort (om oude plannen een opbouw te geven). */
export function typeForThickness(thickness: number, kind: Wall["kind"]): string | undefined {
  const fits = WALL_TYPES.filter((t) => typeThickness(t) === thickness);
  return (fits.find((t) => t.exterior === (kind === "exterior")) ?? fits[0])?.id;
}

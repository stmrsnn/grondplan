/**
 * Afwerking voor de 3D-weergave: vloeren, muurkleuren en de gevel. Elke
 * ruimte krijgt een logische standaard volgens haar functie; je kan die per
 * ruimte wijzigen.
 */

export type FloorKind = "plank" | "tegel" | "glad" | "zacht";

export interface FloorFinish {
  id: string;
  label: string;
  kind: FloorKind;
  /** Basiskleur(en) om de textuur te maken en voor het staaltje. */
  color: string;
  /** Plank- of tegelmaat in mm (lengte × breedte). */
  size?: [number, number];
}

export const FLOORS: FloorFinish[] = [
  { id: "parket", label: "Parket eik", kind: "plank", color: "#c69a6a", size: [1400, 180] },
  { id: "parket-donker", label: "Parket noot", kind: "plank", color: "#7a5236", size: [1400, 180] },
  { id: "laminaat", label: "Laminaat grijs eik", kind: "plank", color: "#a8a092", size: [1300, 190] },
  { id: "tegels", label: "Tegels lichtgrijs", kind: "tegel", color: "#cfccc6", size: [600, 600] },
  { id: "tegels-beige", label: "Tegels zandkleur", kind: "tegel", color: "#d8cbb3", size: [600, 600] },
  { id: "tegels-donker", label: "Tegels antraciet", kind: "tegel", color: "#55585c", size: [600, 600] },
  { id: "gietvloer", label: "Gietvloer", kind: "glad", color: "#a9a7a2" },
  { id: "vinyl", label: "Vinyl licht hout", kind: "plank", color: "#d6bf9c", size: [1220, 180] },
  { id: "tapijt", label: "Tapijt beige", kind: "zacht", color: "#cdbfa8" },
];

export interface Paint {
  id: string;
  label: string;
  color: string;
}

export const WALL_COLORS: Paint[] = [
  { id: "wit", label: "Wit", color: "#f5f4f0" },
  { id: "gebroken-wit", label: "Gebroken wit", color: "#ede7dc" },
  { id: "zand", label: "Zand", color: "#e2d5c0" },
  { id: "salie", label: "Saliegroen", color: "#c4ccb6" },
  { id: "blauwgrijs", label: "Blauwgrijs", color: "#b9c4cb" },
  { id: "oudroze", label: "Oudroze", color: "#e3cbc3" },
  { id: "terracotta", label: "Terracotta", color: "#c9906f" },
  { id: "antraciet", label: "Antraciet", color: "#54585d" },
];

export interface Facade {
  id: string;
  label: string;
  kind: "steen" | "crepi";
  /** Kleur van de steen (met wat variatie) en van de voeg. */
  color: string;
  joint: string;
}

export const FACADES: Facade[] = [
  { id: "rood", label: "Rode baksteen", kind: "steen", color: "#9c4a32", joint: "#c9c2b6" },
  { id: "bruin", label: "Bruine baksteen", kind: "steen", color: "#6e4a3a", joint: "#a39c90" },
  { id: "beige", label: "Beige baksteen", kind: "steen", color: "#c9ab82", joint: "#e2dccf" },
  { id: "wit", label: "Witte baksteen", kind: "steen", color: "#e7e2d8", joint: "#f2efe8" },
  { id: "grijs", label: "Grijze baksteen", kind: "steen", color: "#8c8b87", joint: "#bdbab3" },
  { id: "zwart", label: "Zwarte baksteen", kind: "steen", color: "#34363a", joint: "#5c5d60" },
  { id: "crepi", label: "Witte crepi", kind: "crepi", color: "#f1efea", joint: "#f1efea" },
];

const NAT = new Set(["badkamer", "toilet", "wasplaats"]);

/** Vloer van een ruimte: de gekozen, anders de standaard voor de functie. */
export function floorOf(room: { function: string; floorFinish?: string }): FloorFinish {
  const chosen = FLOORS.find((f) => f.id === room.floorFinish);
  if (chosen) return chosen;
  const fn = room.function;
  const id = fn === "keuken" || NAT.has(fn) ? "tegels" : fn === "garage" || fn === "technisch" || fn === "berging" ? "gietvloer" : "parket";
  return FLOORS.find((f) => f.id === id)!;
}

export function wallColorOf(room: { function: string; wallColor?: string }): Paint {
  return WALL_COLORS.find((c) => c.id === room.wallColor) ?? WALL_COLORS.find((c) => c.id === (NAT.has(room.function) ? "wit" : "gebroken-wit"))!;
}

export function facadeOf(id: string | undefined): Facade {
  return FACADES.find((f) => f.id === id) ?? FACADES[0];
}

/** Een staaltje als CSS-achtergrond (voor de keuzeknoppen). */
export function floorSwatch(f: FloorFinish): string {
  if (f.kind === "plank")
    return `repeating-linear-gradient(0deg, rgb(0 0 0 / 0.14) 0 1px, transparent 1px 7px), linear-gradient(90deg, ${f.color}, color-mix(in srgb, ${f.color} 82%, black) 50%, ${f.color})`;
  if (f.kind === "tegel")
    return `linear-gradient(90deg, rgb(255 255 255 / 0.55) 1px, transparent 1px) 0 0 / 14px 14px, linear-gradient(0deg, rgb(255 255 255 / 0.55) 1px, transparent 1px) 0 0 / 14px 14px, ${f.color}`;
  return f.color;
}

export function facadeSwatch(f: Facade): string {
  if (f.kind === "crepi") return f.color;
  return `linear-gradient(0deg, ${f.joint} 1px, transparent 1px) 0 0 / 12px 5px, linear-gradient(90deg, ${f.joint} 1px, transparent 1px) 0 0 / 12px 10px, ${f.color}`;
}

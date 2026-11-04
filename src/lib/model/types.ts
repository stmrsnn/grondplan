/**
 * Het projectdocument. Eén project = één JSON-document met een versienummer.
 * Alle maten zijn gehele millimeters. Coördinaten: x naar rechts, y naar beneden
 * (zoals op een scherm), oorsprong vrij te kiezen.
 *
 * Afgeleide gegevens (ruimtes uit gesloten muren, 3D-model) worden NIET bewaard
 * als bron van waarheid; ruimtes bewaren enkel wat de gebruiker eraan toevoegt
 * (naam, functie, vloerafwerking), gekoppeld aan hun muren.
 */

/**
 * Versiegeschiedenis van het schema:
 *  1 – verdiepingen, muren, openingen, ruimtes, meubels
 *  2 – startkeuze, standaardmuren, maatafspraak, noordrichting
 *  3 – muren en ruimtes worden getekend; "één kamer" krijgt meteen haar muren
 */
export const SCHEMA_VERSION = 3;

export type Id = string;

export interface ProjectDoc {
  schemaVersion: typeof SCHEMA_VERSION;
  name: string;
  /** Waarmee de gebruiker begon (welkomstvraag); stuurt de eerste stappen. */
  start: StartChoice;
  settings: ProjectSettings;
  floors: Floor[];
}

export type StartChoice =
  | { kind: "house" }
  | { kind: "room"; width: number; depth: number; roomFunction: string }
  | { kind: "trace" }
  | { kind: "example" };

/**
 * Hoe maten op het plan gelezen worden.
 *  - "inside": binnenmaten, van afgewerkte muur tot afgewerkte muur (zoals een leek meet)
 */
export type MeasureMode = "inside";

export interface WallDefaults {
  /** Buitenmuur (spouwmuur met isolatie), in mm. */
  exterior: number;
  /** Binnenmuur, in mm. */
  interior: number;
}

export interface ProjectSettings {
  /** Magnetisch raster aan of uit. */
  snapToGrid: boolean;
  /** Rasterstap in mm (standaard 50 = 5 cm). */
  gridSize: number;
  measureMode: MeasureMode;
  wallDefaults: WallDefaults;
  /** Waar het noorden ligt, in graden met de klok mee vanaf "boven op het scherm". */
  northAngle: number;
}

export interface Floor {
  id: Id;
  name: string;
  /** Peil van de afgewerkte vloer t.o.v. het gelijkvloers, in mm. */
  elevation: number;
  /** Vrije hoogte tot het plafond, in mm. */
  height: number;
  nodes: Node[];
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  items: Item[];
}

/** Knooppunt dat door meerdere muren gedeeld kan worden. */
export interface Node {
  id: Id;
  x: number;
  y: number;
}

export type WallKind = "exterior" | "interior";

export interface Wall {
  id: Id;
  start: Id; // Node.id
  end: Id; // Node.id
  thickness: number;
  height: number;
  kind: WallKind;
  loadBearing: boolean;
}

export type OpeningKind = "door" | "window" | "passage";

export interface Opening {
  id: Id;
  wall: Id;
  kind: OpeningKind;
  /** Afstand van het begin van de muur tot het midden van de opening, in mm. */
  offset: number;
  width: number;
  height: number;
  /** Borstwering (hoogte onderkant raam boven de vloer), in mm. */
  sillHeight: number;
  /** Deuren: aan welke kant van de muur draait het blad, en waar zitten de scharnieren. */
  swing?: { side: "left" | "right"; hinge: "start" | "end" };
}

export interface Room {
  id: Id;
  /** Muren die de ruimte omsluiten, om ze terug te vinden na een wijziging. */
  walls: Id[];
  name: string;
  function: string;
  floorFinish: string;
}

export interface Item {
  id: Id;
  /** Verwijzing naar de bibliotheek, bv. "bed-160x200". */
  libraryRef: string;
  x: number;
  y: number;
  /** Draaiing in graden, met de klok mee. */
  rotation: number;
  width: number;
  depth: number;
  height: number;
  material?: string;
  color?: string;
}

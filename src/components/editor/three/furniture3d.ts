/**
 * Meubels in 3D: per soort een gedetailleerd model uit eenvoudige vormen
 * (afgeronde blokken, cilinders, gedraaide profielen), met echte materialen:
 * stof met glans, hout met nerf, lak, keramiek, inox, glas en planten.
 *
 * Alles in meter, in de eigen assen van het meubel: x = breedte, y = hoogte,
 * z = diepte met de rug aan z = -d/2 (zoals op het plan).
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { FurnitureDef } from "@/lib/furniture/library";

/** Materiaalsleutels; de kijker maakt er materialen van. */
export type FMat =
  | `stof:${string}`
  | `hout:${string}`
  | `lak:${string}`
  | `metaal:${string}`
  | "chroom"
  | "inox"
  | "keramiek"
  | "glas"
  | "zwartglas"
  | "spiegel"
  | "steen"
  | "linnen"
  | "loof"
  | "aarde"
  | "pot"
  | "kap"
  | `boek:${number}`;

type Parts = Map<FMat, THREE.BufferGeometry[]>;

class Builder {
  parts: Parts = new Map();
  add(mat: FMat, g: THREE.BufferGeometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
    g.translate(x, y, z);
    const geo = g.index ? g.toNonIndexed() : g;
    if (geo !== g) g.dispose();
    for (const k of Object.keys(geo.attributes)) if (!["position", "normal", "uv"].includes(k)) geo.deleteAttribute(k);
    (this.parts.get(mat) ?? this.parts.set(mat, []).get(mat)!).push(geo);
  }
  /** Blok met afgeronde randen, met het midden van de onderkant op (x, y0, z). */
  box(mat: FMat, w: number, h: number, d: number, x: number, y0: number, z: number, r = 0.004, ry = 0) {
    const rr = Math.max(0.0005, Math.min(r, w / 2 - 0.0005, h / 2 - 0.0005, d / 2 - 0.0005));
    const g = r > 0.0006 ? new RoundedBoxGeometry(w, h, d, r > 0.02 ? 4 : 2, rr) : new THREE.BoxGeometry(w, h, d);
    this.add(mat, g, x, y0 + h / 2, z, 0, ry);
  }
  cyl(mat: FMat, r: number, h: number, x: number, y0: number, z: number, seg = 20, r2 = r) {
    this.add(mat, new THREE.CylinderGeometry(r2, r, h, seg), x, y0 + h / 2, z);
  }
  /** Gedraaid profiel [straal, hoogte] rond de y-as. */
  lathe(mat: FMat, profile: [number, number][], x: number, y0: number, z: number, sx = 1, sz = 1, seg = 40) {
    const g = new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(r, h)), seg);
    g.scale(sx, 1, sz);
    this.add(mat, g, x, y0, z);
  }
  /** Plaat uit een vlakke vorm met gaten (bv. een wastafelblad), dikte h. */
  slab(mat: FMat, shape: THREE.Shape, h: number, y0: number) {
    const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 24 });
    g.rotateX(-Math.PI / 2);
    this.add(mat, g, 0, y0, 0);
  }
}

/** Afgeronde rechthoek als vorm in (x, -z), voor slab(). */
function roundRect(x0: number, z0: number, x1: number, z1: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  path(s, x0, z0, x1, z1, r);
  return s;
}
function path(p: THREE.Path, x0: number, z0: number, x1: number, z1: number, r: number) {
  // vorm ligt in het xy-vlak; na rotateX(-90°) wordt y → -z
  const a = Math.min(x0, x1);
  const b = Math.max(x0, x1);
  const c = -Math.max(z0, z1);
  const d = -Math.min(z0, z1);
  const rr = Math.min(r, (b - a) / 2, (d - c) / 2);
  p.moveTo(a + rr, c);
  p.lineTo(b - rr, c);
  p.quadraticCurveTo(b, c, b, c + rr);
  p.lineTo(b, d - rr);
  p.quadraticCurveTo(b, d, b - rr, d);
  p.lineTo(a + rr, d);
  p.quadraticCurveTo(a, d, a, d - rr);
  p.lineTo(a, c + rr);
  p.quadraticCurveTo(a, c, a + rr, c);
}
function ellipseShape(cx: number, cz: number, rx: number, rz: number, hole = false): THREE.Path {
  const p = hole ? new THREE.Path() : new THREE.Shape();
  p.absellipse(cx, -cz, rx, rz, 0, Math.PI * 2, false, 0);
  return p;
}

let seed = 3;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/* ------------------------------------------------------------------ */
/* Onderdelen die vaker terugkomen                                      */
/* ------------------------------------------------------------------ */

function chair(b: Builder, x: number, z: number, angle: number, wood: FMat, seat: FMat) {
  const sub = new Builder();
  const w = 0.44;
  const d = 0.46;
  for (const [lx, lz] of [[-w / 2 + 0.03, -d / 2 + 0.03], [w / 2 - 0.03, -d / 2 + 0.03], [-w / 2 + 0.03, d / 2 - 0.03], [w / 2 - 0.03, d / 2 - 0.03]])
    sub.cyl(wood, 0.015, 0.44, lx, 0, lz, 10, 0.012);
  sub.box(seat, w, 0.05, d, 0, 0.44, 0, 0.02);
  // rugleuning: twee staanders en een gebogen plank
  sub.box(wood, 0.025, 0.42, 0.025, -w / 2 + 0.03, 0.46, -d / 2 + 0.03, 0.006);
  sub.box(wood, 0.025, 0.42, 0.025, w / 2 - 0.03, 0.46, -d / 2 + 0.03, 0.006);
  sub.box(wood, w - 0.02, 0.14, 0.022, 0, 0.7, -d / 2 + 0.03, 0.008);
  for (const [mat, gs] of sub.parts) for (const g of gs) b.add(mat, g, x, 0, z, 0, angle);
}

function legs(b: Builder, mat: FMat, w: number, d: number, h: number, inset: number, r = 0.018, taper = 0.7) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(mat, r * taper, h, sx * (w / 2 - inset), 0, sz * (d / 2 - inset), 14, r);
}

function cushionRow(b: Builder, mat: FMat, n: number, x0: number, x1: number, y: number, z0: number, z1: number, h: number) {
  const cw = (x1 - x0) / n;
  for (let i = 0; i < n; i++) b.box(mat, cw - 0.012, h, z1 - z0, x0 + cw * (i + 0.5), y, (z0 + z1) / 2, Math.min(0.06, h / 2.2));
}

/** Een zetelstuk (rechte zetel of een deel van een hoekzetel). */
function sofaPart(b: Builder, fab: FMat, legMat: FMat, w: number, d: number, seats: number, arms: [boolean, boolean], xOff = 0, zOff = 0, ry = 0) {
  const s = new Builder();
  const arm = 0.16;
  const back = 0.2;
  const base = 0.12;
  const seatH = 0.43;
  // poten
  for (const [lx, lz] of [[-w / 2 + 0.06, -d / 2 + 0.06], [w / 2 - 0.06, -d / 2 + 0.06], [-w / 2 + 0.06, d / 2 - 0.06], [w / 2 - 0.06, d / 2 - 0.06]])
    s.cyl(legMat, 0.016, base, lx, 0, lz, 12, 0.02);
  const ax0 = arms[0] ? -w / 2 + arm : -w / 2;
  const ax1 = arms[1] ? w / 2 - arm : w / 2;
  // onderstel
  s.box(fab, w, 0.2, d, 0, base, 0, 0.03);
  // zitkussens
  cushionRow(s, fab, seats, ax0, ax1, base + 0.2, -d / 2 + back, d / 2 - 0.02, seatH - base - 0.2 + 0.03);
  // rug
  s.box(fab, w, 0.42, back, 0, base + 0.18, -d / 2 + back / 2, 0.05);
  // rugkussens, iets achterover
  const cw = (ax1 - ax0) / seats;
  for (let i = 0; i < seats; i++) {
    const g = new RoundedBoxGeometry(cw - 0.02, 0.4, 0.17, 4, 0.07);
    g.rotateX(-0.16);
    s.add(fab, g, ax0 + cw * (i + 0.5), seatH + 0.22, -d / 2 + back + 0.07);
  }
  // armleuningen
  if (arms[0]) s.box(fab, arm, 0.62 - base, d, -w / 2 + arm / 2, base, 0, 0.06);
  if (arms[1]) s.box(fab, arm, 0.62 - base, d, w / 2 - arm / 2, base, 0, 0.06);
  for (const [mat, gs] of s.parts) for (const g of gs) b.add(mat, g, xOff, 0, zOff, 0, ry);
}

function plinthCabinet(b: Builder, front: FMat, w: number, d: number, h: number, doors: number, drawers = false) {
  // sokkel, kast, fronten met naden, greep
  b.box("lak:#2b2c2e", w - 0.01, 0.1, d - 0.07, 0, 0, -0.03, 0);
  b.box(front, w - 0.004, h - 0.1, d - 0.04, 0, 0.1, -0.02, 0.002);
  const fw = (w - 0.006) / doors;
  for (let i = 0; i < doors; i++) {
    const cx = -w / 2 + 0.003 + fw * (i + 0.5);
    if (drawers) {
      const rows = 3;
      const rh = (h - 0.1 - 0.012) / rows;
      for (let r = 0; r < rows; r++) {
        b.box(front, fw - 0.004, rh - 0.004, 0.019, cx, 0.104 + r * rh, d / 2 - 0.01, 0.002);
        b.box("inox", Math.min(0.2, fw * 0.5), 0.012, 0.012, cx, 0.104 + r * rh + rh - 0.05, d / 2 + 0.006, 0.004);
      }
    } else {
      b.box(front, fw - 0.004, h - 0.106, 0.019, cx, 0.104, d / 2 - 0.01, 0.002);
      const hx = doors === 1 ? cx + fw / 2 - 0.05 : i % 2 === 0 ? cx + fw / 2 - 0.05 : cx - fw / 2 + 0.05;
      b.box("inox", 0.012, Math.min(0.2, h * 0.25), 0.012, hx, h - 0.06 - Math.min(0.2, h * 0.25), d / 2 + 0.006, 0.004);
    }
  }
}

function worktop(b: Builder, w: number, d: number, y: number) {
  b.box("steen", w, 0.04, d + 0.02, 0, y, 0.01, 0.003);
}

function upperCabinet(b: Builder, front: FMat, w: number, d: number) {
  // bovenkast tegen de muur, van 1,45 tot 2,15 m
  const doors = Math.max(1, Math.round(w / 0.6));
  const ud = 0.35;
  b.box(front, w - 0.004, 0.7, ud - 0.02, 0, 1.45, -d / 2 + ud / 2 - 0.01, 0.002);
  const fw = w / doors;
  for (let i = 0; i < doors; i++) b.box(front, fw - 0.004, 0.696, 0.019, -w / 2 + fw * (i + 0.5), 1.452, -d / 2 + ud, 0.002);
}

/* ------------------------------------------------------------------ */
/* Per soort                                                            */
/* ------------------------------------------------------------------ */

export interface FurnitureLook {
  /** Kleur van de gekozen afwerking. */
  color: string;
}

export function buildFurniture(def: FurnitureDef, W: number, D: number, H: number, look: FurnitureLook): Parts {
  seed = 7;
  const b = new Builder();
  const w = W / 1000;
  const d = D / 1000;
  const h = H / 1000;
  const c = look.color;
  const fab: FMat = `stof:${c}`;
  const wood: FMat = `hout:${def.finish === "hout" ? c : "#c09a6b"}`;
  const front: FMat = def.finish === "front" ? (c === "#c09a6b" ? `hout:${c}` : `lak:${c}`) : "lak:#f1f0ec";
  const n = def.opt?.n ?? 1;
  switch (def.shape) {
    case "sofa":
      sofaPart(b, fab, "metaal:#26272a", w, d, n, [true, true]);
      break;
    case "fauteuil":
      sofaPart(b, fab, "hout:#6f4b33", w, d, 1, [true, true]);
      break;
    case "hoeksofa": {
      const left = !def.opt?.left;
      const seat = Math.min(1.0, d * 0.5);
      // L: lange deel met rug langs de achterkant, zijdeel met rug tegen de zijkant,
      // armleuningen aan beide open uiteinden
      const sx = left ? -1 : 1;
      const legMat: FMat = "metaal:#26272a";
      sofaPart(b, fab, legMat, w - seat, seat, Math.max(1, Math.round((w - seat) / 0.8)), left ? [false, true] : [true, false], -sx * (seat / 2), -d / 2 + seat / 2);
      // zijdeel gedraaid: rug naar de zijkant (buiten), lokale -x wordt de voorkant
      sofaPart(b, fab, legMat, d, seat, Math.max(1, Math.round(d / 0.9)), left ? [true, false] : [false, true], sx * (w / 2 - seat / 2), 0, left ? Math.PI / 2 : -Math.PI / 2);
      // rug in de hoek dichten
      b.box(fab, seat - 0.2, 0.42, 0.2, sx * (w / 2 - (seat + 0.2) / 2), 0.3, -d / 2 + 0.1, 0.05);
      break;
    }
    case "poef":
      b.box(fab, w, h, d, 0, 0, 0, Math.min(w, d) * 0.2);
      break;
    case "salontafel":
      b.box(wood, w, 0.035, d, 0, h - 0.035, 0, 0.008);
      b.box(wood, w - 0.1, 0.02, d - 0.1, 0, 0.12, 0, 0.004);
      legs(b, wood, w, d, h - 0.035, 0.05, 0.022);
      break;
    case "salontafel-rond":
      b.cyl(wood, w / 2, 0.035, 0, h - 0.035, 0, 48);
      b.cyl("metaal:#26272a", 0.03, h - 0.035, 0, 0, 0, 16);
      b.cyl("metaal:#26272a", w * 0.3, 0.015, 0, 0, 0, 40);
      break;
    case "tafel": {
      b.box(wood, w, 0.04, d, 0, h - 0.04, 0, 0.006);
      b.box(wood, w - 0.16, 0.08, 0.025, 0, h - 0.12, -d / 2 + 0.07, 0.003);
      b.box(wood, w - 0.16, 0.08, 0.025, 0, h - 0.12, d / 2 - 0.07, 0.003);
      legs(b, wood, w, d, h - 0.04, 0.06, 0.03, 0.75);
      const k = def.opt?.stoelen ?? 4;
      const ends = k >= 6 ? 2 : 0;
      const per = Math.max(1, Math.round((k - ends) / 2));
      for (let i = 0; i < per; i++) {
        const x = -w / 2 + (w / per) * (i + 0.5);
        chair(b, x, -d / 2 - 0.02, 0, wood, "stof:#a7a6a2");
        chair(b, x, d / 2 + 0.02, Math.PI, wood, "stof:#a7a6a2");
      }
      if (ends) {
        chair(b, -w / 2 - 0.02, 0, Math.PI / 2, wood, "stof:#a7a6a2");
        chair(b, w / 2 + 0.02, 0, -Math.PI / 2, wood, "stof:#a7a6a2");
      }
      break;
    }
    case "tafel-rond": {
      b.cyl(wood, w / 2, 0.04, 0, h - 0.04, 0, 56);
      b.cyl(wood, 0.06, h - 0.04, 0, 0, 0, 20, 0.05);
      b.cyl(wood, w * 0.25, 0.03, 0, 0, 0, 40);
      const k = def.opt?.stoelen ?? 4;
      for (let i = 0; i < k; i++) {
        const a = (i / k) * Math.PI * 2 + Math.PI / 4;
        const r = w / 2 + 0.02;
        chair(b, Math.cos(a) * r, Math.sin(a) * r, -a - Math.PI / 2, wood, "stof:#a7a6a2");
      }
      break;
    }
    case "stoel":
      chair(b, 0, 0, 0, wood, "stof:#a7a6a2");
      break;
    case "kruk":
      b.cyl(fab.startsWith("stof") ? fab : "hout:#c09a6b", w / 2, 0.04, 0, h - 0.04, 0, 32);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const g = new THREE.CylinderGeometry(0.01, 0.012, h - 0.04, 10);
        g.rotateZ(0.08);
        b.add(`metaal:${c}`, g, Math.cos(a) * (w / 2 - 0.06), (h - 0.04) / 2, Math.sin(a) * (w / 2 - 0.06), 0, -a);
      }
      b.add(`metaal:${c}`, new THREE.TorusGeometry(w / 2 - 0.05, 0.008, 8, 32), 0, 0.28, 0, Math.PI / 2);
      break;
    case "bed": {
      if (def.opt?.left) {
        // kinderbedje met spijlen
        b.box(wood, w, 0.04, d, 0, 0.25, 0, 0.004);
        b.box("linnen", w - 0.08, 0.1, d - 0.08, 0, 0.29, 0, 0.03);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(wood, 0.04, h, 0.04, sx * (w / 2 - 0.02), 0, sz * (d / 2 - 0.02), 0.005);
        for (let x = -w / 2 + 0.08; x < w / 2 - 0.05; x += 0.07) {
          b.cyl(wood, 0.011, h - 0.3, x, 0.29, -d / 2 + 0.02, 8);
          b.cyl(wood, 0.011, h - 0.3, x, 0.29, d / 2 - 0.02, 8);
        }
        for (let z = -d / 2 + 0.08; z < d / 2 - 0.05; z += 0.07) {
          b.cyl(wood, 0.011, h - 0.3, -w / 2 + 0.02, 0.29, z, 8);
          b.cyl(wood, 0.011, h - 0.3, w / 2 - 0.02, 0.29, z, 8);
        }
        for (const z of [-d / 2 + 0.02, d / 2 - 0.02]) b.box(wood, w, 0.03, 0.04, 0, h - 0.03, z, 0.005);
        break;
      }
      const head = 0.08;
      // gestoffeerd bed: bodem, matras, hoofdbord, dekbed, kussens
      legs(b, "hout:#6f4b33", w, d - head, 0.08, 0.08, 0.02);
      b.box(fab, w, 0.24, d - head, 0, 0.08, head / 2, 0.02);
      b.box("linnen", w - 0.03, 0.22, d - head - 0.04, 0, 0.3, head / 2, 0.07);
      b.box(fab, w + 0.04, 1.05, head, 0, 0.08, -d / 2 + head / 2, 0.025);
      // gecapitonneerd: paneel met naden
      b.box(fab, w - 0.04, 0.55, 0.04, 0, 0.5, -d / 2 + head + 0.01, 0.03);
      const pw = n === 1 ? w - 0.2 : (w - 0.24) / 2;
      for (let i = 0; i < n; i++) {
        const g = new RoundedBoxGeometry(pw, 0.13, 0.42, 5, 0.06);
        g.rotateX(-0.35);
        b.add("linnen", g, -w / 2 + 0.1 + pw / 2 + i * (pw + 0.04), 0.6, -d / 2 + head + 0.28);
      }
      // dekbed: hangt aan de zijkanten over, bovenaan teruggeslagen
      const dz0 = -d / 2 + head + 0.62;
      const duvet = `stof:${c === "#e9e5dc" ? "#d9d4c8" : c}` as FMat;
      b.box(duvet, w + 0.06, 0.07, d / 2 + d / 2 - head - 0.62 + 0.04, 0, 0.5, (dz0 + d / 2 + 0.04) / 2, 0.035);
      b.box(duvet, w + 0.06, 0.25, 0.05, 0, 0.3, d / 2 + 0.015, 0.03);
      b.box(duvet, 0.05, 0.22, d - head - 0.62, -w / 2 - 0.015, 0.32, (dz0 + d / 2) / 2, 0.025);
      b.box(duvet, 0.05, 0.22, d - head - 0.62, w / 2 + 0.015, 0.32, (dz0 + d / 2) / 2, 0.025);
      b.box("linnen", w + 0.07, 0.075, 0.3, 0, 0.51, dz0 + 0.1, 0.035);
      // plaid aan het voeteneind
      b.box("stof:#a5603d", w + 0.08, 0.02, 0.45, 0, 0.57, d / 2 - 0.35, 0.01);
      break;
    }
    case "nachtkastje":
      b.box(wood, w, h - 0.12, d, 0, 0.12, 0, 0.006);
      legs(b, wood, w - 0.02, d - 0.02, 0.12, 0.03, 0.012);
      b.box(wood, w - 0.03, 0.002, 0.004, 0, h - 0.2, d / 2, 0);
      b.box("metaal:#b39257", 0.08, 0.012, 0.015, 0, h - 0.13, d / 2 + 0.006, 0.004);
      // lampje
      b.cyl("metaal:#b39257", 0.05, 0.012, w * 0.15, h, -0.02, 20);
      b.cyl("metaal:#b39257", 0.006, 0.28, w * 0.15, h, -0.02, 8);
      b.lathe("kap", [[0.06, 0], [0.09, 0], [0.07, 0.16], [0.06, 0.16]], w * 0.15, h + 0.2, -0.02);
      break;
    case "kleerkast":
    case "hoge-kast": {
      const doors = def.shape === "hoge-kast" ? 1 : n;
      b.box(front, w - 0.004, h - 0.03, d - 0.022, 0, 0.03, -0.011, 0.002);
      b.box("lak:#2b2c2e", w - 0.02, 0.03, d - 0.05, 0, 0, -0.02, 0);
      const fw = w / doors;
      for (let i = 0; i < doors; i++) {
        const cx = -w / 2 + fw * (i + 0.5);
        b.box(front, fw - 0.004, h - 0.036, 0.019, cx, 0.033, d / 2 - 0.0095, 0.002);
        const hx = i % 2 === 0 ? cx + fw / 2 - 0.04 : cx - fw / 2 + 0.04;
        if (def.shape === "hoge-kast") {
          // oven in de kast
          b.box("zwartglas", fw - 0.03, 0.6, 0.012, cx, 0.9, d / 2 + 0.002, 0.004);
          b.box("inox", fw - 0.1, 0.015, 0.02, cx, 1.43, d / 2 + 0.015, 0.005);
          b.box("inox", 0.012, 0.3, 0.012, cx + fw / 2 - 0.04, 1.65, d / 2 + 0.006, 0.004);
          b.box("inox", 0.012, 0.3, 0.012, cx + fw / 2 - 0.04, 0.45, d / 2 + 0.006, 0.004);
        } else b.box("metaal:#26272a", 0.012, 0.35, 0.014, hx, h / 2 - 0.1, d / 2 + 0.007, 0.004);
      }
      break;
    }
    case "kast-laag": {
      const drawers = def.id === "commode";
      const legH = 0.12;
      legs(b, def.finish === "hout" ? wood : "metaal:#26272a", w - 0.02, d - 0.02, legH, 0.04, 0.014);
      const mat = def.finish === "hout" ? wood : front;
      b.box(mat, w, h - legH, d - 0.02, 0, legH, -0.01, 0.004);
      const k = Math.max(1, n);
      const fw = (w - 0.02) / k;
      for (let i = 0; i < k; i++) {
        const cx = -w / 2 + 0.01 + fw * (i + 0.5);
        if (drawers) {
          const rh = (h - legH - 0.03) / 3;
          for (let r = 0; r < 3; r++) {
            b.box(mat, fw - 0.006, rh - 0.006, 0.018, cx, legH + 0.015 + r * rh, d / 2 - 0.01, 0.003);
            b.box("metaal:#b39257", 0.1, 0.012, 0.012, cx, legH + 0.015 + r * rh + rh * 0.6, d / 2 + 0.005, 0.004);
          }
        } else {
          b.box(mat, fw - 0.006, h - legH - 0.03, 0.018, cx, legH + 0.015, d / 2 - 0.01, 0.003);
          b.box("metaal:#b39257", 0.012, 0.1, 0.012, i % 2 ? cx - fw / 2 + 0.04 : cx + fw / 2 - 0.04, h - 0.2, d / 2 + 0.005, 0.004);
        }
      }
      if (def.id === "tv-meubel") {
        // decoratie: een vaasje en boeken
        b.lathe("pot", [[0, 0], [0.05, 0], [0.06, 0.08], [0.03, 0.2], [0.035, 0.24], [0, 0.24]], -w / 2 + 0.2, h, 0);
        for (let i = 0; i < 4; i++) b.box(`boek:${i}`, 0.025, 0.2 + rnd() * 0.04, 0.16, w / 2 - 0.25 + i * 0.028, h, 0, 0.002);
      }
      break;
    }
    case "boekenkast": {
      const sides = Math.max(1, Math.round(w / 0.8));
      const sw = w / sides;
      const shelves = n;
      for (let i = 0; i <= sides; i++) b.box(wood, 0.022, h, d, -w / 2 + i * sw + (i === 0 ? 0.011 : i === sides ? -0.011 : 0), 0, 0, 0.002);
      b.box(wood, w, 0.006, d, 0, 0, -0.0, 0);
      for (let s = 0; s <= shelves; s++) {
        const y = 0.05 + (s * (h - 0.07)) / shelves;
        b.box(wood, w - 0.02, 0.022, d - 0.01, 0, y, 0.005, 0.002);
        if (s === shelves) continue;
        // boeken op elke plank
        for (let i = 0; i < sides; i++) {
          let x = -w / 2 + i * sw + 0.03;
          const end = -w / 2 + (i + 1) * sw - 0.03 - rnd() * 0.25;
          while (x < end) {
            const bw = 0.018 + rnd() * 0.03;
            const bh = 0.17 + rnd() * 0.12;
            b.box(`boek:${Math.floor(rnd() * 8)}`, bw, Math.min(bh, (h - 0.07) / shelves - 0.04), d - 0.08, x + bw / 2, y + 0.022, 0.0, 0.002);
            x += bw + 0.002;
          }
        }
      }
      break;
    }
    case "keukenkast":
    case "vaatwasser":
    case "kookplaat":
    case "spoelbak": {
      const top = 0.86;
      plinthCabinet(b, front, w, d - 0.02, top, def.shape === "vaatwasser" ? 1 : n, def.shape === "keukenkast" && w <= 0.6);
      worktop(b, w, d - 0.02, top);
      upperCabinet(b, front, w, d);
      if (def.shape === "kookplaat") {
        b.box("zwartglas", w - 0.08, 0.006, d - 0.16, 0, top + 0.04, 0, 0.004);
        const ps = n === 5 ? [[-0.3, -0.22], [0.3, -0.22], [-0.3, 0.22], [0.3, 0.22], [0, 0]] : [[-0.25, -0.2], [0.25, -0.2], [-0.25, 0.2], [0.25, 0.2]];
        for (const [px, pz] of ps) {
          const r = Math.min(w, d) * (n === 5 && px === 0 ? 0.14 : 0.1);
          b.add("metaal:#8a8c8f", new THREE.TorusGeometry(r, 0.002, 4, 40), px * (w - 0.08), top + 0.047, pz * (d - 0.16), Math.PI / 2);
        }
        // dampkap
        b.box("inox", Math.min(0.9, w), 0.06, 0.5, 0, 1.55, -d / 2 + 0.25, 0.004);
        b.box("inox", 0.25, 0.85, 0.22, 0, 1.61, -d / 2 + 0.11, 0.004);
      }
      if (def.shape === "spoelbak") {
        const bw = n === 2 ? (w - 0.26) / 2 : Math.min(0.5, w - 0.2);
        for (let i = 0; i < n; i++) {
          const cx = n === 2 ? -w / 2 + 0.1 + bw / 2 + i * (bw + 0.06) : 0;
          // bak in het werkblad: rand en een donkere bodem
          b.box("inox", bw + 0.02, 0.004, d - 0.22, cx, top + 0.04, 0.03, 0.002);
          b.box("metaal:#5b5e62", bw - 0.02, 0.002, d - 0.26, cx, top + 0.0442, 0.03, 0);
        }
        // kraan
        b.cyl("chroom", 0.025, 0.03, 0, top + 0.04, -d / 2 + 0.1, 16);
        b.cyl("chroom", 0.012, 0.3, 0, top + 0.07, -d / 2 + 0.1, 12);
        b.add("chroom", new THREE.TorusGeometry(0.09, 0.012, 10, 24, Math.PI), 0, top + 0.37, -d / 2 + 0.19, 0, Math.PI / 2);
        b.cyl("chroom", 0.012, 0.08, 0, top + 0.29, -d / 2 + 0.28, 12);
      }
      if (def.shape === "vaatwasser") b.box("inox", w - 0.1, 0.012, 0.015, 0, top - 0.06, d / 2 + 0.003, 0.004);
      break;
    }
    case "koelkast": {
      const amer = n === 2;
      const mat: FMat = amer ? "inox" : front;
      b.box(mat, w, h, d - 0.02, 0, 0, -0.01, 0.01);
      if (amer) {
        b.box("lak:#1f2023", 0.004, h - 0.04, 0.004, 0, 0.02, d / 2, 0);
        b.box("chroom", 0.02, 0.9, 0.04, -0.04, h * 0.35, d / 2 + 0.02, 0.008);
        b.box("chroom", 0.02, 0.9, 0.04, 0.04, h * 0.35, d / 2 + 0.02, 0.008);
        b.box("zwartglas", 0.18, 0.28, 0.006, -w / 4, h * 0.55, d / 2, 0.004);
      } else {
        b.box("lak:#1f2023", w - 0.02, 0.004, 0.004, 0, 0.8, d / 2, 0);
        b.box("inox", 0.012, 0.35, 0.014, w / 2 - 0.05, 1.0, d / 2 + 0.006, 0.004);
        b.box("inox", 0.012, 0.3, 0.014, w / 2 - 0.05, 0.42, d / 2 + 0.006, 0.004);
      }
      break;
    }
    case "eiland": {
      const top = 0.86;
      const over = Math.min(0.3, d * 0.3);
      plinthCabinet(b, front, w - 0.02, d - over, top, Math.max(1, Math.round(w / 0.6)));
      b.box("steen", w, 0.05, d, 0, top, over / 2 - over / 2, 0.004);
      // barkrukken aan de overstek
      const k = Math.max(1, Math.floor(w / 0.6));
      for (let i = 0; i < k; i++) {
        const x = -w / 2 + (w / k) * (i + 0.5);
        b.cyl("stof:#4a4c50", 0.19, 0.05, x, 0.7, d / 2 + 0.12, 28);
        b.cyl("metaal:#26272a", 0.02, 0.7, x, 0, d / 2 + 0.12, 10);
        b.cyl("metaal:#26272a", 0.18, 0.012, x, 0, d / 2 + 0.12, 28);
        b.add("metaal:#26272a", new THREE.TorusGeometry(0.15, 0.008, 6, 28), x, 0.3, d / 2 + 0.12, Math.PI / 2);
      }
      if (n === 1) {
        b.box("zwartglas", 0.8, 0.006, 0.5, 0, top + 0.05, -over / 2, 0.004);
        for (const [px, pz] of [[-0.22, -0.1], [0.22, -0.1], [-0.22, 0.1], [0.22, 0.1]])
          b.add("metaal:#8a8c8f", new THREE.TorusGeometry(0.08, 0.002, 4, 32), px, top + 0.057, -over / 2 + pz, Math.PI / 2);
      }
      break;
    }
    case "bad": {
      const free = n === 1;
      const r = free ? Math.min(w, d) * 0.45 : 0.06;
      const outer = free ? (ellipseShape(0, 0, w / 2, d / 2) as THREE.Shape) : roundRect(-w / 2, -d / 2, w / 2, d / 2, r);
      const innerW = w - 0.14;
      const innerD = d - 0.14;
      const inner = free ? ellipseShape(0, 0, innerW / 2, innerD / 2, true) : new THREE.Path();
      if (!free) path(inner, -innerW / 2, -innerD / 2, innerW / 2, innerD / 2, 0.12);
      outer.holes.push(inner);
      // rand van het bad (wand met een gat) en de bodem
      b.slab("keramiek", outer, h - 0.01, 0);
      const bottom = free ? (ellipseShape(0, 0, innerW / 2 + 0.01, innerD / 2 + 0.01) as THREE.Shape) : roundRect(-innerW / 2 - 0.01, -innerD / 2 - 0.01, innerW / 2 + 0.01, innerD / 2 + 0.01, 0.13);
      b.slab("keramiek", bottom, 0.02, 0.18);
      b.cyl("chroom", 0.022, 0.004, -w / 2 + 0.25, 0.205, 0, 20);
      if (!free) {
        // kraan aan de muurkant
        b.box("chroom", 0.05, 0.05, 0.08, 0, h - 0.02, -d / 2 + 0.04, 0.01);
        b.box("chroom", 0.03, 0.02, 0.12, 0, h + 0.02, -d / 2 + 0.1, 0.006);
      }
      break;
    }
    case "douche": {
      b.box("keramiek", w, 0.04, d, 0, 0, 0, 0.01);
      b.cyl("chroom", 0.035, 0.004, 0, 0.04, 0, 24);
      const glass: FMat = "glas";
      if (n === 1) {
        b.box(glass, w * 0.6, 2.0, 0.008, -w / 2 + w * 0.3, 0.04, d / 2 - 0.004, 0);
        b.box("chroom", 0.012, 0.012, d, -w / 2 + w * 0.6 - 0.006, 2.02, 0, 0);
      } else {
        b.box(glass, w, 2.0, 0.008, 0, 0.04, d / 2 - 0.004, 0);
        b.box("chroom", 0.012, 2.0, 0.02, w / 2 - 0.006, 0.04, d / 2, 0.004);
      }
      // stang met douchekop
      b.cyl("chroom", 0.012, 1.2, w / 2 - 0.2, 1.0, -d / 2 + 0.04, 12);
      b.cyl("chroom", 0.11, 0.012, 0, 2.05, -d / 2 + 0.3, 32);
      b.box("chroom", 0.02, 0.02, 0.3, 0, 2.07, -d / 2 + 0.15, 0.006);
      b.box("chroom", 0.08, 0.1, 0.06, w / 2 - 0.2, 1.05, -d / 2 + 0.03, 0.01);
      break;
    }
    case "lavabo": {
      const cab = def.finish === "front" ? front : wood;
      // hangend meubel met lades
      b.box(cab, w, 0.42, d - 0.02, 0, 0.38, -0.01, 0.004);
      b.box("lak:#2b2c2e", w - 0.01, 0.003, 0.004, 0, 0.6, d / 2, 0);
      // wastafelblad met kom(men)
      const top = roundRect(-w / 2, -d / 2, w / 2, d / 2, 0.015);
      const bw = n === 2 ? (w - 0.3) / 2 : Math.min(0.42, w - 0.16);
      const centers = n === 2 ? [-w / 2 + 0.1 + bw / 2, w / 2 - 0.1 - bw / 2] : [0];
      for (const cx of centers) top.holes.push(ellipseShape(cx, 0.03, bw / 2, (d - 0.16) / 2, true));
      b.slab("keramiek", top, 0.05, 0.8);
      for (const cx of centers) {
        b.lathe("keramiek", [[0, 0], [0.9, 0.02], [1, 0.13], [1.0, 0.13]], cx, 0.72, 0.03, bw / 2, (d - 0.16) / 2);
        b.cyl("chroom", 0.022, 0.12, cx, 0.85, -d / 2 + 0.05, 16);
        b.box("chroom", 0.02, 0.02, 0.12, cx, 0.95, -d / 2 + 0.1, 0.006);
        // spiegel
        b.box("spiegel", Math.min(0.6, bw + 0.15), 0.75, 0.01, cx, 1.1, -d / 2 + 0.006, 0.004);
      }
      break;
    }
    case "wc": {
      // hangtoilet: pot (gedraaid profiel, ovaal), bril, spoelplaat
      b.lathe("keramiek", [[0.0, 0], [0.12, 0], [0.17, 0.12], [0.18, 0.26], [0.16, 0.27], [0.12, 0.25], [0.0, 0.2]], 0, 0.15, 0.06, w / 0.36, d / 0.6);
      b.box("keramiek", w - 0.04, 0.27, 0.12, 0, 0.15, -d / 2 + 0.06, 0.03);
      b.lathe("keramiek", [[0.14, 0], [0.18, 0], [0.18, 0.02], [0.14, 0.02]], 0, 0.42, 0.06, w / 0.36, d / 0.6);
      b.box("keramiek", 0.25, 0.16, 0.01, 0, 1.0, -d / 2 + 0.005, 0.004);
      b.box("chroom", 0.08, 0.1, 0.006, -0.05, 1.03, -d / 2 + 0.012, 0.003);
      b.box("chroom", 0.08, 0.1, 0.006, 0.05, 1.03, -d / 2 + 0.012, 0.003);
      break;
    }
    case "radiator": {
      const mat: FMat = `metaal:${c}`;
      const towel = n === 1;
      if (towel) {
        b.box(mat, 0.03, h, 0.03, -w / 2 + 0.015, 0.2, 0, 0.006);
        b.box(mat, 0.03, h, 0.03, w / 2 - 0.015, 0.2, 0, 0.006);
        for (let y = 0.25; y < h + 0.18; y += 0.07) b.add(mat, new THREE.CylinderGeometry(0.011, 0.011, w - 0.03, 10), 0, 0.2 + y - 0.2, 0, 0, 0, Math.PI / 2);
        b.box("stof:#e9e5dc", w * 0.7, 0.45, 0.04, 0, h - 0.25, 0.03, 0.015);
      } else {
        const y0 = 0.15;
        b.box(mat, w, h, 0.07, 0, y0, 0, 0.008);
        for (let x = -w / 2 + 0.025; x < w / 2; x += 0.05) b.box(mat, 0.035, h - 0.04, 0.012, x, y0 + 0.02, 0.04, 0.005);
      }
      break;
    }
    case "wasmachine": {
      b.box("keramiek", w, h, d - 0.02, 0, 0, -0.01, 0.015);
      b.box("lak:#dcdcd8", w - 0.02, 0.12, 0.01, 0, h - 0.13, d / 2 - 0.01, 0.004);
      b.add("chroom", new THREE.TorusGeometry(0.17, 0.025, 12, 40), 0, 0.42, d / 2 + 0.01);
      b.cyl("zwartglas", 0.15, 0.02, 0, 0.42, d / 2 - 0.005, 40);
      // ronde deur: cilinder ligt langs de y-as; draaien naar voor
      const door = new THREE.CylinderGeometry(0.15, 0.15, 0.02, 40);
      door.rotateX(Math.PI / 2);
      b.add("zwartglas", door, 0, 0.42, d / 2 + 0.005);
      b.cyl("chroom", 0.025, 0.02, w / 2 - 0.1, h - 0.07, d / 2 - 0.005, 20);
      break;
    }
    case "bureau": {
      b.box(wood, w, 0.03, d, 0, h - 0.03, 0, 0.004);
      // stalen frame
      for (const sx of [-1, 1]) {
        b.box("metaal:#26272a", 0.04, h - 0.03, 0.04, sx * (w / 2 - 0.05), 0, -d / 2 + 0.06, 0.004);
        b.box("metaal:#26272a", 0.04, h - 0.03, 0.04, sx * (w / 2 - 0.05), 0, d / 2 - 0.06, 0.004);
        b.box("metaal:#26272a", 0.04, 0.04, d - 0.08, sx * (w / 2 - 0.05), h - 0.07, 0, 0.004);
      }
      // ladeblok, laptop en een lamp
      b.box("lak:#f1f0ec", 0.42, 0.6, d - 0.1, w / 2 - 0.3, 0, 0, 0.004);
      b.box("metaal:#b9bcbf", 0.32, 0.012, 0.22, -0.1, h, 0.05, 0.004);
      const scr = new RoundedBoxGeometry(0.32, 0.22, 0.008, 2, 0.003);
      scr.rotateX(-0.25);
      b.add("metaal:#b9bcbf", scr, -0.1, h + 0.115, -0.07);
      b.cyl("metaal:#26272a", 0.07, 0.015, -w / 2 + 0.15, h, -d / 2 + 0.15, 24);
      b.cyl("metaal:#26272a", 0.008, 0.4, -w / 2 + 0.15, h, -d / 2 + 0.15, 8);
      b.lathe("kap", [[0.02, 0], [0.09, 0.12], [0.085, 0.12], [0.015, 0]], -w / 2 + 0.2, h + 0.3, -d / 2 + 0.2);
      break;
    }
    case "bureaustoel": {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const leg = new THREE.BoxGeometry(0.29, 0.03, 0.04);
        leg.translate(0.145, 0, 0);
        b.add("metaal:#26272a", leg, 0, 0.08, 0, 0, a);
        b.add("metaal:#26272a", new THREE.SphereGeometry(0.025, 12, 8), Math.cos(a) * 0.29, 0.03, -Math.sin(a) * 0.29);
      }
      b.cyl("metaal:#26272a", 0.025, 0.36, 0, 0.09, 0, 14);
      b.box(fab, 0.5, 0.08, 0.48, 0, 0.45, 0.04, 0.035);
      const back = new RoundedBoxGeometry(0.46, 0.55, 0.05, 4, 0.025);
      back.rotateX(-0.12);
      b.add(fab, back, 0, 0.84, -0.2);
      for (const sx of [-1, 1]) {
        b.box("metaal:#26272a", 0.03, 0.2, 0.03, sx * 0.24, 0.5, 0.05, 0.006);
        b.box("metaal:#26272a", 0.05, 0.025, 0.25, sx * 0.24, 0.7, 0.05, 0.01);
      }
      break;
    }
    case "tapijt":
      if (n === 1) b.cyl(`stof:${c}`, w / 2, 0.012, 0, 0, 0, 72);
      else b.box(`stof:${c}`, w, 0.012, d, 0, 0, 0, 0.004);
      break;
    case "plant": {
      const pr = Math.min(w, d) * 0.28;
      b.lathe("pot", [[0, 0], [pr * 0.75, 0], [pr, h * 0.22], [pr * 1.02, h * 0.24], [pr * 0.95, h * 0.24], [0, h * 0.22]], 0, 0, 0);
      b.cyl("aarde", pr * 0.94, 0.01, 0, h * 0.215, 0, 24);
      // stengels en bladeren (monstera-achtig), naar buiten gebogen
      const leaves = 14;
      for (let i = 0; i < leaves; i++) {
        const a = (i / leaves) * Math.PI * 2 + rnd() * 0.4;
        const tilt = 0.35 + rnd() * 0.6;
        const len = (h - h * 0.24) * (0.55 + rnd() * 0.45);
        const stem = new THREE.CylinderGeometry(0.004, 0.006, len, 6);
        stem.translate(0, len / 2, 0);
        stem.rotateZ(tilt * 0.6);
        stem.rotateY(a);
        b.add("loof", stem, 0, h * 0.22, 0);
        const ls = Math.min(w, d) * (0.22 + rnd() * 0.12);
        const leaf = new THREE.Shape();
        leaf.moveTo(0, 0);
        leaf.bezierCurveTo(ls * 0.6, ls * 0.15, ls * 0.6, ls * 0.95, 0, ls * 1.2);
        leaf.bezierCurveTo(-ls * 0.6, ls * 0.95, -ls * 0.6, ls * 0.15, 0, 0);
        const lg = new THREE.ShapeGeometry(leaf, 8);
        lg.rotateX(-Math.PI / 2 + 0.5 + rnd() * 0.4);
        lg.rotateY(a + Math.PI / 2);
        const tipX = Math.sin(tilt * 0.6) * len;
        const tipY = Math.cos(tilt * 0.6) * len;
        b.add("loof", lg, -Math.cos(a) * tipX, h * 0.22 + tipY, Math.sin(a) * tipX);
      }
      break;
    }
    case "staanlamp":
      b.cyl("metaal:#26272a", 0.15, 0.025, 0, 0, 0, 32);
      b.cyl(`metaal:${c}`, 0.01, h - 0.3, 0, 0.025, 0, 10);
      b.lathe("kap", [[0.11, 0], [0.16, 0], [0.14, 0.3], [0.13, 0.3]], 0, h - 0.32, 0);
      break;
    case "tv":
      b.box("metaal:#1d1e20", w, h * 0.68, 0.03, 0, h * 0.32, -d / 2 + 0.08, 0.004);
      b.box("zwartglas", w - 0.02, h * 0.68 - 0.02, 0.004, 0, h * 0.32 + 0.01, -d / 2 + 0.096, 0.002);
      b.box("metaal:#1d1e20", 0.3, 0.012, 0.22, 0, 0, -d / 2 + 0.12, 0.004);
      b.box("metaal:#1d1e20", 0.05, h * 0.33, 0.03, 0, 0, -d / 2 + 0.06, 0.004);
      break;
  }
  return b.parts;
}

/** Alle onderdelen van één meubel samengevoegd per materiaal. */
export function mergeParts(parts: Parts): { mat: FMat; geo: THREE.BufferGeometry }[] {
  const out: { mat: FMat; geo: THREE.BufferGeometry }[] = [];
  for (const [mat, gs] of parts) {
    const g = mergeGeometries(gs, false);
    gs.forEach((x) => x.dispose());
    if (g) out.push({ mat, geo: g });
  }
  return out;
}

/**
 * De 3D-weergave met three.js: realistische materialen (zelf gemaakte
 * texturen), zon met zachte schaduw, omgevingslicht en ambient occlusion.
 * Twee manieren van kijken: als poppenhuis rond het huis draaien, of op
 * ooghoogte rondwandelen. Er wordt enkel getekend als er iets verandert.
 *
 * Dit bestand wordt pas geladen als je 3D opent.
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { pointInPolygon } from "@/lib/geometry/plan";
import type { Vec } from "@/lib/geometry/vec";
import { FACADES, FLOORS } from "@/lib/model/finishes";
import type { FurnitureDef } from "@/lib/furniture/library";
import type { Part } from "@/lib/three/build";
import { buildFurniture, mergeParts, type FMat } from "./furniture3d";

export type ViewMode = "doll" | "walk";

const M = 1 / 1000; // mm → m
const EYE = 1.6;
const RADIUS = 0.25; // zo dicht kom je bij een muur

/* ------------------------------------------------------------------ */
/* Texturen, in de browser getekend (geen bestanden nodig)              */
/* ------------------------------------------------------------------ */

let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function texture(px: [number, number], meters: [number, number], draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true) {
  const c = document.createElement("canvas");
  c.width = px[0];
  c.height = px[1];
  seed = 7;
  draw(c.getContext("2d")!, px[0], px[1]);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.repeat.set(1 / meters[0], 1 / meters[1]);
  return t;
}

function hsl(hex: string) {
  const c = new THREE.Color(hex);
  const o = { h: 0, s: 0, l: 0 };
  c.getHSL(o);
  return o;
}
const hslStr = (h: number, s: number, l: number, a = 1) =>
  `hsla(${Math.round(h * 360)} ${Math.round(Math.max(0, Math.min(1, s)) * 100)}% ${Math.round(Math.max(0, Math.min(1, l)) * 100)}% / ${a})`;

function plankTexture(color: string, size: [number, number]) {
  const [L, Wd] = size;
  const rows = 16;
  const tileW = (L * 3) / 1000;
  const tileH = (Wd * rows) / 1000;
  const base = hsl(color);
  base.s *= 0.62; // ACES maakt hout snel te oranje
  base.l = Math.min(0.62, base.l * 1.06);
  return texture([2048, 2048], [tileW, tileH], (g, w, h) => {
    const ph = h / rows;
    for (let r = 0; r < rows; r++) {
      // planken van verschillende lengte, verspringend per rij
      let x = -rnd() * (w / 3);
      while (x < w) {
        const pl = (w / 3) * (0.55 + rnd() * 0.9);
        const dl = (rnd() - 0.5) * 0.07;
        const ds = (rnd() - 0.5) * 0.06;
        g.fillStyle = hslStr(base.h, base.s + ds, base.l + dl);
        g.fillRect(x, r * ph, pl, ph);
        for (let k = 0; k < 16; k++) {
          g.strokeStyle = hslStr(base.h, base.s + 0.05, base.l - 0.08 - rnd() * 0.08, 0.12 + rnd() * 0.18);
          g.lineWidth = 0.8 + rnd() * 1.6;
          g.beginPath();
          const y0 = r * ph + rnd() * ph;
          g.moveTo(x, y0);
          g.bezierCurveTo(x + pl * 0.3, y0 + (rnd() - 0.5) * 8, x + pl * 0.6, y0 + (rnd() - 0.5) * 8, x + pl, y0 + (rnd() - 0.5) * 6);
          g.stroke();
        }
        g.fillStyle = hslStr(base.h, base.s, base.l * 0.45, 0.6);
        g.fillRect(x, r * ph, 2, ph);
        x += pl;
      }
      g.fillStyle = hslStr(base.h, base.s, base.l * 0.45, 0.55);
      g.fillRect(0, r * ph, w, 2);
    }
  });
}

function tileTexture(color: string, size: [number, number]) {
  const base = hsl(color);
  return texture([512, 512], [(size[0] * 2) / 1000, (size[1] * 2) / 1000], (g, w, h) => {
    g.fillStyle = hslStr(base.h, base.s * 0.6, base.l * 0.82);
    g.fillRect(0, 0, w, h);
    const s = w / 2;
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 2; j++) {
        const l = base.l + (rnd() - 0.5) * 0.03;
        g.fillStyle = hslStr(base.h, base.s, l);
        g.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
        for (let k = 0; k < 700; k++) {
          g.fillStyle = hslStr(base.h, base.s, l + (rnd() - 0.5) * 0.1, 0.18);
          g.fillRect(i * s + 2 + rnd() * (s - 6), j * s + 2 + rnd() * (s - 6), 2, 2);
        }
      }
  });
}

function noiseTexture(color: string, meters: number, amount: number, grain = 2) {
  const base = hsl(color);
  return texture([512, 512], [meters, meters], (g, w, h) => {
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    for (let k = 0; k < 40; k++) {
      const r = 30 + rnd() * 90;
      const x = rnd() * w;
      const y = rnd() * h;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, hslStr(base.h, base.s, base.l + (rnd() - 0.5) * amount * 2, 0.35));
      grd.addColorStop(1, hslStr(base.h, base.s, base.l, 0));
      g.fillStyle = grd;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let k = 0; k < 9000; k++) {
      g.fillStyle = hslStr(base.h, base.s, base.l + (rnd() - 0.5) * amount * 3, 0.25);
      g.fillRect(rnd() * w, rnd() * h, grain, grain);
    }
  });
}

/** Houtnerf langs de lengte, in de kleur van het hout. */
const woodCache = new Map<string, THREE.Texture>();
function woodTexture(color: string) {
  let t = woodCache.get(color);
  if (t) return t;
  const base = hsl(color);
  t = texture([512, 512], [1, 1], (g, w, h) => {
    g.fillStyle = hslStr(base.h, base.s * 0.8, base.l);
    g.fillRect(0, 0, w, h);
    for (let k = 0; k < 90; k++) {
      const y = rnd() * h;
      g.strokeStyle = hslStr(base.h, base.s * 0.85, base.l + (rnd() - 0.6) * 0.14, 0.25 + rnd() * 0.3);
      g.lineWidth = 0.6 + rnd() * 2.2;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x / 60 + k) * 3 + (rnd() - 0.5) * 2);
      g.stroke();
    }
  });
  woodCache.set(color, t);
  return t;
}

function brickTexture(color: string, joint: string) {
  const base = hsl(color);
  // 4 stenen van 21 cm breed en 8 lagen van 6,5 cm, met voegen van 1 cm
  return texture([1024, 512], [0.88, 0.6], (g, w, h) => {
    g.fillStyle = joint;
    g.fillRect(0, 0, w, h);
    const bh = h / 8;
    const bw = w / 4;
    const jy = bh * (10 / 75);
    const jx = bw * (10 / 220);
    for (let r = 0; r < 8; r++)
      for (let i = -1; i < 5; i++) {
        const x = i * bw + (r % 2 ? bw / 2 : 0);
        const l = base.l + (rnd() - 0.5) * 0.12;
        const hh = base.h + (rnd() - 0.5) * 0.03;
        g.fillStyle = hslStr(hh, base.s + (rnd() - 0.5) * 0.1, l);
        g.fillRect(x + jx / 2, r * bh + jy / 2, bw - jx, bh - jy);
        for (let k = 0; k < 160; k++) {
          g.fillStyle = hslStr(hh, base.s, l + (rnd() - 0.5) * 0.18, 0.35);
          g.fillRect(x + jx / 2 + rnd() * (bw - jx - 3), r * bh + jy / 2 + rnd() * (bh - jy - 3), 3, 3);
        }
      }
  });
}

/* ------------------------------------------------------------------ */
/* Materialen                                                           */
/* ------------------------------------------------------------------ */

class Materials {
  private cache = new Map<string, THREE.Material>();
  private paintNoise = noiseTexture("#ffffff", 1.2, 0.025, 1);
  /** Fijne weefstructuur voor stoffen (grijswaarden, de kleur komt van het materiaal). */
  weave = texture([256, 256], [0.25, 0.25], (g, w, h) => {
    g.fillStyle = "#ededed";
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) {
      g.fillStyle = `rgba(0,0,0,${0.04 + rnd() * 0.05})`;
      g.fillRect(0, y, w, 1);
    }
    for (let x = 0; x < w; x += 2) {
      g.fillStyle = `rgba(255,255,255,${0.04 + rnd() * 0.05})`;
      g.fillRect(x, 0, 1, h);
    }
    for (let k = 0; k < 3000; k++) {
      g.fillStyle = `rgba(0,0,0,${rnd() * 0.06})`;
      g.fillRect(rnd() * w, rnd() * h, 2, 1);
    }
  });

  get(key: string): THREE.Material {
    let m = this.cache.get(key);
    if (!m) {
      m = this.make(key);
      this.cache.set(key, m);
    }
    return m;
  }

  private make(key: string): THREE.Material {
    const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p);
    const phys = (p: THREE.MeshPhysicalMaterialParameters) => new THREE.MeshPhysicalMaterial(p);
    if (key.startsWith("stof:")) {
      const c = new THREE.Color(key.slice(5));
      return phys({ color: c, map: this.weave, roughness: 0.95, sheen: 0.35, sheenRoughness: 0.8, sheenColor: c.clone().lerp(new THREE.Color(0xffffff), 0.15) });
    }
    if (key.startsWith("hout:")) return std({ map: woodTexture(key.slice(5)), roughness: 0.55 });
    if (key.startsWith("lak:")) return phys({ color: new THREE.Color(key.slice(4)), roughness: 0.38, clearcoat: 0.25, clearcoatRoughness: 0.4 });
    if (key.startsWith("metaal:")) {
      const c = new THREE.Color(key.slice(7));
      const dark = c.getHSL({ h: 0, s: 0, l: 0 }).l < 0.2;
      return std({ color: c, metalness: dark ? 0.5 : 0.9, roughness: dark ? 0.45 : 0.3 });
    }
    if (key.startsWith("boek:")) {
      const cols = ["#7d3b2e", "#2f4a63", "#c9b48a", "#3c5a40", "#d8d2c4", "#8a6a3b", "#1f2124", "#a5603d"];
      return std({ color: cols[Number(key.slice(5)) % cols.length], roughness: 0.75 });
    }
    if (key.startsWith("verf:")) return std({ color: new THREE.Color(key.slice(5)), map: this.paintNoise, roughness: 0.93 });
    if (key.startsWith("vloer:")) {
      const f = FLOORS.find((x) => x.id === key.slice(6)) ?? FLOORS[0];
      if (f.kind === "plank") return std({ map: plankTexture(f.color, f.size ?? [1400, 180]), roughness: 0.55 });
      if (f.kind === "tegel") return std({ map: tileTexture(f.color, f.size ?? [600, 600]), roughness: 0.3 });
      if (f.kind === "zacht") return std({ map: noiseTexture(f.color, 0.6, 0.05, 1), roughness: 1 });
      return std({ map: noiseTexture(f.color, 2.5, 0.06), roughness: 0.4 });
    }
    if (key.startsWith("gevel:")) {
      const f = FACADES.find((x) => x.id === key.slice(6)) ?? FACADES[0];
      if (f.kind === "crepi") return std({ map: noiseTexture(f.color, 0.8, 0.04, 1), roughness: 0.95 });
      return std({ map: brickTexture(f.color, f.joint), roughness: 0.85 });
    }
    switch (key) {
      case "chroom":
        return std({ color: 0xeeeeee, metalness: 1, roughness: 0.08 });
      case "inox":
        return std({ color: 0xc8cacc, metalness: 1, roughness: 0.32 });
      case "keramiek":
        return phys({ color: 0xf7f7f5, roughness: 0.15, clearcoat: 0.7, clearcoatRoughness: 0.1 });
      case "zwartglas":
        return phys({ color: 0x0c0d0f, roughness: 0.06, metalness: 0.1, clearcoat: 1 });
      case "spiegel":
        return std({ color: 0xdfe6ea, metalness: 1, roughness: 0.03 });
      case "steen":
        return std({ map: noiseTexture("#d8d4cc", 0.6, 0.03, 1), roughness: 0.28 });
      case "linnen":
        return phys({ color: 0xf2efe8, map: this.weave, roughness: 0.95, sheen: 0.5, sheenRoughness: 0.8, sheenColor: new THREE.Color(0xffffff) });
      case "loof":
        return std({ color: 0x4d7a3c, roughness: 0.55, side: THREE.DoubleSide });
      case "aarde":
        return std({ color: 0x3a2c21, roughness: 1 });
      case "pot":
        return std({ color: 0xd9d3c8, roughness: 0.45 });
      case "kap":
        return std({ color: 0xf3eee2, roughness: 0.85, side: THREE.DoubleSide, emissive: new THREE.Color(0x2a2418) });
      case "plint":
        return std({ color: 0xf3f2ee, roughness: 0.6 });
      case "pleister":
        return std({ color: 0xefebe4, map: this.paintNoise, roughness: 0.95 });
      case "plafond":
        return std({ color: 0xf6f5f2, roughness: 0.95, side: THREE.FrontSide });
      case "snede":
        return std({ color: 0x2f3237, roughness: 0.9 });
      case "plaat":
        return std({ color: 0x9a9a96, roughness: 0.95 });
      case "kader":
        return std({ color: 0x2f3236, roughness: 0.45, metalness: 0.35 });
      case "glas":
        return new THREE.MeshStandardMaterial({ color: 0x9db8c6, transparent: true, opacity: 0.12, roughness: 0.04, metalness: 0.1, envMapIntensity: 0.35, depthWrite: false });
      case "blad":
        return std({ color: 0xf4f2ed, roughness: 0.5 });
      case "klink":
        return std({ color: 0xc4c6c8, roughness: 0.25, metalness: 0.9 });
      case "poort":
        return std({ color: 0x3b3f45, roughness: 0.6, metalness: 0.3 });
      case "dorpel":
      case "vensterbank":
        return std({ map: noiseTexture("#4d5257", 0.8, 0.05, 1), roughness: 0.55 });
      default:
        return std({ color: 0xcccccc });
    }
  }

  dispose() {
    for (const m of this.cache.values()) {
      const map = (m as THREE.MeshStandardMaterial).map;
      if (map && map !== this.paintNoise) map.dispose();
      m.dispose();
    }
    this.paintNoise.dispose();
    this.weave.dispose();
    this.cache.clear();
  }
}

/* ------------------------------------------------------------------ */
/* Geometrie                                                            */
/* ------------------------------------------------------------------ */

function prismGeometry(poly: Vec[], y0: number, y1: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x * M, -p.y * M)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: (y1 - y0) * M, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0 * M, 0);
  return g;
}

/** Een extrusie in boven-/onderkant (groep 0) en zijkanten (groep 1). */
function splitGroups(g: THREE.BufferGeometry): [THREE.BufferGeometry, THREE.BufferGeometry] {
  const out = [0, 1].map((gi) => {
    const parts = g.groups.filter((x) => (x.materialIndex ?? 0) === gi);
    const ng = new THREE.BufferGeometry();
    for (const name of ["position", "normal", "uv"]) {
      const attr = g.getAttribute(name) as THREE.BufferAttribute;
      const n = attr.itemSize;
      const arr: number[] = [];
      for (const p of parts) for (let i = p.start; i < p.start + p.count; i++) for (let k = 0; k < n; k++) arr.push(attr.array[i * n + k]);
      ng.setAttribute(name, new THREE.Float32BufferAttribute(arr, n));
    }
    return ng;
  });
  return [out[0], out[1]];
}

function faceGeometry(f: Extract<Part, { t: "face" }>): THREE.BufferGeometry {
  const { a, b, n, y0, y1 } = f;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const e = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  // vlak in (u, hoogte), met de openingen als gaten
  const shape = new THREE.Shape([new THREE.Vector2(0, y0), new THREE.Vector2(len, y0), new THREE.Vector2(len, y1), new THREE.Vector2(0, y1)]);
  for (const h of f.holes ?? []) {
    const u0 = Math.max(0.5, h.u0);
    const u1 = Math.min(len - 0.5, h.u1);
    const v0 = Math.max(y0 + 0.5, h.y0);
    const v1 = Math.min(y1 - 0.5, h.y1);
    if (u1 - u0 < 1 || v1 - v0 < 1) continue;
    shape.holes.push(new THREE.Path([new THREE.Vector2(u0, v0), new THREE.Vector2(u0, v1), new THREE.Vector2(u1, v1), new THREE.Vector2(u1, v0)]));
  }
  const g = new THREE.ShapeGeometry(shape).toNonIndexed();
  const pos = g.getAttribute("position");
  const uv = g.getAttribute("uv");
  // texturen doorlopend langs een rechte gevel
  const ux = (a.x * e.x + a.y * e.y) * M;
  // voorkant naar n: de vorm kijkt naar de linkernormaal van a → b; anders omdraaien
  const flip = -e.y * n.x + e.x * n.y < 0;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i);
    const v = pos.getY(i);
    pos.setXYZ(i, (a.x + e.x * u) * M, v * M, (a.y + e.y * u) * M);
    uv.setXY(i, ux + u * M, v * M);
  }
  if (flip) {
    // driehoeken omdraaien zodat de voorkant naar n kijkt
    const arr = pos.array as Float32Array;
    const uva = uv.array as Float32Array;
    for (let t = 0; t < pos.count; t += 3) {
      for (let k = 0; k < 3; k++) [arr[(t + 1) * 3 + k], arr[(t + 2) * 3 + k]] = [arr[(t + 2) * 3 + k], arr[(t + 1) * 3 + k]];
      for (let k = 0; k < 2; k++) [uva[(t + 1) * 2 + k], uva[(t + 2) * 2 + k]] = [uva[(t + 2) * 2 + k], uva[(t + 1) * 2 + k]];
    }
  }
  pos.needsUpdate = true;
  uv.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

function flatGeometry(poly: Vec[], y: number, down: boolean): THREE.BufferGeometry {
  const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x * M, (down ? 1 : -1) * p.y * M)));
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(down ? Math.PI / 2 : -Math.PI / 2);
  g.translate(0, y * M, 0);
  return g.toNonIndexed();
}

/* ------------------------------------------------------------------ */
/* De kijker                                                            */
/* ------------------------------------------------------------------ */

export interface ViewerCallbacks {
  onPickRoom?: (roomId: string | null) => void;
  /** Een meubel aangeklikt. */
  onPickItem?: (itemId: string) => void;
  onModeChange?: (m: ViewMode) => void;
}

export class Viewer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private ao: GTAOPass;
  private controls: OrbitControls;
  private sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
  private hemi = new THREE.HemisphereLight(0xffffff, 0xd8d2c4, 0.35);
  private mats = new Materials();
  private model = new THREE.Group();
  private ceilings = new THREE.Group();
  private floorsForPick: THREE.Mesh[] = [];
  private blockers: Vec[][] = [];
  private rooms: { poly: Vec[]; y: number }[] = [];
  private mode: ViewMode = "doll";
  private dirty = true;
  private raf = 0;
  private walk = { x: 0, z: 0, yaw: 0, pitch: -0.05, y: EYE, target: null as null | { x: number; z: number } };
  private keys = new Set<string>();
  private bounds = new THREE.Box3();
  private disposed = false;
  private ground: THREE.Mesh;
  private plainBg = new THREE.Color(0xe4e9ec);
  /** Lucht door de ramen bij het rondwandelen. */
  private sky = (() => {
    const c = document.createElement("canvas");
    c.width = 4;
    c.height = 256;
    const g = c.getContext("2d")!;
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, "#a9c6dd");
    grd.addColorStop(0.55, "#dbe6ec");
    grd.addColorStop(1, "#e9ece6");
    g.fillStyle = grd;
    g.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();

  constructor(
    private host: HTMLElement,
    private cb: ViewerCallbacks = {},
  ) {
    const r = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.9;
    r.domElement.style.display = "block";
    r.domElement.style.touchAction = "none";
    r.domElement.setAttribute("aria-label", "3D-weergave van het plan");
    r.domElement.setAttribute("role", "img");
    host.appendChild(r.domElement);
    this.renderer = r;

    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    this.scene.background = this.plainBg;
    this.scene.fog = new THREE.Fog(0xe4e9ec, 40, 90);

    this.camera = new THREE.PerspectiveCamera(34, 1, 0.5, 200);
    this.scene.add(this.hemi, this.sun, this.sun.target, this.model);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.025;
    this.sun.shadow.radius = 5;
    this.sun.shadow.blurSamples = 12;
    this.sun.shadow.mapSize.set(window.innerWidth < 900 ? 2048 : 4096, window.innerWidth < 900 ? 2048 : 4096);

    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0xdadcd5, roughness: 1 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.16;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    // randen gladmaken: MSAA op een echte grafische kaart; softwarematig (zonder GPU) geeft
    // MSAA naadjes op de randen van driehoeken, dan SMAA achteraf
    const software = isSoftwareRenderer(r);
    const rt = new THREE.WebGLRenderTarget(1, 1, { samples: software ? 0 : 4, type: THREE.HalfFloatType });
    this.composer = new EffectComposer(r, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.ao = new GTAOPass(this.scene, this.camera, 1, 1);
    this.ao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.6, thickness: 1, scale: 1.1, samples: 12 });
    this.ao.blendIntensity = 0.9;
    this.composer.addPass(this.ao);
    this.composer.addPass(new OutputPass());
    if (software) this.composer.addPass(new SMAAPass());

    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 80;
    this.controls.addEventListener("change", () => (this.dirty = true));

    this.bindInput();
    this.resize();
    this.loop();
  }

  /** Alles opnieuw opbouwen uit de onderdelen. */
  setParts(parts: Part[], sunFrom: Vec) {
    this.clearModel();
    const byMat = new Map<string, THREE.BufferGeometry[]>();
    const ceilByMat: THREE.BufferGeometry[] = [];
    this.blockers = [];
    this.rooms = [];
    const add = (k: string, g: THREE.BufferGeometry) => (byMat.get(k) ?? byMat.set(k, []).get(k)!).push(g);
    for (const p of parts) {
      if (p.t === "prism") {
        const g = prismGeometry(p.poly, p.y0, p.y1);
        if (p.caps && p.caps !== p.mat) {
          const [caps, sides] = splitGroups(g);
          g.dispose();
          add(p.caps, caps);
          add(p.mat, sides);
        } else {
          g.clearGroups();
          add(p.mat, g);
        }
        if (p.block) this.blockers.push(p.poly);
      } else if (p.t === "face") add(p.mat, faceGeometry(p));
      else if (p.ceiling) ceilByMat.push(flatGeometry(p.poly, p.y, true));
      else if (p.room) {
        // vloeren apart, om een ruimte te kunnen aanklikken
        const mesh = new THREE.Mesh(flatGeometry(p.poly, p.y, !!p.down), this.mats.get(p.mat));
        mesh.receiveShadow = true;
        mesh.userData.room = p.room;
        this.model.add(mesh);
        this.floorsForPick.push(mesh);
        this.rooms.push({ poly: p.poly, y: p.y * M });
      } else add(p.mat, flatGeometry(p.poly, p.y, !!p.down));
    }
    for (const [k, gs] of byMat) {
      const g = mergeGeometries(gs.map((x) => (x.index ? x.toNonIndexed() : x)), false);
      gs.forEach((x) => x.dispose());
      if (!g) continue;
      const mesh = new THREE.Mesh(g, this.mats.get(k));
      mesh.castShadow = k !== "glas";
      mesh.receiveShadow = true;
      this.model.add(mesh);
    }
    if (ceilByMat.length) {
      const g = mergeGeometries(ceilByMat, false);
      ceilByMat.forEach((x) => x.dispose());
      if (g) {
        const mesh = new THREE.Mesh(g, this.mats.get("plafond"));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.ceilings.add(mesh);
      }
    }
    this.model.add(this.ceilings);
    this.ceilings.visible = this.mode === "walk";
    this.bounds.setFromObject(this.model);
    if (this.bounds.isEmpty()) this.bounds.set(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 3, 5));
    this.placeSun(sunFrom);
    this.dirty = true;
  }

  /** Eerste keer: de camera op het hele huis richten. */
  frame() {
    const c = this.bounds.getCenter(new THREE.Vector3());
    const size = this.bounds.getSize(new THREE.Vector3());
    const r = Math.max(size.x, size.z, 4);
    // zo ver dat het hele huis in beeld is, schuin van voor (zuidoosten op het scherm)
    const dist = r * 1.5 + 6;
    const dir = new THREE.Vector3(0.55, 0.85, 0.75).normalize();
    this.controls.target.set(c.x, 0.3, c.z);
    this.camera.position.set(c.x + dir.x * dist, dir.y * dist, c.z + dir.z * dist);
    this.controls.update();
    // start voor het rondwandelen: midden van de grootste ruimte
    const big = [...this.rooms].sort((a, b) => area(b.poly) - area(a.poly))[0];
    if (big) {
      // in de grootste ruimte, kijkend naar de verste hoek
      const m = centroid(big.poly);
      const far = big.poly.reduce((best, p) => (Math.hypot(p.x - m.x, p.y - m.y) > Math.hypot(best.x - m.x, best.y - m.y) ? p : best));
      const dx = far.x - m.x;
      const dz = far.y - m.y;
      const back = 0.35;
      const start = { x: m.x - dx * back, y: m.y - dz * back };
      const p = pointInPolygon(start, big.poly) ? start : m;
      this.walk.x = p.x * M;
      this.walk.z = p.y * M;
      this.walk.y = big.y + EYE;
      this.walk.yaw = Math.atan2(-dx, -dz);
      this.walk.pitch = -0.08;
    } else {
      this.walk.x = c.x;
      this.walk.z = c.z;
    }
    this.dirty = true;
  }

  setMode(m: ViewMode) {
    if (m === this.mode) return;
    this.mode = m;
    this.controls.enabled = m === "doll";
    this.ceilings.visible = m === "walk";
    this.scene.background = m === "walk" ? this.sky : this.plainBg;
    this.scene.environmentIntensity = m === "walk" ? 0.75 : 0.55;
    this.hemi.intensity = m === "walk" ? 0.55 : 0.35;
    this.renderer.toneMappingExposure = m === "walk" ? 1.05 : 0.9;
    this.camera.fov = m === "walk" ? 62 : 34;
    // in het poppenhuis sta je ver: een verder vlak geeft scherpere diepte (geen naadjes)
    this.camera.near = m === "walk" ? 0.05 : 0.5;
    this.camera.updateProjectionMatrix();
    if (m === "doll") this.frame();
    this.dirty = true;
    this.cb.onModeChange?.(m);
  }

  resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.unbind();
    this.clearModel();
    for (const parts of this.itemGeo.values()) parts.forEach((p) => p.geo.dispose());
    this.itemGeo.clear();
    this.mats.dispose();
    this.sky.dispose();
    this.controls.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /** Voor de testen: is er al een beeld getekend? */
  get ready() {
    return !this.dirty;
  }

  /* ---------------- intern ---------------- */

  private clearModel() {
    this.model.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose();
    });
    this.model.clear();
    this.ceilings.clear();
    this.floorsForPick = [];
  }

  private placeSun(from: Vec) {
    const c = this.bounds.getCenter(new THREE.Vector3());
    const size = this.bounds.getSize(new THREE.Vector3());
    const r = Math.max(size.x, size.z) * 0.75 + 4;
    // zon uit het zuidwesten, op zo'n 40° hoogte
    this.sun.position.set(c.x + from.x * r * 1.4, r * 1.3, c.z + from.y * r * 1.4);
    this.sun.target.position.copy(c);
    const cam = this.sun.shadow.camera;
    cam.left = -r;
    cam.right = r;
    cam.top = r;
    cam.bottom = -r;
    cam.near = 0.5;
    cam.far = r * 6;
    cam.updateProjectionMatrix();
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    if (this.mode === "doll") this.controls.update();
    else this.stepWalk();
    if (!this.dirty) return;
    this.dirty = false;
    this.composer.render();
  };

  private blocked(x: number, z: number): boolean {
    const p = { x: x / M, y: z / M };
    for (const poly of this.blockers) if (pointInPolygon(p, poly) || distToPoly(p, poly) < RADIUS / M) return true;
    return false;
  }

  private stepWalk() {
    const w = this.walk;
    let dx = 0;
    let dz = 0;
    const speed = this.keys.has("shift") ? 0.09 : 0.045;
    const fwd = (this.keys.has("w") || this.keys.has("arrowup") ? 1 : 0) - (this.keys.has("s") || this.keys.has("arrowdown") ? 1 : 0);
    const side = (this.keys.has("d") ? 1 : 0) - (this.keys.has("a") ? 1 : 0);
    const turn = (this.keys.has("arrowleft") ? 1 : 0) - (this.keys.has("arrowright") ? 1 : 0);
    if (turn) {
      w.yaw += turn * 0.03;
      this.dirty = true;
    }
    if (fwd || side) {
      dx = (-Math.sin(w.yaw) * fwd + Math.cos(w.yaw) * side) * speed;
      dz = (-Math.cos(w.yaw) * fwd - Math.sin(w.yaw) * side) * speed;
      w.target = null;
    } else if (w.target) {
      const tx = w.target.x - w.x;
      const tz = w.target.z - w.z;
      const d = Math.hypot(tx, tz);
      if (d < 0.05) w.target = null;
      else {
        const s = Math.min(d, Math.max(0.03, d * 0.08));
        dx = (tx / d) * s;
        dz = (tz / d) * s;
      }
    }
    if (dx || dz) {
      // langs een muur glijden in plaats van vast te lopen
      if (!this.blocked(w.x + dx, w.z + dz)) {
        w.x += dx;
        w.z += dz;
      } else if (!this.blocked(w.x + dx, w.z)) w.x += dx;
      else if (!this.blocked(w.x, w.z + dz)) w.z += dz;
      else w.target = null;
      // op de vloer van de ruimte waarin je staat
      const room = this.rooms.find((r) => pointInPolygon({ x: w.x / M, y: w.z / M }, r.poly));
      if (room) w.y = room.y + EYE;
      this.dirty = true;
    }
    this.camera.position.set(w.x, w.y, w.z);
    this.camera.rotation.set(w.pitch, w.yaw, 0, "YXZ");
  }

  private down: { x: number; y: number; moved: boolean; yaw: number; pitch: number } | null = null;
  private handlers: [EventTarget, string, EventListener][] = [];

  private bindInput() {
    const el = this.renderer.domElement;
    const on = (t: EventTarget, type: string, fn: EventListener) => {
      t.addEventListener(type, fn);
      this.handlers.push([t, type, fn]);
    };
    on(el, "pointerdown", ((e: PointerEvent) => {
      this.down = { x: e.clientX, y: e.clientY, moved: false, yaw: this.walk.yaw, pitch: this.walk.pitch };
      if (this.mode === "walk") el.setPointerCapture(e.pointerId);
    }) as EventListener);
    on(el, "pointermove", ((e: PointerEvent) => {
      const d = this.down;
      if (!d) return;
      const mx = e.clientX - d.x;
      const my = e.clientY - d.y;
      if (Math.hypot(mx, my) > 4) d.moved = true;
      if (this.mode === "walk" && d.moved) {
        // slepen = rondkijken
        this.walk.yaw = d.yaw + mx * 0.004;
        this.walk.pitch = Math.max(-1.2, Math.min(1.0, d.pitch + my * 0.004));
        this.walk.target = null;
        this.dirty = true;
      }
    }) as EventListener);
    on(el, "pointerup", ((e: PointerEvent) => {
      const d = this.down;
      this.down = null;
      if (!d || d.moved) return;
      const hit = this.pick(e);
      const item = hit && itemOf(hit.object);
      if (item) {
        this.cb.onPickItem?.(item);
        return;
      }
      if (this.mode === "walk" && hit) {
        // klik op de vloer: daarheen wandelen
        this.walk.target = { x: hit.point.x, z: hit.point.z };
      }
      this.cb.onPickRoom?.(hit ? (hit.object.userData.room as string) : null);
    }) as EventListener);
    on(el, "wheel", ((e: WheelEvent) => {
      if (this.mode !== "walk") return;
      e.preventDefault();
      const s = -Math.sign(e.deltaY) * 0.35;
      const nx = this.walk.x - Math.sin(this.walk.yaw) * s;
      const nz = this.walk.z - Math.cos(this.walk.yaw) * s;
      if (!this.blocked(nx, nz)) {
        this.walk.x = nx;
        this.walk.z = nz;
        this.dirty = true;
      }
    }) as EventListener);
    on(window, "keydown", ((e: KeyboardEvent) => {
      if (this.mode !== "walk" || (e.target as HTMLElement)?.closest?.("input,select,textarea")) return;
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"].includes(k)) {
        this.keys.add(k);
        e.preventDefault();
      }
    }) as EventListener);
    on(window, "keyup", ((e: KeyboardEvent) => void this.keys.delete(e.key.toLowerCase())) as EventListener);
    on(window, "blur", (() => this.keys.clear()) as EventListener);
  }

  private unbind() {
    for (const [t, type, fn] of this.handlers) t.removeEventListener(type, fn);
    this.handlers = [];
  }

  private pick(e: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    // wat er eerst geraakt wordt; enkel een vloer telt
    const all = ray.intersectObjects([...this.model.children, this.items], true).filter((h) => h.object.visible && (h.object.parent?.visible ?? true));
    const first = all[0];
    return first && (first.object.userData.room || itemOf(first.object)) ? first : null;
  }

  /* ---------------- meubels ---------------- */

  private items = new THREE.Group();
  private itemGeo = new Map<string, { mat: FMat; geo: THREE.BufferGeometry }[]>();

  /** Meubels (opnieuw) zetten; modellen worden onthouden per soort, maat en kleur. */
  setItems(list: Item3d[]) {
    if (!this.items.parent) this.scene.add(this.items);
    this.items.clear();
    const used = new Set<string>();
    for (const it of list) {
      const key = `${it.def.id}|${it.width}|${it.depth}|${it.height}|${it.color}`;
      used.add(key);
      let parts = this.itemGeo.get(key);
      if (!parts) {
        parts = mergeParts(buildFurniture(it.def, it.width, it.depth, it.height, { color: it.color }));
        this.itemGeo.set(key, parts);
      }
      const g = new THREE.Group();
      g.userData.item = it.id;
      for (const p of parts) {
        const m = new THREE.Mesh(p.geo, this.mats.get(p.mat));
        const see = p.mat === "glas" || p.mat === "spiegel";
        m.castShadow = !see && p.mat !== "kap";
        m.receiveShadow = true;
        g.add(m);
      }
      g.position.set(it.x * M, it.y * M, it.z * M);
      g.rotation.y = (-it.rotation * Math.PI) / 180;
      this.items.add(g);
    }
    // modellen die niet meer gebruikt worden opruimen
    for (const [k, parts] of this.itemGeo) if (!used.has(k)) {
      parts.forEach((p) => p.geo.dispose());
      this.itemGeo.delete(k);
    }
    this.dirty = true;
  }
}

/** Plaats van een meubel in 3D (mm), met zijn soort en kleur. */
export interface Item3d {
  id: string;
  def: FurnitureDef;
  x: number;
  y: number;
  z: number;
  rotation: number;
  width: number;
  depth: number;
  height: number;
  color: string;
}

function itemOf(o: THREE.Object3D | null): string | null {
  for (let x: THREE.Object3D | null = o; x; x = x.parent) if (x.userData.item) return x.userData.item as string;
  return null;
}

function isSoftwareRenderer(r: THREE.WebGLRenderer): boolean {
  const gl = r.getContext();
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  return /swiftshader|llvmpipe|software/i.test(name);
}

function area(poly: Vec[]) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s / 2);
}

function centroid(poly: Vec[]): Vec {
  // een punt binnen de ruimte: het zwaartepunt, of anders het midden van de omhullende
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const c = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * c;
    cy += (p.y + q.y) * c;
    a += c;
  }
  const g = a ? { x: cx / (3 * a), y: cy / (3 * a) } : poly[0];
  if (pointInPolygon(g, poly)) return g;
  return poly[0];
}

function distToPoly(p: Vec, poly: Vec[]) {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
  }
  return best;
}

/**
 * Lijntekening van een meubel op het grondplan, zoals op een bouwplan: een
 * omtrek (wit gevuld, zodat de vloer erachter wegvalt) en fijne lijnen voor
 * kussens, lakens, deurtjes en kranen.
 *
 * Eigen assen in mm: het midden is (0, 0), de breedte langs x, de diepte
 * langs y, de rug (muurkant) aan y = -d/2 en de voorkant aan y = +d/2.
 */
import type { FurnitureDef } from "./library";

export interface SymbolLayer {
  /** Omtrek: gevuld met papier en met een dunne lijn. */
  outline: string;
  /** Detaillijnen (fijner). */
  lines: string;
  /** Gestippeld (bv. de rand van een tapijt, de bovenkasten van een keuken). */
  dashed: string;
}

/** Lagen in tekenvolgorde (bv. eerst de stoelen, dan de tafel erover). */
export type PlanSymbol = SymbolLayer[];

const f = (v: number) => Math.round(v * 10) / 10;

export function rect(x0: number, y0: number, x1: number, y1: number, r = 0): string {
  const a = Math.min(x0, x1);
  const b = Math.max(x0, x1);
  const c = Math.min(y0, y1);
  const d = Math.max(y0, y1);
  const rr = Math.max(0, Math.min(r, (b - a) / 2, (d - c) / 2));
  if (!rr) return `M${f(a)} ${f(c)}H${f(b)}V${f(d)}H${f(a)}Z`;
  return (
    `M${f(a + rr)} ${f(c)}H${f(b - rr)}A${f(rr)} ${f(rr)} 0 0 1 ${f(b)} ${f(c + rr)}V${f(d - rr)}` +
    `A${f(rr)} ${f(rr)} 0 0 1 ${f(b - rr)} ${f(d)}H${f(a + rr)}A${f(rr)} ${f(rr)} 0 0 1 ${f(a)} ${f(d - rr)}V${f(c + rr)}A${f(rr)} ${f(rr)} 0 0 1 ${f(a + rr)} ${f(c)}Z`
  );
}

export function ellipse(cx: number, cy: number, rx: number, ry = rx): string {
  return `M${f(cx - rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx + rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx - rx)} ${f(cy)}Z`;
}

const line = (x0: number, y0: number, x1: number, y1: number) => `M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}`;

/** Een stoel aan (cx, cy), gedraaid over `angle` (bij 0 zit de rug boven). */
function chair(cx: number, cy: number, angle: number, out: { o: string[]; l: string[] }) {
  const w = 440;
  const d = 480;
  const pts = (x: number, y: number) => {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return [cx + x * c - y * s, cy + x * s + y * c];
  };
  const poly = (ps: [number, number][]) => ps.map(([x, y], i) => { const [X, Y] = pts(x, y); return `${i ? "L" : "M"}${f(X)} ${f(Y)}`; }).join("") + "Z";
  out.o.push(poly([[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]));
  out.l.push(poly([[-w / 2 + 20, -d / 2 + 20], [w / 2 - 20, -d / 2 + 20], [w / 2 - 20, -d / 2 + 80], [-w / 2 + 20, -d / 2 + 80]]));
}

/** Stoelen rond een rechthoekige tafel: op de lange zijden, en aan de koppen vanaf 6. */
function tableChairs(w: number, d: number, n: number, out: { o: string[]; l: string[] }) {
  const ends = n >= 6 ? 2 : 0;
  const perSide = Math.max(1, Math.round((n - ends) / 2));
  const off = 260; // stoel schuift half onder de tafel
  for (let i = 0; i < perSide; i++) {
    const x = -w / 2 + (w / perSide) * (i + 0.5);
    chair(x, -d / 2 - off + 240, 0, out);
    chair(x, d / 2 + off - 240, Math.PI, out);
  }
  if (ends) {
    chair(-w / 2 - off + 240, 0, -Math.PI / 2, out);
    chair(w / 2 + off - 240, 0, Math.PI / 2, out);
  }
}

export function planSymbol(def: FurnitureDef, w: number, d: number): PlanSymbol {
  const layers: PlanSymbol = [];
  let o: string[] = [];
  let l: string[] = [];
  let ds: string[] = [];
  /** Wat tot nu getekend is, wordt een laag; de volgende komt erover. */
  const flush = () => {
    if (o.length || l.length || ds.length) layers.push({ outline: o.join(""), lines: l.join(""), dashed: ds.join("") });
    o = [];
    l = [];
    ds = [];
  };
  const x0 = -w / 2;
  const x1 = w / 2;
  const y0 = -d / 2;
  const y1 = d / 2;
  const n = def.opt?.n ?? 1;
  switch (def.shape) {
    case "sofa":
    case "fauteuil": {
      const arm = Math.min(200, w * 0.12);
      const back = Math.min(220, d * 0.24);
      const seats = def.shape === "fauteuil" ? 1 : n;
      o.push(rect(x0, y0, x1, y1, 60));
      l.push(rect(x0 + arm, y0, x1 - arm, y0 + back, 30));
      l.push(rect(x0, y0 + 40, x0 + arm, y1, 40), rect(x1 - arm, y0 + 40, x1, y1, 40));
      const sw = (w - 2 * arm) / seats;
      for (let i = 0; i < seats; i++) l.push(rect(x0 + arm + i * sw + 8, y0 + back + 8, x0 + arm + (i + 1) * sw - 8, y1 - 30, 40));
      break;
    }
    case "hoeksofa": {
      // L: de lange rug langs y0, het chaise-deel langs links (of rechts)
      const left = !def.opt?.left;
      const seatD = Math.min(1000, d * 0.5);
      const back = 220;
      const arm = 160;
      const cx = left ? x0 : x1;
      const s = left ? 1 : -1;
      // een L als twee rechthoeken
      o.push(rect(x0, y0, x1, y0 + seatD, 50));
      o.push(rect(cx, y0, cx + s * seatD, y1, 50));
      l.push(rect(x0 + (left ? 0 : arm), y0, x1 - (left ? arm : 0), y0 + back, 30));
      l.push(rect(cx, y0, cx + s * back, y1 - 0, 30));
      l.push(rect(left ? x1 - arm : x0, y0 + 40, left ? x1 : x0 + arm, y0 + seatD, 40));
      // zitkussens
      const seatsLen = w - seatD - arm;
      const k = Math.max(1, Math.round(seatsLen / 800));
      for (let i = 0; i < k; i++) {
        const a = left ? x0 + seatD + (seatsLen / k) * i : x1 - seatD - (seatsLen / k) * (i + 1);
        l.push(rect(a + 8, y0 + back + 8, a + seatsLen / k - 8, y0 + seatD - 30, 40));
      }
      // armleuning aan het einde van het zijdeel
      l.push(rect(cx, y1 - arm, cx + s * seatD, y1, 40));
      l.push(rect(cx + s * (back + 8), y0 + back + 8, cx + s * (seatD - 30), y1 - arm - 8, 40));
      break;
    }
    case "poef":
      o.push(rect(x0, y0, x1, y1, Math.min(w, d) * 0.25));
      l.push(rect(x0 + 40, y0 + 40, x1 - 40, y1 - 40, Math.min(w, d) * 0.2));
      break;
    case "salontafel":
      o.push(rect(x0, y0, x1, y1, 30));
      l.push(rect(x0 + 40, y0 + 40, x1 - 40, y1 - 40, 15));
      break;
    case "salontafel-rond":
    case "kruk":
      o.push(ellipse(0, 0, w / 2, d / 2));
      l.push(ellipse(0, 0, w / 2 - 40, d / 2 - 40));
      break;
    case "tafel": {
      tableChairs(w, d, def.opt?.stoelen ?? 4, { o, l });
      flush();
      o.push(rect(x0, y0, x1, y1, 20));
      break;
    }
    case "tafel-rond": {
      const k = def.opt?.stoelen ?? 4;
      for (let i = 0; i < k; i++) {
        const a = (i / k) * Math.PI * 2 + Math.PI / 4;
        const r = w / 2 - 20;
        chair(Math.cos(a) * r, Math.sin(a) * r, a + Math.PI / 2, { o, l });
      }
      flush();
      o.push(ellipse(0, 0, w / 2, d / 2));
      break;
    }
    case "stoel": {
      o.push(rect(x0, y0, x1, y1, 30));
      l.push(rect(x0 + 20, y0 + 20, x1 - 20, y0 + 80, 15));
      break;
    }
    case "bed": {
      const crib = def.opt?.left;
      o.push(rect(x0, y0, x1, y1, crib ? 10 : 25));
      if (crib) {
        l.push(rect(x0 + 30, y0 + 30, x1 - 30, y1 - 30));
        for (let x = x0 + 110; x < x1 - 60; x += 80) l.push(line(x, y0, x, y0 + 30), line(x, y1 - 30, x, y1));
        break;
      }
      const head = 60;
      l.push(line(x0, y0 + head, x1, y0 + head));
      // kussens
      const pw = n === 1 ? w - 200 : (w - 240) / 2;
      for (let i = 0; i < n; i++) {
        const a = x0 + 100 + i * (pw + 40);
        l.push(rect(a, y0 + head + 60, a + pw, y0 + head + 60 + 380, 60));
      }
      // dekbed met teruggeslagen hoek
      const top = y0 + head + 520;
      l.push(line(x0 + 15, top, x1 - 15, top));
      l.push(line(x0 + 15, top + 260, x1 - 15, top + 260));
      l.push(line(x1 - 15, top + 260, x1 - 15 - Math.min(400, w * 0.3), top));
      break;
    }
    case "nachtkastje":
      o.push(rect(x0, y0, x1, y1, 10));
      l.push(line(x0 + 30, y1 - 40, x1 - 30, y1 - 40));
      break;
    case "kleerkast":
    case "hoge-kast":
    case "koelkast": {
      o.push(rect(x0, y0, x1, y1));
      // kast: diagonaal (hoge kast), deurtjes langs de voorkant
      l.push(line(x0, y0, x1, y1 - 30));
      l.push(line(x0, y1 - 30, x1, y1 - 30));
      const doors = def.shape === "hoge-kast" ? 1 : n;
      for (let i = 1; i < doors; i++) l.push(line(x0 + (w / doors) * i, y1 - 30, x0 + (w / doors) * i, y1));
      if (def.shape === "koelkast") l.push(line(x1, y0, x0, y1 - 30));
      break;
    }
    case "kast-laag": {
      o.push(rect(x0, y0, x1, y1));
      l.push(line(x0, y1 - 25, x1, y1 - 25));
      for (let i = 1; i < n; i++) l.push(line(x0 + (w / n) * i, y1 - 25, x0 + (w / n) * i, y1));
      break;
    }
    case "boekenkast":
      o.push(rect(x0, y0, x1, y1));
      l.push(line(x0 + 20, y0 + 20, x1 - 20, y0 + 20));
      for (let x = x0 + w / Math.max(1, Math.round(w / 800)); x < x1 - 1; x += w / Math.max(1, Math.round(w / 800))) l.push(line(x, y0, x, y1));
      break;
    case "keukenkast":
    case "vaatwasser":
    case "kookplaat":
    case "spoelbak": {
      // werkblad 2 cm over de kast; de bovenkasten erboven gestippeld
      o.push(rect(x0, y0, x1, y1));
      l.push(line(x0, y1 - 20, x1, y1 - 20));
      ds.push(line(x0, y0 + 350, x1, y0 + 350));
      if (def.shape === "kookplaat") {
        const k = n;
        const ps = k === 5 ? [[-0.3, -0.25], [0.3, -0.25], [-0.3, 0.25], [0.3, 0.25], [0, 0]] : [[-0.25, -0.22], [0.25, -0.22], [-0.25, 0.22], [0.25, 0.22]];
        l.push(rect(x0 + 40, y0 + 50, x1 - 40, y1 - 70, 20));
        for (const [px, py] of ps) l.push(ellipse(px * w, py * d, Math.min(w, d) * (k === 5 && px === 0 ? 0.14 : 0.11)));
      }
      if (def.shape === "spoelbak") {
        const bw = n === 2 ? (w - 260) / 2 : Math.min(500, w - 200);
        for (let i = 0; i < n; i++) {
          const a = n === 2 ? x0 + 100 + i * (bw + 60) : -bw / 2;
          l.push(rect(a, y0 + 120, a + bw, y1 - 120, 50));
          l.push(ellipse(a + bw / 2, y1 - 200, 25));
        }
        l.push(ellipse(0, y0 + 70, 30));
      }
      if (def.shape === "vaatwasser") l.push(line(x0 + 40, y0 + 40, x1 - 40, y1 - 60), line(x1 - 40, y0 + 40, x0 + 40, y1 - 60));
      break;
    }
    case "eiland":
      o.push(rect(x0, y0, x1, y1, 20));
      l.push(rect(x0 + 30, y0 + 30, x1 - 30, y1 - 30, 10));
      if (n === 1) {
        l.push(rect(-450, -260, 450, 260, 20));
        for (const [px, py] of [[-250, -110], [250, -110], [-250, 110], [250, 110], [0, 0]]) l.push(ellipse(px, py, px === 0 ? 100 : 80));
      }
      break;
    case "bad": {
      const free = def.opt?.n === 1;
      o.push(rect(x0, y0, x1, y1, free ? Math.min(w, d) * 0.45 : 30));
      l.push(rect(x0 + 70, y0 + 70, x1 - 70, y1 - 70, Math.min(w, d) * 0.3));
      l.push(ellipse(x0 + 250, 0, 25));
      break;
    }
    case "douche":
      o.push(rect(x0, y0, x1, y1));
      if (n === 1) {
        // inloopdouche: glazen wand aan de voorkant, deels open
        l.push(line(x0, y1, x0 + w * 0.6, y1));
        l.push(line(x0, y1 - 10, x0 + w * 0.6, y1 - 10));
      } else l.push(line(x0, y0, x1, y1), line(x1, y0, x0, y1));
      l.push(ellipse(0, 0, 40));
      break;
    case "lavabo": {
      o.push(rect(x0, y0, x1, y1, 15));
      const bw = n === 2 ? (w - 300) / 2 : Math.min(420, w - 160);
      for (let i = 0; i < n; i++) {
        const cx = n === 2 ? x0 + 100 + bw / 2 + i * (bw + 100) : 0;
        l.push(ellipse(cx, 30, bw / 2, (d - 160) / 2));
        l.push(ellipse(cx, y0 + 50, 18));
      }
      break;
    }
    case "wc":
      o.push(rect(x0, y0, x1, y0 + 120, 20));
      o.push(`M${f(x0 + 20)} ${f(y0 + 120)}C${f(x0 + 20)} ${f(y1 + 30)} ${f(x1 - 20)} ${f(y1 + 30)} ${f(x1 - 20)} ${f(y0 + 120)}Z`);
      l.push(ellipse(0, y0 + 300, w / 2 - 70, 160));
      break;
    case "radiator":
      o.push(rect(x0, y0, x1, y1));
      for (let x = x0 + 50; x < x1; x += 50) l.push(line(x, y0, x, y1));
      break;
    case "wasmachine":
      o.push(rect(x0, y0, x1, y1, 15));
      l.push(ellipse(0, 40, Math.min(w, d) * 0.32));
      l.push(line(x0, y0 + 90, x1, y0 + 90));
      break;
    case "bureau":
      o.push(rect(x0, y0, x1, y1, 10));
      l.push(rect(x1 - 450, y0 + 20, x1 - 20, y1 - 20));
      break;
    case "bureaustoel":
      o.push(ellipse(0, 40, w / 2 - 40, d / 2 - 60));
      l.push(rect(-w / 2 + 60, y0, w / 2 - 60, y0 + 110, 50));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        l.push(line(0, 40, Math.cos(a) * (w / 2), 40 + Math.sin(a) * (d / 2 - 20)));
      }
      break;
    case "tapijt":
      if (n === 1) {
        o.push(ellipse(0, 0, w / 2, d / 2));
        ds.push(ellipse(0, 0, w / 2 - 60, d / 2 - 60));
      } else {
        o.push(rect(x0, y0, x1, y1));
        ds.push(rect(x0 + 60, y0 + 60, x1 - 60, y1 - 60));
      }
      break;
    case "plant": {
      o.push(ellipse(0, 0, w / 2 - 60, d / 2 - 60));
      const r = Math.min(w, d) / 2;
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const b = a + 0.35;
        l.push(`M0 0Q${f(Math.cos(a) * r * 0.7)} ${f(Math.sin(a) * r * 0.7)} ${f(Math.cos(b) * r)} ${f(Math.sin(b) * r)}`);
      }
      break;
    }
    case "staanlamp":
      o.push(ellipse(0, 0, w / 2, d / 2));
      l.push(ellipse(0, 0, w / 4, d / 4));
      l.push(line(-w / 2, 0, w / 2, 0), line(0, -d / 2, 0, d / 2));
      break;
    case "tv":
      o.push(rect(x0, y0 + d * 0.3, x1, y0 + d * 0.3 + 60));
      l.push(rect(-w * 0.15, y0 + d * 0.3 + 60, w * 0.15, y1, 10));
      break;
  }
  flush();
  return layers;
}

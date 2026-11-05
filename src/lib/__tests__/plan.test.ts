import { describe, expect, it } from "vitest";
import { createFloor } from "../model/doc";
import type { Floor } from "../model/types";
import {
  addPolyline,
  addRectangle,
  analyzeFloor,
  findFaces,
  normalizeGraph,
  ownWalls,
  removeWalls,
  segmentIntersection,
  stretch,
  wallPolygons,
} from "../geometry/plan";

let seq = 0;
const ids = () => `id${++seq}`;
const EXT = { thickness: 300, height: 2600, kind: "exterior" as const, loadBearing: true };
const INT = { thickness: 100, height: 2600, kind: "interior" as const, loadBearing: false };

const empty = (): Floor => createFloor("Gelijkvloers");
const m2 = (mm2: number) => Math.round(mm2 / 10_000) / 100;

describe("netwerk normaliseren", () => {
  it("voegt samenvallende knooppunten samen", () => {
    const g = normalizeGraph(
      {
        nodes: [
          { id: "a", x: 0, y: 0 },
          { id: "b", x: 1000, y: 0 },
          { id: "c", x: 1001, y: 1 },
          { id: "d", x: 1000, y: 1000 },
        ],
        walls: [
          { id: "w1", start: "a", end: "b", ...EXT },
          { id: "w2", start: "c", end: "d", ...EXT },
        ],
      },
      ids,
    );
    expect(g.nodes).toHaveLength(3);
    expect(g.walls.find((w) => w.id === "w2")!.start).toBe("b");
  });

  it("splitst een muur waar een andere ertegen eindigt (T-aansluiting)", () => {
    const g = normalizeGraph(
      {
        nodes: [
          { id: "a", x: 0, y: 0 },
          { id: "b", x: 4000, y: 0 },
          { id: "c", x: 2000, y: 0 },
          { id: "d", x: 2000, y: 3000 },
        ],
        walls: [
          { id: "w1", start: "a", end: "b", ...EXT },
          { id: "w2", start: "c", end: "d", ...INT },
        ],
      },
      ids,
    );
    expect(g.walls).toHaveLength(3);
    expect(g.walls.filter((w) => w.thickness === 300)).toHaveLength(2);
  });

  it("maakt een knooppunt waar muren kruisen", () => {
    expect(segmentIntersection({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: -5 }, { x: 5, y: 5 })).toEqual({ x: 5, y: 0 });
    expect(segmentIntersection({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: -5 }, { x: 10, y: 5 })).toBeNull();
    const g = normalizeGraph(
      {
        nodes: [
          { id: "a", x: 0, y: 0 },
          { id: "b", x: 4000, y: 0 },
          { id: "c", x: 2000, y: -1000 },
          { id: "d", x: 2000, y: 1000 },
        ],
        walls: [
          { id: "w1", start: "a", end: "b", ...EXT },
          { id: "w2", start: "c", end: "d", ...EXT },
        ],
      },
      ids,
    );
    expect(g.walls).toHaveLength(4);
    expect(g.nodes).toHaveLength(5);
  });

  it("ruimt dubbele en overlappende muren op", () => {
    let f = addPolyline(empty(), [{ x: 0, y: 0 }, { x: 4000, y: 0 }], EXT, ids);
    f = addPolyline(f, [{ x: 1000, y: 0 }, { x: 3000, y: 0 }], INT, ids);
    expect(f.walls).toHaveLength(3);
    // de bestaande (dikkere) muur blijft
    expect(f.walls.every((w) => w.thickness === 300)).toBe(true);
  });
});

describe("ruimtes", () => {
  it("vindt één ruimte in een rechthoek, met netto oppervlakte", () => {
    // binnenmaat 6 × 4,5 m met muren van 30 cm: hartlijnen 6,3 × 4,8 m
    const f = addRectangle(empty(), { x: -150, y: -150 }, { x: 6150, y: 4650 }, EXT, ids);
    const a = analyzeFloor(f);
    expect(f.rooms).toHaveLength(1);
    expect(a.rooms).toHaveLength(1);
    expect(m2(a.rooms[0].area)).toBe(27);
    expect(a.outerBounds).toEqual({ minX: -300, minY: -300, maxX: 6300, maxY: 4800 });
    expect(f.walls.every((w) => w.kind === "exterior")).toBe(true);
  });

  it("deelt een kamer in twee met een binnenmuur", () => {
    let f = addRectangle(empty(), { x: 0, y: 0 }, { x: 8000, y: 4000 }, EXT, ids);
    f = addPolyline(f, [{ x: 3000, y: 0 }, { x: 3000, y: 4000 }], INT, ids);
    const a = analyzeFloor(f);
    expect(f.rooms).toHaveLength(2);
    const areas = a.rooms.map((r) => m2(r.area)).sort((x, y) => x - y);
    // links: (3000-150-50) × (4000-300) = 2800 × 3700; rechts: (5000-50-150) × 3700
    expect(areas).toEqual([10.36, 17.76]);
    const inner = f.walls.find((w) => w.thickness === 100)!;
    expect(inner.kind).toBe("interior");
  });

  it("twee aangrenzende rechthoeken delen hun muur", () => {
    let f = addRectangle(empty(), { x: 0, y: 0 }, { x: 4000, y: 4000 }, EXT, ids);
    f = addRectangle(f, { x: 4000, y: 0 }, { x: 7000, y: 3000 }, EXT, ids);
    expect(f.rooms).toHaveLength(2);
    // gedeelde muur is één muur, geen twee
    const vertical = f.walls.filter((w) => {
      const a = f.nodes.find((n) => n.id === w.start)!;
      const b = f.nodes.find((n) => n.id === w.end)!;
      return a.x === 4000 && b.x === 4000;
    });
    expect(vertical).toHaveLength(2); // gesplitst op y=3000, maar niet verdubbeld
  });

  it("negeert losse muurstukken bij het zoeken naar ruimtes", () => {
    let f = addRectangle(empty(), { x: 0, y: 0 }, { x: 4000, y: 4000 }, EXT, ids);
    f = addPolyline(f, [{ x: 4000, y: 2000 }, { x: 6000, y: 2000 }], EXT, ids);
    expect(findFaces(f).bounded).toHaveLength(1);
  });

  it("behoudt naam en functie als een ruimte verandert", () => {
    let f = addRectangle(empty(), { x: 0, y: 0 }, { x: 6000, y: 4000 }, EXT, ids);
    f = { ...f, rooms: [{ ...f.rooms[0], name: "Living", function: "living" }] };
    f = addPolyline(f, [{ x: 4000, y: 0 }, { x: 4000, y: 4000 }], INT, ids);
    expect(f.rooms).toHaveLength(2);
    // het grootste deel (links, 4 m) houdt de naam
    const living = analyzeFloor(f).rooms.find((r) => r.room.name === "Living")!;
    expect(living.center.x).toBeLessThan(4000);
  });

  it("een ruimte verwijderen haalt enkel haar eigen muren weg", () => {
    let f = addRectangle(empty(), { x: 0, y: 0 }, { x: 4000, y: 4000 }, EXT, ids);
    f = addRectangle(f, { x: 4000, y: 0 }, { x: 8000, y: 4000 }, EXT, ids);
    const right = f.rooms.find((r) => {
      const a = analyzeFloor(f).rooms.find((x) => x.room.id === r.id)!;
      return a.center.x > 4000;
    })!;
    f = removeWalls(f, ownWalls(f, right.id), ids);
    expect(f.rooms).toHaveLength(1);
    expect(f.walls).toHaveLength(4);
  });
});

describe("muurhoeken", () => {
  it("maakt een nette verstekhoek in een hoek van 90°", () => {
    const f = addRectangle(empty(), { x: 0, y: 0 }, { x: 4000, y: 3000 }, EXT, ids);
    const polys = wallPolygons(f);
    const all = [...polys.values()].flat();
    // de buitenhoek ligt 15 cm buiten de hartlijn, in beide richtingen
    expect(all.some((p) => Math.abs(p.x + 150) < 1e-6 && Math.abs(p.y + 150) < 1e-6)).toBe(true);
    expect(all.some((p) => Math.abs(p.x - 150) < 1e-6 && Math.abs(p.y - 150) < 1e-6)).toBe(true);
  });
});

describe("rekken", () => {
  it("maakt een kamer breder en schuift de rest mee", () => {
    let f = addRectangle(empty(), { x: 0, y: 0 }, { x: 4000, y: 4000 }, EXT, ids);
    f = addRectangle(f, { x: 4000, y: 0 }, { x: 7000, y: 4000 }, EXT, ids);
    const byX = (fl: Floor) =>
      analyzeFloor(fl)
        .rooms.sort((p, q) => p.center.x - q.center.x)
        .map((r) => m2(r.area));
    const before = byX(f);
    const g = stretch(f, { x: 1, y: 0 }, 3850, 1000)!;
    const after = byX(g);
    expect(Math.max(...g.nodes.map((n) => n.x))).toBe(8000);
    // linkerkamer 1 m breder (3,7 m² meer), rechterkamer ongewijzigd
    expect(after[0]).toBeCloseTo(before[0] + 3.7, 2);
    expect(after[1]).toBeCloseTo(before[1], 2);
  });

  it("weigert in te krimpen als er een muur in de weg zit", () => {
    let f = addRectangle(empty(), { x: 0, y: 0 }, { x: 6000, y: 4000 }, EXT, ids);
    f = addPolyline(f, [{ x: 3000, y: 0 }, { x: 3000, y: 4000 }], INT, ids);
    expect(stretch(f, { x: 1, y: 0 }, 5850, -4000)).toBeNull();
  });
});

describe("snelheid", () => {
  it("bouwt een plan van 300 muren snel opnieuw op", () => {
    let f = empty();
    // 10 × 10 raster van kamers = 220 muren, plus 80 extra binnenmuren
    for (let i = 0; i <= 10; i++) {
      f = { ...f, ...addPolyline(f, [{ x: i * 3000, y: 0 }, { x: i * 3000, y: 30000 }], EXT, ids) };
      f = { ...f, ...addPolyline(f, [{ x: 0, y: i * 3000 }, { x: 30000, y: i * 3000 }], EXT, ids) };
    }
    const t0 = performance.now();
    const a = analyzeFloor(f);
    const t1 = performance.now();
    expect(a.rooms.length).toBe(100);
    expect(f.walls.length).toBeGreaterThanOrEqual(220);
    expect(t1 - t0).toBeLessThan(150);
  });
});

import { floorAreas, placeRoom, roomFits, snapRoomRect, rebuildFloor, setWallThickness, sharedWalls, wallPolygons as polys2 } from "../geometry/plan";
import { History } from "../history/history";
import { updateFloor } from "../model/commands";
import { createDoc } from "../model/doc";

describe("gedeelde muur", () => {
  const T = 350;
  const P = { thickness: T, height: 2600, kind: "exterior" as const, loadBearing: true };
  const dimsOf = (f: Floor, id: string) => {
    const r = analyzeFloor(f).rooms.find((x) => x.room.id === id)!;
    const xs = r.inner.map((p) => p.x);
    const ys = r.inner.map((p) => p.y);
    return [Math.round(Math.max(...xs) - Math.min(...xs)), Math.round(Math.max(...ys) - Math.min(...ys))];
  };
  const straight = (f: Floor) =>
    f.walls.every((w) => {
      const a = f.nodes.find((n) => n.id === w.start)!;
      const b = f.nodes.find((n) => n.id === w.end)!;
      return a.x === b.x || a.y === b.y;
    });

  it("living 6 × 4,5 en daarnaast een minder diepe keuken 3,5 × 3: beide exact, geen schuine muren", () => {
    // living met binnenmaat 6 × 4,5 m
    const liv = placeRoom(empty(), { x: -175, y: -175 }, { x: 6175, y: 4675 }, P, 100, ids);
    // keuken tegen de rechterbovenhoek (hartlijn van de living), binnenmaat 3,5 × 3
    const k = placeRoom(liv.floor, { x: 6175, y: -175 }, { x: 6175 + 3500 + T, y: -175 + 3000 + T }, P, 100, ids);
    const f = k.floor;
    expect(dimsOf(f, liv.roomId!)).toEqual([6000, 4500]);
    expect(dimsOf(f, k.roomId!)).toEqual([3500, 3000]);
    expect(straight(f)).toBe(true);
    // de gedeelde muur is nu 10 cm
    expect(f.walls.some((w) => w.thickness === 100)).toBe(true);
    expect(f.rooms).toHaveLength(2);
  });

  /** Geen "ladders": evenwijdige muurlijnen die net naast elkaar lopen. */
  const noLadders = (f: Floor) => {
    const segs = f.walls.map((w) => {
      const a = f.nodes.find((n) => n.id === w.start)!;
      const b = f.nodes.find((n) => n.id === w.end)!;
      return { v: a.x === b.x, at: a.x === b.x ? a.x : a.y, lo: Math.min(a.x === b.x ? a.y : a.x, a.x === b.x ? b.y : b.x), hi: Math.max(a.x === b.x ? a.y : a.x, a.x === b.x ? b.y : b.x) };
    });
    for (const s1 of segs)
      for (const s2 of segs) {
        if (s1.v !== s2.v || s1.at === s2.at) continue;
        if (Math.abs(s1.at - s2.at) < 300 && Math.min(s1.hi, s2.hi) - Math.max(s1.lo, s2.lo) > -300) return false;
      }
    return true;
  };

  it("vier kamers tegen elkaar (zoals in de praktijk): alles exact, recht en zonder verspringingen", () => {
    const liv = placeRoom(empty(), { x: -175, y: -175 }, { x: 6175, y: 4675 }, P, 100, ids);
    // keuken rechtsboven tegen de living
    const k = placeRoom(liv.floor, { x: 6175, y: -175 }, { x: 6175 + 3500 + T, y: -175 + 3000 + T }, P, 100, ids);
    // eetkamer 6 × 3,5 onder de living, vanaf de hoek linksonder
    const e = placeRoom(k.floor, { x: -175, y: 4675 }, { x: -175 + 6000 + T, y: 4675 + 3500 + T }, P, 100, ids);
    // badkamer 2,5 × 2 in de hoek onder de keuken en naast de living
    const kb = analyzeFloor(e.floor).rooms.find((r) => r.room.id === k.roomId)!;
    const corner = e.floor.nodes.find(
      (n) => n.x === 6175 && Math.abs(n.y - Math.max(...kb.inner.map((p) => p.y)) - 175) <= 2,
    )!;
    expect(corner).toBeDefined();
    const bad = placeRoom(e.floor, corner, { x: corner.x + 2500 + T, y: corner.y + 2000 + T }, P, 100, ids);
    const f = bad.floor;
    expect(dimsOf(f, liv.roomId!)).toEqual([6000, 4500]);
    expect(dimsOf(f, k.roomId!)).toEqual([3500, 3000]);
    expect(dimsOf(f, e.roomId!)).toEqual([6000, 3500]);
    expect(dimsOf(f, bad.roomId!)).toEqual([2500, 2000]);
    expect(f.rooms).toHaveLength(4);
    expect(straight(f)).toBe(true);
    expect(noLadders(f)).toBe(true);
    // elke binnenkant is een echte rechthoek: elk punt ligt op de rand van de omhullende
    for (const r of analyzeFloor(f).rooms) {
      const xs = r.inner.map((p) => Math.round(p.x));
      const ys = r.inner.map((p) => Math.round(p.y));
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      expect(xs.every((x, i) => x === x0 || x === x1 || ys[i] === y0 || ys[i] === y1)).toBe(true);
      expect(Math.round(r.area / 1e3)).toBe(Math.round(((x1 - x0) * (y1 - y0)) / 1e3));
    }
    // gedeelde muren zijn 10 cm, gevels 35 cm
    const a = analyzeFloor(f);
    const outer = new Set(f.walls.filter((w) => w.kind === "exterior").map((w) => w.thickness));
    expect([...outer]).toEqual([T]);
    expect(f.walls.filter((w) => w.kind === "interior").every((w) => w.thickness === 100)).toBe(true);
    expect(a.outerContours).toHaveLength(1);
    // de buitenomtrek heeft enkel echte hoeken (voor nette kettingmaten)
    expect(a.outerContours[0]).toHaveLength(8);
    // geen enkele muur steekt een kamer in
    for (const r of a.rooms) {
      const xs = r.inner.map((p) => p.x);
      const ys = r.inner.map((p) => p.y);
      const [x0, x1, y0, y1] = [Math.min(...xs) + 1, Math.max(...xs) - 1, Math.min(...ys) + 1, Math.max(...ys) - 1];
      for (const poly of a.wallPolys.values())
        for (const p of poly) expect(p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1).toBe(false);
    }
  });

  it("een kamer die net naast een muur valt, schuift er exact tegenaan (geen flinterdun kamertje)", () => {
    const liv = placeRoom(empty(), { x: -175, y: -175 }, { x: 6175, y: 4675 }, P, 100, ids);
    // 17,5 cm te laag en 12 cm te ver naar rechts geklikt
    const r = snapRoomRect(liv.floor, { x: 6295, y: 0 }, { x: 6295 + 3850, y: 3350 }, "move", 650);
    expect(r.a).toEqual({ x: 6175, y: -175 });
    expect(r.b).toEqual({ x: 6175 + 3850, y: 3175 });
    const k = placeRoom(liv.floor, r.a, r.b, P, 100, ids);
    expect(k.floor.rooms).toHaveLength(2);
    expect(dimsOf(k.floor, k.roomId!)).toEqual([3500, 3000]);
  });

  it("een kamer mag tegen of in een andere kamer, maar niet half erover", () => {
    const liv = placeRoom(empty(), { x: -175, y: -175 }, { x: 6175, y: 4675 }, P, 100, ids).floor;
    // ernaast
    expect(roomFits(liv, { x: 6175, y: -175 }, { x: 9875, y: 3175 }, T)).toBe(true);
    // volledig erin (opdelen)
    expect(roomFits(liv, { x: 1000, y: 1000 }, { x: 3000, y: 3000 }, T)).toBe(true);
    // half erover
    expect(roomFits(liv, { x: 4000, y: 1000 }, { x: 8000, y: 3000 }, T)).toBe(false);
  });

  it("muurdikte aanpassen houdt de gekozen kamer even groot", () => {
    let f = addRectangle(empty(), { x: 0, y: 0 }, { x: 4000, y: 4000 }, EXT, ids);
    f = addRectangle(f, { x: 4000, y: 0 }, { x: 7000, y: 4000 }, EXT, ids);
    const right = analyzeFloor(f).rooms.find((r) => r.center.x > 4000)!;
    const before = analyzeFloor(f).rooms.map((r) => ({ x: r.center.x, a: m2(r.area) }));
    const g = setWallThickness(f, sharedWalls(f, right.room.id), 100, right.room.id, ids);
    const after = analyzeFloor(g).rooms;
    const r2 = after.find((r) => r.room.id === right.room.id)!;
    const l2 = after.find((r) => r.room.id !== right.room.id)!;
    expect(m2(r2.area)).toBeCloseTo(before.find((b) => b.x > 4000)!.a, 2);
    expect(m2(l2.area)).toBeCloseTo(before.find((b) => b.x < 4000)!.a + 0.2 * 3.7, 2);
  });
});

describe("namen en openingen na grote wijzigingen", () => {
  it("een ruimte houdt haar naam als al haar muren vervangen worden", () => {
    let f = addRectangle(empty(), { x: 0, y: 0 }, { x: 4000, y: 4000 }, EXT, ids);
    f = { ...f, rooms: [{ ...f.rooms[0], name: "Bureau", function: "bureau" }] };
    // alle muren krijgen nieuwe id's (bv. na plakken), op dezelfde plaats
    const fresh = { ...f, walls: f.walls.map((w) => ({ ...w, id: `n-${w.id}` })) };
    const g = rebuildFloor(fresh, ids, f);
    expect(g.rooms[0].name).toBe("Bureau");
  });
  it("een deur blijft aan het juiste stuk muur als de muur gesplitst wordt", () => {
    let f = addPolyline(empty(), [{ x: 0, y: 0 }, { x: 6000, y: 0 }], EXT, ids);
    const w = f.walls[0];
    f = {
      ...f,
      openings: [{ id: "deur", wall: w.id, kind: "door", offset: 4500, width: 830, height: 2100, sillHeight: 0 }],
    };
    f = addPolyline(f, [{ x: 3000, y: 0 }, { x: 3000, y: 3000 }], INT, ids);
    const o = f.openings[0];
    const host = f.walls.find((x) => x.id === o.wall)!;
    const a = f.nodes.find((n) => n.id === host.start)!;
    expect(a.x + (f.nodes.find((n) => n.id === host.end)!.x > a.x ? o.offset : -o.offset)).toBe(4500);
  });
});

describe("plafondhoogte en muren", () => {
  it("muren volgen de plafondhoogte, ook bij ongedaan maken", () => {
    const h = new History<ReturnType<typeof createDoc>>();
    let d = createDoc("A", { kind: "room", width: 4000, depth: 3000, roomFunction: "living" });
    const fl = d.floors[0];
    d = h.execute(d, updateFloor(fl.id, { height: fl.height }, { height: 2800 }, fl.name));
    expect(d.floors[0].walls.every((w) => w.height === 2800)).toBe(true);
    d = h.undo(d)!.doc;
    expect(d.floors[0].walls.every((w) => w.height === 2600)).toBe(true);
  });
});

describe("oppervlaktes", () => {
  it("telt garage en berging niet mee als bewoonbaar", () => {
    let f = addRectangle(empty(), { x: 0, y: 0 }, { x: 4000, y: 4000 }, EXT, ids);
    f = addRectangle(f, { x: 4000, y: 0 }, { x: 8000, y: 4000 }, EXT, ids);
    f = { ...f, rooms: f.rooms.map((r, i) => ({ ...r, function: i === 0 ? "living" : "garage" })) };
    const { total, habitable } = floorAreas(f);
    expect(habitable).toBeLessThan(total);
    expect(m2(habitable)).toBeCloseTo(m2(total) / 2, 1);
  });
  it("vindt de buitenomtrek van het gebouw", () => {
    const f = addRectangle(empty(), { x: 0, y: 0 }, { x: 4000, y: 3000 }, EXT, ids);
    const c = analyzeFloor(f).outerContours[0];
    const xs = c.map((p) => Math.round(p.x));
    expect(Math.min(...xs)).toBe(-150);
    expect(Math.max(...xs)).toBe(4150);
  });
});

describe("op schaal", () => {
  it("elke muur is in de tekening exact zo dik als opgegeven", () => {
    let f = addRectangle(empty(), { x: 0, y: 0 }, { x: 5000, y: 4000 }, EXT, ids);
    f = addPolyline(f, [{ x: 2000, y: 0 }, { x: 2000, y: 4000 }], INT, ids);
    for (const [id, poly] of polys2(f)) {
      const w = f.walls.find((x) => x.id === id)!;
      const a = f.nodes.find((n) => n.id === w.start)!;
      const b = f.nodes.find((n) => n.id === w.end)!;
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      const nx = -(b.y - a.y) / L;
      const ny = (b.x - a.x) / L;
      // afstand van de veelhoekhoeken tot de hartlijn = halve dikte
      const offs = poly.map((p) => Math.abs((p.x - a.x) * nx + (p.y - a.y) * ny));
      for (const o of offs) expect(o).toBeCloseTo(w.thickness / 2, 6);
    }
  });
});

describe("muren in lagen, zoals op een bouwplan", () => {
  const SP = { thickness: 380, height: 2600, kind: "exterior" as const, loadBearing: true, type: "spouw-38" };
  let k = 0;
  const gid = () => `L${k++}`;
  const blank = (): Floor =>
    ({ id: "f", name: "G", elevation: 0, height: 2600, nodes: [], walls: [], rooms: [], openings: [], items: [] }) as unknown as Floor;
  const area = (poly: { x: number; y: number }[]) =>
    Math.abs(poly.reduce((s, p, i) => s + p.x * poly[(i + 1) % poly.length].y - poly[(i + 1) % poly.length].x * p.y, 0) / 2);

  it("een spouwmuur bestaat uit gevelsteen, spouw, isolatie en binnenblad, met de isolatie aan de goede kant", () => {
    const f = placeRoom(blank(), { x: -190, y: -190 }, { x: 5190, y: 4190 }, SP, { thickness: 90, type: "binnen-9" }, gid).floor;
    const a = analyzeFloor(f);
    expect(a.layers.filter((l) => l.material === "isolatie")).toHaveLength(4);
    // de isolatie ligt tussen 12 cm en 24 cm van het buitenvlak: bij de bovenste gevel dus y van −260 tot −140
    const top = f.walls.find((w) => {
      const p = f.nodes.find((n) => n.id === w.start)!;
      const q = f.nodes.find((n) => n.id === w.end)!;
      return p.y === -190 && q.y === -190;
    })!;
    const iso = a.layers.find((l) => l.wall === top.id && l.material === "isolatie")!;
    const ys = iso.poly.map((p) => Math.round(p.y));
    expect(Math.min(...ys)).toBe(-260);
    expect(Math.max(...ys)).toBe(-140);
    // de lagen vullen samen precies de muur
    const total = a.layers.filter((l) => l.wall === top.id).reduce((s, l) => s + area(l.poly), 0);
    expect(Math.round(total)).toBe(Math.round(area(a.wallPolys.get(top.id)!)));
    expect(a.insulation.length).toBeGreaterThanOrEqual(4);
  });

  it("een binnenmuur stopt tegen het binnenblad en loopt niet door de isolatie", () => {
    let f = placeRoom(blank(), { x: -190, y: -190 }, { x: 6190, y: 4190 }, SP, { thickness: 90, type: "binnen-9" }, gid).floor;
    f = addPolyline(f, [{ x: 3000, y: -190 }, { x: 3000, y: 4190 }], { thickness: 90, height: 2600, kind: "interior", loadBearing: false, type: "binnen-9" }, gid);
    f = rebuildFloor(f, gid, f);
    const a = analyzeFloor(f);
    const inner = f.walls.find((w) => w.thickness === 90)!;
    const ys = a.wallPolys.get(inner.id)!.map((p) => Math.round(p.y));
    // binnenvlak van de gevels: y = 0 en y = 4000
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...ys)).toBe(4000);
  });
});

describe("eigen muurtypes", () => {
  it("een gebruikt type dikker maken houdt de kamer even groot", async () => {
    const { saveWallType, newCustomTypeId, typeUsage } = await import("../model/wallTypeOps");
    const { createDoc } = await import("../model/doc");
    const { setCustomWallTypes } = await import("../model/wallTypes");
    const id = newCustomTypeId();
    const t1 = {
      id,
      name: "Mijn gevel",
      hint: "",
      exterior: true,
      loadBearing: true,
      layers: [
        { material: "gevelsteen" as const, thickness: 100 },
        { material: "isolatie" as const, thickness: 140 },
        { material: "kalkzandsteen" as const, thickness: 150 },
      ],
    };
    let doc = saveWallType(createDoc("Test"), t1);
    // een kamer van 5 × 4 met dit type
    let gid = 0;
    const f0 = placeRoom(doc.floors[0], { x: -195, y: -195 }, { x: 5195, y: 4195 }, { thickness: 390, height: 2600, kind: "exterior", loadBearing: true, type: id }, 90, () => `g${gid++}`).floor;
    doc = { ...doc, floors: [f0] };
    expect(typeUsage(doc, id)).toBe(4);
    const before = analyzeFloor(f0).rooms[0].area;
    // isolatie van 14 naar 20 cm
    doc = saveWallType(doc, { ...t1, layers: [t1.layers[0], { material: "isolatie", thickness: 200 }, t1.layers[2]] });
    const f1 = doc.floors[0];
    expect(f1.walls.every((w) => w.thickness === 450)).toBe(true);
    expect(analyzeFloor(f1).rooms[0].area).toBe(before);
    // de isolatielaag is nu 20 cm breed in de tekening
    const iso = analyzeFloor(f1).layers.filter((l) => l.material === "isolatie");
    expect(iso).toHaveLength(4);
    setCustomWallTypes([]);
  });
});

describe("aansluiting van muren met verschillende diktes", () => {
  it("15 cm die overgaat in 10 cm, met een muur erop: rechte kamerwanden en geen gaatjes", async () => {
    const { addPolyline, addRectangle, analyzeFloor, pointInPolygon } = await import("../geometry/plan");
    let k = 0;
    const id = () => `j${k++}`;
    const P = (thickness: number) => ({ thickness, height: 2600, kind: "interior" as const, loadBearing: false });
    let f = { id: "f", name: "G", elevation: 0, height: 2600, nodes: [], walls: [], rooms: [], openings: [], items: [] } as unknown as Floor;
    f = addRectangle(f, { x: 0, y: -2000 }, { x: 6000, y: 2000 }, { ...P(200), kind: "exterior" }, id);
    f = addPolyline(f, [{ x: 0, y: 0 }, { x: 3000, y: 0 }], P(150), id);
    f = addPolyline(f, [{ x: 3000, y: 0 }, { x: 6000, y: 0 }], P(100), id);
    f = addPolyline(f, [{ x: 3000, y: -2000 }, { x: 3000, y: 0 }], P(100), id);
    const a = analyzeFloor(f);
    expect(a.rooms).toHaveLength(3);
    // elke kamerwand loopt horizontaal of verticaal (geen schuine stukken)
    for (const r of a.rooms)
      r.inner.forEach((p, i) => {
        const q = r.inner[(i + 1) % r.inner.length];
        expect(Math.abs(q.x - p.x) < 0.5 || Math.abs(q.y - p.y) < 0.5).toBe(true);
      });
    // rond het knooppunt is elk punt ofwel kamer, ofwel muur
    const walls = [...a.wallPolys.values()];
    for (let x = 2860; x <= 3140; x += 7)
      for (let y = -140; y <= 140; y += 7) {
        const p = { x: x + 0.3, y: y + 0.3 };
        const covered = a.rooms.some((r) => pointInPolygon(p, r.inner)) || walls.some((w) => pointInPolygon(p, w));
        expect(covered, `gat op ${x},${y}`).toBe(true);
      }
  });
});

describe("muren uitlijnen", () => {
  it("een dunne muur rechtdoor naast een dikke: onderkant gelijk geeft een doorlopende wand", async () => {
    const { addPolyline, addRectangle, alignWall, analyzeFloor, wallAlignment } = await import("../geometry/plan");
    let k = 0;
    const id = () => `u${k++}`;
    const P = (thickness: number) => ({ thickness, height: 2600, kind: "interior" as const, loadBearing: false });
    let f = { id: "f", name: "G", elevation: 0, height: 2600, nodes: [], walls: [], rooms: [], openings: [], items: [] } as unknown as Floor;
    f = addRectangle(f, { x: 0, y: -2000 }, { x: 6000, y: 2000 }, { ...P(200), kind: "exterior" }, id);
    f = addPolyline(f, [{ x: 0, y: 0 }, { x: 3000, y: 0 }], P(100), id);
    f = addPolyline(f, [{ x: 3000, y: 0 }, { x: 6000, y: 0 }], P(150), id);
    const thin = f.walls.find((w) => w.thickness === 100)!;
    const al = wallAlignment(f, thin.id)!;
    expect(al.left).toBe(false);
    expect(al.right).toBe(false);
    // de onderkant (y groter) is de kant waar de normaal naar beneden wijst
    const bottom = al.n.y > 0 ? "left" : "right";
    const g = alignWall(f, thin.id, bottom, id);
    expect(wallAlignment(g, thin.id)![bottom]).toBe(true);
    // de kamer onderaan heeft nu een rechte bovenwand: alle punten bovenaan op dezelfde hoogte
    const below = analyzeFloor(g).rooms.find((r) => r.center.y > 0)!;
    const top = below.inner.filter((p) => p.y < 1000).map((p) => Math.round(p.y));
    expect(new Set(top).size).toBe(1);
    expect(top[0]).toBe(75);
    // terug naar het midden
    const h = alignWall(g, thin.id, "center", id);
    expect(h.walls.find((w) => w.id === thin.id)!.offset ?? 0).toBe(0);
  });
});

describe("vanzelf uitlijnen bij het tekenen", () => {
  it("een dunne muur rechtdoor op een dikke, met een dwarsmuur boven: de onderkant loopt door", async () => {
    const { addPolyline, addRectangle, autoAlignNewWalls, wallAlignment } = await import("../geometry/plan");
    let k = 0;
    const id = () => `v${k++}`;
    const P = (thickness: number) => ({ thickness, height: 2600, kind: "interior" as const, loadBearing: false });
    let f = { id: "f", name: "G", elevation: 0, height: 2600, nodes: [], walls: [], rooms: [], openings: [], items: [] } as unknown as Floor;
    f = addRectangle(f, { x: 0, y: -2000 }, { x: 6000, y: 2000 }, { ...P(200), kind: "exterior" }, id);
    f = addPolyline(f, [{ x: 3000, y: 0 }, { x: 6000, y: 0 }], P(150), id);
    f = addPolyline(f, [{ x: 3000, y: -2000 }, { x: 3000, y: 0 }], P(100), id);
    const before = f;
    const drawn = addPolyline(f, [{ x: 0, y: 0 }, { x: 3000, y: 0 }], P(100), id);
    const g = autoAlignNewWalls(drawn, before, id);
    const thin = g.walls.find((w) => w.thickness === 100 && g.nodes.find((n) => n.id === w.start)!.y === 0 && g.nodes.find((n) => n.id === w.end)!.y === 0)!;
    const al = wallAlignment(g, thin.id)!;
    const bottomIsLeft = al.n.y > 0;
    expect(bottomIsLeft ? al.left : al.right).toBe(true);
  });
});

describe("voegen bij een overgang van dikte", () => {
  it("tekent geen voeg tussen muren met dezelfde opbouw, wel tegen de dunnere muur", () => {
    const ip = (thickness: number, type?: string) => ({ thickness, height: 2600, kind: "interior" as const, loadBearing: false, type });
    let f = addRectangle(empty(), { x: -190, y: -2190 }, { x: 6190, y: 2190 }, { ...EXT, thickness: 380, type: "spouw-38" }, ids);
    f = addPolyline(f, [{ x: -190, y: 0 }, { x: 3000, y: 0 }], ip(100, "binnen-10"), ids);
    f = addPolyline(f, [{ x: 3000, y: 0 }, { x: 6190, y: 0 }], ip(150), ids);
    f = addPolyline(f, [{ x: 3000, y: -2190 }, { x: 3000, y: 0 }], ip(150), ids);
    // dunne muur onderaan gelijk met de dikke
    f = { ...f, walls: f.walls.map((w) => (w.thickness === 100 ? { ...w, offset: f.nodes.find((n) => n.id === w.start)!.x < 0 ? 25 : -25 } : w)) };
    const near = (a: { x: number; y: number }) => Math.abs(a.x - 3000) <= 80 && Math.abs(a.y) <= 80;
    const js = analyzeFloor(f).joints.filter(([a, b]) => near(a) && near(b));
    const key = ([a, b]: [{ x: number; y: number }, { x: number; y: number }]) =>
      [a, b].map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).sort().join("|");
    const keys = new Set(js.map(key));
    // tegen de dunne muur: bovenkant (2925→3000 op -25) en de kop (3000 van -25 tot 75)
    expect(keys).toContain("2925,-25|3000,-25");
    expect(keys).toContain("3000,-25|3000,75");
    // geen voeg tussen de twee muren van 15 cm
    for (const [a, b] of js) {
      expect(Math.max(a.y, b.y) > -74 || Math.min(a.y, b.y) > -74).toBe(true);
      if (a.x === b.x && Math.round(a.x) === 3000) expect(Math.min(a.y, b.y)).toBeGreaterThanOrEqual(-25.5);
    }
  });
});

describe("muren uit hetzelfde metselwerk", () => {
  it("vormen één geheel: geen voeg, en de gipsplaat loopt rond de ruimte", async () => {
    const { setCustomWallTypes } = await import("../model/wallTypes");
    setCustomWallTypes([
      { id: "eigen-15", name: "15", hint: "", exterior: false, loadBearing: true, layers: [{ material: "gips", thickness: 10 }, { material: "snelbouw", thickness: 130 }, { material: "gips", thickness: 10 }] },
      { id: "eigen-10", name: "10", hint: "", exterior: false, loadBearing: false, layers: [{ material: "gips", thickness: 10 }, { material: "snelbouw", thickness: 80 }, { material: "gips", thickness: 10 }] },
    ]);
    const ip = (thickness: number, type: string) => ({ thickness, height: 2600, kind: "interior" as const, loadBearing: false, type });
    let f = addRectangle(empty(), { x: -190, y: -2190 }, { x: 6190, y: 2190 }, { ...EXT, thickness: 380, type: "spouw-38" }, ids);
    f = addPolyline(f, [{ x: -190, y: 0 }, { x: 3000, y: 0 }], ip(100, "eigen-10"), ids);
    f = addPolyline(f, [{ x: 3000, y: 0 }, { x: 6190, y: 0 }], ip(150, "eigen-15"), ids);
    f = addPolyline(f, [{ x: 3000, y: -2190 }, { x: 3000, y: 0 }], ip(150, "eigen-15"), ids);
    f = { ...f, walls: f.walls.map((w) => (w.thickness === 100 ? { ...w, offset: f.nodes.find((n) => n.id === w.start)!.x < 0 ? 25 : -25 } : w)) };
    const a = analyzeFloor(f);
    const near = (p: { x: number; y: number }) => Math.abs(p.x - 3000) <= 80 && Math.abs(p.y) <= 80;
    expect(a.joints.filter(([p, q]) => near(p) && near(q))).toHaveLength(0);
    // gipsplaat: de lijn 1 cm in de muur, rond de hoek van de kamer linksboven
    const keys = new Set(a.finishLines.map(([p, q]) => [p, q].map((v) => `${Math.round(v.x)},${Math.round(v.y)}`).sort().join("|")));
    expect([...keys].some((k) => k.includes("2935,-15"))).toBe(true);
    expect(a.finishBands.length).toBe(3);
    setCustomWallTypes([]);
  });
});

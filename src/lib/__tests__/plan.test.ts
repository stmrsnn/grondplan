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

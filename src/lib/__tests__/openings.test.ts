import { describe, expect, it } from "vitest";
import {
  addOpening,
  choiceProps,
  doorConflicts,
  needsLintel,
  roomDaylight,
  roomSide,
  cornerGaps,
  fitOffset,
  hitOpening,
  openingShape,
  projectOnWall,
  snapOffset,
  updateOpening,
  wallFrame,
} from "../geometry/openings";
import { addPolyline, createsCrossing, moveNodes, placeRoom, rebuildFloor } from "../geometry/plan";
import type { Floor } from "../model/types";

let n = 0;
const ids = () => `o${n++}`;
const empty = (): Floor =>
  ({ id: "f", name: "G", elevation: 0, height: 2600, nodes: [], walls: [], rooms: [], openings: [] }) as unknown as Floor;
const P = { thickness: 350, height: 2600, kind: "exterior" as const, loadBearing: true };

/** Living 6 × 4,5 m binnenmaat; geeft de verdieping en de onderste muur. */
function living() {
  const f = placeRoom(empty(), { x: -175, y: -175 }, { x: 6175, y: 4675 }, P, 100, ids).floor;
  const bottom = f.walls.find((w) => {
    const a = f.nodes.find((x) => x.id === w.start)!;
    const b = f.nodes.find((x) => x.id === w.end)!;
    return a.y === 4675 && b.y === 4675;
  })!;
  return { f, bottom };
}

describe("deuren en ramen", () => {
  it("een muur kent zijn bruikbare lengte: tussen de binnenhoeken", () => {
    const { f, bottom } = living();
    const fr = wallFrame(f, bottom.id)!;
    expect(fr.len).toBe(6350);
    expect(fr.startMargin).toBe(175);
    expect(fr.endMargin).toBe(175);
  });

  it("een opening blijft binnen de muur en schuift weg van een andere", () => {
    const { f, bottom } = living();
    const fr = wallFrame(f, bottom.id)!;
    // te dicht bij de hoek: schuift tot tegen de binnenhoek
    expect(fitOffset(f, fr, 900, 100)).toBe(175 + 450);
    const g = addOpening(f, { wall: bottom.id, kind: "window", offset: 2000, width: 1200, height: 1350, sillHeight: 900 }, "r1")!;
    // een deur bovenop het raam schuift ernaast
    const off = fitOffset(g, fr, 900, 2000)!;
    expect(Math.abs(off - 2000)).toBeGreaterThanOrEqual(1050);
    // een te brede opening past niet
    expect(fitOffset(f, fr, 7000, 3000)).toBeNull();
  });

  it("afstanden tot de hoeken kloppen en de magneet centreert", () => {
    const { f, bottom } = living();
    const fr = wallFrame(f, bottom.id)!;
    const mid = snapOffset(fr, 1200, fr.len / 2 + 40);
    const g = cornerGaps(fr, mid, 1200);
    expect(g.start).toBe(g.end);
    expect(g.start + g.end + 1200).toBe(6000);
    // anders: 5 cm-stappen vanaf de hoek
    const o = snapOffset(fr, 830, 1234);
    expect(cornerGaps(fr, o, 830).start % 50).toBe(0);
  });

  it("een deur wordt correct getekend: blad haaks op de muur, boog naar de andere dagkant", () => {
    const { f, bottom } = living();
    const g = addOpening(
      f,
      { wall: bottom.id, kind: "door", offset: 1000, width: 830, height: 2115, sillHeight: 0, swing: { side: "left", hinge: "start" } },
      "d1",
    )!;
    const sh = openingShape(g, g.openings[0])!;
    const leaf = sh.leaves[0];
    expect(Math.round(Math.hypot(leaf.tip.x - leaf.hinge.x, leaf.tip.y - leaf.hinge.y))).toBe(830);
    expect(Math.round(Math.hypot(leaf.to.x - leaf.hinge.x, leaf.to.y - leaf.hinge.y))).toBe(830);
    // de uitsparing is de ruwbouwopening (blad + kader aan beide kanten) en zo dik als de muur
    const [c0, c1, , c3] = sh.cut;
    expect(Math.round(Math.hypot(c1.x - c0.x, c1.y - c0.y))).toBe(930);
    expect(Math.round(Math.hypot(c3.x - c0.x, c3.y - c0.y))).toBe(350);
  });

  it("aanklikken en op een muur leggen", () => {
    const { f, bottom } = living();
    const g = addOpening(f, { wall: bottom.id, kind: "window", offset: 3000, width: 1200, height: 1350, sillHeight: 900 }, "r1")!;
    const fr = wallFrame(g, bottom.id)!;
    const p = { x: fr.a.x + fr.d.x * 3000, y: fr.a.y + fr.d.y * 3000 };
    expect(hitOpening(g, p, 10)?.id).toBe("r1");
    const hit = projectOnWall(g, { x: p.x, y: p.y - 100 }, 50)!;
    expect(hit.frame.wall.id).toBe(bottom.id);
    expect(Math.round(hit.along)).toBe(3000);
  });

  it("wijzigen houdt de opening binnen de muur", () => {
    const { f, bottom } = living();
    const g = addOpening(f, { wall: bottom.id, kind: "door", offset: 1000, width: 830, height: 2115, sillHeight: 0 }, "d1")!;
    const h = updateOpening(g, "d1", { width: 2400 })!;
    const o = h.openings[0];
    expect(o.offset - o.width / 2).toBeGreaterThanOrEqual(175);
  });

  it("een deur blijft op haar plaats en draait nog dezelfde kant op als de muur gesplitst wordt", () => {
    const { f, bottom } = living();
    let g = addOpening(
      f,
      { wall: bottom.id, kind: "door", offset: 4500, width: 830, height: 2115, sillHeight: 0, swing: { side: "left", hinge: "start" } },
      "d1",
    )!;
    const before = openingShape(g, g.openings[0])!;
    // een binnenmuur splitst de onderste muur
    g = addPolyline(g, [{ x: 3000, y: -175 }, { x: 3000, y: 4675 }], { ...P, thickness: 100, kind: "interior" }, ids);
    g = rebuildFloor(g, ids, g);
    expect(g.openings).toHaveLength(1);
    const after = openingShape(g, g.openings[0])!;
    for (const k of ["hinge", "tip", "to"] as const) {
      expect(Math.round(after.leaves[0][k].x)).toBe(Math.round(before.leaves[0][k].x));
      expect(Math.round(after.leaves[0][k].y)).toBe(Math.round(before.leaves[0][k].y));
    }
  });
});

describe("soorten, botsingen en daglicht", () => {
  const door = (wall: string, offset: number, extra: Partial<Parameters<typeof addOpening>[1]> = {}) => ({
    wall,
    kind: "door" as const,
    offset,
    width: 830,
    height: 2100,
    sillHeight: 0,
    swing: { side: "left" as const, hinge: "start" as const },
    ...extra,
  });

  it("een gevel weet waar binnen is", () => {
    const { f, bottom } = living();
    const fr = wallFrame(f, bottom.id)!;
    const side = roomSide(f, fr)!;
    // binnen = richting het midden van de kamer (boven de onderste gevel)
    const n = side === "left" ? fr.n : { x: -fr.n.x, y: -fr.n.y };
    expect(n.y).toBeLessThan(0);
  });

  it("dubbele deur heeft twee bladen, schuifdeur en poort geen draaicirkel", () => {
    const { f, bottom } = living();
    const dbl = addOpening(f, door(bottom.id, 3000, { ...choiceProps("double", "exterior"), variant: "double" }), "d")!;
    expect(openingShape(dbl, dbl.openings[0])!.leaves).toHaveLength(2);
    const sl = addOpening(f, door(bottom.id, 3000, { ...choiceProps("sliding", "exterior"), variant: "sliding" }), "d")!;
    const s1 = openingShape(sl, sl.openings[0])!;
    expect(s1.leaves).toHaveLength(0);
    expect(s1.panels).toHaveLength(1);
    expect(s1.dashed).toHaveLength(4);
    const sw = addOpening(f, { ...door(bottom.id, 3000), ...choiceProps("slidingWindow", "exterior") }, "r")!;
    // schuifraam: twee stijlen + twee vleugels, en per vleugel een glaslijn
    const ss = openingShape(sw, sw.openings[0])!;
    expect(ss.frames).toHaveLength(4);
    expect(ss.glass).toHaveLength(2);
  });

  it("latei nodig bij een brede opening in een dragende muur", () => {
    const { f, bottom } = living();
    const g = addOpening(f, door(bottom.id, 3000, { width: 2400 }), "d")!;
    expect(needsLintel(g.openings[0], bottom)).toBe(true);
    expect(needsLintel({ ...g.openings[0], width: 900 }, bottom)).toBe(false);
  });

  it("een deur die tegen een muur of andere deur slaat, wordt gemeld", () => {
    /** Gang van `w` breed en 4 m lang, met de linker- en rechtermuur. */
    const hall = (w: number) => {
      const f = placeRoom(empty(), { x: -175, y: -175 }, { x: w + 175, y: 4175 }, P, 100, ids).floor;
      const side = (x: number) =>
        f.walls.find((wl) => {
          const a = f.nodes.find((n) => n.id === wl.start)!;
          const b = f.nodes.find((n) => n.id === wl.end)!;
          return a.x === x && b.x === x;
        })!;
      return { f, left: side(-175), right: side(w + 175) };
    };
    const inward = (f: Floor, wallId: string) => roomSide(f, wallFrame(f, wallId)!)!;
    // twee deuren tegenover elkaar in een gang van 1 m: ze slaan tegen elkaar
    const h1 = hall(1000);
    let g = addOpening(h1.f, door(h1.left.id, 2000, { swing: { side: inward(h1.f, h1.left.id), hinge: "start" } }), "a")!;
    g = addOpening(g, door(h1.right.id, 2000, { swing: { side: inward(g, h1.right.id), hinge: "end" } }), "b")!;
    expect(doorConflicts(g).get("a")).toBe("deur");
    // één deur in een gang van 50 cm: slaat tegen de muur aan de overkant
    const h2 = hall(500);
    const k = addOpening(h2.f, door(h2.left.id, 2000, { swing: { side: inward(h2.f, h2.left.id), hinge: "start" } }), "k")!;
    expect(doorConflicts(k).get("k")).toBe("muur");
    // dezelfde deur naar buiten draaiend: geen botsing
    const out = inward(h2.f, h2.left.id) === "left" ? "right" : "left";
    const o = addOpening(h2.f, door(h2.left.id, 2000, { swing: { side: out, hinge: "start" } }), "o")!;
    expect(doorConflicts(o).size).toBe(0);
  });

  it("daglicht: een living van 27 m² heeft minstens 2,25 m² glas nodig", () => {
    const { f, bottom } = living();
    const liv = { ...f, rooms: f.rooms.map((r) => ({ ...r, function: "living" })) };
    expect(roomDaylight(liv).get(liv.rooms[0].id)!.ok).toBe(false);
    const g = addOpening(liv, { ...door(bottom.id, 3000), ...choiceProps("patio", "exterior") }, "t")!;
    const d = roomDaylight(g).get(g.rooms[0].id)!;
    expect(Math.round(d.needed / 1e4)).toBe(225);
    expect(d.ok).toBe(true);
  });

  it("een muur door een andere muur slepen wordt herkend", () => {
    let f = placeRoom(empty(), { x: -175, y: -175 }, { x: 4175, y: 3175 }, P, 100, ids).floor;
    f = addPolyline(f, [{ x: 6000, y: 0 }, { x: 6000, y: 3000 }], { ...P, thickness: 100, kind: "interior" }, ids);
    const free = f.nodes.find((n) => n.x === 6000 && n.y === 0)!;
    // het losse muurtje naar binnen in de kamer slepen: kruist de gevel
    const moved = moveNodes(f, new Map([[free.id, { x: 2000, y: 1500 }]]));
    expect(createsCrossing(moved, new Set([free.id]))).toBe(true);
    const ok = moveNodes(f, new Map([[free.id, { x: 6000, y: -500 }]]));
    expect(createsCrossing(ok, new Set([free.id]))).toBe(false);
  });
});

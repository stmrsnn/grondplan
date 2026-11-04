import { describe, expect, it } from "vitest";
import {
  addOpening,
  cornerGaps,
  fitOffset,
  hitOpening,
  openingShape,
  projectOnWall,
  snapOffset,
  updateOpening,
  wallFrame,
} from "../geometry/openings";
import { addPolyline, placeRoom, rebuildFloor } from "../geometry/plan";
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
    const leaf = sh.leaf!;
    expect(Math.round(Math.hypot(leaf.tip.x - leaf.hinge.x, leaf.tip.y - leaf.hinge.y))).toBe(830);
    expect(Math.round(Math.hypot(leaf.to.x - leaf.hinge.x, leaf.to.y - leaf.hinge.y))).toBe(830);
    // de uitsparing is precies zo breed als de deur en zo dik als de muur
    const [c0, c1, , c3] = sh.cut;
    expect(Math.round(Math.hypot(c1.x - c0.x, c1.y - c0.y))).toBe(830);
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
      expect(Math.round(after.leaf![k].x)).toBe(Math.round(before.leaf![k].x));
      expect(Math.round(after.leaf![k].y)).toBe(Math.round(before.leaf![k].y));
    }
  });
});

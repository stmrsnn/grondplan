import { describe, expect, it } from "vitest";
import { addOpening, choiceOf, choiceProps, openingName, openingShape, openingSpan, roomDaylight } from "../geometry/openings";
import { placeRoom } from "../geometry/plan";
import { cleanFrame, glassShare, mirrorFrame, sashWidths, type Frame } from "../model/frames";
import type { Floor } from "../model/types";

let n = 0;
const ids = () => `f${n++}`;
const empty = (): Floor =>
  ({ id: "f", name: "G", elevation: 0, height: 2600, nodes: [], walls: [], rooms: [], openings: [] }) as unknown as Floor;
const P = { thickness: 350, height: 2600, kind: "exterior" as const, loadBearing: true };

function living() {
  const f = placeRoom(empty(), { x: -175, y: -175 }, { x: 6175, y: 4675 }, P, 100, ids).floor;
  const bottom = f.walls.find((w) => {
    const a = f.nodes.find((x) => x.id === w.start)!;
    const b = f.nodes.find((x) => x.id === w.end)!;
    return a.y === 4675 && b.y === 4675;
  })!;
  return { f: { ...f, rooms: f.rooms.map((r) => ({ ...r, function: "living" })) }, bottom };
}

describe("samengestelde ramen en deuren", () => {
  it("verdeelt de breedte: vaste maten blijven, de rest deelt", () => {
    const f: Frame = { sashes: [{ type: "deur", width: 1000 }, { type: "vast" }] };
    expect(sashWidths(f, 1400)).toEqual([1000, 400]);
    // te krap: alles in verhouding
    const w = sashWidths(f, 1100);
    expect(Math.round(w[0] + w[1])).toBe(1100);
    expect(sashWidths({ sashes: [{ type: "vast" }, { type: "vast" }, { type: "vast" }] }, 2400)).toEqual([800, 800, 800]);
  });

  it("spiegelt volgorde en scharnieren", () => {
    const m = mirrorFrame({ sashes: [{ type: "vast" }, { type: "draaikiep", hinge: "right" }] });
    expect(m.sashes).toEqual([{ type: "draaikiep", hinge: "left" }, { type: "vast" }]);
  });

  it("een volle deur telt niet als glas", () => {
    expect(glassShare({ sashes: [{ type: "deur", width: 1000 }, { type: "vast" }] }, 1400)).toBeCloseTo(400 / 1400);
    expect(glassShare({ sashes: [{ type: "deur", glass: true }] }, 1000)).toBe(1);
  });

  it("kijkt bewaarde vakken na", () => {
    expect(cleanFrame({ sashes: [{ type: "raar" }] })).toBeNull();
    expect(cleanFrame({ sashes: [{ type: "draai", width: 5 }], transom: { height: 400, type: "x" } })).toEqual({
      sashes: [{ type: "draai", hinge: "left" }],
      transom: { height: 400, type: "vast" },
    });
  });

  it("een ingebouwde soort heeft een naam, een breedte als volledige opening en een tekening", () => {
    const { f, bottom } = living();
    const props = choiceProps("vast-draaikiep", "exterior");
    expect(props.kind).toBe("window");
    const g = addOpening(f, { wall: bottom.id, offset: 3000, ...props, swing: { side: "left", hinge: "start" } }, "r")!;
    const o = g.openings[0];
    expect(openingName(o)).toBe("Vast + draaikiep");
    expect(choiceOf(o)).toBe("vast-draaikiep");
    expect(openingSpan(o)).toBe(1800);
    const sh = openingShape(g, o)!;
    // één draaivleugel (dunne boog), geen deurblad
    expect(sh.sashes).toHaveLength(1);
    expect(sh.leaves).toHaveLength(0);
    // de boog ligt binnen: aan de kant van de kamer (boven de onderste gevel)
    expect(sh.sashes[0].tip.y).toBeLessThan(4500);
    // twee buitenstijlen en één tussenstijl
    expect(sh.frames).toHaveLength(3);
  });

  it("een deur met zijlicht is een deur, met een blad en glas in het zijlicht", () => {
    const { f, bottom } = living();
    const props = choiceProps("deur-zijlicht", "exterior");
    expect(props.kind).toBe("door");
    expect(props.sillHeight).toBe(0);
    const g = addOpening(f, { wall: bottom.id, offset: 3000, ...props, swing: { side: "left", hinge: "start" } }, "d")!;
    const sh = openingShape(g, g.openings[0])!;
    expect(sh.leaves).toHaveLength(1);
    expect(sh.panels).toHaveLength(1);
    expect(sh.glass.length).toBe(2);
    // het zijlicht telt mee als daglicht
    expect(roomDaylight(g).values().next().value!.glass).toBeGreaterThan(0);
  });

  it("de vakken staan van links naar rechts zoals je het van binnen ziet", () => {
    const { f, bottom } = living();
    // binnen kijk je naar het zuiden (naar de onderste gevel): links is dan het oosten (grote x)
    const props = choiceProps("deur-zijlicht", "exterior");
    const g = addOpening(f, { wall: bottom.id, offset: 3000, ...props, swing: { side: "left", hinge: "start" } }, "d")!;
    const sh = openingShape(g, g.openings[0])!;
    const xs = sh.glass.flatMap(([a, b]) => [a.x, b.x]);
    // het deurvak (links van binnen = oostkant) ligt rechts op het plan, het zijlicht links
    expect(Math.max(...xs)).toBeLessThan(3000);
    expect(sh.leaves[0].hinge.x).toBeGreaterThan(3000);
  });
});

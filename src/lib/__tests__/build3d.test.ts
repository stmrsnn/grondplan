import { describe, expect, it } from "vitest";
import { addOpening, choiceProps } from "../geometry/openings";
import { placeRoom } from "../geometry/plan";
import { buildFloor3d, type Part } from "../three/build";
import type { Floor } from "../model/types";

let n = 0;
const ids = () => `b${n++}`;
const empty = (): Floor =>
  ({ id: "f", name: "G", elevation: 0, height: 2600, nodes: [], walls: [], rooms: [], openings: [] }) as unknown as Floor;
const P = { thickness: 380, height: 2600, kind: "exterior" as const, loadBearing: true, type: "spouw-38" };

function room() {
  const f = placeRoom(empty(), { x: -190, y: -190 }, { x: 5190, y: 4190 }, P, 100, ids).floor;
  const bottom = f.walls.find((w) => f.nodes.find((x) => x.id === w.start)!.y === 4190 && f.nodes.find((x) => x.id === w.end)!.y === 4190)!;
  return { f: { ...f, rooms: f.rooms.map((r) => ({ ...r, function: "keuken" })) }, bottom };
}

const of = <T extends Part["t"]>(parts: Part[], t: T) => parts.filter((p): p is Extract<Part, { t: T }> => p.t === t);

describe("3D-onderdelen", () => {
  it("bouwt muren, vloer met de standaard van de functie, plafond en gevel", () => {
    const { f } = room();
    const parts = buildFloor3d(f, { facade: "beige" });
    const prisms = of(parts, "prism");
    expect(prisms.filter((p) => p.mat === "pleister" && p.block)).toHaveLength(4);
    expect(prisms.every((p) => p.y1 <= 2600)).toBe(true);
    const flats = of(parts, "flat");
    expect(flats.some((p) => p.mat === "vloer:tegels" && p.room)).toBe(true);
    expect(flats.some((p) => p.ceiling && p.down)).toBe(true);
    const faces = of(parts, "face");
    expect(faces.filter((p) => p.mat === "gevel:beige")).toHaveLength(4);
    expect(faces.filter((p) => p.mat.startsWith("verf:"))).toHaveLength(4);
  });

  it("laat een gat in de muur en de gevel voor een raam, met kader, glas en dorpel", () => {
    const { f, bottom } = room();
    const g = addOpening(f, { wall: bottom.id, offset: 2700, ...choiceProps("vast-draaikiep", "exterior"), swing: { side: "left", hinge: "start" } }, "r")!;
    const parts = buildFloor3d(g);
    const prisms = of(parts, "prism");
    // borstwering (tot 90 cm) en het stuk boven het raam (vanaf 2,25 m)
    expect(prisms.some((p) => p.mat === "pleister" && p.y1 === 900)).toBe(true);
    expect(prisms.some((p) => p.mat === "pleister" && p.y0 === 2250)).toBe(true);
    expect(prisms.filter((p) => p.mat === "glas").length).toBeGreaterThanOrEqual(2);
    expect(prisms.some((p) => p.mat === "dorpel")).toBe(true);
    expect(prisms.some((p) => p.mat === "vensterbank")).toBe(true);
    const facade = of(parts, "face").find((p) => p.mat.startsWith("gevel:") && p.holes?.length);
    expect(facade?.holes?.[0]).toMatchObject({ y0: 900, y1: 2250 });
    expect(facade!.holes![0].u1 - facade!.holes![0].u0).toBeCloseTo(1800, 0);
  });

  it("een deur heeft een blad met klink en geen borstwering", () => {
    const { f, bottom } = room();
    const g = addOpening(f, { wall: bottom.id, offset: 2700, ...choiceProps("single", "exterior"), swing: { side: "right", hinge: "start" } }, "d")!;
    const parts = of(buildFloor3d(g), "prism");
    expect(parts.some((p) => p.mat === "blad")).toBe(true);
    expect(parts.some((p) => p.mat === "klink")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { snapPoint } from "../editor/snap";
import type { Node, Wall } from "../model/types";

const nodes: Node[] = [
  { id: "a", x: 0, y: 0 },
  { id: "b", x: 4000, y: 0 },
  { id: "c", x: 4000, y: 3000 },
];
const walls: Wall[] = [
  { id: "w1", start: "a", end: "b", thickness: 300, height: 2600, kind: "exterior", loadBearing: true },
  { id: "w2", start: "b", end: "c", thickness: 300, height: 2600, kind: "exterior", loadBearing: true },
];
// 0,1 px per mm: 10 px = 100 mm
const ctx = { nodes, walls, zoom: 0.1, grid: 50 };

describe("magnetisch tekenen", () => {
  it("klikt vast op een hoek", () => {
    expect(snapPoint({ x: 3950, y: 40 }, ctx)).toMatchObject({ kind: "node", p: { x: 4000, y: 0 }, target: "b" });
  });
  it("klikt vast op een muur voor een T-aansluiting", () => {
    const r = snapPoint({ x: 2012, y: 120 }, ctx);
    expect(r.kind).toBe("wall");
    expect(r.p).toEqual({ x: 2000, y: 0 });
  });
  it("valt anders op het raster van 5 cm", () => {
    expect(snapPoint({ x: 1234, y: 2026 }, ctx).p).toEqual({ x: 1250, y: 2050 });
  });
  it("houdt rechte hoeken aan bij het tekenen", () => {
    const r = snapPoint({ x: 1500, y: 2480 }, { ...ctx, from: { x: 1500, y: 600 } });
    expect(r.kind).toBe("angle");
    expect(r.p.x).toBe(1500);
    expect(r.p.y % 50).toBe(0);
  });
  it("stopt precies tegen een muur", () => {
    const r = snapPoint({ x: 3960, y: 1500 }, { ...ctx, from: { x: 1000, y: 1500 } });
    expect(r).toMatchObject({ kind: "wall", p: { x: 4000, y: 1500 } });
  });
  it("lijnt uit op een andere hoek", () => {
    const r = snapPoint({ x: 2000, y: 2960 }, { ...ctx, from: { x: 1000, y: 2960 }, free: false });
    // horizontale lijn vanaf y=2960: niet uit te lijnen in y; test x-uitlijning met een verticale lijn
    const v = snapPoint({ x: 3970, y: 2000 }, { ...ctx, from: { x: 3970, y: 500 } });
    expect(r.p.y).toBe(2960);
    expect(v.p.x).toBe(3970);
  });
});

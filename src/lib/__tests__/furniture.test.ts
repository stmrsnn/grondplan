import { describe, expect, it } from "vitest";
import { placeRoom } from "../geometry/plan";
import { furnitureDef, LIBRARY } from "../furniture/library";
import { addItem, cleanItem, hitItem, itemCorners, itemGaps, newItem, snapItem } from "../furniture/place";
import { planSymbol } from "../furniture/symbol";
import type { Floor } from "../model/types";

let n = 0;
const ids = () => `m${n++}`;
const empty = (): Floor =>
  ({ id: "f", name: "G", elevation: 0, height: 2600, nodes: [], walls: [], rooms: [], openings: [], items: [] }) as unknown as Floor;
// kamer 5 × 4 m binnen: x 0..5000, y 0..4000
const room = () => placeRoom(empty(), { x: -190, y: -190 }, { x: 5190, y: 4190 }, { thickness: 380, height: 2600, kind: "exterior", loadBearing: true }, 100, ids).floor;

describe("meubelbibliotheek", () => {
  it("heeft een brede keuze met geldige maten en een tekening", () => {
    expect(LIBRARY.length).toBeGreaterThanOrEqual(55);
    for (const d of LIBRARY) {
      expect(d.w).toBeGreaterThan(0);
      expect(planSymbol(d, d.w, d.d).some((l) => l.outline.length > 0)).toBe(true);
    }
    expect(new Set(LIBRARY.map((d) => d.id)).size).toBe(LIBRARY.length);
  });
});

describe("meubels plaatsen", () => {
  it("kleeft met de rug tegen de dichtste muur en draait mee", () => {
    const f = room();
    const kast = furnitureDef("kleerkast-3")!;
    // tegen de rechtermuur (x = 5000): voorkant naar links
    const r = snapItem(f, kast, { width: kast.w, depth: kast.d }, { x: 4800, y: 2000 }, 0);
    expect(r.rotation).toBe(90);
    expect(r.x).toBeCloseTo(5000 - kast.d / 2 - 1, -1);
    // tegen de bovenmuur (y = 0): niet gedraaid
    const t = snapItem(f, kast, { width: kast.w, depth: kast.d }, { x: 2000, y: 250 }, 0);
    expect(t.rotation).toBe(0);
    expect(t.y).toBeCloseTo(kast.d / 2 + 1, -1);
    // tegen de ondermuur: 180°
    expect(snapItem(f, kast, { width: kast.w, depth: kast.d }, { x: 2000, y: 3800 }, 0).rotation).toBe(180);
    // bij een hoek: tegen de zijmuur geschoven
    const c = snapItem(f, kast, { width: kast.w, depth: kast.d }, { x: 700, y: 200 }, 0);
    expect(c.x).toBeCloseTo(kast.w / 2, -1);
  });

  it("een vrij meubel valt op het raster en houdt zijn draaiing", () => {
    const f = room();
    const tafel = furnitureDef("tafel-6")!;
    expect(snapItem(f, tafel, { width: tafel.w, depth: tafel.d }, { x: 2512, y: 1990 }, 90)).toEqual({ x: 2500, y: 2000, rotation: 90 });
  });

  it("vindt een meubel onder de cursor en meet de vrije ruimte", () => {
    let f = room();
    const bed = furnitureDef("bed-160")!;
    const it = newItem(bed, { x: 2500, y: 1001 }, 0, "bed");
    f = addItem(f, it);
    expect(hitItem(f, { x: 2500, y: 1500 })?.id).toBe("bed");
    expect(hitItem(f, { x: 4900, y: 3900 })).toBeNull();
    expect(itemCorners(it)[0]).toEqual({ x: 1700, y: 1 });
    const gaps = itemGaps(f, it);
    // voor het bed: van 2001 tot 4000
    expect(gaps.map((g) => g.value).sort((a, b) => a - b)).toEqual([1700, 1700, 1999]);
  });

  it("kijkt bewaarde meubels na", () => {
    expect(cleanItem({ id: "x", libraryRef: "bestaat-niet", x: 0, y: 0 })).toBeNull();
    expect(cleanItem({ id: "x", libraryRef: "stoel", x: 10, y: 20, rotation: -90 })).toMatchObject({ rotation: 270, width: 450, depth: 520 });
  });
});

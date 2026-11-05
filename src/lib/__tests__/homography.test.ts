import { describe, expect, it } from "vitest";
import { applyH, convexQuad, homography, invert, planRectify, rectifyPixels } from "../underlay/homography";

describe("schuine foto rechttrekken", () => {
  const corners = [
    { x: 120, y: 80 },
    { x: 860, y: 140 },
    { x: 800, y: 620 },
    { x: 90, y: 560 },
  ];

  it("de vier hoeken komen precies op de rechthoek terecht", () => {
    const H = homography(corners, [
      { x: 0, y: 0 },
      { x: 6000, y: 0 },
      { x: 6000, y: 4500 },
      { x: 0, y: 4500 },
    ])!;
    const back = invert(H)!;
    const want = [
      [0, 0],
      [6000, 0],
      [6000, 4500],
      [0, 4500],
    ];
    corners.forEach((c, i) => {
      const p = applyH(H, c);
      expect(p.x).toBeCloseTo(want[i][0], 6);
      expect(p.y).toBeCloseTo(want[i][1], 6);
      const q = applyH(back, p);
      expect(q.x).toBeCloseTo(c.x, 6);
      expect(q.y).toBeCloseTo(c.y, 6);
    });
  });

  it("een gekruiste of platte vierhoek wordt geweigerd", () => {
    expect(convexQuad(corners)).toBe(true);
    expect(convexQuad([corners[0], corners[2], corners[1], corners[3]])).toBe(false);
    expect(planRectify([corners[0], corners[2], corners[1], corners[3]], 6000, 4500, 1000, 700)).toBeNull();
  });

  it("de rechtgetrokken afbeelding heeft een correcte schaal en de rechthoek ligt recht", () => {
    // een 'foto' van 100×80 met een zwarte rechthoek tussen (20,20) en (80,60)
    const W = 100;
    const Hh = 80;
    const data = new Uint8ClampedArray(W * Hh * 4).fill(255);
    for (let y = 20; y < 60; y++) for (let x = 20; x < 80; x++) data.fill(0, (y * W + x) * 4, (y * W + x) * 4 + 3);
    const plan = planRectify(
      [
        { x: 20, y: 20 },
        { x: 80, y: 20 },
        { x: 80, y: 60 },
        { x: 20, y: 60 },
      ],
      6000,
      4000,
      W,
      Hh,
    )!;
    expect(plan.scale).toBeCloseTo(100, 6); // 6000 mm over 60 px
    const px = rectifyPixels({ data, width: W, height: Hh }, plan);
    const at = (mmX: number, mmY: number) => {
      const u = Math.floor((mmX - plan.minX) / plan.scale);
      const v = Math.floor((mmY - plan.minY) / plan.scale);
      return px[(v * plan.outW + u) * 4];
    };
    expect(at(3000, 2000)).toBe(0); // midden van de rechthoek: zwart
    expect(at(-500, -500)).toBe(255); // erbuiten: wit
  });
});

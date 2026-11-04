import { describe, expect, it, vi } from "vitest";
import { formatArea, formatLength, formatMeters, formatNumber, formatWhen, parseLength } from "../format";
import { area, bounds, centroid, signedArea } from "../geometry/polygon";
import { closestOnSegment, snapPoint, snapValue } from "../geometry/vec";
import { History } from "../history/history";
import { addFloor, removeFloor, renameProject, updateFloor } from "../model/commands";
import { createDoc, migrateDoc } from "../model/doc";
import { Autosaver, type SaveStatus } from "../editor/autosave";
import { EditorStore } from "../editor/store";
import {
  BASE_ZOOM,
  fitBounds,
  gridLevels,
  MAX_ZOOM,
  niceScaleBar,
  toScreen,
  toWorld,
  zoomAt,
  zoomPercent,
} from "../editor/viewport";

describe("format (nl-BE)", () => {
  it("gebruikt decimale komma en duizendtal met punt", () => {
    expect(formatNumber(1234567)).toBe("1.234.567");
    expect(formatLength(3250)).toBe("3,25 m");
    expect(formatLength(730)).toBe("73 cm");
    expect(formatMeters(730)).toBe("0,73 m");
    expect(formatLength(12345)).toBe("12,35 m");
    expect(formatArea(6000 * 4500)).toBe("27,0 m²");
    expect(formatArea(1_234_500_000_000)).toBe("1.234.500,0 m²");
  });

  it("leest lengtes zoals een leek ze typt", () => {
    expect(parseLength("3,25")).toBe(3250);
    expect(parseLength("3,25 m")).toBe(3250);
    expect(parseLength("3.25")).toBe(3250);
    expect(parseLength("325")).toBe(3250);
    expect(parseLength("325 cm")).toBe(3250);
    expect(parseLength("83cm")).toBe(830);
    expect(parseLength("3250 mm")).toBe(3250);
    expect(parseLength("1.250,5 cm")).toBe(12505);
    expect(parseLength("abc")).toBeNull();
    expect(parseLength("")).toBeNull();
  });

  it("toont datums vriendelijk", () => {
    const now = new Date(2026, 10, 4, 15, 0);
    expect(formatWhen(new Date(2026, 10, 4, 12, 40).toISOString(), now)).toBe("vandaag om 12:40");
    expect(formatWhen(new Date(2026, 10, 3, 9, 5).toISOString(), now)).toBe("gisteren om 09:05");
    expect(formatWhen(new Date(2026, 9, 1).toISOString(), now)).toMatch(/1 okt\.? 2026/);
  });
});

describe("geometrie", () => {
  const room = [
    { x: 0, y: 0 },
    { x: 6000, y: 0 },
    { x: 6000, y: 4500 },
    { x: 0, y: 4500 },
  ];
  it("berekent oppervlakte en zwaartepunt", () => {
    expect(area(room)).toBe(27_000_000);
    expect(signedArea(room)).toBeGreaterThan(0);
    expect(signedArea([...room].reverse())).toBeLessThan(0);
    expect(centroid(room)).toEqual({ x: 3000, y: 2250 });
  });
  it("L-vormige ruimte", () => {
    const L = [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 2000 },
      { x: 2000, y: 2000 },
      { x: 2000, y: 4000 },
      { x: 0, y: 4000 },
    ];
    expect(area(L)).toBe(12_000_000);
  });
  it("valt op het raster van 5 cm", () => {
    expect(snapValue(1234, 50)).toBe(1250);
    expect(snapValue(-24, 50)).toBe(0);
    expect(Object.is(snapValue(-24, 50), -0)).toBe(false);
    expect(snapPoint({ x: 26, y: 74 }, 50)).toEqual({ x: 50, y: 50 });
    expect(snapValue(1234, 0)).toBe(1234);
  });
  it("vindt het dichtste punt op een muur", () => {
    const r = closestOnSegment({ x: 500, y: 300 }, { x: 0, y: 0 }, { x: 1000, y: 0 });
    expect(r.point).toEqual({ x: 500, y: 0 });
    expect(r.dist).toBe(300);
    expect(closestOnSegment({ x: -50, y: 0 }, { x: 0, y: 0 }, { x: 1000, y: 0 }).t).toBe(0);
  });
  it("omhullende rechthoek", () => {
    expect(bounds(room)).toEqual({ minX: 0, minY: 0, maxX: 6000, maxY: 4500 });
    expect(bounds([])).toBeNull();
  });
});

describe("zoomen en verschuiven", () => {
  const v = { zoom: BASE_ZOOM, panX: 100, panY: 50 };
  it("scherm ↔ wereld zijn elkaars omgekeerde", () => {
    const p = { x: 1234, y: -567 };
    const back = toWorld(v, toScreen(v, p));
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
  });
  it("zoomen houdt het punt onder de muis op zijn plaats", () => {
    const mouse = { x: 400, y: 300 };
    const before = toWorld(v, mouse);
    const z = zoomAt(v, mouse, 2);
    const after = toWorld(z, mouse);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(zoomPercent(z)).toBe(200);
  });
  it("zoom blijft binnen de grenzen", () => {
    expect(zoomAt(v, { x: 0, y: 0 }, 1e6).zoom).toBe(MAX_ZOOM);
  });
  it("past een gebied in beeld", () => {
    const f = fitBounds({ minX: 0, minY: 0, maxX: 6000, maxY: 4500 }, 1000, 800, 50);
    const tl = toScreen(f, { x: 0, y: 0 });
    const br = toScreen(f, { x: 6000, y: 4500 });
    expect((tl.x + br.x) / 2).toBeCloseTo(500);
    expect((tl.y + br.y) / 2).toBeCloseTo(400);
    expect(br.x - tl.x).toBeLessThanOrEqual(900.0001);
  });
  it("kiest een mooie schaalstok en raster", () => {
    expect(niceScaleBar(BASE_ZOOM).mm).toBe(1000);
    expect(gridLevels(BASE_ZOOM)).toEqual({ minor: 100, major: 1000 });
    expect(gridLevels(BASE_ZOOM / 10).minor).toBe(1000);
  });
});

describe("ongedaan maken", () => {
  it("doet, maakt ongedaan en doet opnieuw", () => {
    const h = new History<ReturnType<typeof createDoc>>();
    let d = createDoc("A");
    d = h.execute(d, renameProject("A", "B"));
    expect(d.name).toBe("B");
    d = h.undo(d)!.doc;
    expect(d.name).toBe("A");
    d = h.redo(d)!.doc;
    expect(d.name).toBe("B");
    expect(h.canRedo).toBe(false);
  });

  it("voegt snel typen samen tot één stap", () => {
    let t = 0;
    const h = new History<ReturnType<typeof createDoc>>({ now: () => t });
    let d = createDoc("W");
    d = h.execute(d, renameProject("W", "Wo"));
    t = 300;
    d = h.execute(d, renameProject("Wo", "Won"));
    t = 600;
    d = h.execute(d, renameProject("Won", "Woning"));
    expect(d.name).toBe("Woning");
    d = h.undo(d)!.doc;
    expect(d.name).toBe("W");
    expect(h.canUndo).toBe(false);
  });

  it("maakt geen lege stap als er niets verandert", () => {
    const h = new History<ReturnType<typeof createDoc>>();
    const d = createDoc("A");
    expect(h.execute(d, renameProject("A", "A"))).toBe(d);
    expect(h.canUndo).toBe(false);
  });

  it("verdieping toevoegen, aanpassen en verwijderen", () => {
    const h = new History<ReturnType<typeof createDoc>>();
    let d = createDoc("Huis");
    const { cmd, floorId } = addFloor(d);
    d = h.execute(d, cmd);
    expect(d.floors).toHaveLength(2);
    expect(d.floors[1].elevation).toBe(2900);
    expect(d.floors[1].name).toBe("1e verdieping");
    d = h.execute(d, updateFloor(floorId, { height: 2600 }, { height: 2500 }));
    expect(d.floors[1].height).toBe(2500);
    d = h.execute(d, removeFloor(d, floorId)!);
    expect(d.floors).toHaveLength(1);
    d = h.undo(d)!.doc;
    expect(d.floors[1].height).toBe(2500);
    expect(removeFloor({ ...d, floors: [d.floors[0]] }, d.floors[0].id)).toBeNull();
  });
});

describe("document", () => {
  it("vult ontbrekende velden aan en weigert toekomstige versies", () => {
    const d = migrateDoc({ name: "X", floors: [{ id: "f1", name: "Gelijkvloers" }] });
    expect(d.floors[0].walls).toEqual([]);
    expect(d.settings.gridSize).toBe(50);
    expect(migrateDoc(null, "Leeg").name).toBe("Leeg");
    expect(() => migrateDoc({ schemaVersion: 99 })).toThrow();
  });
});

describe("editor", () => {
  it("meldt elke wijziging voor automatisch bewaren", () => {
    const s = new EditorStore(createDoc("A"));
    const seen: string[] = [];
    s.onDocChange = (d) => seen.push(d.name);
    s.execute(renameProject("A", "B"));
    expect(s.undo()).toBe("Projectnaam gewijzigd");
    expect(seen).toEqual(["B", "A"]);
    expect(s.getState().canRedo).toBe(true);
  });
  it("kiest een andere verdieping als de actieve verdwijnt", () => {
    const s = new EditorStore(createDoc("A"));
    const { cmd, floorId } = addFloor(s.getState().doc);
    s.execute(cmd);
    s.setActiveFloor(floorId);
    s.undo();
    expect(s.getState().activeFloorId).toBe(s.getState().doc.floors[0].id);
  });
});

describe("automatisch bewaren", () => {
  it("wacht tot de gebruiker stopt en bewaart de laatste versie", async () => {
    vi.useFakeTimers();
    const saved: number[] = [];
    const statuses: SaveStatus[] = [];
    const a = new Autosaver<number>({
      save: async (d) => {
        saved.push(d);
      },
      onStatus: (s) => statuses.push(s),
      delayMs: 500,
    });
    a.change(1);
    a.change(2);
    a.change(3);
    await vi.advanceTimersByTimeAsync(600);
    expect(saved).toEqual([3]);
    expect(statuses).toEqual(["dirty", "saving", "saved"]);
    vi.useRealTimers();
  });

  it("probeert opnieuw na een fout zonder iets te verliezen", async () => {
    vi.useFakeTimers();
    let fail = true;
    const saved: number[] = [];
    const statuses: SaveStatus[] = [];
    const a = new Autosaver<number>({
      save: async (d) => {
        if (fail) throw new Error("offline");
        saved.push(d);
      },
      onStatus: (s) => statuses.push(s),
      delayMs: 100,
      retryMs: 1000,
    });
    a.change(7);
    await vi.advanceTimersByTimeAsync(150);
    expect(statuses.at(-1)).toBe("error");
    fail = false;
    await vi.advanceTimersByTimeAsync(1100);
    expect(saved).toEqual([7]);
    expect(a.current).toBe("saved");
    vi.useRealTimers();
  });

  it("bewaart wijzigingen die binnenkomen tijdens het bewaren", async () => {
    vi.useFakeTimers();
    const saved: number[] = [];
    let release!: () => void;
    const a = new Autosaver<number>({
      save: (d) =>
        new Promise<void>((r) => {
          saved.push(d);
          release = r;
        }),
      onStatus: () => {},
      delayMs: 100,
    });
    a.change(1);
    await vi.advanceTimersByTimeAsync(150);
    a.change(2);
    release();
    await vi.advanceTimersByTimeAsync(10);
    release();
    await vi.advanceTimersByTimeAsync(10);
    expect(saved).toEqual([1, 2]);
    expect(a.hasUnsaved).toBe(false);
    vi.useRealTimers();
  });
});

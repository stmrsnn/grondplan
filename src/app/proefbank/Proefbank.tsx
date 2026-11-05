"use client";

import { useEffect, useMemo, useState } from "react";
import type { EditorBackend } from "@/components/editor/backend";
import { Editor } from "@/components/editor/Editor";
import { SaveConflict } from "@/lib/editor/autosave";
import { addOpening, choiceProps } from "@/lib/geometry/openings";
import { addPolyline, addRectangle, rebuildFloor } from "@/lib/geometry/plan";
import { createDoc } from "@/lib/model/doc";
import type { ProjectDoc } from "@/lib/model/types";

type W = Window & { __bewaard?: ProjectDoc; __conflict?: boolean; __startDoc?: ProjectDoc };

/** Tekenvlak zonder aanmelden, met bewaren en versies in het geheugen. */
export function Proefbank() {
  const [doc, setDoc] = useState<ProjectDoc | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const kamer = q.get("kamer");
    let d = createDoc(
      "Proefproject",
      kamer ? { kind: "room", width: 6000, depth: 4500, roomFunction: "living" } : { kind: "house" },
    );
    if (q.get("groot")) {
      // snelheidstest: raster van 15 × 10 kamers (± 300 muren)
      let f = d.floors[0];
      const p = { thickness: 150, height: 2600, kind: "interior" as const, loadBearing: false };
      for (let i = 0; i <= 15; i++) f = addPolyline(f, [{ x: i * 3000, y: 0 }, { x: i * 3000, y: 30000 }], p);
      for (let j = 0; j <= 10; j++) f = addPolyline(f, [{ x: 0, y: j * 3000 }, { x: 45000, y: j * 3000 }], p);
      d = { ...d, floors: [f] };
    }
    if (q.get("demo")) {
      // een klein huis met ramen en deuren, om de 3D te bekijken
      const ext = { thickness: 380, height: 2600, kind: "exterior" as const, loadBearing: true, type: "spouw-38" };
      const ip = { thickness: 140, height: 2600, kind: "interior" as const, loadBearing: true, type: "binnen-14" };
      let f = addRectangle(d.floors[0], { x: -190, y: -190 }, { x: 9690, y: 5690 }, ext);
      f = addPolyline(f, [{ x: 6000, y: -190 }, { x: 6000, y: 5690 }], ip);
      f = addPolyline(f, [{ x: 6000, y: 3000 }, { x: 9690, y: 3000 }], ip);
      f = rebuildFloor(f);
      const wallAt = (x: number, y: number) =>
        f.walls.find((w) => {
          const a = f.nodes.find((n) => n.id === w.start)!;
          const b = f.nodes.find((n) => n.id === w.end)!;
          const t = ((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
          const px = a.x + t * (b.x - a.x);
          const py = a.y + t * (b.y - a.y);
          return t > 0 && t < 1 && Math.hypot(px - x, py - y) < 5;
        })!;
      const put = (x: number, y: number, c: string, side: "left" | "right" = "left", hinge: "start" | "end" = "start") => {
        const w = wallAt(x, y);
        const a = f.nodes.find((n) => n.id === w.start)!;
        const offset = Math.hypot(x - a.x, y - a.y);
        f = addOpening(f, { wall: w.id, offset, ...choiceProps(c, w.kind), swing: { side, hinge } }, crypto.randomUUID()) ?? f;
      };
      put(2600, 5690, "patio");
      put(4900, 5690, "draaikiep");
      put(2000, -190, "vast-draaikiep");
      put(7800, -190, "draaikiep");
      put(7900, 5690, "deur-zijlicht");
      put(9690, 1500, "kiep");
      put(6000, 1500, "single");
      put(6000, 4400, "glasdeur-vast");
      const fn = ["living", "keuken", "slaapkamer"];
      const sorted = [...f.rooms].map((r) => r.id);
      f = { ...f, rooms: f.rooms.map((r) => ({ ...r, function: fn[sorted.indexOf(r.id)] ?? "andere", name: ["Living", "Keuken", "Bureau"][sorted.indexOf(r.id)] ?? r.name })) };
      d = { ...d, floors: [f] };
    } else if (q.get("sprong") === "2") {
      // zoals een echt plan: 10 cm onderaan uitgelijnd op 15 cm, met een muur van 15 cm erop
      const ip = (thickness: number, type?: string) => ({ thickness, height: 2600, kind: "interior" as const, loadBearing: false, type });
      let f = addRectangle(d.floors[0], { x: -190, y: -2190 }, { x: 6190, y: 2190 }, { thickness: 380, height: 2600, kind: "exterior", loadBearing: true, type: "spouw-38" });
      f = addPolyline(f, [{ x: -190, y: 0 }, { x: 3000, y: 0 }], ip(100, "binnen-10"));
      f = addPolyline(f, [{ x: 3000, y: 0 }, { x: 6190, y: 0 }], ip(150));
      f = addPolyline(f, [{ x: 3000, y: -2190 }, { x: 3000, y: 0 }], ip(150));
      f = { ...f, walls: f.walls.map((w) => (w.thickness === 100 ? { ...w, offset: f.nodes.find((n) => n.id === w.start)!.x < 0 ? 25 : -25 } : w)) };
      d = { ...d, floors: [f] };
    } else if (q.get("sprong")) {
      // aansluiting: binnenmuur van 15 cm die overgaat in 10 cm, met een muur van 10 cm erop
      const ip = (thickness: number, type: string) => ({ thickness, height: 2600, kind: "interior" as const, loadBearing: false, type });
      let f = addRectangle(d.floors[0], { x: -190, y: -2190 }, { x: 6190, y: 2190 }, { thickness: 380, height: 2600, kind: "exterior", loadBearing: true, type: "spouw-38" });
      f = addPolyline(f, [{ x: -190, y: 0 }, { x: 3000, y: 0 }], ip(140, "binnen-14"));
      f = addPolyline(f, [{ x: 3000, y: 0 }, { x: 6190, y: 0 }], ip(100, "binnen-10"));
      f = addPolyline(f, [{ x: 3000, y: -2190 }, { x: 3000, y: 0 }], ip(100, "binnen-10"));
      d = { ...d, floors: [f] };
    }
    // een volledig plan meegeven (om een echt plan na te spelen)
    const start = (window as W).__startDoc;
    if (start) d = start;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- nieuwe id's enkel in de browser
    setDoc(d);
  }, []);

  const backend = useMemo<EditorBackend>(() => {
    const versions: { id: string; label: string; created_at: string; doc: ProjectDoc }[] = [];
    const w = () => window as W;
    return {
      async save(d) {
        await new Promise((r) => setTimeout(r, 200));
        if (w().__conflict) throw new SaveConflict();
        w().__bewaard = d;
      },
      async loadLatest() {
        w().__conflict = false;
        return w().__bewaard ?? createDoc("Proefproject");
      },
      async takeOver() {
        w().__conflict = false;
      },
      async listVersions() {
        return versions.map(({ id, label, created_at }) => ({ id, label, created_at }));
      },
      async loadVersion(id) {
        return versions.find((v) => v.id === id)!.doc;
      },
      async addVersion(d, label) {
        versions.unshift({ id: crypto.randomUUID(), label, created_at: new Date().toISOString(), doc: d });
      },
      // in het geheugen: een tijdelijke link naar de afbeelding
      async uploadUnderlay(blob) {
        return URL.createObjectURL(blob);
      },
      async underlayUrl(src) {
        return src;
      },
    };
  }, []);

  if (!doc) return null;
  return <Editor initialDoc={doc} backend={backend} email="proef@voorbeeld.be" />;
}

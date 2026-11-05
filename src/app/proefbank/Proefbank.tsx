"use client";

import { useEffect, useMemo, useState } from "react";
import type { EditorBackend } from "@/components/editor/backend";
import { Editor } from "@/components/editor/Editor";
import { SaveConflict } from "@/lib/editor/autosave";
import { addPolyline } from "@/lib/geometry/plan";
import { createDoc } from "@/lib/model/doc";
import type { ProjectDoc } from "@/lib/model/types";

type W = Window & { __bewaard?: ProjectDoc; __conflict?: boolean };

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

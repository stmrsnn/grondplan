"use client";

import { useEffect, useMemo, useState } from "react";
import type { EditorBackend } from "@/components/editor/backend";
import { Editor } from "@/components/editor/Editor";
import { SaveConflict } from "@/lib/editor/autosave";
import { createDoc } from "@/lib/model/doc";
import type { ProjectDoc } from "@/lib/model/types";

type W = Window & { __bewaard?: ProjectDoc; __conflict?: boolean };

/** Tekenvlak zonder aanmelden, met bewaren en versies in het geheugen. */
export function Proefbank() {
  const [doc, setDoc] = useState<ProjectDoc | null>(null);
  useEffect(() => {
    const kamer = new URLSearchParams(window.location.search).get("kamer");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- nieuwe id's enkel in de browser
    setDoc(
      createDoc(
        "Proefproject",
        kamer ? { kind: "room", width: 6000, depth: 4500, roomFunction: "living" } : { kind: "house" },
      ),
    );
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
    };
  }, []);

  if (!doc) return null;
  return <Editor initialDoc={doc} backend={backend} email="proef@voorbeeld.be" />;
}

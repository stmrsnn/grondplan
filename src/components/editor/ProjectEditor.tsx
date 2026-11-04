"use client";

import { useMemo, useRef } from "react";
import { migrateDoc } from "@/lib/model/doc";
import type { ProjectDoc } from "@/lib/model/types";
import {
  addVersion,
  listVersions,
  loadProject,
  loadVersion,
  saveProject,
} from "@/lib/projects";
import type { EditorBackend } from "./backend";
import { Editor } from "./Editor";

const timeFmt = new Intl.DateTimeFormat("nl-BE", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function ProjectEditor({
  id,
  initialDoc,
  revision,
  email,
}: {
  id: string;
  initialDoc: ProjectDoc;
  revision: number;
  email?: string | null;
}) {
  const rev = useRef<number | null>(revision);
  const versionTaken = useRef(false);

  const backend = useMemo<EditorBackend>(
    () => ({
      async save(doc) {
        // bij de eerste wijziging van deze sessie: bewaar eerst hoe het was
        if (!versionTaken.current) {
          versionTaken.current = true;
          try {
            await addVersion(id, initialDoc, `Vóór je wijzigingen (${timeFmt.format(new Date())})`);
          } catch {
            // een gemiste versie mag het bewaren niet tegenhouden
          }
        }
        rev.current = await saveProject(id, doc, rev.current);
      },
      async loadLatest() {
        const row = await loadProject(id);
        rev.current = row.revision;
        const doc = migrateDoc(row.data, row.name);
        doc.name = row.name;
        return doc;
      },
      async takeOver() {
        // bewaar de andere versie als vangnet en neem haar revisie over
        const row = await loadProject(id);
        try {
          await addVersion(
            id,
            migrateDoc(row.data, row.name),
            `Versie uit ander venster (${timeFmt.format(new Date())})`,
          );
        } catch {}
        rev.current = row.revision;
      },
      listVersions: () => listVersions(id),
      async loadVersion(versionId) {
        return migrateDoc(await loadVersion(versionId));
      },
      addVersion: (doc, label) => addVersion(id, doc, label),
    }),
    [id, initialDoc],
  );

  return <Editor initialDoc={initialDoc} backend={backend} email={email} />;
}

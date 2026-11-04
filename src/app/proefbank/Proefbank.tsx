"use client";

import { useCallback, useEffect, useState } from "react";
import { Editor } from "@/components/editor/Editor";
import { createDoc } from "@/lib/model/doc";
import type { ProjectDoc } from "@/lib/model/types";

export function Proefbank() {
  const [doc, setDoc] = useState<ProjectDoc | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- nieuwe id's enkel in de browser
    setDoc(createDoc("Proefproject"));
  }, []);
  const save = useCallback(async (d: ProjectDoc) => {
    await new Promise((r) => setTimeout(r, 300));
    (window as unknown as { __bewaard?: ProjectDoc }).__bewaard = d;
  }, []);
  if (!doc) return null;
  return <Editor initialDoc={doc} save={save} email="proef@voorbeeld.be" />;
}

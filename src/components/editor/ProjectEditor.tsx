"use client";

import { useCallback } from "react";
import type { ProjectDoc } from "@/lib/model/types";
import { saveProject } from "@/lib/projects";
import { Editor } from "./Editor";

export function ProjectEditor({
  id,
  initialDoc,
  email,
}: {
  id: string;
  initialDoc: ProjectDoc;
  email?: string | null;
}) {
  const save = useCallback((doc: ProjectDoc) => saveProject(id, doc), [id]);
  return <Editor initialDoc={initialDoc} save={save} email={email} />;
}

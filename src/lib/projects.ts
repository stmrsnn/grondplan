"use client";

import { createDoc } from "./model/doc";
import type { ProjectDoc } from "./model/types";
import { SCHEMA_VERSION } from "./model/types";
import { supabaseBrowser } from "./supabase/client";

export interface ProjectRow {
  id: string;
  name: string;
  updated_at: string;
}

/** De naam in de tabel is de waarheid; het document draagt een kopie. */
export async function createProject(name: string): Promise<string> {
  const doc = createDoc(name);
  const { data, error } = await supabaseBrowser()
    .from("projects")
    .insert({ name, data: doc, schema_version: SCHEMA_VERSION })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function renameProject(id: string, name: string): Promise<void> {
  const { error } = await supabaseBrowser().from("projects").update({ name }).eq("id", id);
  if (error) throw error;
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabaseBrowser().from("projects").delete().eq("id", id);
  if (error) throw error;
}

export async function saveProject(id: string, doc: ProjectDoc): Promise<void> {
  const { error, count } = await supabaseBrowser()
    .from("projects")
    .update({ name: doc.name, data: doc, schema_version: doc.schemaVersion }, { count: "exact" })
    .eq("id", id);
  if (error) throw error;
  if (count === 0) throw new Error("Project niet gevonden");
}

export function cleanName(input: string): string {
  return input.replace(/\s+/g, " ").trim().slice(0, 120);
}

"use client";

import { SaveConflict } from "./editor/autosave";
import { createDoc } from "./model/doc";
import { makePreview } from "./model/preview";
import type { ProjectDoc, StartChoice } from "./model/types";
import { SCHEMA_VERSION } from "./model/types";
import { supabaseBrowser } from "./supabase/client";

export interface ProjectRow {
  id: string;
  name: string;
  updated_at: string;
  preview: unknown;
}

export interface VersionRow {
  id: string;
  label: string;
  name: string;
  created_at: string;
}

/** De naam in de tabel is de waarheid; het document draagt een kopie. */
export async function createProject(name: string, start: StartChoice): Promise<string> {
  const doc = createDoc(name, start);
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

/**
 * Bewaart enkel als niemand anders ondertussen bewaard heeft (zelfde revisie).
 * Geeft de nieuwe revisie terug; gooit SaveConflict als het project elders
 * gewijzigd werd.
 */
export async function saveProject(
  id: string,
  doc: ProjectDoc,
  revision: number | null,
): Promise<number> {
  let q = supabaseBrowser()
    .from("projects")
    .update({
      name: doc.name,
      data: doc,
      schema_version: doc.schemaVersion,
      preview: makePreview(doc),
    })
    .eq("id", id);
  if (revision !== null) q = q.eq("revision", revision);
  const { data, error } = await q.select("revision");
  if (error) throw error;
  if (!data || data.length === 0) {
    // bestaat het project nog? dan werd het elders gewijzigd
    const { data: still } = await supabaseBrowser()
      .from("projects")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (still) throw new SaveConflict();
    throw new Error("Project niet gevonden");
  }
  return data[0].revision as number;
}

export async function loadProject(id: string) {
  const { data, error } = await supabaseBrowser()
    .from("projects")
    .select("name, data, revision")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as { name: string; data: unknown; revision: number };
}

export async function addVersion(projectId: string, doc: ProjectDoc, label: string) {
  const { error } = await supabaseBrowser()
    .from("project_versions")
    .insert({ project_id: projectId, label, name: doc.name, data: doc });
  if (error) throw error;
}

export async function listVersions(projectId: string): Promise<VersionRow[]> {
  const { data, error } = await supabaseBrowser()
    .from("project_versions")
    .select("id, label, name, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data as VersionRow[];
}

export async function loadVersion(id: string): Promise<unknown> {
  const { data, error } = await supabaseBrowser()
    .from("project_versions")
    .select("data")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data.data;
}

export function cleanName(input: string): string {
  return input.replace(/\s+/g, " ").trim().slice(0, 120);
}

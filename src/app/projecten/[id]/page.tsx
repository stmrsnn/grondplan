import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ProjectEditor } from "@/components/editor/ProjectEditor";
import { ToastProvider } from "@/components/ui/Toast";
import { migrateDoc } from "@/lib/model/doc";
import { supabaseServer } from "@/lib/supabase/server";

// Persoonlijke pagina (aanmelding, eigen projecten): altijd vers op de server opbouwen.
export const instant = false;


const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function load(id: string) {
  if (!UUID.test(id)) return null;
  const supabase = await supabaseServer();
  const { data } = await supabase.from("projects").select("id, name, data, revision").eq("id", id).maybeSingle();
  return data;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const row = await load((await params).id);
  return { title: row?.name ?? "Project" };
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/?volgende=/projecten/${id}`);

  const row = await load(id);
  if (!row) notFound();

  const doc = migrateDoc(row.data, row.name);
  doc.name = row.name; // de naam in de lijst is de waarheid

  return (
    <ToastProvider>
      <ProjectEditor id={row.id} initialDoc={doc} revision={row.revision} email={user.email} />
    </ToastProvider>
  );
}

import { supabaseBrowser } from "./supabase/client";

/**
 * Onderleggers in Supabase Storage (privé, één map per gebruiker). We bewaren
 * enkel het pad in het plan en vragen telkens een tijdelijke link op.
 */
const BUCKET = "onderleggers";

export async function uploadUnderlay(projectId: string, blob: Blob): Promise<string> {
  const sb = supabaseBrowser();
  const { data: user } = await sb.auth.getUser();
  if (!user.user) throw new Error("Je bent niet meer aangemeld.");
  const ext = blob.type === "image/jpeg" ? "jpg" : blob.type === "image/webp" ? "webp" : "png";
  const path = `${user.user.id}/${projectId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
  if (error) throw new Error("Het bestand kon niet bewaard worden. Probeer opnieuw.");
  return path;
}

export async function underlayUrl(path: string): Promise<string> {
  const { data, error } = await supabaseBrowser().storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  if (error || !data) throw new Error("De onderlegger kon niet geladen worden.");
  return data.signedUrl;
}

export async function deleteUnderlay(path: string): Promise<void> {
  await supabaseBrowser().storage.from(BUCKET).remove([path]);
}

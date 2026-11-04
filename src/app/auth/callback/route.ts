import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/** Google stuurt de gebruiker hierheen terug na het aanmelden. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("volgende");
  // enkel interne paden toelaten
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/projecten";

  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${safeNext}`);
  }
  return NextResponse.redirect(`${origin}/?fout=aanmelden`);
}

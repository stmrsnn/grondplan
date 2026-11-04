import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ProjectList } from "@/components/projects/ProjectList";
import { AppHeader } from "@/components/ui/AppHeader";
import { ToastProvider } from "@/components/ui/Toast";
import { supabaseServer } from "@/lib/supabase/server";

// Persoonlijke pagina (aanmelding, eigen projecten): altijd vers op de server opbouwen.
export const instant = false;


export const metadata: Metadata = { title: "Jouw projecten" };

export default async function ProjectsPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data, error } = await supabase
    .from("projects")
    .select("id, name, updated_at")
    .order("updated_at", { ascending: false });

  return (
    <ToastProvider>
      <div className="flex min-h-full flex-col">
        <AppHeader
          email={user.email}
          help={{
            title: "Jouw projecten",
            body: (
              <>
                <p>
                  Een project is één woning of één plan. Maak een nieuw project aan en geef het een
                  naam, bijvoorbeeld &ldquo;Mijn woning&rdquo; of &ldquo;Verbouwing keuken&rdquo;.
                </p>
                <p>
                  Klik op een project om verder te tekenen. Via de drie puntjes kan je het
                  hernoemen of verwijderen. Alles wat je tekent, wordt vanzelf bewaard.
                </p>
              </>
            ),
          }}
        />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
          {error ? (
            <p className="rounded-[var(--radius-control)] bg-danger-soft px-3 py-2 text-sm text-danger">
              Je projecten kunnen nu niet geladen worden. Herlaad de pagina.
            </p>
          ) : (
            <ProjectList initial={data ?? []} />
          )}
        </main>
      </div>
    </ToastProvider>
  );
}

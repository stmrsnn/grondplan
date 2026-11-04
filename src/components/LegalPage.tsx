import Link from "next/link";
import type { ReactNode } from "react";
import { AppHeader } from "@/components/ui/AppHeader";

/** Eenvoudige leespagina voor privacy en voorwaarden, in dezelfde stijl als de rest. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <AppHeader
        help={{
          title,
          body: <p>Deze pagina legt in gewone taal uit hoe Plattegrond werkt en met je gegevens omgaat.</p>,
        }}
      />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-[13px] text-ink-3">Laatst bijgewerkt op {updated}</p>
        <div className="mt-8 flex flex-col gap-6 text-[15px] leading-relaxed text-ink-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-ink [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-1">
          {children}
        </div>
      </main>
      <Footer />
    </div>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line px-6 py-5 text-[13px] text-ink-3">
      <nav className="mx-auto flex max-w-5xl flex-wrap gap-x-6 gap-y-2">
        <Link href="/" className="hover:text-ink">Plattegrond</Link>
        <Link href="/privacy" className="hover:text-ink">Privacy</Link>
        <Link href="/voorwaarden" className="hover:text-ink">Gebruiksvoorwaarden</Link>
      </nav>
    </footer>
  );
}

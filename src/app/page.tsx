import { Armchair, Ruler, Undo2 } from "lucide-react";
import { SignInButton } from "@/components/SignInButton";
import { Footer } from "@/components/LegalPage";
import { AppHeader } from "@/components/ui/AppHeader";

// Persoonlijke pagina (aanmelding, eigen projecten): altijd vers op de server opbouwen.
export const instant = false;


export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ fout?: string; volgende?: string }>;
}) {
  const { fout, volgende } = await searchParams;

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader
        help={{
          title: "Wat is Plattegrond?",
          body: (
            <>
              <p>
                Met Plattegrond teken je het grondplan van je woning en richt je de kamers in. Je
                hebt geen voorkennis nodig: maten typ je gewoon in, en de app helpt je met tips.
              </p>
              <p>
                Je meldt je aan met je Google-account. Zo blijven je plannen bewaard en kan je ze
                op elk toestel verder afwerken.
              </p>
            </>
          ),
        }}
      />
      <main className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-10 px-6 py-12 md:grid-cols-[1.1fr_1fr]">
        <div className="flex flex-col gap-6">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-ink sm:text-4xl">
            Teken je woning en richt ze in, zonder voorkennis.
          </h1>
          <p className="max-w-md text-base leading-relaxed text-ink-2">
            Typ de maten van je kamers, sleep meubels op hun plaats en zie meteen of alles past.
          </p>
          {fout && (
            <p className="rounded-[var(--radius-control)] bg-danger-soft px-3 py-2 text-sm text-danger">
              Aanmelden is niet gelukt. Probeer het opnieuw.
            </p>
          )}
          <SignInButton next={volgende} />
          <ul className="mt-2 flex flex-col gap-3 text-sm text-ink-2">
            <li className="flex items-center gap-3">
              <Ruler size={18} className="text-accent" /> Maten altijd zichtbaar en exact in te typen
            </li>
            <li className="flex items-center gap-3">
              <Armchair size={18} className="text-accent" /> Meubels met echte afmetingen
            </li>
            <li className="flex items-center gap-3">
              <Undo2 size={18} className="text-accent" /> Alles wordt vanzelf bewaard en is ongedaan
              te maken
            </li>
          </ul>
        </div>
        <PlanIllustration />
      </main>
      <Footer />
    </div>
  );
}

function PlanIllustration() {
  return (
    <div
      className="rounded-[var(--radius-card)] border border-line bg-canvas p-6"
      style={{
        backgroundImage:
          "linear-gradient(var(--grid-minor) 1px, transparent 1px), linear-gradient(90deg, var(--grid-minor) 1px, transparent 1px)",
        backgroundSize: "20px 20px",
      }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 320 240" className="w-full">
        <rect x="40" y="30" width="240" height="180" fill="var(--bg)" stroke="var(--ink)" strokeWidth="7" />
        <line x1="150" y1="30" x2="150" y2="210" stroke="var(--ink)" strokeWidth="4" />
        <rect x="146" y="120" width="8" height="34" fill="var(--bg)" />
        <path d="M150 120 A34 34 0 0 1 184 154" fill="none" stroke="var(--text-3)" strokeDasharray="3 3" />
        <rect x="190" y="26" width="60" height="8" fill="var(--bg)" />
        <line x1="190" y1="28" x2="250" y2="28" stroke="var(--accent)" strokeWidth="1.5" />
        <line x1="190" y1="32" x2="250" y2="32" stroke="var(--accent)" strokeWidth="1.5" />
        <rect x="60" y="50" width="70" height="80" rx="4" fill="var(--accent-soft)" stroke="var(--accent)" />
        <rect x="175" y="160" width="90" height="34" rx="4" fill="var(--accent-soft)" stroke="var(--accent)" />
        <line x1="40" y1="14" x2="280" y2="14" stroke="var(--text-3)" strokeWidth="0.8" />
        <rect x="138" y="7" width="44" height="14" rx="3" fill="var(--canvas)" />
        <text x="160" y="18" textAnchor="middle" fontSize="11" fill="var(--text)">6,00 m</text>
        <text x="72" y="160" fontSize="12" fontWeight="600" fill="var(--text)">Slaapkamer</text>
        <text x="72" y="175" fontSize="11" fill="var(--text-2)">12,4 m²</text>
        <text x="190" y="90" fontSize="12" fontWeight="600" fill="var(--text)">Living</text>
        <text x="190" y="105" fontSize="11" fill="var(--text-2)">14,6 m²</text>
      </svg>
    </div>
  );
}

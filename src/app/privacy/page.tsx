import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacyverklaring" updated="4 november 2026">
      <section>
        <h2>Welke gegevens we bewaren</h2>
        <ul>
          <li>
            <strong className="text-ink">Je e-mailadres en naam</strong>, die Google ons doorgeeft
            wanneer je je aanmeldt. We vragen niets anders aan Google: geen contacten, geen
            bestanden, geen agenda.
          </li>
          <li>
            <strong className="text-ink">Je plannen</strong>: de projecten die je tekent, met hun
            naam, verdiepingen, muren, meubels en eerdere versies.
          </li>
        </ul>
      </section>
      <section>
        <h2>Waarvoor we ze gebruiken</h2>
        <p>
          Enkel om je te laten aanmelden en je plannen te bewaren, zodat je ze op elk toestel
          verder kan afwerken. We verkopen niets, tonen geen reclame en delen je plannen met
          niemand, tenzij jij zelf een link deelt.
        </p>
      </section>
      <section>
        <h2>Waar ze staan</h2>
        <ul>
          <li>
            De database draait bij Supabase in Frankfurt (Duitsland), binnen de Europese Unie.
          </li>
          <li>De website zelf wordt geleverd door Vercel, met servers in Frankfurt.</li>
          <li>Aanmelden gebeurt via Google.</li>
        </ul>
        <p className="mt-2">
          Alleen jij kan je eigen projecten zien en wijzigen; dat wordt in de database zelf
          afgedwongen.
        </p>
      </section>
      <section>
        <h2>Hoe lang</h2>
        <p>
          Zolang je de app gebruikt. Verwijder je een project, dan verdwijnen het plan en alle
          eerdere versies ervan meteen. Van elk project bewaren we hoogstens de 50 laatste versies.
        </p>
      </section>
      <section>
        <h2>Cookies</h2>
        <p>
          We gebruiken enkel de cookies die nodig zijn om je aangemeld te houden, en we onthouden
          in je browser of je de lichte of donkere modus verkiest. Geen volg- of reclamecookies.
        </p>
      </section>
      <section>
        <h2>Je rechten</h2>
        <p>
          Je hebt het recht om je gegevens in te kijken, te laten verbeteren of te laten
          verwijderen. Je projecten kan je zelf op elk moment verwijderen in de app. Heb je een
          klacht, dan kan je terecht bij de Belgische Gegevensbeschermingsautoriteit
          (gegevensbeschermingsautoriteit.be).
        </p>
      </section>
    </LegalPage>
  );
}

import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Gebruiksvoorwaarden" };

export default function TermsPage() {
  return (
    <LegalPage title="Gebruiksvoorwaarden" updated="4 november 2026">
      <section>
        <h2>Wat Plattegrond is</h2>
        <p>
          Plattegrond is een hulpmiddel om zelf een grondplan van je woning te tekenen en je kamers
          in te richten. De app is volop in ontwikkeling en gratis te gebruiken.
        </p>
      </section>
      <section>
        <h2>Geen vervanging voor een architect</h2>
        <p>
          Plannen uit Plattegrond zijn een goede basis voor een gesprek met een aannemer,
          keukenbouwer of architect, maar ze zijn geen bouwplan. Controleer maten altijd ter plaatse
          voor je iets bestelt of laat maken. Voor verbouwingen waarvoor een omgevingsvergunning
          nodig is, heb je in België een architect nodig.
        </p>
      </section>
      <section>
        <h2>Je plannen zijn van jou</h2>
        <p>
          Wat je tekent, blijft van jou. We gebruiken het enkel om het voor jou te bewaren en te
          tonen.
        </p>
      </section>
      <section>
        <h2>Beschikbaarheid</h2>
        <p>
          We doen ons best om de app altijd beschikbaar te houden en je werk veilig te bewaren,
          maar we kunnen dat niet garanderen. Bewaar belangrijke plannen ook zelf, bijvoorbeeld als
          pdf zodra dat kan.
        </p>
      </section>
    </LegalPage>
  );
}

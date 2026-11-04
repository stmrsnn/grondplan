# Plattegrond

Webapp om zonder voorkennis het grondplan van je woning te tekenen en de ruimtes in te richten.

- Next.js (App Router), TypeScript, Tailwind
- Supabase (EU, Frankfurt): aanmelden met Google, tabel `projects` met Row Level Security
- Tekenen in SVG; intern rekenen in gehele millimeters
- Ongedaan maken volgens het commandopatroon (`src/lib/history`), automatisch bewaren (`src/lib/editor/autosave.ts`)

## Ontwikkelen

```bash
npm install
npm run dev      # http://localhost:3000  (tekenvlak zonder aanmelden: /proefbank)
npm test         # unit tests (geometrie, maten, ongedaan maken, bewaren)
```

Nodig in `.env.local`: `NEXT_PUBLIC_SUPABASE_URL` en `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
Databaseschema: `supabase/migrations/`.

import Link from "next/link";
import { Logo } from "@/components/ui/AppHeader";

export default function NotFound() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-5 px-6 text-center">
      <Logo />
      <h1 className="text-xl font-semibold">Deze pagina bestaat niet (meer)</h1>
      <p className="max-w-sm text-sm text-ink-2">
        Misschien werd het project verwijderd, of is de link niet volledig.
      </p>
      <Link
        href="/projecten"
        className="inline-flex h-10 items-center rounded-[var(--radius-control)] bg-accent px-4 text-sm font-medium text-on-accent hover:bg-accent-hover"
      >
        Naar je projecten
      </Link>
    </div>
  );
}

import Link from "next/link";
import type { ReactNode } from "react";
import { HelpButton } from "./Help";
import { ThemeToggle } from "./ThemeToggle";
import { AccountMenu } from "./AccountMenu";

export function Logo({ href = "/projecten" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 rounded-[var(--radius-control)] pr-1">
      <svg width="24" height="24" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="var(--accent)" />
        <path
          d="M8 8h16v16H8z M8 17h7v7"
          fill="none"
          stroke="var(--on-accent)"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-[15px] font-semibold tracking-tight text-ink">Plattegrond</span>
    </Link>
  );
}

/**
 * Dezelfde kop op elke pagina: logo, plaats voor paginatitel en acties,
 * en rechts altijd het uitleg-vraagteken, de kleurmodus en het account.
 */
export function AppHeader({
  middle,
  actions,
  help,
  email,
}: {
  middle?: ReactNode;
  actions?: ReactNode;
  help: { title: string; body: ReactNode };
  email?: string | null;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-bg px-3 sm:px-4">
      <Logo href={email ? "/projecten" : "/"} />
      <div className="flex min-w-0 flex-1 items-center gap-2">{middle}</div>
      {actions}
      <HelpButton title={help.title}>{help.body}</HelpButton>
      <ThemeToggle />
      {email && <AccountMenu email={email} />}
    </header>
  );
}

"use client";

import { LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { W } from "@/lib/words";

export function AccountMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Account"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-[13px] font-semibold uppercase text-accent-ink"
      >
        {email.slice(0, 1)}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-40 w-64 rounded-[var(--radius-card)] border border-line bg-bg p-1.5 shadow-[var(--shadow-float)]">
          <div className="truncate px-3 py-2 text-[13px] text-ink-3">{email}</div>
          <form action="/auth/afmelden" method="post">
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-[var(--radius-control)] px-3 py-2 text-left text-sm text-ink hover:bg-surface-2"
            >
              <LogOut size={16} /> {W.signOut}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

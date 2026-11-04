"use client";

import { CircleHelp } from "lucide-react";
import { useState, type ReactNode } from "react";
import { W } from "@/lib/words";
import { Button, IconButton } from "./Button";
import { Dialog } from "./Dialog";

/** Het vraagteken in de kop van elke pagina: opent een korte uitleg. */
export function HelpButton({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton label={W.help} onClick={() => setOpen(true)}>
        <CircleHelp size={20} />
      </IconButton>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        actions={
          <Button variant="primary" onClick={() => setOpen(false)}>
            Begrepen
          </Button>
        }
      >
        <div className="flex flex-col gap-3">{children}</div>
      </Dialog>
    </>
  );
}

/** Klein vraagteken naast een vakterm, met uitleg in een pop-up. */
export function TermHelp({ term, children }: { term: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={`Wat is ${term}?`}
        onClick={() => setOpen(true)}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink"
      >
        <CircleHelp size={14} />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={term}>
        <div className="flex flex-col gap-3">{children}</div>
      </Dialog>
    </>
  );
}

"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { W } from "@/lib/words";
import { IconButton } from "./Button";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Knoppen onderaan; zet de hoofdactie rechts. */
  actions?: ReactNode;
  width?: number;
}

/**
 * De enige pop-up van de app: altijd gecentreerd, sluit met Esc of het kruisje,
 * houdt de focus binnenin (native <dialog>).
 */
export function Dialog({ open, onClose, title, children, actions, width = 440 }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => {
        // klik op de achtergrond sluit
        if (e.target === ref.current) onClose();
      }}
      style={{ width: `min(${width}px, calc(100vw - 32px))` }}
      className="m-auto rounded-[var(--radius-card)] border border-line bg-bg p-0 text-ink shadow-[var(--shadow-float)]"
      aria-labelledby="dialog-title"
    >
      {open && (
        <div className="flex flex-col gap-4 p-5">
          <div className="flex items-start justify-between gap-4">
            <h2 id="dialog-title" className="pt-1.5 text-base font-semibold">
              {title}
            </h2>
            <IconButton label={W.close} size="sm" onClick={onClose}>
              <X size={18} />
            </IconButton>
          </div>
          <div className="text-sm leading-relaxed text-ink-2">{children}</div>
          {actions && <div className="flex justify-end gap-2 pt-1">{actions}</div>}
        </div>
      )}
    </dialog>
  );
}

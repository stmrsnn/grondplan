"use client";

import { AlertCircle, Check, Loader2 } from "lucide-react";
import type { SaveStatus } from "@/lib/editor/autosave";
import { W } from "@/lib/words";

/** De melding "Bewaard" in de kop van de editor. */
export function SaveIndicator({ status }: { status: SaveStatus }) {
  const content = {
    saved: { icon: <Check size={14} />, text: W.saved, cls: "text-success" },
    dirty: { icon: <Loader2 size={14} className="opacity-0" />, text: W.unsaved, cls: "text-ink-3" },
    saving: { icon: <Loader2 size={14} className="animate-spin" />, text: W.saving, cls: "text-ink-3" },
    error: { icon: <AlertCircle size={14} />, text: W.saveError, cls: "text-danger" },
    conflict: { icon: <AlertCircle size={14} />, text: "Elders gewijzigd", cls: "text-danger" },
  }[status];
  return (
    <span
      role="status"
      aria-live="polite"
      className={`hidden items-center gap-1.5 whitespace-nowrap text-[13px] sm:flex ${content.cls}`}
    >
      {content.icon}
      {content.text}
    </span>
  );
}

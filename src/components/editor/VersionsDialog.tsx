"use client";

import { History as HistoryIcon, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { formatWhen } from "@/lib/format";
import type { ProjectDoc } from "@/lib/model/types";
import { W } from "@/lib/words";
import type { EditorBackend } from "./backend";

/**
 * Lijst met eerdere versies. Terugzetten is zelf weer ongedaan te maken,
 * dus de gebruiker kan niets kwijtraken.
 */
export function VersionsDialog({
  open,
  onClose,
  backend,
  currentDoc,
  onRestore,
  toast,
}: {
  open: boolean;
  onClose: () => void;
  backend: EditorBackend;
  currentDoc: ProjectDoc;
  onRestore: (doc: ProjectDoc, when: string) => void;
  toast: (m: string) => void;
}) {
  const [items, setItems] = useState<{ id: string; label: string; created_at: string }[] | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setError(false);
    try {
      setItems(await backend.listVersions());
    } catch {
      setError(true);
    }
  };

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lijst leegmaken bij openen
    setItems(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Eerdere versies"
      width={480}
      actions={
        <>
          <Button
            disabled={busy !== null}
            onClick={async () => {
              setBusy("nu");
              try {
                await backend.addVersion(currentDoc, "Zelf bewaard");
                toast("Versie bewaard");
                await load();
              } catch {
                toast("Bewaren van de versie lukte niet");
              }
              setBusy(null);
            }}
          >
            Huidige versie {W.save.toLowerCase()}
          </Button>
          <Button variant="primary" onClick={onClose}>
            {W.close}
          </Button>
        </>
      }
    >
      <p className="mb-3">
        Bij elke werksessie bewaren we vanzelf hoe je plan eruitzag vóór je begon. Terugzetten kan
        je daarna gewoon weer ongedaan maken.
      </p>
      {error ? (
        <p className="text-danger">De versies konden niet geladen worden. Probeer het opnieuw.</p>
      ) : items === null ? (
        <p className="text-ink-3">Even geduld…</p>
      ) : items.length === 0 ? (
        <div className="flex items-center gap-3 rounded-[var(--radius-control)] bg-surface-2 px-3 py-3">
          <HistoryIcon size={18} className="shrink-0 text-ink-3" />
          <span>Nog geen versies. Ze verschijnen zodra je iets aan het plan verandert.</span>
        </div>
      ) : (
        <ul className="flex max-h-72 flex-col divide-y divide-[var(--border)] overflow-y-auto rounded-[var(--radius-control)] border border-line">
          {items.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm text-ink">{v.label}</span>
                <span className="text-[12px] text-ink-3">{formatWhen(v.created_at)}</span>
              </span>
              <Button
                size="sm"
                icon={<RotateCcw size={14} />}
                disabled={busy !== null}
                onClick={async () => {
                  setBusy(v.id);
                  try {
                    const doc = await backend.loadVersion(v.id);
                    onRestore(doc, formatWhen(v.created_at));
                    onClose();
                  } catch {
                    toast("Deze versie kon niet geladen worden");
                  }
                  setBusy(null);
                }}
              >
                Terugzetten
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

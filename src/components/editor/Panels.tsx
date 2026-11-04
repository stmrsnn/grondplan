"use client";

import {
  Armchair,
  Bath,
  BedDouble,
  ChefHat,
  PanelLeftClose,
  PanelRightClose,
  Plus,
  Search,
  Trash2,
  TreePine,
  Archive,
  UtensilsCrossed,
} from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";
import { Field, Toggle } from "@/components/ui/Field";
import { TermHelp } from "@/components/ui/Help";
import type { EditorStore } from "@/lib/editor/store";
import { addFloor, changeSettings, removeFloor, updateFloor } from "@/lib/model/commands";
import type { ProjectDoc } from "@/lib/model/types";
import { W } from "@/lib/words";
import { LengthField } from "./LengthField";

function PanelHeader({
  title,
  onHide,
  side,
}: {
  title: string;
  onHide: () => void;
  side: "left" | "right";
}) {
  return (
    <div className="flex h-12 shrink-0 items-center justify-between border-b border-line pl-4 pr-2">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-3">{title}</h2>
      <IconButton size="sm" label={`${title} verbergen`} onClick={onHide}>
        {side === "left" ? <PanelLeftClose size={18} /> : <PanelRightClose size={18} />}
      </IconButton>
    </div>
  );
}

const CATEGORIES = [
  { name: "Zitten", icon: Armchair },
  { name: "Slapen", icon: BedDouble },
  { name: "Eten", icon: UtensilsCrossed },
  { name: "Keuken", icon: ChefHat },
  { name: "Badkamer", icon: Bath },
  { name: "Opbergen", icon: Archive },
  { name: "Buiten", icon: TreePine },
];

/** Linkerbalk: de bibliotheek met meubels (wordt gevuld in stap 5). */
export function LibraryPanel({ onHide }: { onHide: () => void }) {
  return (
    <aside className="flex h-full w-64 flex-col border-r border-line bg-bg" aria-label="Bibliotheek">
      <PanelHeader title="Bibliotheek" onHide={onHide} side="left" />
      <div className="flex flex-col gap-3 overflow-y-auto p-3">
        <label className="flex h-9 items-center gap-2 rounded-[var(--radius-control)] border border-line bg-bg px-3 text-ink-3 focus-within:border-accent">
          <Search size={16} />
          <input
            placeholder="Zoek een meubel"
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
          />
        </label>
        <ul className="flex flex-col gap-0.5">
          {CATEGORIES.map(({ name, icon: Icon }) => (
            <li
              key={name}
              className="flex h-9 items-center gap-3 rounded-[var(--radius-control)] px-2.5 text-sm text-ink-2"
            >
              <Icon size={18} className="text-ink-3" />
              {name}
            </li>
          ))}
        </ul>
        <p className="rounded-[var(--radius-control)] bg-surface-2 px-3 py-2.5 text-[13px] leading-relaxed text-ink-2">
          Hier komen binnenkort meubels met echte afmetingen, die je zo in je plan sleept.
        </p>
      </div>
    </aside>
  );
}

/** Rechterbalk: eigenschappen. Zonder selectie toont hij het plan zelf. */
export function PropertiesPanel({
  store,
  doc,
  activeFloorId,
  onHide,
  toast,
}: {
  store: EditorStore;
  doc: ProjectDoc;
  activeFloorId: string;
  onHide: () => void;
  toast: (m: string) => void;
}) {
  const floor = doc.floors.find((f) => f.id === activeFloorId) ?? doc.floors[0];

  return (
    <aside className="flex h-full w-72 flex-col border-l border-line bg-bg" aria-label="Eigenschappen">
      <PanelHeader title="Eigenschappen" onHide={onHide} side="right" />
      <div className="flex flex-col gap-6 overflow-y-auto p-4">
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">{floor.name}</h3>
          <Field
            label="Naam van de verdieping"
            value={floor.name}
            maxLength={60}
            onChange={(e) =>
              store.execute(updateFloor(floor.id, { name: floor.name }, { name: e.target.value }))
            }
            onBlur={(e) => {
              store.seal();
              if (!e.target.value.trim())
                store.execute(updateFloor(floor.id, { name: e.target.value }, { name: "Verdieping" }));
            }}
          />
          <LengthField
            label="Plafondhoogte"
            value={floor.height}
            min={1800}
            max={6000}
            hint={
              <span className="inline-flex items-center gap-1">
                Van de afgewerkte vloer tot het plafond
                <TermHelp term="Plafondhoogte">
                  <p>
                    De vrije hoogte van een kamer: gemeten van de bovenkant van de vloer tot de
                    onderkant van het plafond.
                  </p>
                  <p>In een gewone Belgische woning is dat meestal 2,50 à 2,70 m.</p>
                  <svg viewBox="0 0 200 110" className="w-full max-w-[240px]" aria-hidden="true">
                    <rect x="20" y="10" width="160" height="8" fill="var(--text-3)" />
                    <rect x="20" y="92" width="160" height="8" fill="var(--text-3)" />
                    <line x1="100" y1="20" x2="100" y2="90" stroke="var(--accent)" strokeWidth="1.5" />
                    <path d="M95 26 L100 20 L105 26 M95 84 L100 90 L105 84" fill="none" stroke="var(--accent)" strokeWidth="1.5" />
                    <text x="108" y="58" fontSize="11" fill="var(--text)">2,60 m</text>
                  </svg>
                </TermHelp>
              </span>
            }
            onCommit={(mm) => {
              store.execute(updateFloor(floor.id, { height: floor.height }, { height: mm }));
              store.seal();
            }}
          />
          {doc.floors.length > 1 && (
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 size={16} />}
              className="self-start text-danger! hover:text-danger!"
              onClick={() => {
                const cmd = removeFloor(doc, floor.id);
                if (cmd) {
                  store.execute(cmd);
                  toast(`${floor.name} verwijderd. Ongedaan maken kan altijd.`);
                }
              }}
            >
              Verdieping {W.remove.toLowerCase()}
            </Button>
          )}
        </section>

        <section className="flex flex-col gap-3 border-t border-line pt-5">
          <h3 className="text-sm font-semibold">Verdiepingen</h3>
          <Button
            size="sm"
            icon={<Plus size={16} />}
            className="self-start"
            onClick={() => {
              const { cmd, floorId } = addFloor(doc);
              store.execute(cmd);
              store.setActiveFloor(floorId);
            }}
          >
            Verdieping {W.add.toLowerCase()}
          </Button>
        </section>

        <section className="flex flex-col gap-3 border-t border-line pt-5">
          <h3 className="text-sm font-semibold">Tekenhulp</h3>
          <Toggle
            label="Magnetisch raster"
            hint="Alles wat je tekent, valt netjes op stappen van 5 cm."
            checked={doc.settings.snapToGrid}
            onChange={(v) =>
              store.execute(changeSettings(doc.settings, { ...doc.settings, snapToGrid: v }))
            }
          />
        </section>
      </div>
    </aside>
  );
}

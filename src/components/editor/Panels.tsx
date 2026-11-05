"use client";

import { memo } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, PanelRightClose, RotateCcw, RotateCw, Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";
import { Field, Toggle } from "@/components/ui/Field";
import { TermHelp } from "@/components/ui/Help";
import type { EditorStore } from "@/lib/editor/store";
import {
  addFloor,
  removeFloor,
  setNorth,
  setSnap,
  setWallDefaults,
  updateFloor,
} from "@/lib/model/commands";
import type { FloorAnalysis } from "@/lib/geometry/plan";
import type { ProjectDoc } from "@/lib/model/types";
import type { Selection } from "./PlanLayers";
import { Overview, SelectionPanel } from "./SelectionPanels";
import { W } from "@/lib/words";
import { LengthField } from "./LengthField";
import { WallTypeSelect } from "./WallTypeSelect";
import { typeThickness, wallType } from "@/lib/model/wallTypes";
import { Compass } from "./NorthArrow";

function PanelHeader({ title, onHide }: { title: string; onHide: () => void }) {
  return (
    <div className="flex h-12 shrink-0 items-center justify-between border-b border-line pl-4 pr-2">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-3">{title}</h2>
      <IconButton size="sm" label={`${title} verbergen`} onClick={onHide}>
        <PanelRightClose size={18} />
      </IconButton>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-line pt-5 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

/** Rechterbalk: eigenschappen. Zonder selectie toont hij het plan zelf. */
export const PropertiesPanel = memo(function PropertiesPanel({
  store,
  doc,
  activeFloorId,
  onHide,
  toast,
  selection,
  setSelection,
  analysis,
  onDelete,
}: {
  store: EditorStore;
  doc: ProjectDoc;
  activeFloorId: string;
  onHide: () => void;
  toast: (m: string) => void;
  selection: Selection;
  setSelection: (s: Selection) => void;
  analysis: FloorAnalysis;
  onDelete: () => void;
}) {
  const floor = doc.floors.find((f) => f.id === activeFloorId) ?? doc.floors[0];
  const s = doc.settings;
  const commit = (cmd: Parameters<EditorStore["execute"]>[0]) => {
    store.execute(cmd);
    store.seal();
  };

  return (
    <aside className="flex h-full w-72 flex-col border-l border-line bg-bg" aria-label="Eigenschappen">
      <PanelHeader title="Eigenschappen" onHide={onHide} />
      {selection ? (
        <div className="flex flex-col gap-6 overflow-y-auto p-4">
          <button
            type="button"
            onClick={() => setSelection(null)}
            className="-mb-2 flex items-center gap-1 self-start text-[13px] text-ink-3 hover:text-ink"
          >
            <ArrowLeft size={14} /> Plan
          </button>
          <SelectionPanel
            store={store}
            doc={doc}
            floor={floor}
            selection={selection}
            analysis={analysis}
            onDelete={onDelete}
          />
        </div>
      ) : (
      <div className="flex flex-col gap-6 overflow-y-auto p-4">
        <Overview doc={doc} floor={floor} analysis={analysis} onSelect={setSelection} />
        <Section title={floor.name}>
          <Field
            label="Naam van de verdieping"
            value={floor.name}
            maxLength={60}
            onChange={(e) =>
              store.execute(
                updateFloor(floor.id, { name: floor.name }, { name: e.target.value }, floor.name),
              )
            }
            onBlur={(e) => {
              store.seal();
              if (!e.target.value.trim())
                commit(updateFloor(floor.id, { name: e.target.value }, { name: "Verdieping" }, "Verdieping"));
            }}
          />
          <LengthField
            label="Vloerpeil"
            value={floor.elevation}
            min={-9000}
            max={60000}
            hint={
              <span className="inline-flex items-center gap-1">
                Hoogte van deze vloer t.o.v. het gelijkvloers
                <TermHelp term="Vloerpeil">
                  <p>
                    Het peil zegt hoe hoog een vloer ligt ten opzichte van het gelijkvloers. Het
                    gelijkvloers ligt op 0,00 m.
                  </p>
                  <p>
                    Een verdieping erboven ligt meestal op 2,90 m: de plafondhoogte plus de dikte
                    van de vloer. Een kelder ligt onder nul, bijvoorbeeld op −2,90 m. Een tussenniveau
                    kan ook, bijvoorbeeld 1,45 m.
                  </p>
                  <svg viewBox="0 0 220 120" className="w-full max-w-[260px]" aria-hidden="true">
                    <rect x="30" y="20" width="120" height="6" fill="var(--text-3)" />
                    <rect x="30" y="62" width="120" height="6" fill="var(--text-2)" />
                    <rect x="30" y="104" width="120" height="6" fill="var(--text-3)" />
                    <text x="158" y="28" fontSize="11" fill="var(--text)">+2,90 m</text>
                    <text x="158" y="70" fontSize="11" fill="var(--accent)">0,00 m</text>
                    <text x="158" y="112" fontSize="11" fill="var(--text)">−2,90 m</text>
                  </svg>
                </TermHelp>
              </span>
            }
            onCommit={(mm) =>
              commit(updateFloor(floor.id, { elevation: floor.elevation }, { elevation: mm }, floor.name))
            }
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
            onCommit={(mm) =>
              commit(updateFloor(floor.id, { height: floor.height }, { height: mm }, floor.name))
            }
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
                  commit(cmd);
                  toast(`${floor.name} verwijderd. Ongedaan maken kan altijd.`);
                }
              }}
            >
              {floor.name} {W.remove.toLowerCase()}
            </Button>
          )}
        </Section>

        <Section title="Verdiepingen">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              icon={<ArrowUp size={16} />}
              onClick={() => {
                const { cmd, floorId } = addFloor(doc, "above");
                commit(cmd);
                store.setActiveFloor(floorId);
              }}
            >
              Verdieping erboven
            </Button>
            <Button
              size="sm"
              icon={<ArrowDown size={16} />}
              onClick={() => {
                const { cmd, floorId } = addFloor(doc, "below");
                commit(cmd);
                store.setActiveFloor(floorId);
              }}
            >
              Kelder eronder
            </Button>
          </div>
        </Section>

        <Section title="Muren">
          <div className="flex items-start gap-1 text-[13px] leading-relaxed text-ink-2">
            <span>
              Maten op het plan zijn <strong className="text-ink">binnenmaten</strong>: van muur tot
              muur, zoals je zelf meet met een rolmeter.
            </span>
            <TermHelp term="Binnenmaten">
              <p>
                Een binnenmaat meet je binnen in de kamer, van de ene afgewerkte muur tot de andere.
                Zo meet iedereen thuis, en zo past je meubel ook echt.
              </p>
              <p>
                De dikte van de muren komt daar nog bij. Bij het afdrukken voor een aannemer zetten we
                ook de buitenmaten op het plan.
              </p>
              <svg viewBox="0 0 220 90" className="w-full max-w-[260px]" aria-hidden="true">
                <rect x="10" y="20" width="200" height="60" fill="none" stroke="var(--text)" strokeWidth="10" />
                <line x1="15" y1="50" x2="205" y2="50" stroke="var(--accent)" strokeWidth="1.5" />
                <text x="110" y="45" textAnchor="middle" fontSize="11" fill="var(--accent)">binnenmaat</text>
                <line x1="5" y1="10" x2="215" y2="10" stroke="var(--text-3)" strokeWidth="1" />
                <text x="110" y="8" textAnchor="middle" fontSize="10" fill="var(--text-3)">buitenmaat</text>
              </svg>
            </TermHelp>
          </div>
          <WallTypeSelect
            label="Nieuwe gevels"
            value={s.wallDefaults.exteriorType}
            onChange={(id) => {
              const t = wallType(id)!;
              commit(setWallDefaults(s, { ...s.wallDefaults, exteriorType: id, exterior: typeThickness(t) }));
            }}
          />
          <WallTypeSelect
            label="Nieuwe binnenmuren"
            value={s.wallDefaults.interiorType}
            onChange={(id) => {
              const t = wallType(id)!;
              commit(setWallDefaults(s, { ...s.wallDefaults, interiorType: id, interior: typeThickness(t) }));
            }}
          />
          <p className="text-[12px] leading-relaxed text-ink-3">
            Alle maten op het plan zijn ruwbouwmaten, zoals op een bouwplan: zonder pleisterwerk (± 1,5 cm per
            wand). Bestaande muren wijzig je per muur.
          </p>
        </Section>

        <Section title="Waar ligt het noorden?">
          <div className="flex items-center gap-3">
            <Compass angle={s.northAngle} size={56} />
            <div className="flex flex-col gap-1.5">
              <div className="flex gap-1">
                <IconButton
                  size="sm"
                  label="Noorden 15° naar links draaien"
                  className="border border-line"
                  onClick={() => store.execute(setNorth(s, s.northAngle - 15))}
                >
                  <RotateCcw size={16} />
                </IconButton>
                <IconButton
                  size="sm"
                  label="Noorden 15° naar rechts draaien"
                  className="border border-line"
                  onClick={() => store.execute(setNorth(s, s.northAngle + 15))}
                >
                  <RotateCw size={16} />
                </IconButton>
              </div>
              <span className="tabular text-[12px] text-ink-3">{s.northAngle}° t.o.v. boven</span>
            </div>
          </div>
          <p className="text-[12px] leading-relaxed text-ink-3">
            Zo weten we later waar de zon binnenvalt. Twijfel je? Kijk op je gsm-kompas met de
            telefoon in de richting van het plan.
          </p>
        </Section>

        <Section title="Tekenhulp">
          <Toggle
            label="Magnetisch raster"
            hint="Alles wat je tekent, valt netjes op stappen van 5 cm."
            checked={s.snapToGrid}
            onChange={(v) => commit(setSnap(s, v))}
          />
        </Section>
      </div>
      )}
    </aside>
  );
});

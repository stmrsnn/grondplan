"use client";

import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { createContext, useContext, useState } from "react";
import { Button, IconButton } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Toggle } from "@/components/ui/Field";
import {
  customWallTypes,
  MATERIAL_LABEL,
  MATERIALS,
  WALL_TYPES,
  wallType,
  type Layer,
  type Material,
  type WallType,
} from "@/lib/model/wallTypes";
import { HATCH, PlanPatterns } from "./PlanLayers";

/**
 * Overal waar je een muurtype kiest, kan je ook een eigen type maken of
 * bewerken. De editor geeft deze functie door.
 */
export const WallTypeEditorContext = createContext<
  ((opts: { edit?: string; onCreated?: (id: string) => void }) => void) | null
>(null);

export function useWallTypeEditor() {
  return useContext(WallTypeEditorContext);
}

const fieldCls =
  "h-9 rounded-[var(--radius-control)] border border-line bg-bg px-2 text-sm text-ink hover:border-line-strong focus:border-accent focus:outline-none";

const cmText = (mm: number) => (mm / 10).toLocaleString("nl-BE", { maximumFractionDigits: 1 });
const parseCm = (s: string): number | null => {
  const v = Number(s.replace(",", ".").trim());
  return Number.isFinite(v) && v > 0 && v <= 100 ? Math.round(v * 10) : null;
};

type Row = { material: Material; cm: string };

/**
 * Een muurtype samenstellen: naam, gevel of binnenmuur, dragend, en de lagen
 * met hun materiaal en dikte. Met een voorbeeld zoals op het plan.
 */
export function WallTypeDialog({
  initial,
  usage,
  canDelete,
  onSave,
  onDelete,
  onClose,
}: {
  /** Bestaand eigen type om te bewerken; zonder: een nieuw type. */
  initial: WallType | null;
  /** Aantal muren dat dit type gebruikt. */
  usage: number;
  canDelete: boolean;
  onSave: (t: Omit<WallType, "id"> & { id?: string }) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [exterior, setExterior] = useState(initial?.exterior ?? true);
  const [loadBearing, setLoadBearing] = useState(initial?.loadBearing ?? true);
  const [rows, setRows] = useState<Row[]>(
    (initial?.layers ?? wallType("spouw-38")!.layers).map((l) => ({ material: l.material, cm: cmText(l.thickness) })),
  );
  const [error, setError] = useState<string | null>(null);

  const layers: Layer[] = rows.map((r) => ({ material: r.material, thickness: parseCm(r.cm) ?? 0 }));
  const valid = layers.every((l) => l.thickness > 0);
  const total = layers.reduce((s, l) => s + l.thickness, 0);
  const setRow = (i: number, patch: Partial<Row>) => setRows(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);
  };
  const startFrom = (id: string) => {
    const t = wallType(id);
    if (!t) return;
    setRows(t.layers.map((l) => ({ material: l.material, cm: cmText(l.thickness) })));
    setExterior(t.exterior);
    setLoadBearing(t.loadBearing);
    if (!name.trim()) setName(`${t.name} (eigen)`);
  };
  const save = () => {
    if (!name.trim()) return setError("Geef het muurtype een naam.");
    if (rows.length === 0) return setError("Voeg minstens één laag toe.");
    if (!valid) return setError("Elke laag heeft een dikte nodig, in cm (bv. 14 of 1,3).");
    if (total > 1000) return setError("Een muur van meer dan 1 m dik? Kijk de diktes even na.");
    onSave({ id: initial?.id, name: name.trim(), hint: initial?.hint ?? "", exterior, loadBearing, layers });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={initial ? "Muurtype bewerken" : "Nieuw muurtype"}
      width={620}
      actions={
        <>
          {initial && canDelete && (
            <Button variant="ghost" icon={<Trash2 size={16} />} className="mr-auto text-danger! hover:text-danger!" onClick={onDelete}>
              Verwijderen
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Annuleren
          </Button>
          <Button variant="primary" onClick={save}>
            Bewaren
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="rounded-[var(--radius-control)] bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        <Field label="Naam" value={name} maxLength={60} placeholder="bv. Houtskeletgevel 30 cm" onChange={(e) => setName(e.target.value)} />
        {!initial && (
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink-2">Vertrekken van</span>
            <select className={`${fieldCls} h-10 px-3`} defaultValue="" onChange={(e) => startFrom(e.target.value)}>
              <option value="" disabled>
                Kies een bestaand type om aan te passen…
              </option>
              {[...WALL_TYPES, ...customWallTypes()].map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex rounded-[var(--radius-control)] bg-surface-2 p-0.5 text-[13px]" role="radiogroup" aria-label="Soort muur">
            {([true, false] as const).map((v) => (
              <button
                key={String(v)}
                type="button"
                role="radio"
                aria-checked={exterior === v}
                onClick={() => setExterior(v)}
                className={`h-8 rounded-[6px] px-3 ${exterior === v ? "border border-line bg-bg font-medium text-ink" : "text-ink-3 hover:text-ink"}`}
              >
                {v ? "Gevel" : "Binnenmuur"}
              </button>
            ))}
          </div>
          <div className="min-w-48 flex-1">
            <Toggle label="Dragend" checked={loadBearing} onChange={setLoadBearing} />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-ink-2">
            Lagen {exterior ? "van buiten naar binnen" : "van de ene kant naar de andere"}
          </span>
          <ol className="flex flex-col gap-1.5">
            {rows.map((r, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <span className="tabular w-5 text-right text-[12px] text-ink-3">{i + 1}</span>
                <select
                  aria-label={`Materiaal laag ${i + 1}`}
                  className={`${fieldCls} min-w-0 flex-1`}
                  value={r.material}
                  onChange={(e) => setRow(i, { material: e.target.value as Material })}
                >
                  {MATERIALS.map((m) => (
                    <option key={m} value={m}>
                      {MATERIAL_LABEL[m]}
                    </option>
                  ))}
                </select>
                <input
                  aria-label={`Dikte laag ${i + 1} in cm`}
                  className={`${fieldCls} tabular w-20 text-right ${parseCm(r.cm) ? "" : "border-danger"}`}
                  value={r.cm}
                  inputMode="decimal"
                  onChange={(e) => setRow(i, { cm: e.target.value })}
                />
                <span className="text-[12px] text-ink-3">cm</span>
                <IconButton size="sm" label="Laag hoger" onClick={() => move(i, -1)}>
                  <ArrowUp size={15} />
                </IconButton>
                <IconButton size="sm" label="Laag lager" onClick={() => move(i, 1)}>
                  <ArrowDown size={15} />
                </IconButton>
                <IconButton size="sm" label="Laag weghalen" onClick={() => setRows(rows.filter((_, k) => k !== i))}>
                  <X size={15} />
                </IconButton>
              </li>
            ))}
          </ol>
          <div className="flex items-center justify-between">
            <Button size="sm" variant="ghost" icon={<Plus size={16} />} onClick={() => setRows([...rows, { material: "snelbouw", cm: "9" }])}>
              Laag toevoegen
            </Button>
            <span className="tabular text-sm font-semibold">Totaal {cmText(total)} cm</span>
          </div>
        </div>

        {valid && layers.length > 0 && <SectionPreview layers={layers} exterior={exterior} />}

        {initial && usage > 0 && (
          <p className="rounded-[var(--radius-control)] bg-surface-2 px-3 py-2 text-[12.5px] leading-relaxed text-ink-2">
            {usage === 1 ? "Eén muur gebruikt" : `${usage} muren gebruiken`} dit type. Ze passen mee aan; een gevel houdt de maat
            van de kamer erachter, zodat je kamers even groot blijven.
          </p>
        )}
      </div>
    </Dialog>
  );
}

/** Stukje muur van 1 m, zoals op het plan: buiten bovenaan, met arcering en isolatiesymbool. */
function SectionPreview({ layers, exterior }: { layers: Layer[]; exterior: boolean }) {
  const total = layers.reduce((s, l) => s + l.thickness, 0);
  const W = 1000;
  const px = 300 / W; // 300 px voor 1 m muur
  const h = total * px;
  // bovenkant van elke laag
  const tops = layers.map((_, i) => layers.slice(0, i).reduce((sum, l) => sum + l.thickness, 0));
  return (
    <figure className="flex flex-col gap-1.5">
      <figcaption className="text-[13px] font-medium text-ink-2">Voorbeeld (1 m muur, op schaal)</figcaption>
      <div className="flex items-stretch gap-3">
        <svg width={W * px} height={h + 2} viewBox={`0 -1 ${W} ${total + 2 / px}`} className="shrink-0 overflow-visible" role="img" aria-label="Doorsnede van de muur">
          <PlanPatterns zoom={px} prefix="wtp" />
          {layers.map((l, i) => {
            const y0 = tops[i];
            const insul = l.material === "isolatie" || l.material === "wol";
            // isolatie zoals op het plan: hard = zigzag, minerale wol = golf
            const step = l.thickness * 0.55;
            const n = Math.floor(W / step) + 1;
            const yAt = (k: number) => y0 + (k % 2 ? 0.9 : 0.1) * l.thickness;
            const zig = !(insul && l.thickness >= 30)
              ? ""
              : l.material === "wol"
                ? `M0 ${yAt(0)}` + Array.from({ length: n - 1 }, (_, k) => `Q${k * step} ${yAt(k)} ${(k + 0.5) * step} ${(yAt(k) + yAt(k + 1)) / 2}`).join("")
                : Array.from({ length: n }, (_, k) => `${k === 0 ? "M" : "L"}${k * step} ${yAt(k)}`).join("");
            return (
              <g key={i}>
                <rect x={0} y={y0} width={W} height={l.thickness} fill={HATCH[l.material] ? `url(#wtp-${l.material})` : "var(--plan-paper)"} />
                {zig && <path d={zig} fill="none" stroke="var(--plan-hatch)" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />}
                {i > 0 && <line x1={0} y1={y0} x2={W} y2={y0} stroke="var(--plan-ink)" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />}
              </g>
            );
          })}
          <rect x={0} y={0} width={W} height={total} fill="none" stroke="var(--plan-ink)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="flex flex-col justify-between text-[11.5px] leading-tight text-ink-3" style={{ height: h }}>
          <span>{exterior ? "buiten" : ""}</span>
          <span>{exterior ? "binnen" : ""}</span>
        </div>
      </div>
    </figure>
  );
}

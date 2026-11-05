"use client";

import { ArrowLeft, ArrowRight, Plus, Trash2, X } from "lucide-react";
import { createContext, useContext, useState } from "react";
import { Button, IconButton } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Toggle } from "@/components/ui/Field";
import {
  DOOR_PRESETS,
  FRAME_PRESETS,
  hasDoor,
  MIN_SASH,
  SASH_LABEL,
  SASH_TYPES,
  sashWidths,
  type Frame,
  type FrameType,
  type Sash,
  type SashType,
} from "@/lib/model/frames";
import { FramePreview } from "./FramePreview";

/** Een raam of deur samenstellen, van overal waar je een soort kiest. */
export type FrameEditorOpts = {
  /** Een geplaatst raam of deur aanpassen. */
  openingId?: string;
  /** Een eigen soort bewerken. */
  typeId?: string;
  /** Een nieuwe eigen soort: bij ramen of bij deuren beginnen. */
  group?: "door" | "window";
  onCreated?: (id: string) => void;
};

export const FrameEditorContext = createContext<((opts: FrameEditorOpts) => void) | null>(null);

export function useFrameEditor() {
  return useContext(FrameEditorContext);
}

export interface FrameDialogResult {
  frame: Frame;
  width: number;
  height: number;
  sillHeight: number;
  /** Ook (of enkel) bewaren als eigen soort met deze naam. */
  saveAs: string | null;
}

const fieldCls =
  "h-9 rounded-[var(--radius-control)] border border-line bg-bg px-2 text-sm text-ink hover:border-line-strong focus:border-accent focus:outline-none";

const cmText = (mm: number | undefined) => (mm ? (mm / 10).toLocaleString("nl-BE", { maximumFractionDigits: 1 }) : "");
const parseCm = (s: string, max = 800): number | null => {
  const v = Number(s.replace(",", ".").trim());
  return s.trim() !== "" && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v * 10) : null;
};

type Row = { type: SashType; cm: string; hinge: "left" | "right"; glass: boolean };
const toRows = (f: Frame): Row[] =>
  f.sashes.map((s) => ({ type: s.type, cm: cmText(s.width), hinge: s.hinge ?? "left", glass: !!s.glass }));

const hingeWords = (t: SashType): [string, string] | null =>
  t === "schuif" ? ["Schuift naar links", "Schuift naar rechts"] : t === "vast" || t === "kiep" ? null : ["Scharnier links", "Scharnier rechts"];

export function FrameDialog({
  title,
  initial,
  mode,
  canDelete = false,
  usage = 0,
  onSave,
  onDelete,
  onClose,
}: {
  title: string;
  initial: { frame: Frame; width: number; height: number; sillHeight: number; name?: string };
  /** "opening": een geplaatst raam (bewaren als soort is een keuze); "type": een eigen soort (naam verplicht). */
  mode: "opening" | "type";
  canDelete?: boolean;
  usage?: number;
  onSave: (r: FrameDialogResult) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(toRows(initial.frame));
  const [w, setW] = useState(cmText(initial.width));
  const [h, setH] = useState(cmText(initial.height));
  const [sill, setSill] = useState(cmText(initial.sillHeight) || "0");
  const [top, setTop] = useState(initial.frame.transom ?? null);
  const [topCm, setTopCm] = useState(cmText(initial.frame.transom?.height ?? 450));
  const [name, setName] = useState(initial.name ?? "");
  const [asType, setAsType] = useState(mode === "type");
  const [error, setError] = useState<string | null>(null);

  const frame: Frame = {
    sashes: rows.map((r): Sash => {
      const s: Sash = { type: r.type };
      const width = parseCm(r.cm);
      if (width && width >= MIN_SASH) s.width = width;
      if (hingeWords(r.type)) s.hinge = r.hinge;
      if (r.type === "deur" && r.glass) s.glass = true;
      return s;
    }),
  };
  const topH = parseCm(topCm);
  if (top && topH) frame.transom = { height: topH, type: top.type };
  const door = hasDoor(frame);
  const allFixed = frame.sashes.length > 0 && frame.sashes.every((s) => s.width);
  const width = allFixed ? frame.sashes.reduce((s, x) => s + (x.width ?? 0), 0) : (parseCm(w) ?? 0);
  const height = parseCm(h) ?? 0;
  const sillHeight = door ? 0 : (parseCm(sill) ?? 0);
  const okSize = width >= 300 && height >= 300;

  const setRow = (i: number, patch: Partial<Row>) => setRows(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);
  };
  const startFrom = (t: FrameType) => {
    setRows(toRows(t.frame));
    setW(cmText(t.width));
    setH(cmText(t.height));
    setSill(cmText(t.sillHeight) || "0");
    setTop(t.frame.transom ?? null);
    if (t.frame.transom) setTopCm(cmText(t.frame.transom.height));
    if (mode === "type" && !name.trim()) setName(`${t.name} (eigen)`);
  };

  const save = () => {
    if (rows.length === 0) return setError("Voeg minstens één vak toe.");
    if (!okSize) return setError("Geef een breedte en hoogte van minstens 30 cm.");
    if (rows.some((r) => r.cm.trim() !== "" && !((parseCm(r.cm) ?? 0) >= MIN_SASH)))
      return setError("Een vak is minstens 20 cm breed. Laat het vak leeg om het vanzelf te verdelen.");
    const fixed = frame.sashes.reduce((s, x) => s + (x.width ?? 0), 0);
    if (!allFixed && fixed + MIN_SASH * frame.sashes.filter((s) => !s.width).length > width)
      return setError("De vakken met een maat zijn samen te breed voor dit raam.");
    if (frame.transom && frame.transom.height > height - 600) return setError("Het bovenlicht is te hoog voor dit raam.");
    if (door && height < 1800) return setError("Een deur is minstens 1,80 m hoog.");
    if ((mode === "type" || asType) && !name.trim()) return setError("Geef je soort een naam.");
    onSave({ frame, width, height, sillHeight, saveAs: mode === "type" || asType ? name.trim() : null });
  };

  const presets = [...FRAME_PRESETS, ...DOOR_PRESETS];
  const widths = okSize ? sashWidths(frame, width) : [];

  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      width={760}
      actions={
        <>
          {canDelete && onDelete && (
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
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-2">Vertrekken van</span>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="list" aria-label="Voorbeelden">
            {presets.map((t) => (
              <button
                key={t.id}
                type="button"
                role="listitem"
                onClick={() => startFrom(t)}
                title={t.name}
                className="flex w-[84px] shrink-0 flex-col items-center gap-1 rounded-[var(--radius-control)] border border-line p-1.5 text-[11px] leading-tight text-ink-2 hover:border-accent hover:bg-accent-soft"
              >
                <span className="flex h-12 items-end">
                  <FramePreview frame={t.frame} width={t.width} height={t.height} maxW={70} maxH={48} label={t.name} />
                </span>
                <span className="line-clamp-2 text-center">{t.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_260px]">
          <div className="flex min-w-0 flex-col gap-4">
            <div className="grid grid-cols-3 gap-2">
              <CmField
                label="Breedte"
                value={allFixed ? cmText(width) : w}
                onChange={setW}
                disabled={allFixed}
                hint={allFixed ? "Som van de vakken" : undefined}
              />
              <CmField label="Hoogte" value={h} onChange={setH} />
              <CmField
                label="Borstwering"
                value={door ? "0" : sill}
                onChange={setSill}
                disabled={door}
                hint={door ? "Een deur staat op de vloer" : "Vloer tot onder het raam"}
              />
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-medium text-ink-2">Vakken van links naar rechts, van binnen gezien</span>
              <ol className="flex flex-col gap-2">
                {rows.map((r, i) => {
                  const hw = hingeWords(r.type);
                  return (
                    <li key={i} className="flex flex-wrap items-center gap-1.5 rounded-[var(--radius-control)] border border-line p-2">
                      <span className="tabular w-5 text-right text-[12px] text-ink-3">{i + 1}</span>
                      <select
                        aria-label={`Soort vak ${i + 1}`}
                        className={`${fieldCls} min-w-28 flex-1`}
                        value={r.type}
                        onChange={(e) => setRow(i, { type: e.target.value as SashType })}
                      >
                        {SASH_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {SASH_LABEL[t]}
                          </option>
                        ))}
                      </select>
                      <input
                        aria-label={`Breedte vak ${i + 1} in cm`}
                        className={`${fieldCls} tabular w-20 text-right`}
                        value={r.cm}
                        placeholder={widths[i] ? cmText(Math.round(widths[i] / 10) * 10) : "vanzelf"}
                        inputMode="decimal"
                        onChange={(e) => setRow(i, { cm: e.target.value })}
                      />
                      <span className="text-[12px] text-ink-3">cm</span>
                      <div className="ml-auto flex items-center">
                        <IconButton size="sm" label="Vak naar links" onClick={() => move(i, -1)}>
                          <ArrowLeft size={15} />
                        </IconButton>
                        <IconButton size="sm" label="Vak naar rechts" onClick={() => move(i, 1)}>
                          <ArrowRight size={15} />
                        </IconButton>
                        <IconButton size="sm" label={`Vak ${i + 1} weghalen`} onClick={() => setRows(rows.filter((_, k) => k !== i))}>
                          <X size={15} />
                        </IconButton>
                      </div>
                      {(hw || r.type === "deur") && (
                        <div className="flex w-full flex-wrap items-center gap-2 pl-6">
                          {hw && (
                            <div className="flex rounded-[var(--radius-control)] bg-surface-2 p-0.5 text-[12px]" role="radiogroup" aria-label={`Richting vak ${i + 1}`}>
                              {(["left", "right"] as const).map((side, k) => (
                                <button
                                  key={side}
                                  type="button"
                                  role="radio"
                                  aria-checked={r.hinge === side}
                                  onClick={() => setRow(i, { hinge: side })}
                                  className={`h-7 rounded-[6px] px-2 ${r.hinge === side ? "border border-line bg-bg font-medium text-ink" : "text-ink-3 hover:text-ink"}`}
                                >
                                  {hw[k]}
                                </button>
                              ))}
                            </div>
                          )}
                          {r.type === "deur" && (
                            <label className="flex items-center gap-1.5 text-[12.5px] text-ink-2">
                              <input type="checkbox" checked={r.glass} onChange={(e) => setRow(i, { glass: e.target.checked })} className="accent-[var(--accent)]" />
                              Met glas
                            </label>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
              <Button
                size="sm"
                variant="ghost"
                className="self-start"
                icon={<Plus size={16} />}
                disabled={rows.length >= 6}
                onClick={() => setRows([...rows, { type: "vast", cm: "", hinge: "right", glass: false }])}
              >
                Vak toevoegen
              </Button>
            </div>

            <div className="flex flex-col gap-2">
              <Toggle label="Bovenlicht" checked={!!top} onChange={(v) => setTop(v ? { height: parseCm(topCm) ?? 450, type: "vast" } : null)} />
              {top && (
                <div className="flex flex-wrap items-end gap-2">
                  <CmField label="Hoogte bovenlicht" value={topCm} onChange={setTopCm} />
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[13px] font-medium text-ink-2">Bovenlicht</span>
                    <select className={`${fieldCls} h-10`} value={top.type} onChange={(e) => setTop({ ...top, type: e.target.value as "vast" | "kiep" })}>
                      <option value="vast">Vast</option>
                      <option value="kiep">Kiep</option>
                    </select>
                  </label>
                </div>
              )}
            </div>
          </div>

          <figure className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] bg-surface-2 p-3">
            <figcaption className="self-start text-[13px] font-medium text-ink-2">Voorbeeld, van binnen gezien</figcaption>
            <div className="flex h-[260px] items-center justify-center">
              {okSize && rows.length > 0 ? (
                <FramePreview frame={frame} width={width} height={height} sill={sillHeight} showFloor maxW={230} maxH={250} />
              ) : (
                <span className="text-[12px] text-ink-3">Vul een breedte en hoogte in</span>
              )}
            </div>
            {okSize && (
              <span className="tabular text-[12px] text-ink-2">
                {cmText(width)} × {cmText(height)} cm{door ? "" : ` · borstwering ${cmText(sillHeight) || "0"} cm`}
              </span>
            )}
          </figure>
        </div>

        <div className="flex flex-col gap-2 border-t border-line pt-3">
          {mode === "opening" && <Toggle label="Ook bewaren als eigen soort, om opnieuw te gebruiken" checked={asType} onChange={setAsType} />}
          {(mode === "type" || asType) && (
            <Field label="Naam" value={name} maxLength={60} placeholder="bv. Badkamerraam met kiep" onChange={(e) => setName(e.target.value)} />
          )}
          {mode === "type" && usage > 0 && (
            <p className="text-[12.5px] text-ink-2">
              {usage === 1 ? "Eén raam of deur gebruikt" : `${usage} ramen en deuren gebruiken`} deze soort; ze krijgen de nieuwe vakken mee.
            </p>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function CmField({
  label,
  value,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-ink-2">{label}</span>
      <span className="flex items-center gap-1">
        <input
          aria-label={`${label} in cm`}
          className={`${fieldCls} tabular h-10 w-full min-w-0 text-right disabled:opacity-60`}
          value={value}
          disabled={disabled}
          inputMode="decimal"
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="text-[12px] text-ink-3">cm</span>
      </span>
      {hint && <span className="text-[11.5px] text-ink-3">{hint}</span>}
    </label>
  );
}

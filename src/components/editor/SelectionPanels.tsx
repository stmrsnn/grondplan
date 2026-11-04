"use client";

import { FlipHorizontal2, FlipVertical2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Toggle } from "@/components/ui/Field";
import { TermHelp } from "@/components/ui/Help";
import type { EditorStore } from "@/lib/editor/store";
import { formatArea, formatMeters } from "@/lib/format";
import { useState } from "react";
import {
  floorAreas,
  setWallThickness,
  FLOOR_FINISHES,
  functionLabel,
  ROOM_FUNCTIONS,
  type FloorAnalysis,
  type RoomInfo,
} from "@/lib/geometry/plan";
import { editFloor, updateRoom, updateWall } from "@/lib/model/commands";
import type { Floor, ProjectDoc } from "@/lib/model/types";
import { W } from "@/lib/words";
import { LengthField } from "./LengthField";
import {
  cornerGaps,
  OPENING_LABEL,
  openingDefaults,
  updateOpening,
  wallFrame,
  widthsFor,
} from "@/lib/geometry/openings";
import type { OpeningKind } from "@/lib/model/types";
import type { Selection } from "./PlanLayers";

const selectCls =
  "h-10 rounded-[var(--radius-control)] border border-line bg-bg px-3 text-sm text-ink hover:border-line-strong focus:border-accent focus:outline-none";

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="flex flex-col rounded-[var(--radius-control)] bg-surface-2 px-3 py-2">
      <span className="text-[12px] text-ink-3">{label}</span>
      <span className={`tabular font-semibold text-ink ${big ? "text-xl" : "text-sm"}`}>{value}</span>
    </div>
  );
}

function perimeter(r: RoomInfo): number {
  return r.inner.reduce((sum, p, i) => {
    const q = r.inner[(i + 1) % r.inner.length];
    return sum + Math.hypot(q.x - p.x, q.y - p.y);
  }, 0);
}

/** Binnenmaten van een rechthoekige ruimte, anders null. */
function rectDims(r: RoomInfo): [number, number] | null {
  if (r.inner.length !== 4) return null;
  const xs = r.inner.map((p) => p.x);
  const ys = r.inner.map((p) => p.y);
  const axis = r.inner.every((p, i) => {
    const q = r.inner[(i + 1) % 4];
    return Math.abs(p.x - q.x) < 1 || Math.abs(p.y - q.y) < 1;
  });
  if (!axis) return null;
  return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
}

export function SelectionPanel({
  store,
  floor,
  selection,
  analysis,
  onDelete,
}: {
  store: EditorStore;
  doc: ProjectDoc;
  floor: Floor;
  selection: NonNullable<Selection>;
  analysis: FloorAnalysis;
  onDelete: () => void;
}) {
  const commit = (cmd: Parameters<EditorStore["execute"]>[0]) => {
    store.execute(cmd);
    store.seal();
  };

  if (selection.kind === "room") {
    const info = analysis.rooms.find((r) => r.room.id === selection.id);
    const room = floor.rooms.find((r) => r.id === selection.id);
    if (!room || !info) return <p className="text-sm text-ink-3">Deze ruimte bestaat niet meer.</p>;
    const dims = rectDims(info);
    const isDefaultName = /^Ruimte \d+$/.test(room.name) || room.name === functionLabel(room.function);
    return (
      <section className="flex flex-col gap-4">
        <h3 className="text-sm font-semibold">Ruimte</h3>
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <Stat label="Netto vloeroppervlakte" value={formatArea(info.area)} big />
          </div>
          {dims && (
            <div className="col-span-2">
              <Stat label="Binnenmaten" value={`${formatMeters(dims[0])} × ${formatMeters(dims[1])}`} />
            </div>
          )}
          <div className="col-span-2">
            <Stat label="Omtrek (bv. voor plinten)" value={formatMeters(perimeter(info))} />
          </div>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-2">Wat voor ruimte?</span>
          <select
            className={selectCls}
            value={room.function}
            onChange={(e) => {
              const fn = e.target.value;
              const to: { function: string; name?: string } = { function: fn };
              if (isDefaultName) to.name = fn === "andere" ? room.name : functionLabel(fn);
              commit(updateRoom(floor.id, room.id, { function: room.function, name: room.name }, to));
            }}
          >
            {ROOM_FUNCTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <Field
          label="Naam"
          value={room.name}
          maxLength={60}
          onChange={(e) => store.execute(updateRoom(floor.id, room.id, { name: room.name }, { name: e.target.value }))}
          onBlur={(e) => {
            store.seal();
            if (!e.target.value.trim()) commit(updateRoom(floor.id, room.id, { name: "" }, { name: functionLabel(room.function) }));
          }}
        />
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-2">Vloer</span>
          <select
            className={selectCls}
            value={room.floorFinish}
            onChange={(e) =>
              commit(updateRoom(floor.id, room.id, { floorFinish: room.floorFinish }, { floorFinish: e.target.value }))
            }
          >
            {FLOOR_FINISHES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <p className="text-[12px] leading-relaxed text-ink-3">
          Een maat aanpassen? Klik op een maat in het plan en typ de nieuwe. De muur ernaast schuift
          mee, de rest van het plan ook.
        </p>
        <Button size="sm" variant="ghost" icon={<Trash2 size={16} />} className="self-start text-danger! hover:text-danger!" onClick={onDelete}>
          Ruimte {W.remove.toLowerCase()}
        </Button>
      </section>
    );
  }

  if (selection.kind === "opening") {
    return <OpeningPanel store={store} floor={floor} openingId={selection.id} onDelete={onDelete} />;
  }

  if (selection.kind === "wall") {
    return <WallPanel store={store} floor={floor} wallId={selection.id} analysis={analysis} onDelete={onDelete} />;
  }

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">Hoek</h3>
      <p className="text-[13px] leading-relaxed text-ink-2">
        Sleep de hoek naar een andere plaats, of verschuif hem met de pijltjestoetsen (5 cm per
        druk, met Shift 50 cm). De muren eraan schuiven mee.
      </p>
      <Button size="sm" variant="ghost" icon={<Trash2 size={16} />} className="self-start text-danger! hover:text-danger!" onClick={onDelete}>
        Hoek en muren {W.remove.toLowerCase()}
      </Button>
    </section>
  );
}


/** Oppervlaktes: per ruimte, per verdieping en voor de hele woning. */
export function Overview({
  doc,
  floor,
  analysis,
  onSelect,
}: {
  doc: ProjectDoc;
  floor: Floor;
  analysis: FloorAnalysis;
  onSelect: (s: Selection) => void;
}) {
  const totals = doc.floors.reduce(
    (acc, f) => {
      const a = floorAreas(f);
      return { total: acc.total + a.total, habitable: acc.habitable + a.habitable };
    },
    { total: 0, habitable: 0 },
  );
  const here = floorAreas(floor);
  const rooms = [...analysis.rooms].sort((a, b) => b.area - a.area);
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-1">
        <h3 className="text-sm font-semibold">Oppervlakte</h3>
        <TermHelp term="Netto vloeroppervlakte">
          <p>
            De oppervlakte die je echt kan gebruiken: de vloer binnen de muren, zonder de muren
            zelf. Dit is wat je zelf zou meten met een rolmeter.
          </p>
          <p>
            Een makelaar of architect geeft soms de bruto oppervlakte op, mét de muren. Die is
            groter.
          </p>
        </TermHelp>
      </div>
      {rooms.length === 0 ? (
        <p className="rounded-[var(--radius-control)] bg-surface-2 px-3 py-2.5 text-[13px] leading-relaxed text-ink-2">
          Nog geen ruimtes op {floor.name.toLowerCase()}. Kies <strong className="text-ink">Kamer</strong> (K)
          links en sleep een rechthoek, of typ de maten, bijvoorbeeld 4x3.
        </p>
      ) : (
        <ul className="flex flex-col overflow-hidden rounded-[var(--radius-control)] border border-line">
          {rooms.map((r) => (
            <li key={r.room.id}>
              <button
                type="button"
                onClick={() => onSelect({ kind: "room", id: r.room.id })}
                className="flex w-full items-center justify-between gap-2 border-b border-line px-3 py-2 text-left text-[13px] hover:bg-surface-2"
              >
                <span className="truncate text-ink">{r.room.name}</span>
                <span className="tabular shrink-0 text-ink-2">{formatArea(r.area)}</span>
              </button>
            </li>
          ))}
          <li className="flex items-center justify-between bg-surface px-3 py-2 text-[13px]">
            <span className="font-medium text-ink">{floor.name}</span>
            <span className="tabular font-semibold text-ink">{formatArea(here.total)}</span>
          </li>
        </ul>
      )}
      {totals.total > 0 && (
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 px-1 text-[13px]">
          <dt className="flex items-center gap-1 text-ink-2">
            Bewoonbare oppervlakte
            <TermHelp term="Bewoonbare oppervlakte">
              <p>
                Wat je in België meestal als woonoppervlakte opgeeft: alle ruimtes behalve garage,
                berging, technische ruimte en kelder. De muren tellen niet mee.
              </p>
              <p>Dit is een richtwaarde. Voor een verkoop of vergunning geldt de officiële meting.</p>
            </TermHelp>
          </dt>
          <dd className="tabular text-right font-semibold text-ink">{formatArea(totals.habitable)}</dd>
          <dt className="text-ink-2">Totaal netto{doc.floors.length > 1 ? ", hele woning" : ""}</dt>
          <dd className="tabular text-right text-ink">{formatArea(totals.total)}</dd>
        </dl>
      )}
    </section>
  );
}

function WallPanel({
  store,
  floor,
  wallId,
  analysis,
  onDelete,
}: {
  store: EditorStore;
  floor: Floor;
  wallId: string;
  analysis: FloorAnalysis;
  onDelete: () => void;
}) {
  const commit = (cmd: Parameters<EditorStore["execute"]>[0]) => {
    store.execute(cmd);
    store.seal();
  };
  const wall = floor.walls.find((w) => w.id === wallId);
  const sides = analysis.rooms
    .map((r) => {
      const i = r.edgeWalls.indexOf(wallId);
      if (i < 0) return null;
      const p = r.inner[i];
      const q = r.inner[(i + 1) % r.inner.length];
      return { id: r.room.id, name: r.room.name, len: Math.hypot(q.x - p.x, q.y - p.y) };
    })
    .filter((x): x is { id: string; name: string; len: number } => x !== null);
  const [anchor, setAnchor] = useState<string>(sides[0]?.id ?? "");
  if (!wall) return <p className="text-sm text-ink-3">Deze muur bestaat niet meer.</p>;
  const a = floor.nodes.find((n) => n.id === wall.start);
  const b = floor.nodes.find((n) => n.id === wall.end);
  const len = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
  const defaults = store.getState().doc.settings.wallDefaults;
  const anchorId = sides.some((sd) => sd.id === anchor) ? anchor : "";
  const setThickness = (t: number) => {
    if (t === wall.thickness) return;
    const after = setWallThickness(floor, [wall.id], t, anchorId || null);
    commit(
      editFloor(
        floor,
        anchorId ? after : { ...floor, walls: floor.walls.map((w) => (w.id === wall.id ? { ...w, thickness: t } : w)) },
        "Muurdikte aangepast",
        "Muur: vorige dikte teruggezet",
        "Muur: nieuwe dikte opnieuw toegepast",
      ),
    );
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Muur</h3>
        <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[12px] text-ink-2">
          {wall.kind === "exterior" ? "Buitenmuur" : "Binnenmuur"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {sides.length > 0 ? (
          sides.map((sd) => <Stat key={sd.id} label={`Lengte in ${sd.name}`} value={formatMeters(sd.len)} />)
        ) : (
          <Stat label="Lengte" value={formatMeters(len)} />
        )}
      </div>
      <LengthField
        label="Dikte"
        value={wall.thickness}
        min={50}
        max={700}
        hint={
          <span className="inline-flex flex-wrap gap-1.5">
            {(
              [
                ["Binnenmuur", defaults.interior],
                ["Buitenmuur", defaults.exterior],
              ] as const
            ).map(([l, t]) => (
              <button
                key={l}
                type="button"
                className="rounded-full border border-line px-2 py-0.5 hover:border-accent hover:text-accent-ink"
                onClick={() => setThickness(t)}
              >
                {l} {formatMeters(t)}
              </button>
            ))}
          </span>
        }
        onCommit={setThickness}
      />
      {sides.length > 0 && (
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-2">Bij een andere dikte: maat behouden van</span>
          <select className={selectCls} value={anchorId} onChange={(e) => setAnchor(e.target.value)}>
            {sides.map((sd) => (
              <option key={sd.id} value={sd.id}>
                {sd.name}
              </option>
            ))}
            <option value="">Geen: de muur blijft in het midden</option>
          </select>
        </label>
      )}
      <LengthField
        label="Hoogte"
        value={wall.height}
        min={300}
        max={8000}
        hint="Volgt de plafondhoogte, tenzij je ze hier aanpast"
        onCommit={(mm) => commit(updateWall(floor.id, wall.id, { height: wall.height }, { height: mm }, "hoogte"))}
      />
      <div className="flex items-start gap-1">
        <div className="flex-1">
          <Toggle
            label="Dragende muur"
            hint="Draagt vloeren of het dak. Niet zomaar weghalen."
            checked={wall.loadBearing}
            onChange={(v) =>
              commit(updateWall(floor.id, wall.id, { loadBearing: wall.loadBearing }, { loadBearing: v }, "draagfunctie"))
            }
          />
        </div>
        <TermHelp term="Dragende muur">
          <p>
            Een dragende muur houdt een vloer of het dak omhoog. Zo&apos;n muur wegnemen of er een
            grote opening in maken kan enkel met een stalen balk of lateibalk, berekend door een
            ingenieur of architect.
          </p>
          <p>Twijfel je? Laat het nakijken voor je gaat breken.</p>
          <svg viewBox="0 0 220 90" className="w-full max-w-[260px]" aria-hidden="true">
            <rect x="20" y="14" width="180" height="8" fill="var(--text-3)" />
            <rect x="40" y="22" width="12" height="60" fill="var(--text)" />
            <rect x="168" y="22" width="12" height="60" fill="var(--text)" />
            <rect x="104" y="22" width="6" height="60" fill="var(--text-3)" opacity="0.5" />
            <text x="46" y="88" textAnchor="middle" fontSize="9" fill="var(--text)">dragend</text>
            <text x="107" y="88" textAnchor="middle" fontSize="9" fill="var(--text-3)">niet</text>
          </svg>
        </TermHelp>
      </div>
      <Button size="sm" variant="ghost" icon={<Trash2 size={16} />} className="self-start text-danger! hover:text-danger!" onClick={onDelete}>
        Muur {W.remove.toLowerCase()}
      </Button>
    </section>
  );
}

function OpeningPanel({
  store,
  floor,
  openingId,
  onDelete,
}: {
  store: EditorStore;
  floor: Floor;
  openingId: string;
  onDelete: () => void;
}) {
  const o = floor.openings.find((x) => x.id === openingId);
  const frame = o ? wallFrame(floor, o.wall) : null;
  if (!o || !frame) return <p className="text-sm text-ink-3">Deze opening bestaat niet meer.</p>;
  const label = OPENING_LABEL[o.kind];
  const apply = (patch: Partial<typeof o>, what: string): string | void => {
    const after = updateOpening(floor, o.id, patch);
    if (!after) return "Past niet in deze muur";
    store.execute(editFloor(floor, after, `${label}: ${what} aangepast`, `${label}: vorige ${what} teruggezet`, `${label}: ${what} opnieuw aangepast`));
    store.seal();
  };
  const gaps = cornerGaps(frame, o.offset, o.width);
  // in woorden: welke kant is het begin van de muur, zoals je het plan bekijkt
  const horizontal = Math.abs(frame.d.x) >= Math.abs(frame.d.y);
  const [startWord, endWord] = horizontal
    ? frame.d.x > 0 ? ["links", "rechts"] : ["rechts", "links"]
    : frame.d.y > 0 ? ["boven", "onder"] : ["onder", "boven"];
  const swing = o.swing ?? { side: "left" as const, hinge: "start" as const };
  const setKind = (kind: OpeningKind) => {
    if (kind === o.kind) return;
    const def = openingDefaults(kind, frame.wall.kind);
    apply({ kind, height: def.height, sillHeight: def.sillHeight, width: kind === "window" || o.kind === "window" ? def.width : o.width }, "soort");
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{label}</h3>
        <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[12px] text-ink-2">
          In een {frame.wall.kind === "exterior" ? "buitenmuur" : "binnenmuur"}
        </span>
      </div>
      <div className="flex rounded-[var(--radius-control)] bg-surface-2 p-0.5 text-[13px]" role="radiogroup" aria-label="Soort opening">
        {(["door", "window", "passage"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={o.kind === k}
            onClick={() => setKind(k)}
            className={`h-8 flex-1 rounded-[6px] px-2 ${o.kind === k ? "border border-line bg-bg font-medium text-ink" : "text-ink-3 hover:text-ink"}`}
          >
            {OPENING_LABEL[k]}
          </button>
        ))}
      </div>
      <LengthField
        label="Breedte"
        value={o.width}
        min={300}
        max={6000}
        hint={
          <span className="inline-flex flex-wrap gap-1.5">
            {widthsFor(o.kind).map((w) => (
              <button
                key={w}
                type="button"
                className={`tabular rounded-full border px-2 py-0.5 ${w === o.width ? "border-accent text-accent-ink" : "border-line hover:border-accent hover:text-accent-ink"}`}
                onClick={() => apply({ width: w }, "breedte")}
              >
                {Math.round(w / 10)} cm
              </button>
            ))}
          </span>
        }
        onCommit={(mm) => apply({ width: mm }, "breedte")}
      />
      <div className="grid grid-cols-2 gap-2">
        {/* links of boven altijd eerst, zoals je het plan leest */}
        {(() => {
          const startField = (
            <LengthField key="s" label={`Tot de hoek ${startWord}`} value={gaps.start} min={0} max={frame.len} onCommit={(mm) => apply({ offset: o.offset + (mm - gaps.start) }, "plaats")} />
          );
          const endField = (
            <LengthField key="e" label={`Tot de hoek ${endWord}`} value={gaps.end} min={0} max={frame.len} onCommit={(mm) => apply({ offset: o.offset - (mm - gaps.end) }, "plaats")} />
          );
          return startWord === "links" || startWord === "boven" ? [startField, endField] : [endField, startField];
        })()}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <LengthField label="Hoogte" value={o.height} min={300} max={4000} onCommit={(mm) => apply({ height: mm }, "hoogte")} />
        {o.kind === "window" && (
          <LengthField
            label="Borstwering"
            value={o.sillHeight}
            min={0}
            max={3000}
            hint="Van de vloer tot onder het raam"
            onCommit={(mm) => apply({ sillHeight: mm }, "borstwering")}
          />
        )}
      </div>
      {o.kind === "door" && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-2">Draairichting</span>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              icon={<FlipVertical2 size={16} />}
              onClick={() => apply({ swing: { ...swing, side: swing.side === "left" ? "right" : "left" } }, "draairichting")}
            >
              Andere kant opendraaien
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={<FlipHorizontal2 size={16} />}
              onClick={() => apply({ swing: { ...swing, hinge: swing.hinge === "start" ? "end" : "start" } }, "scharnierkant")}
            >
              Scharnieren andere kant
            </Button>
          </div>
        </div>
      )}
      <Button size="sm" variant="ghost" icon={<Trash2 size={16} />} className="self-start text-danger! hover:text-danger!" onClick={onDelete}>
        {label} {W.remove.toLowerCase()}
      </Button>
    </section>
  );
}

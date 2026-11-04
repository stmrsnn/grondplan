"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EditorStore } from "@/lib/editor/store";
import { snapPoint, type SnapResult } from "@/lib/editor/snap";
import type { Viewport } from "@/lib/editor/viewport";
import { formatMeters, parseLength } from "@/lib/format";
import {
  addPolyline,
  analyzeFloor,
  moveNodes,
  ownWalls,
  pointInPolygon,
  rebuildFloor,
  placeRoom,
  createsCrossing,
  roomFits,
  snapRoomRect,
  wallBodyLine,
  removeWalls,
  wallPolygons,
  type WallProps,
} from "@/lib/geometry/plan";
import {
  addOpening,
  cornerGaps,
  fitOffset,
  hitOpening,
  choiceProps,
  CHOICES,
  openingName,
  roomSide,
  type OpeningChoice,
  projectOnWall,
  removeOpening,
  snapOffset,
  updateOpening,
  wallFrame,
} from "@/lib/geometry/openings";
import { closestOnSegment, distance, dot, snapValue, type Vec } from "@/lib/geometry/vec";
import { editFloor } from "@/lib/model/commands";
import type { Floor, Id, Opening, ProjectDoc } from "@/lib/model/types";
import type { ToolPointerEvent } from "./PlanCanvas";
import type { Selection } from "./PlanLayers";

export type Tool = "select" | "wall" | "room" | "door" | "window";

/** Standaardkamer om te "stempelen": binnenmaten in mm en de functie. */
export interface RoomTemplate {
  label: string;
  w: number;
  d: number;
  fn: string;
}

export const ROOM_TEMPLATES: RoomTemplate[] = [
  { label: "Living", w: 6000, d: 4500, fn: "living" },
  { label: "Keuken", w: 3500, d: 3000, fn: "keuken" },
  { label: "Slaapkamer", w: 3500, d: 3000, fn: "slaapkamer" },
  { label: "Kinderkamer", w: 3000, d: 3000, fn: "slaapkamer" },
  { label: "Badkamer", w: 2500, d: 2000, fn: "badkamer" },
  { label: "Toilet", w: 1000, d: 1500, fn: "toilet" },
  { label: "Berging", w: 2000, d: 1500, fn: "berging" },
];
export type WallChoice = "exterior" | "interior";

export interface ToolPreview {
  snap: SnapResult | null;
  /** Muur in aanbouw: punten van de ketting + het zwevende punt. */
  chain: Vec[] | null;
  /** Kamer in aanbouw: twee hoeken (hartlijnen); `bad` = past hier niet. */
  rect: { a: Vec; b: Vec; bad?: boolean } | null;
  /** Tekst bij de cursor, bv. "3,25 m" of "4,00 × 3,00 m". */
  chip: { at: Vec; text: string } | null;
  /** Deur of raam dat geplaatst zou worden. */
  opening?: Opening | null;
}

const EMPTY: ToolPreview = { snap: null, chain: null, rect: null, chip: null };

/** Wat ligt onder de muis? Hoek, dan muur, dan ruimte. */
export function hitTest(floor: Floor, p: Vec, zoom: number): Selection {
  const tol = 8 / zoom;
  for (const n of floor.nodes) if (distance(n, p) < tol) {
    // enkel hoeken van muren, niet elk tussenpunt van een rechte muur
    return { kind: "node", id: n.id };
  }
  const o = hitOpening(floor, p, 4 / zoom);
  if (o) return { kind: "opening", id: o.id };
  const byId = new Map(floor.nodes.map((n) => [n.id, n]));
  let best: { id: Id; d: number } | null = null;
  for (const w of floor.walls) {
    const a = byId.get(w.start);
    const b = byId.get(w.end);
    if (!a || !b) continue;
    const [ba, bb] = wallBodyLine(w, a, b);
    const c = closestOnSegment(p, ba, bb);
    if (c.dist < w.thickness / 2 + 4 / zoom && (!best || c.dist < best.d)) best = { id: w.id, d: c.dist };
  }
  if (best) return { kind: "wall", id: best.id };
  for (const r of analyzeFloor(floor).rooms) if (pointInPolygon(p, r.inner)) return { kind: "room", id: r.room.id };
  return null;
}

/** "6x4,5", "6 x 4,5", "6*4.5" → [6000, 4500] in mm (binnenmaten). */
export function parseDims(s: string): [number, number] | null {
  const parts = s.toLowerCase().split(/\s*[x×*]\s*|\s+/).filter(Boolean);
  if (parts.length !== 2) return null;
  const a = parseLength(parts[0]);
  const b = parseLength(parts[1]);
  return a && b && a > 0 && b > 0 ? [a, b] : null;
}

interface Args {
  store: EditorStore;
  doc: ProjectDoc;
  floor: Floor;
  view: Viewport | null;
  selection: Selection;
  setSelection: (s: Selection) => void;
  toast: (m: string) => void;
}

export function usePlanTools({ store, doc, floor, view, selection, setSelection, toast }: Args) {
  const [tool, setToolState] = useState<Tool>("select");
  const [wallChoice, setWallChoice] = useState<WallChoice | null>(null);
  const [preview, setPreview] = useState<ToolPreview>(EMPTY);
  const [draft, setDraftState] = useState<Floor | null>(null);
  const draftRef = useRef<Floor | null>(null);
  const setDraft = useCallback((f: Floor | null) => {
    draftRef.current = f;
    setDraftState(f);
  }, []);
  const [hover, setHover] = useState<Selection>(null);
  const [buffer, setBuffer] = useState("");
  const [template, setTemplateState] = useState<RoomTemplate | null>(null);
  /** Gekozen soort en breedte bij het deur- en raamgereedschap (null = vanzelf). */
  const [openingChoice, setOpeningChoice] = useState<{ door: OpeningChoice; window: OpeningChoice }>({
    door: "single",
    window: "window",
  });
  const [openingWidth, setOpeningWidth] = useState<Partial<Record<OpeningChoice, number>>>({});
  /** Net getekende kamer: daar tonen we meteen de functieknoppen. */
  const [justDrawn, setJustDrawn] = useState<Id | null>(null);

  const chain = useRef<Vec[] | null>(null);
  const roomStart = useRef<Vec | null>(null);
  const roomDragged = useRef(false);
  const drag = useRef<{ kind: "node" | "wall" | "opening"; id: Id; start: Vec; base: Floor; moved: boolean } | null>(null);
  const lastCursor = useRef<Vec | null>(null);

  const s = doc.settings;
  const grid = s.snapToGrid ? s.gridSize : null;
  const effectiveWall: WallChoice = wallChoice ?? (floor.rooms.length > 0 ? "interior" : "exterior");
  const wallProps = (kind: WallChoice): WallProps => ({
    thickness: kind === "exterior" ? s.wallDefaults.exterior : s.wallDefaults.interior,
    height: floor.height,
    kind,
    loadBearing: kind === "exterior",
  });

  const reset = useCallback(() => {
    chain.current = null;
    roomStart.current = null;
    drag.current = null;
    setDraft(null);
    setPreview(EMPTY);
    setBuffer("");
  }, [setDraft]);

  const setTool = useCallback(
    (t: Tool) => {
      reset();
      setToolState(t);
      setTemplateState(null);
      setJustDrawn(null);
      if (t !== "select") setSelection(null);
    },
    [reset, setSelection],
  );

  const setTemplate = useCallback(
    (tp: RoomTemplate | null) => {
      reset();
      setToolState("room");
      setTemplateState((cur) => (tp && cur?.label === tp.label ? null : tp));
    },
    [reset],
  );

  // een andere verdieping of ongedaan maken: lopende tekenhandeling stoppen
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tekenstatus hoort bij deze verdieping
    reset();
  }, [floor.id, reset]);

  const commit = useCallback(
    (after: Floor, label: string, undo?: string, redo?: string) => {
      store.execute(editFloor(floor, after, label, undo, redo));
      store.seal();
    },
    [store, floor],
  );

  const snap = useCallback(
    (p: Vec, opts: { from?: Vec; free?: boolean; ignore?: Set<Id> } = {}) =>
      snapPoint(p, { nodes: floor.nodes, walls: floor.walls, zoom: view?.zoom ?? 0.1, grid, ...opts }),
    [floor, view, grid],
  );

  /* ---------------- muren ---------------- */

  const addSegment = useCallback(
    (to: Vec, sr: SnapResult | null): boolean => {
      const pts = chain.current;
      if (!pts || pts.length === 0) {
        chain.current = [to];
        return false;
      }
      const from = pts[pts.length - 1];
      if (distance(from, to) < 10) return false;
      const after = addPolyline(floor, [from, to], wallProps(effectiveWall));
      commit(after, "Muur getekend", "Muur weer weggehaald", "Muur terug getekend");
      pts.push(to);
      // tegen een bestaande hoek of muur, of terug bij het begin: ketting klaar
      const closed = distance(to, pts[0]) < 1 && pts.length > 2;
      if (closed || (sr && (sr.kind === "node" || sr.kind === "wall") && pts.length >= 2)) {
        chain.current = null;
        setPreview(EMPTY);
        return true;
      }
      return false;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [floor, commit, effectiveWall, s.wallDefaults],
  );

  const wallPreview = useCallback(
    (raw: Vec, free: boolean) => {
      const pts = chain.current;
      const from = pts?.[pts.length - 1];
      const sr = snap(raw, { from, free });
      const len = from ? distance(from, sr.p) : 0;
      setPreview({
        snap: sr,
        chain: pts ? [...pts, sr.p] : null,
        rect: null,
        chip: from && len > 0 ? { at: sr.p, text: formatMeters(len) } : null,
      });
      return sr;
    },
    [snap],
  );

  /* ---------------- kamers ---------------- */

  const innerChip = useCallback(
    (a: Vec, b: Vec) => {
      const t = s.wallDefaults.exterior;
      const w = Math.abs(b.x - a.x) - t;
      const h = Math.abs(b.y - a.y) - t;
      return w > 0 && h > 0 ? `${formatMeters(w)} × ${formatMeters(h)}` : "";
    },
    [s.wallDefaults.exterior],
  );

  const commitRoom = useCallback(
    (a0: Vec, b0: Vec, preset?: RoomTemplate, mode: "move" | "resize" = "move") => {
      // net naast een bestaande muur? dan er exact tegenaan
      const { a, b } = snapRoomRect(floor, a0, b0, mode, s.wallDefaults.exterior + 300);
      if (!roomFits(floor, a, b, s.wallDefaults.exterior)) {
        toast("Die kamer valt half over een andere kamer. Zet ze ernaast, of helemaal binnen een kamer om die op te delen.");
        return;
      }
      if (Math.abs(b.x - a.x) < 500 || Math.abs(b.y - a.y) < 500) {
        toast("Die kamer is te klein. Sleep een grotere rechthoek of typ de maten, bv. 4x3.");
        return;
      }
      // binnenmaten blijven exact; gedeelde muren worden binnenmuren, de buren blijven even groot
      const placed = placeRoom(floor, a, b, wallProps("exterior"), s.wallDefaults.interior);
      let after = placed.floor;
      const fresh = placed.roomId ? after.rooms.find((r) => r.id === placed.roomId) : undefined;
      if (fresh && preset) {
        const id = fresh.id;
        after = { ...after, rooms: after.rooms.map((r) => (r.id === id ? { ...r, name: preset.label, function: preset.fn } : r)) };
      }
      commit(after, preset ? `${preset.label} getekend` : "Kamer getekend", "Kamer weer weggehaald", "Kamer terug getekend");
      if (fresh) {
        setSelection({ kind: "room", id: fresh.id });
        if (!preset) setJustDrawn(fresh.id);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [floor, commit, toast, setSelection, s.wallDefaults],
  );

  /* ---------------- getypte maten ---------------- */

  const applyBuffer = useCallback((): boolean => {
    const text = buffer.trim();
    if (!text) return false;
    if (tool === "wall") {
      const pts = chain.current;
      const L = parseLength(text);
      if (!pts || !L) {
        toast(pts ? "Typ een lengte, bijvoorbeeld 3,25" : "Klik eerst waar de muur begint");
        return true;
      }
      const from = pts[pts.length - 1];
      const cursor = preview.snap?.p ?? lastCursor.current;
      let dir = cursor ? { x: cursor.x - from.x, y: cursor.y - from.y } : { x: 1, y: 0 };
      const dl = Math.hypot(dir.x, dir.y);
      dir = dl > 0 ? { x: dir.x / dl, y: dir.y / dl } : { x: 1, y: 0 };
      const to = { x: Math.round(from.x + dir.x * L), y: Math.round(from.y + dir.y * L) };
      addSegment(to, null);
      setBuffer("");
      if (chain.current) wallPreview(to, false);
      return true;
    }
    if (tool === "room") {
      const dims = parseDims(text);
      const a = roomStart.current;
      if (!dims) {
        toast("Typ breedte en diepte, bijvoorbeeld 4x3 of 4,5x3,2");
        return true;
      }
      if (!a) {
        toast("Klik eerst waar de kamer begint, typ dan de maten");
        return true;
      }
      const cursor = lastCursor.current ?? { x: a.x + 1, y: a.y + 1 };
      const sx = cursor.x >= a.x ? 1 : -1;
      const sy = cursor.y >= a.y ? 1 : -1;
      const t = s.wallDefaults.exterior;
      // binnenmaten + muurdikte = hartlijnen
      const b = { x: a.x + sx * (dims[0] + t), y: a.y + sy * (dims[1] + t) };
      commitRoom(a, b);
      roomStart.current = null;
      setPreview(EMPTY);
      setBuffer("");
      return true;
    }
    return false;
  }, [buffer, tool, preview.snap, toast, addSegment, wallPreview, commitRoom, s.wallDefaults.exterior]);

  /* ---------------- deuren en ramen ---------------- */

  /** Waar zou een nieuwe deur of nieuw raam komen bij deze cursor? */
  const openingAt = useCallback(
    (p: Vec, choice: OpeningChoice, zoom: number): Opening | null => {
      const hit = projectOnWall(floor, p, 14 / zoom);
      if (!hit) return null;
      const { frame } = hit;
      const def = choiceProps(choice, frame.wall.kind);
      const width = openingWidth[choice] ?? def.width;
      const offset = fitOffset(floor, frame, width, snapOffset(frame, width, hit.along, grid ?? 50));
      if (offset === null) return null;
      const gaps = cornerGaps(frame, offset, width);
      // een buitendeur draait naar binnen, een binnendeur naar de kant van de cursor;
      // scharnieren aan de dichtste hoek, zodat de deur tegen de muur openslaat
      const side = frame.wall.kind === "exterior" ? (roomSide(floor, frame) ?? hit.side) : hit.side;
      return {
        id: "nieuw",
        wall: frame.wall.id,
        ...def,
        offset,
        width,
        swing: { side, hinge: gaps.start <= gaps.end ? "start" : "end" },
      };
    },
    [floor, openingWidth, grid],
  );

  /* ---------------- aanwijzer ---------------- */

  const onTool = useCallback(
    (e: ToolPointerEvent): boolean => {
      if (!view) return false;
      const zoom = view.zoom;
      lastCursor.current = e.world;

      if (tool === "door" || tool === "window") {
        const choice = tool === "window" ? openingChoice.window : openingChoice.door;
        const label = CHOICES[choice].label;
        if (e.phase === "hover" || e.phase === "move" || e.phase === "down") {
          const o = openingAt(e.world, choice, zoom);
          setPreview({ snap: null, chain: null, rect: null, chip: null, opening: o });
          return true;
        }
        if (e.phase === "up") {
          const o = openingAt(e.world, choice, zoom);
          if (!o) {
            toast(projectOnWall(floor, e.world, 14 / zoom) ? "Hier past dat niet: de muur is te kort of er zit al iets." : `Klik op een muur om een ${label.toLowerCase()} te plaatsen.`);
            return true;
          }
          const id = globalThis.crypto.randomUUID();
          const after = addOpening(floor, o, id);
          if (after) {
            commit(after, `${label} geplaatst`, `${label} weer weggehaald`, `${label} terug geplaatst`);
            setPreview(EMPTY);
          }
          return true;
        }
        if (e.phase === "cancel") {
          setPreview(EMPTY);
          return true;
        }
        return false;
      }

      if (tool === "wall") {
        if (e.phase === "hover" || e.phase === "move" || e.phase === "down") {
          wallPreview(e.world, e.shift || e.alt);
          return true;
        }
        if (e.phase === "up") {
          const sr = wallPreview(e.world, e.shift || e.alt);
          const done = addSegment(sr.p, sr);
          if (!done && chain.current) wallPreview(e.world, e.shift || e.alt);
          return true;
        }
        if (e.phase === "dblclick" || e.phase === "cancel") {
          chain.current = null;
          setPreview(EMPTY);
          return true;
        }
        return false;
      }

      if (tool === "room" && template) {
        const t = s.wallDefaults.exterior;
        const a = snap(e.world).p;
        const b = { x: a.x + template.w + t, y: a.y + template.d + t };
        if (e.phase === "hover" || e.phase === "move" || e.phase === "down") {
          const r0 = snapRoomRect(floor, a, b, "move", t + 300);
          const r = { ...r0, bad: !roomFits(floor, r0.a, r0.b, t) };
          setPreview({ snap: snap(e.world), chain: null, rect: r, chip: { at: r.b, text: r.bad ? "Valt over een kamer" : `${template.label} · ${formatMeters(template.w)} × ${formatMeters(template.d)}` } });
          return true;
        }
        if (e.phase === "up") {
          commitRoom(a, b, template);
          return true;
        }
        if (e.phase === "cancel") {
          setPreview(EMPTY);
          return true;
        }
        return false;
      }

      if (tool === "room") {
        if (e.phase === "down") {
          if (!roomStart.current) {
            roomStart.current = snap(e.world).p;
            roomDragged.current = false;
          }
          return true;
        }
        if (e.phase === "hover" || e.phase === "move") {
          const sr = snap(e.world);
          const a = roomStart.current;
          if (a && e.phase === "move" && distance(a, sr.p) * zoom > 6) roomDragged.current = true;
          setPreview({
            snap: sr,
            chain: null,
            rect: a
              ? (() => {
                  const r0 = snapRoomRect(floor, a, sr.p, "resize", s.wallDefaults.exterior + 300);
                  return { ...r0, bad: !roomFits(floor, r0.a, r0.b, s.wallDefaults.exterior) };
                })()
              : null,
            chip: a ? { at: sr.p, text: innerChip(a, sr.p) } : null,
          });
          return true;
        }
        if (e.phase === "up") {
          const a = roomStart.current;
          const b = snap(e.world).p;
          if (a && (roomDragged.current || distance(a, b) * zoom > 6)) {
            if (roomDragged.current || preview.rect) {
              commitRoom(a, b, undefined, "resize");
              roomStart.current = null;
              setPreview({ snap: snap(e.world), chain: null, rect: null, chip: null });
            }
          }
          return true;
        }
        if (e.phase === "cancel") {
          roomStart.current = null;
          setPreview(EMPTY);
          return true;
        }
        return false;
      }

      // selecteren en verslepen
      if (e.phase === "hover") {
        setHover(hitTest(floor, e.world, zoom));
        return false;
      }
      if (e.phase === "click") {
        setSelection(hitTest(floor, e.world, zoom));
        return true;
      }
      if (e.phase === "down") {
        const hit = hitTest(floor, e.world, zoom);
        if (hit && (hit.kind === "node" || hit.kind === "wall" || hit.kind === "opening")) {
          drag.current = { kind: hit.kind, id: hit.id, start: e.world, base: floor, moved: false };
          setSelection(hit);
          return true;
        }
        return false;
      }
      const d = drag.current;
      if (!d) return false;
      if (e.phase === "move") {
        if (!d.moved && distance(d.start, e.world) * zoom < 4) return true;
        d.moved = true;
        if (d.kind === "opening") {
          // langs de muur schuiven, of naar een andere muur
          const cur = d.base.openings.find((x) => x.id === d.id);
          if (!cur) return true;
          const hit = projectOnWall(d.base, e.world, 30 / zoom);
          const frame = hit?.frame ?? wallFrame(d.base, cur.wall);
          if (!frame) return true;
          const along = hit ? hit.along : dot({ x: e.world.x - frame.a.x, y: e.world.y - frame.a.y }, frame.d);
          const wall = frame.wall.id;
          const base = wall === cur.wall ? d.base : { ...d.base, openings: d.base.openings.filter((x) => x.id !== d.id) };
          const offset = fitOffset(base, frame, cur.width, snapOffset(frame, cur.width, along, grid ?? 50), d.id);
          if (offset === null) return true;
          const swing = wall === cur.wall || !hit ? cur.swing : { side: hit.side, hinge: cur.swing?.hinge ?? "start" };
          setDraft({ ...d.base, openings: d.base.openings.map((x) => (x.id === d.id ? { ...x, wall, offset, swing } : x)) });
          const g = cornerGaps(frame, offset, cur.width);
          setPreview({ snap: null, chain: null, rect: null, chip: { at: e.world, text: `${formatMeters(g.start)} · ${formatMeters(g.end)}` } });
          return true;
        }
        if (d.kind === "node") {
          const sr = snap(e.world, { ignore: new Set([d.id]) });
          setDraft(moveNodes(d.base, new Map([[d.id, sr.p]])));
          setPreview({ snap: sr, chain: null, rect: null, chip: null });
        } else {
          const w = d.base.walls.find((x) => x.id === d.id);
          const a = d.base.nodes.find((n) => n.id === w?.start);
          const b = d.base.nodes.find((n) => n.id === w?.end);
          if (!w || !a || !b) return true;
          const len = distance(a, b);
          const nrm = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
          let off = (e.world.x - d.start.x) * nrm.x + (e.world.y - d.start.y) * nrm.y;
          if (grid) off = snapValue(off, grid);
          setDraft(
            moveNodes(
              d.base,
              new Map([
                [a.id, { x: a.x + nrm.x * off, y: a.y + nrm.y * off }],
                [b.id, { x: b.x + nrm.x * off, y: b.y + nrm.y * off }],
              ]),
            ),
          );
          setPreview({ snap: null, chain: null, rect: null, chip: { at: e.world, text: `${off >= 0 ? "+" : "−"}${formatMeters(Math.abs(off))}` } });
        }
        return true;
      }
      if (e.phase === "up" || e.phase === "cancel") {
        drag.current = null;
        setPreview(EMPTY);
        const cur = draftRef.current;
        setDraft(null);
        if (cur && d.moved && e.phase === "up" && d.kind === "opening") {
          const moved = cur.openings.find((x) => x.id === d.id);
          const label = moved ? openingName(moved) : "Opening";
          commit(cur, `${label} verschoven`, `${label} teruggezet`, `${label} opnieuw verschoven`);
          return true;
        }
        if (cur && d.moved && e.phase === "up") {
          const node = d.kind === "node";
          const w = node ? null : d.base.walls.find((x) => x.id === d.id);
          const movedIds = new Set(node ? [d.id] : w ? [w.start, w.end] : []);
          if (createsCrossing(cur, movedIds)) {
            toast("Zo loopt de muur dwars door een andere muur. Niet verschoven: zet hem ernaast of erop.");
            return true;
          }
          commit(
            rebuildFloor(cur, undefined, d.base),
            node ? "Hoek verplaatst" : "Muur verschoven",
            node ? "Hoek teruggezet" : "Muur teruggezet",
            node ? "Hoek opnieuw verplaatst" : "Muur opnieuw verschoven",
          );
        }
        return true;
      }
      return false;
    },
    [view, tool, template, floor, snap, grid, wallPreview, addSegment, innerChip, commitRoom, preview.rect, setSelection, commit, setDraft, s.wallDefaults.exterior, openingChoice, openingAt, toast],
  );

  /* ---------------- toetsenbord ---------------- */

  const deleteSelection = useCallback(() => {
    if (!selection) return;
    if (selection.kind === "wall") {
      commit(removeWalls(floor, new Set([selection.id])), "Muur verwijderd", "Muur teruggezet", "Muur weer verwijderd");
    } else if (selection.kind === "room") {
      const room = floor.rooms.find((r) => r.id === selection.id);
      commit(
        removeWalls(floor, ownWalls(floor, selection.id)),
        `${room?.name ?? "Ruimte"} verwijderd`,
        `${room?.name ?? "Ruimte"} teruggezet`,
        `${room?.name ?? "Ruimte"} weer verwijderd`,
      );
    } else if (selection.kind === "opening") {
      const o = floor.openings.find((x) => x.id === selection.id);
      const label = o ? openingName(o) : "Opening";
      commit(removeOpening(floor, selection.id), `${label} verwijderd`, `${label} teruggezet`, `${label} weer verwijderd`);
    } else if (selection.kind === "node") {
      const ids = new Set(floor.walls.filter((w) => w.start === selection.id || w.end === selection.id).map((w) => w.id));
      commit(removeWalls(floor, ids), "Hoek en muren verwijderd", "Hoek teruggezet", "Hoek weer verwijderd");
    }
    setSelection(null);
  }, [selection, floor, commit, setSelection]);

  const nudge = useCallback(
    (dx: number, dy: number) => {
      if (!selection || selection.kind === "room") return;
      if (selection.kind === "opening") {
        const o = floor.openings.find((x) => x.id === selection.id);
        const f = o && wallFrame(floor, o.wall);
        if (!o || !f) return;
        const along = dx * f.d.x + dy * f.d.y;
        if (Math.abs(along) < 1e-6) return;
        const step = Math.sign(along) * Math.max(Math.abs(dx), Math.abs(dy));
        const after = updateOpening(floor, o.id, { offset: o.offset + step });
        if (after) commit(after, "Verschoven", "Terug op de vorige plaats", "Opnieuw verschoven");
        return;
      }
      const ids =
        selection.kind === "node"
          ? [selection.id]
          : (() => {
              const w = floor.walls.find((x) => x.id === selection.id);
              return w ? [w.start, w.end] : [];
            })();
      const moves = new Map<Id, Vec>();
      for (const id of ids) {
        const n = floor.nodes.find((x) => x.id === id);
        if (n) moves.set(id, { x: n.x + dx, y: n.y + dy });
      }
      const moved = moveNodes(floor, moves);
      if (createsCrossing(moved, new Set(ids))) {
        toast("Zo loopt de muur dwars door een andere muur. Niet verschoven.");
        return;
      }
      commit(rebuildFloor(moved, undefined, floor), "Verschoven", "Terug op de vorige plaats", "Opnieuw verschoven");
    },
    [selection, floor, commit, toast],
  );

  /** Geeft true als de toets gebruikt werd. */
  const onKey = useCallback(
    (e: KeyboardEvent): boolean => {
      const k = e.key;
      if ((tool === "wall" || tool === "room") && /^[0-9.,xX×*]$/.test(k)) {
        setBuffer((b) => (b + k).slice(0, 20));
        return true;
      }
      if (tool !== "select" && k === "Backspace" && buffer) {
        setBuffer((b) => b.slice(0, -1));
        return true;
      }
      if (k === "Enter") {
        if (applyBuffer()) return true;
        if (tool === "wall" && chain.current) {
          chain.current = null;
          setPreview(EMPTY);
          return true;
        }
        return false;
      }
      if (k === "Escape") {
        if (justDrawn) {
          // enkel de vraag sluiten; het gereedschap blijft, zodat je meteen verder tekent
          setJustDrawn(null);
          return true;
        }
        if (buffer) setBuffer("");
        else if (template) {
          setTemplateState(null);
          setPreview(EMPTY);
        }
        else if (chain.current || roomStart.current) {
          chain.current = null;
          roomStart.current = null;
          setPreview(EMPTY);
        } else if (tool !== "select") setTool("select");
        else setSelection(null);
        return true;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return false;
      const key = k.toLowerCase();
      if (key === "v") return setTool("select"), true;
      if (key === "m") return setTool("wall"), true;
      if (key === "k") return setTool("room"), true;
      if (selection?.kind === "opening" && (key === "f" || key === "h")) {
        const o = floor.openings.find((x) => x.id === selection.id);
        if (!o || o.kind === "window") return false;
        const sw = o.swing ?? { side: "left" as const, hinge: "start" as const };
        const swing =
          key === "f"
            ? { ...sw, side: sw.side === "left" ? ("right" as const) : ("left" as const) }
            : { ...sw, hinge: sw.hinge === "start" ? ("end" as const) : ("start" as const) };
        const after = updateOpening(floor, o.id, { swing });
        const name = openingName(o);
        if (after) commit(after, key === "f" ? `${name} draait nu de andere kant op` : `${name}: scharnieren gewisseld`, `${name} teruggedraaid`, `${name} opnieuw omgedraaid`);
        return true;
      }
      if (key === "d") return setTool("door"), true;
      if (key === "r") return setTool("window"), true;
      if ((k === "Delete" || k === "Backspace") && selection) {
        deleteSelection();
        return true;
      }
      if (selection && k.startsWith("Arrow")) {
        const step = (grid ?? 10) * (e.shiftKey ? 10 : 1);
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[k as "ArrowLeft"];
        if (d) nudge(d[0], d[1]);
        return true;
      }
      return false;
    },
    [tool, buffer, applyBuffer, setTool, selection, deleteSelection, nudge, grid, setSelection, template, justDrawn, floor, commit],
  );

  const cursor = tool === "select" ? (hover ? "pointer" : "grab") : "crosshair";

  return {
    tool,
    setTool,
    wallChoice: effectiveWall,
    setWallChoice,
    preview,
    draft,
    hover: tool === "select" ? hover : null,
    buffer,
    onTool,
    onKey,
    cursor,
    deleteSelection,
    template,
    setTemplate,
    justDrawn,
    setJustDrawn,
    openingChoice,
    setOpeningChoice,
    openingWidth,
    setOpeningWidth,
  };
}

/** Polygonen voor de voorvertoning van een muurketting. */
export function chainPolygons(points: Vec[], thickness: number) {
  if (points.length < 2) return [];
  const nodes = points.map((p, i) => ({ id: `p${i}`, x: p.x, y: p.y }));
  const walls = nodes.slice(1).map((n, i) => ({
    id: `w${i}`,
    start: nodes[i].id,
    end: n.id,
    thickness,
    height: 0,
    kind: "interior" as const,
    loadBearing: false,
  }));
  return [...wallPolygons({ nodes, walls }).values()];
}

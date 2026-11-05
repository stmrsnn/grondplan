"use client";

import { ArrowLeft, History as HistoryIcon, PanelRightOpen, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AccountMenu } from "@/components/ui/AccountMenu";
import { Logo } from "@/components/ui/AppHeader";
import { Button, IconButton } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { HelpButton } from "@/components/ui/Help";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useToast } from "@/components/ui/Toast";
import { Autosaver, type SaveStatus } from "@/lib/editor/autosave";
import { EditorStore } from "@/lib/editor/store";
import { DEFAULT_AREA, fitBounds, toScreen, toWorld, zoomAt, zoomPercent, type Viewport } from "@/lib/editor/viewport";
import { formatMeters, parseLength } from "@/lib/format";
import { analyzeFloor, functionLabel, moveNodes, rebuildFloor, stretch, type RoomInfo } from "@/lib/geometry/plan";
import { addFloor, docCmd, editFloor, renameProject, restoreVersion, updateRoom } from "@/lib/model/commands";
import { setCustomWallTypes, wallType } from "@/lib/model/wallTypes";
import { canDeleteWallType, deleteWallType, newCustomTypeId, saveWallType, typeUsage } from "@/lib/model/wallTypeOps";
import { WallTypeDialog, WallTypeEditorContext } from "./WallTypeDialog";
import { FrameDialog, FrameEditorContext, type FrameDialogResult, type FrameEditorOpts } from "./FrameDialog";
import { frameOf, openingName, openingSpan, updateOpening } from "@/lib/geometry/openings";
import { frameType, hasDoor, isCustomFrameType, setCustomFrameTypes, FRAME_PRESETS, DOOR_PRESETS } from "@/lib/model/frames";
import { deleteFrameType, frameTypeUsage, newFrameTypeId, saveFrameType } from "@/lib/model/frameOps";
import { floorsBottomUp } from "@/lib/model/doc";
import type { Vec } from "@/lib/geometry/vec";
import type { Floor, ProjectDoc, Underlay } from "@/lib/model/types";
import { cleanName } from "@/lib/projects";
import { W } from "@/lib/words";
import type { EditorBackend } from "./backend";
import { Compass } from "./NorthArrow";
import { PropertiesPanel, type UnderlayMode } from "./Panels";
import { PlanCanvas, type ToolPointerEvent } from "./PlanCanvas";
import { View3D } from "./View3D";
import { UnderlayDialog, type UnderlayResult } from "./UnderlayDialog";
import { Annotations, Chip, FloorLayer, GhostFloor, Guides, OpeningLabels, OpeningsLayer, PlanPatterns, SnapMarker, type FacadeOpening, type Selection } from "./PlanLayers";
import { doorConflicts, needsLintel, openingMarks, openingShape, roomDaylight, type OpeningShape } from "@/lib/geometry/openings";
import { ToolRail } from "./ToolRail";
import { chainPolygons, usePlanTools } from "./usePlanTools";
import { SaveIndicator } from "./SaveIndicator";
import { Toolbar } from "./Toolbar";
import { VersionsDialog } from "./VersionsDialog";

export interface EditorProps {
  initialDoc: ProjectDoc;
  backend: EditorBackend;
  email?: string | null;
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

/** Het gebied dat we bij "alles in beeld" tonen: de getekende muren, of een leeg blad. */
/** Hoeken van een onderlegger op het plan (mm). */
export function underlayCorners(u: Underlay): Vec[] {
  const w = (u.pxWidth * u.scale) / 2;
  const h = (u.pxHeight * u.scale) / 2;
  const a = (u.rotation * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    [-w, -h],
    [w, -h],
    [w, h],
    [-w, h],
  ].map(([x, y]) => ({ x: u.x + x * c - y * s, y: u.y + x * s + y * c }));
}

function areaFor(floor: Floor) {
  const b = analyzeFloor(floor).outerBounds;
  if (!b && floor.underlay?.visible) {
    const pts = underlayCorners(floor.underlay);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
  }
  if (!b) return DEFAULT_AREA;
  const m = 1200;
  return { minX: b.minX - m, minY: b.minY - m, maxX: b.maxX + m, maxY: b.maxY + m };
}

export function Editor({ initialDoc, backend, email }: EditorProps) {
  const toast = useToast();
  const router = useRouter();
  const [store] = useState(() => new EditorStore(initialDoc));
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const { doc, activeFloorId } = state;
  const floor = doc.floors.find((f) => f.id === activeFloorId) ?? doc.floors[0];
  // eigen muurtypes van dit project aanmelden vóór er getekend wordt
  setCustomWallTypes(doc.settings.customWallTypes);
  setCustomFrameTypes(doc.settings.customFrameTypes);

  // ---------- eigen muurtypes ----------
  const [wallTypeEdit, setWallTypeEdit] = useState<{ edit?: string; onCreated?: (id: string) => void } | null>(null);
  const openWallTypeEditor = useCallback((opts: { edit?: string; onCreated?: (id: string) => void }) => setWallTypeEdit(opts), []);

  // ---------- ramen en deuren samenstellen ----------
  const [frameEdit, setFrameEdit] = useState<FrameEditorOpts | null>(null);
  const openFrameEditor = useCallback((opts: FrameEditorOpts) => setFrameEdit(opts), []);

  // ---------- automatisch bewaren ----------
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const saver = useMemo(
    () =>
      new Autosaver<ProjectDoc>({
        save: (d) => backend.save({ ...d, name: cleanName(d.name) || "Naamloos project" }),
        onStatus: setSaveStatus,
      }),
    [backend],
  );
  useEffect(() => {
    const stopListening = store.listenToDoc((d) => saver.change(d));
    const flush = () => void saver.flush();
    const onHide = () => document.visibilityState === "hidden" && flush();
    const onLeave = (e: BeforeUnloadEvent) => {
      if (saver.hasUnsaved) {
        flush();
        e.preventDefault();
      }
    };
    window.addEventListener("online", flush);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      stopListening();
      window.removeEventListener("online", flush);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onLeave);
      flush();
      saver.dispose();
    };
  }, [store, saver]);

  // ---------- beeld (zoomen en verschuiven) ----------
  const [view, setViewState] = useState<Viewport | null>(null);
  // tijdens verschuiven en zoomen tekenen we geen maten: zo blijft het vloeiend bij grote plannen
  const [moving, setMoving] = useState(false);
  const movingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setView: typeof setViewState = useCallback((v) => {
    setViewState(v);
    setMoving(true);
    if (movingTimer.current) clearTimeout(movingTimer.current);
    movingTimer.current = setTimeout(() => setMoving(false), 160);
  }, []);
  const size = useRef({ w: 0, h: 0 });
  const area = areaFor(floor);
  const onResize = useCallback(
    (w: number, h: number) => {
      size.current = { w, h };
      setView((v) => v ?? fitBounds(area, w, h));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- enkel het startbeeld
    [],
  );
  const fit = useCallback(() => {
    const st = store.getState();
    const f = st.doc.floors.find((x) => x.id === st.activeFloorId) ?? st.doc.floors[0];
    setView(fitBounds(areaFor(f), size.current.w, size.current.h));
  }, [store, setView]);
  const zoomBy = useCallback(
    (f: number) => setView((v) => v && zoomAt(v, { x: size.current.w / 2, y: size.current.h / 2 }, f)),
    [setView],
  );

  // ---------- ongedaan maken ----------
  const undo = useCallback(() => {
    const m = store.undo();
    if (m) toast.show(m);
  }, [store, toast]);
  const redo = useCallback(() => {
    const m = store.redo();
    if (m) toast.show(m);
  }, [store, toast]);

  // ---------- tekenen en selecteren ----------
  const [selection, setSelection] = useState<Selection>(null);
  /** Het plan in 3D bekijken in plaats van tekenen. */
  const [show3d, setShow3d] = useState(false);
  const tools = usePlanTools({ store, doc, floor, view, selection, setSelection, toast: toast.show });
  const shownFloor = tools.draft ?? floor;

  // ---------- onderlegger (foto of pdf om over te trekken) ----------
  // begon je met "een plan overtrekken"? dan meteen de vraag naar het bestand
  const [underlayOpen, setUnderlayOpen] = useState(
    () => initialDoc.start.kind === "trace" && !initialDoc.floors.some((f) => f.underlay || f.walls.length > 0),
  );
  const [underlayMode, setUnderlayModeState] = useState<UnderlayMode>(null);
  const [underlayPts, setUnderlayPts] = useState<Vec[]>([]);
  const [underlayHover, setUnderlayHover] = useState<Vec | null>(null);
  const [underlayDraft, setUnderlayDraft] = useState<Underlay | null>(null);
  const [underlayScaleAt, setUnderlayScaleAt] = useState<Vec | null>(null);
  const underlayDrag = useRef<{ start: Vec; base: Underlay } | null>(null);
  const [underlaySrc, setUnderlaySrc] = useState<{ src: string; url: string } | null>(null);
  const underlay = underlayDraft ?? floor.underlay;
  const setUnderlayMode = useCallback((m: UnderlayMode) => {
    setUnderlayModeState(m);
    setUnderlayPts([]);
    setUnderlayScaleAt(null);
  }, []);
  const openUnderlay = useCallback(() => setUnderlayOpen(true), []);
  // tijdelijke link naar het bestand ophalen
  useEffect(() => {
    const src = floor.underlay?.src;
    if (!src || underlaySrc?.src === src) return;
    let alive = true;
    backend
      .underlayUrl(src)
      .then((url) => alive && setUnderlaySrc({ src, url }))
      .catch(() => alive && toast.show("De onderlegger kon niet geladen worden."));
    return () => {
      alive = false;
    };
  }, [floor.underlay?.src, underlaySrc?.src, backend, toast]);

  const placeUnderlay = useCallback(
    async (r: UnderlayResult) => {
      const src = await backend.uploadUnderlay(r.blob);
      const st = store.getState();
      const f = st.doc.floors.find((x) => x.id === st.activeFloorId) ?? st.doc.floors[0];
      const c = view ? toWorld(view, { x: size.current.w / 2, y: size.current.h / 2 }) : { x: 0, y: 0 };
      const u: Underlay = {
        src,
        name: r.name,
        pxWidth: r.pxWidth,
        pxHeight: r.pxHeight,
        x: Math.round(c.x),
        y: Math.round(c.y),
        scale: r.scale,
        rotation: 0,
        opacity: 0.55,
        visible: true,
      };
      store.execute(editFloor(f, { ...f, underlay: u }, "Onderlegger geplaatst", "Onderlegger weggehaald", "Onderlegger terug geplaatst"));
      store.seal();
      setUnderlayOpen(false);
      const after = { ...f, underlay: u };
      setView(fitBounds(areaFor(after.walls.length ? f : after), size.current.w, size.current.h));
      toast.show("Klaar om over te trekken. Teken de muren op de onderlegger.");
    },
    [backend, store, view, setView, toast],
  );
  const commitUnderlay = useCallback(
    (u: Underlay, what: string) => {
      const st = store.getState();
      const f = st.doc.floors.find((x) => x.id === st.activeFloorId) ?? st.doc.floors[0];
      store.execute(editFloor(f, { ...f, underlay: u }, what, `${what}: ongedaan`, `${what}: opnieuw`));
      store.seal();
    },
    [store],
  );
  /** Klikken en slepen op het plan terwijl je de onderlegger bijstelt. */
  const onUnderlayTool = (e: ToolPointerEvent): boolean => {
    const u = floor.underlay;
    if (!underlayMode || !u) return false;
    if (e.phase === "cancel") {
      setUnderlayMode(null);
      setUnderlayDraft(null);
      underlayDrag.current = null;
      return true;
    }
    if (underlayMode === "move") {
      if (e.phase === "down") underlayDrag.current = { start: e.world, base: u };
      const d = underlayDrag.current;
      if (d && (e.phase === "move" || e.phase === "up")) {
        const moved = { ...d.base, x: Math.round(d.base.x + e.world.x - d.start.x), y: Math.round(d.base.y + e.world.y - d.start.y) };
        if (e.phase === "move") setUnderlayDraft(moved);
        else {
          underlayDrag.current = null;
          setUnderlayDraft(null);
          if (moved.x !== u.x || moved.y !== u.y) commitUnderlay(moved, "Onderlegger verschoven");
        }
      }
      return true;
    }
    if (e.phase === "hover" || e.phase === "move") {
      setUnderlayHover(e.world);
      return true;
    }
    if (e.phase !== "down" || underlayScaleAt) return true;
    const pts = [...underlayPts, e.world];
    if (pts.length < 2) {
      setUnderlayPts(pts);
      return true;
    }
    const [p, q] = pts;
    if (Math.hypot(q.x - p.x, q.y - p.y) < 50) return true;
    if (underlayMode === "straighten") {
      // draai rond het eerste punt tot de lijn horizontaal of verticaal staat
      const ang = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
      const delta = Math.round(ang / 90) * 90 - ang;
      const r = (delta * Math.PI) / 180;
      const cx = u.x - p.x;
      const cy = u.y - p.y;
      commitUnderlay(
        {
          ...u,
          rotation: (((u.rotation + delta) % 360) + 360) % 360,
          x: Math.round(p.x + cx * Math.cos(r) - cy * Math.sin(r)),
          y: Math.round(p.y + cx * Math.sin(r) + cy * Math.cos(r)),
        },
        "Onderlegger rechtgezet",
      );
      setUnderlayMode(null);
      return true;
    }
    // schaal: vraag de echte maat
    setUnderlayPts(pts);
    setUnderlayScaleAt(e.screen);
    return true;
  };
  const applyUnderlayScale = (text: string) => {
    const u = floor.underlay;
    const mm = parseLength(text);
    const [p, q] = underlayPts;
    setUnderlayScaleAt(null);
    if (!u || !mm || !p || !q) return setUnderlayMode(null);
    const k = mm / Math.hypot(q.x - p.x, q.y - p.y);
    commitUnderlay({ ...u, scale: u.scale * k, x: Math.round(p.x + (u.x - p.x) * k), y: Math.round(p.y + (u.y - p.y) * k) }, "Schaal onderlegger bijgesteld");
    setUnderlayMode(null);
  };
  const { setTool } = tools;
  const selectFromPanel = useCallback(
    (sel: Selection) => {
      setSelection(sel);
      if (sel) setTool("select");
    },
    [setTool],
  );
  const analysis = useMemo(() => analyzeFloor(shownFloor), [shownFloor]);
  const openingShapes = useMemo(
    () => shownFloor.openings.map((o) => openingShape(shownFloor, o)).filter((x): x is OpeningShape => x !== null),
    [shownFloor],
  );
  const ghostOpening = tools.preview.opening ? openingShape(floor, tools.preview.opening) : null;
  const conflicts = useMemo(() => doorConflicts(shownFloor, analysis), [shownFloor, analysis]);
  // openingen in de gevels, voor de maatketting buiten
  const facadeOpenings = useMemo<FacadeOpening[]>(
    () =>
      openingShapes.flatMap((sh) => {
        const sign = analysis.wallOutside.get(sh.opening.wall);
        if (!sign) return [];
        const edges: [Vec, Vec] = sh.rebates.length === 2 ? [sh.rebates[0][1], sh.rebates[1][0]] : [sh.cut[0], sh.cut[1]];
        return [{ edges, outward: { x: -sh.d.y * sign, y: sh.d.x * sign } }];
      }),
    [openingShapes, analysis],
  );
  // daglicht: pas melden zodra er ramen getekend worden, anders is elke nieuwe kamer "te donker"
  const daylightNotes = useMemo(() => {
    const notes = new Map<string, string>();
    if (!shownFloor.openings.some((o) => o.kind === "window")) return notes;
    for (const [id, d] of roomDaylight(shownFloor, analysis)) if (!d.ok) notes.set(id, "te weinig daglicht");
    return notes;
  }, [shownFloor, analysis]);
  const ghostLintel =
    tools.preview.opening && floor.walls.some((w) => w.id === tools.preview.opening!.wall && needsLintel(tools.preview.opening!, w));
  // maten bij de deur of het raam dat je plaatst, versleept of geselecteerd hebt
  const markedOpening =
    tools.preview.opening ??
    (selection?.kind === "opening" ? shownFloor.openings.find((o) => o.id === selection.id) ?? null : null);
  const marks = markedOpening ? openingMarks(tools.preview.opening ? floor : shownFloor, markedOpening) : [];
  const below = useMemo(() => {
    const sorted = floorsBottomUp(doc);
    const i = sorted.findIndex((f) => f.id === floor.id);
    return i > 0 ? analyzeFloor(sorted[i - 1]) : null;
  }, [doc, floor.id]);
  const [dimEdit, setDimEdit] = useState<{ room: RoomInfo; a: Vec; b: Vec; at: Vec; value: string } | null>(null);
  // selectie die niet meer bestaat (na ongedaan maken, andere verdieping) wissen
  useEffect(() => {
    if (!selection) return;
    const exists =
      selection.kind === "room"
        ? floor.rooms.some((r) => r.id === selection.id)
        : selection.kind === "wall"
          ? floor.walls.some((w) => w.id === selection.id)
          : selection.kind === "opening"
            ? floor.openings.some((o) => o.id === selection.id)
            : floor.nodes.some((n) => n.id === selection.id);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- verouderde selectie opruimen
    if (!exists) setSelection(null);
  }, [floor, selection]);

  const applyDim = (value: string) => {
    if (!dimEdit) return;
    const L = parseLength(value);
    const { room } = dimEdit;
    setDimEdit(null);
    if (!L || L < 100) {
      if (value.trim()) toast.show("Typ een maat, bijvoorbeeld 3,25");
      return;
    }
    let { a, b } = dimEdit;
    // groeien naar rechts of naar onder: dat voelt het meest voorspelbaar
    if (b.x - a.x < -1 || (Math.abs(b.x - a.x) <= 1 && b.y < a.y)) [a, b] = [b, a];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    const delta = L - len;
    if (Math.abs(delta) < 1) return;
    const straight = Math.abs(u.x) < 1e-6 || Math.abs(u.y) < 1e-6;
    let next: Floor | null;
    if (straight) {
      // recht: alles voorbij de muur schuift mee, zonder schuine muren te maken
      next = stretch(floor, u, b.x * u.x + b.y * u.y, delta);
    } else {
      // schuin: enkel het eindpunt van deze muur schuift in de richting van de muur
      const end = floor.nodes.reduce((best, n) =>
        Math.hypot(n.x - b.x, n.y - b.y) < Math.hypot(best.x - b.x, best.y - b.y) ? n : best,
      );
      next = moveNodes(floor, new Map([[end.id, { x: end.x + u.x * delta, y: end.y + u.y * delta }]]));
    }
    if (!next) {
      toast.show("Zo klein kan niet: er staat een muur in de weg.");
      return;
    }
    store.execute(
      editFloor(floor, rebuildFloor(next, undefined, floor), "Maat aangepast", `${room.room.name}: vorige maat teruggezet`, `${room.room.name}: nieuwe maat opnieuw toegepast`),
    );
    store.seal();
    toast.show(`${room.room.name}: ${formatMeters(len)} → ${formatMeters(L)}`);
  };

  // ---------- sneltoetsen ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // in 3D gebruiken de pijltjes en W A S D het rondwandelen, niet het tekenen
      if (show3d) {
        const mod3 = e.metaKey || e.ctrlKey;
        const k3 = e.key.toLowerCase();
        if (mod3 && (k3 === "z" || k3 === "y") && !isTyping(e.target)) {
          e.preventDefault();
          if (k3 === "y" || e.shiftKey) redo();
          else undo();
        }
        return;
      }
      if (!isTyping(e.target) && !(e.target instanceof HTMLSelectElement) && tools.onKey(e)) {
        e.preventDefault();
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && (key === "z" || key === "y")) {
        if (isTyping(e.target)) (e.target as HTMLElement).blur();
        e.preventDefault();
        if (key === "y" || e.shiftKey) redo();
        else undo();
        return;
      }
      if (isTyping(e.target) || mod || e.altKey) return;
      if (key === "+" || key === "=") zoomBy(1.25);
      else if (key === "-" || key === "_") zoomBy(0.8);
      else if (key === "0") fit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, zoomBy, fit, tools, show3d]);

  // ---------- rechterbalk ----------
  const [right, setRight] = useState(true);
  const hidePanel = useCallback(() => setRight(false), []);
  useEffect(() => {
    if (window.innerWidth < 1200) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- smalle schermen: plan krijgt alle ruimte
      setRight(false);
    }
  }, []);

  // ---------- versies en conflicten ----------
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [resolving, setResolving] = useState(false);

  const lastGoodName = useRef(doc.name);
  const leave = async () => {
    await saver.flush();
    router.push("/projecten");
  };

  /** Dialoog om een raam of deur samen te stellen: voor een geplaatst raam of een eigen soort. */
  const renderFrameDialog = (opts: FrameEditorOpts) => {
    const close = () => setFrameEdit(null);
    const o = opts.openingId ? floor.openings.find((x) => x.id === opts.openingId) : undefined;
    if (o) {
      const kind = o.kind === "door" ? "deur" : "raam";
      return (
        <FrameDialog
          title={`${o.kind === "door" ? "Deur" : "Raam"} samenstellen`}
          mode="opening"
          initial={{ frame: frameOf(o) ?? { sashes: [{ type: "vast" }] }, width: openingSpan(o), height: o.height, sillHeight: o.sillHeight }}
          onClose={close}
          onSave={(r: FrameDialogResult) => {
            let d = doc;
            let typeId: string | undefined;
            if (r.saveAs) {
              typeId = newFrameTypeId();
              d = saveFrameType(d, { id: typeId, name: r.saveAs, frame: r.frame, width: r.width, height: r.height, sillHeight: r.sillHeight });
            }
            const f = d.floors.find((x) => x.id === floor.id)!;
            const after = updateOpening(f, o.id, {
              frame: r.frame,
              frameType: typeId,
              kind: hasDoor(r.frame) ? "door" : "window",
              variant: undefined,
              width: r.width,
              height: r.height,
              sillHeight: r.sillHeight,
              swing: o.swing ?? { side: "left", hinge: "start" },
            });
            if (!after) {
              toast.show(`Zo breed past dit ${kind} niet in de muur.`);
              return;
            }
            d = { ...d, floors: d.floors.map((x) => (x.id === floor.id ? after : x)) };
            const name = r.saveAs ?? openingName(o);
            store.execute(docCmd(doc, d, `${name} samengesteld`, `${name}: vorige samenstelling terug`, `${name} opnieuw samengesteld`));
            store.seal();
            close();
            if (r.saveAs) toast.show(`"${r.saveAs}" staat nu bij de ${hasDoor(r.frame) ? "deuren" : "ramen"}`);
          }}
        />
      );
    }
    const existing = opts.typeId && isCustomFrameType(opts.typeId) ? frameType(opts.typeId) : null;
    const start = existing ?? (opts.group === "door" ? DOOR_PRESETS[1] : FRAME_PRESETS[2]);
    return (
      <FrameDialog
        title={existing ? "Eigen soort bewerken" : opts.group === "door" ? "Eigen deur samenstellen" : "Eigen raam samenstellen"}
        mode="type"
        initial={{ ...start, name: existing?.name ?? "" }}
        usage={existing ? frameTypeUsage(doc, existing.id) : 0}
        canDelete={!!existing}
        onClose={close}
        onDelete={() => {
          if (!existing) return;
          store.execute(docCmd(doc, deleteFrameType(doc, existing.id), `"${existing.name}" verwijderd`, `"${existing.name}" teruggezet`, `"${existing.name}" opnieuw verwijderd`));
          store.seal();
          close();
        }}
        onSave={(r: FrameDialogResult) => {
          const id = existing?.id ?? newFrameTypeId();
          const name = r.saveAs ?? existing?.name ?? "Eigen raam";
          const after = saveFrameType(doc, { id, name, frame: r.frame, width: r.width, height: r.height, sillHeight: r.sillHeight });
          store.execute(docCmd(doc, after, existing ? `"${name}" aangepast` : `"${name}" gemaakt`, `"${name}": ongedaan`, `"${name}": opnieuw`));
          store.seal();
          close();
          if (!existing) opts.onCreated?.(id);
          toast.show(existing ? `"${name}" bewaard` : `"${name}" staat nu bij de ${hasDoor(r.frame) ? "deuren" : "ramen"}`);
        }}
      />
    );
  };

  return (
    <WallTypeEditorContext.Provider value={openWallTypeEditor}>
    <FrameEditorContext.Provider value={openFrameEditor}>
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-bg px-2 sm:px-3">
        <Link
          href="/projecten"
          onClick={(e) => {
            e.preventDefault();
            void leave();
          }}
          aria-label="Terug naar je projecten"
          title="Terug naar je projecten"
          className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-control)] text-ink-2 hover:bg-surface-2 hover:text-ink"
        >
          <ArrowLeft size={20} />
        </Link>
        <div className="hidden md:block">
          <Logo />
        </div>
        <span className="hidden h-6 w-px bg-line md:block" aria-hidden="true" />
        <input
          aria-label="Projectnaam"
          value={doc.name}
          maxLength={120}
          onChange={(e) => store.execute(renameProject(doc.name, e.target.value))}
          onFocus={() => (lastGoodName.current = doc.name)}
          onBlur={(e) => {
            store.seal();
            const clean = cleanName(e.target.value);
            if (!clean) store.execute(renameProject(doc.name, lastGoodName.current));
            else if (clean !== doc.name) store.execute(renameProject(doc.name, clean));
            store.seal();
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="h-9 min-w-0 max-w-[40ch] flex-1 truncate rounded-[var(--radius-control)] bg-transparent px-2 text-[15px] font-medium text-ink outline-none hover:bg-surface-2 focus:bg-surface-2"
        />
        <div className="flex-1" />
        <SaveIndicator status={saveStatus} />
        <IconButton label="Eerdere versies" onClick={() => setVersionsOpen(true)}>
          <HistoryIcon size={20} />
        </IconButton>
        <HelpButton title="Zo werk je snel">
          <p>
            <strong className="text-ink">Kamer (K):</strong> sleep een rechthoek. Of klik één hoek
            en typ de binnenmaten, bv. <strong className="text-ink">4,5x3</strong> en Enter. Een
            kamer tegen een bestaande muur deelt die muur vanzelf.
          </p>
          <p>
            <strong className="text-ink">Muur (M):</strong> klik punt na punt. Typ tijdens het
            tekenen een lengte en Enter. Eindig je op een muur of een hoek, dan stopt de muur
            vanzelf. Muren lopen recht; houd Shift ingedrukt voor een schuine muur.
          </p>
          <p>
            <strong className="text-ink">Deur (D) en raam (R):</strong> klik op een muur. Een deur
            draait open naar de kant van je cursor, met de scharnieren bij de dichtste hoek. Kies
            vooraf een soort en breedte, of later in het paneel rechts. Sleep een deur of raam om
            het te verschuiven, ook naar een andere muur. Geselecteerde deur: F draait ze de andere
            kant op, H wisselt de scharnieren.
          </p>
          <p>
            <strong className="text-ink">Maten aanpassen:</strong> klik op een maat in een kamer en
            typ de nieuwe. De muur ernaast schuift mee, net als de rest van het plan.
          </p>
          <p>
            <strong className="text-ink">Selecteren (V):</strong> klik een kamer, muur of hoek. Sleep
            een muur of hoek om hem te verplaatsen; pijltjestoetsen schuiven 5 cm (met Shift
            50 cm). Delete verwijdert.
          </p>
          <p>
            <strong className="text-ink">Rondkijken:</strong> sleep het lege blad, of houd de
            spatiebalk ingedrukt. Zoom met het wieltje of twee vingers; 0 zet alles in beeld.
          </p>
          <p>
            <strong className="text-ink">Vergissing?</strong> Ctrl+Z maakt elke stap ongedaan. Via
            het klokje rechtsboven zet je een eerdere versie terug. Alles wordt vanzelf bewaard.
          </p>
        </HelpButton>
        <ThemeToggle />
        {email && <AccountMenu email={email} />}
      </header>

      <div className="relative flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1 overflow-hidden" aria-label="Plan">
          <PlanCanvas
            view={view}
            onViewChange={setView}
            onResize={onResize}
            onTool={(e) => onUnderlayTool(e) || tools.onTool(e)}
            cursor={tools.cursor}
            touchOffset={tools.tool === "select" ? 0 : 56}
            overlay={(v) => (
              <>
                <Annotations
                  analysis={analysis}
                  view={v}
                  showDims={!tools.draft && !moving && marks.length === 0}
                  notes={daylightNotes}
                  openings={facadeOpenings}
                  onEditEdge={(room, a, b, at) =>
                    setDimEdit({ room, a, b, at, value: formatMeters(Math.hypot(b.x - a.x, b.y - a.y)).replace(" m", "") })
                  }
                />
                {!moving && <OpeningLabels shapes={openingShapes} view={v} />}
                {underlayMode && underlayMode !== "move" && underlayPts.length > 0 && (
                  <g pointerEvents="none">
                    {(() => {
                      const a = toScreen(v, underlayPts[0]);
                      const b = toScreen(v, underlayPts[1] ?? underlayHover ?? underlayPts[0]);
                      return (
                        <>
                          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--accent)" strokeWidth={2} strokeDasharray="6 4" />
                          <circle cx={a.x} cy={a.y} r={5} fill="var(--bg)" stroke="var(--accent)" strokeWidth={2} />
                          <circle cx={b.x} cy={b.y} r={5} fill="var(--bg)" stroke="var(--accent)" strokeWidth={2} />
                        </>
                      );
                    })()}
                  </g>
                )}
                {ghostOpening && ghostLintel && (
                  <Chip
                    at={{ x: toScreen(v, ghostOpening.center).x, y: toScreen(v, ghostOpening.center).y - 34 }}
                    text="Dragende muur: latei nodig"
                  />
                )}
                {tools.preview.snap && <Guides guides={tools.preview.snap.guides} view={v} />}
                {tools.preview.snap && tools.tool !== "select" && <SnapMarker snap={tools.preview.snap} view={v} />}
                {selection?.kind === "node" && analysis.nodeById.get(selection.id) && (
                  <circle
                    cx={toScreen(v, analysis.nodeById.get(selection.id)!).x}
                    cy={toScreen(v, analysis.nodeById.get(selection.id)!).y}
                    r={6}
                    fill="var(--accent)"
                    stroke="var(--bg)"
                    strokeWidth={2}
                    pointerEvents="none"
                  />
                )}
                {marks.map((m, i) => {
                  const a = toScreen(v, m.from);
                  const b = toScreen(v, m.to);
                  const off = { x: m.out.x * 22, y: m.out.y * 22 };
                  const mid = { x: (a.x + b.x) / 2 + off.x, y: (a.y + b.y) / 2 + off.y };
                  if (Math.hypot(b.x - a.x, b.y - a.y) < 14) return null;
                  return (
                    <g key={`m${i}`} pointerEvents="none">
                      <line x1={a.x + off.x} y1={a.y + off.y} x2={b.x + off.x} y2={b.y + off.y} stroke="var(--accent)" strokeWidth={1} />
                      <line x1={a.x} y1={a.y} x2={a.x + off.x * 1.3} y2={a.y + off.y * 1.3} stroke="var(--accent)" strokeWidth={1} />
                      <line x1={b.x} y1={b.y} x2={b.x + off.x * 1.3} y2={b.y + off.y * 1.3} stroke="var(--accent)" strokeWidth={1} />
                      <Chip at={mid} text={formatMeters(m.len)} strong={m.kind === "width"} />
                    </g>
                  );
                })}
                {tools.preview.chip && tools.preview.chip.text && (
                  <Chip at={{ x: toScreen(v, tools.preview.chip.at).x + 44, y: toScreen(v, tools.preview.chip.at).y - 22 }} text={tools.preview.chip.text} strong />
                )}
              </>
            )}
          >
            {view && <PlanPatterns zoom={view.zoom} />}
            {below && <GhostFloor analysis={below} />}
            <FloorLayer
              analysis={analysis}
              selection={selection}
              hover={tools.hover}
              underlay={
                underlay?.visible && underlaySrc && underlaySrc.src === underlay.src ? (
                  <image
                    href={underlaySrc.url}
                    x={underlay.x - (underlay.pxWidth * underlay.scale) / 2}
                    y={underlay.y - (underlay.pxHeight * underlay.scale) / 2}
                    width={underlay.pxWidth * underlay.scale}
                    height={underlay.pxHeight * underlay.scale}
                    transform={`rotate(${underlay.rotation} ${underlay.x} ${underlay.y})`}
                    opacity={underlay.opacity}
                    preserveAspectRatio="none"
                    className="plan-underlay"
                    pointerEvents="none"
                    data-underlay=""
                  />
                ) : null
              }
            />
            <OpeningsLayer shapes={openingShapes} selection={selection} hover={tools.hover} ghost={ghostOpening} conflicts={conflicts} />
            {tools.preview.chain && (
              <g opacity={0.7}>
                {chainPolygons(tools.preview.chain, tools.wallChoice === "exterior" ? doc.settings.wallDefaults.exterior : doc.settings.wallDefaults.interior).map((poly, i) => (
                  <path key={i} d={`M${poly.map((p) => `${p.x} ${p.y}`).join("L")}Z`} fill="var(--accent)" />
                ))}
              </g>
            )}
            {tools.preview.rect && (
              <g opacity={0.7}>
                {chainPolygons(
                  [
                    tools.preview.rect.a,
                    { x: tools.preview.rect.b.x, y: tools.preview.rect.a.y },
                    tools.preview.rect.b,
                    { x: tools.preview.rect.a.x, y: tools.preview.rect.b.y },
                    tools.preview.rect.a,
                  ],
                  doc.settings.wallDefaults.exterior,
                ).map((poly, i) => (
                  <path key={i} d={`M${poly.map((p) => `${p.x} ${p.y}`).join("L")}Z`} fill={tools.preview.rect?.bad ? "var(--danger)" : "var(--accent)"} />
                ))}
              </g>
            )}
          </PlanCanvas>

          {tools.justDrawn && view && (() => {
            const info = analysis.rooms.find((r) => r.room.id === tools.justDrawn);
            if (!info) return null;
            const c = toScreen(view, info.center);
            return (
              <div
                role="group"
                aria-label="Wat voor ruimte is dit?"
                className="absolute z-20 flex max-w-[300px] -translate-x-1/2 -translate-y-1/2 flex-wrap justify-center gap-1.5 rounded-[var(--radius-card)] border border-line bg-bg p-2 shadow-[var(--shadow-float)]"
                style={{ left: c.x, top: c.y }}
              >
                <span className="w-full pb-0.5 text-center text-[12px] text-ink-3">Wat voor ruimte is dit?</span>
                {(["living", "keuken", "eetkamer", "slaapkamer", "badkamer", "toilet", "hal", "berging"] as const).map((fn) => (
                  <button
                    key={fn}
                    type="button"
                    className="h-7 rounded-full border border-line px-2.5 text-[12px] text-ink hover:border-accent hover:bg-accent-soft"
                    onClick={() => {
                      store.execute(
                        updateRoom(floor.id, info.room.id, { function: info.room.function, name: info.room.name }, { function: fn, name: functionLabel(fn) }),
                      );
                      store.seal();
                      tools.setJustDrawn(null);
                    }}
                  >
                    {functionLabel(fn)}
                  </button>
                ))}
                <button
                  type="button"
                  className="h-7 rounded-full px-2.5 text-[12px] text-ink-3 hover:text-ink"
                  onClick={() => tools.setJustDrawn(null)}
                >
                  Later
                </button>
              </div>
            );
          })()}

          {underlayScaleAt && (
            <input
              autoFocus
              aria-label="Echte maat tussen de twee punten"
              placeholder="bv. 4,50"
              onKeyDown={(e) => {
                if (e.key === "Enter") applyUnderlayScale((e.target as HTMLInputElement).value);
                if (e.key === "Escape") setUnderlayMode(null);
                e.stopPropagation();
              }}
              onBlur={(e) => e.target.value && applyUnderlayScale(e.target.value)}
              inputMode="decimal"
              className="tabular absolute z-30 h-8 w-28 -translate-x-1/2 translate-y-3 rounded-[var(--radius-control)] border-2 border-accent bg-bg px-2 text-center text-sm text-ink shadow-[var(--shadow-float)] outline-none"
              style={{ left: underlayScaleAt.x, top: underlayScaleAt.y }}
            />
          )}
          {dimEdit && (
            <input
              autoFocus
              aria-label="Nieuwe maat"
              defaultValue={dimEdit.value}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyDim((e.target as HTMLInputElement).value);
                if (e.key === "Escape") setDimEdit(null);
                e.stopPropagation();
              }}
              onBlur={(e) => applyDim(e.target.value)}
              inputMode="decimal"
              className="tabular absolute z-30 h-8 w-24 -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-control)] border-2 border-accent bg-bg px-2 text-center text-sm text-ink shadow-[var(--shadow-float)] outline-none"
              style={{ left: dimEdit.at.x, top: dimEdit.at.y }}
            />
          )}

          {show3d && (
            <View3D
              doc={doc}
              floor={floor}
              onPickRoom={(id) => setSelection(id && floor.rooms.some((r) => r.id === id) ? { kind: "room", id } : null)}
            />
          )}

          {!show3d && <ToolRail
            tool={tools.tool}
            setTool={tools.setTool}
            wallChoice={tools.wallChoice}
            setWallChoice={tools.setWallChoice}
            buffer={tools.buffer}
            defaults={doc.settings.wallDefaults}
            template={tools.template}
            setTemplate={tools.setTemplate}
            openingChoice={tools.openingChoice}
            setOpeningChoice={tools.setOpeningChoice}
            openingWidth={tools.openingWidth}
            setOpeningWidth={tools.setOpeningWidth}
          />}

          <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex items-start justify-between gap-2 px-3">
            <div className="pointer-events-auto" title="Noorden (aanpassen bij Eigenschappen)">
              {!show3d && <Compass angle={doc.settings.northAngle} />}
            </div>
            <div className="pointer-events-auto flex items-center gap-2 overflow-x-auto">
              <div
                className="flex shrink-0 rounded-[var(--radius-control)] border border-line bg-bg p-0.5 text-[13px] font-medium shadow-[var(--shadow-float)]"
                role="radiogroup"
                aria-label="Weergave"
              >
                {([false, true] as const).map((v) => (
                  <button
                    key={String(v)}
                    type="button"
                    role="radio"
                    aria-checked={show3d === v}
                    onClick={() => {
                      setShow3d(v);
                      if (v) tools.setTool("select");
                    }}
                    className={`h-9 rounded-[6px] px-3 ${show3d === v ? "bg-accent text-on-accent" : "text-ink-2 hover:text-ink"}`}
                  >
                    {v ? "3D" : "2D"}
                  </button>
                ))}
              </div>
              {!show3d && <Toolbar
                canUndo={state.canUndo}
                canRedo={state.canRedo}
                undoLabel={state.undoLabel}
                redoLabel={state.redoLabel}
                onUndo={undo}
                onRedo={redo}
                zoomPercent={view ? zoomPercent(view) : 100}
                onZoomIn={() => zoomBy(1.25)}
                onZoomOut={() => zoomBy(0.8)}
                onFit={fit}
              />}
            </div>
            <div className="pointer-events-auto">
              {!right && (
                <IconButton
                  label="Eigenschappen tonen"
                  onClick={() => setRight(true)}
                  className="border border-line bg-bg shadow-[var(--shadow-float)]"
                >
                  <PanelRightOpen size={18} />
                </IconButton>
              )}
            </div>
          </div>

          <FloorTabs
            doc={doc}
            activeFloorId={activeFloorId}
            onSelect={(id) => store.setActiveFloor(id)}
            onAdd={() => {
              const { cmd, floorId } = addFloor(doc, "above");
              store.execute(cmd);
              store.setActiveFloor(floorId);
            }}
          />

          <EmptyHint doc={doc} />
        </main>

        {right && (
          <div className="absolute inset-y-0 right-0 z-20 xl:static">
            <PropertiesPanel
              store={store}
              doc={doc}
              activeFloorId={activeFloorId}
              onHide={hidePanel}
              toast={toast.show}
              selection={selection}
              setSelection={selectFromPanel}
              analysis={analysis}
              onDelete={tools.deleteSelection}
              underlayMode={underlayMode}
              onUnderlayOpen={openUnderlay}
              onUnderlayMode={setUnderlayMode}
            />
          </div>
        )}
      </div>

      {wallTypeEdit && (
        <WallTypeDialog
          initial={wallTypeEdit.edit ? (wallType(wallTypeEdit.edit) ?? null) : null}
          usage={wallTypeEdit.edit ? typeUsage(doc, wallTypeEdit.edit) : 0}
          canDelete={wallTypeEdit.edit ? canDeleteWallType(doc, wallTypeEdit.edit) : false}
          onClose={() => setWallTypeEdit(null)}
          onSave={(t) => {
            const isNew = !t.id;
            const full = { ...t, id: t.id ?? newCustomTypeId() };
            const after = saveWallType(doc, full);
            store.execute(
              docCmd(doc, after, isNew ? `Muurtype "${full.name}" gemaakt` : `Muurtype "${full.name}" aangepast`, `Muurtype "${full.name}": ongedaan`, `Muurtype "${full.name}": opnieuw`),
            );
            store.seal();
            setWallTypeEdit(null);
            if (isNew) wallTypeEdit.onCreated?.(full.id);
            toast.show(isNew ? `Muurtype "${full.name}" gemaakt` : `Muurtype "${full.name}" bewaard`);
          }}
          onDelete={() => {
            const id = wallTypeEdit.edit!;
            const name = wallType(id)?.name ?? "Muurtype";
            store.execute(docCmd(doc, deleteWallType(doc, id), `Muurtype "${name}" verwijderd`, `Muurtype "${name}" teruggezet`, `Muurtype "${name}" opnieuw verwijderd`));
            store.seal();
            setWallTypeEdit(null);
          }}
        />
      )}
      {frameEdit && renderFrameDialog(frameEdit)}
      {underlayOpen && <UnderlayDialog open onClose={() => setUnderlayOpen(false)} onDone={placeUnderlay} />}
      <VersionsDialog
        open={versionsOpen}
        onClose={() => setVersionsOpen(false)}
        backend={backend}
        currentDoc={doc}
        toast={toast.show}
        onRestore={(version, when) => {
          store.execute(restoreVersion(doc, { ...version, name: doc.name }, when));
          toast.show(`Versie van ${when} teruggezet. Ongedaan maken kan altijd.`);
        }}
      />

      <Dialog
        open={saveStatus === "conflict"}
        onClose={() => {}}
        title="Dit project werd ook ergens anders gewijzigd"
        width={480}
        actions={
          <>
            <Button
              disabled={resolving}
              onClick={async () => {
                setResolving(true);
                try {
                  const latest = await backend.loadLatest();
                  saver.discard();
                  store.reset(latest);
                  toast.show("De andere versie is geladen");
                } catch {
                  toast.show("Laden lukte niet. Probeer opnieuw.");
                }
                setResolving(false);
              }}
            >
              Andere versie laden
            </Button>
            <Button
              variant="primary"
              disabled={resolving}
              onClick={async () => {
                setResolving(true);
                try {
                  await backend.takeOver();
                  await saver.resume(store.getState().doc);
                  toast.show("Jouw versie is bewaard");
                } catch {
                  toast.show("Bewaren lukte niet. Probeer opnieuw.");
                }
                setResolving(false);
              }}
            >
              Mijn versie {W.save.toLowerCase()}
            </Button>
          </>
        }
      >
        <p>
          Waarschijnlijk staat dit project nog open in een ander venster of op een ander toestel.
          Om niets te overschrijven, hebben we je laatste wijziging nog niet bewaard.
        </p>
        <p className="mt-2">
          Kies je voor je eigen versie? Dan bewaren we de andere versie eerst bij de eerdere
          versies, zodat je ze altijd terug kan halen.
        </p>
      </Dialog>
    </div>
    </FrameEditorContext.Provider>
    </WallTypeEditorContext.Provider>
  );
}

function FloorTabs({
  doc,
  activeFloorId,
  onSelect,
  onAdd,
}: {
  doc: ProjectDoc;
  activeFloorId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  const floors = floorsBottomUp(doc);
  return (
    <nav
      aria-label="Verdiepingen"
      className="absolute bottom-3 right-3 flex flex-col-reverse items-stretch gap-1 rounded-[var(--radius-card)] border border-line bg-bg p-1 shadow-[var(--shadow-float)]"
    >
      {floors.map((f) => (
        <button
          key={f.id}
          type="button"
          aria-current={f.id === activeFloorId ? "true" : undefined}
          onClick={() => onSelect(f.id)}
          className={`h-8 max-w-[160px] truncate rounded-[var(--radius-control)] px-3 text-left text-[13px] ${
            f.id === activeFloorId
              ? "bg-accent-soft font-medium text-accent-ink"
              : "text-ink-2 hover:bg-surface-2 hover:text-ink"
          }`}
        >
          {f.name}
        </button>
      ))}
      <button
        type="button"
        onClick={onAdd}
        title="Verdieping erboven toevoegen"
        aria-label="Verdieping erboven toevoegen"
        className="flex h-8 items-center justify-center rounded-[var(--radius-control)] text-ink-3 hover:bg-surface-2 hover:text-ink"
      >
        <Plus size={16} />
      </button>
    </nav>
  );
}

/** Eenmalige, rustige hint op het lege blad. */
function EmptyHint({ doc }: { doc: ProjectDoc }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- eenmalig lezen
      setShown(localStorage.getItem("hint-tekenvlak") !== "gezien");
    } catch {
      setShown(true);
    }
  }, []);
  if (!shown) return null;
  const room = doc.start.kind === "room";
  return (
    <div className="pointer-events-none absolute inset-x-0 top-16 flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-md items-start gap-3 rounded-[var(--radius-card)] border border-line bg-bg px-4 py-3 text-[13px] leading-relaxed text-ink-2 shadow-[var(--shadow-float)]">
        <p>
          {room ? "Je kamer staat klaar, op ware grootte. " : ""}
          Kies links <strong className="text-ink">Kamer</strong> (K) en sleep een rechthoek, of typ
          de binnenmaten, bv. <strong className="text-ink">4x3</strong> en Enter. Met{" "}
          <strong className="text-ink">Muur</strong> (M) deel je kamers op. Klik op een maat om ze
          aan te passen.
        </p>
        <button
          type="button"
          className="shrink-0 font-medium text-accent-ink hover:underline"
          onClick={() => {
            setShown(false);
            try {
              localStorage.setItem("hint-tekenvlak", "gezien");
            } catch {}
          }}
        >
          Begrepen
        </button>
      </div>
    </div>
  );
}

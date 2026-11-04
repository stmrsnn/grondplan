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
import { DEFAULT_AREA, fitBounds, toScreen, zoomAt, zoomPercent, type Viewport } from "@/lib/editor/viewport";
import { formatMeters, parseLength } from "@/lib/format";
import { analyzeFloor, functionLabel, moveNodes, rebuildFloor, stretch, type RoomInfo } from "@/lib/geometry/plan";
import { addFloor, editFloor, renameProject, restoreVersion, updateRoom } from "@/lib/model/commands";
import { floorsBottomUp } from "@/lib/model/doc";
import type { Vec } from "@/lib/geometry/vec";
import type { Floor, ProjectDoc } from "@/lib/model/types";
import { cleanName } from "@/lib/projects";
import { W } from "@/lib/words";
import type { EditorBackend } from "./backend";
import { Compass } from "./NorthArrow";
import { PropertiesPanel } from "./Panels";
import { PlanCanvas } from "./PlanCanvas";
import { Annotations, Chip, FloorLayer, GhostFloor, Guides, OpeningsLayer, SnapMarker, type Selection } from "./PlanLayers";
import { openingMarks, openingShape, type OpeningShape } from "@/lib/geometry/openings";
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
function areaFor(floor: Floor) {
  const b = analyzeFloor(floor).outerBounds;
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
  const tools = usePlanTools({ store, doc, floor, view, selection, setSelection, toast: toast.show });
  const shownFloor = tools.draft ?? floor;
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
  }, [undo, redo, zoomBy, fit, tools]);

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

  return (
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
            vooraf een breedte, of later in het paneel rechts. Sleep een deur of raam om het te
            verschuiven, ook naar een andere muur.
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
            onTool={tools.onTool}
            cursor={tools.cursor}
            touchOffset={tools.tool === "select" ? 0 : 56}
            overlay={(v) => (
              <>
                <Annotations
                  analysis={analysis}
                  view={v}
                  showDims={!tools.draft && !moving && marks.length === 0}
                  onEditEdge={(room, a, b, at) =>
                    setDimEdit({ room, a, b, at, value: formatMeters(Math.hypot(b.x - a.x, b.y - a.y)).replace(" m", "") })
                  }
                />
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
            {below && <GhostFloor analysis={below} />}
            <FloorLayer analysis={analysis} selection={selection} hover={tools.hover} />
            <OpeningsLayer shapes={openingShapes} selection={selection} hover={tools.hover} ghost={ghostOpening} />
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

          <ToolRail
            tool={tools.tool}
            setTool={tools.setTool}
            wallChoice={tools.wallChoice}
            setWallChoice={tools.setWallChoice}
            buffer={tools.buffer}
            defaults={doc.settings.wallDefaults}
            template={tools.template}
            setTemplate={tools.setTemplate}
            doorKind={tools.doorKind}
            setDoorKind={tools.setDoorKind}
            openingWidth={tools.openingWidth}
            setOpeningWidth={tools.setOpeningWidth}
          />

          <div className="pointer-events-none absolute inset-x-0 top-3 flex items-start justify-between gap-2 px-3">
            <div className="pointer-events-auto" title="Noorden (aanpassen bij Eigenschappen)">
              <Compass angle={doc.settings.northAngle} />
            </div>
            <div className="overflow-x-auto">
              <Toolbar
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
              />
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
            />
          </div>
        )}
      </div>

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

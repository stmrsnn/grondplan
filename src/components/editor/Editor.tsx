"use client";

import { ArrowLeft, PanelLeftOpen, PanelRightOpen, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { IconButton } from "@/components/ui/Button";
import { AccountMenu } from "@/components/ui/AccountMenu";
import { Logo } from "@/components/ui/AppHeader";
import { HelpButton } from "@/components/ui/Help";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useToast } from "@/components/ui/Toast";
import { Autosaver, type SaveStatus } from "@/lib/editor/autosave";
import { EditorStore } from "@/lib/editor/store";
import {
  DEFAULT_AREA,
  fitBounds,
  zoomAt,
  zoomPercent,
  type Viewport,
} from "@/lib/editor/viewport";
import { addFloor, renameProject } from "@/lib/model/commands";
import type { ProjectDoc } from "@/lib/model/types";
import { cleanName } from "@/lib/projects";
import { W } from "@/lib/words";
import { LibraryPanel, PropertiesPanel } from "./Panels";
import { PlanCanvas } from "./PlanCanvas";
import { SaveIndicator } from "./SaveIndicator";
import { Toolbar } from "./Toolbar";

export interface EditorProps {
  initialDoc: ProjectDoc;
  save: (doc: ProjectDoc) => Promise<void>;
  email?: string | null;
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

export function Editor({ initialDoc, save, email }: EditorProps) {
  const toast = useToast();
  const router = useRouter();
  const [store] = useState(() => new EditorStore(initialDoc));
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const { doc, activeFloorId } = state;

  // ---------- automatisch bewaren ----------
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const saver = useMemo(
    () =>
      new Autosaver<ProjectDoc>({
        save: (d) => save({ ...d, name: cleanName(d.name) || "Naamloos project" }),
        onStatus: setSaveStatus,
      }),
    [save],
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
  const [view, setView] = useState<Viewport | null>(null);
  const size = useRef({ w: 0, h: 0 });
  const onResize = useCallback((w: number, h: number) => {
    size.current = { w, h };
    setView((v) => v ?? fitBounds(DEFAULT_AREA, w, h));
  }, []);
  const fit = useCallback(() => {
    // later: rond de getekende muren; nu: het standaardblad
    setView(fitBounds(DEFAULT_AREA, size.current.w, size.current.h));
  }, []);
  const zoomBy = useCallback((f: number) => {
    setView((v) => v && zoomAt(v, { x: size.current.w / 2, y: size.current.h / 2 }, f));
  }, []);

  // ---------- ongedaan maken ----------
  const undo = useCallback(() => {
    const l = store.undo();
    if (l) toast.show(`Ongedaan gemaakt: ${l.toLowerCase()}`);
  }, [store, toast]);
  const redo = useCallback(() => {
    const l = store.redo();
    if (l) toast.show(`Opnieuw gedaan: ${l.toLowerCase()}`);
  }, [store, toast]);

  // ---------- sneltoetsen ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && (key === "z" || key === "y")) {
        if (isTyping(e.target)) {
          // eerst het veld afsluiten, dan het plan ongedaan maken
          (e.target as HTMLElement).blur();
        }
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
  }, [undo, redo, zoomBy, fit]);

  // ---------- zijbalken ----------
  const [left, setLeft] = useState(true);
  const [right, setRight] = useState(true);
  useEffect(() => {
    if (window.innerWidth < 1200) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- smalle schermen: plan krijgt alle ruimte
      setLeft(false);
      setRight(false);
    }
  }, []);

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
        <HelpButton title="Zo werkt het tekenvlak">
          <p>
            <strong className="text-ink">Verschuiven:</strong> sleep het blad met de muis of met
            één vinger. Op een trackpad schuif je met twee vingers.
          </p>
          <p>
            <strong className="text-ink">Zoomen:</strong> draai aan het muiswiel, knijp met twee
            vingers, of gebruik de knoppen − en + bovenaan. Klik op het percentage om alles terug in
            beeld te krijgen.
          </p>
          <p>
            <strong className="text-ink">Vergissing?</strong> Met de pijltjes bovenaan (of Ctrl+Z)
            maak je elke stap ongedaan.
          </p>
          <p>Alles wordt vanzelf bewaard. Rechtsboven zie je &ldquo;{W.saved}&rdquo; staan.</p>
        </HelpButton>
        <ThemeToggle />
        {email && <AccountMenu email={email} />}
      </header>

      <div className="relative flex min-h-0 flex-1">
        {left && (
          <div className="absolute inset-y-0 left-0 z-20 xl:static">
            <LibraryPanel onHide={() => setLeft(false)} />
          </div>
        )}

        <main className="relative min-w-0 flex-1 overflow-hidden" aria-label="Plan">
          <PlanCanvas view={view} onViewChange={setView} onResize={onResize} />

          <div className="pointer-events-none absolute inset-x-0 top-3 flex items-start justify-between gap-2 px-3">
            <div className="pointer-events-auto">
              {!left && (
                <IconButton label="Bibliotheek tonen" onClick={() => setLeft(true)} className="border border-line bg-bg shadow-[var(--shadow-float)]">
                  <PanelLeftOpen size={18} />
                </IconButton>
              )}
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
                mode="2d"
                onMode={(m) => m === "3d" && toast.show("De 3D-weergave volgt in een volgende stap.")}
                onPrint={() => toast.show("Afdrukken op schaal volgt in een volgende stap.")}
              />
            </div>
            <div className="pointer-events-auto">
              {!right && (
                <IconButton label="Eigenschappen tonen" onClick={() => setRight(true)} className="border border-line bg-bg shadow-[var(--shadow-float)]">
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
              const { cmd, floorId } = addFloor(doc);
              store.execute(cmd);
              store.setActiveFloor(floorId);
            }}
          />

          <EmptyHint />
        </main>

        {right && (
          <div className="absolute inset-y-0 right-0 z-20 xl:static">
            <PropertiesPanel
              store={store}
              doc={doc}
              activeFloorId={activeFloorId}
              onHide={() => setRight(false)}
              toast={toast.show}
            />
          </div>
        )}
      </div>
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
  // hoogste verdieping bovenaan in de lijst, zoals in een gebouw
  const floors = [...doc.floors].sort((a, b) => a.elevation - b.elevation);
  return (
    <nav
      aria-label="Verdiepingen"
      className="absolute bottom-14 right-3 flex flex-col-reverse items-stretch gap-1 rounded-[var(--radius-card)] border border-line bg-bg p-1 shadow-[var(--shadow-float)]"
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
        title={`Verdieping ${W.add.toLowerCase()}`}
        aria-label={`Verdieping ${W.add.toLowerCase()}`}
        className="flex h-8 items-center justify-center rounded-[var(--radius-control)] text-ink-3 hover:bg-surface-2 hover:text-ink"
      >
        <Plus size={16} />
      </button>
    </nav>
  );
}

/** Eenmalige, rustige hint op het lege blad. */
function EmptyHint() {
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
  return (
    <div className="pointer-events-none absolute inset-x-0 top-16 flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-md items-start gap-3 rounded-[var(--radius-card)] border border-line bg-bg px-4 py-3 text-[13px] leading-relaxed text-ink-2 shadow-[var(--shadow-float)]">
        <p>
          Je tekenvlak is klaar. <strong className="text-ink">Sleep</strong> om te verschuiven en{" "}
          <strong className="text-ink">zoom</strong> met het muiswiel of twee vingers. Muren
          tekenen komt in de volgende stap.
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

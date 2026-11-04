"use client";

import { Maximize, Minus, Plus, Redo2, Undo2 } from "lucide-react";
import { IconButton } from "@/components/ui/Button";
import { W } from "@/lib/words";

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

function Divider() {
  return <span className="mx-1 h-6 w-px bg-line" aria-hidden="true" />;
}

/**
 * De kleine werkbalk bovenaan het tekenvlak. Knoppen verschijnen pas wanneer
 * ze iets doen (3D en afdrukken komen in latere stappen).
 */
export function Toolbar({
  canUndo,
  canRedo,
  undoLabel,
  redoLabel,
  onUndo,
  onRedo,
  zoomPercent,
  onZoomIn,
  onZoomOut,
  onFit,
}: {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel?: string;
  redoLabel?: string;
  onUndo: () => void;
  onRedo: () => void;
  zoomPercent: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
}) {
  const mod = isMac() ? "⌘" : "Ctrl+";
  return (
    <div
      role="toolbar"
      aria-label="Werkbalk"
      className="pointer-events-auto flex items-center rounded-[var(--radius-card)] border border-line bg-bg p-1 shadow-[var(--shadow-float)]"
    >
      <IconButton
        size="sm"
        label={`${W.undo}${undoLabel ? `: ${undoLabel.toLowerCase()}` : ""} (${mod}Z)`}
        onClick={onUndo}
        disabled={!canUndo}
      >
        <Undo2 size={18} />
      </IconButton>
      <IconButton
        size="sm"
        label={`${W.redo}${redoLabel ? `: ${redoLabel.toLowerCase()}` : ""} (${mod}⇧Z)`}
        onClick={onRedo}
        disabled={!canRedo}
      >
        <Redo2 size={18} />
      </IconButton>
      <Divider />
      <IconButton size="sm" label="Uitzoomen (−)" onClick={onZoomOut}>
        <Minus size={18} />
      </IconButton>
      <button
        type="button"
        onClick={onFit}
        title="Alles in beeld (0)"
        className="tabular h-8 w-14 rounded-[var(--radius-control)] text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink"
      >
        {zoomPercent}%
      </button>
      <IconButton size="sm" label="Inzoomen (+)" onClick={onZoomIn}>
        <Plus size={18} />
      </IconButton>
      <IconButton size="sm" label="Alles in beeld (0)" onClick={onFit} className="max-sm:hidden">
        <Maximize size={16} />
      </IconButton>
    </div>
  );
}

"use client";

import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, IconButton } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { formatWhen } from "@/lib/format";
import { readPreview } from "@/lib/model/preview";
import {
  cleanName,
  deleteProject,
  renameProject,
  type ProjectRow,
} from "@/lib/projects";
import { W } from "@/lib/words";
import { NewProjectDialog } from "./NewProjectDialog";

type Modal =
  | { kind: "new" }
  | { kind: "rename"; project: ProjectRow }
  | { kind: "delete"; project: ProjectRow }
  | null;

export function ProjectList({ initial }: { initial: ProjectRow[] }) {
  const [projects, setProjects] = useState(initial);
  const [modal, setModal] = useState<Modal>(null);
  const toast = useToast();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Jouw projecten</h1>
        {projects.length > 0 && (
          <Button variant="primary" icon={<Plus size={18} />} onClick={() => setModal({ kind: "new" })}>
            {W.newProject}
          </Button>
        )}
      </div>

      {projects.length === 0 ? (
        <EmptyState onNew={() => setModal({ kind: "new" })} />
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onRename={() => setModal({ kind: "rename", project: p })}
              onDelete={() => setModal({ kind: "delete", project: p })}
            />
          ))}
        </ul>
      )}

      <NewProjectDialog open={modal?.kind === "new"} onClose={() => setModal(null)} />
      <NameDialog
        open={modal?.kind === "rename"}
        title="Project hernoemen"
        initial={modal?.kind === "rename" ? modal.project.name : ""}
        confirm={W.save}
        onClose={() => setModal(null)}
        onSubmit={async (name) => {
          if (modal?.kind !== "rename") return;
          await renameProject(modal.project.id, name);
          setProjects((ps) =>
            ps.map((p) => (p.id === modal.project.id ? { ...p, name } : p)),
          );
          toast.show("Naam bewaard");
        }}
      />
      <DeleteDialog
        project={modal?.kind === "delete" ? modal.project : null}
        onClose={() => setModal(null)}
        onDeleted={(id) => {
          setProjects((ps) => ps.filter((p) => p.id !== id));
          toast.show("Project verwijderd");
        }}
      />
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
        <Plus size={24} />
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Begin aan je eerste plan</h2>
        <p className="max-w-sm text-sm text-ink-2">
          Geef je project een naam. Daarna kom je meteen op het tekenvlak.
        </p>
      </div>
      <Button variant="primary" icon={<Plus size={18} />} onClick={onNew}>
        {W.newProject}
      </Button>
    </div>
  );
}

function ProjectCard({
  project,
  onRename,
  onDelete,
}: {
  project: ProjectRow;
  onRename: () => void;
  onDelete: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menu]);

  return (
    <li className="group relative flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-bg transition-colors hover:border-line-strong">
      <Link href={`/projecten/${project.id}`} className="flex flex-col">
        <CardPreview raw={project.preview} />
        <div className="flex flex-col gap-0.5 px-4 py-3 pr-12">
          <span className="truncate text-[15px] font-medium text-ink">{project.name}</span>
          <span className="text-[13px] text-ink-3">Gewijzigd {formatWhen(project.updated_at)}</span>
        </div>
      </Link>
      <div ref={ref} className="absolute bottom-2.5 right-2">
        <IconButton label="Meer acties" size="sm" onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
          <MoreHorizontal size={18} />
        </IconButton>
        {menu && (
          <div className="absolute bottom-10 right-0 z-30 w-44 rounded-[var(--radius-card)] border border-line bg-bg p-1.5 shadow-[var(--shadow-float)]">
            <MenuItem icon={<Pencil size={16} />} onClick={() => (setMenu(false), onRename())}>
              {W.rename}
            </MenuItem>
            <MenuItem icon={<Trash2 size={16} />} danger onClick={() => (setMenu(false), onDelete())}>
              {W.remove}
            </MenuItem>
          </div>
        )}
      </div>
    </li>
  );
}

function MenuItem({
  icon,
  children,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-[var(--radius-control)] px-3 py-2 text-left text-sm hover:bg-surface-2 ${
        danger ? "text-danger" : "text-ink"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function NameDialog({
  open,
  title,
  initial,
  confirm,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  initial: string;
  confirm: string;
  onClose: () => void;
  /** Geeft optioneel een adres terug om naartoe te gaan. */
  onSubmit: (name: string) => Promise<string | void>;
}) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- formulier leegmaken bij openen
      setName(initial);
      setError(null);
      setBusy(false);
    }
  }, [open, initial]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = cleanName(name);
    if (!clean) {
      setError("Geef je project een naam.");
      return;
    }
    setBusy(true);
    try {
      const to = await onSubmit(clean);
      onClose();
      if (to) router.push(to);
    } catch {
      setBusy(false);
      setError("Dat lukte niet. Controleer je internetverbinding en probeer opnieuw.");
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      actions={
        <>
          <Button onClick={onClose}>{W.cancel}</Button>
          <Button variant="primary" type="submit" form="name-form" disabled={busy}>
            {busy ? "Even geduld…" : confirm}
          </Button>
        </>
      }
    >
      <form id="name-form" onSubmit={submit}>
        <Field
          label="Naam"
          autoFocus
          placeholder="Mijn woning"
          value={name}
          maxLength={120}
          error={error ?? undefined}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
        />
      </form>
    </Dialog>
  );
}

function DeleteDialog({
  project,
  onClose,
  onDeleted,
}: {
  project: ProjectRow | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- terugzetten bij openen
    setBusy(false);
    setError(null);
  }, [project]);

  return (
    <Dialog
      open={!!project}
      onClose={onClose}
      title="Project verwijderen?"
      actions={
        <>
          <Button onClick={onClose}>{W.cancel}</Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={async () => {
              if (!project) return;
              setBusy(true);
              try {
                await deleteProject(project.id);
                onDeleted(project.id);
                onClose();
              } catch {
                setBusy(false);
                setError("Verwijderen lukte niet. Probeer opnieuw.");
              }
            }}
          >
            {W.remove}
          </Button>
        </>
      }
    >
      <p>
        &ldquo;{project?.name}&rdquo; en alles wat erin getekend is, verdwijnt definitief. Dit kan
        je niet ongedaan maken.
      </p>
      {error && <p className="mt-2 text-danger">{error}</p>}
    </Dialog>
  );
}

function CardPreview({ raw }: { raw: unknown }) {
  const preview = readPreview(raw);
  return (
    <div
      className="flex h-36 items-center justify-center border-b border-line bg-canvas"
      style={{
        backgroundImage:
          "linear-gradient(var(--grid-minor) 1px, transparent 1px), linear-gradient(90deg, var(--grid-minor) 1px, transparent 1px)",
        backgroundSize: "16px 16px",
      }}
      aria-hidden="true"
    >
      {preview ? (
        <svg viewBox={`0 0 ${preview.w} ${preview.h}`} className="h-full w-full">
          {preview.lines.map(([x1, y1, x2, y2, t], i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--ink)" strokeWidth={t} strokeLinecap="square" />
          ))}
        </svg>
      ) : (
        <span className="rounded-full bg-bg px-3 py-1 text-[12px] text-ink-3">Nog leeg</span>
      )}
    </div>
  );
}

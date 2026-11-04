"use client";

import { ArrowLeft, Home, ImageUp, LayoutTemplate, Sofa } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { formatMeters, parseLength } from "@/lib/format";
import type { StartChoice } from "@/lib/model/types";
import { cleanName, createProject } from "@/lib/projects";
import { W } from "@/lib/words";

type Kind = StartChoice["kind"];

const CHOICES: { kind: Kind; title: string; text: string; icon: ReactNode; soon?: boolean }[] = [
  {
    kind: "house",
    title: "Een woning of verdieping tekenen",
    text: "Je begint op een leeg blad en tekent kamer per kamer.",
    icon: <Home size={22} />,
  },
  {
    kind: "room",
    title: "Eén kamer inrichten",
    text: "Bijvoorbeeld: mijn living is 6 bij 4,5 meter.",
    icon: <Sofa size={22} />,
  },
  {
    kind: "trace",
    title: "Een bestaand plan overtrekken",
    text: "Laad een foto of pdf op, bijvoorbeeld van de makelaar.",
    icon: <ImageUp size={22} />,
    soon: true,
  },
  {
    kind: "example",
    title: "Vertrekken van een voorbeeldwoning",
    text: "Pas een kant-en-klaar plan aan naar jouw situatie.",
    icon: <LayoutTemplate size={22} />,
    soon: true,
  },
];

const FUNCTIONS = [
  ["living", "Living"],
  ["slaapkamer", "Slaapkamer"],
  ["keuken", "Keuken"],
  ["badkamer", "Badkamer"],
  ["bureau", "Bureau"],
  ["andere", "Andere"],
] as const;

/** De welkomstvraag "Wat wil je doen?", gevolgd door een naam (en bij één kamer: de maten). */
export function NewProjectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind | null>(null);
  const [name, setName] = useState("");
  const [fn, setFn] = useState<string>("living");
  const [width, setWidth] = useState("");
  const [depth, setDepth] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- formulier leegmaken bij openen
      setKind(null);
      setName("");
      setFn("living");
      setWidth("");
      setDepth("");
      setErrors({});
      setBusy(false);
    }
  }, [open]);

  const pick = (k: Kind) => {
    setKind(k);
    setName(k === "room" ? "Living" : "Mijn woning");
    setErrors({});
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const clean = cleanName(name);
    if (!clean) errs.name = "Geef je project een naam.";
    let start: StartChoice = { kind: "house" };
    if (kind === "room") {
      const w = parseLength(width);
      const d = parseLength(depth);
      const check = (v: number | null, key: string) => {
        if (v === null) errs[key] = "Typ een maat, bijvoorbeeld 4,5";
        else if (v < 1000 || v > 30000) errs[key] = `Kies tussen ${formatMeters(1000)} en ${formatMeters(30000)}`;
      };
      check(w, "width");
      check(d, "depth");
      if (w !== null && d !== null) start = { kind: "room", width: w, depth: d, roomFunction: fn };
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const id = await createProject(clean, start);
      onClose();
      router.push(`/projecten/${id}`);
    } catch {
      setBusy(false);
      setErrors({ name: "Dat lukte niet. Controleer je internetverbinding en probeer opnieuw." });
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={kind ? W.newProject : "Wat wil je doen?"}
      width={kind ? 440 : 560}
      actions={
        kind ? (
          <>
            <Button icon={<ArrowLeft size={16} />} onClick={() => setKind(null)}>
              Terug
            </Button>
            <Button variant="primary" type="submit" form="new-project-form" disabled={busy}>
              {busy ? "Even geduld…" : W.add}
            </Button>
          </>
        ) : undefined
      }
    >
      {!kind ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {CHOICES.map((c) => (
            <button
              key={c.kind}
              type="button"
              onClick={() => !c.soon && pick(c.kind)}
              aria-disabled={c.soon}
              className={`relative flex flex-col items-start gap-2 rounded-[var(--radius-card)] border p-4 text-left transition-colors ${
                c.soon
                  ? "cursor-default border-line bg-surface"
                  : "border-line bg-bg hover:border-accent hover:bg-accent-soft/40"
              }`}
            >
              <span className={c.soon ? "text-ink-3" : "text-accent"}>{c.icon}</span>
              <span className={`text-sm font-medium ${c.soon ? "text-ink-3" : "text-ink"}`}>{c.title}</span>
              <span className="text-[13px] leading-snug text-ink-3">{c.text}</span>
              {c.soon && (
                <span className="absolute right-3 top-3 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-ink-3">
                  Binnenkort
                </span>
              )}
            </button>
          ))}
        </div>
      ) : (
        <form id="new-project-form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
          {kind === "room" && (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-ink-2">Welke kamer?</span>
                <select
                  value={fn}
                  onChange={(e) => {
                    setFn(e.target.value);
                    const label = FUNCTIONS.find(([v]) => v === e.target.value)?.[1] ?? "";
                    if (FUNCTIONS.some(([, l]) => l === name) || !name) setName(label === "Andere" ? "Kamer" : label);
                  }}
                  className="h-10 rounded-[var(--radius-control)] border border-line bg-bg px-3 text-sm text-ink hover:border-line-strong focus:border-accent focus:outline-none"
                >
                  {FUNCTIONS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Breedte"
                  placeholder="6"
                  inputMode="decimal"
                  suffix="m"
                  value={width}
                  error={errors.width}
                  onChange={(e) => setWidth(e.target.value)}
                />
                <Field
                  label="Diepte"
                  placeholder="4,5"
                  inputMode="decimal"
                  suffix="m"
                  value={depth}
                  error={errors.depth}
                  onChange={(e) => setDepth(e.target.value)}
                />
              </div>
              <p className="-mt-2 text-[12px] text-ink-3">
                Binnenmaten, van muur tot muur, zoals je ze met een rolmeter meet.
              </p>
            </>
          )}
          <Field
            label="Naam van het project"
            placeholder="Mijn woning"
            value={name}
            maxLength={120}
            error={errors.name}
            onChange={(e) => setName(e.target.value)}
          />
        </form>
      )}
    </Dialog>
  );
}

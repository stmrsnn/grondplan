"use client";

import { useEffect, useState } from "react";
import { Field } from "@/components/ui/Field";
import { formatMeters, parseLength } from "@/lib/format";

/**
 * Invoerveld voor een maat. Toont "2,60 m", aanvaardt "2,6", "260", "260 cm"…
 * en geeft millimeter terug bij Enter of bij het verlaten van het veld.
 */
export function LengthField({
  label,
  value,
  onCommit,
  min,
  max,
  hint,
}: {
  label: string;
  value: number;
  /** Geeft eventueel een foutboodschap terug (bv. "past niet"). */
  onCommit: (mm: number) => void | string;
  min: number;
  max: number;
  hint?: React.ReactNode;
}) {
  const [text, setText] = useState(formatMeters(value));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- volgen bij ongedaan maken
    setText(formatMeters(value));
    setError(null);
  }, [value]);

  const commit = () => {
    const mm = parseLength(text);
    if (mm === null) {
      setError("Typ een maat, bijvoorbeeld 2,60");
      return;
    }
    if (mm < min || mm > max) {
      setError(`Kies tussen ${formatMeters(min)} en ${formatMeters(max)}`);
      return;
    }
    setError(null);
    setText(formatMeters(mm));
    if (mm !== value) {
      const err = onCommit(mm);
      if (typeof err === "string") setError(err);
    }
  };

  return (
    <Field
      label={label}
      value={text}
      inputMode="decimal"
      hint={hint}
      error={error ?? undefined}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
        if (e.key === "Escape") {
          setText(formatMeters(value));
          setError(null);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

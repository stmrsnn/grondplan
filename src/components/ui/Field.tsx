import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: ReactNode;
  error?: string;
  suffix?: string;
}

/** Tekstveld met label erboven, optionele eenheid erachter en foutmelding eronder. */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, error, suffix, id, className = "", ...rest },
  ref,
) {
  const inputId = id ?? `f-${label.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <label htmlFor={inputId} className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-[13px] font-medium text-ink-2">{label}</span>
      <span
        className={`flex h-10 items-center rounded-[var(--radius-control)] border bg-bg px-3 focus-within:border-accent ${
          error ? "border-danger" : "border-line hover:border-line-strong"
        }`}
      >
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error}
          className="tabular min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
          {...rest}
        />
        {suffix && <span className="pl-2 text-[13px] text-ink-3">{suffix}</span>}
      </span>
      {error ? (
        <span className="text-[12px] text-danger">{error}</span>
      ) : hint ? (
        <span className="text-[12px] text-ink-3">{hint}</span>
      ) : null}
    </label>
  );
});

/** Schakelaar aan/uit met uitleg. */
export function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3">
      <span className="flex flex-col">
        <span className="text-sm text-ink">{label}</span>
        {hint && <span className="text-[12px] text-ink-3">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors ${
          checked ? "bg-accent" : "bg-line-strong"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${
            checked ? "left-[18px]" : "left-0.5"
          }`}
        />
      </button>
    </label>
  );
}

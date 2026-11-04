import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "sm";

const base =
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] font-medium transition-colors select-none whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed active:translate-y-px";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover",
  secondary: "bg-bg text-ink border border-line hover:border-line-strong hover:bg-surface",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
  danger: "bg-danger text-white hover:bg-danger-hover",
};

const sizes: Record<Size, string> = {
  md: "h-10 px-4 text-sm",
  sm: "h-8 px-3 text-[13px]",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}

/** De enige knop van de app. Eén "primary" per scherm of pop-up. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon, className = "", children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  size?: Size;
}

/** Knop met enkel een icoon. Het label verschijnt als tooltip en voor schermlezers. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, active, size = "md", className = "", children, type = "button", ...rest },
  ref,
) {
  const dim = size === "md" ? "h-10 w-10" : "h-8 w-8";
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={`${dim} inline-flex shrink-0 items-center justify-center rounded-[var(--radius-control)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        active ? "bg-accent-soft text-accent-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
});

/**
 * Getallen en maten in Belgisch Nederlands: decimale komma, duizendtal met punt.
 * Intern rekenen we altijd in millimeter (gehele getallen).
 */

const nf = (min: number, max: number) =>
  new Intl.NumberFormat("nl-BE", {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
    useGrouping: true,
  });

const f0 = nf(0, 0);
const f1 = nf(1, 1);
const f2 = nf(2, 2);

/** 1234567 → "1.234.567" */
export function formatNumber(n: number): string {
  return f0.format(n);
}

/** Lengte in mm → "3,25 m" (vanaf 1 m) of "73 cm" (korter dan 1 m). */
export function formatLength(mm: number): string {
  if (Math.abs(mm) >= 1000) return `${f2.format(mm / 1000)} m`;
  return `${f0.format(mm / 10)} cm`;
}

/** Lengte in mm → altijd in meter: "0,73 m". Handig voor maatlijnen. */
export function formatMeters(mm: number): string {
  return `${f2.format(mm / 1000)} m`;
}

/** Oppervlakte in mm² → "27,0 m²". */
export function formatArea(mm2: number): string {
  return `${f1.format(mm2 / 1_000_000)} m²`;
}

/**
 * Leest een lengte die een leek intypt en geeft millimeter terug (afgerond).
 * Zonder eenheid geldt meter als het getal klein is (≤ 50) en anders centimeter:
 * "3,25" → 3250, "325" → 3250. Met eenheid: "325 cm", "3,25 m", "3250 mm".
 * Geeft null bij onleesbare invoer.
 */
export function parseLength(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, "");
  const m = s.match(/^(-?[\d.,]+)(mm|cm|m)?$/);
  if (!m) return null;
  let num = m[1];
  // "1.250,5" → duizendtal met punt + komma; "3,25" → komma; "3.25" → punt als decimaal
  if (num.includes(",")) {
    num = num.replace(/\./g, "").replace(",", ".");
  } else if ((num.match(/\./g) ?? []).length > 1) {
    num = num.replace(/\./g, "");
  }
  const value = Number(num);
  if (!Number.isFinite(value)) return null;
  const unit = m[2] ?? (Math.abs(value) <= 50 ? "m" : "cm");
  const factor = unit === "m" ? 1000 : unit === "cm" ? 10 : 1;
  return Math.round(value * factor);
}

const dateFmt = new Intl.DateTimeFormat("nl-BE", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("nl-BE", {
  hour: "2-digit",
  minute: "2-digit",
});

/** "vandaag om 12:40", "gisteren om 09:05" of "3 nov. 2026" */
export function formatWhen(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const startOfDay = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (diffDays === 0) return `vandaag om ${timeFmt.format(d)}`;
  if (diffDays === 1) return `gisteren om ${timeFmt.format(d)}`;
  return dateFmt.format(d);
}

const f3 = new Intl.NumberFormat("nl-BE", { minimumFractionDigits: 2, maximumFractionDigits: 3 });

/**
 * Maat op het plan, zoals een architect ze schrijft: meter zonder eenheid,
 * "6,00" of "0,38"; een halve centimeter blijft zichtbaar ("0,095").
 */
export function formatDim(mm: number): string {
  return f3.format(Math.round(mm) / 1000);
}

/** Oppervlakte op het plan: "27,00 m²". */
export function formatPlanArea(mm2: number): string {
  return `${f2.format(mm2 / 1_000_000)} m²`;
}

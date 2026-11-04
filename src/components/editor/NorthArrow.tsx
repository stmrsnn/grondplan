/** Kompasroos: de pijl wijst naar het noorden, `angle` graden met de klok mee vanaf boven. */
export function Compass({ angle, size = 44 }: { angle: number; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 44 44"
      role="img"
      aria-label={`Noordpijl, ${angle}° gedraaid`}
      className="shrink-0"
    >
      <circle cx="22" cy="22" r="20" fill="var(--bg)" stroke="var(--border-strong)" />
      <g transform={`rotate(${angle} 22 22)`}>
        <path d="M22 12 L26.5 25 L22 22.5 L17.5 25 Z" fill="var(--accent)" />
        <path d="M22 34 L26.5 25 L22 27.5 L17.5 25 Z" fill="var(--text-3)" opacity="0.5" />
        <text x="22" y="10.5" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="var(--accent)">
          N
        </text>
      </g>
    </svg>
  );
}

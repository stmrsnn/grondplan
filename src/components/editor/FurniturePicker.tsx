"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { CATEGORY_LABEL, LIBRARY, type Category, type FurnitureDef } from "@/lib/furniture/library";
import { FurnitureSymbol } from "./FurnitureLayer";

const cmText = (mm: number) => `${Math.round(mm / 10)}`;

/** Klein vooraanzicht van boven: de lijntekening, passend in het tegeltje. */
function Thumb({ def }: { def: FurnitureDef }) {
  // ruimte voor stoelen rond een tafel
  const extra = def.shape === "tafel" || def.shape === "tafel-rond" ? 500 : 60;
  const w = def.w + extra * 2;
  const d = def.d + extra * 2;
  return (
    <svg viewBox={`${-w / 2} ${-d / 2} ${w} ${d}`} className="h-full w-full" aria-hidden>
      <FurnitureSymbol def={def} w={def.w} d={def.d} />
    </svg>
  );
}

/**
 * De meubelbibliotheek bij het gereedschap Inrichten: zoeken, per groep
 * bladeren, en een meubel kiezen om te plaatsen.
 */
export function FurniturePicker({ value, onPick }: { value: string | null; onPick: (id: string) => void }) {
  const [cat, setCat] = useState<Category | "alles">("zitten");
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (term) return LIBRARY.filter((d) => d.name.toLowerCase().includes(term) || CATEGORY_LABEL[d.category].toLowerCase().includes(term));
    return cat === "alles" ? LIBRARY : LIBRARY.filter((d) => d.category === cat);
  }, [cat, q]);
  return (
    <div className="flex flex-col gap-2">
      <label className="relative">
        <Search size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-3" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Zoek: bed, zetel, douche…"
          aria-label="Meubel zoeken"
          className="h-8 w-full rounded-[var(--radius-control)] border border-line bg-bg pl-7 pr-2 text-[12.5px] text-ink focus:border-accent focus:outline-none"
        />
      </label>
      {!q && (
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Groepen">
          {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={cat === c}
              onClick={() => setCat(c)}
              className={`rounded-full border px-2 py-0.5 text-[11.5px] ${cat === c ? "border-accent bg-accent text-on-accent" : "border-line text-ink hover:border-accent hover:bg-accent-soft"}`}
            >
              {CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
      )}
      <div className="-mr-1 grid max-h-[46vh] grid-cols-3 gap-1 overflow-y-auto pr-1" role="radiogroup" aria-label="Meubels">
        {list.map((d) => (
          <button
            key={d.id}
            type="button"
            role="radio"
            aria-checked={value === d.id}
            aria-label={d.name}
            title={`${d.name} · ${cmText(d.w)} × ${cmText(d.d)} cm`}
            onClick={() => onPick(d.id)}
            className={`flex h-[92px] flex-col items-center justify-between gap-0.5 rounded-[var(--radius-control)] border px-1 pb-1 pt-1.5 text-[10.5px] leading-[1.15] ${
              value === d.id ? "border-accent bg-accent-soft text-ink ring-1 ring-accent" : "border-line text-ink-2 hover:border-accent hover:bg-accent-soft"
            }`}
          >
            <span className="flex h-[48px] w-full items-center justify-center p-0.5">
              <Thumb def={d} />
            </span>
            <span className="line-clamp-2 text-center [overflow-wrap:anywhere]">{d.name}</span>
          </button>
        ))}
        {list.length === 0 && <p className="col-span-3 py-4 text-center text-ink-3">Niets gevonden. Probeer een ander woord.</p>}
      </div>
    </div>
  );
}

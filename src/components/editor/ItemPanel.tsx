"use client";

import { Copy, RotateCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { EditorStore } from "@/lib/editor/store";
import { CATEGORY_LABEL, FINISHES, finishColor, furnitureDef } from "@/lib/furniture/library";
import { addItem, updateItem } from "@/lib/furniture/place";
import { editFloor } from "@/lib/model/commands";
import type { Floor, Item } from "@/lib/model/types";
import { LengthField } from "./LengthField";
import { Swatches } from "./Swatches";

/** Een gekozen meubel: maten, draaien, kleur, kopiëren en verwijderen. */
export function ItemPanel({
  store,
  floor,
  itemId,
  onDelete,
  onSelect,
}: {
  store: EditorStore;
  floor: Floor;
  itemId: string;
  onDelete: () => void;
  onSelect: (id: string) => void;
}) {
  const it = floor.items.find((x) => x.id === itemId);
  const def = it && furnitureDef(it.libraryRef);
  if (!it || !def) return <p className="text-sm text-ink-3">Dit meubel bestaat niet meer.</p>;
  const apply = (patch: Partial<Item>, what: string) => {
    store.execute(editFloor(floor, updateItem(floor, it.id, patch), `${def.name}: ${what}`, `${def.name}: ${what} ongedaan`, `${def.name}: ${what} opnieuw`));
    store.seal();
  };
  const field = (label: string, key: "width" | "depth" | "height", range?: [number, number]) =>
    range ? (
      <LengthField
        key={key}
        label={label}
        value={it[key]}
        min={range[0]}
        max={range[1]}
        onCommit={(mm) => {
          if (mm < range[0] || mm > range[1]) return `Tussen ${range[0] / 10} en ${range[1] / 10} cm`;
          apply({ [key]: mm }, label.toLowerCase());
        }}
      />
    ) : null;
  const swatches = FINISHES[def.finish];
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold">{def.name}</h3>
        <p className="text-[12px] text-ink-3">{CATEGORY_LABEL[def.category]}</p>
      </div>
      <p className="tabular text-[13px] text-ink-2">
        {Math.round(it.width / 10)} × {Math.round(it.depth / 10)} cm, {Math.round(it.height / 10)} cm hoog
      </p>
      {(def.resize?.w || def.resize?.d || def.resize?.h) && (
        <div className="grid grid-cols-2 gap-2">
          {field("Breedte", "width", def.resize?.w)}
          {field("Diepte", "depth", def.resize?.d)}
          {field("Hoogte", "height", def.resize?.h)}
        </div>
      )}
      {swatches.length > 1 && (
        <Swatches
          label={def.finish === "stof" ? "Stof" : def.finish === "hout" ? "Hout" : def.finish === "front" ? "Afwerking" : "Kleur"}
          note={finishColor(def, it.color).label}
          value={finishColor(def, it.color).id}
          options={swatches.map((s) => ({ id: s.id, label: s.label, background: s.color }))}
          onPick={(id) => apply({ color: id }, "kleur")}
        />
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" icon={<RotateCw size={15} />} title="Sneltoets R" onClick={() => apply({ rotation: (it.rotation + 90) % 360 }, "gedraaid")}>
          Draaien
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon={<Copy size={15} />}
          title="Sneltoets Ctrl+D"
          onClick={() => {
            const copy = { ...it, id: globalThis.crypto.randomUUID(), x: it.x + 300, y: it.y + 300 };
            store.execute(editFloor(floor, addItem(floor, copy), `${def.name} gekopieerd`, "Kopie weggehaald", `${def.name} opnieuw gekopieerd`));
            store.seal();
            onSelect(copy.id);
          }}
        >
          Kopiëren
        </Button>
      </div>
      <p className="text-[12px] leading-relaxed text-ink-3">
        Sleep om te verschuiven: tegen een muur kleeft het vanzelf. Pijltjes schuiven het een beetje op, R draait een kwartslag.
      </p>
      <Button size="sm" variant="ghost" icon={<Trash2 size={16} />} className="self-start text-danger! hover:text-danger!" onClick={onDelete}>
        Verwijderen
      </Button>
    </section>
  );
}

"use client";

import { FileImage, FileText, Loader2, Ruler, Scan } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { parseLength } from "@/lib/format";
import type { Vec } from "@/lib/geometry/vec";
import { planRectify, rectifyPixels } from "@/lib/underlay/homography";
import { canvasToBlob, isPdf, pdfPageCount, renderImage, renderPdfPage } from "@/lib/underlay/load";

export interface UnderlayResult {
  blob: Blob;
  name: string;
  pxWidth: number;
  pxHeight: number;
  /** mm per pixel */
  scale: number;
}

type Method = "line" | "rect";
type Step =
  | { kind: "pick" }
  | { kind: "page"; file: File; pages: number }
  | { kind: "busy"; text: string }
  | { kind: "method"; file: File; canvas: HTMLCanvasElement; drawing: boolean }
  | { kind: "points"; file: File; canvas: HTMLCanvasElement; drawing: boolean; method: Method };

const fieldCls =
  "tabular h-10 w-full rounded-[var(--radius-control)] border border-line bg-bg px-3 text-sm text-ink hover:border-line-strong focus:border-accent focus:outline-none";

/**
 * (Wordt pas getoond als hij open is, zodat hij telkens fris begint.)
 * Een foto of pdf van een bestaand plan klaarzetten om over te trekken:
 * bestand kiezen, schaal instellen met twee punten en een gekende maat, of een
 * schuine foto rechttrekken met de vier hoeken van een rechthoek.
 */
export function UnderlayDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (r: UnderlayResult) => Promise<void>;
}) {
  const [step, setStep] = useState<Step>({ kind: "pick" });
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const load = async (file: File, pageNo?: number) => {
    setError(null);
    try {
      if (isPdf(file)) {
        if (pageNo === undefined) {
          setStep({ kind: "busy", text: "Pdf openen…" });
          const pages = await pdfPageCount(file);
          if (pages > 1) {
            setPage(1);
            return setStep({ kind: "page", file, pages });
          }
          pageNo = 1;
        }
        setStep({ kind: "busy", text: `Pagina ${pageNo} omzetten…` });
        const canvas = await renderPdfPage(file, pageNo);
        setStep({ kind: "method", file, canvas, drawing: true });
      } else {
        setStep({ kind: "busy", text: "Foto openen…" });
        const canvas = await renderImage(file);
        setStep({ kind: "method", file, canvas, drawing: false });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dit bestand kon niet geopend worden.");
      setStep({ kind: "pick" });
    }
  };

  const finish = async (canvas: HTMLCanvasElement, scale: number, file: File, drawing: boolean) => {
    setStep({ kind: "busy", text: "Bewaren…" });
    try {
      const blob = await canvasToBlob(canvas, drawing ? "drawing" : "photo");
      if (blob.size > 15 * 1024 * 1024) throw new Error("Het bestand is te groot (meer dan 15 MB).");
      await onDone({ blob, name: file.name, pxWidth: canvas.width, pxHeight: canvas.height, scale });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bewaren lukte niet.");
      setStep({ kind: "method", file, canvas, drawing });
    }
  };

  const wide = step.kind === "points";
  return (
    <Dialog open={open} onClose={onClose} title="Plan overtrekken" width={wide ? 980 : 520}>
      {error && (
        <p role="alert" className="mb-3 rounded-[var(--radius-control)] bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {step.kind === "pick" && <Pick onFile={(f) => void load(f)} />}
      {step.kind === "page" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-2">Deze pdf heeft {step.pages} pagina&apos;s. Welke wil je overtrekken?</p>
          <label className="flex items-center gap-2 text-sm">
            Pagina
            <input
              type="number"
              min={1}
              max={step.pages}
              value={page}
              onChange={(e) => setPage(Math.min(step.pages, Math.max(1, Number(e.target.value) || 1)))}
              className={`${fieldCls} w-24`}
            />
            van {step.pages}
          </label>
          <div className="flex justify-end">
            <Button variant="primary" onClick={() => void load(step.file, page)}>
              Openen
            </Button>
          </div>
        </div>
      )}
      {step.kind === "busy" && (
        <p className="flex items-center gap-2 py-6 text-sm text-ink-2">
          <Loader2 size={18} className="animate-spin" /> {step.text}
        </p>
      )}
      {step.kind === "method" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-2">Hoe zetten we het op schaal?</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <MethodCard
              icon={<Ruler size={20} />}
              title="Twee punten en een maat"
              text="Voor een scan, een pdf of een foto recht van boven. Klik op het begin en einde van een maat die je kent."
              onClick={() => setStep({ ...step, kind: "points", method: "line" })}
            />
            <MethodCard
              icon={<Scan size={20} />}
              title="Vier hoeken van een rechthoek"
              text="Voor een schuin genomen foto. Klik de hoeken van iets rechthoekigs waarvan je de maten kent; we trekken de foto recht."
              onClick={() => setStep({ ...step, kind: "points", method: "rect" })}
            />
          </div>
        </div>
      )}
      {step.kind === "points" && (
        <Points
          canvas={step.canvas}
          method={step.method}
          onBack={() => setStep({ ...step, kind: "method" })}
          onError={setError}
          onDone={(canvas, scale) => void finish(canvas, scale, step.file, step.drawing)}
        />
      )}
    </Dialog>
  );
}

function Pick({ onFile }: { onFile: (f: File) => void }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-2">
        Heb je al een plan op papier, als pdf of als foto? Leg het onder je tekening en teken de muren erover.
      </p>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files[0];
          if (f) onFile(f);
        }}
        className={`flex flex-col items-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed px-4 py-10 text-sm ${
          over ? "border-accent bg-accent-soft" : "border-line hover:border-accent hover:bg-accent-soft"
        }`}
      >
        <span className="flex gap-2 text-ink-3">
          <FileImage size={22} /> <FileText size={22} />
        </span>
        <span className="font-medium text-ink">Kies een foto of pdf</span>
        <span className="text-ink-3">of sleep het bestand hierheen · JPG, PNG of pdf</span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*,application/pdf,.pdf"
        className="hidden"
        aria-label="Foto of pdf kiezen"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      <p className="text-[12px] leading-relaxed text-ink-3">
        Het bestand wordt privé bij dit project bewaard. Enkel jij kan het zien.
      </p>
    </div>
  );
}

function MethodCard({ icon, title, text, onClick }: { icon: React.ReactNode; title: string; text: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start gap-1.5 rounded-[var(--radius-card)] border border-line p-4 text-left hover:border-accent hover:bg-accent-soft"
    >
      <span className="text-accent">{icon}</span>
      <span className="text-sm font-semibold text-ink">{title}</span>
      <span className="text-[12.5px] leading-relaxed text-ink-2">{text}</span>
    </button>
  );
}

const LETTERS = ["A", "B", "C", "D"];

/**
 * Punten aanklikken op de afbeelding, met een loep voor precisie. Punten zijn
 * achteraf te verslepen.
 */
function Points({
  canvas,
  method,
  onBack,
  onDone,
  onError,
}: {
  canvas: HTMLCanvasElement;
  method: Method;
  onBack: () => void;
  onDone: (canvas: HTMLCanvasElement, scale: number) => void;
  onError: (msg: string | null) => void;
}) {
  const need = method === "line" ? 2 : 4;
  const [pts, setPts] = useState<Vec[]>([]);
  const [hover, setHover] = useState<Vec | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [len, setLen] = useState("");
  const [w, setW] = useState("");
  const [d, setD] = useState("");
  const [working, setWorking] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<HTMLCanvasElement>(null);
  const loupe = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ w: 900, h: 520 });

  // past de afbeelding in het venster
  const fit = Math.min(box.w / canvas.width, box.h / canvas.height);
  const dispW = Math.round(canvas.width * fit);
  const dispH = Math.round(canvas.height * fit);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: Math.min(560, window.innerHeight - 320) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = view.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = dispW * dpr;
    c.height = dispH * dpr;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(canvas, 0, 0, c.width, c.height);
  }, [canvas, dispW, dispH]);

  // loep: 4× vergroot rond de cursor
  useEffect(() => {
    const l = loupe.current;
    if (!l || !hover) return;
    const ctx = l.getContext("2d")!;
    const size = l.width;
    const src = size / (4 * fit);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(canvas, hover.x - src / 2, hover.y - src / 2, src, src, 0, 0, size, size);
    ctx.strokeStyle = "#2f6feb";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(size / 2, 0);
    ctx.lineTo(size / 2, size);
    ctx.moveTo(0, size / 2);
    ctx.lineTo(size, size / 2);
    ctx.stroke();
  }, [hover, canvas, fit]);

  const toImg = (e: RPointerEvent): Vec => {
    const r = view.current!.getBoundingClientRect();
    return {
      x: Math.min(canvas.width, Math.max(0, ((e.clientX - r.left) / r.width) * canvas.width)),
      y: Math.min(canvas.height, Math.max(0, ((e.clientY - r.top) / r.height) * canvas.height)),
    };
  };
  const near = (p: Vec) => pts.findIndex((q) => Math.hypot(q.x - p.x, q.y - p.y) * fit < 12);

  const ready = pts.length === need;
  const lineLen = method === "line" && ready ? Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) : 0;

  const apply = async () => {
    onError(null);
    if (method === "line") {
      const mm = parseLength(len);
      if (!mm || mm <= 0) return onError("Typ de maat tussen A en B, bv. 4,50");
      if (lineLen < 10) return onError("Zet A en B verder uit elkaar.");
      return onDone(canvas, mm / lineLen);
    }
    const mw = parseLength(w);
    const md = parseLength(d);
    if (!mw || !md) return onError("Typ de breedte (A–B) en de diepte (B–C), bv. 6,00 en 4,50");
    const plan = planRectify(pts, mw, md, canvas.width, canvas.height);
    if (!plan) return onError("Klik de vier hoeken in volgorde rond (A, B, C, D), zonder te kruisen.");
    setWorking(true);
    // even wachten zodat 'Rechttrekken…' zichtbaar is voor het rekenwerk begint
    await new Promise((r) => setTimeout(r, 30));
    const src = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
    const px = rectifyPixels(src, plan);
    const out = document.createElement("canvas");
    out.width = plan.outW;
    out.height = plan.outH;
    out.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(px), plan.outW, plan.outH), 0, 0);
    setWorking(false);
    onDone(out, plan.scale);
  };

  const hint =
    method === "line"
      ? pts.length === 0
        ? "Klik op het begin van een maat die je kent (bv. een muur met een maat erbij)."
        : pts.length === 1
          ? "Klik nu op het einde van die maat."
          : "Typ de echte lengte tussen A en B. Je kan A en B nog verslepen."
      : pts.length < 4
        ? `Klik hoek ${LETTERS[pts.length]} van een rechthoek met gekende maten, in volgorde rond.`
        : "Typ de echte breedte (A–B) en diepte (B–C). Je kan de hoeken nog verslepen.";

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-2" aria-live="polite">
        {hint}
      </p>
      <div ref={host} className="relative flex justify-center overflow-hidden rounded-[var(--radius-control)] bg-surface-2">
        <div className="relative" style={{ width: dispW, height: dispH }}>
          <canvas
            ref={view}
            style={{ width: dispW, height: dispH, cursor: drag !== null ? "grabbing" : "crosshair", touchAction: "none" }}
            aria-label="Afbeelding: klik om punten te zetten"
            onPointerDown={(e) => {
              const p = toImg(e);
              const i = near(p);
              (e.target as Element).setPointerCapture(e.pointerId);
              if (i >= 0) return setDrag(i);
              if (pts.length < need) setPts([...pts, p]);
            }}
            onPointerMove={(e) => {
              const p = toImg(e);
              setHover(p);
              if (drag !== null) setPts(pts.map((q, i) => (i === drag ? p : q)));
            }}
            onPointerUp={() => setDrag(null)}
            onPointerLeave={() => setHover(null)}
          />
          <svg className="pointer-events-none absolute inset-0" width={dispW} height={dispH}>
            {pts.length > 1 && (
              <path
                d={`M${pts.map((p) => `${p.x * fit} ${p.y * fit}`).join("L")}${method === "rect" && pts.length === 4 ? "Z" : ""}`}
                fill={method === "rect" && pts.length === 4 ? "rgb(47 111 235 / 0.12)" : "none"}
                stroke="#2f6feb"
                strokeWidth={2}
              />
            )}
            {pts.map((p, i) => (
              <g key={i} transform={`translate(${p.x * fit} ${p.y * fit})`}>
                <circle r={7} fill="#fff" stroke="#2f6feb" strokeWidth={2} />
                <circle r={1.5} fill="#2f6feb" />
                <text x={10} y={-8} fontSize={13} fontWeight={700} fill="#2f6feb" stroke="#fff" strokeWidth={3} paintOrder="stroke">
                  {LETTERS[i]}
                </text>
              </g>
            ))}
          </svg>
          {hover && (
            <canvas
              ref={loupe}
              width={140}
              height={140}
              className="pointer-events-none absolute rounded-full border-2 border-accent shadow-[var(--shadow-float)]"
              style={{
                width: 140,
                height: 140,
                left: Math.min(dispW - 150, hover.x * fit + 24),
                top: Math.max(0, hover.y * fit - 164),
              }}
            />
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {method === "line" ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink-2">Echte lengte A–B</span>
            <input className={`${fieldCls} w-36`} value={len} onChange={(e) => setLen(e.target.value)} inputMode="decimal" placeholder="4,50" disabled={!ready} />
          </label>
        ) : (
          <>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-ink-2">Breedte A–B</span>
              <input className={`${fieldCls} w-32`} value={w} onChange={(e) => setW(e.target.value)} inputMode="decimal" placeholder="6,00" disabled={!ready} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-ink-2">Diepte B–C</span>
              <input className={`${fieldCls} w-32`} value={d} onChange={(e) => setD(e.target.value)} inputMode="decimal" placeholder="4,50" disabled={!ready} />
            </label>
          </>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={() => (pts.length ? setPts([]) : onBack())}>
            {pts.length ? "Opnieuw" : "Terug"}
          </Button>
          <Button variant="primary" disabled={!ready || working} onClick={() => void apply()}>
            {working ? "Rechttrekken…" : "Op schaal zetten"}
          </Button>
        </div>
      </div>

    </div>
  );
}

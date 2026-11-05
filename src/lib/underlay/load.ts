/**
 * Een foto of pdf inlezen als afbeelding om over te trekken. Alles gebeurt in
 * de browser; we verkleinen tot een werkbare grootte (lange zijde max 4000 px).
 */
export const MAX_PX = 4000;

export type Source = { kind: "image"; file: File } | { kind: "pdf"; file: File; pages: number };

export function isPdf(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

async function pdfjs() {
  const lib = await import("pdfjs-dist");
  lib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  return lib;
}

/** Aantal pagina's van een pdf. */
export async function pdfPageCount(file: File): Promise<number> {
  const lib = await pdfjs();
  const task = lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  const n = doc.numPages;
  await task.destroy();
  return n;
}

/** Eén pdf-pagina als canvas, zo scherp als past binnen MAX_PX. */
export async function renderPdfPage(file: File, page: number, maxPx = MAX_PX): Promise<HTMLCanvasElement> {
  const lib = await pdfjs();
  const task = lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  try {
    const p = await doc.getPage(page);
    const base = p.getViewport({ scale: 1 });
    const scale = Math.min(maxPx / Math.max(base.width, base.height), 6);
    const vp = p.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await p.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
    return canvas;
  } finally {
    await task.destroy();
  }
}

/** Een foto als canvas, verkleind als ze groter is dan MAX_PX. */
export async function renderImage(file: File, maxPx = MAX_PX): Promise<HTMLCanvasElement> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Dit bestand kan je browser niet openen. Gebruik een JPG, PNG of pdf.");
  }
  const k = Math.min(1, maxPx / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvas;
}

/** Canvas → bestand om te bewaren: JPEG voor foto's, PNG voor plannen uit een pdf. */
export function canvasToBlob(canvas: HTMLCanvasElement, kind: "photo" | "drawing"): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("De afbeelding kon niet omgezet worden."))),
      kind === "photo" ? "image/jpeg" : "image/png",
      0.9,
    ),
  );
}

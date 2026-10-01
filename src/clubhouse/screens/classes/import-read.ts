'use client';

import { extractClassesFromScheduleImage } from '@/app/golf/actions/schedule-image';
import { parseScheduleText } from '@/lib/utils/schedule-parser';
import { toImportRow, type ChImportRow } from '../../data/classes-shape';

/**
 * Reading a schedule: a screenshot or photo (read by the existing vision
 * action), a PDF or TXT file, or pasted text (both read by `parseScheduleText`).
 * Every step is the current importer's, ported from
 * components/golf/classes/UploadScheduleModal.tsx because that file is a Fairway
 * sheet and can't be imported here. The results are the importer's own review
 * rows, so nothing is saved until the person confirms.
 */

export type ChReadSource = { kind: 'file'; file: File } | { kind: 'text'; text: string };

/** The importer's failures, named for the board's error views (`ERR` in classes.jsx). */
export type ChReadFail = 'notSchedule' | 'tooLarge' | 'unsupported' | 'fault' | 'none' | 'offline' | 'empty';

export type ChReadResult = { ok: true; rows: ChImportRow[]; warnings: string[] } | { ok: false; kind: ChReadFail; message: string };

/** The largest file the reader takes (the vision action's own ceiling). */
export const MAX_SCHEDULE_BYTES = 12 * 1024 * 1024;

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export type ChFileKind = 'image' | 'pdf' | 'text';

/**
 * A file the reader can take, or why not, before anything is sent: a screenshot
 * (PNG, JPG, WebP, GIF, and HEIC or HEIF, which iOS hands over as-is), a PDF or
 * a TXT file, up to 12 MB.
 */
export function screenFile(f: { name: string; type: string; size: number }): { ok: true; kind: ChFileKind } | { ok: false; kind: 'tooLarge' | 'unsupported' } {
  const kind: ChFileKind | null =
    f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|heic|heif)$/i.test(f.name)
      ? 'image'
      : f.type === 'application/pdf' || /\.pdf$/i.test(f.name)
        ? 'pdf'
        : f.type === 'text/plain' || /\.txt$/i.test(f.name)
          ? 'text'
          : null;
  if (!kind) return { ok: false, kind: 'unsupported' };
  if (f.size > MAX_SCHEDULE_BYTES) return { ok: false, kind: 'tooLarge' };
  return { ok: true, kind };
}

/** The vision action answers in sentences; the board's error views are chosen from what they say. */
export function classifyReadError(message: string | undefined): ChReadFail {
  if (!message) return 'none';
  if (/doesn.t look like a class schedule/i.test(message)) return 'notSchedule';
  if (/too large|under 12\s?MB/i.test(message)) return 'tooLarge';
  if (/unsupported (image )?(type|file)|isn.t supported/i.test(message)) return 'unsupported';
  return 'fault';
}

// ---------------------------------------------------------------------------
// Screenshots and photos (UploadScheduleModal.tsx: prepareScheduleImages)
// ---------------------------------------------------------------------------

type ScheduleImage = { base64: string; mediaType: string };

// Claude vision downscales anything past ~1568px on the long edge, so re-encoding here costs nothing in
// fidelity and keeps the upload small (it also bakes in the rotation of a phone photo).
const SINGLE_MAX_EDGE = 1568;
// A capture taller than this ratio is a scrolling screenshot: scaling it to one frame would crush the text, so
// it is sliced into overlapping segments the model is told to merge.
const TALL_ASPECT = 2.4;
const SLICE_WIDTH = 1092;
const SLICE_HEIGHT = 1568;
const SLICE_OVERLAP = 120;
const MAX_SLICES = 6;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.slice(dataUrl.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error('The image file could not be read.'));
    reader.readAsDataURL(blob);
  });
}

function canvasToJpegBase64(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blobToBase64(blob)) : reject(new Error('The image could not be encoded.'))), 'image/jpeg', 0.9);
  });
}

function drawSlice(bitmap: ImageBitmap, srcY: number, srcH: number, destW: number, destH: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = destW;
  canvas.height = destH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser could not process the image.');
  // A white matte, so a transparent PNG stays readable as a JPEG.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, destW, destH);
  ctx.drawImage(bitmap, 0, srcY, bitmap.width, srcH, 0, 0, destW, destH);
  return canvas;
}

async function prepareScheduleImages(file: File): Promise<ScheduleImage[]> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // The browser can't decode this format (HEIC outside Safari): send the original when the reader takes it.
    if (IMAGE_TYPES.has(file.type)) return [{ base64: await blobToBase64(file), mediaType: file.type }];
    throw new Error("This browser can't open that image format. Use a PNG or JPG; a screenshot works well.");
  }
  try {
    const { width, height } = bitmap;
    if (width < 1 || height < 1) throw new Error('That image is empty.');
    if (height / width <= TALL_ASPECT) {
      const scale = Math.min(1, SINGLE_MAX_EDGE / Math.max(width, height));
      const destW = Math.max(1, Math.round(width * scale));
      const destH = Math.max(1, Math.round(height * scale));
      return [{ base64: await canvasToJpegBase64(drawSlice(bitmap, 0, height, destW, destH)), mediaType: 'image/jpeg' }];
    }
    // A tall scrolling capture becomes overlapping slices, capped so an extreme length scales down instead of passing MAX_SLICES.
    const maxTotalDestH = MAX_SLICES * SLICE_HEIGHT - (MAX_SLICES - 1) * SLICE_OVERLAP;
    const scale = Math.min(1, SLICE_WIDTH / width, maxTotalDestH / height);
    const destW = Math.max(1, Math.round(width * scale));
    const destTotalH = Math.max(1, Math.round(height * scale));
    const slices: ScheduleImage[] = [];
    let destY = 0;
    while (destY < destTotalH) {
      const remaining = destTotalH - destY;
      // A tail shorter than the overlap is already covered.
      if (slices.length > 0 && remaining <= SLICE_OVERLAP) break;
      const destH = Math.min(SLICE_HEIGHT, remaining);
      slices.push({ base64: await canvasToJpegBase64(drawSlice(bitmap, destY / scale, destH / scale, destW, destH)), mediaType: 'image/jpeg' });
      destY += SLICE_HEIGHT - SLICE_OVERLAP;
    }
    return slices;
  } finally {
    bitmap.close();
  }
}

// ---------------------------------------------------------------------------
// PDF (UploadScheduleModal.tsx: loadPdfJs, extractTextFromPDF)
// ---------------------------------------------------------------------------

type PdfJsTextItem = { str: string; transform?: number[] };
type PdfJsDocument = { numPages: number; getPage: (page: number) => Promise<{ getTextContent: () => Promise<{ items: PdfJsTextItem[] }> }> };
type PdfJsLib = { getDocument: (src: { data: ArrayBuffer }) => { promise: Promise<PdfJsDocument> }; GlobalWorkerOptions: { workerSrc: string } };

const PDFJS_LOAD_ERROR = 'pdfjs-load-failed';

// Loaded from the CDN (avoids native dependencies on Vercel), pinned to the 3.x build this code matches, with a
// Subresource Integrity hash so a tampered response is refused by the browser rather than run.
async function loadPdfJs(): Promise<PdfJsLib> {
  const version = '3.11.174';
  const base = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}`;
  const sri = 'sha512-q+4liFwdPC/bNdhUpZx6aXDx/h77yEQtn4I1slHydcbZK34nLaR3cAeYSJshoxIOq3mjEf7xJE8YWIUHMn+oCQ==';
  const w = window as Window & { pdfjsLib?: PdfJsLib };
  if (w.pdfjsLib) return w.pdfjsLib;
  try {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `${base}/pdf.min.js`;
      script.integrity = sri;
      script.crossOrigin = 'anonymous';
      script.onload = () => resolve();
      // Fires for a network failure, a blocked script and an integrity mismatch alike.
      script.onerror = () => reject(new Error(PDFJS_LOAD_ERROR));
      document.head.appendChild(script);
    });
  } catch {
    throw new Error(PDFJS_LOAD_ERROR);
  }
  // The script set it while it loaded, which the type checker can't see.
  const lib = (window as Window & { pdfjsLib?: PdfJsLib }).pdfjsLib;
  if (!lib) throw new Error(PDFJS_LOAD_ERROR);
  lib.GlobalWorkerOptions.workerSrc = `${base}/pdf.worker.min.js`;
  return lib;
}

async function extractTextFromPdf(file: File): Promise<string> {
  try {
    const lib = await loadPdfJs();
    const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
    let full = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const items = (await (await pdf.getPage(i)).getTextContent()).items;
      if (items.length === 0) continue;
      // Rows by vertical position (PDF y runs upward), then left to right; a 5px band is one row.
      const sorted = [...items].sort((a, b) => {
        const dy = (b.transform?.[5] ?? 0) - (a.transform?.[5] ?? 0);
        return Math.abs(dy) > 5 ? dy : (a.transform?.[4] ?? 0) - (b.transform?.[4] ?? 0);
      });
      const rows: string[][] = [];
      let row: string[] = [];
      let lastY = sorted[0]?.transform?.[5] ?? 0;
      for (const item of sorted) {
        const y = item.transform?.[5] ?? 0;
        if (Math.abs(y - lastY) > 5) {
          if (row.length) rows.push(row);
          row = [];
          lastY = y;
        }
        if (item.str?.trim()) row.push(item.str.trim());
      }
      if (row.length) rows.push(row);
      // Tabs between columns, newlines between rows: the table format the parser reads best.
      full += rows.map((r) => r.join('\t')).join('\n') + '\n';
    }
    return full;
  } catch (err) {
    if (err instanceof Error && err.message === PDFJS_LOAD_ERROR) {
      throw new Error('PDF import is unavailable right now: the PDF reader could not be loaded, which can happen offline or on a restricted network. Use a TXT file or paste the text instead.');
    }
    throw new Error('That PDF could not be read. It may be a scan with no text. Try a screenshot or paste the text instead.');
  }
}

// ---------------------------------------------------------------------------
// The live reader
// ---------------------------------------------------------------------------

/** Rows from parsed text, or the "no classes" answer. */
function fromText(text: string): ChReadResult {
  const parsed = parseScheduleText(text);
  return parsed.length
    ? { ok: true, rows: parsed.map(toImportRow), warnings: [] }
    : { ok: false, kind: 'none', message: "We read the text but couldn't find course codes or times. Check that each class has a code such as STAT 201, then try again." };
}

export async function readScheduleLive(source: ChReadSource): Promise<ChReadResult> {
  try {
    if (source.kind === 'text') return fromText(source.text);
    const screened = screenFile(source.file);
    if (!screened.ok) return { ok: false, kind: screened.kind, message: screened.kind === 'tooLarge' ? 'Use an image under 12 MB.' : 'Use a PNG, JPG or WebP screenshot, a PDF or a TXT file.' };
    if (screened.kind === 'text') return fromText(await source.file.text());
    if (screened.kind === 'pdf') return fromText(await extractTextFromPdf(source.file));
    const result = await extractClassesFromScheduleImage(await prepareScheduleImages(source.file));
    if (!result.success || !result.classes?.length) {
      const kind = classifyReadError(result.error);
      return { ok: false, kind, message: result.error ?? "We read the image but couldn't find course codes or times. Try a clearer screenshot, or paste the text." };
    }
    return { ok: true, rows: result.classes.map(toImportRow), warnings: result.warnings ?? [] };
  } catch (err) {
    return { ok: false, kind: 'fault', message: err instanceof Error && err.message ? err.message : "Reading the schedule didn't finish. Paste the text instead." };
  }
}

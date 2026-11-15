/**
 * Results import (launch readiness F-01), step one: a file's bytes, or pasted text, to plain sheets of cells. Pure and
 * client-safe (the file is read in the browser; nothing leaves it until the coach saves what the check step shows).
 *
 * What it reads:
 *  - .xlsx workbooks, every sheet (Golf Genius and GolfStat exports, and anything saved from Excel or Numbers);
 *  - CSV, TSV and semicolon files, and Excel's "Unicode text" (UTF-16 with tabs);
 *  - HTML tables, which is what many "Excel" downloads from scoring sites are (an .xls file holding a web table),
 *    and what a copied web leaderboard pastes as;
 *  - pasted text (tabs from a copied table, or commas).
 * What it refuses, with words the coach can act on: the old binary Excel format (.xls from Excel 97-2003), PDFs,
 * images, and anything else.
 */

import { unzipSync, strFromU8 } from 'fflate';

export interface ChResultsSheet {
  /** The sheet's tab name, or "Sheet 1", "Table 2" where the file names none. */
  name: string;
  /** Cells as text, trimmed; rows are padded to the widest row so a column index means the same thing on every row. */
  rows: string[][];
}

export type ChSheetsFail = 'empty' | 'binary_xls' | 'pdf' | 'image' | 'unsupported' | 'broken' | 'too_large';
export type ChSheetsRead = { ok: true; sheets: ChResultsSheet[] } | { ok: false; reason: ChSheetsFail };

/** A results file is a few hundred rows; anything this big is the wrong file (and an xlsx bomb never inflates). */
export const MAX_RESULTS_FILE_BYTES = 8 * 1024 * 1024;
const MAX_PART_BYTES = 24 * 1024 * 1024;
const MAX_ROWS = 5000;
const MAX_COLS = 80;

const startsWith = (b: Uint8Array, sig: readonly number[]) => sig.every((x, i) => b[i] === x);

/** Reads a chosen file's bytes. `fileName` is used only to name a CSV's single sheet. */
export function readResultsBytes(bytes: Uint8Array, fileName = 'Results'): ChSheetsRead {
  if (bytes.length === 0) return { ok: false, reason: 'empty' };
  if (bytes.length > MAX_RESULTS_FILE_BYTES) return { ok: false, reason: 'too_large' };
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return readXlsx(bytes);
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0])) return { ok: false, reason: 'binary_xls' };
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return { ok: false, reason: 'pdf' };
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47]) || startsWith(bytes, [0xff, 0xd8, 0xff]) || startsWith(bytes, [0x47, 0x49, 0x46])) return { ok: false, reason: 'image' };
  const text = decodeText(bytes);
  if (text == null) return { ok: false, reason: 'unsupported' };
  return readResultsText(text, baseName(fileName));
}

/** Reads pasted text, or a text file's contents. */
export function readResultsText(text: string, name = 'Pasted results'): ChSheetsRead {
  const t = text.replace(/^\uFEFF/, '');
  if (!t.trim()) return { ok: false, reason: 'empty' };
  if (/<table[\s>]/i.test(t)) {
    const tables = readHtmlTables(t);
    return tables.length ? { ok: true, sheets: tables } : { ok: false, reason: 'empty' };
  }
  const rows = readDelimited(t);
  if (!rows.some((r) => r.some((c) => c !== ''))) return { ok: false, reason: 'empty' };
  return { ok: true, sheets: [{ name, rows }] };
}

function baseName(fileName: string): string {
  const b = fileName.split(/[\\/]/).pop() ?? fileName;
  return b.replace(/\.[a-z0-9]{1,5}$/i, '') || 'Results';
}

/** UTF-8, or UTF-16 with its byte-order mark (Excel's "Unicode text"); null for bytes that are not text. */
function decodeText(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0xff, 0xfe])) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (startsWith(bytes, [0xfe, 0xff])) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  const text = new TextDecoder('utf-8').decode(bytes);
  // Binary that isn't one of the signatures above: control characters text never has.
  const sample = text.slice(0, 4000);
  let odd = 0;
  for (let i = 0; i < sample.length; i += 1) {
    const c = sample.charCodeAt(i);
    if ((c < 9 || (c > 13 && c < 32)) && c !== 27) odd += 1;
  }
  return odd > sample.length * 0.02 ? null : text;
}

function pad(rows: string[][]): string[][] {
  const kept = rows.slice(0, MAX_ROWS).map((r) => r.slice(0, MAX_COLS));
  // Trailing empty rows go.
  while (kept.length && kept[kept.length - 1]!.every((c) => c === '')) kept.pop();
  const width = Math.max(0, ...kept.map((r) => r.length));
  return kept.map((r) => (r.length < width ? [...r, ...Array.from({ length: width - r.length }, () => '')] : r));
}

// ── Delimited text ───────────────────────────────────────────────────────────────────────────────────────────

/** The delimiter the first lines use most: a tab (a copied table), a comma, or a semicolon (European Excel). */
export function sniffDelimiter(text: string): string {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim()).slice(0, 12);
  const count = (d: string) => lines.reduce((n, l) => n + l.split(d).length - 1, 0);
  const tabs = count('\t');
  const commas = count(',');
  const semis = count(';');
  if (tabs >= commas && tabs >= semis && tabs > 0) return '\t';
  if (semis > commas) return ';';
  return ',';
}

/** RFC 4180 rows: quoted cells may hold the delimiter, quotes ("") and line breaks. */
export function readDelimited(text: string, delimiter = sniffDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell.trim() === '') {
      quoted = true;
      cell = '';
    } else if (ch === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  return pad(rows);
}

// ── HTML tables ──────────────────────────────────────────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', minus: '−' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const cellText = (html: string) =>
  decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\s+/g, ' ')
    .trim();

/** Every `<table>` as a sheet; a cell spanning columns keeps its text in the first and leaves the rest empty. */
export function readHtmlTables(html: string): ChResultsSheet[] {
  const out: ChResultsSheet[] = [];
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) ?? [];
  tables.forEach((table, t) => {
    const rows: string[][] = [];
    for (const tr of table.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
      const row: string[] = [];
      const cells = tr.matchAll(/<t([dh])\b([^>]*)>([\s\S]*?)<\/t\1>/gi);
      for (const c of cells) {
        row.push(cellText(c[3] ?? ''));
        const span = Number(/colspan\s*=\s*["']?(\d+)/i.exec(c[2] ?? '')?.[1] ?? 1);
        for (let k = 1; k < Math.min(span, 30); k += 1) row.push('');
      }
      if (row.length) rows.push(row);
    }
    const padded = pad(rows);
    if (padded.some((r) => r.some((c) => c !== ''))) out.push({ name: tables.length > 1 ? `Table ${t + 1}` : 'Table', rows: padded });
  });
  return out;
}

// ── XLSX ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** "B12" to its column, 0 based. */
export function columnOf(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0]?.toUpperCase() ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const attr = (attrs: string, name: string) => {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*"([^"]*)"`).exec(attrs) ?? new RegExp(`(?:^|\\s)${name}\\s*=\\s*'([^']*)'`).exec(attrs);
  return m ? decodeEntities(m[1]!) : null;
};

const texts = (xml: string) => [...xml.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((m) => decodeEntities(m[1] ?? '')).join('');

/** A cached number as written: Excel stores 72 as "72", and sometimes a float's tail ("4.0000000000000009"). */
function numberText(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  const r = Math.round(n);
  return Math.abs(n - r) < 1e-9 ? String(r) : String(Number(n.toFixed(6)));
}

export function readXlsx(bytes: Uint8Array): ChSheetsRead {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) => f.originalSize <= MAX_PART_BYTES && (f.name === 'xl/workbook.xml' || f.name === 'xl/_rels/workbook.xml.rels' || f.name === 'xl/sharedStrings.xml' || f.name.startsWith('xl/worksheets/sheet')),
    });
  } catch {
    return { ok: false, reason: 'broken' };
  }
  const workbook = files['xl/workbook.xml'];
  if (!workbook) return { ok: false, reason: 'unsupported' };
  const shared = files['xl/sharedStrings.xml'] ? [...strFromU8(files['xl/sharedStrings.xml']).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1] ?? '')) : [];
  const rels = new Map<string, string>();
  if (files['xl/_rels/workbook.xml.rels']) {
    for (const m of strFromU8(files['xl/_rels/workbook.xml.rels']).matchAll(/<Relationship\b([^>]*)\/?>/g)) {
      const id = attr(m[1] ?? '', 'Id');
      const target = attr(m[1] ?? '', 'Target');
      if (id && target) rels.set(id, target.replace(/^\/?(xl\/)?/, 'xl/'));
    }
  }
  const named = [...strFromU8(workbook).matchAll(/<(?:\w+:)?sheet\b([^>]*)\/?>/g)].map((m, i) => {
    const a = m[1] ?? '';
    const rid = attr(a, 'r:id') ?? attr(a, 'id');
    return { name: attr(a, 'name') ?? `Sheet ${i + 1}`, path: (rid && rels.get(rid)) || `xl/worksheets/sheet${i + 1}.xml`, hidden: attr(a, 'state') === 'hidden' || attr(a, 'state') === 'veryHidden' };
  });
  const sheets: ChResultsSheet[] = [];
  for (const s of named) {
    const part = files[s.path];
    if (!part || s.hidden) continue;
    const rows = readSheetXml(strFromU8(part), shared);
    if (rows.some((r) => r.some((c) => c !== ''))) sheets.push({ name: s.name, rows });
  }
  return sheets.length ? { ok: true, sheets } : { ok: false, reason: 'empty' };
}

function readSheetXml(xml: string, shared: readonly string[]): string[][] {
  const rows: string[][] = [];
  for (const rm of xml.matchAll(/<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g)) {
    const index = Number(attr(rm[1] ?? '', 'r') ?? rows.length + 1) - 1;
    if (!Number.isFinite(index) || index < 0 || index >= MAX_ROWS) continue;
    const row: string[] = [];
    let next = 0;
    for (const cm of (rm[2] ?? '').matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const a = cm[1] ?? '';
      const ref = attr(a, 'r');
      const col = ref ? columnOf(ref) : next;
      next = col + 1;
      if (col >= MAX_COLS) continue;
      const body = cm[2] ?? '';
      const type = attr(a, 't');
      const v = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(body)?.[1];
      const value =
        type === 'inlineStr'
          ? texts(body)
          : v == null
            ? ''
            : type === 's'
              ? (shared[Number(v)] ?? '')
              : type === 'str' || type === 'e'
                ? decodeEntities(v)
                : type === 'b'
                  ? v === '1'
                    ? 'TRUE'
                    : 'FALSE'
                  : numberText(decodeEntities(v));
      while (row.length < col) row.push('');
      row[col] = value.replace(/\s+/g, ' ').trim();
    }
    while (rows.length < index) rows.push([]);
    rows[index] = row;
  }
  return pad(rows);
}

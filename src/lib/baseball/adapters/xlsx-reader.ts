// =============================================================================
// src/lib/baseball/adapters/xlsx-reader.ts
//
// Packet: qa-screens / stats-integrations (BaseballHelm — imports DEEPEN)
//
// A small, dependency-light XLSX (Office Open XML SpreadsheetML) reader. An .xlsx
// file is a ZIP archive of XML parts; this reads the FIRST worksheet into the same
// { headers, rows } shape the CSV tokenizer produces, so every downstream adapter
// (TrackMan / Rapsodo / Blast / Diamond Kinetics / generic) works on a workbook
// EXACTLY as it works on a CSV — no per-adapter XLSX code.
//
// WHY THIS EXISTS (the real gap): the source registry advertises `xlsx` for Blast,
// Diamond Kinetics, TeamBuildr, Google Sheets, Synergy and generic_xlsx, and v9
// Packet 4 lists "generic CSV/XLSX" as a required adapter — but no XLSX reader
// existed anywhere in src/lib/baseball, so a workbook could not be ingested at all
// (FileReader.readAsText on a binary ZIP yields mojibake the tokenizer corrupts).
//
// HOW (no heavy SheetJS dep): `fflate` (already a dependency) inflates the ZIP;
// `mini-xml` (already in this folder) reads the two XML parts we need:
//   * xl/sharedStrings.xml  — the shared-string table (text cells are indices).
//   * xl/worksheets/sheet1.xml (or the first sheet named in xl/workbook.xml +
//     xl/_rels/workbook.xml.rels) — the cell grid.
// We resolve A1-style cell refs to a dense, column-aligned grid (blank cells in
// the middle of a row are preserved, not collapsed) so header→value alignment is
// never silently shifted — the same correctness guarantee the CSV tokenizer makes.
//
// SCOPE (honest + small): first sheet only, inline + shared strings, numeric and
// boolean cells, and dates left as their raw serial/ISO string (the adapters that
// care about a timestamp already accept either). No formulas evaluation (we read
// the cached <v> result Excel stores), no styles, no multi-sheet. On a malformed
// or non-XLSX buffer it returns empty headers/rows + a warning rather than throwing.
//
// PURE: no DB, no DOM, no 'use server'. Server-only by nature (binary handling),
// but importable anywhere.
// =============================================================================

import { unzipSync, strFromU8 } from 'fflate';

import { parseXml, findAll, attr, type XmlNode } from '@/lib/baseball/adapters/mini-xml';

export interface XlsxReadResult {
  /** First-row cells, trimmed (the header row). */
  headers: string[];
  /** Data rows as string[][] aligned to `headers` length (short rows padded). */
  rows: string[][];
  /** Name of the worksheet that was read, if discoverable. */
  sheetName: string | null;
  /** Non-fatal observations (missing parts, ragged rows, unsupported cells). */
  warnings: string[];
}

/** A1 / AB12 cell reference → zero-based column index (A=0, B=1, …, AA=26). */
export function columnRefToIndex(ref: string): number {
  const m = /^([A-Za-z]+)/.exec(ref);
  if (!m) return 0;
  const letters = m[1]!.toUpperCase();
  let n = 0;
  for (let i = 0; i < letters.length; i++) {
    n = n * 26 + (letters.charCodeAt(i) - 64); // 'A' (65) → 1
  }
  return n - 1;
}

/** Decode the shared-string table: each <si> is one string (concatenated runs). */
function readSharedStrings(node: XmlNode | null): string[] {
  if (!node) return [];
  const out: string[] = [];
  for (const si of findAll(node, 'si')) {
    // A shared string is either a single <t> or several <r><t> rich-text runs.
    const ts = findAll(si, 't');
    if (ts.length === 0) {
      out.push('');
    } else {
      out.push(ts.map((t) => t.text).join(''));
    }
  }
  return out;
}

/** Read the cached value of a single <c> cell, resolving shared/inline strings. */
function readCell(cell: XmlNode, shared: string[]): string {
  const type = attr(cell, 't'); // s=shared, str=formula-string, inlineStr, b=bool, n/undef=number
  if (type === 'inlineStr') {
    const isNode = cell.children.find((c) => c.tag.toLowerCase() === 'is');
    if (isNode) return findAll(isNode, 't').map((t) => t.text).join('');
  }
  const v = cell.children.find((c) => c.tag.toLowerCase() === 'v');
  const raw = v?.text ?? '';
  if (raw === '') return '';
  if (type === 's') {
    const idx = parseInt(raw, 10);
    return Number.isFinite(idx) ? (shared[idx] ?? '') : '';
  }
  if (type === 'b') {
    return raw === '1' ? 'TRUE' : 'FALSE';
  }
  // 'str' (cached formula string) and number/date: use the cached value verbatim.
  return raw;
}

/** Find the path of the first worksheet from workbook.xml + its rels. */
function resolveFirstSheetPath(
  files: Record<string, Uint8Array>,
  warnings: string[],
): string {
  const FALLBACK = 'xl/worksheets/sheet1.xml';
  const wbBytes = files['xl/workbook.xml'];
  const relBytes = files['xl/_rels/workbook.xml.rels'];
  if (!wbBytes || !relBytes) return FALLBACK;

  const wb = parseXml(strFromU8(wbBytes)).root;
  const firstSheet = findAll(wb, 'sheet')[0];
  const rId = firstSheet ? attr(firstSheet, 'r:id', 'id') : null;
  if (!rId) return FALLBACK;

  const rels = parseXml(strFromU8(relBytes)).root;
  for (const rel of findAll(rels, 'relationship')) {
    if (attr(rel, 'id') === rId) {
      const target = attr(rel, 'target');
      if (target) {
        // Targets are relative to the xl/ folder (e.g. "worksheets/sheet1.xml").
        const cleaned = target.replace(/^\//, '');
        return cleaned.startsWith('xl/') ? cleaned : `xl/${cleaned}`;
      }
    }
  }
  warnings.push('Could not resolve the first worksheet from workbook rels; used the default path.');
  return FALLBACK;
}

/**
 * Read the first worksheet of an XLSX buffer into a column-aligned grid.
 * `buffer` is the raw bytes of the .xlsx file.
 */
export function readXlsx(buffer: Uint8Array): XlsxReadResult {
  const warnings: string[] = [];
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(buffer);
  } catch {
    return {
      headers: [],
      rows: [],
      sheetName: null,
      warnings: ['This does not look like a valid .xlsx workbook (could not unzip it).'],
    };
  }

  const sharedBytes = files['xl/sharedStrings.xml'];
  const shared = sharedBytes ? readSharedStrings(parseXml(strFromU8(sharedBytes)).root) : [];

  const sheetPath = resolveFirstSheetPath(files, warnings);
  const sheetBytes = files[sheetPath] ?? files['xl/worksheets/sheet1.xml'];
  if (!sheetBytes) {
    return {
      headers: [],
      rows: [],
      sheetName: null,
      warnings: [...warnings, 'No worksheet part was found inside the workbook.'],
    };
  }

  // Sheet name (best effort, for the diff viewer note).
  let sheetName: string | null = null;
  const wbBytes = files['xl/workbook.xml'];
  if (wbBytes) {
    const firstSheet = findAll(parseXml(strFromU8(wbBytes)).root, 'sheet')[0];
    sheetName = firstSheet ? attr(firstSheet, 'name') : null;
  }

  const sheetRoot = parseXml(strFromU8(sheetBytes)).root;
  const xmlRows = findAll(sheetRoot, 'row');

  // Build a dense grid: row index (file order) -> column index -> value.
  const grid: string[][] = [];
  let maxCols = 0;
  for (const xmlRow of xmlRows) {
    const cells = xmlRow.children.filter((c) => c.tag.toLowerCase() === 'c');
    const rowArr: string[] = [];
    let nextCol = 0;
    for (const cell of cells) {
      const ref = attr(cell, 'r');
      const colIdx = ref ? columnRefToIndex(ref) : nextCol;
      // Fill any skipped (blank) columns so alignment is never shifted.
      while (rowArr.length < colIdx) rowArr.push('');
      rowArr[colIdx] = readCell(cell, shared);
      nextCol = colIdx + 1;
    }
    grid.push(rowArr);
    if (rowArr.length > maxCols) maxCols = rowArr.length;
  }

  // Drop leading fully-blank rows (some exports pad the top) before the header.
  let start = 0;
  while (start < grid.length && grid[start]!.every((c) => (c ?? '').trim() === '')) start += 1;

  if (start >= grid.length) {
    return { headers: [], rows: [], sheetName, warnings: [...warnings, 'The worksheet had no data rows.'] };
  }

  const headerRow = grid[start]!;
  const width = Math.max(headerRow.length, maxCols);
  const headers = Array.from({ length: width }, (_, i) => (headerRow[i] ?? '').trim());

  const rows: string[][] = [];
  for (let r = start + 1; r < grid.length; r++) {
    const src = grid[r]!;
    if (src.every((c) => (c ?? '').trim() === '')) continue; // skip blank rows
    const padded: string[] = [];
    for (let c = 0; c < width; c++) padded.push((src[c] ?? '').trim());
    rows.push(padded);
  }

  return { headers, rows, sheetName, warnings };
}

/**
 * Convert an XLSX buffer into a CSV string the existing tokenizer / legacy parseCSV
 * can consume unchanged. Cells are quote-escaped (RFC-4180) so a value containing a
 * comma, quote or newline never shifts a column — the SAME guarantee the tokenizer
 * makes for native CSV. This is the one bridge that lets a workbook flow through the
 * entire CSV pipeline without any adapter knowing it started life as XLSX.
 */
export function xlsxToCsv(buffer: Uint8Array): { csv: string; warnings: string[]; sheetName: string | null } {
  const { headers, rows, sheetName, warnings } = readXlsx(buffer);
  const esc = (cell: string): string =>
    /[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
  const lines: string[] = [];
  if (headers.length > 0) lines.push(headers.map(esc).join(','));
  for (const row of rows) lines.push(row.map(esc).join(','));
  return { csv: lines.join('\n'), warnings, sheetName };
}

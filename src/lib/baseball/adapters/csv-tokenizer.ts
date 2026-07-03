// =============================================================================
// src/lib/baseball/adapters/csv-tokenizer.ts
//
// Packet: elite-stats (BaseballHelm — stats-integrations)
//
// A small, dependency-free, RFC-4180-aware CSV/TSV tokenizer used by the
// concrete vendor adapters. PURE (no DB, no DOM, no 'use server').
//
// WHY THIS EXISTS (the gap it closes): the legacy csv-utils.parseCSV() splits
// every line on a bare comma. Real vendor exports — TrackMan, Rapsodo, GameChanger
// CSV — routinely contain QUOTED fields ("Smith, John"), embedded commas, escaped
// double-quotes ("6'2\"\""), and \r\n line endings. The naive splitter silently
// shifts columns the moment a quoted comma appears, corrupting velo/spin/EV
// values one column to the right. Vendor adapters MUST NOT inherit that bug, so
// they tokenize with this instead.
//
// Scope: a tokenizer, not a schema. It returns string cells; the adapter decides
// what each header means. It auto-detects delimiter (comma vs tab vs semicolon)
// from the header line, which TrackMan/Rapsodo regional exports vary on.
// =============================================================================

export type CsvDelimiter = ',' | '\t' | ';';

export interface TokenizedCsv {
  /** Raw header cells, in file order, trimmed. */
  headers: string[];
  /** Data rows as string[][] aligned to `headers` length (short rows padded). */
  rows: string[][];
  /** The delimiter that was detected/used. */
  delimiter: CsvDelimiter;
  /** Non-fatal observations (ragged rows, blank lines skipped, etc.). */
  warnings: string[];
}

/**
 * Detect the delimiter from a header line. Vendors export comma (US), semicolon
 * (some EU locales), or tab (TrackMan "Tab" export). We pick the delimiter that
 * yields the most cells on the header line — ties favor comma.
 */
function detectDelimiter(headerLine: string): CsvDelimiter {
  const candidates: CsvDelimiter[] = [',', '\t', ';'];
  let best: CsvDelimiter = ',';
  let bestCount = -1;
  for (const d of candidates) {
    // Count delimiters that are NOT inside quotes (cheap heuristic on the header,
    // which is rarely quoted; the real parse below is fully quote-aware).
    const count = splitLine(headerLine, d).length;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

/**
 * Quote-aware single-line splitter (RFC 4180): respects "..." groups, "" escapes,
 * and a delimiter inside quotes. Does not handle quoted newlines — use
 * `tokenizeCsv` for full-document parsing where a field can span lines.
 */
function splitLine(line: string, delimiter: CsvDelimiter): string[] {
  const out: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      out.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

/**
 * Full-document, fully quote-aware tokenizer (handles fields that contain the
 * delimiter, escaped quotes, and quoted newlines). Strips a UTF-8 BOM, tolerates
 * \r\n / \r / \n, and skips fully-blank lines.
 */
export function tokenizeCsv(
  body: string,
  opts?: { delimiter?: CsvDelimiter; hasHeader?: boolean },
): TokenizedCsv {
  const warnings: string[] = [];
  // Strip BOM.
  const text = body.replace(/^\uFEFF/, '');

  // First, do a quote-aware split into RECORDS (a quoted newline keeps a record
  // together). We accumulate the full grid of cells using a state machine, then
  // split records on un-quoted row boundaries.
  const records: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  // Delimiter detection needs the first physical line; grab it quote-naively for
  // detection only (the header is virtually never quoted-with-embedded-newlines).
  const firstLineEnd = (() => {
    let q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i]!;
      if (c === '"') q = !q;
      else if (!q && (c === '\n' || c === '\r')) return i;
    }
    return text.length;
  })();
  const delimiter = opts?.delimiter ?? detectDelimiter(text.slice(0, firstLineEnd));

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    // Skip rows that are entirely empty (a single empty cell or all-blank cells).
    const isBlank = row.every((c) => c.trim() === '');
    if (!isBlank) records.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      pushField();
    } else if (ch === '\r') {
      // Treat \r and \r\n as one row boundary.
      if (text[i + 1] === '\n') i++;
      pushRow();
    } else if (ch === '\n') {
      pushRow();
    } else {
      field += ch;
    }
  }
  // Flush trailing field/row if the file did not end with a newline.
  if (field.length > 0 || row.length > 0) pushRow();

  const hasHeader = opts?.hasHeader ?? true;
  if (records.length === 0) {
    return { headers: [], rows: [], delimiter, warnings };
  }

  const headers = hasHeader ? records[0]!.map((h) => h.trim()) : [];
  const dataRecords = hasHeader ? records.slice(1) : records;
  const width = hasHeader ? headers.length : Math.max(...dataRecords.map((r) => r.length));

  const rows = dataRecords.map((r, idx) => {
    if (r.length !== width) {
      warnings.push(
        `Row ${idx + 1} had ${r.length} cells; expected ${width} (padded/truncated to align).`,
      );
    }
    // Pad short rows so header-index lookups never read undefined; truncate long.
    const padded = r.slice(0, width);
    while (padded.length < width) padded.push('');
    return padded;
  });

  return { headers, rows, delimiter, warnings };
}

/** Build a header->index lookup that is case/space/punctuation insensitive. */
export function buildHeaderIndex(headers: string[]): Map<string, number> {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const map = new Map<string, number>();
  headers.forEach((h, i) => {
    const key = norm(h);
    // First occurrence wins (vendors sometimes repeat a blank header).
    if (key && !map.has(key)) map.set(key, i);
  });
  return map;
}

/**
 * Resolve a value from a row by trying a list of candidate header names against
 * the normalized header index. Returns the first non-empty trimmed cell, or null.
 */
export function pick(
  row: string[],
  index: Map<string, number>,
  candidates: string[],
): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const c of candidates) {
    const i = index.get(norm(c));
    if (i != null) {
      const v = (row[i] ?? '').trim();
      if (v !== '') return v;
    }
  }
  return null;
}

/** Coerce a picked cell to a finite number, or null (never NaN, never 0-on-blank). */
export function num(raw: string | null): number | null {
  if (raw == null) return null;
  const cleaned = raw.replace(/[^0-9eE.+-]/g, '');
  if (cleaned === '' || cleaned === '+' || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

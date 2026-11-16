import { csvCell } from '@/lib/csv/safe-cell';

/**
 * Launch readiness F-02: every Clubhouse export is one spreadsheet-safe CSV, built here.
 *
 *  - Text goes through the shared guard (`lib/csv/safe-cell.ts`): quoted per RFC 4180, and a cell a spreadsheet would read
 *    as a formula (`=`, `+`, `-`, `@`, behind any control character) starts with an apostrophe, so a name typed as
 *    `=HYPERLINK(…)` opens as text.
 *  - Numbers are written bare, with an ASCII minus, so a spreadsheet sums and sorts them: a to-par is −6 on screen and -6
 *    in the file. Never pass a figure as text.
 *  - The file starts with a UTF-8 byte order mark (Excel reads accented names and curly apostrophes right only with it) and
 *    ends its lines CRLF, as Excel on Windows expects.
 */

export type ChCsvValue = string | number | boolean | null | undefined;

export interface ChCsvFile {
  /** The file name, ending .csv (`chCsvName`). */
  name: string;
  head: readonly string[];
  rows: ReadonlyArray<readonly ChCsvValue[]>;
}

/** One cell: a finite number bare, yes or no for a flag, empty for nothing, text guarded and quoted. */
export function chCsvCell(v: ChCsvValue): string {
  if (v == null || v === '') return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return csvCell(v);
}

/** The whole file: the byte order mark, the head, then the rows, each line ended CRLF. */
export function chCsv(head: readonly string[], rows: ReadonlyArray<readonly ChCsvValue[]>): string {
  return '\uFEFF' + [head, ...rows].map((row) => row.map(chCsvCell).join(',') + '\r\n').join('');
}

/** A figure to `places` decimals, as a number (a spreadsheet's to sum), or null. */
export function csvRound(v: number | null | undefined, places = 1): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  const k = 10 ** places;
  return Math.round(v * k) / k;
}

/**
 * A finishing place as a spreadsheet sorts it: a plain place as a number ("3" is 3), a tie as written ("T3"). Text places
 * would sort 1, 10, 2.
 */
export function csvPlace(place: string | number | null | undefined): number | string | null {
  if (place == null || place === '') return null;
  if (typeof place === 'number') return Number.isFinite(place) ? place : null;
  return /^\d+$/.test(place) ? Number(place) : place;
}

/** A file name from its parts: "Demo University", "rounds", "2026-11-15" is demo-university-rounds-2026-11-15.csv. */
export function chCsvName(...parts: ReadonlyArray<string | null | undefined>): string {
  const slug = parts
    .filter((p): p is string => !!p && !!p.trim())
    .map((p) =>
      p
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, ''),
    )
    .filter(Boolean)
    .join('-');
  return `${slug || 'export'}.csv`;
}

export type ChCsvSaved = 'downloaded' | 'shared' | 'cancelled';

/**
 * Hands the file over: on a phone (`share`) through the share sheet when it takes a file, so it can go to Files, Mail or
 * AirDrop; anywhere else as a download. Closing the share sheet is `cancelled`, not a failure. Throws when the browser
 * refuses both.
 */
export async function saveCsv(file: ChCsvFile, opts: { share: boolean }): Promise<ChCsvSaved> {
  const blob = new File([chCsv(file.head, file.rows)], file.name, { type: 'text/csv;charset=utf-8' });
  if (opts.share && typeof navigator.share === 'function' && navigator.canShare?.({ files: [blob] })) {
    try {
      await navigator.share({ files: [blob], title: file.name });
      return 'shared';
    } catch (e) {
      if ((e as { name?: unknown } | null)?.name === 'AbortError') return 'cancelled';
      throw e;
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // After the click has read it: revoking in the same task can cancel the download in Safari.
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return 'downloaded';
}

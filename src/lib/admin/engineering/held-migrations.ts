/**
 * Parses `supabase/migrations/HELD.md`'s register table for rows still on
 * **HOLD** — a migration prepared and reviewed-or-not, but deliberately not
 * applied, waiting on the owner. Rows whose status starts with APPLIED,
 * OBSOLETE or VERIFIED are historical record, not decision material, and
 * are filtered out here.
 *
 * Deliberately does NOT attempt a full markdown-table parse. A handful of
 * APPLIED rows in this file carry an embedded literal `|` inside their prose
 * (6 pipe characters instead of the expected 5), which breaks a naive
 * `line.split('|')`. Every row this function actually returns (HOLD status)
 * has never been observed to carry one — this function only reads the
 * migration filename (backtick-quoted, so `[^\`]+` is safe: a filename
 * cannot contain a backtick) and the bolded status token, both of which sit
 * before any prose that might carry a stray pipe.
 */

export interface HeldMigrationRow {
  /** The first backtick-quoted filename on the row. A row that lists two
   *  files joined by "+" (apply-together pairs) reports only the first —
   *  good enough for a decision-inbox headline, not a full parse. */
  migrationFile: string;
  /** The bolded status token verbatim, e.g. "HOLD" or
   *  "HOLD — R3, not yet reviewed". */
  status: string;
  /** First ~240 chars of the "why" column, best-effort — may occasionally
   *  truncate mid-word or, on a row with an embedded pipe, mid-sentence.
   *  Never used for anything status-bearing, only as a headline excerpt. */
  reasonExcerpt: string;
  /** The "decided" column verbatim, when present. */
  decided: string | null;
}

const ROW_PATTERN = /^\|\s*`([^`]+)`[^|]*\|\s*\*\*([^*]+)\*\*\s*\|(.*)\|([^|]*)\|\s*$/;

function isDecisionWorthy(status: string): boolean {
  const s = status.trim().toUpperCase();
  return s.startsWith('HOLD');
}

function excerpt(text: string, max = 240): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

/** Pure — no I/O. Takes the file's already-read text. */
export function parseHeldMigrations(markdown: string): HeldMigrationRow[] {
  const rows: HeldMigrationRow[] = [];
  for (const line of markdown.split('\n')) {
    const match = ROW_PATTERN.exec(line);
    if (!match) continue;
    const migrationFile = match[1] ?? '';
    const status = match[2] ?? '';
    const why = match[3] ?? '';
    const decided = match[4] ?? '';
    if (!migrationFile || !isDecisionWorthy(status)) continue;
    rows.push({
      migrationFile,
      status: status.trim(),
      reasonExcerpt: excerpt(why),
      decided: decided.trim() || null,
    });
  }
  return rows;
}

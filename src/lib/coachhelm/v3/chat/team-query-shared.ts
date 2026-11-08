import { nowIso, type ToolEnvelope } from './provenance';
import { columnUnits, type Unit } from './data-dictionary';

/** What `query_team_data` and its `round_lines` source share: the loose query builder, a refusal, the default order and the rows envelope. */

export type Row = Record<string, unknown>;
export type Value = string | number | boolean | null;
/** The readers build a query from validated strings, so the typed client is stepped around here and nowhere else. */
export type LooseBuilder = {
  select: (cols: string, opts?: { count: 'exact' }) => LooseBuilder;
  eq: (c: string, v: unknown) => LooseBuilder;
  in: (c: string, v: unknown[]) => LooseBuilder;
  gte: (c: string, v: unknown) => LooseBuilder;
  lte: (c: string, v: unknown) => LooseBuilder;
  is: (c: string, v: null | boolean) => LooseBuilder;
  order: (c: string, o: { ascending: boolean }) => LooseBuilder;
  limit: (n: number) => LooseBuilder;
} & PromiseLike<{ data: Row[] | null; error: { message?: string } | null; count?: number | null }>;

export const refused = (why: string, allowed?: readonly string[]): ToolEnvelope => ({
  summary: 'That query was not run.',
  measurements: [],
  series: [],
  detail: { refused: true, reason: why, ...(allowed ? { allowed_columns: allowed } : {}) },
  coverage: 'unavailable',
  coverage_note: why,
  as_of: nowIso(),
});

/** Bookkeeping times say when a row was recomputed, not when anything happened: they are never what "latest" means in a question. */
const BOOKKEEPING = /^(?:updated_at|created_at|computed_at)$/;
const WHEN = /(?:^|_)(?:date|day|at|time)$/;

/**
 * The order a read takes when the question names none: the date the question is about, newest first. That is the date a filter narrows, else the
 * date among the columns asked for, else the table's own order. A bookkeeping time (`updated_at`) is never chosen over a date.
 */
export function defaultOrder(rule: { order: { column: string; ascending: boolean } }, columns: readonly string[], filters: ReadonlyArray<{ column: string }>, allowed: ReadonlySet<string>): { column: string; ascending: boolean } {
  const isWhen = (c: string) => WHEN.test(c) && !BOOKKEEPING.test(c) && allowed.has(c);
  const byFilter = filters.map((f) => f.column).find(isWhen);
  const byColumn = columns.find(isWhen);
  const pick = byFilter ?? byColumn;
  if (pick) return { column: pick, ascending: false };
  return rule.order;
}

/** The rows of a read as an envelope: units on every column, and a plain "first N of M" when the cap cut the result. */
export function rowsEnvelope(a: { label: string; table: string; columns: readonly string[]; rows: Row[]; total: number | null; limit: number; order: { column: string; ascending: boolean }; note?: string | null }): ToolEnvelope {
  const shown = a.rows.length;
  // The exact count when the server gave one; without it a result that fills the cap may be cut.
  const cut = a.total !== null ? a.total > shown : shown >= a.limit;
  const total = a.total ?? null;
  const units: Record<string, Unit> = columnUnits(a.table, a.columns);
  return {
    summary: `${shown} row${shown === 1 ? '' : 's'} of ${a.label}${cut && total !== null ? `, the first ${shown} of ${total}` : ''}.`,
    measurements: [],
    series: [],
    detail: {
      kind: 'team_data',
      rows: a.rows,
      row_count: shown,
      limit: a.limit,
      ...(total !== null ? { total_rows: total } : {}),
      truncated: cut,
      // What the rows are, in the coach's words ('rounds'), for the caption under the table; the model-facing note is `coverage_note`.
      noun: a.label,
      ordered_by: a.order.column,
      newest_first: !a.order.ascending,
      units,
    },
    coverage: cut ? 'partial' : 'complete',
    coverage_note: cut
      ? total !== null
        ? `Showing the first ${shown} of ${total} rows, ordered by ${a.order.column}${a.order.ascending ? '' : ' (newest first)'}. The other ${total - shown} are not shown: say so, and narrow the filters for the rest.`
        : `Showing the first ${shown} rows in this order; there may be more. Say so, and narrow the filters for the rest.`
      : (a.note ?? null),
    as_of: nowIso(),
  };
}

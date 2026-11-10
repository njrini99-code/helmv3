/**
 * What a coach is told about a cut list of records: "Newest 5 of 127 rounds". A records read carries its own words for the model in
 * `coverage_note` (column names, what to do next); that is never the coach's caption. Pure, shared by the server and the thread.
 */
export function rowsCaption(detail: unknown): string | null {
  const d = detail as { kind?: unknown; truncated?: unknown; row_count?: unknown; total_rows?: unknown; ordered_by?: unknown; newest_first?: unknown; noun?: unknown } | null | undefined;
  if (d?.kind !== 'team_data' || d.truncated !== true || typeof d.row_count !== 'number') return null;
  const noun = typeof d.noun === 'string' && d.noun ? d.noun : 'rows';
  const byDate = d.newest_first === true && typeof d.ordered_by === 'string' && /(?:^|_)(?:date|day|at|time)$/.test(d.ordered_by);
  const lead = byDate ? 'Newest' : 'First';
  return typeof d.total_rows === 'number' ? `${lead} ${d.row_count} of ${d.total_rows} ${noun}` : `${lead} ${d.row_count} ${noun}, and there may be more`;
}

/** Words written for the model ("say so", "narrow the filters", "ordered by round_date") that a coach never reads. */
export const MODEL_FACING_NOTE = /\b(?:say so|narrow the filters?|ordered by|not shown:|evidence_ref|metric_id)\b|[a-z]+_[a-z_]+/i;

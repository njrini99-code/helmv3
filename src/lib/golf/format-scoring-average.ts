/**
 * Shared scoring-average formatter.
 *
 * `avg_score` arrives from the stats cache as a raw mean and carries full
 * float precision. Rendering it directly gave a coach "75.58333333333334 avg"
 * on the Roster page — sixteen digits of arithmetic exhaust presented as a
 * statistic. A scoring average is meaningful to a tenth; the rest is noise
 * that makes the surface look unfinished.
 *
 * This exists rather than a `.toFixed(1)` at each call site because there were
 * four of them, three still raw when the fourth was fixed. One import is
 * harder to drift from than one habit.
 */
export function formatScoringAverage(avg: number | null | undefined): string {
  if (avg == null || !Number.isFinite(avg)) return '—';
  return avg.toFixed(1);
}

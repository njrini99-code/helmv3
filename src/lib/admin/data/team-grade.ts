import type { TeamHealth } from '@/lib/admin/data/golf';

/**
 * Bridge V2 team-page presentation helpers — pure, unit-tested. Kept
 * separate from `team-detail.ts` (the pinned data-lane module) since these
 * aren't part of that contract: they're UI-facing derivations computed from
 * fields `fetchTeamDetail` already returns (health from a last-activity
 * timestamp, error counts, roster status), not additional data-layer shape.
 */

/**
 * `UNKNOWN` is not a bad grade. It means the inputs could not be established.
 *
 * Added 2026-08-30 to close TEAM_GRADE_READ_FAILURE_READS_AS_HEALTHY. A failed
 * 7-day error-count read used to resolve to `0`, and zero errors graded a team
 * `A` — so a broken observability path rendered as excellent health. Failure to
 * observe something is not evidence that the thing is healthy.
 */
export type TeamGrade = 'A' | 'B' | 'C' | 'D' | 'UNKNOWN';

/** Dormant health or a heavily-errored/heavily-dormant roster drags the
 *  grade down; a clean active team is an A. */
export function computeTeamGrade(input: {
  health: TeamHealth;
  /** `null` = the error count could not be read. NOT the same as zero. */
  errors7d: number | null;
  dormantRosterRatio: number;
}): TeamGrade {
  // Checked FIRST, before any other rule. A dormant team with an unreadable
  // error count is still ungradeable — grading it 'D' would be luck rather than
  // evidence, and this function's whole contract is that its output is earned.
  if (input.errors7d === null) return 'UNKNOWN';
  if (input.health === 'dormant') return 'D';
  if (input.errors7d > 5 || input.dormantRosterRatio > 0.5) return 'C';
  if (input.health === 'cooling' || input.errors7d > 0 || input.dormantRosterRatio > 0.25) return 'B';
  return 'A';
}

/** Deterministic "computed insights" strip copy from the team's own
 *  numbers — no LLM, no guesswork, just honest arithmetic. */
export function computeTeamComputedInsights(
  roster: readonly { activityStatus: TeamHealth }[],
  rounds30d: number,
  /** `null` = unreadable. The strip must not claim "no errors" from that. */
  errors7d: number | null,
): string[] {
  const insights: string[] = [];
  const dormantCount = roster.filter((r) => r.activityStatus === 'dormant').length;
  if (dormantCount > 0) {
    insights.push(`${dormantCount} player${dormantCount === 1 ? '' : 's'} inactive 14+ days`);
  }
  if (roster.length > 0 && rounds30d === 0) {
    insights.push('No rounds logged in the last 30 days');
  }
  if (errors7d === null) {
    insights.push('Error count unavailable for the last 7 days');
  } else if (errors7d > 0) {
    insights.push(`${errors7d} error${errors7d === 1 ? '' : 's'} in the last 7 days`);
  }
  // The all-clear requires an ACTUAL zero. Reading `errors7d === 0` when the
  // count is unknown is how a failed read became "fully active with no errors".
  if (dormantCount === 0 && rounds30d > 0 && errors7d === 0 && roster.length > 0) {
    insights.push('Team is fully active with no errors');
  }
  return insights;
}

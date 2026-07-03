import type { TeamHealth } from '@/lib/admin/data/golf';

/**
 * Bridge V2 team-page presentation helpers — pure, unit-tested. Kept
 * separate from `team-detail.ts` (the pinned data-lane module) since these
 * aren't part of that contract: they're UI-facing derivations computed from
 * fields `fetchTeamDetail` already returns (health from a last-activity
 * timestamp, error counts, roster status), not additional data-layer shape.
 */

export type TeamGrade = 'A' | 'B' | 'C' | 'D';

/** Dormant health or a heavily-errored/heavily-dormant roster drags the
 *  grade down; a clean active team is an A. */
export function computeTeamGrade(input: {
  health: TeamHealth;
  errors7d: number;
  dormantRosterRatio: number;
}): TeamGrade {
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
  errors7d: number,
): string[] {
  const insights: string[] = [];
  const dormantCount = roster.filter((r) => r.activityStatus === 'dormant').length;
  if (dormantCount > 0) {
    insights.push(`${dormantCount} player${dormantCount === 1 ? '' : 's'} inactive 14+ days`);
  }
  if (roster.length > 0 && rounds30d === 0) {
    insights.push('No rounds logged in the last 30 days');
  }
  if (errors7d > 0) {
    insights.push(`${errors7d} error${errors7d === 1 ? '' : 's'} in the last 7 days`);
  }
  if (dormantCount === 0 && rounds30d > 0 && errors7d === 0 && roster.length > 0) {
    insights.push('Team is fully active with no errors');
  }
  return insights;
}

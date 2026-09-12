/**
 * ============================================================================
 * Fairway · CoachHelm · roster-health — pure roster-health computations.
 * ----------------------------------------------------------------------------
 * Extracted from `RosterHealthHeader.tsx` (review
 * docs/design/fairway-facelift/REVIEW.md, "Roster · desktop" row): that file's
 * `RosterHealthHeader` JSX component had NO render call sites left anywhere in
 * the app — the "Who needs your attention" instrument it drew is only ever
 * rendered today via `FairwayCoachRoster.tsx`'s own header Surface, composed
 * from these two functions' output. The component (and the vocabulary that
 * only it used — `NEEDS_ATTENTION_LIST_CAP`, the local `playerName` helper)
 * was deleted with it; `computeRosterHealth`/`computeNeedsAttention` are the
 * only two things any caller still imports, so they live on their own here
 * with no JSX/React import at all.
 * ========================================================================== */

import type { PlayersGridPlayer, PlayersGridFocusArea, PlayersGridStats, RosterRow } from './PlayersGridView';

export interface RosterHealth {
  totalPlayers: number;
  playersWithActive: number;
  coverage: number;
  activeAreas: number;
  completedAreas: number;
  playersWithRounds: number;
  outcomeTally: { improved: number; noChange: number; worsened: number };
  totalOutcomes: number;
}

/** A roster row flagged for coach triage, with a ranked priority + plain reason. */
export interface NeedRow {
  row: RosterRow;
  priority: number;
  reason: string;
}

/**
 * Derive the roster-health metrics (coverage, active/completed focus-area
 * counts, outcome mix) from props a caller already has — players, their
 * focus areas, and a rounds_played-bearing stats record. No new fetch.
 */
export function computeRosterHealth(
  players: PlayersGridPlayer[],
  focusAreas: PlayersGridFocusArea[],
  playerStats: Record<string, PlayersGridStats>,
): RosterHealth {
  const totalPlayers = players.length;

  // Players carrying at least one active/in-progress focus area → coverage.
  const playersWithActive = new Set(
    focusAreas
      .filter((fa) => fa.status === 'active' || fa.status === 'in_progress')
      .map((fa) => fa.player_id),
  ).size;

  const activeAreas = focusAreas.filter(
    (fa) => fa.status === 'active' || fa.status === 'in_progress',
  ).length;
  const completedAreas = focusAreas.filter((fa) => fa.status === 'completed').length;

  // Players with at least one recorded round (props-fed stats; no recompute).
  const playersWithRounds = players.filter(
    (p) => (playerStats[p.id]?.rounds_played ?? 0) > 0,
  ).length;

  // Recorded focus-area outcomes → the closed-loop payoff (verbatim verdicts).
  const outcomeTally = focusAreas.reduce(
    (acc, fa) => {
      switch (fa.outcome_status) {
        case 'improved':
          acc.improved += 1;
          break;
        case 'no_change':
          acc.noChange += 1;
          break;
        case 'worsened':
          acc.worsened += 1;
          break;
        default:
          break;
      }
      return acc;
    },
    { improved: 0, noChange: 0, worsened: 0 },
  );

  return {
    totalPlayers,
    playersWithActive,
    coverage: totalPlayers > 0 ? playersWithActive / totalPlayers : 0,
    activeAreas,
    completedAreas,
    playersWithRounds,
    outcomeTally,
    totalOutcomes: outcomeTally.improved + outcomeTally.noChange + outcomeTally.worsened,
  };
}

/**
 * Coach triage: who needs a look, ranked. Declining (esp. uncoached) first,
 * then players with rounds but no active focus area. Real `recent_trend` +
 * `activeCount` from the SAME rosterRows a caller already built — no fetch.
 */
export function computeNeedsAttention(rosterRows: RosterRow[]): NeedRow[] {
  return rosterRows
    .map((row): NeedRow => {
      const trend = row.stats?.recent_trend ?? null;
      const rounds = row.stats?.rounds_played ?? 0;
      const uncoached = row.activeCount === 0;
      if (trend === 'declining' && uncoached)
        return { row, priority: 3, reason: 'Trending down · no focus area' };
      if (trend === 'declining') return { row, priority: 2, reason: 'Trending down' };
      if (rounds > 0 && uncoached) return { row, priority: 1, reason: 'No focus area yet' };
      return { row, priority: 0, reason: '' };
    })
    .filter((n) => n.priority > 0)
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        (b.row.stats?.avg_score ?? 0) - (a.row.stats?.avg_score ?? 0),
    );
}

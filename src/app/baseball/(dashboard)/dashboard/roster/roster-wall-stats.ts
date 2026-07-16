/**
 * Roster wall stat-column builders (desktop 4-column table + phone 1-column
 * card row), split out of RosterFairway.tsx so the pure column logic is
 * directly unit-testable without pulling in RosterFairway's much heavier
 * component graph (LineupBuilder, InviteModal, RosterMemberActions, ...) —
 * same rationale as `roster-constants.ts` alongside this file.
 */
import type { BaseballPlayerAggregates } from '@/lib/types';
import { formatRate, type PlayerRowStat } from '@/components/baseball/living-annual';

export const EM_DASH = '—';

// EXIT V intentionally omitted — the aggregates table carries no exit-velocity
// column in the live schema and nothing writes one (Ruling 4). Honest UI over
// a dead column: don't render a stat that can never populate.
//
// SESS intentionally omitted too (#roster-sess-dishonest): `agg.total_sessions`
// is `Math.max(legacy.total_sessions, boxScore.g)` (legacy-stat-adapters.ts,
// `adaptLegacyPlayerStats`) — an honest "whole-row session count" by that
// function's OWN contract, but it almost always resolves to the deprecated
// legacy row count, which has no relationship to games played THIS season.
// Sitting undisclosed beside four columns that ARE current-season box-score
// truth (AVG/OBP/SLG/OPS), it reads as "games this season" and isn't — e.g. a
// team with 8 games all season showed row values of 14-22. Drop it rather
// than caveat a legacy/current-season distinction in a 4-letter header.
export const WALL_COLUMNS = ['AVG', 'OBP', 'SLG', 'OPS'];

export function buildWallStats(agg: BaseballPlayerAggregates | undefined, leader: boolean): PlayerRowStat[] {
  if (!agg) {
    return [
      { value: EM_DASH },
      { value: EM_DASH },
      { value: EM_DASH },
      { value: EM_DASH },
    ];
  }
  return [
    { value: agg.career_avg == null ? EM_DASH : formatRate(agg.career_avg, 3) },
    { value: agg.career_obp == null ? EM_DASH : formatRate(agg.career_obp, 3) },
    { value: agg.career_slg == null ? EM_DASH : formatRate(agg.career_slg, 3) },
    { value: agg.career_ops == null ? EM_DASH : formatRate(agg.career_ops, 3), leader },
  ];
}

// Phone read (doctrine Rule 8): identity is the point of this row, so at
// 390px it carries exactly ONE headline figure — overall production (OPS),
// the same column the desktop wall crowns a team leader in — rather than the
// two (AVG + OPS) the wider table shows. Two fixed-width stat columns left no
// reserved room for the name plate (`PlayerRowPlate`'s name span would lose
// its width race against the jersey number + PositionChip and render 0-1
// characters — #roster-mobile-name-collapse); AVG/OBP/SLG/SESS all live one
// tap away on the player detail page this row already opens. Label renders
// inline (PlayerRowStat's "standalone row" mode) since there's no shared
// `PlayerRowPlateHeader` at this width to carry it instead.
export function buildWallStatsMobile(agg: BaseballPlayerAggregates | undefined, leader: boolean): PlayerRowStat[] {
  if (!agg) {
    return [{ label: 'OPS', value: EM_DASH }];
  }
  return [{ label: 'OPS', value: agg.career_ops == null ? EM_DASH : formatRate(agg.career_ops, 3), leader }];
}

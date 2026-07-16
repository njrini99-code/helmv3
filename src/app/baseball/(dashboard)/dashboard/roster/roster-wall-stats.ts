/**
 * Roster wall stat-column builders (desktop 4-column table + phone 1-column
 * card row), split out of RosterFairway.tsx so the pure column logic is
 * directly unit-testable without pulling in RosterFairway's much heavier
 * component graph (LineupBuilder, InviteModal, RosterMemberActions, ...) —
 * same rationale as `roster-constants.ts` alongside this file.
 */
import type { BaseballPlayerAggregates } from '@/lib/types';
import { formatRate, type PlayerRowStat } from '@/components/baseball/living-annual';
import type { Freshness } from '@/components/baseball/roster/roster-triage';

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

// Triage-board row (Position / Status / Development tabs, #roster-triage-
// kebab-clip): TriageBoard's grid (`grid-cols-1 sm:grid-cols-2 xl:grid-cols-3
// 2xl:grid-cols-4`) keeps every card roughly 360-400px wide at EVERY
// breakpoint — it's a masonry-style multi-column layout that adds more
// same-width columns as the viewport grows, not a table that widens with it
// — so the original 2-stat row (production OPS + last-touch freshness) was
// never actually a "mobile-only" width problem. With a jersey number +
// PositionChip taking their share of that ~360-400px card, and — on the
// Status board specifically — the trailing RosterRowMenu kebab too, there
// was no room left for PlayerRowPlate's `min-w-[64px]` name floor: real
// flexbox overflow that PaperCard's `overflow-hidden` clips, up to and
// including the row's own Edit/Remove kebab on the Status board (a
// functional access regression, not just a cosmetic one).
//
// Freshness — not production — is the signal unique to a triage board: OPS
// already headlines the Roster Wall's 'cards' surface (`buildWallStatsMobile`
// above) with the same leader treatment, and the whole premise of a triage
// board is "what needs my attention right now", which is a recency question,
// not a production one. So freshness is the one that survives the width cut.
// Production is one tap away on the player's own stats page — same
// precedent as `buildWallStatsMobile`'s AVG/OBP/SLG rationale.
export function buildBoardStats(fresh: Freshness): PlayerRowStat[] {
  return [{ label: 'Updated', value: fresh.label, leader: fresh.level === 'fresh' }];
}

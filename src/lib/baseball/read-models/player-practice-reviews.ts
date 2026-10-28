// =============================================================================
// src/lib/baseball/read-models/player-practice-reviews.ts
//
// The player's view of practice reviews (baseball_practice_effectiveness_reviews).
//
// Owner rule (2026-10-28): a player sees a review only when a coach marked it
// visible to players (visibility = 'player_visible') AND the player is one of
// the review's players (player_ids). staff_only and restricted never reach a
// player; neither does a teammate's review or a team-level review that names
// no players.
//
// RLS is the real gate: the held migration
// 20261028120000_baseball_practice_reviews_player_read.sql adds the player
// SELECT policy. Until it is applied a player's session reads zero rows, and
// the page simply shows no review section. This module re-applies the same
// rule in process so a wider policy (or a coach session reading this path)
// can never put someone else's review on a player's screen.
//
// Pure: no I/O. The server action does the read and hands the rows here.
// =============================================================================

import type { BaseballEffectivenessVerdict } from '@/lib/types/baseball-practice-effectiveness';

/**
 * The columns the player read selects. Only what the player card shows plus
 * what the rule needs: never confounders, metric windows, source refs or the
 * staff disposition.
 */
export const PLAYER_PRACTICE_REVIEW_COLUMNS =
  'id, practice_id, focus_area, conclusion, verdict, visibility, player_ids';

export interface PlayerPracticeReviewRow {
  id: string;
  practice_id: string;
  focus_area: string | null;
  conclusion: string | null;
  verdict: string | null;
  visibility: string;
  player_ids: string[] | null;
}

export interface PlayerPracticeReviewView {
  id: string;
  practiceId: string;
  focusArea: string | null;
  conclusion: string;
  verdict: BaseballEffectivenessVerdict | null;
}

const VERDICTS: ReadonlySet<string> = new Set<BaseballEffectivenessVerdict>([
  'worked',
  'needs_more_time',
  'not_enough_data',
]);

/** Plain words for the coach's verdict, as the coach screen labels them. */
export const PRACTICE_REVIEW_VERDICT_LABEL: Record<BaseballEffectivenessVerdict, string> = {
  worked: 'Worked',
  needs_more_time: 'Needs more time',
  not_enough_data: 'Not enough data',
};

/** True when this row may be shown to this player under the owner rule. */
export function isVisibleToPlayer(row: PlayerPracticeReviewRow, playerId: string | null): boolean {
  if (!playerId) return false;
  if (row.visibility !== 'player_visible') return false;
  return Array.isArray(row.player_ids) && row.player_ids.includes(playerId);
}

/**
 * Keep the rows this player may see and group them by practice id. A row with
 * no conclusion text has nothing to show and is left out.
 */
export function groupPlayerPracticeReviews(
  rows: readonly PlayerPracticeReviewRow[] | null | undefined,
  playerId: string | null,
): Map<string, PlayerPracticeReviewView[]> {
  const byPractice = new Map<string, PlayerPracticeReviewView[]>();
  for (const row of rows ?? []) {
    if (!isVisibleToPlayer(row, playerId)) continue;
    const conclusion = row.conclusion?.trim();
    if (!conclusion) continue;
    const view: PlayerPracticeReviewView = {
      id: row.id,
      practiceId: row.practice_id,
      focusArea: row.focus_area?.trim() || null,
      conclusion,
      verdict: row.verdict && VERDICTS.has(row.verdict) ? (row.verdict as BaseballEffectivenessVerdict) : null,
    };
    const list = byPractice.get(row.practice_id);
    if (list) list.push(view);
    else byPractice.set(row.practice_id, [view]);
  }
  return byPractice;
}

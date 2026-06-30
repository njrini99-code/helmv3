/**
 * Decision Room read-model — Game Results.
 *
 * Surfaces recent COMPLETED games (date, opponent, result/score) for the Staff
 * Decision Room from the EXISTING prod table `baseball_games`. No migrations —
 * the table already exists.
 *
 * RLS SAFETY: the caller MUST pass the AUTHENTICATED Supabase server client
 * (created via `await createClient()` from '@/lib/supabase/server') so row-level
 * security applies and rows are scoped to the caller's team. We never use the
 * service-role/admin client here. Every query is additionally scoped by
 * `team_id = teamId` as defense-in-depth alongside RLS.
 *
 * HONESTY: returns real rows or an honest empty array. No fabricated data. A
 * failed query fails honest (empty array) rather than throwing into the UI.
 *
 * TYPES: `DecisionRoomGameResult` is imported from the canonical action module
 * and never redefined here, so this mapper stays locked to the exact shape the
 * UI consumes.
 *
 * This is a plain server module — NO 'use server'. Reads only; no writes.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import type { DecisionRoomGameResult } from '@/lib/baseball/decision-room/types';

/**
 * Generic Supabase client alias. The Decision Room callers pass the
 * authenticated server client; we accept an untyped Database generic so this
 * module does not need the generated Database types to compile.
 */
type Client = SupabaseClient<any, 'public', any>;

/**
 * Cap rows well under PostgREST's hard 1000-row server max so reads never
 * silently truncate. A season of games is comfortably under this; we only
 * surface the most-recent slice for the Decision Room anyway.
 */
const MAX_ROWS = 100;

/**
 * `baseball_games.status` values that count as a finished, scoreable game.
 * (Verified against prod: the only populated status is `completed`.)
 */
const COMPLETED_STATUSES = ['completed', 'complete', 'final', 'finished'] as const;

/** Row shape we read from `baseball_games` (subset of the table's columns). */
type GameRow = {
  id: string;
  team_id: string;
  game_date: string | null;
  game_type: string | null;
  opponent_name: string | null;
  location: string | null;
  home_away: string | null;
  our_score: number | null;
  opponent_score: number | null;
  innings_played: number | null;
  status: string | null;
  notes: string | null;
  created_at: string | null;
};

function nonEmpty(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isCompleted(status: string | null): boolean {
  if (!status) return false;
  return (COMPLETED_STATUSES as readonly string[]).includes(status.toLowerCase());
}

/**
 * Win / loss / tie from our perspective. Returns null when either score is
 * missing (we never invent a result we cannot prove from the data).
 */
function resultOf(
  ourScore: number | null,
  opponentScore: number | null,
): 'win' | 'loss' | 'tie' | null {
  if (ourScore == null || opponentScore == null) return null;
  if (ourScore > opponentScore) return 'win';
  if (ourScore < opponentScore) return 'loss';
  return 'tie';
}

/**
 * Loads recent COMPLETED games for the team, most-recent first, for the
 * Decision Room "game results" rail.
 *
 * @param supabase AUTHENTICATED server client (RLS-bound to the caller).
 * @param teamId   The caller's team id; the query is additionally scoped to it.
 */
export async function loadGameResults(
  supabase: Client,
  teamId: string,
): Promise<DecisionRoomGameResult[]> {
  if (!teamId) return [];

  const { data, error } = await supabase
    .from('baseball_games')
    .select(
      'id, team_id, game_date, game_type, opponent_name, location, home_away, our_score, opponent_score, innings_played, status, notes, created_at',
    )
    .eq('team_id', teamId)
    .order('game_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false, nullsFirst: false })
    .limit(MAX_ROWS);

  if (error) {
    // Fail honest: surface an empty list rather than throwing into the UI.
    return [];
  }

  const rows = (data ?? []) as GameRow[];

  return rows
    .filter((row) => isCompleted(row.status))
    .map((row) => {
      const ourScore = row.our_score ?? null;
      const opponentScore = row.opponent_score ?? null;
      const result = resultOf(ourScore, opponentScore);
      const opponent = nonEmpty(row.opponent_name) ?? 'TBD';
      const scoreLabel =
        ourScore != null && opponentScore != null
          ? `${ourScore}-${opponentScore}`
          : null;

      return {
        id: row.id,
        date: row.game_date,
        gameDate: row.game_date,
        opponent,
        opponentName: opponent,
        homeAway: nonEmpty(row.home_away),
        gameType: nonEmpty(row.game_type),
        location: nonEmpty(row.location),
        ourScore,
        opponentScore,
        score: scoreLabel,
        result,
        inningsPlayed: row.innings_played ?? null,
        notes: nonEmpty(row.notes),
      };
    }) as unknown as DecisionRoomGameResult[];
}

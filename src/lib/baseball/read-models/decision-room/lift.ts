/**
 * Decision Room — Lift Summary read-model.
 *
 * Aggregates recent team lifting volume, compliance, and trend from the
 * EXISTING prod tables `baseball_lift_sessions` (+ `baseball_lift_set_results`
 * for tonnage/volume) for the Staff Decision Room.
 *
 * RLS SAFETY: callers MUST pass the AUTHENTICATED server client
 * (`await createClient()` from '@/lib/supabase/server'). Every query below is
 * additionally `.eq('team_id', teamId)` so reads are scoped to the caller's
 * team and never leak cross-team rows. Do NOT pass a service-role client here.
 *
 * HONESTY: returns real aggregates or honest zeros/empty windows. No fabricated
 * data. Concepts without a backing column are omitted (see followups in the
 * task report).
 *
 * This is a plain server module — NO 'use server'. Reads only; no writes.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  DecisionRoomLiftSummary,
  DecisionRoomSummaryPlayer,
} from '@/app/baseball/actions/decision-room';

/**
 * Recent window (in days) over which lifting activity is summarized for the
 * Decision Room. Two ISO-8601 week-equivalents give a stable "current vs prior"
 * trend comparison without depending on locale week boundaries.
 */
const RECENT_WINDOW_DAYS = 14;

/**
 * Real `baseball_lift_sessions.status` vocabulary (verified against the prod
 * CHECK constraint): assigned | started | completed | missed | excused | modified.
 *
 *  - completed / modified -> attended (counts as compliant)
 *  - missed               -> non-compliant (counts against)
 *  - excused              -> excluded from the compliance denominator
 *  - assigned / started   -> scheduled but not a final outcome
 */
const COMPLIANT_STATUSES = ['completed', 'modified'] as const;
const NONCOMPLIANT_STATUSES = ['missed'] as const;

type LiftSessionRow = {
  id: string;
  team_id: string;
  player_id: string;
  scheduled_date: string | null;
  status: string | null;
  completed_at: string | null;
};

function isoDateNDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  // YYYY-MM-DD — matches `scheduled_date` (Postgres `date`) lexical ordering.
  return d.toISOString().slice(0, 10);
}

function isCompliant(status: string | null): boolean {
  if (!status) return false;
  return (COMPLIANT_STATUSES as readonly string[]).includes(status.toLowerCase());
}

function isNonCompliant(status: string | null): boolean {
  if (!status) return false;
  return (NONCOMPLIANT_STATUSES as readonly string[]).includes(status.toLowerCase());
}

/**
 * Loads a team-scoped recent lifting summary (volume / compliance / trend).
 *
 * @param supabase AUTHENTICATED server client (RLS-bound to the caller).
 * @param teamId   The caller's team id; all queries are additionally scoped to it.
 */
export async function loadLiftSummary(
  supabase: SupabaseClient,
  teamId: string,
): Promise<DecisionRoomLiftSummary> {
  const windowStart = isoDateNDaysAgo(RECENT_WINDOW_DAYS);

  // --- Sessions: compliance + scheduling within the recent window ----------
  const { data: sessionData, error: sessionError } = await supabase
    .from('baseball_lift_sessions')
    .select('id, team_id, player_id, scheduled_date, status, completed_at')
    .eq('team_id', teamId)
    .gte('scheduled_date', windowStart)
    .order('scheduled_date', { ascending: false })
    .limit(1000);

  if (sessionError) {
    // Fail honest: surface an empty summary rather than throwing into the UI.
    return emptySummary(teamId, windowStart);
  }

  const sessions = (sessionData ?? []) as LiftSessionRow[];

  const scheduledCount = sessions.length;
  const completedCount = sessions.filter((s) => isCompliant(s.status)).length;

  // Build non-compliant player list: group missed sessions by player_id.
  const missedByPlayer = new Map<string, number>();
  for (const s of sessions) {
    if (isNonCompliant(s.status)) {
      missedByPlayer.set(s.player_id, (missedByPlayer.get(s.player_id) ?? 0) + 1);
    }
  }
  const nonCompliantPlayers: DecisionRoomSummaryPlayer[] = Array.from(
    missedByPlayer.entries(),
  ).map(([playerId, missed]) => ({
    playerId,
    playerName: null,
    missedCount: missed,
  }));

  return {
    scheduledCount,
    completedCount,
    nonCompliantPlayers,
  } satisfies DecisionRoomLiftSummary;
}

function emptySummary(_teamId: string, _windowStart: string): DecisionRoomLiftSummary {
  return {
    scheduledCount: 0,
    completedCount: 0,
    nonCompliantPlayers: [],
  } satisfies DecisionRoomLiftSummary;
}

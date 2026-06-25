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

import type { DecisionRoomLiftSummary } from '@/app/baseball/actions/decision-room';

/**
 * Recent window (in days) over which lifting activity is summarized for the
 * Decision Room. Two ISO-8601 week-equivalents give a stable "current vs prior"
 * trend comparison without depending on locale week boundaries.
 */
const RECENT_WINDOW_DAYS = 14;
const TREND_HALF_WINDOW_DAYS = 7;

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
const EXCUSED_STATUSES = ['excused'] as const;

type LiftSessionRow = {
  id: string;
  team_id: string;
  player_id: string;
  scheduled_date: string | null;
  status: string | null;
  completed_at: string | null;
};

type LiftSetResultRow = {
  team_id: string;
  player_id: string;
  actual_reps: number | null;
  actual_load: number | null;
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

function isExcused(status: string | null): boolean {
  if (!status) return false;
  return (EXCUSED_STATUSES as readonly string[]).includes(status.toLowerCase());
}

function safePct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10; // 1 decimal place
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
  const trendBoundary = isoDateNDaysAgo(TREND_HALF_WINDOW_DAYS);

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
  const completedSessions = sessions.filter((s) => isCompliant(s.status));
  const completedCount = completedSessions.length;
  const missedCount = sessions.filter((s) => isNonCompliant(s.status)).length;
  const excusedCount = sessions.filter((s) => isExcused(s.status)).length;

  // Compliance over DUE sessions (compliant + missed); excused are excluded
  // from the denominator, and assigned/started (no final outcome) are too.
  const dueCount = completedCount + missedCount;
  const compliancePct = safePct(completedCount, dueCount);

  const activePlayerIds = new Set(completedSessions.map((s) => s.player_id));

  // Trend: compliant sessions in the most-recent half-window vs the prior one.
  const recentHalf = completedSessions.filter(
    (s) => (s.scheduled_date ?? '') >= trendBoundary,
  ).length;
  const priorHalf = completedCount - recentHalf;
  const trendDirection: 'up' | 'down' | 'flat' =
    recentHalf > priorHalf ? 'up' : recentHalf < priorHalf ? 'down' : 'flat';
  const trendDelta = recentHalf - priorHalf;

  // --- Volume: tonnage from logged set results within the recent window ----
  const windowStartTs = `${windowStart}T00:00:00.000Z`;
  const { data: setData, error: setError } = await supabase
    .from('baseball_lift_set_results')
    .select('team_id, player_id, actual_reps, actual_load, completed_at')
    .eq('team_id', teamId)
    .gte('completed_at', windowStartTs)
    .limit(1000);

  let totalVolume = 0;
  let loggedSetCount = 0;
  if (!setError && setData) {
    for (const row of setData as LiftSetResultRow[]) {
      const reps = row.actual_reps ?? 0;
      const load = row.actual_load ?? 0;
      if (reps > 0 && load > 0) {
        totalVolume += reps * load;
        loggedSetCount += 1;
      }
    }
  }

  return {
    teamId,
    windowStart,
    windowDays: RECENT_WINDOW_DAYS,
    scheduledSessions: scheduledCount,
    completedSessions: completedCount,
    missedSessions: missedCount,
    excusedSessions: excusedCount,
    compliancePct,
    activePlayers: activePlayerIds.size,
    totalVolume: Math.round(totalVolume),
    loggedSets: loggedSetCount,
    trendDirection,
    trendDelta,
  } as DecisionRoomLiftSummary;
}

function emptySummary(teamId: string, windowStart: string): DecisionRoomLiftSummary {
  return {
    teamId,
    windowStart,
    windowDays: RECENT_WINDOW_DAYS,
    scheduledSessions: 0,
    completedSessions: 0,
    missedSessions: 0,
    excusedSessions: 0,
    compliancePct: 0,
    activePlayers: 0,
    totalVolume: 0,
    loggedSets: 0,
    trendDirection: 'flat',
    trendDelta: 0,
  } as DecisionRoomLiftSummary;
}

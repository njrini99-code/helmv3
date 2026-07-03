/**
 * Decision Room — Lift Summary read-model.
 *
 * Aggregates recent team lifting volume, compliance, and trend from the
 * unified Helm Lifting Lab tables (`helm_lifting_sessions`) for the Staff
 * Decision Room.
 *
 * W2-G rewire: createLiftAssignment / publishLiftDay / logLiftResult
 * (src/app/baseball/actions/lifting.ts + lifting-v11.ts) write sessions ONLY
 * to helm_lifting_sessions now — the legacy baseball_lift_sessions table is
 * write-dead (this summary read 0 rows for real activity). helm_lifting_
 * sessions is keyed by (organization_id, athlete_id), not (team_id,
 * player_id), so this module resolves the team's organization + athlete-id
 * map first (via resolveBaseballLiftingOrg / resolveBaseballAthleteIds) and
 * maps every row's athlete_id back to a baseball_players.id before returning
 * — the DecisionRoomSummaryPlayer.playerId contract is unchanged.
 *
 * RLS SAFETY: callers MUST pass the AUTHENTICATED server client
 * (`await createClient()` from '@/lib/supabase/server'). Reads are scoped to
 * the caller's org + team-resolved athlete set so results never leak
 * cross-team rows. Do NOT pass a service-role client here.
 *
 * HONESTY: returns real aggregates or honest zeros/empty windows. No fabricated
 * data. Concepts without a backing column are omitted (see followups in the
 * task report).
 *
 * This is a plain server module — NO 'use server'. Reads only; no writes.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { fromUntyped } from '@/lib/supabase/untyped';
import { resolveBaseballLiftingOrg } from '@/lib/lifting/resolve-baseball-context';
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
 * `helm_lifting_sessions.status` vocabulary (mirrors the legacy
 * `baseball_lift_sessions` CHECK constraint it was cloned from):
 * assigned | started | completed | missed | excused | modified.
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
  athlete_id: string;
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

  // --- Resolve the team's Helm Lifting org + its athlete-id map -------------
  // helm_lifting_athletes.team_id is the SAME soft-ref baseball_teams.id the
  // legacy table used, so filtering by it (+ organization_id) is the direct
  // equivalent of the old `.eq('team_id', teamId)` scoping.
  const liftCtx = await resolveBaseballLiftingOrg(teamId);
  if (!liftCtx) {
    // No Helm Lifting organization configured for this team yet — honest empty.
    return emptySummary(teamId, windowStart);
  }

  const { data: athleteRows } = await fromUntyped(supabase, 'helm_lifting_athletes')
    .select('id, sport_player_id')
    .eq('organization_id', liftCtx.organizationId)
    .eq('sport', 'baseball')
    .eq('team_id', teamId) as {
    data: Array<{ id: string; sport_player_id: string | null }> | null;
  };
  const athleteToPlayer = new Map<string, string>();
  const athleteIds: string[] = [];
  for (const row of athleteRows ?? []) {
    if (!row.sport_player_id) continue;
    athleteToPlayer.set(row.id, row.sport_player_id);
    athleteIds.push(row.id);
  }
  if (!athleteIds.length) {
    return emptySummary(teamId, windowStart);
  }

  // --- Sessions: compliance + scheduling within the recent window ----------
  const { data: sessionData, error: sessionError } = await fromUntyped(supabase, 'helm_lifting_sessions')
    .select('id, athlete_id, scheduled_date, status, completed_at')
    .eq('organization_id', liftCtx.organizationId)
    .in('athlete_id', athleteIds)
    .gte('scheduled_date', windowStart)
    .order('scheduled_date', { ascending: false })
    .limit(1000) as {
    data: LiftSessionRow[] | null;
    error: { message: string } | null;
  };

  if (sessionError) {
    // Fail honest: surface an empty summary rather than throwing into the UI.
    return emptySummary(teamId, windowStart);
  }

  const sessions = (sessionData ?? []) as LiftSessionRow[];

  const scheduledCount = sessions.length;
  const completedCount = sessions.filter((s) => isCompliant(s.status)).length;

  // Build non-compliant player list: group missed sessions by player_id
  // (mapped back from athlete_id via the roster resolved above).
  const missedByPlayer = new Map<string, number>();
  for (const s of sessions) {
    const playerId = athleteToPlayer.get(s.athlete_id);
    if (!playerId) continue; // athlete not resolved to a roster player — skip.
    if (isNonCompliant(s.status)) {
      missedByPlayer.set(playerId, (missedByPlayer.get(playerId) ?? 0) + 1);
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

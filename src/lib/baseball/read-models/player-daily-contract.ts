// =============================================================================
// src/lib/baseball/read-models/player-daily-contract.ts
//
// V5 Player Daily Contract read model — the daily commitment loop that compounds
// into the Passport's development story.
//
// Spec anchor: v5 Player Passport "Development Story" (timeline / goals /
// practice progress). The Daily Contract is the MECHANIC that produces those
// timeline entries: a player commits to a few concrete daily intentions, honors
// them through the day, and a completed committed day writes a timeline event.
//
// HONESTY:
//   - An uncommitted/empty day is NOT a streak. The streak only counts days the
//     player actually COMMITTED to and then COMPLETED.
//   - Per-item done/skipped is preserved: a partial day reports honored vs total,
//     a skipped item is never shown as done.
//   - SELF-ONLY: resolves the current player from the session; never accepts a
//     player id from the caller for the player's own loop. RLS backs every query.
//
// 'server-only' + plain async functions (NOT 'use server').
// =============================================================================

import 'server-only';

import { createClient } from '@/lib/supabase/server';
import {
  isoMinusDays,
  resolveTeamTimezone,
  todayIsoInTz,
} from '@/lib/baseball/daily-contract/contract-day';
import type {
  BaseballPlayerDailyContractRow,
  DailyContractItem,
  DailyContractStatus,
  DailyContractVisibility,
} from '@/lib/types/baseball-passport';

// -----------------------------------------------------------------------------
// Public shapes
// -----------------------------------------------------------------------------

export interface DailyContractView {
  id: string;
  contractDate: string;
  status: DailyContractStatus;
  items: DailyContractItem[];
  reflection: string | null;
  committedAt: string | null;
  completedAt: string | null;
  /** When a committed day rolled over to 'missed' without completion (or null). */
  missedAt: string | null;
  /** Honored (done) vs total committed items — keeps a partial day honest. */
  honoredCount: number;
  totalCount: number;
  /** Who the player chose to share this day with (default 'player_only'). */
  visibility: DailyContractVisibility;
  /** When a coach acknowledged this shared day (null = not acked / private). */
  coachAcknowledgedAt: string | null;
}

export interface DailyContractReadModel {
  playerId: string | null;
  teamId: string;
  authorized: boolean;
  /** Today's contract (or null when the player hasn't started one today). */
  today: DailyContractView | null;
  /** Recent history (most recent first), excluding today. */
  history: DailyContractView[];
  /**
   * Current commit-and-complete streak: consecutive most-recent days (ending
   * today or yesterday) the player COMMITTED to AND COMPLETED. Honest — an empty
   * or draft-only day breaks the streak; a 'missed' day breaks it too.
   */
  streak: number;
  /**
   * How many of the loaded recent days closed as 'missed' (committed but never
   * completed). Surfaces the accountability signal honestly instead of letting an
   * abandoned commitment vanish. Excludes today (today is still live).
   */
  missedCount: number;
  /**
   * The most recent past day that closed as 'missed', or null. Drives an honest
   * "you let a commitment lapse" nudge on Today without scanning history.
   */
  lastMissed: DailyContractView | null;
  /** ISO date the model treated as "today". */
  todayIso: string;
  error: string | null;
}

// -----------------------------------------------------------------------------
// Options
// -----------------------------------------------------------------------------

export interface DailyContractOptions {
  /** ISO date (YYYY-MM-DD) to treat as "today"; defaults to the TEAM-tz date. */
  forDate?: string;
  /** How many history rows to include (default 14, max 60). */
  historyLimit?: number;
}

// -----------------------------------------------------------------------------
// Player resolution (self-only)
// -----------------------------------------------------------------------------

async function resolveMyPlayerId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamId: string,
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: player } = await supabase
    .from('baseball_players')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!player) return null;

  const { data: member } = await supabase
    .from('baseball_team_members')
    .select('id')
    .eq('team_id', teamId)
    .eq('player_id', player.id)
    .maybeSingle();
  return member ? player.id : null;
}

// -----------------------------------------------------------------------------
// Mapping + derivations
// -----------------------------------------------------------------------------

function toView(row: BaseballPlayerDailyContractRow): DailyContractView {
  const items = Array.isArray(row.items) ? row.items : [];
  const honoredCount = items.filter((i) => i.done).length;
  return {
    id: row.id,
    contractDate: row.contract_date,
    status: row.status,
    items,
    reflection: row.reflection,
    committedAt: row.committed_at,
    completedAt: row.completed_at,
    missedAt: row.missed_at ?? null,
    honoredCount,
    totalCount: items.length,
    visibility: row.visibility ?? 'player_only',
    coachAcknowledgedAt: row.coach_acknowledged_at ?? null,
  };
}

/**
 * The SINGLE source of truth for whether a closed day earns STREAK CREDIT (Gap 3).
 *
 * A day extends the streak only when it is 'completed' AND honored at least one
 * item. A 0-honored completed day closes the ritual honestly (the player did show
 * up + reflect) but does NOT count — the streak means "days you did the work,"
 * not "days you tapped complete." Exported so the coach read-model + tests share
 * exactly this rule (the coach/player streak definitions MUST stay identical).
 */
export function isStreakCreditedDay(v: {
  status: DailyContractStatus;
  honoredCount: number;
}): boolean {
  return v.status === 'completed' && v.honoredCount >= 1;
}

/**
 * Honest streak: count back from today (or yesterday if today isn't streak-
 * credited yet) over consecutive days that were COMMITTED, COMPLETED, AND honored
 * at least one item. A gap, a draft, a missing day, OR a 0-honored completion
 * ends the streak.
 */
export function computeStreak(
  byDate: Map<string, DailyContractView>,
  todayIso: string,
): number {
  // The streak may legitimately "end" at today (if it's streak-credited) or
  // yesterday (if today is still in progress OR closed with 0 honored). A
  // completed-but-0-honored today falls back to yesterday's anchor: it neither
  // counts toward the streak nor falsely breaks it by being an empty close.
  let cursor = todayIso;
  const todayView = byDate.get(todayIso);
  if (!todayView || !isStreakCreditedDay(todayView)) {
    cursor = isoMinusDays(todayIso, 1);
  }

  let streak = 0;
  // Cap the walk so a corrupted map can't loop unbounded.
  for (let i = 0; i < 400; i += 1) {
    const v = byDate.get(cursor);
    if (!v || !isStreakCreditedDay(v)) break;
    streak += 1;
    cursor = isoMinusDays(cursor, 1);
  }
  return streak;
}

// -----------------------------------------------------------------------------
// getPlayerDailyContract
// -----------------------------------------------------------------------------

/**
 * Build the SELF-ONLY daily-contract read model for the current player on
 * `teamId`. Returns authorized:false when the current user is not a player-member
 * of the team. Never throws.
 */
export async function getPlayerDailyContract(
  teamId: string,
  options: DailyContractOptions = {},
): Promise<DailyContractReadModel> {
  const { forDate, historyLimit = 14 } = options;
  // "Today" anchors on the TEAM tz (resolved below once we have a client), not
  // server UTC — so the READ agrees with the tz-correct WRITE. An explicit
  // forDate wins; the UTC slice is only a pre-client placeholder for the no-team
  // early return and is overwritten before any data is read.
  let todayIso = forDate ?? new Date().toISOString().slice(0, 10);

  const base = (
    playerId: string | null,
    authorized: boolean,
    error: string | null,
  ): DailyContractReadModel => ({
    playerId,
    teamId,
    authorized,
    today: null,
    history: [],
    streak: 0,
    missedCount: 0,
    lastMissed: null,
    todayIso,
    error,
  });

  if (!teamId) return base(null, false, 'A team id is required.');

  const supabase = await createClient();
  if (!forDate) {
    todayIso = todayIsoInTz(await resolveTeamTimezone(supabase, teamId));
  }
  const playerId = await resolveMyPlayerId(supabase, teamId);
  if (!playerId) return base(null, false, null);

  const limit = Math.min(Math.max(historyLimit, 1), 60);

  // The generated database.ts lags this migration — use the established `as any`
  // accessor; the row shape is asserted to BaseballPlayerDailyContractRow.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = (await (supabase as any)
    .from('baseball_player_daily_contracts')
    .select(
      'id, player_id, team_id, contract_date, status, items, reflection, committed_at, completed_at, missed_at, visibility, created_at, updated_at',
    )
    .eq('player_id', playerId)
    .eq('team_id', teamId)
    .order('contract_date', { ascending: false })
    .limit(limit + 1)) as {
    data: BaseballPlayerDailyContractRow[] | null;
    error: unknown;
  };

  if (error) {
    return base(playerId, true, 'Your daily contracts could not be loaded.');
  }

  const rows = data ?? [];
  const views = rows.map(toView);
  const byDate = new Map<string, DailyContractView>(
    views.map((v) => [v.contractDate, v]),
  );

  const today = byDate.get(todayIso) ?? null;
  const history = views.filter((v) => v.contractDate !== todayIso).slice(0, limit);
  const streak = computeStreak(byDate, todayIso);

  // Surface the accountability signal: missed days among the loaded recent history
  // (excluding today). `lastMissed` is the most-recent past missed day — history is
  // already sorted contract_date DESC, so the first missed entry is the latest.
  const missedHistory = history.filter((v) => v.status === 'missed');
  const missedCount = missedHistory.length;
  const lastMissed = missedHistory[0] ?? null;

  return {
    playerId,
    teamId,
    authorized: true,
    today,
    history,
    streak,
    missedCount,
    lastMissed,
    todayIso,
    error: null,
  };
}

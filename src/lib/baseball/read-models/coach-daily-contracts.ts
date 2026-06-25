// =============================================================================
// src/lib/baseball/read-models/coach-daily-contracts.ts
//
// V5 Daily Contract — the STAFF half of the commitment loop.
//
// The player-side mechanic (player-daily-contract.ts) is SELF-ONLY. This read
// model is its mirror for COACHES: a roster-wide "who shared a contract today,
// who honored it, who's on a streak" feed, plus a per-player drill-in. It powers
// the coach Daily Contract surface in the Command Center and the player profile.
//
// PRIVACY (binding — this is the whole point of the visibility column):
//   - Only rows the PLAYER explicitly shared (visibility <> 'player_only') are
//     ever returned. A player's private day is invisible here. RLS enforces this
//     independently (the SELECT policy gates coaches to non-player_only rows);
//     this model ALSO filters defensively (defense in depth).
//   - The private REFLECTION is NEVER exposed to a coach, even on a shared row.
//     We deliberately omit it from the projection: a coach sees the intentions
//     and the honored/total counts, not the player's private end-of-day note.
//
// HONESTY:
//   - Streak is computed the SAME way the player sees it (committed-AND-completed
//     consecutive days), but ONLY over the days the player shared — a coach can
//     never infer a private day's existence from the streak. So the coach streak
//     is the "shared streak": consecutive shared+completed days. This is honest
//     about what the coach can actually see, and never over-claims.
//   - A roster member who shared nothing today appears with shared:false (an
//     honest "nothing shared", not a fake zero contract).
//
// STAFF ONLY: resolves the viewer server-side; returns authorized:false (empty)
// for a non-staff viewer. 'server-only' plain async functions (NOT 'use server').
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

/** A single shared day projected for a coach (NO private reflection). */
export interface CoachContractDayView {
  id: string;
  playerId: string;
  contractDate: string;
  status: DailyContractStatus;
  visibility: DailyContractVisibility;
  items: DailyContractItem[];
  honoredCount: number;
  totalCount: number;
  committedAt: string | null;
  completedAt: string | null;
  /** When a committed day rolled over to 'missed' without completion (or null). */
  missedAt: string | null;
  /** When a coach acked this shared day (null = not yet acked). */
  coachAcknowledgedAt: string | null;
}

/** One roster player's daily-contract pulse for the coach feed. */
export interface CoachContractRosterItem {
  playerId: string;
  firstName: string | null;
  lastName: string | null;
  jerseyNumber: number | null;
  primaryPosition: string | null;
  /** True only when the player SHARED a contract for the focus date. */
  shared: boolean;
  /** The shared day for the focus date, or null when nothing shared. */
  today: CoachContractDayView | null;
  /** Shared-and-completed consecutive-day streak (honest, shared-only). */
  sharedStreak: number;
}

export interface CoachDailyContractsReadModel {
  teamId: string;
  /** False when the current user is not staff on this team. */
  authorized: boolean;
  /** ISO date the model treated as the focus "today". */
  todayIso: string;
  /** Every roster player (sorted), with their shared-today status + streak. */
  roster: CoachContractRosterItem[];
  summary: {
    rosterSize: number;
    /** How many players shared a contract for the focus date. */
    sharedToday: number;
    /** Of the shared, how many marked the day completed. */
    completedToday: number;
    /** Of the shared, how many closed as 'missed' (committed, never completed). */
    missedToday: number;
    /** Of the shared, how many are still awaiting a coach ack. */
    awaitingAck: number;
  };
  /** Honest error string when a sub-read failed; arrays stay safe ([]). */
  error: string | null;
}

// -----------------------------------------------------------------------------
// Options
// -----------------------------------------------------------------------------

export interface CoachDailyContractsOptions {
  /** ISO date (YYYY-MM-DD) to treat as the focus day; defaults to the TEAM-tz date. */
  forDate?: string;
  /** How many days of shared history to scan for streaks (default 30, max 90). */
  historyDays?: number;
}

// -----------------------------------------------------------------------------
// Staff authorization
// -----------------------------------------------------------------------------

async function isTeamStaff(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamId: string,
): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!coach) return false;

  const { data: staff } = await supabase
    .from('baseball_team_coach_staff')
    .select('id')
    .eq('team_id', teamId)
    .eq('coach_id', coach.id)
    .maybeSingle();

  return !!staff;
}

// -----------------------------------------------------------------------------
// Derivations
// -----------------------------------------------------------------------------

function toDayView(row: BaseballPlayerDailyContractRow): CoachContractDayView {
  const items = Array.isArray(row.items) ? row.items : [];
  return {
    id: row.id,
    playerId: row.player_id,
    contractDate: row.contract_date,
    status: row.status,
    visibility: row.visibility,
    items,
    honoredCount: items.filter((i) => i.done).length,
    totalCount: items.length,
    committedAt: row.committed_at,
    completedAt: row.completed_at,
    missedAt: row.missed_at ?? null,
    coachAcknowledgedAt: row.coach_acknowledged_at ?? null,
  };
}

/**
 * Build the set of dates that earn SHARED streak credit (Gap 3): a shared row
 * that is 'completed' AND honored at least one item. A 0-honored completed day
 * closes honestly but does NOT extend the streak — keeping the coach + player
 * streak definitions identical (the file's own invariant).
 */
function streakCreditedDates(rows: BaseballPlayerDailyContractRow[]): Set<string> {
  return new Set(
    rows
      .filter(
        (r) =>
          r.status === 'completed' &&
          (Array.isArray(r.items) ? r.items : []).filter((i) => i.done).length >=
            1,
      )
      .map((r) => r.contract_date),
  );
}

/**
 * Shared-only streak: consecutive most-recent days (ending today or yesterday)
 * the player SHARED and COMPLETED. Mirrors the player-side honest streak, but is
 * computed only over shared rows the coach can actually see — it never over-
 * claims a private day. A gap, a non-completed shared day, or an unshared day
 * ends the streak.
 */
function computeSharedStreak(
  completedSharedDates: Set<string>,
  todayIso: string,
): number {
  let cursor = todayIso;
  if (!completedSharedDates.has(todayIso)) {
    cursor = isoMinusDays(todayIso, 1);
  }
  let streak = 0;
  for (let i = 0; i < 400; i += 1) {
    if (!completedSharedDates.has(cursor)) break;
    streak += 1;
    cursor = isoMinusDays(cursor, 1);
  }
  return streak;
}

// -----------------------------------------------------------------------------
// Roster shape (minimal player fields for the feed)
// -----------------------------------------------------------------------------

interface RosterMemberRow {
  player_id: string;
  jersey_number: number | null;
  position: string | null;
  baseball_players: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    primary_position: string | null;
  } | null;
}

// -----------------------------------------------------------------------------
// getCoachDailyContracts — roster-wide feed
// -----------------------------------------------------------------------------

/**
 * Build the staff-facing roster-wide Daily Contract feed for `teamId`. Returns
 * authorized:false (empty) when the current user is not staff on the team.
 * Never throws — a sub-read failure degrades to an honest `error` + safe arrays.
 */
export async function getCoachDailyContracts(
  teamId: string,
  options: CoachDailyContractsOptions = {},
): Promise<CoachDailyContractsReadModel> {
  const { forDate, historyDays = 30 } = options;
  const days = Math.min(Math.max(historyDays, 1), 90);
  // "Today" anchors on the TEAM tz so the coach feed and the player loop agree on
  // one shared "today". An explicit forDate wins; the UTC slice is only a pre-
  // client placeholder for the no-team early return, overwritten before any read.
  let todayIso = forDate ?? new Date().toISOString().slice(0, 10);
  let sinceIso = isoMinusDays(todayIso, days);

  const empty = (
    authorized: boolean,
    error: string | null,
  ): CoachDailyContractsReadModel => ({
    teamId,
    authorized,
    todayIso,
    roster: [],
    summary: {
      rosterSize: 0,
      sharedToday: 0,
      completedToday: 0,
      missedToday: 0,
      awaitingAck: 0,
    },
    error,
  });

  if (!teamId) return empty(false, null);

  const supabase = await createClient();
  if (!forDate) {
    todayIso = todayIsoInTz(await resolveTeamTimezone(supabase, teamId));
    sinceIso = isoMinusDays(todayIso, days);
  }
  if (!(await isTeamStaff(supabase, teamId))) return empty(false, null);

  // Roster (active members) — minimal projection for the feed.
  const { data: memberRows, error: rosterErr } = (await supabase
    .from('baseball_team_members')
    .select(
      'player_id, jersey_number, position, baseball_players!inner ( id, first_name, last_name, primary_position )',
    )
    .eq('team_id', teamId)) as unknown as {
    data: RosterMemberRow[] | null;
    error: unknown;
  };

  if (rosterErr) {
    return empty(true, 'The roster could not be loaded right now.');
  }
  const members = memberRows ?? [];

  // Shared contracts for the window. RLS already restricts a coach to shared
  // rows; we ALSO filter visibility <> 'player_only' defensively, and bound by
  // date so a long history can't blow up the payload.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: contractRows, error: contractErr } = (await (supabase as any)
    .from('baseball_player_daily_contracts')
    .select(
      'id, player_id, team_id, contract_date, status, items, committed_at, completed_at, missed_at, visibility, coach_acknowledged_at',
    )
    .eq('team_id', teamId)
    .neq('visibility', 'player_only')
    .gte('contract_date', sinceIso)
    .lte('contract_date', todayIso)
    .order('contract_date', { ascending: false })) as {
    data: BaseballPlayerDailyContractRow[] | null;
    error: unknown;
  };

  if (contractErr) {
    return empty(true, 'Shared daily contracts could not be loaded.');
  }

  // Index shared days by player.
  const byPlayer = new Map<string, BaseballPlayerDailyContractRow[]>();
  for (const r of contractRows ?? []) {
    // Defense in depth: never trust a row that slipped through as private.
    if (r.visibility === 'player_only') continue;
    const list = byPlayer.get(r.player_id) ?? [];
    list.push(r);
    byPlayer.set(r.player_id, list);
  }

  const roster: CoachContractRosterItem[] = members.map((m) => {
    const p = m.baseball_players;
    const rows = byPlayer.get(m.player_id) ?? [];
    const todayRow = rows.find((r) => r.contract_date === todayIso) ?? null;
    const completedSharedDates = streakCreditedDates(rows);
    return {
      playerId: m.player_id,
      firstName: p?.first_name ?? null,
      lastName: p?.last_name ?? null,
      jerseyNumber: m.jersey_number,
      primaryPosition: p?.primary_position ?? m.position ?? null,
      shared: !!todayRow,
      today: todayRow ? toDayView(todayRow) : null,
      sharedStreak: computeSharedStreak(completedSharedDates, todayIso),
    };
  });

  // Sort: shared-today first, then by honored desc, then by name — the coach's
  // eye lands on who's engaging today, not on alphabetical noise.
  roster.sort((a, b) => {
    if (a.shared !== b.shared) return a.shared ? -1 : 1;
    const ah = a.today?.honoredCount ?? -1;
    const bh = b.today?.honoredCount ?? -1;
    if (ah !== bh) return bh - ah;
    return (a.lastName ?? '').localeCompare(b.lastName ?? '');
  });

  const sharedTodayItems = roster.filter((r) => r.shared);
  const summary = {
    rosterSize: members.length,
    sharedToday: sharedTodayItems.length,
    completedToday: sharedTodayItems.filter(
      (r) => r.today?.status === 'completed',
    ).length,
    missedToday: sharedTodayItems.filter(
      (r) => r.today?.status === 'missed',
    ).length,
    awaitingAck: sharedTodayItems.filter(
      (r) => r.today && !r.today.coachAcknowledgedAt,
    ).length,
  };

  return { teamId, authorized: true, todayIso, roster, summary, error: null };
}

// -----------------------------------------------------------------------------
// getCoachPlayerDailyContract — per-player drill-in for a coach
// -----------------------------------------------------------------------------

export interface CoachPlayerDailyContractReadModel {
  teamId: string;
  playerId: string;
  authorized: boolean;
  /** The player's shared day for the focus date, or null. */
  today: CoachContractDayView | null;
  /** Recent SHARED history (most recent first), excluding the focus date. */
  history: CoachContractDayView[];
  sharedStreak: number;
  todayIso: string;
  error: string | null;
}

/**
 * Per-player coach drill-in: the player's SHARED daily contracts only. Staff-
 * authorized; returns authorized:false for non-staff. Never exposes the private
 * reflection (projection omits it). Used on the coach player profile.
 */
export async function getCoachPlayerDailyContract(
  teamId: string,
  playerId: string,
  options: CoachDailyContractsOptions = {},
): Promise<CoachPlayerDailyContractReadModel> {
  const { forDate, historyDays = 30 } = options;
  const days = Math.min(Math.max(historyDays, 1), 90);
  // TEAM-tz anchor (see getCoachDailyContracts) so the drill-in's "today" matches
  // the player's own loop. forDate wins; UTC slice is a pre-client placeholder.
  let todayIso = forDate ?? new Date().toISOString().slice(0, 10);
  let sinceIso = isoMinusDays(todayIso, days);

  const base = (
    authorized: boolean,
    error: string | null,
  ): CoachPlayerDailyContractReadModel => ({
    teamId,
    playerId,
    authorized,
    today: null,
    history: [],
    sharedStreak: 0,
    todayIso,
    error,
  });

  if (!teamId || !playerId) return base(false, null);

  const supabase = await createClient();
  if (!forDate) {
    todayIso = todayIsoInTz(await resolveTeamTimezone(supabase, teamId));
    sinceIso = isoMinusDays(todayIso, days);
  }
  if (!(await isTeamStaff(supabase, teamId))) return base(false, null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = (await (supabase as any)
    .from('baseball_player_daily_contracts')
    .select(
      'id, player_id, team_id, contract_date, status, items, committed_at, completed_at, missed_at, visibility, coach_acknowledged_at',
    )
    .eq('team_id', teamId)
    .eq('player_id', playerId)
    .neq('visibility', 'player_only')
    .gte('contract_date', sinceIso)
    .lte('contract_date', todayIso)
    .order('contract_date', { ascending: false })) as {
    data: BaseballPlayerDailyContractRow[] | null;
    error: unknown;
  };

  if (error) {
    return base(true, "This player's shared contracts could not be loaded.");
  }

  const rows = (data ?? []).filter((r) => r.visibility !== 'player_only');
  const todayRow = rows.find((r) => r.contract_date === todayIso) ?? null;
  const history = rows
    .filter((r) => r.contract_date !== todayIso)
    .map(toDayView);
  const completedSharedDates = streakCreditedDates(rows);

  return {
    teamId,
    playerId,
    authorized: true,
    today: todayRow ? toDayView(todayRow) : null,
    history,
    sharedStreak: computeSharedStreak(completedSharedDates, todayIso),
    todayIso,
    error: null,
  };
}

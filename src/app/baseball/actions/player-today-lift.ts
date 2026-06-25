'use server';

// =============================================================================
// src/app/baseball/actions/player-today-lift.ts
//
// Server action(s) for the Player Today surface's lift/readiness sub-surface.
//
// PlayerLiftToday previously queried baseball_lift_sessions and
// baseball_readiness_checkins directly on the client side using an `as any`
// cast (gap #7 in the player-today audit). Client-side raw DB queries:
//   (a) bypass the withBaseballAction auth wrapper,
//   (b) produce any-typed rows with no type safety,
//   (c) duplicate queries already run server-side in getPlayerToday().
//
// These server actions run inside withBaseballAction (auth + active-context +
// Sentry scope + sanitized error logging) and return typed results. The client
// component passes the result as a prop or calls this action on mount / refresh
// instead of hitting the DB directly.
//
// SELF ONLY: both actions resolve the caller's own player id server-side.
// RLS independently scopes every query to the calling user's player id.
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import { withBaseballAction } from '@/lib/baseball/with-baseball-action';
import type { BaseballLiftSessionRow } from '@/lib/types/baseball-lifting-v11';

// baseball_lift_sessions and baseball_readiness_checkins are not in the
// generated database.ts (they land via migrations 20260624000061/63). Use the
// established `as any` table-accessor pattern; the hand-written Row types in
// @/lib/types/baseball-lifting-v11 are the contract. RLS is the gate.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedClient = any;

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

const OPEN_STATUSES = ['assigned', 'started', 'modified'] as const;

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface LiftTodaySummaryResult {
  success: boolean;
  error?: string;
  sessions: BaseballLiftSessionRow[];
  checkin: {
    id: string;
    check_date: string;
    sleep_hours: number | null;
    energy_level: number | null;
    soreness_level: number | null;
    arm_status: string | null;
    notes: string | null;
  } | null;
}

// ---------------------------------------------------------------------------
// getPlayerLiftTodaySummary
// ---------------------------------------------------------------------------

/**
 * Fetch today's lift sessions + the player's today readiness check-in for the
 * Player Today / Lift & Check-in card. Replaces the client-side raw DB queries
 * in PlayerLiftToday.tsx with a proper server action that (a) runs inside the
 * withBaseballAction auth wrapper, (b) returns typed results, and (c) avoids
 * duplicating data already fetched by getPlayerToday().
 */
export const getPlayerLiftTodaySummary = withBaseballAction(
  'getPlayerLiftTodaySummary',
  { featureArea: 'player_today' },
  async (ctx): Promise<LiftTodaySummaryResult> => {
    const supabase = await createClient();

    // Resolve the caller's own player id (SELF ONLY — never accepts a player id
    // from the caller so one player cannot request another's data).
    const { data: playerRow } = await supabase
      .from('baseball_players')
      .select('id')
      .eq('user_id', ctx.user.id)
      .maybeSingle();
    if (!playerRow) {
      return { success: false, error: 'No player profile found.', sessions: [], checkin: null };
    }
    const playerId = playerRow.id;

    const db = supabase as UntypedClient;
    const today = todayStr();

    const [openRes, todayAllRes, checkinRes] = await Promise.all([
      // Open (overdue or ongoing) sessions up through today.
      db
        .from('baseball_lift_sessions')
        .select(
          'id, title, scheduled_date, status, day_type, baseball_context, estimated_minutes, team_id, player_id',
        )
        .eq('player_id', playerId)
        .eq('team_id', ctx.activeTeamId)
        .lte('scheduled_date', today)
        .in('status', OPEN_STATUSES)
        .order('scheduled_date', { ascending: true })
        .limit(20),
      // All of today's sessions (including completed/missed so the player sees
      // confirmation of what they already logged today).
      db
        .from('baseball_lift_sessions')
        .select(
          'id, title, scheduled_date, status, day_type, baseball_context, estimated_minutes, team_id, player_id',
        )
        .eq('player_id', playerId)
        .eq('team_id', ctx.activeTeamId)
        .eq('scheduled_date', today)
        .order('scheduled_date', { ascending: true })
        .limit(20),
      // Today's readiness check-in (if submitted).
      db
        .from('baseball_readiness_checkins')
        .select('id, check_date, sleep_hours, energy_level, soreness_level, arm_status, notes')
        .eq('player_id', playerId)
        .eq('team_id', ctx.activeTeamId)
        .eq('check_date', today)
        .maybeSingle(),
    ]);

    if (openRes.error) {
      return {
        success: false,
        error: 'Could not load your lifts. Please try again.',
        sessions: [],
        checkin: null,
      };
    }

    // Merge open + today rows, de-duped by id, open sessions sort first.
    const byId = new Map<string, BaseballLiftSessionRow>();
    for (const r of [
      ...((openRes.data ?? []) as BaseballLiftSessionRow[]),
      ...((todayAllRes.data ?? []) as BaseballLiftSessionRow[]),
    ]) {
      byId.set(r.id, r);
    }
    const sessions = Array.from(byId.values()).sort((a, b) => {
      const aOpen = OPEN_STATUSES.includes(a.status as (typeof OPEN_STATUSES)[number]) ? 0 : 1;
      const bOpen = OPEN_STATUSES.includes(b.status as (typeof OPEN_STATUSES)[number]) ? 0 : 1;
      if (aOpen !== bOpen) return aOpen - bOpen;
      return (a.scheduled_date ?? '').localeCompare(b.scheduled_date ?? '');
    });

    const checkinRow = (checkinRes.data ?? null) as {
      id: string;
      check_date: string;
      sleep_hours: number | null;
      energy_level: number | null;
      soreness_level: number | null;
      arm_status: string | null;
      notes: string | null;
    } | null;

    return { success: true, sessions, checkin: checkinRow };
  },
);

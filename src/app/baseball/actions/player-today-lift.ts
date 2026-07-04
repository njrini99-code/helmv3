'use server';

// =============================================================================
// src/app/baseball/actions/player-today-lift.ts
//
// Server action(s) for the Player Today surface's lift/readiness sub-surface.
//
// W2-G REWIRE: reads from helm_lifting_sessions and helm_lifting_readiness_checkins
// (the unified Lab tables) instead of the legacy baseball_lift_sessions /
// baseball_readiness_checkins. Context resolution via
// resolveBaseballLiftingOrg + resolveMyBaseballAthleteId from
// @/lib/lifting/resolve-baseball-context.
//
// Returns the same LiftTodaySummaryResult shape (BaseballLiftSessionRow[]) so
// the PlayerLiftToday component is unchanged. The helm session rows are adapted
// back to BaseballLiftSessionRow via adaptSession from baseball-view-adapter.
//
// SELF ONLY: both actions resolve the caller's own athlete id server-side.
// RLS independently scopes every query to the calling user's athlete id.
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { withBaseballAction } from '@/lib/baseball/with-baseball-action';
import {
  resolveBaseballLiftingOrg,
  resolveMyBaseballAthleteId,
} from '@/lib/lifting/resolve-baseball-context';
import {
  adaptSession,
  adaptHelmReadinessCheckin,
} from '@/lib/lifting/adapters/baseball-view-adapter';
import type { BaseballLiftSessionRow } from '@/lib/types/baseball-lifting-v11';
import type {
  HelmLiftingSessionRow,
  HelmLiftingReadinessCheckinRow,
} from '@/lib/types/helm-lifting-data';

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
 * Player Today / Lift & Check-in card. Reads from helm_lifting_sessions and
 * helm_lifting_readiness_checkins (the unified Lab tables) after the W2-G
 * rewire, adapting results back to the BaseballLiftSessionRow shape the
 * PlayerLiftToday component expects.
 *
 * Falls back to empty results (not an error) when the player has no athlete
 * row in helm_lifting_athletes yet (e.g. backfill not yet run) so the Today
 * card degrades to an honest empty state rather than an error banner.
 */
export const getPlayerLiftTodaySummary = withBaseballAction(
  'getPlayerLiftTodaySummary',
  { featureArea: 'baseball-player-today' },
  async (ctx): Promise<LiftTodaySummaryResult> => {
    const supabase = await createClient();

    // Resolve org context (helm_lifting_* tables are org-scoped).
    const liftCtx = await resolveBaseballLiftingOrg(ctx.activeTeamId);
    if (!liftCtx) {
      // Team has no org — degrade to empty rather than error.
      return { success: true, sessions: [], checkin: null };
    }

    // Resolve this player's helm_lifting_athletes.id (SELF ONLY).
    const athleteId = await resolveMyBaseballAthleteId(liftCtx.organizationId);
    if (!athleteId) {
      // Not yet seeded in helm_lifting_athletes — honest empty state.
      return { success: true, sessions: [], checkin: null };
    }

    // Resolve baseball_players.id for the reverse athlete→player id map needed
    // by adaptSession. We know ctx.activeTeamId scopes the player correctly;
    // find the player row for this user to build the map.
    const { data: playerRow } = await supabase
      .from('baseball_players')
      .select('id')
      .eq('user_id', ctx.user.id)
      .maybeSingle();
    const playerId = playerRow?.id ?? athleteId;
    const athleteToPlayer: Record<string, string> = { [athleteId]: playerId };

    const today = todayStr();

    const [openRes, todayAllRes, checkinRes] = await Promise.all([
      // Open (overdue or ongoing) sessions up through today.
      fromUntyped(supabase, 'helm_lifting_sessions')
        .select(
          'id, title, scheduled_date, status, day_type, sport_context, estimated_minutes, team_id, athlete_id, program_assignment_id, organization_id, sport, started_at, completed_at, readiness_checkin_id, coach_review_status, player_note, coach_note, legacy_baseball_id, created_at, updated_at',
        )
        .eq('athlete_id', athleteId)
        .eq('organization_id', liftCtx.organizationId)
        .lte('scheduled_date', today)
        .in('status', [...OPEN_STATUSES])
        .order('scheduled_date', { ascending: true })
        .limit(20),
      // All of today's sessions (including completed/missed so the player sees
      // confirmation of what they already logged today).
      fromUntyped(supabase, 'helm_lifting_sessions')
        .select(
          'id, title, scheduled_date, status, day_type, sport_context, estimated_minutes, team_id, athlete_id, program_assignment_id, organization_id, sport, started_at, completed_at, readiness_checkin_id, coach_review_status, player_note, coach_note, legacy_baseball_id, created_at, updated_at',
        )
        .eq('athlete_id', athleteId)
        .eq('organization_id', liftCtx.organizationId)
        .eq('scheduled_date', today)
        .order('scheduled_date', { ascending: true })
        .limit(20),
      // Today's readiness check-in (if submitted).
      fromUntyped(supabase, 'helm_lifting_readiness_checkins')
        .select(
          'id, checkin_date, sleep_quality, energy_level, soreness_overall, notes, athlete_id, organization_id, sport, stress_level, lower_body_status, illness_flag, mood, readiness_score, readiness_band, lift_session_id, visibility, legacy_baseball_id, created_at, updated_at',
        )
        .eq('athlete_id', athleteId)
        .eq('organization_id', liftCtx.organizationId)
        .eq('checkin_date', today)
        .maybeSingle(),
    ]);

    if ((openRes as { error?: unknown }).error) {
      return {
        success: false,
        error: 'Could not load your lifts. Please try again.',
        sessions: [],
        checkin: null,
      };
    }

    const fallbackTeamId = ctx.activeTeamId;

    // Merge open + today rows, de-duped by id, open sessions sort first.
    const byId = new Map<string, BaseballLiftSessionRow>();
    const allHelmRows = [
      ...((openRes.data ?? []) as HelmLiftingSessionRow[]),
      ...((todayAllRes.data ?? []) as HelmLiftingSessionRow[]),
    ];
    for (const r of allHelmRows) {
      if (!byId.has(r.id)) {
        byId.set(r.id, adaptSession(r, fallbackTeamId, athleteToPlayer));
      }
    }
    const sessions = Array.from(byId.values()).sort((a, b) => {
      const aOpen = OPEN_STATUSES.includes(a.status as (typeof OPEN_STATUSES)[number]) ? 0 : 1;
      const bOpen = OPEN_STATUSES.includes(b.status as (typeof OPEN_STATUSES)[number]) ? 0 : 1;
      if (aOpen !== bOpen) return aOpen - bOpen;
      return (a.scheduled_date ?? '').localeCompare(b.scheduled_date ?? '');
    });

    // Adapt the check-in to the shape the UI expects.
    let checkin: LiftTodaySummaryResult['checkin'] = null;
    const rawCheckin = (checkinRes.data ?? null) as HelmLiftingReadinessCheckinRow | null;
    if (rawCheckin) {
      const adapted = adaptHelmReadinessCheckin(rawCheckin, fallbackTeamId, athleteToPlayer);
      checkin = {
        id: adapted.id,
        check_date: adapted.check_date,
        sleep_hours: adapted.sleep_hours,
        energy_level: adapted.energy_level,
        soreness_level: adapted.soreness_level,
        arm_status: adapted.arm_status,
        notes: adapted.notes,
      };
    }

    return { success: true, sessions, checkin };
  },
);

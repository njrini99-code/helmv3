// =============================================================================
// src/app/baseball/(dashboard)/dashboard/performance/page.tsx
//
// Wave 9 / performance-lifting packet (P9.2).
// W2-G REWIRE: all READS now go through helm_lifting_* tables (via the Lab
// resolver + baseball-view-adapter) instead of the legacy baseball_lift_*
// tables. Visual output, capability gates, and component props are unchanged.
//
// Strength-coach Performance dashboard (server component). SERVER-GATED:
//   * Resolves the server-validated active baseball context (never trusts a
//     cookie on its own).
//   * Requires a STAFF role; players are redirected to their Player Today view
//     (their lift-execution surface lives there via PlayerLiftToday).
//   * Requires either can_manage_lifting (prescribe/library) OR can_view_readiness
//     (readiness review) on the active team. Without either, the staff member is
//     redirected to the dashboard home — nav hiding alone is not relied upon.
//
// All reads run through the request-scoped anon client so RLS applies; the
// capability resolve here is defense-in-depth + drives what the UI offers.
// =============================================================================

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import { resolveBaseballCapabilities } from '@/lib/baseball/capabilities';
import { getPerformanceCommandData } from '@/lib/baseball/read-models/performance-command';
import { PerformanceCommandCenter } from '@/components/baseball/performance/PerformanceCommandCenter';
import { PerformanceDashboardClient } from '@/components/baseball/performance/PerformanceDashboardClient';
import { getFullName } from '@/lib/utils';
import {
  resolveBaseballLiftingOrg,
  resolveBaseballAthleteIds,
} from '@/lib/lifting/resolve-baseball-context';
import {
  adaptSessionToAssignment,
  adaptExercise,
  adaptHelmReadinessCheckin,
} from '@/lib/lifting/adapters/baseball-view-adapter';
import type {
  BaseballLiftAssignmentRow,
  BaseballReadinessSummary,
  BaseballReadinessCheckinRow,
} from '@/lib/types/baseball-lifting';
import type { BaseballLiftExerciseRow } from '@/lib/types/baseball-lifting-v11';
import type {
  HelmLiftingSessionRow,
  HelmLiftingExerciseRow,
  HelmLiftingReadinessCheckinRow,
} from '@/lib/types/helm-lifting-data';

interface RosterPlayerRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  primary_position: string | null;
}

export default async function PerformancePage() {
  const context = await getActiveBaseballContext();
  if (!context) redirect('/baseball/login');

  // Players don't get the staff dashboard — their surface is Player Today.
  // The real player surface is /baseball/player/today (see nav-registry); the
  // old /baseball/dashboard/today route never existed.
  if (context.activeRole !== 'coach') {
    redirect('/baseball/player/today');
  }

  const teamId = context.activeTeamId;
  const caps = await resolveBaseballCapabilities(teamId);

  const canManageLifting = caps.can_manage_lifting;
  // V11: readiness/soreness is gated on can_view_readiness (NOT can_view_medical).
  // The strength coach holds can_view_readiness in its role preset and MUST see
  // readiness; gating on can_view_medical (which the strength preset does not
  // grant) was a real bug that hid readiness from the performance coach.
  const canViewReadiness = caps.can_view_readiness;
  if (!canManageLifting && !canViewReadiness) {
    redirect('/baseball/dashboard/command-center');
  }

  const supabase = await createClient();

  // Roster (RLS scopes to viewable players for this staff member).
  const { data: members } = await supabase
    .from('baseball_team_members')
    .select(
      `player_id,
       baseball_players!inner ( id, first_name, last_name, avatar_url, primary_position )`,
    )
    .eq('team_id', teamId);

  const roster: RosterPlayerRow[] = (members ?? [])
    .map((m) => m.baseball_players as unknown as RosterPlayerRow)
    .filter((p): p is RosterPlayerRow => Boolean(p?.id));

  // ---------------------------------------------------------------------------
  // Resolve Lab org context + athlete id map for the roster.
  // Falls back to empty data when the team has no org or no athletes seeded
  // in helm_lifting_athletes (pre-backfill state) — never errors the page.
  // ---------------------------------------------------------------------------
  const liftCtx = await resolveBaseballLiftingOrg(teamId);

  // Build baseball_players.id → helm_lifting_athletes.id map for the roster.
  // Used to adapt helm session athlete_ids back to player_ids for the component.
  const rosterPlayerIds = roster.map((p) => p.id);
  const athleteMap = liftCtx
    ? await resolveBaseballAthleteIds(liftCtx.organizationId, rosterPlayerIds)
    : {};
  // Reverse map: helm_lifting_athletes.id → baseball_players.id
  const athleteToPlayer: Record<string, string> = {};
  for (const [playerId, athleteId] of Object.entries(athleteMap)) {
    athleteToPlayer[athleteId] = playerId;
  }

  // ---------------------------------------------------------------------------
  // Recent sessions for the team, adapted to BaseballLiftAssignmentRow shape.
  // Reads helm_lifting_sessions (unified Lab tables) instead of the legacy
  // baseball_lift_assignments. Scoped to this team + org; limited window.
  // ---------------------------------------------------------------------------
  let assignments: BaseballLiftAssignmentRow[] = [];
  if (liftCtx) {
    const { data: sessionRows } = await fromUntyped(supabase, 'helm_lifting_sessions')
      .select(
        'id, title, scheduled_date, status, day_type, sport_context, estimated_minutes, team_id, athlete_id, program_assignment_id, organization_id, sport, started_at, completed_at, readiness_checkin_id, coach_review_status, player_note, coach_note, legacy_baseball_id, created_at, updated_at',
      )
      .eq('organization_id', liftCtx.organizationId)
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      .limit(100) as { data: HelmLiftingSessionRow[] | null };

    assignments = (sessionRows ?? []).map((r) =>
      adaptSessionToAssignment(r, teamId, athleteToPlayer),
    );
  }

  // ---------------------------------------------------------------------------
  // Team + global exercise library — reads helm_lifting_exercises (the unified
  // Lab table) instead of the legacy baseball_lift_exercises.
  // ---------------------------------------------------------------------------
  let exercises: BaseballLiftExerciseRow[] = [];
  if (liftCtx) {
    const { data: exerciseRows } = await fromUntyped(supabase, 'helm_lifting_exercises')
      .select('*')
      .eq('organization_id', liftCtx.organizationId)
      .or(`is_global.eq.true,sport.eq.baseball`)
      .eq('is_active', true)
      .order('name', { ascending: true }) as { data: HelmLiftingExerciseRow[] | null };

    exercises = (exerciseRows ?? []).map((r) => adaptExercise(r, teamId));
  }

  // ---------------------------------------------------------------------------
  // Readiness: reads helm_lifting_readiness_checkins instead of the legacy
  // baseball_readiness_checkins. Only fetched + shown when the staff member
  // holds the health gate.
  // ---------------------------------------------------------------------------
  let readiness: BaseballReadinessSummary[] = [];
  if (canViewReadiness && liftCtx) {
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    const fromDate = sevenDaysAgo.toISOString().slice(0, 10);

    // Build the set of athlete ids for this team's roster.
    const teamAthleteIds = Object.values(athleteMap);

    if (teamAthleteIds.length > 0) {
      const { data: checkinRows } = await fromUntyped(supabase, 'helm_lifting_readiness_checkins')
        .select(
          'id, checkin_date, sleep_quality, energy_level, soreness_overall, notes, athlete_id, organization_id, sport, stress_level, lower_body_status, illness_flag, mood, readiness_score, readiness_band, lift_session_id, visibility, legacy_baseball_id, created_at, updated_at',
        )
        .eq('organization_id', liftCtx.organizationId)
        .in('athlete_id', teamAthleteIds)
        .gte('checkin_date', fromDate)
        .order('checkin_date', { ascending: false }) as {
        data: HelmLiftingReadinessCheckinRow[] | null;
      };

      // Keep the latest check-in per athlete.
      const latestByAthlete = new Map<string, BaseballReadinessCheckinRow>();
      for (const c of checkinRows ?? []) {
        if (!latestByAthlete.has(c.athlete_id)) {
          latestByAthlete.set(
            c.athlete_id,
            adaptHelmReadinessCheckin(c, teamId, athleteToPlayer),
          );
        }
      }

      // Build the readiness summary list keyed on baseball player_id.
      readiness = roster.map((p) => {
        const athleteId = athleteMap[p.id];
        const latestCheckin = athleteId ? (latestByAthlete.get(athleteId) ?? null) : null;
        return {
          player_id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
          avatar_url: p.avatar_url,
          primary_position: p.primary_position,
          latest_checkin: latestCheckin,
        };
      });
    } else {
      // No athletes seeded yet — build an empty-checkin readiness list.
      readiness = roster.map((p) => ({
        player_id: p.id,
        first_name: p.first_name,
        last_name: p.last_name,
        avatar_url: p.avatar_url,
        primary_position: p.primary_position,
        latest_checkin: null,
      }));
    }
  }

  // V11 Command Center (KPI strip + Today Weight Room board + readiness queue),
  // materialized from the V11 session tables. The Lite tabbed dashboard remains
  // below for prescribe/library/readiness flows already shipped in Wave 9.
  const command = await getPerformanceCommandData(teamId, canViewReadiness);
  const playerNameById = Object.fromEntries(
    roster.map((p) => [p.id, getFullName(p.first_name, p.last_name)]),
  );
  const { data: teamRow } = await supabase
    .from('baseball_teams')
    .select('name')
    .eq('id', teamId)
    .maybeSingle();
  const teamName = (teamRow as { name?: string } | null)?.name ?? 'Team';

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6">
      <PerformanceCommandCenter
        teamName={teamName}
        trainingWeekLabel="This week"
        kpis={command.kpis}
        board={command.board}
        readiness={command.readiness}
        readinessWithheld={command.readinessWithheld}
        playerNameById={playerNameById}
      />
      <PerformanceDashboardClient
        teamId={teamId}
        canManageLifting={canManageLifting}
        canViewReadiness={canViewReadiness}
        roster={roster}
        assignments={assignments}
        exercises={exercises}
        readiness={readiness}
      />
    </div>
  );
}

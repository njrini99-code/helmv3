// =============================================================================
// src/app/baseball/(dashboard)/dashboard/performance/page.tsx
//
// Wave 9 / performance-lifting packet (P9.2).
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
import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import { resolveBaseballCapabilities } from '@/lib/baseball/capabilities';
import { getPerformanceCommandData } from '@/lib/baseball/read-models/performance-command';
import { PerformanceCommandCenter } from '@/components/baseball/performance/PerformanceCommandCenter';
import { PerformanceDashboardClient } from '@/components/baseball/performance/PerformanceDashboardClient';
import { getFullName } from '@/lib/utils';
import type {
  BaseballLiftAssignmentRow,
  BaseballReadinessSummary,
  BaseballReadinessCheckinRow,
} from '@/lib/types/baseball-lifting';
import type { BaseballLiftExerciseRow } from '@/lib/types/baseball-lifting-v11';

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
    redirect('/baseball/dashboard');
  }

  const supabase = await createClient();
  // The lifting tables ship via migration 20260624000061 and are not yet in the
  // generated database.ts (no live apply to regen against). Cast for these reads;
  // the hand-written types in @/lib/types/baseball-lifting are the contract and
  // RLS is the gate. Mirrors the established baseball command-center pattern.
  // TODO(types): remove cast after `supabase gen types` is re-run against a DB
  // with migrations 20260624000061/63 applied.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

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

  // Recent assignments for the team (RLS-scoped). Limited window for the board.
  const { data: assignmentRows } = await db
    .from('baseball_lift_assignments')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
    .limit(100);
  const assignments = (assignmentRows ?? []) as BaseballLiftAssignmentRow[];

  // Team + global exercise library — the V11 baseball_lift_exercises table, the
  // SINGLE source of truth for lifting (V11 depth rule). This is the same library
  // the program builder, the publish→session materialization, and the PR engine
  // read, so an exercise the coach adds here is immediately selectable in a V11
  // program and carries progression identity (PRs/maxes key on its id). The Lite
  // baseball_exercises table is no longer read by any wired surface.
  const { data: exerciseRows } = await db
    .from('baseball_lift_exercises')
    .select('*')
    .or(`team_id.eq.${teamId},is_global.eq.true`)
    .eq('is_active', true)
    .order('name', { ascending: true });
  const exercises = (exerciseRows ?? []) as BaseballLiftExerciseRow[];

  // Readiness: only fetched + shown when the staff member holds the health gate.
  let readiness: BaseballReadinessSummary[] = [];
  if (canViewReadiness) {
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    const fromDate = sevenDaysAgo.toISOString().slice(0, 10);

    const { data: checkinRows } = await db
      .from('baseball_readiness_checkins')
      .select('*')
      .eq('team_id', teamId)
      .gte('check_date', fromDate)
      .order('check_date', { ascending: false });

    const checkins = (checkinRows ?? []) as BaseballReadinessCheckinRow[];
    const latestByPlayer = new Map<string, BaseballReadinessCheckinRow>();
    for (const c of checkins) {
      if (!latestByPlayer.has(c.player_id)) latestByPlayer.set(c.player_id, c);
    }

    readiness = roster.map((p) => ({
      player_id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      avatar_url: p.avatar_url,
      primary_position: p.primary_position,
      latest_checkin: latestByPlayer.get(p.id) ?? null,
    }));
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

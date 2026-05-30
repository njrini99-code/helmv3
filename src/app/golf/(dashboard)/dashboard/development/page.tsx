import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { DevelopmentPlansClient } from './development-client';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import type { Metadata } from 'next';
import { getAlertCounts } from '@/app/golf/actions/alerts';
import { isRedesignEnabled, fairwayScope } from '@/lib/redesign/flag';
import { PlayersGridView, type PlayersGridStats } from '@/components/fairway';
import { resolveCoachTeamId } from '@/lib/golf/resolve-team';
import { loadActiveGoals } from '@/lib/coachhelm/v3/goals/loader';
import { getTeamCausalRelationships } from '@/app/golf/actions/causal-relationships';
import { loadPlayerStandingMap } from '@/lib/coachhelm/v3/standing/loader';
import type { FairwayGoalCardData } from '@/components/fairway/pages/coachhelm/FairwayGoalCard';

export const metadata: Metadata = {
  title: 'Development Plans | Helm Golf',
  description: 'Manage player development plans and focus areas for your team.',
};

export const revalidate = 60;

export default async function DevelopmentPlansPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { coach } = session;
  if (!coach) redirect('/golf/dashboard?message=Development+plans+is+a+coach-only+feature');

  const supabase = await createClient();

  // Get team_id from organization (deterministic: handles orgs with >1 team)
  const teamId = await resolveCoachTeamId(supabase, coach.organization_id, coach.id);

  if (!teamId) {
    redirect('/golf/dashboard');
  }

  // Get active team member player IDs (golf_players doesn't have team_id)
  const { data: teamMembers } = await supabase
    .from('golf_team_members')
    .select('player_id')
    .eq('team_id', teamId)
    .eq('status', 'active');

  const activePlayerIds = (teamMembers || []).map(tm => tm.player_id);

  // Fetch player profiles for active team members
  const { data: players } = activePlayerIds.length > 0
    ? await supabase
        .from('golf_players')
        .select('id, first_name, last_name, avatar_url, graduation_year, handicap, hometown, state')
        .in('id', activePlayerIds)
        .order('last_name')
    : { data: [] };

  const playerIds = (players || []).map(p => p.id);

  // Fetch all focus areas for team players
  const { data: focusAreas } = playerIds.length > 0
    ? await supabase
        .from('golf_player_focus_areas')
        .select(`
          id,
          player_id,
          coach_id,
          area_type,
          title,
          description,
          status,
          target_metric,
          current_value,
          target_value,
          started_at,
          completed_at,
          created_at,
          updated_at
        `)
        .in('player_id', playerIds)
        .order('created_at', { ascending: false })
    : { data: [] };

  // Fetch round stats per player for prepopulation
  const { data: allRounds } = playerIds.length > 0
    ? await supabase
        .from('golf_rounds')
        .select('player_id, total_score, total_putts, total_fairways_hit, total_fairways, total_gir, total_gir_possible, round_date')
        .in('player_id', playerIds)
        .eq('status', 'completed')
        .not('total_score', 'is', null)
        .order('round_date', { ascending: false })
    : { data: [] };

  // Build per-player stats summaries
  const playerStatsMap: Record<string, {
    rounds_played: number;
    avg_score: number | null;
    avg_putts: number | null;
    fairway_pct: number | null;
    gir_pct: number | null;
    best_score: number | null;
    recent_trend: 'improving' | 'declining' | 'stable' | null;
  }> = {};

  for (const pid of playerIds) {
    const rounds = (allRounds || []).filter(r => r.player_id === pid);
    const count = rounds.length;

    if (count === 0) {
      playerStatsMap[pid] = {
        rounds_played: 0,
        avg_score: null,
        avg_putts: null,
        fairway_pct: null,
        gir_pct: null,
        best_score: null,
        recent_trend: null,
      };
      continue;
    }

    const scores = rounds.map(r => r.total_score!);
    const avgScore = Math.round((scores.reduce((a, b) => a + b, 0) / count) * 10) / 10;
    const bestScore = Math.min(...scores);

    const putts = rounds.filter(r => r.total_putts != null).map(r => r.total_putts!);
    const avgPutts = putts.length > 0
      ? Math.round((putts.reduce((a, b) => a + b, 0) / putts.length) * 10) / 10
      : null;

    const fwRounds = rounds.filter(r => r.total_fairways_hit != null && r.total_fairways != null && r.total_fairways > 0);
    const fairwayPct = fwRounds.length > 0
      ? Math.round((fwRounds.reduce((s, r) => s + r.total_fairways_hit! / r.total_fairways!, 0) / fwRounds.length) * 1000) / 10
      : null;

    const girRounds = rounds.filter(r => r.total_gir != null && r.total_gir_possible != null && r.total_gir_possible > 0);
    const girPct = girRounds.length > 0
      ? Math.round((girRounds.reduce((s, r) => s + r.total_gir! / r.total_gir_possible!, 0) / girRounds.length) * 1000) / 10
      : null;

    // Trend: compare last 3 rounds avg to previous 3
    let trend: 'improving' | 'declining' | 'stable' | null = null;
    if (count >= 6) {
      const recent3 = scores.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
      const prev3 = scores.slice(3, 6).reduce((a, b) => a + b, 0) / 3;
      const diff = recent3 - prev3;
      if (diff < -1) trend = 'improving';
      else if (diff > 1) trend = 'declining';
      else trend = 'stable';
    }

    playerStatsMap[pid] = {
      rounds_played: count,
      avg_score: avgScore,
      avg_putts: avgPutts,
      fairway_pct: fairwayPct,
      gir_pct: girPct,
      best_score: bestScore,
      recent_trend: trend,
    };
  }

  // Combine focus areas with player info
  const focusAreasWithPlayers = (focusAreas || []).map(fa => ({
    ...fa,
    player: (players || []).find(p => p.id === fa.player_id) || null,
  }));

  // ── Thin flag fork (ADDITIVE) ──────────────────────────────────────────────
  // Flag ON → the warm "Players" grid surface (CoachHelmShell active='players').
  // PERF FIX (redesign branch ONLY): the per-player stat snapshot is read from
  // golf_player_stats_cache in a single query instead of re-aggregating every
  // completed round client-side (the legacy playerStatsMap loop). The shared
  // loader block above (org→team, members, players, focus-areas) is reused
  // unchanged. Flag OFF (default) → DevelopmentPlansClient renders as today.
  if (isRedesignEnabled()) {
    const { data: statsRows } = playerIds.length > 0
      ? await supabase
          .from('golf_player_stats_cache')
          .select(
            'player_id, rounds_played, scoring_average, putts_per_round, driving_accuracy_percentage, gir_percentage, best_round, trend_direction',
          )
          .in('player_id', playerIds)
      : { data: [] };

    const trendOf = (raw: string | null | undefined): PlayersGridStats['recent_trend'] => {
      if (raw === 'improving' || raw === 'declining' || raw === 'stable') return raw;
      return null;
    };

    const gridStats: Record<string, PlayersGridStats> = {};
    for (const row of statsRows || []) {
      gridStats[row.player_id] = {
        rounds_played: row.rounds_played ?? 0,
        avg_score: row.scoring_average ?? null,
        avg_putts: row.putts_per_round ?? null,
        fairway_pct: row.driving_accuracy_percentage ?? null,
        gir_pct: row.gir_percentage ?? null,
        best_score: row.best_round ?? null,
        recent_trend: trendOf(row.trend_direction),
      };
    }
    // Players without a cache row still render — honest empty stats, never fake 0s.
    for (const pid of playerIds) {
      if (!gridStats[pid]) {
        gridStats[pid] = {
          rounds_played: 0,
          avg_score: null,
          avg_putts: null,
          fairway_pct: null,
          gir_pct: null,
          best_score: null,
          recent_trend: null,
        };
      }
    }

    const countsRes = await getAlertCounts(coach.id);
    const signalCount = countsRes.success ? (countsRes.counts?.critical ?? null) : null;

    // ── v3 GOALS (read-only, redesign fork ONLY) ─────────────────────────────
    // Surface each player's assigned/shared ACTIVE goals on the coach surface:
    // a count in the roster table + full cards in the scoped per-player view.
    // RLS scopes coach visibility to assigned + shared goals; we just compose
    // each goal with its live standing snapshot (null when the cron hasn't
    // populated a row for the metric yet). Coaches do not create/accept here.
    const goalsByPlayer: Record<string, FairwayGoalCardData[]> = {};
    await Promise.all(playerIds.map(async (pid) => {
      const [g, sm] = await Promise.all([loadActiveGoals(pid), loadPlayerStandingMap(pid)]);
      goalsByPlayer[pid] = g.map(goal => ({ goal, standing: sm.get(goal.metric_id) ?? null }));
    }));

    // Owning-player display names for the coach goal-card provenance labels.
    const playerNameById: Record<string, string> = {};
    for (const p of players || []) {
      playerNameById[p.id] = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Player';
    }

    // Dedupe-aware causal "why their scores move" rows, keyed by player_id.
    const causalByPlayer = await getTeamCausalRelationships(teamId);

    return (
      <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans text-text-primary')}>
        <PlayersGridView
          players={players || []}
          focusAreas={focusAreasWithPlayers}
          coachId={coach.id}
          playerStats={gridStats}
          signalCount={signalCount}
          goalsByPlayer={goalsByPlayer}
          playerNameById={playerNameById}
          causalByPlayer={causalByPlayer}
        />
      </div>
    );
  }

  return (
    <AnimatedPage>
      <AnimatedItem>
        <DevelopmentPlansClient
          players={players || []}
          focusAreas={focusAreasWithPlayers}
          coachId={coach.id}
          playerStats={playerStatsMap}
        />
      </AnimatedItem>
    </AnimatedPage>
  );
}

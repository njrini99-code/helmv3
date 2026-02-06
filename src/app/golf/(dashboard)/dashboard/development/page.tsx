import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { DevelopmentPlansClient } from './development-client';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Development Plans | Helm Golf',
  description: 'Manage player development plans and focus areas for your team.',
};

export const revalidate = 60;

export default async function DevelopmentPlansPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/golf/login');
  }

  // Verify user is a coach
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .single();

  if (!coach) {
    redirect('/golf/dashboard');
  }

  // Get team_id from organization
  let teamId: string | null = null;
  if (coach.organization_id) {
    const { data: orgTeam } = await supabase
      .from('golf_teams')
      .select('id')
      .eq('organization_id', coach.organization_id)
      .maybeSingle();
    teamId = orgTeam?.id || null;
  }

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

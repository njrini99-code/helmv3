import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import type { GolfRound } from '@/lib/types/golf';
import type { Metadata } from 'next';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { fairwayScope } from '@/lib/redesign/flag';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { logServerException } from '@/lib/server-error-logger';
import { withCanonicalRoundTotal } from '@/lib/golf/round-total';
import {
  FairwayRoundsLibrary,
  type RoundLibraryRound as FairwayRoundLibraryRound,
} from '@/components/fairway/pages/rounds/FairwayRoundsLibrary';

export const metadata: Metadata = {
  title: 'Rounds | Helm Golf',
  description: 'View and manage all golf rounds for your team. Track scores, stats, and player performance over time.',
};

// Rounds are player-specific and should reflect new saves/completions immediately.
export const dynamic = 'force-dynamic';

interface RoundWithPlayer extends GolfRound {
  player: {
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  } | null;
}

export default async function RoundsPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { role: userRole, coach, player } = session;
  if (!userRole) redirect('/golf/login');

  const supabase = await createClient();

  // Fetch rounds based on role
  let rounds: RoundWithPlayer[] = [];
  let inProgressRounds: RoundWithPlayer[] = [];

  // Get team_id from organization if coach (deterministic: handles orgs with
  // >1 team)
  let teamId: string | null = null;
  if (coach?.organization_id) {
    try {
      teamId = await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id);
    } catch (error) {
      void logServerException(error, { action: 'rounds-teamid-load', route: '/golf/dashboard/rounds', source: 'server_component', sport: 'golf' }, 'warning');
      // Network failure — proceed with null teamId
    }
  }

  const playerSelectFields = `
    id,
    course_name,
    course_city,
    course_state,
    round_date,
    round_type,
    total_score,
    score_to_par,
    front_nine,
    back_nine,
    total_putts,
    total_fairways,
    total_fairways_hit,
    total_gir,
    total_gir_possible,
    status,
    holes_played,
    player:golf_players(first_name, last_name, avatar_url)
  `;

  const inProgressSelectFields = `
    id,
    course_name,
    course_city,
    course_state,
    round_date,
    round_type,
    total_score,
    score_to_par,
    current_hole,
    holes_played,
    updated_at,
    created_at,
    player:golf_players(first_name, last_name, avatar_url)
  `;

  if (userRole === 'coach' && teamId) {
    let teamMembers: { player_id: string }[] | null = null;
    try {
      const result = await supabase
        .from('golf_team_members')
        .select('player_id')
        .eq('team_id', teamId)
        .eq('status', 'active');
      teamMembers = result.data;
    } catch (error) {
      void logServerException(error, { action: 'rounds-teammembers-load', route: '/golf/dashboard/rounds', source: 'server_component', sport: 'golf' }, 'warning');
      // Network failure
    }

    const teamPlayerIds = teamMembers?.map(tm => tm.player_id) || [];

    if (teamPlayerIds.length > 0) {
      // P425: surface a real fetch failure (route error.tsx offers retry) instead
      // of silently leaving the list empty — an empty rounds list must mean "no
      // rounds", never "the query failed".
      const { data: completedData, error } = await fetchAllRowsResult((from, to) =>
        supabase
          .from('golf_rounds')
          .select(playerSelectFields)
          .in('player_id', teamPlayerIds)
          .eq('status', 'completed')
          .order('round_date', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to)
      );
      if (error) throw new Error(`Failed to load team rounds: ${error.message}`);

      // Finding #1/#4/#5 (AUDIT-0724): correct total_score/score_to_par ONCE
      // here — front_nine+back_nine over the sometimes-stale total_score column
      // (see src/lib/golf/round-total.ts) — so the rounds library list AND the
      // roundStats aggregate below (avg/best/avgToPar) both read the same
      // canonical value, matching the round detail page and the Stats page.
      rounds = (completedData ?? []).map(r => ({
        ...withCanonicalRoundTotal(r),
        player: r.player && !('error' in r.player) ? r.player : null
      })) as RoundWithPlayer[];
    }
  } else if (userRole === 'player' && player) {
    let inProgressData: typeof inProgressRounds = [];
    // P425: surface real failures (route error.tsx offers retry) — never mask a
    // fetch error as an empty rounds list.
    const [completedResult, inProgressResult] = await Promise.all([
      fetchAllRowsResult((from, to) =>
        supabase
          .from('golf_rounds')
          .select(playerSelectFields)
          .eq('player_id', player.id)
          .eq('status', 'completed')
          .order('round_date', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to)
      ),
      supabase
        .from('golf_rounds')
        .select(inProgressSelectFields)
        .eq('player_id', player.id)
        .eq('status', 'in_progress')
        .order('updated_at', { ascending: false })
    ]);
    if (completedResult.error) throw new Error(`Failed to load rounds: ${completedResult.error.message}`);
    if (inProgressResult.error) throw new Error(`Failed to load in-progress rounds: ${inProgressResult.error.message}`);

    // Finding #1/#4/#5 (AUDIT-0724): same correction as the coach branch above.
    rounds = (completedResult.data ?? []).map(r => ({
      ...withCanonicalRoundTotal(r),
      player: r.player && !('error' in r.player) ? r.player : null
    })) as RoundWithPlayer[];

    inProgressData = (inProgressResult.data ?? []) as typeof inProgressRounds;

    // Show ALL in-progress rounds (including setup-only drafts without shots)
    inProgressRounds = (inProgressData ?? []).map(r => ({
      ...r,
      player: r.player && !('error' in r.player) ? r.player : null
    })) as RoundWithPlayer[];
  }

  // Calculate round statistics summary — normalize 9-hole rounds to 18-hole equivalents
  const roundStats = (() => {
    if (rounds.length === 0) return null;
    type RoundWithHoles = typeof rounds[number] & { holes_played?: number | null };
    const scoredRounds = (rounds as RoundWithHoles[]).filter(r => r.total_score !== null && r.total_score > 0);
    const toParScores = rounds.map(r => r.score_to_par).filter((s): s is number => s !== null);
    if (scoredRounds.length === 0) return null;

    // Normalize scoring to 18-hole equivalent
    let totalStrokes = 0;
    let totalHoles = 0;
    const normalizedScores: number[] = [];
    for (const r of scoredRounds) {
      const hp = r.holes_played ?? 18;
      if (hp <= 0) continue;
      totalStrokes += r.total_score!;
      totalHoles += hp;
      normalizedScores.push(Math.round(r.total_score! * (18 / hp)));
    }
    const avg = totalHoles > 0 ? (totalStrokes / totalHoles) * 18 : 0;
    const best = Math.min(...normalizedScores);
    const avgToPar = toParScores.length > 0 ? toParScores.reduce((a, b) => a + b, 0) / toParScores.length : null;
    const underParCount = toParScores.filter(s => s < 0).length;
    const underParPct = toParScores.length > 0 ? Math.round((underParCount / toParScores.length) * 100) : 0;

    // Trend: compare last 5 vs previous 5 using normalized scores
    let trend: 'improving' | 'declining' | 'stable' | null = null;
    if (normalizedScores.length >= 6) {
      const recent5 = normalizedScores.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
      const prev5 = normalizedScores.slice(5, 10).reduce((a, b) => a + b, 0) / Math.min(5, normalizedScores.length - 5);
      if (recent5 < prev5 - 0.5) trend = 'improving';
      else if (recent5 > prev5 + 0.5) trend = 'declining';
      else trend = 'stable';
    }

    return { avg, best, avgToPar, underParPct, totalRounds: scoredRounds.length, trend };
  })();

  // Reuses the SAME server queries + roundStats computed above verbatim —
  // this is a re-skin only. Renders in its own `.fairway-ds` scope on
  // bg-canvas.
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <FairwayRoundsLibrary
        rounds={rounds as unknown as FairwayRoundLibraryRound[]}
        inProgressRounds={inProgressRounds as unknown as FairwayRoundLibraryRound[]}
        userRole={userRole as 'coach' | 'player'}
        stats={roundStats}
      />
    </div>
  );
}

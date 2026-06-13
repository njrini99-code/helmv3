import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { LargeTitleHeader } from '@/components/golf/layout/LargeTitleHeader';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { IconPlus, IconGolf } from '@/components/icons';
import type { GolfRound } from '@/lib/types/golf';
import type { Metadata } from 'next';
import { UnfinishedRoundsSection } from './unfinished-rounds-section';
import { RoundLibraryClient, type RoundLibraryRound } from '@/components/golf/rounds/RoundLibraryClient';
import { Button } from '@/components/ui/button';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { isRedesignEnabled, fairwayScope } from '@/lib/redesign/flag';
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
    } catch {
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
        .eq('team_id', teamId);
      teamMembers = result.data;
    } catch {
      // Network failure
    }

    const teamPlayerIds = teamMembers?.map(tm => tm.player_id) || [];

    if (teamPlayerIds.length > 0) {
      try {
        const { data: completedData } = await supabase
          .from('golf_rounds')
          .select(playerSelectFields)
          .in('player_id', teamPlayerIds)
          .eq('status', 'completed')
          .order('round_date', { ascending: false })
          .limit(50);

        rounds = (completedData ?? []).map(r => ({
          ...r,
          player: r.player && !('error' in r.player) ? r.player : null
        })) as RoundWithPlayer[];
      } catch {
        // Network failure — rounds stays empty
      }
    }
  } else if (userRole === 'player' && player) {
    let inProgressData: typeof inProgressRounds = [];
    try {
      const [completedResult, inProgressResult] = await Promise.all([
        supabase
          .from('golf_rounds')
          .select(playerSelectFields)
          .eq('player_id', player.id)
          .eq('status', 'completed')
          .order('round_date', { ascending: false })
          .limit(50),
        supabase
          .from('golf_rounds')
          .select(inProgressSelectFields)
          .eq('player_id', player.id)
          .eq('status', 'in_progress')
          .order('updated_at', { ascending: false })
      ]);

      rounds = (completedResult.data ?? []).map(r => ({
        ...r,
        player: r.player && !('error' in r.player) ? r.player : null
      })) as RoundWithPlayer[];

      inProgressData = (inProgressResult.data ?? []) as typeof inProgressRounds;
    } catch {
      // Network failure — both stay empty
    }

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

  const hasUnfinished = inProgressRounds.length > 0 && userRole === 'player';

  // Flag-on: the redesigned Fairway rounds library. Reuses the SAME server
  // queries + roundStats computed above verbatim — this is a re-skin only.
  // Renders in its own `.fairway-ds` scope on bg-canvas. Flag-off is unchanged.
  if (isRedesignEnabled()) {
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

  return (
    <AnimatedPage className="min-h-full">
      {/* Header Section */}
      <AnimatedItem>
        <LargeTitleHeader
          title="Rounds"
          subtitle={`${rounds.length} round${rounds.length !== 1 ? 's' : ''} recorded`}
        >
          {userRole === 'player' && (
            <Link href="/golf/dashboard/rounds/new">
              <Button variant="primary" className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white font-medium text-sm rounded-xl hover:bg-primary-700 shadow-sm hover:shadow-md transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50">
                <IconPlus size={16} />
                New Round
              </Button>
            </Link>
          )}
        </LargeTitleHeader>
      </AnimatedItem>

      {/* Unfinished rounds — banner-style, sits above the library */}
      {hasUnfinished && (
        <AnimatedItem>
          <div className="max-w-[1280px] mx-auto px-4 md:px-6 pt-4">
            <UnfinishedRoundsSection rounds={inProgressRounds} />
          </div>
        </AnimatedItem>
      )}

      {/* Empty state — when neither completed nor in-progress rounds exist */}
      {rounds.length === 0 && inProgressRounds.length === 0 ? (
        <AnimatedItem>
          <div className="max-w-[1280px] mx-auto px-4 md:px-6 py-12">
            <div className="surface-stone rounded-3xl p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary-50/65 flex items-center justify-center mx-auto mb-6">
                <IconGolf size={26} className="text-primary-700" />
              </div>
              <h3 className="text-h2 md:text-h1 font-light tracking-[-0.025em] text-warm-900 mb-2.5">
                No rounds yet
              </h3>
              <p className="text-warm-500 mb-8 max-w-sm mx-auto leading-relaxed">
                {userRole === 'coach'
                  ? "Your players haven't submitted any rounds yet. Rounds will appear here as they're recorded."
                  : 'Start tracking your golf rounds to see stats and improvement over time.'}
              </p>
              {userRole === 'player' && (
                <Link href="/golf/dashboard/rounds/new">
                  <Button variant="primary" className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 text-white font-medium text-sm rounded-xl hover:bg-primary-700 shadow-sm hover:shadow-md transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50">
                    <IconPlus size={16} />
                    Submit First Round
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </AnimatedItem>
      ) : (
        <RoundLibraryClient
          rounds={rounds as unknown as RoundLibraryRound[]}
          userRole={userRole as 'coach' | 'player'}
          stats={roundStats}
        />
      )}
    </AnimatedPage>
  );
}

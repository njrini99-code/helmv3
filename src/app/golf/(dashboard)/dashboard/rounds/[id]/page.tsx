import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { Metadata } from 'next';
import { Button } from '@/components/ui/button';
import { IconArrowLeft, IconChartBar } from '@/components/icons';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import { RoundReviewViewer } from '@/components/golf/coachhelm/RoundReviewViewer';
import { ShotByShot } from '@/components/golf/rounds';
import { PremiumRoundHeader } from '@/components/golf/rounds/PremiumRoundHeader';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();

  const { data: round } = await supabase
    .from('golf_rounds')
    .select('course_name, round_date, total_score, score_to_par')
    .eq('id', id)
    .single();

  if (!round) {
    return {
      title: 'Round Details | Helm Sports',
      description: 'View golf round details and scorecard',
    };
  }

  const scoreToPar = round.score_to_par || 0;
  const scoreDisplay = scoreToPar === 0 ? 'E' : scoreToPar > 0 ? `+${scoreToPar}` : scoreToPar;

  return {
    title: `${round.course_name} - ${round.total_score || '--'} (${scoreDisplay}) | Helm Sports`,
    description: `Round details from ${round.course_name} on ${new Date(round.round_date).toLocaleDateString()} - Score: ${round.total_score || '--'} (${scoreDisplay})`,
  };
}

// Matches the actual golf_rounds schema
interface RoundWithDetails {
  id: string;
  player_id: string;
  course_name: string | null;
  course_city: string | null;
  course_state: string | null;
  course_rating: number | null;
  course_slope: number | null;
  tees_played: string | null;
  round_type: string | null;
  round_date: string;
  total_score: number | null;
  score_to_par: number | null;
  total_putts: number | null;
  total_fairways: number | null;
  total_fairways_hit: number | null;
  total_gir: number | null;
  total_gir_possible: number | null;
  notes: string | null;
  front_nine: number | null;
  back_nine: number | null;
  player: {
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  } | null;
}


export default async function RoundDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/golf/login');
  }

  // Fetch round with player avatar
  const { data: round, error } = await supabase
    .from('golf_rounds')
    .select(`
      *,
      player:golf_players(first_name, last_name, avatar_url)
    `)
    .eq('id', id)
    .single();

  if (error || !round) {
    notFound();
  }

  const roundData = {
    ...round,
    player: Array.isArray(round.player) ? round.player[0] : round.player,
  } as unknown as RoundWithDetails;

  // Check authorization
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .single();

  const { data: player } = await supabase
    .from('golf_players')
    .select('id')
    .eq('user_id', user.id)
    .single();

  // Check if coach has access by verifying round's player is on their team
  let isCoach = false;
  if (coach?.organization_id && roundData.player_id) {
    const { data: orgTeam } = await supabase
      .from('golf_teams')
      .select('id')
      .eq('organization_id', coach.organization_id)
      .maybeSingle();

    if (orgTeam?.id) {
      const { data: teamMembership } = await supabase
        .from('golf_team_members')
        .select('id')
        .eq('team_id', orgTeam.id)
        .eq('player_id', roundData.player_id)
        .maybeSingle();
      isCoach = !!teamMembership;
    }
  }
  const isOwnRound = player && roundData.player_id === player.id;

  if (!isCoach && !isOwnRound) {
    redirect('/golf/dashboard');
  }

  const playerName = roundData.player
    ? `${roundData.player.first_name || ''} ${roundData.player.last_name || ''}`.trim()
    : 'Unknown Player';

  const playerAvatarUrl = roundData.player?.avatar_url || null;

  return (
    <AnimatedPage className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Navigation */}
      <AnimatedItem>
      <div className="flex items-center justify-between mb-6">
        <Link href="/golf/dashboard/rounds">
          <Button variant="secondary" size="sm">
            <IconArrowLeft size={16} className="mr-2" />
            Back
          </Button>
        </Link>
        <Link href="/golf/dashboard/stats">
          <Button variant="secondary" size="sm">
            <IconChartBar size={16} className="mr-2" />
            View All Stats
          </Button>
        </Link>
      </div>
      </AnimatedItem>

      {/* Premium Header - player info, score, stats */}
      <AnimatedItem>
      <PremiumRoundHeader
        playerName={playerName}
        playerAvatarUrl={playerAvatarUrl}
        courseName={roundData.course_name}
        courseCity={roundData.course_city}
        courseState={roundData.course_state}
        roundDate={roundData.round_date}
        roundType={roundData.round_type}
        totalScore={roundData.total_score}
        scoreToPar={roundData.score_to_par}
        totalPutts={roundData.total_putts}
        totalFairwaysHit={roundData.total_fairways_hit}
        totalFairways={roundData.total_fairways}
        totalGir={roundData.total_gir}
        totalGirPossible={roundData.total_gir_possible}
        frontNine={roundData.front_nine}
        backNine={roundData.back_nine}
        courseRating={roundData.course_rating}
        courseSlope={roundData.course_slope}
        teesPlayed={roundData.tees_played}
        notes={roundData.notes}
      />
      </AnimatedItem>

      {/* AI Round Review */}
      <AnimatedItem>
      <RoundReviewViewer roundId={id} isCoach={isCoach} className="mt-6" />
      </AnimatedItem>

      {/* Shot-by-Shot Review */}
      <AnimatedItem>
      <ShotByShot roundId={id} className="mt-6" />
      </AnimatedItem>
    </AnimatedPage>
  );
}

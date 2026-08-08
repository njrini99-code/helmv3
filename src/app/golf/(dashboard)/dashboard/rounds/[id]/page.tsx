import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect, notFound } from 'next/navigation';
import { Metadata } from 'next';
import { generateRoundRecap } from '@/app/golf/actions/round-recap';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { fairwayScope } from '@/lib/redesign/flag';
import { FairwayRoundDetail } from '@/components/fairway/pages/rounds/FairwayRoundDetail';

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
    .maybeSingle();

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
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { coach, player } = session;
  const supabase = await createClient();

  // Fetch round with player avatar
  const { data: round, error } = await supabase
    .from('golf_rounds')
    .select(`
      *,
      player:golf_players(first_name, last_name, avatar_url)
    `)
    .eq('id', id)
    .maybeSingle();

  // `error || !round` collapsed two different answers into a 404. A round that
  // does not exist is genuinely not found; a round we failed to READ is not.
  if (error) {
    await logServerError(
      `[round detail] round read failed — would have 404'd a round that exists: ${describeError(error)}`,
      { action: 'roundDetail.round', featureArea: 'round_tracking', roundId: id },
    );
    throw new Error("Couldn't load this round. Please try again.");
  }

  if (!round) {
    notFound();
  }

  // Redirect to continue page if round is still in progress
  if (round.status === 'in_progress') {
    redirect(`/golf/dashboard/rounds/continue/${id}`);
  }

  const roundData = {
    ...round,
    player: Array.isArray(round.player) ? round.player[0] : round.player,
  } as unknown as RoundWithDetails;

  // Check if coach has access by verifying round's player is on their team
  let isCoach = false;
  if (coach?.organization_id && roundData.player_id) {
    const teamId = await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id);

    if (teamId) {
      const { data: teamMembership, error: membershipError } = await supabase
        .from('golf_team_members')
        .select('id')
        .eq('team_id', teamId)
        .eq('player_id', roundData.player_id)
        .maybeSingle();

      // This read is an ACCESS decision, so failing closed is correct and is
      // kept — a failed check must never grant access. What was wrong is that
      // it failed closed SILENTLY: `isCoach` stayed false and the coach was
      // redirected to the dashboard with no explanation, for their own
      // player's round. Deny, but say we could not check, and record it.
      if (membershipError) {
        await logServerError(
          `[round detail] coach access check failed — denying access, but this is an outage and not a permission problem: ${describeError(membershipError)}`,
          { action: 'roundDetail.coachAccessCheck', featureArea: 'round_tracking', roundId: id },
        );
        throw new Error("Couldn't verify your access to this round. Please try again.");
      }

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

  // Generate (or fetch cached) AI round recap. Server action persists the
  // result on first call so subsequent visits are instant. Failure here
  // never blocks the page render — recap stays null.
  let aiRecap: string | null = null;
  try {
    const result = await generateRoundRecap(id);
    aiRecap = result.recap;
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[round-detail] recap generation failed:', err);
    }
  }

  // Re-skin the SAME resolved data: the round + aiRecap above, plus a
  // read-only fetch of the honest golf_holes layer and the persisted
  // golf_round_reviews.round_stats. No writes.
  const { data: holesRows } = await supabase
    .from('golf_holes')
    .select('hole_number, par, score, putts, fairway_hit, gir, penalty_strokes, yardage')
    .eq('round_id', id)
    .order('hole_number', { ascending: true });

  const { data: reviewRow } = await supabase
    .from('golf_round_reviews')
    .select('round_stats')
    .eq('round_id', id)
    .maybeSingle();

  const reviewStats = (reviewRow?.round_stats ?? null) as
    | {
        areasForImprovement?: Array<{ area: string; recommendation: string }> | null;
        recommendations?: string[] | null;
        momentumData?: Array<{ hole: number; rollingScoreToPar: number }> | null;
      }
    | null;

  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <FairwayRoundDetail
        round={{
          id: roundData.id,
          course_name: roundData.course_name,
          round_date: roundData.round_date,
          round_type: roundData.round_type,
          total_score: roundData.total_score,
          score_to_par: roundData.score_to_par,
          total_putts: roundData.total_putts,
          total_fairways: roundData.total_fairways,
          total_fairways_hit: roundData.total_fairways_hit,
          total_gir: roundData.total_gir,
          total_gir_possible: roundData.total_gir_possible,
          front_nine: roundData.front_nine,
          back_nine: roundData.back_nine,
          holes_played: (roundData as { holes_played?: number | null }).holes_played ?? null,
        }}
        holes={holesRows ?? []}
        aiRecap={aiRecap}
        reviewStats={reviewStats}
        playerName={playerName}
        isCoach={isCoach}
        viewerIsOwner={!!isOwnRound}
      />
    </div>
  );
}

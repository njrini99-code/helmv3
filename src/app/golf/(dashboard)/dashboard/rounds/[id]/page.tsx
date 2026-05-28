import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { Metadata } from 'next';
import { Button } from '@/components/ui/button';
import { IconChartBar } from '@/components/icons';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import { MobileNavHeader } from '@/components/golf/layout/MobileNavHeader';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { RoundReviewViewer } from '@/components/golf/coachhelm/RoundReviewViewer';
import { PremiumRoundHeader } from '@/components/golf/rounds/PremiumRoundHeader';
import { Reveal } from '@/components/ui/reveal';
import { PageHeader, Eyebrow } from '@/components/ui/page-header';
import { generateRoundRecap } from '@/app/golf/actions/round-recap';

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

  if (error || !round) {
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

  // Editorial header copy — magazine-cover framing for the post-round
  // recap. Title = "{Day} at {Course}." Subtitle = round-type / holes /
  // score line, mirroring how a beat reporter would lead a recap.
  const roundDate = new Date(roundData.round_date);
  const dayOfWeek = roundDate.toLocaleDateString('en-US', { weekday: 'long' });
  const courseShort = roundData.course_name?.replace(/\s+(Golf\s+(Course|Club)|Country\s+Club|GC|CC)$/i, '') ?? 'Round';
  const heroTitle = `${dayOfWeek} at ${courseShort}.`;

  const stp = roundData.score_to_par ?? 0;
  const scoreChip = stp === 0 ? 'E' : stp > 0 ? `+${stp}` : `${stp}`;
  const holesPlayed = (roundData as { holes_played?: number | null }).holes_played ?? 18;
  const roundTypeLabel = (() => {
    switch (roundData.round_type) {
      case 'tournament':
        return 'Tournament';
      case 'qualifier':
      case 'qualifying':
        return 'Qualifier';
      case 'practice':
        return 'Practice round';
      case 'casual':
        return 'Casual round';
      default:
        return 'Round';
    }
  })();
  const heroSubtitle = roundData.total_score
    ? `${roundTypeLabel} · ${holesPlayed} holes · ${roundData.total_score} (${scoreChip})`
    : `${roundTypeLabel} · ${holesPlayed} holes`;

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

  return (
    <AnimatedPage className="max-w-[1280px] mx-auto">
      {/* Navigation */}
      <AnimatedItem>
        <MobileNavHeader
          title={roundData.course_name || 'Round'}
          subtitle={playerName}
          backHref="/golf/dashboard/rounds"
          backLabel="Rounds"
          breadcrumb={
            <Breadcrumb
              items={[
                { label: 'Dashboard', href: '/golf/dashboard' },
                { label: 'Rounds', href: '/golf/dashboard/rounds' },
                { label: roundData.course_name || 'Round' },
              ]}
            />
          }
        >
          <Link href="/golf/dashboard/stats">
            <Button variant="secondary" size="sm">
              <IconChartBar size={16} className="mr-2" />
              <span className="hidden sm:inline">View All Stats</span>
              <span className="sm:hidden">Stats</span>
            </Button>
          </Link>
        </MobileNavHeader>
      </AnimatedItem>
      <div className="p-4 md:p-6">

      {/* Editorial recap plinth — magazine-cover framing on a sculpted
          surface-stone matte block. The amber Eyebrow keeps the post-
          round "retrospective" tone; the dynamic title/subtitle leads
          like a beat-reporter recap. */}
      <Reveal>
        <div className="surface-stone rounded-3xl p-6 md:p-10 mb-6">
          <PageHeader
            eyebrow="Round Review"
            eyebrowAccent="amber"
            title={heroTitle}
            subtitle={heroSubtitle}
          />
          {/* AI-generated recap — two editorial sentences from a beat-
              reporter prompt. Renders inside the plinth as a quote-style
              callout so it reads as a magazine pull-quote, not body copy. */}
          {aiRecap && (
            <blockquote className="mt-7 border-l-2 border-helm-amber-300 pl-5 max-w-[60ch]">
              <p className="font-serif italic text-h3 leading-[1.55] tracking-[-0.005em] text-warm-800">
                {aiRecap}
              </p>
            </blockquote>
          )}
        </div>
      </Reveal>

      {/* Premium scoreboard — player info, score, stats. */}
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

      {/* AI Round Review — editorial sub-header anchors the engine layer
          beneath the scoreboard. Hairline rule + small primary-accented
          eyebrow reads like the next page of a magazine spread. */}
      <AnimatedItem>
      <Reveal staggerIndex={1} className="mt-10">
        <div className="flex items-center gap-3 mb-4">
          <Eyebrow accent="primary">CoachHelm Review</Eyebrow>
          <div className="h-px flex-1 bg-warm-200/55" />
        </div>
        <RoundReviewViewer roundId={id} isCoach={isCoach} />
      </Reveal>
      </AnimatedItem>

      </div>
    </AnimatedPage>
  );
}

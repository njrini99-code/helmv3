// =============================================================================
// src/app/baseball/(dashboard)/dashboard/postgame/page.tsx
//
// Postgame Action Review surface (V10 §"Postgame Action Review").
//
// Server component: resolves the active team via the session profile (same gate
// as the Command Center), authorizes through the RLS-scoped read model, and
// hands the client a fully-shaped, source-cited review. Empty / no-game states
// are handled here so the client never renders a blank page.
//
// Staff-only by surface: only college/JUCO staff reach this route. Reading the
// review additionally requires the can_manage_stats capability — enforced in
// THREE layers (defense in depth): (1) middleware STAFF_CAPABILITY_ROUTES blocks
// the route before it renders, (2) getPostgameReview() returns authorized:false
// when the staffer lacks can_manage_stats, and (3) RLS is the per-row backstop
// (players never see staff_only items). A college/JUCO staffer without
// can_manage_stats (academic viewer, director of ops, scoped assistant) cannot
// read the source-cited review by navigating to the URL directly.
// =============================================================================

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { getSessionProfile } from '@/lib/auth/session';
import { getPostgameReview } from '@/lib/baseball/read-models/postgame';
import { PostgameReviewClient } from '@/components/baseball/postgame/PostgameReviewClient';
import { fairwayScope } from '@/lib/redesign/flag';

interface PostgamePageProps {
  searchParams: Promise<{ game?: string }>;
}

export default async function PostgameReviewPage({ searchParams }: PostgamePageProps) {
  const supabase = await createClient();

  const session = await getSessionProfile();
  if (!session) redirect('/baseball/login');
  const coach = session.coach;
  if (!coach) redirect('/baseball/dashboard/command-center');

  // Postgame review is a staff product for college/JUCO programs.
  if (coach.coach_type !== 'college' && coach.coach_type !== 'juco') {
    redirect('/baseball/dashboard/command-center');
  }
  if (!coach.organization_id) {
    redirect('/baseball/dashboard/program');
  }

  const { data: team } = (await supabase
    .from('baseball_teams')
    .select('id, name')
    .eq('organization_id', coach.organization_id)
    .single()) as { data: { id: string; name: string } | null };

  if (!team) {
    return (
      <div className={fairwayScope('min-h-full')}>
        <PostgameReviewClient
          teamName="Your Program"
          review={null}
          recentGames={[]}
          authorized={false}
          unauthorizedReason="setup"
          error={null}
          selectedGameId={null}
        />
      </div>
    );
  }

  const params = await searchParams;
  const gameId = params.game ?? null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- new tables not in generated types
  const result = await getPostgameReview(supabase as any, team.id, gameId);

  return (
    <div className={fairwayScope('min-h-full')}>
      <PostgameReviewClient
        teamName={team.name}
        review={result.review}
        recentGames={result.recentGames}
        authorized={result.authorized}
        // The team exists here, so an unauthorized result is a capability denial
        // (the staffer lacks can_manage_stats), NOT a missing-program setup state.
        unauthorizedReason="forbidden"
        error={result.error ?? null}
        selectedGameId={gameId}
      />
    </div>
  );
}

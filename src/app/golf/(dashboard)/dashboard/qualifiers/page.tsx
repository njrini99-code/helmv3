import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import type { GolfQualifier } from '@/lib/types/golf';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { Metadata } from 'next';
import { fairwayScope } from '@/lib/redesign/flag';
import { FairwayQualifiers } from '@/components/fairway/pages/qualifiers/FairwayQualifiers';

export const metadata: Metadata = {
  title: 'Qualifiers | Helm Sports',
  description: 'Track and manage team qualifiers for player selection and performance evaluation',
};

// Cache qualifiers for 5 minutes (qualifiers don't change frequently)
export const revalidate = 300;

export default async function GolfQualifiersPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { role, coach, player } = session;
  const isCoach = role === 'coach';
  const supabase = await createClient();

  let teamId: string | null = null;
  let qualifiers: GolfQualifier[] = [];

  if (isCoach && coach?.organization_id) {
    teamId = await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id);
  } else if (player?.id) {
    const { data: teamMember } = await supabase
      .from('golf_team_members')
      .select('team_id')
      .eq('player_id', player.id)
      .maybeSingle();
    teamId = teamMember?.team_id || null;
  }

  if (teamId) {
    const { data: qualifiersData } = await supabase
      .from('golf_qualifiers')
      .select('*')
      .eq('team_id', teamId)
      .order('start_date', { ascending: false })
      // P328: bound the fetch to the PostgREST hard server cap. A team's
      // qualifier history grows unbounded across seasons; an explicit limit
      // makes the ceiling intentional (newest-1000 by start_date) instead of
      // silently truncated, and the Fairway list paginates the concluded
      // bucket client-side so the page stays scannable.
      .limit(1000);

    qualifiers = qualifiersData || [];
  }

  // Reuses the SAME role + golf_qualifiers list resolved above; re-skins onto
  // the warm-matte Fairway system.
  return (
    <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans text-text-primary')}>
      <FairwayQualifiers isCoach={isCoach} qualifiers={qualifiers} />
    </div>
  );
}

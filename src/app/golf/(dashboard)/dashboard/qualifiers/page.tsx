import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
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
    // The `error` is READ. Discarded, a failed membership read left teamId null,
    // which skips the qualifier fetch below entirely — so a rostered player was
    // shown "no qualifiers" because we could not tell what team they are on.
    // `.maybeSingle()` reports a genuine no-row as { data: null, error: null },
    // so a player truly on no team still falls through to the same empty page.
    const { data: teamMember, error: teamMemberError } = await supabase
      .from('golf_team_members')
      .select('team_id')
      .eq('player_id', player.id)
      .maybeSingle();

    if (teamMemberError) {
      await logServerError(
        `[qualifiers page] team membership read failed for player ${player.id}; the page would claim there are no qualifiers: ${describeError(teamMemberError)}`,
        { action: 'golf.qualifiersPage.resolveTeam', featureArea: 'qualifiers' },
      );
      throw new Error('Failed to load qualifiers');
    }

    teamId = teamMember?.team_id || null;
  }

  if (teamId) {
    const { data: qualifiersData, error: qualifiersError } = await supabase
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

    // The `error` is READ. Discarded, a failed read produced the same `[]` an
    // empty history produces, and the page told a team with a qualifier running
    // that it has none — on the one screen a player checks to find out whether
    // they are in it. A genuinely empty list still renders the empty state.
    if (qualifiersError) {
      await logServerError(
        `[qualifiers page] qualifier list read failed for team ${teamId}; the page would claim there are none: ${describeError(qualifiersError)}`,
        { action: 'golf.qualifiersPage.listQualifiers', featureArea: 'qualifiers' },
      );
      throw new Error('Failed to load qualifiers');
    }

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

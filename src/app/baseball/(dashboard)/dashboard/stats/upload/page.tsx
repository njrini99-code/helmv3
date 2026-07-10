'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { StatsUploadClient, UploadHistory } from '@/components/baseball/stats';
import { EditorsLetter } from '@/components/baseball/living-annual';
import { resolveCoachTeamIdWithCookie } from '@/lib/baseball/resolve-team-server';

export default async function StatsUploadPage() {
  const supabase = await createClient();

  // Get authenticated user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    redirect('/baseball/login');
  }

  // Get coach profile
  const { data: coach, error: coachError } = await supabase
    .from('baseball_coaches')
    .select('id, coach_type, organization_id, full_name')
    .eq('user_id', user.id)
    .single();

  if (coachError || !coach) {
    redirect('/baseball/dashboard/command-center');
  }

  // Only college and JUCO coaches have access
  if (coach.coach_type !== 'college' && coach.coach_type !== 'juco') {
    redirect('/baseball/dashboard/command-center');
  }

  if (!coach.organization_id) {
    redirect('/baseball/dashboard/program');
  }

  // Get team for this organization (cookie-aware, multi-row-safe — matches
  // Command Center).
  type TeamInfo = { id: string; name: string; team_type: string };
  const teamId = await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id);
  const { data: team, error: teamError } = teamId
    ? ((await supabase
        .from('baseball_teams')
        .select('id, name, team_type')
        .eq('id', teamId)
        .maybeSingle()) as { data: TeamInfo | null; error: unknown })
    : { data: null, error: null };

  if (teamError || !team) {
    // LA ghost/EditorsLetter state (spec doctrine: no amber warning boxes
    // anywhere) — this replaces the bespoke glass + amber-icon empty tile.
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <EditorsLetter
          ink="team"
          title="No team found."
          body="You need to set up your team before you can upload stats. Create your team first, then come back here."
          action={
            <a
              href="/baseball/dashboard/command-center"
              className="inline-flex items-center rounded-fw-md bg-grade-plus px-6 py-3 font-annual text-sm font-medium text-white hover:opacity-90"
            >
              Go to Command Center
            </a>
          }
        />
      </div>
    );
  }

  // Get team members for preview
  const { data: teamMembers } = await supabase
    .from('baseball_team_members')
    .select(`
      player_id,
      baseball_players!inner (
        id,
        first_name,
        last_name
      )
    `)
    .eq('team_id', team.id);

  const players = (teamMembers || []).map(tm => ({
    id: (tm.baseball_players as { id: string }).id,
    firstName: (tm.baseball_players as { first_name: string | null }).first_name || '',
    lastName: (tm.baseball_players as { last_name: string | null }).last_name || '',
  }));

  return (
    <div className="space-y-8">
      <StatsUploadClient
        teamId={team.id}
        teamName={team.name}
        players={players}
      />
      <div className="max-w-[720px] mx-auto px-4 sm:px-6">
        <UploadHistory teamId={team.id} />
      </div>
    </div>
  );
}

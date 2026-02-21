'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { StatsUploadClient, UploadHistory } from '@/components/baseball/stats';

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
    redirect('/baseball/coach');
  }

  // Only college and JUCO coaches have access
  if (coach.coach_type !== 'college' && coach.coach_type !== 'juco') {
    redirect('/baseball/dashboard');
  }

  if (!coach.organization_id) {
    redirect('/baseball/dashboard/program');
  }

  // Get team for this organization
  type TeamInfo = { id: string; name: string; team_type: string };
  const { data: team, error: teamError } = await supabase
    .from('baseball_teams')
    .select('id, name, team_type')
    .eq('organization_id', coach.organization_id)
    .single() as { data: TeamInfo | null; error: unknown };

  if (teamError || !team) {
    redirect('/baseball/dashboard/team');
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
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <UploadHistory teamId={team.id} />
      </div>
    </div>
  );
}

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
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 text-center">
        <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-10 shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-warm-900 mb-2">No Team Found</h2>
          <p className="text-warm-500 mb-8 max-w-sm mx-auto">
            You need to set up your team before you can upload stats. Create your team first, then come back here.
          </p>
          <a
            href="/baseball/dashboard/command-center"
            className="inline-flex items-center px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors"
          >
            Go to Command Center
          </a>
        </div>
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
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <UploadHistory teamId={team.id} />
      </div>
    </div>
  );
}

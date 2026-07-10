import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { NewGameClient } from './NewGameClient';
import { resolveCoachTeamIdWithCookie } from '@/lib/baseball/resolve-team-server';

export default async function CreateGamePage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/baseball/login');

  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('id, coach_type, organization_id')
    .eq('user_id', user.id)
    .single();

  if (!coach) redirect('/baseball/dashboard/command-center');
  if (coach.coach_type !== 'college' && coach.coach_type !== 'juco') {
    redirect('/baseball/dashboard/command-center');
  }
  if (!coach.organization_id) redirect('/baseball/dashboard/program');

  // Cookie-aware, multi-row-safe team resolution (matches Command Center).
  const teamId = await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id);
  if (!teamId) redirect('/baseball/dashboard/program');

  const { data: team } = await supabase
    .from('baseball_teams')
    .select('id, name')
    .eq('id', teamId)
    .maybeSingle() as { data: { id: string; name: string } | null };

  if (!team) redirect('/baseball/dashboard/program');

  return <NewGameClient teamId={team.id} teamName={team.name} />;
}

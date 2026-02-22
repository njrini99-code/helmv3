import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { GamesList } from '@/components/baseball/games/GamesList';

export default async function GamesPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/baseball/login');

  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('id, coach_type, organization_id')
    .eq('user_id', user.id)
    .single();

  if (!coach) redirect('/baseball/coach');
  if (coach.coach_type !== 'college' && coach.coach_type !== 'juco') redirect('/baseball/dashboard');
  if (!coach.organization_id) redirect('/baseball/dashboard/program');

  const { data: team } = await supabase
    .from('baseball_teams')
    .select('id, name')
    .eq('organization_id', coach.organization_id)
    .single() as { data: { id: string; name: string } | null };

  if (!team) redirect('/baseball/dashboard/team');

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <GamesList teamId={team.id} title="Games & Scrimmages" showAddButton={true} />
    </div>
  );
}

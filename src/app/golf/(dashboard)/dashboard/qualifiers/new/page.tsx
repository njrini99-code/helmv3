import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import NewQualifierClient from './new-qualifier-client';

export const metadata: Metadata = {
  title: 'Create Qualifier | Helm Sports',
  description: 'Create a new team qualifier for player selection',
};

export default async function NewQualifierPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/golf/login');
  }

  // Verify user is a coach
  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (userData?.role !== 'coach') {
    redirect('/golf/dashboard/qualifiers');
  }

  // Get coach's players for selection
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('organization_id')
    .eq('user_id', user.id)
    .single();

  let players: Array<{ id: string; first_name: string; last_name: string }> = [];

  if (coach?.organization_id) {
    const { data: orgTeam } = await supabase
      .from('golf_teams')
      .select('id')
      .eq('organization_id', coach.organization_id)
      .maybeSingle();

    if (orgTeam?.id) {
      const { data: teamMembersData } = await supabase
        .from('golf_team_members')
        .select(`
          player:golf_players!inner (
            id,
            first_name,
            last_name
          )
        `)
        .eq('team_id', orgTeam.id)
        .eq('status', 'active');

      players = (teamMembersData || [])
        .map(tm => tm.player)
        .filter((p): p is { id: string; first_name: string; last_name: string } =>
          p !== null && !!p.first_name && !!p.last_name
        )
        .sort((a, b) => a.last_name.localeCompare(b.last_name));
    }
  }

  return <NewQualifierClient players={players} />;
}

import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import NewQualifierClient from './new-qualifier-client';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';

export const metadata: Metadata = {
  title: 'Create Qualifier | Helm Sports',
  description: 'Create a new team qualifier for player selection',
};

export default async function NewQualifierPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { role, coach } = session;
  if (role !== 'coach') redirect('/golf/dashboard/qualifiers');

  const supabase = await createClient();

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

  return (
    <AnimatedPage>
      <AnimatedItem>
        <NewQualifierClient players={players} />
      </AnimatedItem>
    </AnimatedPage>
  );
}

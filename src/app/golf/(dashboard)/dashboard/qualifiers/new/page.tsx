import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { fairwayScope } from '@/lib/redesign/flag';
import { FairwayNewQualifier } from '@/components/fairway/pages/qualifiers/FairwayNewQualifier';

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
    const teamId = await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id);

    if (teamId) {
      const { data: teamMembersData } = await supabase
        .from('golf_team_members')
        .select(`
          player:golf_players!inner (
            id,
            first_name,
            last_name
          )
        `)
        .eq('team_id', teamId)
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
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <FairwayNewQualifier players={players} />
    </div>
  );
}

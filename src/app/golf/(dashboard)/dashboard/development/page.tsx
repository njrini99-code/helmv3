import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { DevelopmentPlansClient } from './development-client';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Development Plans | Helm Golf',
  description: 'Manage player development plans and focus areas for your team.',
};

export const revalidate = 60;

interface FocusArea {
  id: string;
  player_id: string;
  coach_id: string | null;
  area_type: string;
  title: string;
  description: string | null;
  status: string | null;
  target_metric: string | null;
  current_value: number | null;
  target_value: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface Player {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  grad_year: number | null;
  handicap: number | null;
}

interface FocusAreaWithPlayer extends FocusArea {
  player: Player | null;
}

export default async function DevelopmentPlansPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/golf/login');
  }

  // Verify user is a coach
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .single();

  if (!coach) {
    redirect('/golf/dashboard');
  }

  // Get team_id from organization
  let teamId: string | null = null;
  if (coach.organization_id) {
    const { data: orgTeam } = await supabase
      .from('golf_teams')
      .select('id')
      .eq('organization_id', coach.organization_id)
      .maybeSingle();
    teamId = orgTeam?.id || null;
  }

  if (!teamId) {
    redirect('/golf/dashboard');
  }

  // Fetch team players
  const { data: players } = await supabase
    .from('golf_players')
    .select('id, first_name, last_name, avatar_url, grad_year, handicap')
    .eq('team_id', teamId)
    .order('last_name');

  // Fetch all focus areas for team players
  const playerIds = (players || []).map(p => p.id);

  const { data: focusAreas } = playerIds.length > 0
    ? await supabase
        .from('golf_player_focus_areas')
        .select(`
          id,
          player_id,
          coach_id,
          area_type,
          title,
          description,
          status,
          target_metric,
          current_value,
          target_value,
          started_at,
          completed_at,
          created_at,
          updated_at
        `)
        .in('player_id', playerIds)
        .order('created_at', { ascending: false })
    : { data: [] };

  // Combine focus areas with player info
  const focusAreasWithPlayers: FocusAreaWithPlayer[] = (focusAreas || []).map(fa => ({
    ...fa,
    player: (players || []).find(p => p.id === fa.player_id) || null,
  }));

  return (
    <DevelopmentPlansClient
      players={players || []}
      focusAreas={focusAreasWithPlayers}
      coachId={coach.id}
    />
  );
}

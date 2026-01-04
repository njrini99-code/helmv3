import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { TeamSettingsClient } from './team-settings-client';

export default async function TeamSettingsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/golf/login');

  // Get coach with team info
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select(`
      id,
      team_id,
      full_name,
      golf_teams (
        id,
        name,
        season,
        invite_code,
        created_at
      )
    `)
    .eq('user_id', user.id)
    .single();

  if (!coach) {
    redirect('/golf/coach'); // Redirect to onboarding
  }

  return (
    <TeamSettingsClient
      coach={coach}
      team={coach.golf_teams as any}
    />
  );
}

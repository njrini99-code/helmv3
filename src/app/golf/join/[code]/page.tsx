import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { GolfJoinTeamClient } from './golf-join-team-client';

export const metadata = {
  title: 'Join Team | Helm Golf',
  description: 'Join a golf team',
};

interface PageProps {
  params: Promise<{ code: string }>;
}

export default async function GolfJoinTeamPage({ params }: PageProps) {
  const { code } = await params;
  const supabase = await createClient();

  // Check if user is authenticated
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    // Redirect to signup with return URL
    redirect(`/golf/signup?returnTo=/golf/join/${code}`);
  }

  // Get golf player record
  const { data: player } = await supabase
    .from('golf_players')
    .select('id, first_name, last_name, graduation_year, onboarding_completed')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!player || !player.onboarding_completed) {
    // User is logged in but hasn't completed player onboarding
    // Store the join code so they can auto-join after onboarding
    // Redirect to player onboarding with the join code
    redirect(`/golf/player?joinCode=${code}`);
  }

  // Find team by join code (case-insensitive - normalize to uppercase)
  // Note: golf_teams.organization_id references the shared 'organizations' table in production
  const normalizedCode = code.toUpperCase();
  const { data: team, error: teamError } = await supabase
    .from('golf_teams')
    .select(`
      id,
      name,
      season,
      join_code,
      organization:organizations (
        name,
        location_city,
        location_state,
        logo_url
      )
    `)
    .eq('join_code', normalizedCode)
    .single();

  if (teamError || !team) {
    return (
      <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-slate-900 mb-2">Invalid Invite Code</h1>
          <p className="text-slate-600 mb-6">
            This team invitation code is invalid or does not exist.
          </p>
          <a
            href="/golf/dashboard"
            className="inline-block px-6 py-2.5 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors"
          >
            Go to Dashboard
          </a>
        </div>
      </div>
    );
  }

  const organization = Array.isArray(team.organization) ? team.organization[0] : team.organization;

  return (
    <GolfJoinTeamClient
      inviteCode={code}
      playerId={player.id}
      playerName={`${player.first_name} ${player.last_name}`}
      playerYear={player.graduation_year ? String(player.graduation_year) : 'freshman'}
      team={{
        id: team.id,
        name: team.name,
        season: team.season,
        organization: organization ? {
          name: organization.name,
          city: organization.location_city,
          state: organization.location_state,
          logoUrl: organization.logo_url,
        } : undefined,
      }}
    />
  );
}

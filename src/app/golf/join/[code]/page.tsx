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
    .select('id, first_name, last_name, year, team_id')
    .eq('user_id', user.id)
    .single();

  if (!player) {
    redirect('/golf/signup');
  }

  // Find team by invite code
  const { data: team } = await supabase
    .from('golf_teams')
    .select(`
      id,
      name,
      season,
      invite_code,
      organization:golf_organizations (
        name,
        city,
        state,
        logo_url
      )
    `)
    .eq('invite_code', code)
    .single();

  if (!team) {
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
      playerYear={player.year || 'freshman'}
      team={{
        id: team.id,
        name: team.name,
        season: team.season,
        organization: organization ? {
          name: organization.name,
          city: organization.city,
          state: organization.state,
          logoUrl: organization.logo_url,
        } : undefined,
      }}
    />
  );
}

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { JoinTeamClient } from './join-team-client';

export const metadata = {
  title: 'Join Team | Helm Baseball',
  description: 'Join a baseball team',
};

interface PageProps {
  params: Promise<{ code: string }>;
}

export default async function JoinTeamPage({ params }: PageProps) {
  const { code } = await params;
  const supabase = await createClient();

  // Check if user is authenticated
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    // Redirect to signup with return URL
    redirect(`/baseball/signup?returnTo=/baseball/join/${code}`);
  }

  // Get player record
  const { data: player } = await supabase
    .from('players')
    .select('id, first_name, last_name, player_type')
    .eq('user_id', user.id)
    .single();

  if (!player) {
    redirect('/baseball/signup');
  }

  // Find team by invite code (baseball uses team_invitations table)
  const { data: invitation } = await supabase
    .from('team_invitations')
    .select(`
      id,
      team_id,
      invite_code,
      expires_at,
      is_active,
      teams!inner (
        id,
        name,
        team_type,
        season_year,
        organizations (
          name,
          city,
          state,
          logo_url
        )
      )
    `)
    .eq('invite_code', code)
    .single();

  if (!invitation || !invitation.teams) {
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
            This team invitation code is invalid or has expired.
          </p>
          <a
            href="/baseball/dashboard"
            className="inline-block px-6 py-2.5 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors"
          >
            Go to Dashboard
          </a>
        </div>
      </div>
    );
  }

  // Check if invitation is active and not expired
  const isActive = invitation.is_active;
  const isExpired = invitation.expires_at ? new Date(invitation.expires_at) < new Date() : false;

  if (!isActive || isExpired) {
    return (
      <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-slate-900 mb-2">Invitation {isExpired ? 'Expired' : 'Inactive'}</h1>
          <p className="text-slate-600 mb-6">
            This team invitation is no longer {isExpired ? 'valid' : 'active'}. Please contact your coach for a new invite link.
          </p>
          <a
            href="/baseball/dashboard"
            className="inline-block px-6 py-2.5 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors"
          >
            Go to Dashboard
          </a>
        </div>
      </div>
    );
  }

  const team = invitation.teams;
  const organization = Array.isArray(team.organizations) ? team.organizations[0] : team.organizations;

  return (
    <JoinTeamClient
      inviteCode={code}
      playerId={player.id}
      playerName={`${player.first_name} ${player.last_name}`}
      playerType={player.player_type || 'high_school'}
      team={{
        id: team.id,
        name: team.name,
        teamType: team.team_type || 'high_school',
        season: team.season_year ? team.season_year.toString() : null,
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

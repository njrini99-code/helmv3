import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { JoinTeamClient } from './join-team-client';
import Link from 'next/link';
import { IconX, IconWarning, IconArrowRight } from '@/components/icons';

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
    .from('baseball_players')
    .select('id, first_name, last_name, player_type')
    .eq('user_id', user.id)
    .single();

  if (!player) {
    redirect('/baseball/signup');
  }

  // Find team by invite code - try both methods
  // 1. First check baseball_team_invitations table
  type InvitationWithTeam = {
    id: string;
    team_id: string;
    code: string;
    expires_at: string | null;
    is_active: boolean | null;
    baseball_teams: {
      id: string;
      name: string;
      team_type: string;
      organizations: {
        name: string;
        location_city: string | null;
        location_state: string | null;
        logo_url: string | null;
      } | null;
    };
  };

  const { data: invitation } = await supabase
    .from('baseball_team_invitations')
    .select(`
      id,
      team_id,
      code,
      expires_at,
      is_active,
      baseball_teams!inner (
        id,
        name,
        team_type,
        organizations (
          name,
          location_city,
          location_state,
          logo_url
        )
      )
    `)
    .eq('code', code)
    .single() as { data: InvitationWithTeam | null };

  // 2. If not found, check direct join_code on baseball_teams
  type TeamWithInviteCode = {
    id: string;
    name: string;
    team_type: string;
    organizations: {
      name: string;
      location_city: string | null;
      location_state: string | null;
      logo_url: string | null;
    } | null;
  };

  let team: TeamWithInviteCode | null = null;
  let isInvitationBased = false;
  let isExpired = false;
  let isInactive = false;

  if (invitation?.baseball_teams) {
    team = invitation.baseball_teams;
    isInvitationBased = true;
    isInactive = !invitation.is_active;
    isExpired = invitation.expires_at ? new Date(invitation.expires_at) < new Date() : false;
  } else {
    // Try direct team invite code
    const { data: directTeam } = await supabase
      .from('baseball_teams')
      .select(`
        id,
        name,
        team_type,
        organizations (
          name,
          location_city,
          location_state,
          logo_url
        )
      `)
      .eq('join_code' as 'id', code)
      .single() as { data: TeamWithInviteCode | null };

    team = directTeam;
  }

  // Check if player is already a member of this team
  if (team) {
    const { data: existingMembership } = await supabase
      .from('baseball_team_members')
      .select('id')
      .eq('player_id', player.id)
      .eq('team_id', team.id)
      .single();

    if (existingMembership) {
      return (
        <div className="min-h-dvh bg-auth-baseball flex items-center justify-center p-4 sm:p-6">
          <div className="max-w-md w-full glass-standard rounded-2xl p-6 sm:p-8 text-center">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-warm-900 mb-2">Already a Member</h1>
            <p className="text-warm-600 mb-6">
              You&apos;re already a member of <span className="font-medium">{team.name}</span>.
            </p>
            <Link
              href="/baseball/player/today"
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 active:bg-primary-800 transition-colors"
            >
              Go to Player Today
              <IconArrowRight size={18} />
            </Link>
          </div>
        </div>
      );
    }
  }

  // Invalid code - team not found
  if (!team) {
    return (
      <div className="min-h-dvh bg-auth-baseball flex items-center justify-center p-4 sm:p-6">
        <div className="max-w-md w-full glass-standard rounded-2xl p-6 sm:p-8 text-center">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <IconX size={32} className="text-red-600" />
          </div>
          <h1 className="text-xl font-semibold text-warm-900 mb-2">Invalid Invite Code</h1>
          <p className="text-warm-600 mb-6">
            This team invitation code is invalid or has expired.
          </p>
          <Link
            href="/baseball/dashboard"
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 active:bg-primary-800 transition-colors"
          >
            Go to Dashboard
            <IconArrowRight size={18} />
          </Link>
        </div>
      </div>
    );
  }

  // Check if invitation is active and not expired (only for invitation-based joins)
  if (isInvitationBased && (isInactive || isExpired)) {
    return (
      <div className="min-h-dvh bg-auth-baseball flex items-center justify-center p-4 sm:p-6">
        <div className="max-w-md w-full glass-standard rounded-2xl p-6 sm:p-8 text-center">
          <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <IconWarning size={32} className="text-amber-600" />
          </div>
          <h1 className="text-xl font-semibold text-warm-900 mb-2">
            Invitation {isExpired ? 'Expired' : 'Inactive'}
          </h1>
          <p className="text-warm-600 mb-6">
            This team invitation is no longer {isExpired ? 'valid' : 'active'}. Please contact your coach for a new invite link.
          </p>
          <Link
            href="/baseball/dashboard"
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 active:bg-primary-800 transition-colors"
          >
            Go to Dashboard
            <IconArrowRight size={18} />
          </Link>
        </div>
      </div>
    );
  }

  const organization = team.organizations;

  return (
    <JoinTeamClient
      inviteCode={code}
      playerId={player.id}
      playerName={`${player.first_name} ${player.last_name}`}
      playerType={player.player_type || 'high_school'}
      isInvitationBased={isInvitationBased}
      team={{
        id: team.id,
        name: team.name,
        teamType: team.team_type || 'high_school',
        season: null,
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

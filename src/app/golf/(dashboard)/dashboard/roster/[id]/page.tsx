import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect, notFound } from 'next/navigation';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { Metadata } from 'next';
import { fairwayScope } from '@/lib/redesign/flag';
import { FairwayPlayerProfile } from '@/components/fairway/pages/roster/FairwayPlayerProfile';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();

  const { data: player } = await supabase
    .from('golf_players')
    .select('first_name, last_name')
    .eq('id', id)
    .maybeSingle();

  if (!player) {
    return { title: 'Player Not Found | Helm Golf' };
  }

  return {
    title: `${player.first_name} ${player.last_name} | Helm Golf`,
    description: `View ${player.first_name} ${player.last_name}'s golf profile and stats`,
  };
}

export default async function PlayerProfilePage({ params }: PageProps) {
  const { id } = await params;
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { coach } = session;
  // C18/F142: this player-detail page is a coach-only surface. A signed-in
  // PLAYER who lands here was bounced to /golf/login (a confusing re-auth
  // loop — they are already authenticated). Send them to their dashboard
  // instead of a login bounce; an unauthenticated session was already handled
  // by the !session redirect above.
  if (!coach) redirect('/golf/dashboard');

  const supabase = await createClient();

  // Both reads on this page used to discard their error, and here the mask a
  // failure wears is a 404: `!player` and `!membership` each call notFound(),
  // so a coach clicking a player on their OWN roster was told that player does
  // not exist. Absent and unreadable are not the same answer, and only the
  // first one is a 404.
  const { data: player, error: playerError } = await supabase
    .from('golf_players')
    .select(`
      id,
      first_name,
      last_name,
      avatar_url,
      hometown,
      state,
      graduation_year,
      handicap,
      phone,
      email,
      created_at
    `)
    .eq('id', id)
    .maybeSingle();

  if (playerError) {
    await logServerError(
      `[player detail] player read failed — would have 404'd a player who exists: ${describeError(playerError)}`,
      { action: 'playerDetail.player', featureArea: 'roster', playerId: id },
    );
    throw new Error("Couldn't load this player. Please try again.");
  }

  if (!player) {
    notFound();
  }

  // Verify player is on coach's team (deterministic: handles orgs with >1 team)
  const teamId = await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id);

  if (!teamId) {
    notFound();
  }

  // Check team membership
  const { data: membership, error: membershipError } = await supabase
    .from('golf_team_members')
    .select('status')
    .eq('team_id', teamId)
    .eq('player_id', id)
    .maybeSingle();

  // Same trap, and this one is the likelier of the two to fire: a failed
  // membership read 404s a player who IS on the roster the coach just clicked
  // them from.
  if (membershipError) {
    await logServerError(
      `[player detail] membership read failed — would have 404'd a rostered player: ${describeError(membershipError)}`,
      { action: 'playerDetail.membership', featureArea: 'roster', playerId: id },
    );
    throw new Error("Couldn't load this player. Please try again.");
  }

  if (!membership) {
    notFound();
  }

  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <FairwayPlayerProfile player={player} membershipStatus={membership.status} />
    </div>
  );
}

import { redirect, notFound } from 'next/navigation';
import { isRedesignEnabled } from '@/lib/redesign/flag';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { getPlayerDisplayName } from '@/app/golf/actions/stats-data';
import { FairwayPlayerStats } from '@/components/fairway/pages/coachhelm/FairwayPlayerStats';
import type { Metadata } from 'next';

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
    return { title: 'Player Stats | GolfHelm' };
  }

  const name = `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim();
  return {
    title: `${name} · Stats | GolfHelm`,
    description: `Strokes gained, fundamentals, and trends for ${name}.`,
  };
}

export const dynamic = 'force-dynamic';

/** Canonical coach per-player stats — `/stats/players/[id]`. */
export default async function CoachPlayerStatsPage({ params }: PageProps) {
  if (!isRedesignEnabled()) {
    const { id } = await params;
    redirect(`/golf/dashboard/stats?player=${id}`);
  }

  const { id: playerId } = await params;
  const session = await getGolfSessionProfile();
  if (!session?.coach) {
    redirect('/golf/dashboard/stats');
  }

  const supabase = await createClient();
  const teamId = await resolveCoachTeamIdWithCookie(
    supabase,
    session.coach.organization_id,
    session.coach.id,
  );
  if (!teamId) notFound();

  const { data: membership } = await supabase
    .from('golf_team_members')
    .select('player_id')
    .eq('team_id', teamId)
    .eq('player_id', playerId)
    .maybeSingle();

  if (!membership) notFound();

  const playerName = await getPlayerDisplayName(playerId);

  return <FairwayPlayerStats initialPlayerId={playerId} initialPlayerName={playerName} />;
}

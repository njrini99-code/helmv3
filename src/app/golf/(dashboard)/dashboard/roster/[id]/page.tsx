import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect, notFound } from 'next/navigation';
import { isUuid } from '@/lib/utils/uuid';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { Metadata } from 'next';
import { fairwayScope } from '@/lib/redesign/flag';
import { FairwayPlayerProfile } from '@/components/fairway/pages/roster/FairwayPlayerProfile';
import { getDetailedStats } from '@/app/golf/actions/stats-data';
import { getPlayerStandingRows } from '@/app/golf/actions/stats-leak-maps';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) notFound();
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
  if (!isUuid(id)) notFound();
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

  // ---------------------------------------------------------------------
  // Masthead snapshot reads — headline numbers (StatMatrix), SG standing
  // (StandingBars), focus areas and recent rounds (seam rows). Each is an
  // ADDITIVE enrichment of an already-loaded page: a failure degrades that
  // one section to its honest empty state rather than throwing, matching
  // the pattern `/players/[playerId]/game` already uses for its optional
  // panels. `getDetailedStats`/`getPlayerStandingRows` are the SAME single-
  // purpose actions `StatsSpineStage` calls (via the heavier dashboard
  // bundle) — reused here directly rather than the full 8-read bundle,
  // since the masthead only needs five numbers and one standing row, not
  // trend/leak/spray/pattern data.
  // ---------------------------------------------------------------------
  const [detailedStatsResult, standingResult, focusAreasResult, roundsResult] = await Promise.all([
    getDetailedStats(id, 'overall').catch((err) => {
      void logServerError(
        `[player detail] headline stats read failed (StatMatrix will show placeholders): ${describeError(err)}`,
        { action: 'playerDetail.detailedStats', featureArea: 'roster', playerId: id },
        'warning',
      );
      return null;
    }),
    getPlayerStandingRows(id).catch((err) => {
      void logServerError(
        `[player detail] standing rows read failed (StandingBars will show insufficient-data): ${describeError(err)}`,
        { action: 'playerDetail.standingRows', featureArea: 'roster', playerId: id },
        'warning',
      );
      return null;
    }),
    supabase
      .from('golf_player_focus_areas')
      .select('id, title, area_type, status, current_value, target_value, created_at')
      .eq('player_id', id)
      .neq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(3),
    supabase
      .from('golf_rounds')
      .select('id, round_date, course_name, total_score, score_to_par')
      .eq('player_id', id)
      .not('total_score', 'is', null)
      .order('round_date', { ascending: false })
      .limit(4),
  ]);

  if (focusAreasResult.error) {
    void logServerError(
      `[player detail] focus areas read failed (that section will render empty): ${describeError(focusAreasResult.error)}`,
      { action: 'playerDetail.focusAreas', featureArea: 'roster', playerId: id },
      'warning',
    );
  }
  if (roundsResult.error) {
    void logServerError(
      `[player detail] recent rounds read failed (that section will render empty): ${describeError(roundsResult.error)}`,
      { action: 'playerDetail.recentRounds', featureArea: 'roster', playerId: id },
      'warning',
    );
  }

  const standingRows = standingResult?.success ? (standingResult.data ?? []) : [];

  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <FairwayPlayerProfile
        player={player}
        membershipStatus={membership.status}
        detailedStats={detailedStatsResult}
        standingRows={standingRows}
        focusAreas={focusAreasResult.data ?? []}
        recentRounds={roundsResult.data ?? []}
        serverNowMs={Date.now()}
      />
    </div>
  );
}

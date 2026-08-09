import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getPlayerSeasonStats } from '@/app/baseball/actions/games';
import { SeasonStatsTable } from '@/components/baseball/season-stats/SeasonStatsTable';
import { PlayerGameLog } from '@/components/baseball/season-stats/PlayerGameLog';
import type { BaseballPlayerSeasonStats, BaseballBoxScoreBatting, BaseballBoxScorePitching, BaseballGame } from '@/lib/types';
import { PaperCard, EditorsLetter } from '@/components/baseball/living-annual';
import { resolveCoachTeamIdWithCookie } from '@/lib/baseball/resolve-team-server';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PlayerStatsPage({ params }: PageProps) {
  const { id: playerId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/baseball/login');

  // FOUR READS, AND EVERY FAILURE IS A REDIRECT OR A 404.
  //
  // This page silently bounces the coach on any null: to command-center, to
  // /program, or to a 404. A failed read produces the identical null, so a
  // dropped connection walks the coach backwards through the product with no
  // error shown and nothing to retry — and the roster they came from still
  // lists the player they clicked.
  const STATS_UNREADABLE = "Couldn't load this player's stats. Please try again.";

  const { data: coach, error: coachError } = await supabase
    .from('baseball_coaches')
    .select('id, coach_type, organization_id')
    .eq('user_id', user.id)
    .single();

  // `.single()` reports a genuine no-row as PGRST116 — that really is "not a
  // coach" and still redirects.
  if (coachError && coachError.code !== 'PGRST116') {
    void logServerError(
      `[baseball player stats] coach read failed: ${describeError(coachError)}`,
      { action: 'baseballPlayerStats.resolveCoach', featureArea: 'stats' },
      'warning',
    );
    throw new Error(STATS_UNREADABLE);
  }

  if (!coach) redirect('/baseball/dashboard/command-center');
  if (!coach.organization_id) redirect('/baseball/dashboard/program');

  // Cookie-aware, multi-row-safe team resolution (matches Command Center).
  const teamId = await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id);
  if (!teamId) redirect('/baseball/dashboard/program');

  const { data: team, error: teamError } = await supabase
    .from('baseball_teams')
    .select('id, name')
    .eq('id', teamId)
    .maybeSingle() as { data: { id: string; name: string } | null; error: { message?: string; code?: string } | null };

  if (teamError) {
    void logServerError(
      `[baseball player stats] team read failed for ${teamId}: ${describeError(teamError)}`,
      { action: 'baseballPlayerStats.resolveTeam', featureArea: 'stats' },
      'warning',
    );
    throw new Error(STATS_UNREADABLE);
  }

  if (!team) redirect('/baseball/dashboard/program');

  // Verify player is on team
  const { data: membership, error: membershipError } = await supabase
    .from('baseball_team_members')
    .select('player_id, jersey_number')
    .eq('team_id', team.id)
    .eq('player_id', playerId)
    .single();

  if (membershipError && membershipError.code !== 'PGRST116') {
    void logServerError(
      `[baseball player stats] membership read failed for ${playerId}: ${describeError(membershipError)}`,
      { action: 'baseballPlayerStats.verifyMembership', featureArea: 'stats' },
      'warning',
    );
    throw new Error(STATS_UNREADABLE);
  }

  if (!membership) notFound();

  const { data: player, error: playerError } = await supabase
    .from('baseball_players')
    .select('id, first_name, last_name, avatar_url, primary_position, secondary_position, grad_year')
    .eq('id', playerId)
    .single();

  // Membership already proved this player is on the team, so a failure here
  // 404s someone we just confirmed exists.
  if (playerError && playerError.code !== 'PGRST116') {
    void logServerError(
      `[baseball player stats] player read failed for ${playerId} after membership was confirmed: ${describeError(playerError)}`,
      { action: 'baseballPlayerStats.loadPlayer', featureArea: 'stats' },
      'error',
    );
    throw new Error(STATS_UNREADABLE);
  }

  if (!player) notFound();

  const currentYear = new Date().getFullYear();
  const statsResult = await getPlayerSeasonStats(playerId, team.id, currentYear);

  const seasonStats: BaseballPlayerSeasonStats[] = statsResult.data
    ? [{ ...statsResult.data, player: { first_name: player.first_name, last_name: player.last_name, primary_position: player.primary_position } }]
    : [];

  return (
    <div className="max-w-[1536px] mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-sm text-warm-400 mb-2">
            <Link href={`/baseball/dashboard/players/${playerId}`} className="hover:text-warm-600">
              {player.first_name} {player.last_name}
            </Link>
            <span>›</span>
            <span className="text-warm-600">Stats</span>
          </div>
          <h1 className="text-2xl font-bold text-warm-900">
            {player.first_name} {player.last_name}
          </h1>
          <p className="text-sm text-warm-500 mt-0.5">
            {player.primary_position && <span>{player.primary_position}</span>}
            {membership.jersey_number && <span className="ml-2">#{membership.jersey_number}</span>}
            {player.grad_year && <span className="ml-2">Class of {player.grad_year}</span>}
          </p>
        </div>
        <Link
          href={`/baseball/dashboard/players/${playerId}`}
          className="text-sm text-primary-600 hover:text-primary-700 font-medium"
        >
          View Profile →
        </Link>
      </div>

      {/* Season stats summary cards */}
      {statsResult.data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {statsResult.data.ab > 0 && (
            <>
              <StatCard label="AVG" value={statsResult.data.avg != null ? statsResult.data.avg.toFixed(3).replace(/^0/, '') : '—'} />
              <StatCard label="OBP" value={statsResult.data.obp != null ? statsResult.data.obp.toFixed(3).replace(/^0/, '') : '—'} />
              <StatCard label="SLG" value={statsResult.data.slg != null ? statsResult.data.slg.toFixed(3).replace(/^0/, '') : '—'} />
              <StatCard label="OPS" value={statsResult.data.ops != null ? statsResult.data.ops.toFixed(3) : '—'} />
            </>
          )}
          {statsResult.data.ip > 0 && (
            <>
              <StatCard label="ERA" value={statsResult.data.era != null ? statsResult.data.era.toFixed(2) : '—'} />
              <StatCard label="WHIP" value={statsResult.data.whip != null ? statsResult.data.whip.toFixed(3) : '—'} />
              <StatCard label="K" value={String(statsResult.data.k_thrown)} />
              <StatCard label="IP" value={statsResult.data.ip.toFixed(1)} />
            </>
          )}
        </div>
      )}

      {/* Full season stats table */}
      {seasonStats.length > 0 ? (
        <SeasonStatsTable
          stats={seasonStats}
          seasonYear={currentYear}
          teamId={team.id}
        />
      ) : (
        <EditorsLetter
          title="No season stats yet"
          body="Stats populate automatically from box scores."
        />
      )}

      {/* Game log */}
      <div>
        <h2 className="text-lg font-bold text-warm-900 mb-4">{currentYear} Game Log</h2>
        <PlayerGameLog
          batting={(statsResult.gameLog ?? []) as Array<BaseballBoxScoreBatting & { game: Partial<BaseballGame> }>}
          pitching={(statsResult.pitchingLog ?? []) as Array<BaseballBoxScorePitching & { game: Partial<BaseballGame> }>}
        />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <PaperCard className="p-4 shadow-sm text-center">
      <p className="text-xs font-semibold text-warm-400 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-black text-warm-900 tabular-nums">{value}</p>
    </PaperCard>
  );
}

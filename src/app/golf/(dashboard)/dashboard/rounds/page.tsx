import { createClient } from '@/lib/supabase/server';
import { ShineEffect } from '@/components/ui/shine-effect';
import { MobileNavHeader } from '@/components/golf/layout/MobileNavHeader';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import { Avatar } from '@/components/ui/avatar';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { IconPlus, IconGolf, IconCalendar, IconMapPin, IconChevronRight, IconTrophy, IconFlag, IconTrendingUp, IconTrendingDown } from '@/components/icons';
import type { GolfRound } from '@/lib/types/golf';
import type { Metadata } from 'next';
import { UnfinishedRoundsSection } from './unfinished-rounds-section';

export const metadata: Metadata = {
  title: 'Rounds | Helm Golf',
  description: 'View and manage all golf rounds for your team. Track scores, stats, and player performance over time.',
};

// Cache rounds for 2 minutes (new rounds added moderately often)
export const revalidate = 120;

interface RoundWithPlayer extends GolfRound {
  player: {
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  } | null;
}

// Round type display config
function getRoundTypeMeta(type: string | null) {
  switch (type) {
    case 'tournament':
      return { label: 'Tournament', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' };
    case 'qualifying':
      return { label: 'Qualifying', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
    case 'practice':
      return { label: 'Practice', bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' };
    case 'casual':
      return { label: 'Casual', bg: 'bg-slate-50', text: 'text-slate-500', border: 'border-slate-200' };
    default:
      return { label: type || 'Round', bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' };
  }
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

export default async function RoundsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/golf/login');
  }

  // Check if user is a coach or player
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .single();

  const { data: player } = await supabase
    .from('golf_players')
    .select('id, first_name, last_name')
    .eq('user_id', user.id)
    .single();

  const userRole = coach ? 'coach' : player ? 'player' : null;

  if (!userRole) {
    redirect('/golf/login');
  }

  // Fetch rounds based on role
  let rounds: RoundWithPlayer[] = [];
  let inProgressRounds: RoundWithPlayer[] = [];

  // Get team_id from organization if coach
  let teamId: string | null = null;
  if (coach?.organization_id) {
    const { data: orgTeam } = await supabase
      .from('golf_teams')
      .select('id')
      .eq('organization_id', coach.organization_id)
      .maybeSingle();
    teamId = orgTeam?.id || null;
  }

  const playerSelectFields = `
    id,
    course_name,
    course_city,
    course_state,
    round_date,
    round_type,
    total_score,
    score_to_par,
    total_putts,
    status,
    player:golf_players(first_name, last_name, avatar_url)
  `;

  const inProgressSelectFields = `
    id,
    course_name,
    course_city,
    course_state,
    round_date,
    round_type,
    total_score,
    score_to_par,
    current_hole,
    holes_played,
    updated_at,
    created_at,
    player:golf_players(first_name, last_name, avatar_url)
  `;

  if (userRole === 'coach' && teamId) {
    const { data: teamMembers } = await supabase
      .from('golf_team_members')
      .select('player_id')
      .eq('team_id', teamId);

    const teamPlayerIds = teamMembers?.map(tm => tm.player_id) || [];

    if (teamPlayerIds.length > 0) {
      const [
        { data: completedData },
        { data: inProgressData }
      ] = await Promise.all([
        supabase
          .from('golf_rounds')
          .select(playerSelectFields)
          .in('player_id', teamPlayerIds)
          .eq('status', 'completed')
          .order('round_date', { ascending: false })
          .limit(50),
        supabase
          .from('golf_rounds')
          .select(inProgressSelectFields)
          .in('player_id', teamPlayerIds)
          .eq('status', 'in_progress')
          .order('updated_at', { ascending: false })
      ]);

      rounds = (completedData ?? []).map(r => ({
        ...r,
        player: r.player && !('error' in r.player) ? r.player : null
      })) as RoundWithPlayer[];
      inProgressRounds = (inProgressData ?? []).map(r => ({
        ...r,
        player: r.player && !('error' in r.player) ? r.player : null
      })) as RoundWithPlayer[];
    }
  } else if (userRole === 'player' && player) {
    const [
      { data: completedData },
      { data: inProgressData }
    ] = await Promise.all([
      supabase
        .from('golf_rounds')
        .select(playerSelectFields)
        .eq('player_id', player.id)
        .eq('status', 'completed')
        .order('round_date', { ascending: false }),
      supabase
        .from('golf_rounds')
        .select(inProgressSelectFields)
        .eq('player_id', player.id)
        .eq('status', 'in_progress')
        .order('updated_at', { ascending: false })
    ]);

    rounds = (completedData ?? []).map(r => ({
      ...r,
      player: r.player && !('error' in r.player) ? r.player : null
    })) as RoundWithPlayer[];
    inProgressRounds = (inProgressData ?? []).map(r => ({
      ...r,
      player: r.player && !('error' in r.player) ? r.player : null
    })) as RoundWithPlayer[];
  }

  // Group rounds by date
  const groupedRounds = rounds.reduce((acc, round) => {
    const date = new Date(round.round_date).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
    if (!acc[date]) acc[date] = [];
    acc[date].push(round);
    return acc;
  }, {} as Record<string, RoundWithPlayer[]>);

  // Calculate round statistics summary
  const roundStats = (() => {
    if (rounds.length === 0) return null;
    const scores = rounds.map(r => r.total_score).filter((s): s is number => s !== null && s > 0);
    const toParScores = rounds.map(r => r.score_to_par).filter((s): s is number => s !== null);
    if (scores.length === 0) return null;

    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const best = Math.min(...scores);
    const avgToPar = toParScores.length > 0 ? toParScores.reduce((a, b) => a + b, 0) / toParScores.length : null;
    const underParCount = toParScores.filter(s => s < 0).length;
    const underParPct = toParScores.length > 0 ? Math.round((underParCount / toParScores.length) * 100) : 0;

    // Trend: compare last 5 vs previous 5
    let trend: 'improving' | 'declining' | 'stable' | null = null;
    if (scores.length >= 6) {
      const recent5 = scores.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
      const prev5 = scores.slice(5, 10).reduce((a, b) => a + b, 0) / Math.min(5, scores.length - 5);
      if (recent5 < prev5 - 0.5) trend = 'improving';
      else if (recent5 > prev5 + 0.5) trend = 'declining';
      else trend = 'stable';
    }

    return { avg, best, avgToPar, underParPct, totalRounds: scores.length, trend };
  })();

  return (
    <AnimatedPage className="min-h-full">
      {/* Header Section */}
      <AnimatedItem>
        <MobileNavHeader
          title="Rounds"
          subtitle={`${rounds.length} round${rounds.length !== 1 ? 's' : ''} recorded`}
        >
          {userRole === 'player' && (
            <Link href="/golf/dashboard/rounds/new">
              <button className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white font-medium text-sm rounded-xl hover:bg-primary-700 shadow-sm hover:shadow-md transition-all duration-200">
                <IconPlus size={16} />
                New Round
              </button>
            </Link>
          )}
        </MobileNavHeader>
      </AnimatedItem>

      {/* Main Content */}
      <AnimatedItem>
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8">
          {/* Stats Summary Cards */}
          {roundStats && rounds.length >= 3 && (
            <div className="mb-8 grid grid-cols-2 md:grid-cols-5 gap-3">
              {/* Total Rounds */}
              <div className="relative glass-standard rounded-2xl overflow-hidden p-4">
                <ShineEffect />
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center">
                      <IconGolf size={14} className="text-slate-500" />
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-slate-900 tabular-nums">{roundStats.totalRounds}</p>
                  <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wider mt-0.5">Rounds</p>
                </div>
              </div>

              {/* Avg Score */}
              <div className="relative glass-standard rounded-2xl overflow-hidden p-4">
                <ShineEffect />
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center">
                      <IconFlag size={14} className="text-slate-500" />
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-slate-900 tabular-nums">{roundStats.avg.toFixed(1)}</p>
                  <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wider mt-0.5">Avg Score</p>
                </div>
              </div>

              {/* Best Round */}
              <div className="relative glass-standard rounded-2xl overflow-hidden p-4">
                <ShineEffect />
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-lg bg-green-50 flex items-center justify-center">
                      <IconTrophy size={14} className="text-green-600" />
                    </div>
                  </div>
                  <p className={cn(
                    'text-2xl font-bold tabular-nums',
                    roundStats.best < 72 ? 'text-green-600' : 'text-slate-900'
                  )}>{roundStats.best}</p>
                  <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wider mt-0.5">Best Round</p>
                </div>
              </div>

              {/* Avg to Par */}
              <div className="relative glass-standard rounded-2xl overflow-hidden p-4">
                <ShineEffect />
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={cn(
                      'w-7 h-7 rounded-lg flex items-center justify-center',
                      roundStats.avgToPar !== null && roundStats.avgToPar < 0 ? 'bg-green-50' : 'bg-slate-100'
                    )}>
                      {roundStats.avgToPar !== null && roundStats.avgToPar < 0
                        ? <IconTrendingDown size={14} className="text-green-600" />
                        : <IconTrendingUp size={14} className="text-slate-500" />
                      }
                    </div>
                  </div>
                  <p className={cn(
                    'text-2xl font-bold tabular-nums',
                    roundStats.avgToPar !== null && roundStats.avgToPar < 0 ? 'text-green-600' : 'text-slate-900'
                  )}>
                    {roundStats.avgToPar !== null
                      ? `${roundStats.avgToPar >= 0 ? '+' : ''}${roundStats.avgToPar.toFixed(1)}`
                      : '--'
                    }
                  </p>
                  <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wider mt-0.5">Avg to Par</p>
                </div>
              </div>

              {/* Under Par % + Trend */}
              <div className="relative glass-standard rounded-2xl overflow-hidden p-4 col-span-2 md:col-span-1">
                <ShineEffect />
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-2">
                    {roundStats.trend && (
                      <span className={cn(
                        'text-[10px] font-semibold px-2 py-0.5 rounded-full',
                        roundStats.trend === 'improving' ? 'text-green-700 bg-green-100' :
                        roundStats.trend === 'declining' ? 'text-red-600 bg-red-50' :
                        'text-slate-500 bg-slate-100'
                      )}>
                        {roundStats.trend === 'improving' ? 'Improving' :
                         roundStats.trend === 'declining' ? 'Declining' :
                         'Stable'}
                      </span>
                    )}
                  </div>
                  <p className="text-2xl font-bold tabular-nums text-slate-900">
                    {roundStats.underParPct}%
                  </p>
                  <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wider mt-0.5">Under Par</p>
                </div>
              </div>
            </div>
          )}

          {/* Unfinished Rounds Section */}
          {inProgressRounds.length > 0 && userRole === 'player' && (
            <>
              <UnfinishedRoundsSection rounds={inProgressRounds} />
              {rounds.length > 0 && (
                <div className="mt-10 mb-6 flex items-center gap-3">
                  <div className="h-px flex-1 bg-slate-200/80" />
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Completed</span>
                  <div className="h-px flex-1 bg-slate-200/80" />
                </div>
              )}
            </>
          )}

          {rounds.length === 0 && inProgressRounds.length === 0 ? (
            /* Empty State */
            <div className="relative glass-standard rounded-2xl overflow-hidden py-20 px-8 text-center">
              <ShineEffect />
              <div className="relative z-10">
                <div className="w-16 h-16 rounded-2xl bg-primary-50 flex items-center justify-center mx-auto mb-5">
                  <IconGolf size={28} className="text-primary-400" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900 mb-2">No Rounds Yet</h3>
                <p className="text-slate-500 mb-8 max-w-sm mx-auto leading-relaxed">
                  {userRole === 'coach'
                    ? "Your players haven't submitted any rounds yet. Rounds will appear here as they're recorded."
                    : 'Start tracking your golf rounds to see stats and improvement over time.'}
                </p>
                {userRole === 'player' && (
                  <Link href="/golf/dashboard/rounds/new">
                    <button className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 text-white font-medium text-sm rounded-xl hover:bg-primary-700 shadow-sm hover:shadow-md transition-all duration-200">
                      <IconPlus size={16} />
                      Submit First Round
                    </button>
                  </Link>
                )}
              </div>
            </div>
          ) : rounds.length > 0 ? (
            /* Round List */
            <div className="space-y-8">
              {Object.entries(groupedRounds).map(([monthYear, monthRounds]) => (
                <div key={monthYear}>
                  {/* Month/Year Section Header */}
                  <div className="flex items-center gap-3 mb-4">
                    <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                      {monthYear}
                    </h2>
                    <div className="h-px flex-1 bg-slate-200/60" />
                    <span className="text-[11px] font-medium text-slate-300">
                      {monthRounds.length} round{monthRounds.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {monthRounds.map((round) => {
                      const playerName = round.player
                        ? `${round.player.first_name || ''} ${round.player.last_name || ''}`.trim()
                        : 'Unknown Player';
                      const avatarUrl = round.player?.avatar_url || null;
                      const scoreToPar = round.score_to_par || 0;
                      const roundTypeMeta = getRoundTypeMeta(round.round_type);
                      const relativeDate = formatRelativeDate(round.round_date);
                      const fullDate = new Date(round.round_date).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      });

                      return (
                        <Link key={round.id} href={`/golf/dashboard/rounds/${round.id}`}>
                          <div className="group relative glass-standard rounded-2xl overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
                            <ShineEffect />
                            <div className="relative z-10 flex items-center gap-4 p-4 md:p-5">

                              {/* Player Avatar — always visible for coach, hidden for player */}
                              {userRole === 'coach' ? (
                                <Avatar
                                  src={avatarUrl}
                                  name={playerName}
                                  size="lg"
                                  className="flex-shrink-0"
                                />
                              ) : (
                                /* Player self-view: show score as the leading element */
                                <div className={cn(
                                  'w-12 h-12 rounded-xl flex flex-col items-center justify-center flex-shrink-0',
                                  scoreToPar < 0 ? 'bg-green-50 ring-1 ring-green-100' : scoreToPar === 0 ? 'bg-slate-50 ring-1 ring-slate-100' : 'bg-amber-50 ring-1 ring-amber-100'
                                )}>
                                  <span className={cn(
                                    'text-lg font-bold leading-none',
                                    scoreToPar < 0 ? 'text-green-600' : scoreToPar === 0 ? 'text-slate-700' : 'text-amber-600'
                                  )}>
                                    {round.total_score || '--'}
                                  </span>
                                </div>
                              )}

                              {/* Main Content */}
                              <div className="flex-1 min-w-0">
                                {/* Row 1: Player Name (coach) / Course Name (player) */}
                                <div className="flex items-center gap-2 mb-0.5">
                                  {userRole === 'coach' ? (
                                    <h3 className="font-semibold text-slate-900 truncate group-hover:text-primary-600 transition-colors text-[15px]">
                                      {playerName}
                                    </h3>
                                  ) : (
                                    <h3 className="font-semibold text-slate-900 truncate group-hover:text-primary-600 transition-colors text-[15px]">
                                      {round.course_name}
                                    </h3>
                                  )}
                                  <span className={cn(
                                    'px-2 py-0.5 text-[10px] font-semibold rounded-full capitalize flex-shrink-0 border',
                                    roundTypeMeta.bg, roundTypeMeta.text, roundTypeMeta.border
                                  )}>
                                    {roundTypeMeta.label}
                                  </span>
                                </div>

                                {/* Row 2: Course (coach) / Date + Location (player) */}
                                {userRole === 'coach' ? (
                                  <p className="text-sm text-slate-500 truncate">
                                    {round.course_name}
                                  </p>
                                ) : null}

                                {/* Row 3: Metadata */}
                                <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
                                  <span className="flex items-center gap-1" title={fullDate}>
                                    <IconCalendar size={12} />
                                    {relativeDate}
                                  </span>
                                  {round.course_city && round.course_state && (
                                    <span className="flex items-center gap-1 hidden sm:flex">
                                      <IconMapPin size={12} />
                                      {round.course_city}, {round.course_state}
                                    </span>
                                  )}
                                  {round.total_putts && (
                                    <span className="hidden md:inline text-slate-400">
                                      {round.total_putts} putts
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Right Side: Score (coach view) / To-Par badge (player view) */}
                              <div className="flex items-center gap-3 flex-shrink-0">
                                {userRole === 'coach' ? (
                                  /* Coach sees full score block */
                                  <div className="text-right">
                                    <p className={cn(
                                      'text-2xl font-bold tabular-nums leading-none',
                                      scoreToPar < 0 ? 'text-green-600' : scoreToPar === 0 ? 'text-slate-800' : 'text-slate-800'
                                    )}>
                                      {round.total_score || '--'}
                                    </p>
                                    <p className={cn(
                                      'text-xs font-semibold tabular-nums mt-0.5',
                                      scoreToPar < 0 ? 'text-green-500' : scoreToPar === 0 ? 'text-slate-400' : 'text-amber-500'
                                    )}>
                                      {scoreToPar === 0 ? 'Even' : scoreToPar > 0 ? `+${scoreToPar}` : scoreToPar}
                                    </p>
                                  </div>
                                ) : (
                                  /* Player sees to-par badge */
                                  <div className={cn(
                                    'px-2.5 py-1 rounded-lg text-xs font-semibold tabular-nums',
                                    scoreToPar < 0 ? 'bg-green-50 text-green-600' : scoreToPar === 0 ? 'bg-slate-50 text-slate-500' : 'bg-amber-50 text-amber-600'
                                  )}>
                                    {scoreToPar === 0 ? 'E' : scoreToPar > 0 ? `+${scoreToPar}` : scoreToPar}
                                  </div>
                                )}

                                <IconChevronRight size={16} className="text-slate-300 group-hover:text-primary-500 transition-colors" />
                              </div>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </AnimatedItem>
    </AnimatedPage>
  );
}

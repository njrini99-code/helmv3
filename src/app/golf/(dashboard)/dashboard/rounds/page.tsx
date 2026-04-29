import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { LargeTitleHeader } from '@/components/golf/layout/LargeTitleHeader';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import { Avatar } from '@/components/ui/avatar';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { IconPlus, IconGolf, IconTrophy, IconFlag, IconTrendingUp, IconTrendingDown } from '@/components/icons';
import type { GolfRound } from '@/lib/types/golf';
import type { Metadata } from 'next';
import { UnfinishedRoundsSection } from './unfinished-rounds-section';

export const metadata: Metadata = {
  title: 'Rounds | Helm Golf',
  description: 'View and manage all golf rounds for your team. Track scores, stats, and player performance over time.',
};

// Rounds are player-specific and should reflect new saves/completions immediately.
export const dynamic = 'force-dynamic';

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
    case 'qualifier':
    case 'qualifying':
      return { label: 'Qualifier', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' };
    case 'practice':
      return { label: 'Practice', bg: 'bg-warm-50', text: 'text-warm-600', border: 'border-warm-200' };
    case 'casual':
      return { label: 'Casual', bg: 'bg-warm-50', text: 'text-warm-500', border: 'border-warm-200' };
    default:
      return { label: type || 'Round', bg: 'bg-warm-50', text: 'text-warm-600', border: 'border-warm-200' };
  }
}


export default async function RoundsPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { role: userRole, coach, player } = session;
  if (!userRole) redirect('/golf/login');

  const supabase = await createClient();

  // Fetch rounds based on role
  let rounds: RoundWithPlayer[] = [];
  let inProgressRounds: RoundWithPlayer[] = [];

  // Get team_id from organization if coach
  let teamId: string | null = null;
  if (coach?.organization_id) {
    try {
      const { data: orgTeam } = await supabase
        .from('golf_teams')
        .select('id')
        .eq('organization_id', coach.organization_id)
        .maybeSingle();
      teamId = orgTeam?.id || null;
    } catch {
      // Network failure — proceed with null teamId
    }
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
    holes_played,
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
    let teamMembers: { player_id: string }[] | null = null;
    try {
      const result = await supabase
        .from('golf_team_members')
        .select('player_id')
        .eq('team_id', teamId);
      teamMembers = result.data;
    } catch {
      // Network failure
    }

    const teamPlayerIds = teamMembers?.map(tm => tm.player_id) || [];

    if (teamPlayerIds.length > 0) {
      try {
        const { data: completedData } = await supabase
          .from('golf_rounds')
          .select(playerSelectFields)
          .in('player_id', teamPlayerIds)
          .eq('status', 'completed')
          .order('round_date', { ascending: false })
          .limit(50);

        rounds = (completedData ?? []).map(r => ({
          ...r,
          player: r.player && !('error' in r.player) ? r.player : null
        })) as RoundWithPlayer[];
      } catch {
        // Network failure — rounds stays empty
      }
    }
  } else if (userRole === 'player' && player) {
    let inProgressData: typeof inProgressRounds = [];
    try {
      const [completedResult, inProgressResult] = await Promise.all([
        supabase
          .from('golf_rounds')
          .select(playerSelectFields)
          .eq('player_id', player.id)
          .eq('status', 'completed')
          .order('round_date', { ascending: false })
          .limit(50),
        supabase
          .from('golf_rounds')
          .select(inProgressSelectFields)
          .eq('player_id', player.id)
          .eq('status', 'in_progress')
          .order('updated_at', { ascending: false })
      ]);

      rounds = (completedResult.data ?? []).map(r => ({
        ...r,
        player: r.player && !('error' in r.player) ? r.player : null
      })) as RoundWithPlayer[];

      inProgressData = (inProgressResult.data ?? []) as typeof inProgressRounds;
    } catch {
      // Network failure — both stay empty
    }

    // Show ALL in-progress rounds (including setup-only drafts without shots)
    inProgressRounds = (inProgressData ?? []).map(r => ({
      ...r,
      player: r.player && !('error' in r.player) ? r.player : null
    })) as RoundWithPlayer[];
  }

  // Calculate round statistics summary — normalize 9-hole rounds to 18-hole equivalents
  const roundStats = (() => {
    if (rounds.length === 0) return null;
    type RoundWithHoles = typeof rounds[number] & { holes_played?: number | null };
    const scoredRounds = (rounds as RoundWithHoles[]).filter(r => r.total_score !== null && r.total_score > 0);
    const toParScores = rounds.map(r => r.score_to_par).filter((s): s is number => s !== null);
    if (scoredRounds.length === 0) return null;

    // Normalize scoring to 18-hole equivalent
    let totalStrokes = 0;
    let totalHoles = 0;
    const normalizedScores: number[] = [];
    for (const r of scoredRounds) {
      const hp = r.holes_played ?? 18;
      if (hp <= 0) continue;
      totalStrokes += r.total_score!;
      totalHoles += hp;
      normalizedScores.push(Math.round(r.total_score! * (18 / hp)));
    }
    const avg = totalHoles > 0 ? (totalStrokes / totalHoles) * 18 : 0;
    const best = Math.min(...normalizedScores);
    const avgToPar = toParScores.length > 0 ? toParScores.reduce((a, b) => a + b, 0) / toParScores.length : null;
    const underParCount = toParScores.filter(s => s < 0).length;
    const underParPct = toParScores.length > 0 ? Math.round((underParCount / toParScores.length) * 100) : 0;

    // Trend: compare last 5 vs previous 5 using normalized scores
    let trend: 'improving' | 'declining' | 'stable' | null = null;
    if (normalizedScores.length >= 6) {
      const recent5 = normalizedScores.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
      const prev5 = normalizedScores.slice(5, 10).reduce((a, b) => a + b, 0) / Math.min(5, normalizedScores.length - 5);
      if (recent5 < prev5 - 0.5) trend = 'improving';
      else if (recent5 > prev5 + 0.5) trend = 'declining';
      else trend = 'stable';
    }

    return { avg, best, avgToPar, underParPct, totalRounds: scoredRounds.length, trend };
  })();

  const hasUnfinished = inProgressRounds.length > 0 && userRole === 'player';

  return (
    <AnimatedPage className="min-h-full">
      {/* Header Section */}
      <AnimatedItem>
        <LargeTitleHeader
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
        </LargeTitleHeader>
      </AnimatedItem>

      {/* Main Content */}
      <AnimatedItem>
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-4 md:py-6">
          {/* Stats Summary Cards */}
          {roundStats && rounds.length >= 3 && (
            <div className="mb-6 grid grid-cols-2 md:grid-cols-5 gap-2">
              {/* Total Rounds */}
              <div className="relative surface-matte rounded-3xl overflow-clip p-4 md:p-5">
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-6 h-6 rounded-md bg-warm-100 flex items-center justify-center">
                      <IconGolf size={14} className="text-warm-500" />
                    </div>
                  </div>
                  <p className="text-[28px] md:text-[32px] font-light text-warm-900 tabular-nums tracking-[-0.025em]">{roundStats.totalRounds}</p>
                  <p className="text-xs text-warm-400 font-medium uppercase tracking-wider mt-0.5">Rounds</p>
                </div>
              </div>

              {/* Avg Score */}
              <div className="relative surface-matte rounded-3xl overflow-clip p-4 md:p-5">
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-6 h-6 rounded-md bg-warm-100 flex items-center justify-center">
                      <IconFlag size={14} className="text-warm-500" />
                    </div>
                  </div>
                  <p className="text-[28px] md:text-[32px] font-light text-warm-900 tabular-nums tracking-[-0.025em]">{roundStats.avg.toFixed(1)}</p>
                  <p className="text-xs text-warm-400 font-medium uppercase tracking-wider mt-0.5">Avg Score</p>
                </div>
              </div>

              {/* Best Round */}
              <div className="relative surface-matte rounded-3xl overflow-clip p-4 md:p-5">
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-6 h-6 rounded-md bg-primary-50 flex items-center justify-center">
                      <IconTrophy size={14} className="text-primary-600" />
                    </div>
                  </div>
                  <p className={cn(
                    'text-[28px] md:text-[32px] font-light tabular-nums tracking-[-0.025em]',
                    roundStats.best < 72 ? 'text-primary-600' : 'text-warm-900'
                  )}>{roundStats.best}</p>
                  <p className="text-xs text-warm-400 font-medium uppercase tracking-wider mt-0.5">Best Round</p>
                </div>
              </div>

              {/* Avg to Par */}
              <div className="relative surface-matte rounded-3xl overflow-clip p-4 md:p-5">
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className={cn(
                      'w-6 h-6 rounded-md flex items-center justify-center',
                      roundStats.avgToPar !== null && roundStats.avgToPar < 0 ? 'bg-primary-50' : 'bg-warm-100'
                    )}>
                      {roundStats.avgToPar !== null && roundStats.avgToPar < 0
                        ? <IconTrendingDown size={14} className="text-primary-600" />
                        : <IconTrendingUp size={14} className="text-warm-500" />
                      }
                    </div>
                  </div>
                  <p className={cn(
                    'text-[28px] md:text-[32px] font-light tabular-nums tracking-[-0.025em]',
                    roundStats.avgToPar !== null && roundStats.avgToPar < 0 ? 'text-primary-600' : 'text-warm-900'
                  )}>
                    {roundStats.avgToPar !== null
                      ? `${roundStats.avgToPar >= 0 ? '+' : ''}${roundStats.avgToPar.toFixed(1)}`
                      : '--'
                    }
                  </p>
                  <p className="text-xs text-warm-400 font-medium uppercase tracking-wider mt-0.5">Avg to Par</p>
                </div>
              </div>

              {/* Under Par % + Trend */}
              <div className="relative surface-matte rounded-3xl overflow-clip p-4 md:p-5 col-span-2 md:col-span-1">
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-1.5">
                    {roundStats.trend && (
                      <span className={cn(
                        'text-xs font-medium px-2 py-0.5 rounded-full',
                        roundStats.trend === 'improving' ? 'text-primary-700 bg-primary-100' :
                        roundStats.trend === 'declining' ? 'text-red-600 bg-red-50' :
                        'text-warm-500 bg-warm-100'
                      )}>
                        {roundStats.trend === 'improving' ? 'Improving' :
                         roundStats.trend === 'declining' ? 'Declining' :
                         'Stable'}
                      </span>
                    )}
                  </div>
                  <p className="text-[28px] md:text-[32px] font-light tabular-nums tracking-[-0.025em] text-warm-900">
                    {roundStats.underParPct}%
                  </p>
                  <p className="text-xs text-warm-400 font-medium uppercase tracking-wider mt-0.5">Under Par</p>
                </div>
              </div>
            </div>
          )}

          {rounds.length === 0 && inProgressRounds.length === 0 ? (
            /* Empty State */
            <div className="relative surface-matte rounded-3xl overflow-clip py-20 px-8 text-center">
              <div className="relative z-10">
                <div className="w-16 h-16 rounded-2xl bg-primary-50/65 flex items-center justify-center mx-auto mb-6">
                  <IconGolf size={26} className="text-primary-700" />
                </div>
                <h3 className="text-[26px] md:text-[30px] font-light tracking-[-0.025em] text-warm-900 mb-2.5">No rounds yet</h3>
                <p className="text-warm-500 mb-8 max-w-sm mx-auto leading-relaxed">
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
          ) : (
            /* Two-Column Layout: Recent Rounds + Unfinished Rounds */
            <div className={cn(
              'grid gap-6',
              hasUnfinished ? 'md:grid-cols-[3fr_2fr]' : 'grid-cols-1'
            )}>
              {/* Mobile: Unfinished first */}
              {hasUnfinished && (
                <div className="md:hidden">
                  <UnfinishedRoundsSection rounds={inProgressRounds} />
                </div>
              )}

              {/* Left Column: Recent Rounds grouped by month */}
              {rounds.length > 0 && (
                <div className="space-y-5">
                  {(() => {
                    // Group rounds by month
                    const grouped = rounds.reduce((acc, round) => {
                      const key = new Date(round.round_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                      if (!acc[key]) acc[key] = [];
                      acc[key].push(round);
                      return acc;
                    }, {} as Record<string, typeof rounds>);

                    return Object.entries(grouped).map(([monthYear, monthRounds]) => (
                      <div key={monthYear}>
                        {/* Month divider */}
                        <div className="flex items-center gap-3 mb-2.5">
                          <span className="text-[11px] font-medium text-warm-400 uppercase tracking-[0.12em] opacity-80">{monthYear}</span>
                          <div className="h-px flex-1 bg-warm-200/60" />
                        </div>

                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
                          {monthRounds.map((round) => {
                            const playerName = round.player
                              ? `${round.player.first_name || ''} ${round.player.last_name || ''}`.trim()
                              : 'Unknown Player';
                            const avatarUrl = round.player?.avatar_url || null;
                            const scoreToPar = round.score_to_par || 0;
                            const roundTypeMeta = getRoundTypeMeta(round.round_type);
                            const holesPlayed = (round as RoundWithPlayer & { holes_played?: number | null }).holes_played ?? 18;
                            const roundDate = new Date(round.round_date);
                            const dayNum = roundDate.getDate();
                            const daySuffix = [11,12,13].includes(dayNum) ? 'th' : dayNum % 10 === 1 ? 'st' : dayNum % 10 === 2 ? 'nd' : dayNum % 10 === 3 ? 'rd' : 'th';
                            const dayStr = `${dayNum}${daySuffix}`;

                            // Color accent based on performance
                            const accentColor = scoreToPar < 0
                              ? 'bg-primary-500'
                              : scoreToPar === 0
                                ? 'bg-blue-400'
                                : 'bg-amber-400';

                            return (
                              <Link key={round.id} href={`/golf/dashboard/rounds/${round.id}`}>
                                <div className="group relative rounded-xl overflow-clip hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 bg-white border border-warm-200/80 shadow-sm">
                                  {/* Left accent stripe */}
                                  <div className={cn('absolute left-0 top-0 bottom-0 w-1', accentColor)} />

                                  <div className="relative z-10 pl-3.5 pr-3 py-2.5">
                                    {/* Top: type + day */}
                                    <div className="flex items-center justify-between mb-1.5">
                                      <span className={cn(
                                        'px-1.5 py-px text-[10px] font-medium rounded capitalize border',
                                        roundTypeMeta.bg, roundTypeMeta.text, roundTypeMeta.border
                                      )}>
                                        {roundTypeMeta.label}
                                      </span>
                                      <span className="text-[11px] font-medium text-warm-400">{dayStr}</span>
                                    </div>

                                    {/* Score row */}
                                    {userRole === 'coach' ? (
                                      <div className="flex items-center gap-2.5 mb-1.5">
                                        <Avatar
                                          src={avatarUrl}
                                          name={playerName}
                                          size="sm"
                                          className="flex-shrink-0"
                                        />
                                        <div className="min-w-0 flex-1">
                                          <p className="text-sm font-medium text-warm-900 truncate group-hover:text-primary-600 transition-colors leading-tight">
                                            {playerName}
                                          </p>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                          <p className={cn(
                                            'text-[20px] font-medium tracking-[-0.012em] tabular-nums leading-none',
                                            scoreToPar < 0 ? 'text-primary-600' : 'text-warm-800'
                                          )}>
                                            {round.total_score || '--'}
                                          </p>
                                          <p className={cn(
                                            'text-[10px] font-medium tabular-nums mt-0.5',
                                            scoreToPar < 0 ? 'text-primary-500' : scoreToPar === 0 ? 'text-blue-500' : 'text-amber-500'
                                          )}>
                                            {scoreToPar === 0 ? 'E' : scoreToPar > 0 ? `+${scoreToPar}` : scoreToPar}
                                          </p>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex items-baseline gap-2 mb-1.5">
                                        <p className={cn(
                                          'text-[30px] md:text-[34px] font-light tabular-nums tracking-[-0.025em] leading-none',
                                          scoreToPar < 0 ? 'text-primary-600' : 'text-warm-800'
                                        )}>
                                          {round.total_score || '--'}
                                        </p>
                                        <span className={cn(
                                          'px-1.5 py-px rounded text-[11px] font-medium tabular-nums',
                                          scoreToPar < 0 ? 'bg-primary-100 text-primary-700' : scoreToPar === 0 ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-700'
                                        )}>
                                          {scoreToPar === 0 ? 'E' : scoreToPar > 0 ? `+${scoreToPar}` : scoreToPar}
                                        </span>
                                      </div>
                                    )}

                                    {/* Bottom: course + holes */}
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-xs font-medium text-warm-600 truncate group-hover:text-primary-600 transition-colors">
                                        {round.course_name}
                                      </p>
                                      <span className="text-[10px] text-warm-400 flex-shrink-0">{holesPlayed}h</span>
                                    </div>
                                  </div>
                                </div>
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              )}

              {/* Right Column: Unfinished Rounds (desktop only, player only) */}
              {hasUnfinished && (
                <div className="hidden md:block">
                  <UnfinishedRoundsSection rounds={inProgressRounds} />
                </div>
              )}
            </div>
          )}
        </div>
      </AnimatedItem>
    </AnimatedPage>
  );
}

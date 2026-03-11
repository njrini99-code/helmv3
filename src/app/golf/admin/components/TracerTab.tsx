'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  BarChart3,
  CircleDot,
  RefreshCw,
  Filter,
  ArrowUpDown,
} from 'lucide-react';
import { AdminStatCard } from './AdminStatCard';
import { SectionHeader } from '@/components/golf/dashboard/premium-components';
import { timeAgo, formatDate } from './admin-utils';
import {
  getTracerData,
  type TracerData,
  type TracerPlayerSummary,
  type TracerRoundDetail,
  type TracerStatsAccuracy,
  type TracerErrorLog,
  type TracerActivityEvent,
} from '@/app/golf/actions/admin-tracer-data';

// ============================================================================
// SORT HELPERS
// ============================================================================

type PlayerSortKey = 'name' | 'total' | 'completed' | 'in_progress' | 'rate' | 'last_activity';
type StatsSortKey = 'name' | 'rounds' | 'scoring' | 'putts' | 'fairway' | 'gir' | 'stale';
type ActivityFilter = 'all' | 'round_started' | 'round_completed' | 'round_error' | 'detail_warning';

function sortIndicator(active: boolean, asc: boolean) {
  if (!active) return <ArrowUpDown size={12} className="text-warm-300 opacity-0 group-hover/th:opacity-100 transition-opacity" />;
  return <span className="text-primary-600 font-bold text-[10px]">{asc ? '↑' : '↓'}</span>;
}

// ============================================================================
// TRACER TAB
// ============================================================================

export function TracerTab() {
  const [data, setData] = useState<TracerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Player table sort
  const [playerSort, setPlayerSort] = useState<PlayerSortKey>('total');
  const [playerSortAsc, setPlayerSortAsc] = useState(false);
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);

  // Stats accuracy sort
  const [statsSort, setStatsSort] = useState<StatsSortKey>('scoring');
  const [statsSortAsc, setStatsSortAsc] = useState(true);

  // Activity feed filter
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');

  // Error feed
  const [expandedError, setExpandedError] = useState<string | null>(null);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const result = await getTracerData();
      setData(result);
      setError(null);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tracer data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData(true), 60000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Sorted player summaries
  const sortedPlayers = useMemo(() => {
    if (!data) return [];
    return [...data.playerSummaries].sort((a, b) => {
      const dir = playerSortAsc ? 1 : -1;
      switch (playerSort) {
        case 'name': return dir * ((a.last_name ?? '').localeCompare(b.last_name ?? ''));
        case 'total': return dir * (a.total_rounds - b.total_rounds);
        case 'completed': return dir * (a.completed_rounds - b.completed_rounds);
        case 'in_progress': return dir * (a.in_progress_rounds - b.in_progress_rounds);
        case 'rate': {
          const rA = a.total_rounds > 0 ? a.completed_rounds / a.total_rounds : 0;
          const rB = b.total_rounds > 0 ? b.completed_rounds / b.total_rounds : 0;
          return dir * (rA - rB);
        }
        case 'last_activity': return dir * ((a.last_activity ?? '').localeCompare(b.last_activity ?? ''));
        default: return 0;
      }
    });
  }, [data, playerSort, playerSortAsc]);

  // Sorted stats accuracy
  const sortedStats = useMemo(() => {
    if (!data) return [];
    return [...data.statsAccuracy].sort((a, b) => {
      const dir = statsSortAsc ? 1 : -1;
      switch (statsSort) {
        case 'name': return dir * ((a.last_name ?? '').localeCompare(b.last_name ?? ''));
        case 'rounds': return dir * (a.cached_rounds - b.cached_rounds);
        case 'scoring': {
          const diff = (v: TracerStatsAccuracy) =>
            v.cached_scoring_avg != null && v.live_scoring_avg != null
              ? Math.abs(v.cached_scoring_avg - v.live_scoring_avg) : 0;
          return dir * (diff(a) - diff(b));
        }
        case 'putts': return dir * ((a.cached_putts_per_round ?? 0) - (b.cached_putts_per_round ?? 0));
        case 'fairway': return dir * ((a.cached_fairway_pct ?? 0) - (b.cached_fairway_pct ?? 0));
        case 'gir': return dir * ((a.cached_gir_pct ?? 0) - (b.cached_gir_pct ?? 0));
        case 'stale': return dir * ((a.is_stale ? 1 : 0) - (b.is_stale ? 1 : 0));
        default: return 0;
      }
    });
  }, [data, statsSort, statsSortAsc]);

  // Filtered activity feed
  const filteredActivity = useMemo(() => {
    if (!data) return [];
    if (activityFilter === 'all') return data.activityFeed;
    return data.activityFeed.filter((e) => e.type === activityFilter);
  }, [data, activityFilter]);

  function handlePlayerSort(key: PlayerSortKey) {
    if (playerSort === key) setPlayerSortAsc((p) => !p);
    else { setPlayerSort(key); setPlayerSortAsc(key === 'name'); }
  }

  function handleStatsSort(key: StatsSortKey) {
    if (statsSort === key) setStatsSortAsc((p) => !p);
    else { setStatsSort(key); setStatsSortAsc(true); }
  }

  if (loading) return <TracerSkeleton />;
  if (error) return (
    <div className="bg-red-50/80 backdrop-blur-sm border border-red-200 rounded-2xl p-8 text-center">
      <XCircle className="mx-auto mb-3 text-red-400" size={28} />
      <p className="text-warm-900 font-semibold">Failed to load tracer data</p>
      <p className="text-warm-500 text-sm mt-1 max-w-md mx-auto">{error}</p>
      <button
        onClick={() => loadData()}
        className="mt-4 px-5 py-2.5 bg-white/90 border border-warm-200 rounded-xl text-sm font-medium hover:bg-white hover:shadow-sm transition-all"
      >
        Try again
      </button>
    </div>
  );
  if (!data) return null;

  const totalRounds = data.playerSummaries.reduce((sum, p) => sum + p.total_rounds, 0);
  const completedRounds = data.playerSummaries.reduce((sum, p) => sum + p.completed_rounds, 0);
  const completionRate = totalRounds > 0 ? Math.round((completedRounds / totalRounds) * 100) : 0;
  const statsMismatches = data.statsAccuracy.filter((s) => {
    if (s.cached_scoring_avg != null && s.live_scoring_avg != null) {
      return Math.abs(s.cached_scoring_avg - s.live_scoring_avg) > 0.5;
    }
    return s.cached_rounds !== s.live_rounds;
  }).length;

  return (
    <div className="space-y-8">
      {/* Live Status Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
          </span>
          <span className="text-xs font-medium text-warm-500">
            Live · refreshes every 60s
          </span>
          {lastRefresh && (
            <span className="text-xs text-warm-400">
              · last {timeAgo(lastRefresh.toISOString())}
            </span>
          )}
        </div>
        <button
          onClick={() => loadData(true)}
          disabled={refreshing}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
            'bg-white/60 border border-white/30 text-warm-500 hover:bg-white/80 hover:text-warm-700',
            refreshing && 'opacity-60 cursor-not-allowed'
          )}
        >
          <RefreshCw size={12} className={cn(refreshing && 'animate-spin')} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <AdminStatCard
          label="Total Rounds"
          value={totalRounds}
          icon={<CircleDot size={20} />}
          detail={`${completedRounds} completed`}
          accentColor="green"
        />
        <AdminStatCard
          label="Completion Rate"
          value={`${completionRate}%`}
          icon={<CheckCircle2 size={20} />}
          accentColor={completionRate >= 80 ? 'green' : completionRate >= 50 ? 'amber' : 'red'}
          detail={`${totalRounds - completedRounds} incomplete`}
        />
        <AdminStatCard
          label="Errors (7d)"
          value={data.errorStats.total7d}
          icon={<AlertTriangle size={20} />}
          accentColor={data.errorStats.critical7d > 0 ? 'red' : data.errorStats.total7d > 0 ? 'amber' : 'green'}
          detail={data.errorStats.critical7d > 0 ? `${data.errorStats.critical7d} critical` : 'No critical'}
        />
        <AdminStatCard
          label="Stats Mismatches"
          value={statsMismatches}
          icon={<BarChart3 size={20} />}
          accentColor={statsMismatches > 0 ? 'amber' : 'green'}
          detail={statsMismatches > 0 ? 'Cache vs live differ' : 'All in sync'}
        />
      </div>

      {/* Activity Feed */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <SectionHeader title="Activity Feed" className="!mb-0" />
          <div className="flex items-center gap-1">
            <Filter size={12} className="text-warm-400 mr-1" />
            {([
              ['all', 'All'],
              ['round_completed', 'Completed'],
              ['round_started', 'Started'],
              ['round_error', 'Errors'],
              ['detail_warning', 'Warnings'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActivityFilter(key)}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all',
                  activityFilter === key
                    ? 'bg-warm-900 text-white shadow-sm'
                    : 'text-warm-400 hover:text-warm-600 hover:bg-white/50'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="bg-white/65 backdrop-blur-[16px] border border-white/30 rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] overflow-clip">
          {filteredActivity.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-warm-400 text-sm">No {activityFilter === 'all' ? '' : activityFilter.replace('_', ' ')} activity</p>
            </div>
          ) : (
            <div className="divide-y divide-warm-100/50 max-h-[380px] overflow-y-auto">
              {filteredActivity.map((event, i) => (
                <ActivityRow key={`${event.timestamp}-${event.type}-${i}`} event={event} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Player Summary Table */}
      <section>
        <SectionHeader title="Player Round Tracking" />
        <div className="bg-white/65 backdrop-blur-[16px] border border-white/30 rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] overflow-clip">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-warm-100/80">
                  <th className="w-10 px-3 py-3.5" />
                  <SortableTh label="Player" sortKey="name" currentKey={playerSort} asc={playerSortAsc} onSort={handlePlayerSort} align="left" />
                  <SortableTh label="Started" sortKey="total" currentKey={playerSort} asc={playerSortAsc} onSort={handlePlayerSort} />
                  <SortableTh label="Done" sortKey="completed" currentKey={playerSort} asc={playerSortAsc} onSort={handlePlayerSort} />
                  <SortableTh label="Active" sortKey="in_progress" currentKey={playerSort} asc={playerSortAsc} onSort={handlePlayerSort} />
                  <SortableTh label="Rate" sortKey="rate" currentKey={playerSort} asc={playerSortAsc} onSort={handlePlayerSort} />
                  <SortableTh label="Last Activity" sortKey="last_activity" currentKey={playerSort} asc={playerSortAsc} onSort={handlePlayerSort} align="left" />
                </tr>
              </thead>
              <tbody>
                {sortedPlayers.map((player) => {
                  const isExpanded = expandedPlayer === player.player_id;
                  const rounds = data.roundDetails[player.player_id] || [];
                  const sortedRounds = [...rounds].sort((a, b) =>
                    (b.updated_at ?? '').localeCompare(a.updated_at ?? '')
                  );
                  const rate = player.total_rounds > 0
                    ? Math.round((player.completed_rounds / player.total_rounds) * 100) : 0;

                  return (
                    <PlayerRow
                      key={player.player_id}
                      player={player}
                      rounds={sortedRounds}
                      rate={rate}
                      isExpanded={isExpanded}
                      onToggle={() => setExpandedPlayer(isExpanded ? null : player.player_id)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Stats Accuracy */}
      {data.statsAccuracy.length > 0 && (
        <section>
          <SectionHeader title="Stats Accuracy Check" />
          <div className="bg-white/65 backdrop-blur-[16px] border border-white/30 rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] overflow-clip">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-warm-100/80">
                    <SortableTh label="Player" sortKey="name" currentKey={statsSort} asc={statsSortAsc} onSort={handleStatsSort} align="left" />
                    <SortableTh label="Rounds" sortKey="rounds" currentKey={statsSort} asc={statsSortAsc} onSort={handleStatsSort} />
                    <SortableTh label="Scoring Avg" sortKey="scoring" currentKey={statsSort} asc={statsSortAsc} onSort={handleStatsSort} />
                    <SortableTh label="Putts/Rnd" sortKey="putts" currentKey={statsSort} asc={statsSortAsc} onSort={handleStatsSort} />
                    <SortableTh label="Fairway %" sortKey="fairway" currentKey={statsSort} asc={statsSortAsc} onSort={handleStatsSort} />
                    <SortableTh label="GIR %" sortKey="gir" currentKey={statsSort} asc={statsSortAsc} onSort={handleStatsSort} />
                    <SortableTh label="Cache" sortKey="stale" currentKey={statsSort} asc={statsSortAsc} onSort={handleStatsSort} />
                  </tr>
                </thead>
                <tbody>
                  {sortedStats.map((stat) => (
                    <StatsAccuracyRow key={stat.player_id} stat={stat} />
                  ))}
                </tbody>
              </table>
            </div>
            {/* Legend */}
            <div className="px-5 py-3 border-t border-warm-100/50 flex items-center gap-4 text-[11px] text-warm-400">
              <span>Format: <span className="font-medium text-warm-500">cached</span> <span className="text-warm-300">/</span> <span className="text-warm-400">live</span></span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-red-400" />
                Mismatch &gt; 0.5
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />
                Stale cache
              </span>
            </div>
          </div>
        </section>
      )}

      {/* Error Feed */}
      <section>
        <SectionHeader title="Shot Tracking Errors" />
        <div className="bg-white/65 backdrop-blur-[16px] border border-white/30 rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] overflow-clip">
          {data.recentErrors.length === 0 ? (
            <div className="p-10 text-center">
              <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="text-green-500" size={20} />
              </div>
              <p className="text-warm-700 font-medium text-sm">No shot tracking errors</p>
              <p className="text-warm-400 text-xs mt-1">All round submissions are clean</p>
            </div>
          ) : (
            <div className="divide-y divide-warm-100/50">
              {data.recentErrors.map((err) => (
                <ErrorRow
                  key={err.id}
                  error={err}
                  isExpanded={expandedError === err.id}
                  onToggle={() => setExpandedError(expandedError === err.id ? null : err.id)}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ============================================================================
// SORTABLE TABLE HEADER
// ============================================================================

function SortableTh<K extends string>({
  label,
  sortKey,
  currentKey,
  asc,
  onSort,
  align = 'center',
}: {
  label: string;
  sortKey: K;
  currentKey: K;
  asc: boolean;
  onSort: (key: K) => void;
  align?: 'left' | 'center';
}) {
  const active = currentKey === sortKey;
  return (
    <th
      className={cn(
        'px-4 py-3.5 font-medium text-[11px] uppercase tracking-wider cursor-pointer select-none group/th',
        'transition-colors hover:text-warm-700',
        active ? 'text-warm-700' : 'text-warm-400',
        align === 'center' && 'text-center'
      )}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortIndicator(active, asc)}
      </span>
    </th>
  );
}

// ============================================================================
// PLAYER ROW (EXPANDABLE)
// ============================================================================

function PlayerRow({
  player,
  rounds,
  rate,
  isExpanded,
  onToggle,
}: {
  player: TracerPlayerSummary;
  rounds: TracerRoundDetail[];
  rate: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const hasIssues = player.in_progress_rounds > 0 || rate < 80;

  return (
    <>
      <tr
        className={cn(
          'border-b border-warm-50/80 cursor-pointer transition-colors',
          isExpanded ? 'bg-warm-50/40' : 'hover:bg-white/50'
        )}
        onClick={onToggle}
      >
        <td className="px-3 py-3.5">
          <div className={cn(
            'w-5 h-5 rounded-md flex items-center justify-center transition-colors',
            isExpanded ? 'bg-warm-200/50' : 'bg-transparent'
          )}>
            {isExpanded ? (
              <ChevronDown size={14} className="text-warm-500" />
            ) : (
              <ChevronRight size={14} className="text-warm-400" />
            )}
          </div>
        </td>
        <td className="px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0',
              hasIssues ? 'bg-amber-50 text-amber-700' : 'bg-primary-50 text-primary-700'
            )}>
              {(player.first_name?.[0] ?? '')}{(player.last_name?.[0] ?? '')}
            </div>
            <span className="font-medium text-warm-900">
              {player.first_name} {player.last_name}
            </span>
          </div>
        </td>
        <td className="px-4 py-3.5 text-center tabular-nums text-warm-700">{player.total_rounds}</td>
        <td className="px-4 py-3.5 text-center tabular-nums font-medium text-green-600">{player.completed_rounds}</td>
        <td className="px-4 py-3.5 text-center tabular-nums">
          {player.in_progress_rounds > 0 ? (
            <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              {player.in_progress_rounds}
            </span>
          ) : (
            <span className="text-warm-300">0</span>
          )}
        </td>
        <td className="px-4 py-3.5 text-center">
          <span className={cn(
            'inline-flex px-2.5 py-1 rounded-full text-[11px] font-semibold tabular-nums',
            rate >= 80 ? 'bg-green-50 text-green-700' :
            rate >= 50 ? 'bg-amber-50 text-amber-700' :
            'bg-red-50 text-red-700'
          )}>
            {rate}%
          </span>
        </td>
        <td className="px-4 py-3.5 text-warm-500 text-xs">
          {timeAgo(player.last_activity)}
        </td>
      </tr>
      {isExpanded && rounds.length > 0 && (
        <tr>
          <td colSpan={7} className="bg-warm-50/30 px-4 py-4">
            <div className="ml-10 space-y-1.5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[11px] font-semibold text-warm-500 uppercase tracking-wider">
                  Round History
                </span>
                <span className="text-[11px] text-warm-400">
                  {rounds.length} round{rounds.length !== 1 ? 's' : ''} · newest first
                </span>
              </div>
              {rounds.map((round) => (
                <RoundDetailCard key={round.round_id} round={round} />
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ============================================================================
// ROUND DETAIL CARD
// ============================================================================

function RoundDetailCard({ round }: { round: TracerRoundDetail }) {
  const isComplete = round.status === 'completed';
  const isInProgress = round.status === 'in_progress';
  const holesMatch = round.actual_holes === round.expected_holes;

  // Status checks — clear yes/no for every pipeline step
  const checks = [
    { label: 'Holes', ok: round.actual_holes > 0, detail: `${round.actual_holes}/${round.expected_holes}` },
    { label: 'Shots', ok: round.total_shots > 0, detail: `${round.total_shots}` },
    { label: 'Submitted', ok: isComplete, detail: isComplete ? 'Yes' : isInProgress ? 'No' : 'Draft' },
    { label: 'Putts', ok: round.has_putts, detail: round.has_putts ? 'Yes' : 'No' },
    { label: 'FW', ok: round.has_fairways, detail: round.has_fairways ? 'Yes' : 'No' },
    { label: 'GIR', ok: round.has_gir, detail: round.has_gir ? 'Yes' : 'No' },
    { label: 'Putt Details', ok: round.putt_details_count > 0, detail: `${round.putt_details_count}` },
    { label: 'Appr Details', ok: round.approach_details_count > 0, detail: `${round.approach_details_count}` },
    { label: 'Stats Cached', ok: round.stats_cached, detail: round.stats_cached ? 'Yes' : 'No' },
    { label: 'SG', ok: round.has_strokes_gained, detail: round.has_strokes_gained ? 'Yes' : 'No' },
  ];

  const allGood = checks.every((c) => c.ok);
  const issueCount = checks.filter((c) => !c.ok && isComplete).length;

  return (
    <div className={cn(
      'rounded-xl text-sm overflow-clip',
      isComplete
        ? allGood ? 'bg-white/70 border border-green-200/30' : 'bg-white/70 border border-amber-200/40'
        : isInProgress
          ? 'bg-amber-50/30 border border-amber-200/30'
          : 'bg-warm-100/20 border border-warm-200/30'
    )}>
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-shrink-0">
          {isComplete ? (
            allGood
              ? <CheckCircle2 size={15} className="text-green-500" />
              : <AlertTriangle size={15} className="text-amber-500" />
          ) : isInProgress ? (
            <Clock size={15} className="text-amber-500" />
          ) : (
            <CircleDot size={15} className="text-warm-400" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <span className="font-medium text-warm-900">{round.course_name || 'Untitled'}</span>
          {round.round_date && (
            <span className="text-warm-400 ml-2 text-xs">{formatDate(round.round_date)}</span>
          )}
          <span className="text-warm-300 ml-2 text-[10px]">
            {round.expected_holes}h
          </span>
        </div>

        {/* Score */}
        {round.total_score != null && (
          <div className="flex-shrink-0 text-right">
            <span className="text-warm-800 font-bold tabular-nums text-base">{round.total_score}</span>
            {round.score_to_par != null && (
              <span className={cn(
                'ml-1 text-xs font-semibold',
                round.score_to_par > 0 ? 'text-red-500' : round.score_to_par < 0 ? 'text-green-600' : 'text-warm-400'
              )}>
                {round.score_to_par > 0 ? '+' : ''}{round.score_to_par}
              </span>
            )}
          </div>
        )}

        {/* Issue count badge */}
        {isComplete && issueCount > 0 && (
          <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700">
            {issueCount} issue{issueCount !== 1 ? 's' : ''}
          </span>
        )}
        {isComplete && allGood && (
          <span className="flex-shrink-0 text-[10px] font-semibold text-green-600">All clear</span>
        )}
      </div>

      {/* Status checklist grid */}
      <div className="px-4 pb-3 pt-0">
        <div className="ml-7 flex flex-wrap gap-x-1 gap-y-1">
          {checks.map((check) => (
            <span
              key={check.label}
              title={`${check.label}: ${check.detail}`}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium',
                check.ok
                  ? 'bg-green-50/70 text-green-700'
                  : isComplete
                    ? 'bg-red-50/70 text-red-600'
                    : 'bg-warm-100/50 text-warm-400'
              )}
            >
              {check.ok ? (
                <CheckCircle2 size={10} className="flex-shrink-0" />
              ) : isComplete ? (
                <XCircle size={10} className="flex-shrink-0" />
              ) : (
                <CircleDot size={10} className="flex-shrink-0" />
              )}
              {check.label}
              {(!check.ok || check.detail !== 'Yes') && check.detail !== 'No' && (
                <span className="opacity-70">{check.detail}</span>
              )}
            </span>
          ))}
          {!holesMatch && isComplete && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-red-50/70 text-red-600">
              <XCircle size={10} /> Holes mismatch
            </span>
          )}
        </div>
      </div>

      {/* Inline errors */}
      {round.errors.length > 0 && (
        <div className="px-4 pb-3 pt-0">
          <div className="ml-7 space-y-1">
            {round.errors.map((err) => (
              <div key={err.id} className="flex items-start gap-2 text-xs text-red-600 bg-red-50/50 px-3 py-1.5 rounded-lg">
                <span className="font-bold uppercase text-[9px] bg-red-100 text-red-700 px-1 py-0.5 rounded flex-shrink-0 mt-px">
                  {err.severity}
                </span>
                <span className="min-w-0 break-words">{err.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// STATS ACCURACY ROW
// ============================================================================

function StatsAccuracyRow({ stat }: { stat: TracerStatsAccuracy }) {
  const roundsMismatch = stat.cached_rounds !== stat.live_rounds;
  const scoringMismatch = stat.cached_scoring_avg != null && stat.live_scoring_avg != null
    && Math.abs(stat.cached_scoring_avg - stat.live_scoring_avg) > 0.5;
  const puttsMismatch = stat.cached_putts_per_round != null && stat.live_putts_per_round != null
    && Math.abs(stat.cached_putts_per_round - stat.live_putts_per_round) > 0.5;
  const fwMismatch = stat.cached_fairway_pct != null && stat.live_fairway_pct != null
    && Math.abs(stat.cached_fairway_pct - stat.live_fairway_pct) > 1;
  const girMismatch = stat.cached_gir_pct != null && stat.live_gir_pct != null
    && Math.abs(stat.cached_gir_pct - stat.live_gir_pct) > 1;

  const anyMismatch = roundsMismatch || scoringMismatch || puttsMismatch || fwMismatch || girMismatch;

  return (
    <tr className={cn(
      'border-b border-warm-50/80 transition-colors',
      anyMismatch ? 'bg-red-50/10 hover:bg-red-50/20' : 'hover:bg-white/50'
    )}>
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-2">
          {anyMismatch && <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />}
          <span className="font-medium text-warm-900">{stat.first_name} {stat.last_name}</span>
        </div>
      </td>
      <td className="px-4 py-3.5 text-center">
        <CompareCell cached={stat.cached_rounds} live={stat.live_rounds} mismatch={roundsMismatch} />
      </td>
      <td className="px-4 py-3.5 text-center">
        <CompareCell cached={stat.cached_scoring_avg} live={stat.live_scoring_avg} mismatch={scoringMismatch} />
      </td>
      <td className="px-4 py-3.5 text-center">
        <CompareCell cached={stat.cached_putts_per_round} live={stat.live_putts_per_round} mismatch={puttsMismatch} />
      </td>
      <td className="px-4 py-3.5 text-center">
        <CompareCell
          cached={stat.cached_fairway_pct != null ? `${stat.cached_fairway_pct}%` : null}
          live={stat.live_fairway_pct != null ? `${stat.live_fairway_pct}%` : null}
          mismatch={fwMismatch}
        />
      </td>
      <td className="px-4 py-3.5 text-center">
        <CompareCell
          cached={stat.cached_gir_pct != null ? `${stat.cached_gir_pct}%` : null}
          live={stat.live_gir_pct != null ? `${stat.live_gir_pct}%` : null}
          mismatch={girMismatch}
        />
      </td>
      <td className="px-4 py-3.5 text-center">
        {stat.is_stale ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            Stale
          </span>
        ) : (
          <span className="text-[11px] text-warm-400">
            {timeAgo(stat.cache_updated_at)}
          </span>
        )}
      </td>
    </tr>
  );
}

// ============================================================================
// COMPARE CELL (cached / live)
// ============================================================================

function CompareCell({
  cached,
  live,
  mismatch,
}: {
  cached: string | number | null;
  live: string | number | null;
  mismatch?: boolean;
}) {
  const cachedStr = cached != null ? String(cached) : '—';
  const liveStr = live != null ? String(live) : '—';
  const hasMismatch = mismatch ?? false;

  if (live == null && cached == null) {
    return <span className="text-warm-300">—</span>;
  }

  if (live == null) {
    return <span className="text-warm-600 tabular-nums">{cachedStr}</span>;
  }

  return (
    <span className="tabular-nums">
      <span className={cn(
        'font-medium',
        hasMismatch ? 'text-red-600' : 'text-warm-700'
      )}>
        {cachedStr}
      </span>
      <span className="text-warm-300 mx-0.5">/</span>
      <span className={cn(
        hasMismatch ? 'text-red-400' : 'text-warm-400'
      )}>
        {liveStr}
      </span>
    </span>
  );
}

// ============================================================================
// ERROR ROW
// ============================================================================

function ErrorRow({
  error,
  isExpanded,
  onToggle,
}: {
  error: TracerErrorLog;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const sev = error.severity || 'error';

  const borderColors: Record<string, string> = {
    critical: 'border-l-red-500',
    error: 'border-l-red-400',
    warning: 'border-l-amber-400',
    info: 'border-l-blue-400',
  };

  const badgeColors: Record<string, string> = {
    critical: 'bg-red-100 text-red-800',
    error: 'bg-red-50 text-red-700',
    warning: 'bg-amber-50 text-amber-700',
    info: 'bg-blue-50 text-blue-700',
  };

  const ctx = error.context as Record<string, unknown> | null;
  const action = ctx?.action as string | undefined;
  const roundId = ctx?.roundId as string | undefined;
  const userEmail = ctx?.userEmail as string | undefined;
  const playerId = ctx?.playerId as string | undefined;

  return (
    <div
      className={cn(
        'border-l-[3px] px-5 py-3.5 cursor-pointer transition-colors',
        'hover:bg-white/40',
        borderColors[sev] || 'border-l-warm-300'
      )}
      onClick={onToggle}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={cn(
              'inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide',
              badgeColors[sev] || 'bg-warm-100 text-warm-600'
            )}>
              {sev}
            </span>
            {action && (
              <span className="text-[11px] text-warm-400 font-mono bg-warm-100/50 px-1.5 py-0.5 rounded">
                {action}
              </span>
            )}
            <span className="text-[11px] text-warm-400">
              {timeAgo(error.created_at)}
            </span>
          </div>
          <p className="text-sm text-warm-800 leading-relaxed">{error.message}</p>
          {(userEmail || playerId) && (
            <p className="text-[11px] text-warm-400 mt-1 font-mono">
              {userEmail || playerId}
            </p>
          )}
        </div>
        <div className="flex-shrink-0 pt-1">
          <div className={cn(
            'w-5 h-5 rounded-md flex items-center justify-center transition-colors',
            isExpanded ? 'bg-warm-200/50' : 'bg-transparent'
          )}>
            {isExpanded ? (
              <ChevronDown size={12} className="text-warm-500" />
            ) : (
              <ChevronRight size={12} className="text-warm-400" />
            )}
          </div>
        </div>
      </div>
      {isExpanded && ctx && (
        <div className="mt-3 p-4 bg-warm-900/[0.03] rounded-xl border border-warm-200/30">
          <pre className="text-[11px] text-warm-600 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
            {JSON.stringify(ctx, null, 2)}
          </pre>
          {roundId && (
            <div className="mt-3 pt-2.5 border-t border-warm-200/30 text-[11px] text-warm-500">
              Round: <span className="font-mono text-warm-600">{roundId}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ACTIVITY ROW
// ============================================================================

function ActivityRow({ event }: { event: TracerActivityEvent }) {
  const config: Record<string, { icon: typeof CheckCircle2; color: string; bg: string; label: string }> = {
    round_started: { icon: CircleDot, color: 'text-blue-500', bg: 'bg-blue-50', label: 'Started round' },
    round_completed: { icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-50', label: 'Completed round' },
    round_error: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50', label: 'Error on submit' },
    detail_warning: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50', label: 'Detail warning' },
  };

  const c = config[event.type] ?? config.round_started!;
  const Icon = c!.icon;

  return (
    <div className="flex items-start gap-3 px-5 py-3 hover:bg-white/40 transition-colors">
      {/* Icon */}
      <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5', c!.bg)}>
        <Icon size={14} className={c!.color} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="text-sm font-medium text-warm-900">{event.player_name}</span>
          <span className="text-xs text-warm-500">{c!.label}</span>
          {event.course_name && (
            <>
              <span className="text-warm-300 text-xs">at</span>
              <span className="text-xs text-warm-600">{event.course_name}</span>
            </>
          )}
          {event.score != null && (
            <span className="text-xs font-semibold text-warm-700 tabular-nums">
              {event.score}
              {event.score_to_par != null && (
                <span className={cn(
                  'ml-0.5',
                  event.score_to_par > 0 ? 'text-red-500' : event.score_to_par < 0 ? 'text-green-600' : 'text-warm-400'
                )}>
                  ({event.score_to_par > 0 ? '+' : ''}{event.score_to_par})
                </span>
              )}
            </span>
          )}
        </div>
        {event.error_message && (
          <p className="text-xs text-red-500 mt-1 leading-relaxed">{event.error_message}</p>
        )}
      </div>

      {/* Timestamp */}
      <span className="text-[11px] text-warm-400 flex-shrink-0 tabular-nums mt-0.5">
        {timeAgo(event.timestamp)}
      </span>
    </div>
  );
}

// ============================================================================
// SKELETON
// ============================================================================

function TracerSkeleton() {
  return (
    <div className="space-y-8">
      {/* Status bar skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-warm-200 animate-pulse" />
          <div className="w-32 h-3 rounded bg-warm-200/60 animate-pulse" />
        </div>
        <div className="w-20 h-7 rounded-lg bg-warm-200/40 animate-pulse" />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white/50 rounded-2xl border border-white/20 p-5 md:p-6 border-l-[3px] border-l-warm-200">
            <div className="w-24 h-3 rounded bg-warm-200/60 animate-pulse mb-3" />
            <div className="w-16 h-8 rounded bg-warm-200/60 animate-pulse mb-2" />
            <div className="w-20 h-3 rounded bg-warm-200/40 animate-pulse" />
          </div>
        ))}
      </div>

      {/* Activity feed */}
      <div>
        <div className="w-24 h-3 rounded bg-warm-200/60 animate-pulse mb-4" />
        <div className="bg-white/50 rounded-2xl border border-white/20 overflow-hidden">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3 border-b border-warm-50 last:border-0">
              <div className="w-7 h-7 rounded-lg bg-warm-200/40 animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="w-48 h-3.5 rounded bg-warm-200/60 animate-pulse" />
                <div className="w-32 h-2.5 rounded bg-warm-200/40 animate-pulse" />
              </div>
              <div className="w-12 h-2.5 rounded bg-warm-200/30 animate-pulse flex-shrink-0" />
            </div>
          ))}
        </div>
      </div>

      {/* Player table */}
      <div>
        <div className="w-36 h-3 rounded bg-warm-200/60 animate-pulse mb-4" />
        <div className="bg-white/50 rounded-2xl border border-white/20 overflow-hidden">
          <div className="h-11 border-b border-warm-100 bg-warm-50/30" />
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-b border-warm-50 last:border-0">
              <div className="w-5 h-5 rounded bg-warm-200/30 animate-pulse" />
              <div className="w-8 h-8 rounded-full bg-warm-200/50 animate-pulse" />
              <div className="w-28 h-3.5 rounded bg-warm-200/60 animate-pulse" />
              <div className="flex-1" />
              <div className="w-8 h-3.5 rounded bg-warm-200/40 animate-pulse" />
              <div className="w-8 h-3.5 rounded bg-warm-200/40 animate-pulse" />
              <div className="w-12 h-5 rounded-full bg-warm-200/40 animate-pulse" />
            </div>
          ))}
        </div>
      </div>

      {/* Stats accuracy */}
      <div>
        <div className="w-32 h-3 rounded bg-warm-200/60 animate-pulse mb-4" />
        <div className="bg-white/50 rounded-2xl h-48 border border-white/20 animate-pulse" />
      </div>
    </div>
  );
}

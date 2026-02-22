'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { AnimatePresence, motion } from 'framer-motion';
import {
  IconArrowLeft,
  IconTrendingUp,
  IconTrendingDown,
  IconMinus,
  IconVideo,
  IconChart,
  IconActivity,
  IconSparkles,
  IconNote,
  IconX,
  IconPlay,
  IconTarget,
  IconBolt,
  IconClock,
  IconPlus,
  IconChevronRight,
} from '@/components/icons';
import type { BaseballPlayerStats, BaseballPlayerAggregates, BaseballCoachInsight } from '@/lib/types';
import { PlayerInsightsPanel } from './PlayerInsightsPanel';
import { PlayerNotesSection } from './PlayerNotesSection';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlayerProfileClientProps {
  player: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    primary_position: string | null;
    secondary_position: string | null;
    grad_year: number | null;
    bats: string | null;
    throws: string | null;
    height_feet: number | null;
    height_inches: number | null;
    weight_lbs: number | null;
    gpa: number | null;
    city: string | null;
    state: string | null;
    high_school_name: string | null;
    jersey_number: string | null;
    team_position: string | null;
    team_status: string | null;
    joined_at: string | null;
  };
  stats: BaseballPlayerStats[];
  aggregates: BaseballPlayerAggregates | null;
  insights: BaseballCoachInsight[];
  notes: Array<{
    id: string;
    content: string;
    created_at: string;
    note_type?: string;
  }>;
  videos: Array<{
    id: string;
    title: string | null;
    thumbnail_url: string | null;
    video_url: string | null;
    created_at: string;
    video_type?: string;
  }>;
  teamId: string;
  teamName: string;
  coachId: string;
}

type MainTab = 'overview' | 'stats' | 'videos';
type StatFilter = 'all' | 'game' | 'practice';
type VideoFilter = 'all' | 'game' | 'scrimmage' | 'practice';
type StatSortKey = 'date' | 'ab' | 'h' | 'hr' | 'rbi' | 'bb' | 'so' | 'avg';
type SortDir = 'asc' | 'desc';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAvg(v: number | null | undefined): string {
  if (v == null) return '—';
  return v.toFixed(3).replace(/^0\./, '.');
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/30 rounded-2xl p-4 shadow-sm">
      <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-slate-900 tabular-nums leading-none">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  currentKey,
  dir,
  onSort,
  align = 'center',
}: {
  label: string;
  sortKey: StatSortKey;
  currentKey: StatSortKey;
  dir: SortDir;
  onSort: (key: StatSortKey) => void;
  align?: 'left' | 'center';
}) {
  const active = sortKey === currentKey;
  return (
    <th
      className={`px-3 py-3 text-${align} text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer select-none hover:text-slate-700 transition-colors`}
      onClick={() => onSort(sortKey)}
    >
      {label}
      {active && (
        <span className="ml-1 inline-block">{dir === 'asc' ? '↑' : '↓'}</span>
      )}
    </th>
  );
}

// ─── Trend Chart ──────────────────────────────────────────────────────────────

interface TrendTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: { hits: number; atBats: number; type: string } }>;
  label?: string;
}

function TrendTooltip({ active, payload, label }: TrendTooltipProps) {
  if (!active || !payload?.length) return null;
  const data = payload[0];
  return (
    <div className="bg-white/95 backdrop-blur-xl border border-slate-200/80 rounded-xl shadow-lg px-3 py-2.5 text-xs">
      <p className="font-medium text-slate-700 mb-1">{label}</p>
      <p className="text-slate-900 font-bold">{formatAvg(data?.value)}</p>
      <p className="text-slate-400 mt-0.5">
        {data?.payload.hits}/{data?.payload.atBats} AB
        {data?.payload.type && ` · ${data.payload.type}`}
      </p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PlayerProfileClient({
  player,
  stats,
  aggregates,
  insights,
  notes,
  videos,
  teamId: _teamId,
  teamName,
  coachId: _coachId,
}: PlayerProfileClientProps) {
  const [activeTab, setActiveTab] = useState<MainTab>('overview');
  const [statFilter, setStatFilter] = useState<StatFilter>('all');
  const [videoFilter, setVideoFilter] = useState<VideoFilter>('all');
  const [sortKey, setSortKey] = useState<StatSortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedVideo, setSelectedVideo] = useState<PlayerProfileClientProps['videos'][number] | null>(null);

  const fullName = `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim() || 'Unknown Player';
  const initials = (player.first_name?.[0] ?? '') + (player.last_name?.[0] ?? '');
  const height =
    player.height_feet && player.height_inches != null
      ? `${player.height_feet}'${player.height_inches}"`
      : null;
  const hometown =
    player.city && player.state
      ? `${player.city}, ${player.state}`
      : player.city ?? player.state ?? null;

  // ── Career aggregate computations ──────────────────────────────────────────
  const careerHR = useMemo(
    () => stats.reduce((sum, s) => sum + (s.home_runs ?? 0), 0),
    [stats]
  );
  const careerRBI = useMemo(
    () => stats.reduce((sum, s) => sum + (s.rbis ?? 0), 0),
    [stats]
  );
  const totalAB = useMemo(
    () => stats.reduce((sum, s) => sum + (s.at_bats ?? 0), 0),
    [stats]
  );
  const totalHits = useMemo(
    () => stats.reduce((sum, s) => sum + (s.hits ?? 0), 0),
    [stats]
  );

  const pressureIndex =
    aggregates?.pressure_gap != null
      ? aggregates.pressure_gap > 0
        ? 'Clutch'
        : aggregates.pressure_gap < -0.03
        ? 'Struggles'
        : 'Consistent'
      : null;

  // ── Trend chart data ────────────────────────────────────────────────────────
  const trendData = useMemo(() => {
    return [...stats]
      .sort((a, b) => new Date(a.session_date).getTime() - new Date(b.session_date).getTime())
      .map((s) => ({
        date: formatShortDate(s.session_date),
        avg: s.at_bats > 0 ? s.hits / s.at_bats : null,
        hits: s.hits,
        atBats: s.at_bats,
        type: s.stat_type,
      }));
  }, [stats]);

  // ── Stats table logic ───────────────────────────────────────────────────────
  const filteredStats = useMemo(() => {
    const base =
      statFilter === 'all'
        ? stats
        : stats.filter((s) => s.stat_type === statFilter);

    return [...base].sort((a, b) => {
      const mult = sortDir === 'asc' ? 1 : -1;
      switch (sortKey) {
        case 'date':
          return mult * (new Date(a.session_date).getTime() - new Date(b.session_date).getTime());
        case 'ab':
          return mult * ((a.at_bats ?? 0) - (b.at_bats ?? 0));
        case 'h':
          return mult * ((a.hits ?? 0) - (b.hits ?? 0));
        case 'hr':
          return mult * ((a.home_runs ?? 0) - (b.home_runs ?? 0));
        case 'rbi':
          return mult * ((a.rbis ?? 0) - (b.rbis ?? 0));
        case 'bb':
          return mult * ((a.walks ?? 0) - (b.walks ?? 0));
        case 'so':
          return mult * ((a.strikeouts ?? 0) - (b.strikeouts ?? 0));
        case 'avg': {
          const aAvg = a.at_bats > 0 ? a.hits / a.at_bats : -1;
          const bAvg = b.at_bats > 0 ? b.hits / b.at_bats : -1;
          return mult * (aAvg - bAvg);
        }
        default:
          return 0;
      }
    });
  }, [stats, statFilter, sortKey, sortDir]);

  // Summary row for stats tab
  const statSummary = useMemo(() => {
    const subset = statFilter === 'all' ? stats : stats.filter((s) => s.stat_type === statFilter);
    const ab = subset.reduce((s, r) => s + (r.at_bats ?? 0), 0);
    const h = subset.reduce((s, r) => s + (r.hits ?? 0), 0);
    const hr = subset.reduce((s, r) => s + (r.home_runs ?? 0), 0);
    const rbi = subset.reduce((s, r) => s + (r.rbis ?? 0), 0);
    const bb = subset.reduce((s, r) => s + (r.walks ?? 0), 0);
    const so = subset.reduce((s, r) => s + (r.strikeouts ?? 0), 0);
    return { ab, h, hr, rbi, bb, so, avg: ab > 0 ? h / ab : null };
  }, [stats, statFilter]);

  // ── Video logic ─────────────────────────────────────────────────────────────
  const videosByFilter = useMemo(() => {
    if (videoFilter === 'all') return videos;
    return videos.filter((v) => v.video_type === videoFilter);
  }, [videos, videoFilter]);

  const videoTypeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: videos.length };
    for (const v of videos) {
      if (v.video_type) {
        counts[v.video_type] = (counts[v.video_type] ?? 0) + 1;
      }
    }
    return counts;
  }, [videos]);

  // ── Sort handler ────────────────────────────────────────────────────────────
  const handleSort = (key: StatSortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  // ── Trend badge ─────────────────────────────────────────────────────────────
  const trend = aggregates?.recent_trend;
  const trendBadge = {
    improving: { label: 'Improving', icon: <IconTrendingUp size={14} />, cls: 'bg-primary-100 text-primary-700' },
    declining: { label: 'Declining', icon: <IconTrendingDown size={14} />, cls: 'bg-red-100 text-red-700' },
    stable: { label: 'Stable', icon: <IconMinus size={14} />, cls: 'bg-slate-100 text-slate-600' },
  } as const;
  const badge = trend ? trendBadge[trend] : trendBadge.stable;

  // ── Video filter tabs (only show types that have videos) ───────────────────
  const videoTabs: Array<{ key: VideoFilter; label: string }> = [
    { key: 'all', label: 'All' },
    ...((['game', 'scrimmage', 'practice'] as const).filter(
      (t) => (videoTypeCounts[t] ?? 0) > 0
    ).map((t) => ({ key: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))),
  ];

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#FFFEFA]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">

        {/* ── Back button ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 mb-7">
          <Link
            href="/baseball/dashboard/command-center"
            className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors group"
          >
            <span className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/80 border border-slate-200/80 shadow-sm group-hover:shadow transition-shadow">
              <IconArrowLeft size={16} />
            </span>
            <span className="text-sm font-medium hidden sm:inline">Back to Command Center</span>
          </Link>
          <span className="text-slate-300 hidden sm:inline">/</span>
          <span className="text-sm text-slate-400 hidden sm:inline truncate max-w-[200px]">{teamName}</span>
        </div>

        {/* ── Hero card ────────────────────────────────────────────────── */}
        <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm mb-6 overflow-hidden">
          {/* gradient accent bar */}
          <div className="h-1.5 w-full bg-gradient-to-r from-primary-500 via-primary-400 to-emerald-400" />

          <div className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-start gap-5">
              {/* Avatar */}
              <div className="relative flex-shrink-0 self-start">
                <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl overflow-hidden bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-md">
                  {player.avatar_url ? (
                    <Image
                      src={player.avatar_url}
                      alt={fullName}
                      width={128}
                      height={128}
                      className="object-cover w-full h-full"
                    />
                  ) : (
                    <span className="text-3xl font-bold text-white select-none">
                      {initials}
                    </span>
                  )}
                </div>
                {/* Jersey badge */}
                {player.jersey_number && (
                  <span className="absolute -top-2 -right-2 min-w-[26px] h-[26px] px-1.5
                                   flex items-center justify-center
                                   bg-primary-600 text-white text-[11px] font-bold rounded-full border-2 border-white shadow">
                    #{player.jersey_number}
                  </span>
                )}
              </div>

              {/* Name + info */}
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 leading-tight">
                  {fullName}
                </h1>

                {/* Position + year badges */}
                <div className="flex flex-wrap gap-2 mt-2">
                  {player.primary_position && (
                    <span className="px-2.5 py-1 bg-primary-100 text-primary-700 text-xs font-semibold rounded-lg">
                      {player.primary_position}
                    </span>
                  )}
                  {player.secondary_position && (
                    <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-xs font-semibold rounded-lg">
                      {player.secondary_position}
                    </span>
                  )}
                  {player.grad_year && (
                    <span className="px-2.5 py-1 bg-amber-100 text-amber-700 text-xs font-semibold rounded-lg">
                      Class of {player.grad_year}
                    </span>
                  )}
                  {player.gpa && (
                    <span className="px-2.5 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg">
                      GPA {player.gpa.toFixed(2)}
                    </span>
                  )}
                </div>

                {/* Physical + hometown row */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-sm text-slate-500">
                  {hometown && (
                    <span className="flex items-center gap-1">
                      <span className="text-slate-300">📍</span>
                      {hometown}
                    </span>
                  )}
                  {height && <span>{height}</span>}
                  {player.weight_lbs && <span>{player.weight_lbs} lbs</span>}
                  {(player.bats || player.throws) && (
                    <span>
                      {player.bats && `Bats ${player.bats}`}
                      {player.bats && player.throws && ' / '}
                      {player.throws && `Throws ${player.throws}`}
                    </span>
                  )}
                  {player.high_school_name && (
                    <span className="truncate max-w-[200px]">{player.high_school_name}</span>
                  )}
                </div>
              </div>

              {/* Quick stat pills — right side on desktop */}
              <div className="flex sm:flex-col items-center sm:items-end gap-2 flex-wrap">
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${badge.cls}`}>
                  {badge.icon}
                  {badge.label}
                </div>
                {aggregates?.avg_exit_velocity && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-primary-50 text-primary-700">
                    <IconBolt size={13} />
                    {aggregates.avg_exit_velocity.toFixed(1)} mph EV
                  </div>
                )}
              </div>
            </div>

            {/* ── Key stat row ─────────────────────────────────────────── */}
            <div className="grid grid-cols-4 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-100">
              <div className="text-center">
                <p className="text-[11px] text-slate-400 uppercase tracking-wide">AVG</p>
                <p className="text-xl font-bold text-slate-900 mt-0.5 tabular-nums">
                  {formatAvg(aggregates?.career_avg)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[11px] text-slate-400 uppercase tracking-wide">OBP</p>
                <p className="text-xl font-bold text-slate-900 mt-0.5 tabular-nums">
                  {formatAvg(aggregates?.career_obp)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[11px] text-slate-400 uppercase tracking-wide">HR</p>
                <p className="text-xl font-bold text-slate-900 mt-0.5 tabular-nums">
                  {careerHR}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[11px] text-slate-400 uppercase tracking-wide">Sessions</p>
                <p className="text-xl font-bold text-slate-900 mt-0.5 tabular-nums">
                  {aggregates?.total_sessions ?? stats.length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Tabs ─────────────────────────────────────────────────────── */}
        <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1 scrollbar-hide">
          {([
            { id: 'overview' as const, label: 'Overview', icon: <IconChart size={15} /> },
            { id: 'stats' as const, label: 'Stats', icon: <IconActivity size={15} /> },
            { id: 'videos' as const, label: `Videos${videos.length > 0 ? ` (${videos.length})` : ''}`, icon: <IconVideo size={15} /> },
          ]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-white/70 backdrop-blur-sm text-slate-600 hover:bg-white border border-white/20 hover:shadow-sm'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            OVERVIEW TAB
        ═══════════════════════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Main column */}
            <div className="lg:col-span-2 space-y-6">

              {/* Career stats grid */}
              <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm p-6">
                <h3 className="font-semibold text-slate-900 mb-4">Career Statistics</h3>
                <div className="grid grid-cols-3 sm:grid-cols-3 gap-3">
                  <StatCard label="Career AVG" value={formatAvg(aggregates?.career_avg)} />
                  <StatCard label="OBP" value={formatAvg(aggregates?.career_obp)} />
                  <StatCard label="SLG" value={formatAvg(aggregates?.career_slg)} />
                  <StatCard label="Game AVG" value={formatAvg(aggregates?.game_avg)} />
                  <StatCard label="Scrimmage AVG" value={formatAvg(aggregates?.practice_avg)} />
                  <StatCard label="Last 5 AVG" value={formatAvg(aggregates?.last_5_avg)} />
                  <StatCard label="Total AB" value={String(totalAB)} />
                  <StatCard label="Total Hits" value={String(totalHits)} />
                  <StatCard label="Career HR" value={String(careerHR)} />
                  <StatCard label="Career RBI" value={String(careerRBI)} />
                  <StatCard label="Sessions" value={String(aggregates?.total_sessions ?? stats.length)} />
                  {aggregates?.avg_exit_velocity && (
                    <StatCard
                      label="Avg Exit Velo"
                      value={`${aggregates.avg_exit_velocity.toFixed(1)}`}
                      sub="mph"
                    />
                  )}
                </div>
              </div>

              {/* Trend chart */}
              {trendData.length > 0 && (
                <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-slate-900">Performance Trend</h3>
                      <p className="text-xs text-slate-400 mt-0.5">Batting average per session</p>
                    </div>
                    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${badge.cls}`}>
                      {badge.icon}
                      {badge.label}
                    </div>
                  </div>
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.6} vertical={false} />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 10, fill: '#94a3b8' }}
                          axisLine={{ stroke: '#e2e8f0' }}
                          tickLine={false}
                          interval="preserveStartEnd"
                          minTickGap={40}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: '#94a3b8' }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v: number) => formatAvg(v)}
                          domain={[0, 0.5]}
                          width={36}
                        />
                        <ReferenceLine y={0.3} stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={1} />
                        <Tooltip content={<TrendTooltip />} />
                        <Line
                          type="monotone"
                          dataKey="avg"
                          stroke="#22c55e"
                          strokeWidth={2.5}
                          dot={{ r: 3, fill: '#22c55e', stroke: '#fff', strokeWidth: 1.5 }}
                          activeDot={{ r: 5, fill: '#22c55e', stroke: '#fff', strokeWidth: 2 }}
                          connectNulls
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-0.5 rounded bg-primary-500 inline-block" />
                      Batting Average
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-0.5 inline-block" style={{ background: 'repeating-linear-gradient(90deg,#94a3b8,#94a3b8 3px,transparent 3px,transparent 6px)' }} />
                      .300 Line
                    </span>
                  </div>
                </div>
              )}

              {/* Advanced metrics */}
              {(pressureIndex ?? aggregates?.trend_magnitude) && (
                <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm p-6">
                  <h3 className="font-semibold text-slate-900 mb-4">Advanced Metrics</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {pressureIndex && (
                      <div className="flex items-center gap-3 p-3.5 bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl">
                        <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
                          <IconTarget size={18} className="text-purple-600" />
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-purple-500 uppercase tracking-wide">Pressure</p>
                          <p className="text-base font-bold text-slate-900">{pressureIndex}</p>
                          {aggregates?.pressure_gap != null && (
                            <p className="text-[10px] text-slate-400">
                              {aggregates.pressure_gap > 0 ? '+' : ''}{(aggregates.pressure_gap * 1000).toFixed(0)} pts game vs scrimmage
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                    {aggregates?.trend_magnitude != null && (
                      <div className="flex items-center gap-3 p-3.5 bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl">
                        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                          <IconActivity size={18} className="text-amber-600" />
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-amber-500 uppercase tracking-wide">Trend Velocity</p>
                          <p className="text-base font-bold text-slate-900">
                            {(aggregates.trend_magnitude * 100).toFixed(1)}%
                          </p>
                          <p className="text-[10px] text-slate-400">Rate of change</p>
                        </div>
                      </div>
                    )}
                    {aggregates?.avg_exit_velocity != null && (
                      <div className="flex items-center gap-3 p-3.5 bg-gradient-to-br from-primary-50 to-emerald-50 rounded-xl">
                        <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
                          <IconBolt size={18} className="text-primary-600" />
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-primary-600 uppercase tracking-wide">Exit Velocity</p>
                          <p className="text-base font-bold text-slate-900">
                            {aggregates.avg_exit_velocity.toFixed(1)} mph
                          </p>
                          {aggregates.max_exit_velocity && (
                            <p className="text-[10px] text-slate-400">
                              Max {aggregates.max_exit_velocity.toFixed(1)} mph
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Recent videos preview */}
              {videos.length > 0 && (
                <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-slate-900">Videos</h3>
                    <button
                      onClick={() => setActiveTab('videos')}
                      className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
                    >
                      View all ({videos.length}) <IconChevronRight size={13} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {videos.slice(0, 4).map((v) => (
                      <button
                        key={v.id}
                        onClick={() => { setSelectedVideo(v); setActiveTab('videos'); }}
                        className="group relative aspect-video rounded-xl overflow-hidden bg-slate-100 hover:ring-2 hover:ring-primary-500 transition-all"
                      >
                        {v.thumbnail_url ? (
                          <Image src={v.thumbnail_url} alt={v.title ?? 'Video'} fill className="object-cover" />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-200 to-slate-300">
                            <IconVideo size={20} className="text-slate-400" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center">
                          <div className="w-9 h-9 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 transition-all">
                            <IconPlay size={16} className="text-slate-900 ml-0.5" />
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">

              {/* AI Insights */}
              <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm p-6">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2 mb-4">
                  <IconSparkles size={16} className="text-purple-500" />
                  AI Insights
                  {insights.length > 0 && (
                    <span className="ml-auto text-xs font-medium px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">
                      {insights.length}
                    </span>
                  )}
                </h3>
                <PlayerInsightsPanel insights={insights.slice(0, 3)} />
                {insights.length > 3 && (
                  <p className="text-xs text-slate-400 text-center mt-3">
                    +{insights.length - 3} more insights
                  </p>
                )}
              </div>

              {/* Notes */}
              <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                    <IconNote size={15} className="text-slate-400" />
                    Coach Notes
                  </h3>
                  <button className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 transition-colors font-medium">
                    <IconPlus size={13} />
                    Add
                  </button>
                </div>
                <PlayerNotesSection notes={notes.slice(0, 3)} compact />
              </div>

              {/* Session breakdown */}
              <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm p-6">
                <h3 className="font-semibold text-slate-900 mb-4">Sessions</h3>
                <div className="space-y-3">
                  {[
                    { label: 'Game', count: stats.filter((s) => s.stat_type === 'game').length, color: 'bg-primary-500' },
                    { label: 'Practice / Scrimmage', count: stats.filter((s) => s.stat_type === 'practice').length, color: 'bg-blue-400' },
                    { label: 'Other', count: stats.filter((s) => s.stat_type !== 'game' && s.stat_type !== 'practice').length, color: 'bg-slate-300' },
                  ].map(({ label, count, color }) => (
                    <div key={label} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
                        <span className="text-sm text-slate-600">{label}</span>
                      </div>
                      <span className="text-sm font-semibold text-slate-900">{count}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <span className="text-sm font-medium text-slate-700">Total</span>
                    <span className="text-sm font-bold text-primary-600">{stats.length}</span>
                  </div>
                </div>
                <button
                  onClick={() => setActiveTab('stats')}
                  className="flex items-center justify-center gap-1 w-full mt-4 py-2 text-xs font-medium text-primary-600
                             bg-primary-50 hover:bg-primary-100 rounded-xl transition-colors"
                >
                  View all stats <IconChevronRight size={12} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            STATS TAB
        ═══════════════════════════════════════════════════════════════ */}
        {activeTab === 'stats' && (
          <div className="space-y-5">

            {/* Filter toggle */}
            <div className="flex items-center gap-2">
              <div className="flex bg-white/70 backdrop-blur-sm border border-white/30 rounded-xl p-1 gap-1 shadow-sm">
                {(['all', 'game', 'practice'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setStatFilter(f)}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      statFilter === f
                        ? 'bg-primary-600 text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {f === 'all' ? 'All' : f === 'game' ? 'Game' : 'Scrimmage'}
                  </button>
                ))}
              </div>
              <span className="text-xs text-slate-400">{filteredStats.length} sessions</span>
            </div>

            {/* Summary row */}
            {filteredStats.length > 0 && (
              <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm p-4">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-3">
                  Totals — {statFilter === 'all' ? 'All Sessions' : statFilter === 'game' ? 'Game Sessions' : 'Scrimmage Sessions'}
                </p>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-3">
                  {[
                    { label: 'AB', value: String(statSummary.ab) },
                    { label: 'H', value: String(statSummary.h) },
                    { label: 'AVG', value: formatAvg(statSummary.avg) },
                    { label: 'HR', value: String(statSummary.hr) },
                    { label: 'RBI', value: String(statSummary.rbi) },
                    { label: 'BB', value: String(statSummary.bb) },
                    { label: 'SO', value: String(statSummary.so) },
                  ].map(({ label, value }) => (
                    <div key={label} className="text-center">
                      <p className="text-[10px] text-slate-400 uppercase">{label}</p>
                      <p className="text-base font-bold text-slate-900 tabular-nums">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Stats table */}
            {filteredStats.length === 0 ? (
              <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm p-12 text-center">
                <IconActivity size={32} className="mx-auto text-slate-300 mb-3" />
                <p className="text-slate-500 font-medium">No stats for this filter</p>
                <p className="text-sm text-slate-400 mt-1">Try switching to "All" to see all sessions.</p>
              </div>
            ) : (
              <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/80">
                        <SortHeader label="Date" sortKey="date" currentKey={sortKey} dir={sortDir} onSort={handleSort} align="left" />
                        <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Type</th>
                        <SortHeader label="AB" sortKey="ab" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                        <SortHeader label="H" sortKey="h" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                        <SortHeader label="AVG" sortKey="avg" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                        <SortHeader label="HR" sortKey="hr" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                        <SortHeader label="RBI" sortKey="rbi" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                        <SortHeader label="BB" sortKey="bb" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                        <SortHeader label="SO" sortKey="so" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStats.map((stat) => {
                        const sessionAvg =
                          stat.at_bats > 0 ? stat.hits / stat.at_bats : null;
                        return (
                          <tr
                            key={stat.id}
                            className="border-b border-slate-50 last:border-0 hover:bg-slate-50/80 transition-colors"
                          >
                            <td className="px-3 py-3 text-sm text-slate-700 whitespace-nowrap">
                              {formatDate(stat.session_date)}
                            </td>
                            <td className="px-3 py-3">
                              <span
                                className={`px-2 py-0.5 text-[11px] font-semibold rounded-md whitespace-nowrap ${
                                  stat.stat_type === 'game'
                                    ? 'bg-primary-100 text-primary-700'
                                    : stat.stat_type === 'practice'
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {stat.stat_type === 'practice' ? 'Scrimmage' : stat.stat_type}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-center text-sm text-slate-600 tabular-nums">{stat.at_bats ?? '—'}</td>
                            <td className="px-3 py-3 text-center text-sm text-slate-600 tabular-nums">{stat.hits ?? '—'}</td>
                            <td className="px-3 py-3 text-center text-sm font-semibold text-slate-900 tabular-nums">
                              {formatAvg(sessionAvg)}
                            </td>
                            <td className="px-3 py-3 text-center text-sm text-slate-600 tabular-nums">{stat.home_runs ?? '—'}</td>
                            <td className="px-3 py-3 text-center text-sm text-slate-600 tabular-nums">{stat.rbis ?? '—'}</td>
                            <td className="px-3 py-3 text-center text-sm text-slate-600 tabular-nums">{stat.walks ?? '—'}</td>
                            <td className="px-3 py-3 text-center text-sm text-slate-600 tabular-nums">{stat.strikeouts ?? '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            VIDEOS TAB
        ═══════════════════════════════════════════════════════════════ */}
        {activeTab === 'videos' && (
          <div className="space-y-5">

            {/* Sub-tabs */}
            {videoTabs.length > 1 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                <div className="flex bg-white/70 backdrop-blur-sm border border-white/30 rounded-xl p-1 gap-1 shadow-sm">
                  {videoTabs.map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setVideoFilter(key)}
                      className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                        videoFilter === key
                          ? 'bg-primary-600 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {label}
                      {key !== 'all' && (videoTypeCounts[key] ?? 0) > 0 && (
                        <span className={`ml-1.5 text-[11px] px-1.5 py-0.5 rounded-full ${
                          videoFilter === key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {videoTypeCounts[key]}
                        </span>
                      )}
                      {key === 'all' && (
                        <span className={`ml-1.5 text-[11px] px-1.5 py-0.5 rounded-full ${
                          videoFilter === 'all' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {videos.length}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Video grid / empty state */}
            {videosByFilter.length === 0 ? (
              <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm p-12 text-center">
                <IconVideo size={36} className="mx-auto text-slate-300 mb-3" />
                <p className="text-slate-500 font-medium">No videos uploaded yet</p>
                <p className="text-sm text-slate-400 mt-1">
                  Videos will appear here once the player uploads them.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {videosByFilter.map((video) => (
                  <button
                    key={video.id}
                    onClick={() => setSelectedVideo(video)}
                    className="group relative aspect-video rounded-2xl overflow-hidden bg-slate-100
                               hover:ring-2 hover:ring-primary-500 hover:shadow-md transition-all duration-200"
                  >
                    {video.thumbnail_url ? (
                      <Image
                        src={video.thumbnail_url}
                        alt={video.title ?? 'Video thumbnail'}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-200 to-slate-300">
                        <IconVideo size={28} className="text-slate-400" />
                      </div>
                    )}

                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                      <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center
                                      opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 transition-all duration-200">
                        <IconPlay size={20} className="text-slate-900 ml-0.5" />
                      </div>
                    </div>

                    {/* Type badge */}
                    {video.video_type && (
                      <div className="absolute top-2 left-2">
                        <span className="px-2 py-0.5 text-[10px] font-semibold bg-black/50 text-white rounded-md capitalize">
                          {video.video_type}
                        </span>
                      </div>
                    )}

                    {/* Title */}
                    {video.title && (
                      <div className="absolute bottom-0 left-0 right-0 p-2.5 bg-gradient-to-t from-black/70 to-transparent">
                        <p className="text-xs text-white font-medium truncate">{video.title}</p>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {/* ═══════════════════════════════════════════════════════════════
          VIDEO MODAL
      ═══════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {selectedVideo && (
          <motion.div
            key="video-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedVideo(null)}
          >
            <motion.div
              key="video-modal"
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              className="relative w-full max-w-4xl bg-slate-900 rounded-2xl overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button */}
              <button
                onClick={() => setSelectedVideo(null)}
                className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-black/50 text-white
                           hover:bg-black/70 flex items-center justify-center transition-colors"
              >
                <IconX size={18} />
              </button>

              {/* Video player */}
              <div className="aspect-video bg-black">
                {selectedVideo.video_url ? (
                  <video
                    src={selectedVideo.video_url}
                    controls
                    autoPlay
                    className="w-full h-full"
                  >
                    Your browser does not support the video tag.
                  </video>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                    <IconVideo size={40} className="text-slate-600" />
                    <p className="text-slate-400 text-sm">Video unavailable</p>
                  </div>
                )}
              </div>

              {/* Video info footer */}
              <div className="px-5 py-4 bg-slate-900">
                <h3 className="font-semibold text-white text-base">
                  {selectedVideo.title ?? 'Untitled Video'}
                </h3>
                <div className="flex items-center gap-3 mt-1.5 text-sm text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <IconClock size={13} />
                    {formatDate(selectedVideo.created_at)}
                  </span>
                  {selectedVideo.video_type && (
                    <span className="px-2 py-0.5 bg-slate-800 rounded-md capitalize text-xs">
                      {selectedVideo.video_type}
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { BaseballInviteButton } from './BaseballInviteButton';
import { TeamPlayerPeekPanel } from './TeamPlayerPeekPanel';
import {
  IconSearch,
  IconUsers,
  IconUpload,
  IconChartBar,
  IconCalendar,
  IconTrendingUp,
  IconTrendingDown,
  IconMinus,
} from '@/components/icons';
import type { BaseballRosterPlayer, BaseballCoachInsight } from '@/lib/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalendarEvent {
  id: string;
  title: string;
  event_type: string;
  start_time: string;
  end_time: string | null;
}

interface CommandCenterClientProps {
  team: {
    id: string;
    name: string;
    teamType: string;
    inviteCode: string | null;
  };
  players: BaseballRosterPlayer[];
  insights: BaseballCoachInsight[];
  coachId: string;
  coachName?: string;
  calendarEvents?: CalendarEvent[];
}

type MainTab = 'roster' | 'stats';
type PositionFilter = 'all' | 'P' | 'C' | '1B' | '2B' | 'SS' | '3B' | 'OF';
type SortOption = 'name' | 'avg' | 'trend';
type StatTypeFilter = 'all' | 'game' | 'scrimmage';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

function formatAvg(v: number | null | undefined): string {
  if (v == null) return '—';
  return v.toFixed(3).replace(/^0\./, '.');
}

function getWeekDays(): Array<{ date: Date; dayNum: number; dayLabel: string; isToday: boolean }> {
  const now = new Date();
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - now.getDay());
  sunday.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return {
      date: d,
      dayNum: d.getDate(),
      dayLabel: DAY_LABELS[i] ?? 'S',
      isToday: d.getTime() === today.getTime(),
    };
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TrendIndicator({ trend }: { trend: string | null | undefined }) {
  if (trend === 'improving') {
    return (
      <span className="flex items-center gap-0.5 text-primary-600 text-[11px] font-medium">
        <IconTrendingUp size={12} />↑
      </span>
    );
  }
  if (trend === 'declining') {
    return (
      <span className="flex items-center gap-0.5 text-red-500 text-[11px] font-medium">
        <IconTrendingDown size={12} />↓
      </span>
    );
  }
  return (
    <span className="flex items-center gap-0.5 text-slate-400 text-[11px] font-medium">
      <IconMinus size={12} />—
    </span>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center px-2 py-1 bg-slate-50 rounded-lg">
      <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide">{label}</span>
      <span className="text-xs font-bold text-slate-800 tabular-nums">{value}</span>
    </div>
  );
}

// ─── Player Roster Card ───────────────────────────────────────────────────────

function PlayerRosterCard({
  player,
  onClick,
}: {
  player: BaseballRosterPlayer;
  onClick: () => void;
}) {
  const fullName = `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim();
  const initials = (player.first_name?.[0] ?? '') + (player.last_name?.[0] ?? '');
  const trend = player.aggregates?.recent_trend;

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-4
                 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group"
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          <div className="w-14 h-14 rounded-2xl overflow-hidden bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center">
            {player.avatar_url ? (
              <Image
                src={player.avatar_url}
                alt={fullName}
                width={56}
                height={56}
                className="object-cover w-full h-full"
              />
            ) : (
              <span className="text-base font-bold text-white select-none">{initials}</span>
            )}
          </div>
          {/* Jersey badge */}
          {player.jersey_number != null && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1
                             flex items-center justify-center
                             bg-primary-600 text-white text-[9px] font-bold rounded-full border-[1.5px] border-white">
              #{player.jersey_number}
            </span>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-slate-900 text-sm truncate">{fullName || 'Unknown'}</p>
            <TrendIndicator trend={trend} />
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {player.primary_position ?? 'N/A'}
            {player.grad_year && ` · '${String(player.grad_year).slice(-2)}`}
          </p>

          {/* Stats chips */}
          <div className="flex items-center gap-1.5 mt-2.5">
            <StatChip label="AVG" value={formatAvg(player.aggregates?.career_avg)} />
            <StatChip label="Game" value={formatAvg(player.aggregates?.game_avg)} />
            <StatChip label="Sessions" value={String(player.aggregates?.total_sessions ?? 0)} />
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Team Stats Card ──────────────────────────────────────────────────────────

function TeamStatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 ${accent ? 'bg-primary-600 text-white' : 'bg-white/70 backdrop-blur-xl border border-white/20 shadow-sm'}`}>
      <p className={`text-[10px] font-semibold uppercase tracking-wide mb-1 ${accent ? 'text-primary-100' : 'text-slate-400'}`}>{label}</p>
      <p className={`text-2xl font-bold tabular-nums leading-none ${accent ? 'text-white' : 'text-slate-900'}`}>{value}</p>
      {sub && <p className={`text-xs mt-1 ${accent ? 'text-primary-200' : 'text-slate-400'}`}>{sub}</p>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CommandCenterClient({
  team,
  players,
  coachId: _coachId,
  calendarEvents = [],
}: CommandCenterClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<MainTab>('roster');
  const [searchQuery, setSearchQuery] = useState('');
  const [positionFilter, setPositionFilter] = useState<PositionFilter>('all');
  const [sortOption, setSortOption] = useState<SortOption>('name');
  const [peekPlayer, setPeekPlayer] = useState<BaseballRosterPlayer | null>(null);
  const [statTypeFilter, setStatTypeFilter] = useState<StatTypeFilter>('all');
  const [statSortKey, setStatSortKey] = useState<'name' | 'avg' | 'hr' | 'ops' | 'trend'>('avg');

  // ── Week calendar data ──────────────────────────────────────────────────────
  const weekDays = useMemo(() => getWeekDays(), []);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of calendarEvents) {
      const key = new Date(ev.start_time).toDateString();
      const arr = map.get(key) ?? [];
      arr.push(ev);
      map.set(key, arr);
    }
    return map;
  }, [calendarEvents]);

  // ── Roster filtering ────────────────────────────────────────────────────────
  const filteredPlayers = useMemo(() => {
    let result = [...players];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.first_name?.toLowerCase().includes(q) ||
          p.last_name?.toLowerCase().includes(q) ||
          p.primary_position?.toLowerCase().includes(q)
      );
    }

    if (positionFilter !== 'all') {
      result = result.filter(
        (p) =>
          p.primary_position === positionFilter ||
          p.secondary_position === positionFilter
      );
    }

    result.sort((a, b) => {
      switch (sortOption) {
        case 'name':
          return `${a.last_name}${a.first_name}`.localeCompare(`${b.last_name}${b.first_name}`);
        case 'avg':
          return (b.aggregates?.career_avg ?? 0) - (a.aggregates?.career_avg ?? 0);
        case 'trend': {
          const order = { improving: 3, stable: 2, declining: 1 };
          return (order[b.aggregates?.recent_trend ?? 'stable'] ?? 2) - (order[a.aggregates?.recent_trend ?? 'stable'] ?? 2);
        }
        default:
          return 0;
      }
    });

    return result;
  }, [players, searchQuery, positionFilter, sortOption]);

  // ── Team aggregate stats ────────────────────────────────────────────────────
  const teamStats = useMemo(() => {
    const withStats = players.filter((p) => p.aggregates?.career_avg != null);
    const teamAvg =
      withStats.length > 0
        ? withStats.reduce((s, p) => s + (p.aggregates?.career_avg ?? 0), 0) / withStats.length
        : null;
    const teamOBP =
      withStats.filter((p) => p.aggregates?.career_obp != null).length > 0
        ? withStats.reduce((s, p) => s + (p.aggregates?.career_obp ?? 0), 0) / withStats.length
        : null;
    const teamSLG =
      withStats.filter((p) => p.aggregates?.career_slg != null).length > 0
        ? withStats.reduce((s, p) => s + (p.aggregates?.career_slg ?? 0), 0) / withStats.length
        : null;
    const totalSessions = players.reduce((s, p) => s + (p.aggregates?.total_sessions ?? 0), 0);
    const improving = players.filter((p) => p.aggregates?.recent_trend === 'improving').length;
    const declining = players.filter((p) => p.aggregates?.recent_trend === 'declining').length;

    return { teamAvg, teamOBP, teamSLG, totalSessions, improving, declining };
  }, [players]);

  // ── Stats tab player table ──────────────────────────────────────────────────
  const statsTablePlayers = useMemo(() => {
    let result = [...players];

    if (positionFilter !== 'all') {
      result = result.filter(
        (p) =>
          p.primary_position === positionFilter ||
          p.secondary_position === positionFilter
      );
    }

    // Apply stat type filter (affects which avg to show)
    result.sort((a, b) => {
      switch (statSortKey) {
        case 'name':
          return `${a.last_name}${a.first_name}`.localeCompare(`${b.last_name}${b.first_name}`);
        case 'avg': {
          const aVal = statTypeFilter === 'game'
            ? (a.aggregates?.game_avg ?? 0)
            : statTypeFilter === 'scrimmage'
            ? (a.aggregates?.practice_avg ?? 0)
            : (a.aggregates?.career_avg ?? 0);
          const bVal = statTypeFilter === 'game'
            ? (b.aggregates?.game_avg ?? 0)
            : statTypeFilter === 'scrimmage'
            ? (b.aggregates?.practice_avg ?? 0)
            : (b.aggregates?.career_avg ?? 0);
          return bVal - aVal;
        }
        case 'ops':
          return (b.aggregates?.career_ops ?? 0) - (a.aggregates?.career_ops ?? 0);
        case 'trend': {
          const order = { improving: 3, stable: 2, declining: 1 };
          return (order[b.aggregates?.recent_trend ?? 'stable'] ?? 2) - (order[a.aggregates?.recent_trend ?? 'stable'] ?? 2);
        }
        default:
          return 0;
      }
    });

    return result;
  }, [players, positionFilter, statTypeFilter, statSortKey]);

  const positions: PositionFilter[] = ['all', 'P', 'C', '1B', '2B', 'SS', '3B', 'OF'];

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="min-h-screen bg-[#FFFEFA]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

          {/* ── Header ─────────────────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Command Center</h1>
              <p className="text-slate-500 mt-0.5 text-sm">
                {team.name} · {players.length} player{players.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              {team.id && (
                <BaseballInviteButton
                  teamId={team.id}
                  teamName={team.name}
                  existingCode={team.inviteCode}
                />
              )}
              <Link href="/baseball/dashboard/stats/upload">
                <button className="flex items-center gap-2 px-4 py-2 bg-white/70 backdrop-blur-sm
                                   border border-white/20 rounded-xl text-sm font-medium text-slate-700
                                   hover:bg-white hover:shadow-sm transition-all">
                  <IconUpload size={16} />
                  <span className="hidden sm:inline">Upload Stats</span>
                </button>
              </Link>
            </div>
          </div>

          {/* ── Mini Week Calendar Strip ────────────────────────────────── */}
          <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm p-4 mb-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <IconCalendar size={15} className="text-slate-400" />
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">This Week</span>
              </div>
              <Link
                href="/baseball/dashboard/calendar"
                className="text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
              >
                View Calendar →
              </Link>
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {weekDays.map((day) => {
                const dayEvents = eventsByDay.get(day.date.toDateString()) ?? [];
                return (
                  <button
                    key={day.date.toISOString()}
                    onClick={() => router.push('/baseball/dashboard/calendar')}
                    className="flex flex-col items-center py-2.5 px-1 rounded-xl transition-all group hover:bg-slate-50"
                  >
                    <span className={`text-[10px] font-semibold uppercase tracking-wide mb-1.5 ${
                      day.isToday ? 'text-primary-600' : 'text-slate-400'
                    }`}>
                      {day.dayLabel}
                    </span>
                    <span className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold transition-all ${
                      day.isToday
                        ? 'bg-primary-600 text-white shadow-sm'
                        : 'text-slate-700 group-hover:bg-slate-100'
                    }`}>
                      {day.dayNum}
                    </span>
                    {/* Event dots */}
                    <div className="flex gap-0.5 mt-1.5 h-1.5">
                      {dayEvents.slice(0, 3).map((_, i) => (
                        <span
                          key={i}
                          className={`w-1.5 h-1.5 rounded-full ${day.isToday ? 'bg-primary-400' : 'bg-slate-300'}`}
                        />
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Tab Toggle ─────────────────────────────────────────────── */}
          <div className="flex bg-white/70 backdrop-blur-sm border border-white/30 rounded-2xl p-1 gap-1 shadow-sm mb-6 w-fit">
            {([
              { id: 'roster' as const, label: 'Roster', icon: <IconUsers size={15} /> },
              { id: 'stats' as const, label: 'Stats', icon: <IconChartBar size={15} /> },
            ]).map(({ id, label, icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium transition-all ${
                  activeTab === id
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>

          {/* ══════════════════════════════════════════════════════════════
              ROSTER TAB
          ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'roster' && (
            <div className="space-y-5">

              {/* Search + filters row */}
              <div className="flex flex-col sm:flex-row gap-3">
                {/* Search */}
                <div className="relative flex-1 max-w-xs">
                  <IconSearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search players…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-white/80 border border-slate-200/80 rounded-xl
                               text-sm text-slate-900 placeholder:text-slate-400
                               focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 transition-colors"
                  />
                </div>

                {/* Position filter */}
                <select
                  value={positionFilter}
                  onChange={(e) => setPositionFilter(e.target.value as PositionFilter)}
                  className="px-3 py-2.5 bg-white/80 border border-slate-200/80 rounded-xl text-sm text-slate-700
                             focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 transition-colors"
                >
                  {positions.map((p) => (
                    <option key={p} value={p}>{p === 'all' ? 'All Positions' : p}</option>
                  ))}
                </select>

                {/* Sort */}
                <select
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value as SortOption)}
                  className="px-3 py-2.5 bg-white/80 border border-slate-200/80 rounded-xl text-sm text-slate-700
                             focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 transition-colors"
                >
                  <option value="name">Sort: Name</option>
                  <option value="avg">Sort: AVG</option>
                  <option value="trend">Sort: Trend</option>
                </select>

                {/* Upload stats */}
                <Link href="/baseball/dashboard/stats/upload" className="sm:ml-auto">
                  <button className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-slate-500
                                     bg-white/60 border border-slate-200/60 rounded-xl hover:bg-white transition-all whitespace-nowrap">
                    <IconUpload size={14} />
                    Upload Stats
                  </button>
                </Link>
              </div>

              {/* Empty state */}
              {players.length === 0 ? (
                <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm p-14 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                    <IconUsers size={24} className="text-slate-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">No Players Yet</h3>
                  <p className="text-slate-500 mb-6 max-w-sm mx-auto text-sm">
                    Share your join code to invite players to your roster.
                  </p>
                  {team.id && (
                    <BaseballInviteButton
                      teamId={team.id}
                      teamName={team.name}
                      existingCode={team.inviteCode}
                    />
                  )}
                </div>
              ) : filteredPlayers.length === 0 ? (
                <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm p-10 text-center">
                  <p className="text-slate-500">No players match your search.</p>
                  <button
                    onClick={() => { setSearchQuery(''); setPositionFilter('all'); }}
                    className="mt-3 text-sm text-primary-600 hover:text-primary-700 font-medium"
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredPlayers.map((player) => (
                    <PlayerRosterCard
                      key={player.id}
                      player={player}
                      onClick={() => setPeekPlayer(player)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              STATS TAB
          ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'stats' && (
            <div className="space-y-6">

              {/* Team overview cards */}
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Team Overview</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <TeamStatCard label="Players" value={String(players.length)} accent />
                  <TeamStatCard label="Team AVG" value={formatAvg(teamStats.teamAvg)} />
                  <TeamStatCard label="Team OBP" value={formatAvg(teamStats.teamOBP)} />
                  <TeamStatCard label="Team SLG" value={formatAvg(teamStats.teamSLG)} />
                  <TeamStatCard label="↑ Improving" value={String(teamStats.improving)} />
                  <TeamStatCard label="↓ Declining" value={String(teamStats.declining)} />
                </div>
              </div>

              {/* Game vs Scrimmage comparison */}
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                  Game vs Scrimmage
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {(['game', 'scrimmage'] as const).map((type) => {
                    const isGame = type === 'game';
                    const withData = players.filter((p) =>
                      isGame ? p.aggregates?.game_avg != null : p.aggregates?.practice_avg != null
                    );
                    const avgVal = withData.length > 0
                      ? withData.reduce((s, p) => s + (isGame ? (p.aggregates?.game_avg ?? 0) : (p.aggregates?.practice_avg ?? 0)), 0) / withData.length
                      : null;
                    return (
                      <div key={type} className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm p-5">
                        <div className="flex items-center gap-2 mb-3">
                          <span className={`w-2 h-2 rounded-full ${isGame ? 'bg-primary-500' : 'bg-blue-400'}`} />
                          <span className="text-sm font-semibold text-slate-900">
                            {isGame ? 'Game' : 'Scrimmage'}
                          </span>
                        </div>
                        <p className="text-3xl font-bold text-slate-900 tabular-nums">
                          {formatAvg(avgVal)}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">Team batting average</p>
                        <p className="text-xs text-slate-500 mt-3">
                          {withData.length} of {players.length} players with {isGame ? 'game' : 'scrimmage'} data
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Player performance table */}
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Player Performance</h3>
                  <div className="flex items-center gap-2 sm:ml-auto">
                    {/* Stat type filter */}
                    <div className="flex bg-white/70 border border-slate-200/60 rounded-xl p-0.5 gap-0.5">
                      {(['all', 'game', 'scrimmage'] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => setStatTypeFilter(t)}
                          className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                            statTypeFilter === t
                              ? 'bg-primary-600 text-white'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                        </button>
                      ))}
                    </div>
                    {/* Position filter */}
                    <select
                      value={positionFilter}
                      onChange={(e) => setPositionFilter(e.target.value as PositionFilter)}
                      className="px-2.5 py-1.5 bg-white/80 border border-slate-200/60 rounded-xl text-xs text-slate-700
                                 focus:outline-none focus:border-primary-400 transition-colors"
                    >
                      {positions.map((p) => (
                        <option key={p} value={p}>{p === 'all' ? 'All Pos' : p}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {players.length === 0 ? (
                  <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm p-10 text-center">
                    <p className="text-slate-500 text-sm">No player data available yet.</p>
                  </div>
                ) : (
                  <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50/60">
                            <th
                              className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide cursor-pointer hover:text-slate-700"
                              onClick={() => setStatSortKey('name')}
                            >
                              Player {statSortKey === 'name' && '↓'}
                            </th>
                            <th className="px-3 py-3 text-center text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Pos</th>
                            <th
                              className="px-3 py-3 text-center text-[11px] font-semibold text-slate-500 uppercase tracking-wide cursor-pointer hover:text-slate-700"
                              onClick={() => setStatSortKey('avg')}
                            >
                              AVG {statSortKey === 'avg' && '↓'}
                            </th>
                            <th
                              className="px-3 py-3 text-center text-[11px] font-semibold text-slate-500 uppercase tracking-wide cursor-pointer hover:text-slate-700"
                              onClick={() => setStatSortKey('ops')}
                            >
                              OPS {statSortKey === 'ops' && '↓'}
                            </th>
                            <th className="px-3 py-3 text-center text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Sessions</th>
                            <th
                              className="px-3 py-3 text-center text-[11px] font-semibold text-slate-500 uppercase tracking-wide cursor-pointer hover:text-slate-700"
                              onClick={() => setStatSortKey('trend')}
                            >
                              Trend {statSortKey === 'trend' && '↓'}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {statsTablePlayers.map((player) => {
                            const fullName = `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim();
                            const avg = statTypeFilter === 'game'
                              ? player.aggregates?.game_avg
                              : statTypeFilter === 'scrimmage'
                              ? player.aggregates?.practice_avg
                              : player.aggregates?.career_avg;
                            const ops = player.aggregates?.career_ops;
                            return (
                              <tr
                                key={player.id}
                                className="border-b border-slate-50 last:border-0 hover:bg-slate-50/80 cursor-pointer transition-colors"
                                onClick={() => setPeekPlayer(player)}
                              >
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2.5">
                                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center flex-shrink-0">
                                      <span className="text-[9px] font-bold text-white">
                                        {(player.first_name?.[0] ?? '') + (player.last_name?.[0] ?? '')}
                                      </span>
                                    </div>
                                    <span className="text-sm font-medium text-slate-900 truncate max-w-[120px]">
                                      {fullName || 'Unknown'}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-3 py-3 text-center">
                                  <span className="text-xs font-medium text-slate-500">
                                    {player.primary_position ?? '—'}
                                  </span>
                                </td>
                                <td className="px-3 py-3 text-center text-sm font-bold text-slate-900 tabular-nums">
                                  {formatAvg(avg)}
                                </td>
                                <td className="px-3 py-3 text-center text-sm text-slate-600 tabular-nums">
                                  {formatAvg(ops)}
                                </td>
                                <td className="px-3 py-3 text-center text-sm text-slate-500 tabular-nums">
                                  {player.aggregates?.total_sessions ?? 0}
                                </td>
                                <td className="px-3 py-3 text-center">
                                  <TrendIndicator trend={player.aggregates?.recent_trend} />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Peek panel */}
      <TeamPlayerPeekPanel player={peekPlayer} onClose={() => setPeekPlayer(null)} />
    </>
  );
}

'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { LazyMotion, domAnimation, m, useReducedMotion, AnimatePresence } from 'framer-motion';
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
  IconFilter,
  IconChevronDown,
} from '@/components/icons';
import type { BaseballRosterPlayer } from '@/lib/types';
import type { RiskFeedItem } from '@/lib/baseball/read-models/command-center';
import { Button } from '@/components/ui/button';
import { RiskFeedStrip } from './RiskFeedStrip';
import { DailyBriefPanel } from './DailyBriefPanel';

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
  coachId: string;
  coachName?: string;
  calendarEvents?: CalendarEvent[];
  riskFeed?: RiskFeedItem[];
  riskFeedError?: string | null;
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
      <span
        className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-1.5 py-0.5 text-eyebrow font-semibold text-primary-700"
        title="Improving"
      >
        <IconTrendingUp size={11} aria-hidden />
        <span className="sr-only">Trending up</span>
        Up
      </span>
    );
  }
  if (trend === 'declining') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-red-50 px-1.5 py-0.5 text-eyebrow font-semibold text-red-600"
        title="Declining"
      >
        <IconTrendingDown size={11} aria-hidden />
        <span className="sr-only">Trending down</span>
        Down
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-warm-50 px-1.5 py-0.5 text-eyebrow font-semibold text-warm-500"
      title="Stable"
    >
      <IconMinus size={11} aria-hidden />
      <span className="sr-only">Stable</span>
      Steady
    </span>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center px-2.5 py-1.5 bg-warm-50/80 rounded-lg ring-1 ring-warm-100/60">
      <span className="text-eyebrow font-semibold text-warm-400 uppercase tracking-wide">{label}</span>
      <span className="text-xs font-bold text-warm-800 tabular-nums">{value}</span>
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
    <Button variant="ghost"
      onClick={onClick}
      aria-label={`View ${fullName || 'player'} details`}
      className="w-full text-left bg-cream-100/75 backdrop-blur-glass border border-white/20 rounded-2xl p-4
                 shadow-glass hover:shadow-card-hover hover:-translate-y-0.5 hover:border-primary-200/60
                 focus-visible:ring-2 focus-visible:ring-primary-300 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-100
                 transition-[transform,box-shadow,border-color] duration-200 group motion-reduce:hover:translate-y-0 motion-reduce:transition-none"
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
                             bg-primary-600 text-white text-eyebrow font-bold rounded-full border-[1.5px] border-white">
              #{player.jersey_number}
            </span>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-warm-900 text-sm truncate">{fullName || 'Unknown'}</p>
            <TrendIndicator trend={trend} />
          </div>
          <p className="text-xs text-warm-500 mt-0.5">
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
    </Button>
  );
}

// ─── Team Stats Card ──────────────────────────────────────────────────────────

function TeamStatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div
      className={`rounded-2xl p-4 transition-shadow duration-200 ${
        accent
          ? 'bg-gradient-to-br from-primary-600 to-primary-700 text-white shadow-glass'
          : 'bg-cream-100/75 backdrop-blur-glass border border-white/20 shadow-glass hover:shadow-card-hover'
      }`}
    >
      <p className={`text-eyebrow font-semibold uppercase tracking-wide mb-1 ${accent ? 'text-primary-100' : 'text-warm-400'}`}>{label}</p>
      <p className={`text-2xl font-bold tabular-nums leading-none ${accent ? 'text-white' : 'text-warm-900'}`}>{value}</p>
      {sub && <p className={`text-xs mt-1 ${accent ? 'text-primary-200' : 'text-warm-400'}`}>{sub}</p>}
    </div>
  );
}

// ─── Sortable table header ────────────────────────────────────────────────────

type StatSortKey = 'name' | 'avg' | 'hr' | 'ops' | 'trend';

function SortableHeader({
  label,
  sortKey,
  activeKey,
  onSort,
  align = 'center',
  className = '',
}: {
  label: string;
  sortKey: StatSortKey;
  activeKey: StatSortKey;
  onSort: (k: StatSortKey) => void;
  align?: 'left' | 'center';
  className?: string;
}) {
  const isActive = activeKey === sortKey;
  return (
    <th
      scope="col"
      aria-sort={isActive ? 'descending' : 'none'}
      className={`py-0 ${align === 'left' ? 'text-left' : 'text-center'} ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`group inline-flex w-full items-center gap-1 py-3 text-eyebrow font-semibold uppercase tracking-wide transition-colors rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 ${
          align === 'left' ? 'justify-start' : 'justify-center'
        } ${isActive ? 'text-primary-600' : 'text-warm-500 hover:text-warm-700'}`}
      >
        {label}
        <IconChevronDown
          size={12}
          aria-hidden
          className={`transition-opacity ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'}`}
        />
      </button>
    </th>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CommandCenterClient({
  team,
  players,
  coachId: _coachId,
  coachName,
  calendarEvents = [],
  riskFeed = [],
  riskFeedError = null,
}: CommandCenterClientProps) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [activeTab, setActiveTab] = useState<MainTab>('roster');
  const [searchQuery, setSearchQuery] = useState('');
  const [positionFilter, setPositionFilter] = useState<PositionFilter>('all');
  const [sortOption, setSortOption] = useState<SortOption>('name');
  const [peekPlayer, setPeekPlayer] = useState<BaseballRosterPlayer | null>(null);
  const [statTypeFilter, setStatTypeFilter] = useState<StatTypeFilter>('all');
  const [statSortKey, setStatSortKey] = useState<StatSortKey>('avg');

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
      <div className="min-h-dvh bg-cream-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

          {/* ── Header ─────────────────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <p className="text-eyebrow font-semibold uppercase tracking-[0.14em] text-primary-600 mb-1">
                {team.name}
              </p>
              <h1 className="text-2xl sm:text-3xl font-bold text-warm-900 tracking-tight">Command Center</h1>
              <p className="text-warm-500 mt-1 text-sm">
                {players.length} player{players.length !== 1 ? 's' : ''} on your roster
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
                <Button variant="ghost" className="flex items-center gap-2 px-4 py-2 bg-cream-100/75 backdrop-blur-sm
                                   border border-white/20 rounded-xl text-sm font-medium text-warm-700
                                   hover:bg-white hover:shadow-sm transition-[background-color,box-shadow]">
                  <IconUpload size={16} />
                  <span className="hidden sm:inline">Upload Stats</span>
                </Button>
              </Link>
            </div>
          </div>

          {/* ── AI brief + risk strip (getCommandCenter read model) ─────── */}
          <div className="grid gap-5 lg:grid-cols-2 mb-6">
            <DailyBriefPanel
              items={riskFeed}
              coachName={coachName}
              error={riskFeedError}
              onOpenPlayer={(playerId) => router.push(`/baseball/dashboard/players/${playerId}`)}
            />
            <RiskFeedStrip
              items={riskFeed}
              error={riskFeedError}
              onOpenPlayer={(playerId) => router.push(`/baseball/dashboard/players/${playerId}`)}
              maxItems={6}
            />
          </div>

          {/* ── Mini Week Calendar Strip ────────────────────────────────── */}
          <div className="bg-cream-100/75 backdrop-blur-glass border border-white/20 rounded-2xl shadow-glass p-4 mb-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <IconCalendar size={15} className="text-warm-400" aria-hidden />
                <span className="text-eyebrow font-semibold text-warm-500 uppercase tracking-wide">This Week</span>
              </div>
              <Link
                href="/baseball/dashboard/calendar"
                className="rounded-md text-xs font-medium text-primary-600 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 transition-colors"
              >
                View Calendar →
              </Link>
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {weekDays.map((day) => {
                const dayEvents = eventsByDay.get(day.date.toDateString()) ?? [];
                const eventCount = dayEvents.length;
                const dateLabel = day.date.toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                });
                return (
                  <Button variant="ghost"
                    key={day.date.toISOString()}
                    onClick={() => router.push('/baseball/dashboard/calendar')}
                    aria-label={`${dateLabel}${day.isToday ? ' (today)' : ''}${eventCount > 0 ? `, ${eventCount} event${eventCount !== 1 ? 's' : ''}` : ', no events'}`}
                    aria-current={day.isToday ? 'date' : undefined}
                    className="flex flex-col items-center py-2.5 px-1 rounded-xl transition-colors group hover:bg-warm-50 focus-visible:ring-2 focus-visible:ring-primary-300"
                  >
                    <span className={`text-eyebrow font-semibold uppercase tracking-wide mb-1.5 ${
                      day.isToday ? 'text-primary-600' : 'text-warm-400'
                    }`}>
                      {day.dayLabel}
                    </span>
                    <span className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold transition-[color,background-color,box-shadow] ${
                      day.isToday
                        ? 'bg-primary-600 text-white shadow-sm'
                        : 'text-warm-700 group-hover:bg-warm-100'
                    }`}>
                      {day.dayNum}
                    </span>
                    {/* Event dots */}
                    <div className="flex gap-0.5 mt-1.5 h-1.5" aria-hidden>
                      {dayEvents.slice(0, 3).map((ev, i) => (
                        <span
                          key={ev.id ?? `dot-${i}`}
                          className={`w-1.5 h-1.5 rounded-full ${day.isToday ? 'bg-primary-400' : 'bg-warm-300'}`}
                        />
                      ))}
                    </div>
                  </Button>
                );
              })}
            </div>
          </div>

          {/* ── Tab Toggle ─────────────────────────────────────────────── */}
          <div
            role="tablist"
            aria-label="Command Center views"
            className="flex bg-cream-100/75 backdrop-blur-glass border border-warm-200/45 rounded-2xl p-1 gap-1 shadow-glass mb-6 w-fit"
          >
            {([
              { id: 'roster' as const, label: 'Roster', icon: <IconUsers size={15} aria-hidden /> },
              { id: 'stats' as const, label: 'Stats', icon: <IconChartBar size={15} aria-hidden /> },
            ]).map(({ id, label, icon }) => (
              <Button variant="primary"
                key={id}
                role="tab"
                id={`cc-tab-${id}`}
                aria-selected={activeTab === id}
                aria-controls={`cc-panel-${id}`}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium transition-[color,background-color,box-shadow] focus-visible:ring-2 focus-visible:ring-primary-300 ${
                  activeTab === id
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'text-warm-600 hover:text-warm-900 hover:bg-warm-50'
                }`}
              >
                {icon}
                {label}
              </Button>
            ))}
          </div>

          {/* ══════════════════════════════════════════════════════════════
              TAB PANELS — AnimatePresence fades out old, fades in new
          ══════════════════════════════════════════════════════════════ */}
          <LazyMotion features={domAnimation}>
            <AnimatePresence mode="wait">
          {activeTab === 'roster' && (
          <m.div
            key="roster"
            id="cc-panel-roster"
            role="tabpanel"
            aria-labelledby="cc-tab-roster"
            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
            style={{ willChange: 'opacity, transform' }}
            onAnimationComplete={() => {
              // release GPU hint once settled
              const el = document.getElementById('cc-panel-roster');
              if (el) el.style.willChange = 'auto';
            }}
          >
            <div className="space-y-5">

              {/* Search + filters row */}
              <div className="flex flex-col sm:flex-row gap-3">
                {/* Search */}
                <div className="relative flex-1 max-w-xs">
                  <label htmlFor="cc-roster-search" className="sr-only">Search players</label>
                  <IconSearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400 pointer-events-none" aria-hidden />
                  <input
                    id="cc-roster-search"
                    type="search"
                    placeholder="Search players…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-cream-100/82 border border-warm-200/80 rounded-xl
                               text-sm text-warm-900 placeholder:text-warm-400
                               focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 transition-colors"
                  />
                </div>

                {/* Position filter */}
                <label htmlFor="cc-roster-position" className="sr-only">Filter by position</label>
                <select
                  id="cc-roster-position"
                  value={positionFilter}
                  onChange={(e) => setPositionFilter(e.target.value as PositionFilter)}
                  className="px-3 py-2.5 bg-cream-100/82 border border-warm-200/80 rounded-xl text-sm text-warm-700
                             focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 transition-colors"
                >
                  {positions.map((p) => (
                    <option key={p} value={p}>{p === 'all' ? 'All Positions' : p}</option>
                  ))}
                </select>

                {/* Sort */}
                <label htmlFor="cc-roster-sort" className="sr-only">Sort players</label>
                <select
                  id="cc-roster-sort"
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value as SortOption)}
                  className="px-3 py-2.5 bg-cream-100/82 border border-warm-200/80 rounded-xl text-sm text-warm-700
                             focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 transition-colors"
                >
                  <option value="name">Sort: Name</option>
                  <option value="avg">Sort: AVG</option>
                  <option value="trend">Sort: Trend</option>
                </select>

                {/* Upload stats */}
                <Link href="/baseball/dashboard/stats/upload" className="sm:ml-auto">
                  <Button variant="ghost" className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-warm-500
                                     bg-cream-100/68 border border-warm-200/60 rounded-xl hover:bg-white transition-colors whitespace-nowrap">
                    <IconUpload size={14} aria-hidden />
                    Upload Stats
                  </Button>
                </Link>
              </div>

              {/* Empty state */}
              {players.length === 0 ? (
                <div className="bg-cream-100/75 backdrop-blur-glass border border-white/20 rounded-2xl shadow-glass p-14 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-primary-50 ring-1 ring-primary-100 flex items-center justify-center mx-auto mb-4">
                    <IconUsers size={24} className="text-primary-500" aria-hidden />
                  </div>
                  <h3 className="text-lg font-semibold text-warm-900 mb-2">No players yet</h3>
                  <p className="text-warm-500 mb-6 max-w-sm mx-auto text-sm leading-relaxed">
                    Share your join code and players will appear here the moment they
                    sign up. Stats and trends populate automatically after that.
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
                <div className="bg-cream-100/75 backdrop-blur-glass border border-white/20 rounded-2xl shadow-glass p-12 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-warm-100 flex items-center justify-center mx-auto mb-3.5">
                    <IconFilter size={20} className="text-warm-400" aria-hidden />
                  </div>
                  <h3 className="text-sm font-semibold text-warm-800 mb-1">No players match these filters</h3>
                  <p className="text-warm-500 text-sm mb-4 max-w-xs mx-auto">
                    Try a different search term or position, or clear everything to see
                    the full roster.
                  </p>
                  <Button variant="ghost"
                    onClick={() => { setSearchQuery(''); setPositionFilter('all'); }}
                    className="text-sm text-primary-600 hover:text-primary-700 hover:bg-primary-50 font-medium px-3 py-1.5 rounded-lg"
                  >
                    Clear filters
                  </Button>
                </div>
              ) : (
                  <m.div
                    className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4"
                    initial={reduceMotion ? false : 'hidden'}
                    animate="show"
                    variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
                  >
                    {filteredPlayers.map((player) => (
                      <m.div
                        key={player.id}
                        variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
                      >
                        <PlayerRosterCard
                          player={player}
                          onClick={() => setPeekPlayer(player)}
                        />
                      </m.div>
                    ))}
                  </m.div>
              )}
            </div>
          </m.div>
          )}

          {activeTab === 'stats' && (
          <m.div
            key="stats"
            id="cc-panel-stats"
            role="tabpanel"
            aria-labelledby="cc-tab-stats"
            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
            style={{ willChange: 'opacity, transform' }}
            onAnimationComplete={() => {
              const el = document.getElementById('cc-panel-stats');
              if (el) el.style.willChange = 'auto';
            }}
          >
            <div className="space-y-6">

              {/* Team overview cards */}
              <div>
                <h3 className="text-eyebrow font-semibold text-warm-500 uppercase tracking-wide mb-3">Team Overview</h3>
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
                <h3 className="text-eyebrow font-semibold text-warm-500 uppercase tracking-wide mb-3">
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
                      <div key={type} className="bg-cream-100/75 backdrop-blur-glass border border-white/20 rounded-2xl shadow-glass hover:shadow-card-hover transition-shadow duration-200 p-5">
                        <div className="flex items-center gap-2 mb-3">
                          <span className={`w-2 h-2 rounded-full ${isGame ? 'bg-primary-500' : 'bg-amber-500'}`} aria-hidden />
                          <span className="text-sm font-semibold text-warm-900">
                            {isGame ? 'Game' : 'Scrimmage'}
                          </span>
                        </div>
                        <p className="text-3xl font-bold text-warm-900 tabular-nums leading-none">
                          {formatAvg(avgVal)}
                        </p>
                        <p className="text-xs text-warm-400 mt-1.5">Team batting average</p>
                        {withData.length > 0 ? (
                          <p className="text-xs text-warm-500 mt-3">
                            {withData.length} of {players.length} player{players.length !== 1 ? 's' : ''} with {isGame ? 'game' : 'scrimmage'} data
                          </p>
                        ) : (
                          <p className="text-xs text-warm-400 mt-3 italic">
                            No {isGame ? 'game' : 'scrimmage'} data uploaded yet
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Player performance table */}
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
                  <h3 className="text-eyebrow font-semibold text-warm-500 uppercase tracking-wide">Player Performance</h3>
                  <div className="flex items-center gap-2 sm:ml-auto">
                    {/* Stat type filter */}
                    <div role="group" aria-label="Stat type" className="flex bg-cream-100/75 border border-warm-200/60 rounded-xl p-0.5 gap-0.5">
                      {(['all', 'game', 'scrimmage'] as const).map((t) => (
                        <Button variant="primary"
                          key={t}
                          aria-pressed={statTypeFilter === t}
                          onClick={() => setStatTypeFilter(t)}
                          className={`px-3 py-1 rounded-lg text-xs font-medium transition-[color,background-color] focus-visible:ring-2 focus-visible:ring-primary-300 ${
                            statTypeFilter === t
                              ? 'bg-primary-600 text-white'
                              : 'text-warm-600 hover:text-warm-900 hover:bg-warm-50'
                          }`}
                        >
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                        </Button>
                      ))}
                    </div>
                    {/* Position filter */}
                    <label htmlFor="cc-stats-position" className="sr-only">Filter by position</label>
                    <select
                      id="cc-stats-position"
                      value={positionFilter}
                      onChange={(e) => setPositionFilter(e.target.value as PositionFilter)}
                      className="px-2.5 py-1.5 bg-cream-100/82 border border-warm-200/60 rounded-xl text-xs text-warm-700
                                 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 transition-colors"
                    >
                      {positions.map((p) => (
                        <option key={p} value={p}>{p === 'all' ? 'All Pos' : p}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {players.length === 0 ? (
                  <div className="bg-cream-100/75 backdrop-blur-glass border border-white/20 rounded-2xl shadow-glass p-12 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-warm-100 flex items-center justify-center mx-auto mb-3.5">
                      <IconChartBar size={22} className="text-warm-400" aria-hidden />
                    </div>
                    <h4 className="text-sm font-semibold text-warm-800 mb-1">No performance data yet</h4>
                    <p className="text-warm-500 text-sm max-w-xs mx-auto">
                      Upload game and scrimmage stats and per-player batting numbers
                      will fill this table.
                    </p>
                  </div>
                ) : (
                  <div className="bg-cream-100/75 backdrop-blur-glass border border-white/20 rounded-2xl shadow-glass overflow-clip">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <caption className="sr-only">Player batting performance, sortable by column</caption>
                        <thead>
                          <tr className="border-b border-warm-100 bg-warm-50/60">
                            <SortableHeader
                              label="Player"
                              align="left"
                              sortKey="name"
                              activeKey={statSortKey}
                              onSort={setStatSortKey}
                              className="px-4"
                            />
                            <th scope="col" className="px-3 py-3 text-center text-eyebrow font-semibold text-warm-500 uppercase tracking-wide">Pos</th>
                            <SortableHeader label="AVG" sortKey="avg" activeKey={statSortKey} onSort={setStatSortKey} />
                            <SortableHeader label="OPS" sortKey="ops" activeKey={statSortKey} onSort={setStatSortKey} />
                            <th scope="col" className="px-3 py-3 text-center text-eyebrow font-semibold text-warm-500 uppercase tracking-wide">Sessions</th>
                            <SortableHeader label="Trend" sortKey="trend" activeKey={statSortKey} onSort={setStatSortKey} />
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
                                role="button"
                                tabIndex={0}
                                aria-label={`View ${fullName || 'player'} details`}
                                className="border-b border-warm-50 last:border-0 hover:bg-warm-50/80 cursor-pointer transition-colors focus:outline-none focus-visible:bg-primary-50/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-300"
                                onClick={() => setPeekPlayer(player)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setPeekPlayer(player);
                                  }
                                }}
                              >
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2.5">
                                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center flex-shrink-0">
                                      <span className="text-eyebrow font-bold text-white">
                                        {(player.first_name?.[0] ?? '') + (player.last_name?.[0] ?? '')}
                                      </span>
                                    </div>
                                    <span className="text-sm font-medium text-warm-900 truncate max-w-[120px]">
                                      {fullName || 'Unknown'}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-3 py-3 text-center">
                                  <span className="text-xs font-medium text-warm-500">
                                    {player.primary_position ?? '—'}
                                  </span>
                                </td>
                                <td className="px-3 py-3 text-center text-sm font-bold text-warm-900 tabular-nums">
                                  {formatAvg(avg)}
                                </td>
                                <td className="px-3 py-3 text-center text-sm text-warm-600 tabular-nums">
                                  {formatAvg(ops)}
                                </td>
                                <td className="px-3 py-3 text-center text-sm text-warm-500 tabular-nums">
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
          </m.div>
          )}

            </AnimatePresence>
          </LazyMotion>

        </div>
      </div>

      {/* Peek panel */}
      <TeamPlayerPeekPanel player={peekPlayer} onClose={() => setPeekPlayer(null)} />
    </>
  );
}

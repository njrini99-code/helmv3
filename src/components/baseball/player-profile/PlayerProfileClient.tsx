'use client';

import { useState, useMemo, useTransition } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
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
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
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
  IconMapPin,
  IconShieldCheck,
  IconDumbbell,
  IconList,
  IconCheck,
} from '@/components/icons';
import type { BaseballPlayerStats, BaseballPlayerAggregates, BaseballCoachInsight } from '@/lib/types';
import type { SnapshotHeader } from '@/lib/baseball/read-models/player-snapshot-cards';
import type { TimelineEventView } from '@/lib/baseball/read-models/timeline';
import { PlayerInsightsPanel } from './PlayerInsightsPanel';
import { PlayerNotesSection } from './PlayerNotesSection';
import { ProfileTimeline } from './ProfileTimeline';
import { SnapshotHeaderBand } from './snapshot-cards';
import { Button, IconButton } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { PlayerPerformanceTab } from '@/components/lifting/performance/PlayerPerformanceTab';
import { createCoachNote } from '@/app/baseball/actions/coach-notes';

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
  /**
   * Resolved Helm Lifting Lab org ID for the Performance tab.
   * Computed server-side via resolveBaseballLiftingOrg(teamId).
   * When absent the Performance tab renders an honest empty state.
   */
  liftingOrgId?: string | null;
  /**
   * Resolved Helm Lifting Lab athlete ID for the Performance tab.
   * Computed server-side via resolveBaseballAthleteIds(orgId, [playerId]).
   * When absent the Performance tab renders an honest empty state.
   */
  liftingAthleteId?: string | null;
  /**
   * V7 Snapshot header — feeds SnapshotHeaderBand rendered above the tabs.
   * Null when the viewer is not authorized staff or the read failed.
   */
  snapshotHeader?: SnapshotHeader | null;
  /** Chronological timeline events from getPlayerTimeline(). */
  timelineEvents?: TimelineEventView[];
  /** The role the timeline read model resolved for the viewer. */
  timelineViewerRole?: 'staff' | 'player' | 'none';
  /** Count of timeline events filtered out by visibility. */
  timelineHiddenCount?: number;
  /**
   * Per-event acknowledgement state for the CURRENT viewer (the coach), keyed by
   * timeline event id, from getTimelineAcksForViewer(). Read-only display on this
   * surface — coaches see whether an event has been acknowledged, they do not
   * toggle it (no `onToggleAck` is wired to ProfileTimeline here).
   */
  timelineAcks?: Record<string, boolean>;
  /** True when the viewer may author new coach notes. */
  notesCanAuthor?: boolean;
  /** Player tasks fetched from baseball_tasks via getPlayerTasks(). */
  tasks?: PlayerTask[];
}

/** Shape used for the Tasks tab — matches what page.tsx constructs from TaskWithAssignment. */
interface PlayerTask {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: string | null;
  category: string | null;
  created_at: string | null;
  assignment_status: string;
  completed_at: string | null;
}

type MainTab = 'overview' | 'stats' | 'videos' | 'performance' | 'passport' | 'timeline' | 'notes' | 'tasks';
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
    <div className="bg-cream-100/75 backdrop-blur-xl border border-warm-200/45 rounded-2xl p-4 shadow-sm">
      <p className="text-eyebrow font-medium text-warm-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-warm-900 tabular-nums leading-none">{value}</p>
      {sub && <p className="text-xs text-warm-400 mt-1">{sub}</p>}
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
      scope="col"
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`text-${align} text-xs font-semibold text-warm-500 uppercase tracking-wide`}
    >
      {/* A header-sized sort control; the Button primitive's fixed min-height + ripple
          would not fit a table heading row. */}
      {/* eslint-disable-next-line helm/no-raw-button */}
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`w-full px-3 py-3 inline-flex items-center gap-1 select-none transition-colors hover:text-warm-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 rounded-md ${
          align === 'left' ? 'justify-start' : 'justify-center'
        } ${active ? 'text-warm-800' : ''}`}
      >
        {label}
        <span aria-hidden="true" className={`inline-block transition-opacity ${active ? 'opacity-100' : 'opacity-0'}`}>
          {dir === 'asc' ? '↑' : '↓'}
        </span>
      </button>
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
    <div className="bg-cream-50/95 backdrop-blur-xl border border-warm-200/80 rounded-xl shadow-lg px-3 py-2.5 text-xs">
      <p className="font-medium text-warm-700 mb-1">{label}</p>
      <p className="text-warm-900 font-bold">{formatAvg(data?.value)}</p>
      <p className="text-warm-400 mt-0.5">
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
  liftingOrgId,
  liftingAthleteId,
  snapshotHeader,
  timelineEvents = [],
  timelineViewerRole,
  timelineHiddenCount = 0,
  timelineAcks,
  notesCanAuthor = false,
  tasks = [],
}: PlayerProfileClientProps) {
  const prefersReducedMotion = useReducedMotion();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<MainTab>('overview');
  // ── Note add form state ────────────────────────────────────────────────────
  const [noteBody, setNoteBody] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteSuccess, setNoteSuccess] = useState(false);
  const [isPendingNote, startNoteTransition] = useTransition();
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

  // ── Add note handler ─────────────────────────────────────────────────────
  function handleAddNote() {
    const body = noteBody.trim();
    if (!body) return;
    setNoteError(null);
    setNoteSuccess(false);
    startNoteTransition(async () => {
      const result = await createCoachNote({ playerId: player.id, body, scope: 'staff_public' });
      if (result.success) {
        setNoteBody('');
        setNoteSuccess(true);
        router.refresh();
      } else {
        setNoteError(result.error ?? 'Failed to save note.');
      }
    });
  }

  // ── Trend badge ─────────────────────────────────────────────────────────────
  const trend = aggregates?.recent_trend;
  const trendBadge = {
    improving: { label: 'Improving', icon: <IconTrendingUp size={14} />, cls: 'bg-primary-100 text-primary-700' },
    declining: { label: 'Declining', icon: <IconTrendingDown size={14} />, cls: 'bg-red-100 text-red-700' },
    stable: { label: 'Stable', icon: <IconMinus size={14} />, cls: 'bg-warm-100 text-warm-600' },
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
    <div className="min-h-dvh bg-cream-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">

        {/* ── Back button ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 mb-7">
          <Link
            href="/baseball/dashboard/command-center"
            className="flex items-center gap-2 text-warm-500 hover:text-warm-800 transition-colors group"
          >
            <span className="w-8 h-8 flex items-center justify-center rounded-xl bg-cream-100/82 border border-warm-200/80 shadow-sm group-hover:shadow transition-shadow">
              <IconArrowLeft size={16} />
            </span>
            <span className="text-sm font-medium hidden sm:inline">Back to Command Center</span>
          </Link>
          <span className="text-warm-300 hidden sm:inline">/</span>
          <span className="text-sm text-warm-400 hidden sm:inline truncate max-w-[200px]">{teamName}</span>
        </div>

        {/* ── Hero card ────────────────────────────────────────────────── */}
        <div className="bg-cream-100/75 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm mb-6 overflow-clip">
          {/* gradient accent bar */}
          <div className="h-1.5 w-full bg-gradient-to-r from-primary-500 via-primary-400 to-primary-400" />

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
                                   bg-primary-600 text-white text-eyebrow font-bold rounded-full border-2 border-white shadow">
                    #{player.jersey_number}
                  </span>
                )}
              </div>

              {/* Name + info */}
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-warm-900 leading-tight">
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
                    <span className="px-2.5 py-1 bg-warm-100 text-warm-600 text-xs font-semibold rounded-lg">
                      {player.secondary_position}
                    </span>
                  )}
                  {player.grad_year && (
                    <span className="px-2.5 py-1 bg-amber-100 text-amber-700 text-xs font-semibold rounded-lg">
                      Class of {player.grad_year}
                    </span>
                  )}
                  {player.gpa && (
                    <span className="px-2.5 py-1 bg-warm-100 text-warm-700 text-xs font-semibold rounded-lg">
                      GPA {player.gpa.toFixed(2)}
                    </span>
                  )}
                </div>

                {/* Physical + hometown row */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-sm text-warm-500">
                  {hometown && (
                    <span className="flex items-center gap-1">
                      <IconMapPin size={14} className="shrink-0 text-warm-400" />
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
            <div className="grid grid-cols-4 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-warm-100">
              <div className="text-center">
                <p className="text-eyebrow text-warm-400 uppercase tracking-wide">AVG</p>
                <p className="text-xl font-bold text-warm-900 mt-0.5 tabular-nums">
                  {formatAvg(aggregates?.career_avg)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-eyebrow text-warm-400 uppercase tracking-wide">OBP</p>
                <p className="text-xl font-bold text-warm-900 mt-0.5 tabular-nums">
                  {formatAvg(aggregates?.career_obp)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-eyebrow text-warm-400 uppercase tracking-wide">HR</p>
                <p className="text-xl font-bold text-warm-900 mt-0.5 tabular-nums">
                  {careerHR}
                </p>
              </div>
              <div className="text-center">
                <p className="text-eyebrow text-warm-400 uppercase tracking-wide">Sessions</p>
                <p className="text-xl font-bold text-warm-900 mt-0.5 tabular-nums">
                  {aggregates?.total_sessions ?? stats.length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Snapshot Header Band — V7 operating status strip ────────── */}
        {snapshotHeader && (
          <div className="mb-6">
            <SnapshotHeaderBand header={snapshotHeader} playerId={player.id} />
          </div>
        )}

        {/* ── Tabs ─────────────────────────────────────────────────────── */}
        <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1 scrollbar-hide" role="tablist" aria-label="Player sections">
          {([
            { id: 'overview' as const, label: 'Overview', icon: <IconChart size={15} /> },
            { id: 'stats' as const, label: 'Stats', icon: <IconActivity size={15} /> },
            { id: 'videos' as const, label: `Videos${videos.length > 0 ? ` (${videos.length})` : ''}`, icon: <IconVideo size={15} /> },
            { id: 'performance' as const, label: 'Performance', icon: <IconDumbbell size={15} /> },
            { id: 'passport' as const, label: 'Passport', icon: <IconShieldCheck size={15} /> },
            { id: 'timeline' as const, label: 'Timeline', icon: <IconActivity size={15} /> },
            { id: 'notes' as const, label: `Notes${notes.length > 0 ? ` (${notes.length})` : ''}`, icon: <IconNote size={15} /> },
            { id: 'tasks' as const, label: `Tasks${tasks.length > 0 ? ` (${tasks.length})` : ''}`, icon: <IconList size={15} /> },
          ]).map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <Button variant="ghost"
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                aria-controls={`pp-panel-${tab.id}`}
                id={`pp-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-[color,background-color,box-shadow] duration-200 whitespace-nowrap ${
                  isActive
                    ? 'bg-primary-600 text-white shadow-sm hover:bg-primary-600 hover:text-white'
                    : 'bg-cream-100/75 backdrop-blur-sm text-warm-600 hover:bg-cream-50 border border-warm-200/45 hover:shadow-sm'
                }`}
              >
                {tab.icon}
                {tab.label}
              </Button>
            );
          })}
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            TAB PANELS — animated with AnimatePresence
        ═══════════════════════════════════════════════════════════════ */}
        <AnimatePresence mode="wait">

        {/* ═══════════════════════════════════════════════════════════════
            OVERVIEW TAB
        ═══════════════════════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
        <motion.div
          key="panel-overview"
          role="tabpanel"
          id="pp-panel-overview"
          aria-labelledby="pp-tab-overview"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={prefersReducedMotion ? {} : { opacity: 0, y: -6 }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.18, ease: 'easeOut' }}
        >
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Main column */}
            <div className="lg:col-span-2 space-y-6">

              {/* Career stats grid */}
              <div className="bg-cream-100/75 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm p-6">
                <h3 className="font-semibold text-warm-900 mb-4">Career Statistics</h3>
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
                <div className="bg-cream-100/75 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-warm-900">Performance Trend</h3>
                      <p className="text-xs text-warm-400 mt-0.5">Batting average per session</p>
                    </div>
                    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${badge.cls}`}>
                      {badge.icon}
                      {badge.label}
                    </div>
                  </div>
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" strokeOpacity={0.6} vertical={false} />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 10, fill: '#78716c' }}
                          axisLine={{ stroke: '#e7e5e4' }}
                          tickLine={false}
                          interval="preserveStartEnd"
                          minTickGap={40}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: '#78716c' }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v: number) => formatAvg(v)}
                          domain={[0, 0.5]}
                          width={36}
                        />
                        <ReferenceLine y={0.3} stroke="#a8a29e" strokeDasharray="4 4" strokeWidth={1} />
                        <Tooltip content={<TrendTooltip />} />
                        <Line
                          type="monotone"
                          dataKey="avg"
                          stroke="#16a34a"
                          strokeWidth={2.5}
                          dot={{ r: 3, fill: '#16a34a', stroke: '#fff', strokeWidth: 1.5 }}
                          activeDot={{ r: 5, fill: '#16a34a', stroke: '#fff', strokeWidth: 2 }}
                          connectNulls
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex items-center gap-4 mt-3 text-xs text-warm-400">
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-0.5 rounded bg-primary-500 inline-block" />
                      Batting Average
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-0.5 inline-block" style={{ background: 'repeating-linear-gradient(90deg,#a8a29e,#a8a29e 3px,transparent 3px,transparent 6px)' }} />
                      .300 Line
                    </span>
                  </div>
                </div>
              )}

              {/* Advanced metrics — always shown; individual cards appear when data exists */}
              <div className="bg-cream-100/75 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm p-6">
                <h3 className="font-semibold text-warm-900 mb-4">Advanced Metrics</h3>
                {!pressureIndex && aggregates?.trend_magnitude == null && aggregates?.avg_exit_velocity == null ? (
                  <p className="text-sm text-warm-400 italic">Trend data not yet available — metrics populate after multiple sessions are logged.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {pressureIndex ? (
                      <div className="flex items-center gap-3 p-3.5 bg-warm-50 border border-warm-200/45 rounded-xl">
                        <div className="w-10 h-10 rounded-xl bg-warm-100 flex items-center justify-center flex-shrink-0">
                          <IconTarget size={18} className="text-warm-600" />
                        </div>
                        <div>
                          <p className="text-eyebrow font-semibold text-warm-500 uppercase tracking-wide">Pressure</p>
                          <p className="text-base font-bold text-warm-900">{pressureIndex}</p>
                          {aggregates?.pressure_gap != null && (
                            <p className="text-eyebrow text-warm-400">
                              {aggregates.pressure_gap > 0 ? '+' : ''}{(aggregates.pressure_gap * 1000).toFixed(0)} pts game vs scrimmage
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 p-3.5 bg-warm-50 border border-warm-200/45 rounded-xl opacity-50">
                        <div className="w-10 h-10 rounded-xl bg-warm-100 flex items-center justify-center flex-shrink-0">
                          <IconTarget size={18} className="text-warm-400" />
                        </div>
                        <div>
                          <p className="text-eyebrow font-semibold text-warm-400 uppercase tracking-wide">Pressure</p>
                          <p className="text-sm text-warm-400">Not yet available</p>
                        </div>
                      </div>
                    )}
                    {aggregates?.trend_magnitude != null ? (
                      <div className="flex items-center gap-3 p-3.5 bg-amber-50 border border-amber-200/45 rounded-xl">
                        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                          <IconActivity size={18} className="text-amber-600" />
                        </div>
                        <div>
                          <p className="text-eyebrow font-semibold text-amber-500 uppercase tracking-wide">Trend Velocity</p>
                          <p className="text-base font-bold text-warm-900">
                            {(aggregates.trend_magnitude * 100).toFixed(1)}%
                          </p>
                          <p className="text-eyebrow text-warm-400">Rate of change</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 p-3.5 bg-amber-50/50 border border-amber-200/25 rounded-xl opacity-50">
                        <div className="w-10 h-10 rounded-xl bg-amber-100/60 flex items-center justify-center flex-shrink-0">
                          <IconActivity size={18} className="text-amber-400" />
                        </div>
                        <div>
                          <p className="text-eyebrow font-semibold text-amber-400 uppercase tracking-wide">Trend Velocity</p>
                          <p className="text-sm text-warm-400">Not yet available</p>
                        </div>
                      </div>
                    )}
                    {aggregates?.avg_exit_velocity != null ? (
                      <div className="flex items-center gap-3 p-3.5 bg-primary-50 border border-primary-200/45 rounded-xl">
                        <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
                          <IconBolt size={18} className="text-primary-600" />
                        </div>
                        <div>
                          <p className="text-eyebrow font-semibold text-primary-600 uppercase tracking-wide">Exit Velocity</p>
                          <p className="text-base font-bold text-warm-900">
                            {aggregates.avg_exit_velocity.toFixed(1)} mph
                          </p>
                          {aggregates.max_exit_velocity && (
                            <p className="text-eyebrow text-warm-400">
                              Max {aggregates.max_exit_velocity.toFixed(1)} mph
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 p-3.5 bg-primary-50/50 border border-primary-200/25 rounded-xl opacity-50">
                        <div className="w-10 h-10 rounded-xl bg-primary-100/60 flex items-center justify-center flex-shrink-0">
                          <IconBolt size={18} className="text-primary-400" />
                        </div>
                        <div>
                          <p className="text-eyebrow font-semibold text-primary-400 uppercase tracking-wide">Exit Velocity</p>
                          <p className="text-sm text-warm-400">Not yet available</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Recent videos preview */}
              {videos.length > 0 && (
                <div className="bg-cream-100/75 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-warm-900">Videos</h3>
                    <Button variant="ghost"
                      onClick={() => setActiveTab('videos')}
                      className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
                    >
                      View all ({videos.length}) <IconChevronRight size={13} />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {videos.slice(0, 4).map((v) => (
                      <Button variant="ghost"
                        key={v.id}
                        onClick={() => { setSelectedVideo(v); setActiveTab('videos'); }}
                        aria-label={`Play ${v.title ?? 'video'}`}
                        className="group relative aspect-video rounded-xl overflow-hidden bg-warm-100 p-0 min-h-0 hover:ring-2 hover:ring-primary-500 transition-shadow"
                      >
                        {v.thumbnail_url ? (
                          <Image src={v.thumbnail_url} alt={v.title ?? 'Video'} fill className="object-cover" />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-warm-200 to-warm-300">
                            <IconVideo size={20} className="text-warm-400" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center">
                          <div className="w-9 h-9 rounded-full bg-cream-50/92 flex items-center justify-center opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 transition-[opacity,transform]">
                            <IconPlay size={16} className="text-warm-900 ml-0.5" />
                          </div>
                        </div>
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">

              {/* AI Insights */}
              <div className="bg-cream-100/75 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm p-6">
                <h3 className="font-semibold text-warm-900 flex items-center gap-2 mb-4">
                  <IconSparkles size={16} className="text-primary-600" />
                  AI Insights
                  {insights.length > 0 && (
                    <span className="ml-auto text-xs font-medium px-2 py-0.5 bg-primary-100 text-primary-700 rounded-full">
                      {insights.length}
                    </span>
                  )}
                </h3>
                <PlayerInsightsPanel insights={insights.slice(0, 3)} />
                {insights.length > 3 && (
                  <p className="text-xs text-warm-400 text-center mt-3">
                    +{insights.length - 3} more insights
                  </p>
                )}
              </div>

              {/* Notes */}
              <div className="bg-cream-100/75 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-warm-900 flex items-center gap-2">
                    <IconNote size={15} className="text-warm-400" />
                    Coach Notes
                  </h3>
                  {notesCanAuthor && (
                    <Button
                      variant="ghost"
                      onClick={() => setActiveTab('notes')}
                      className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 transition-colors font-medium"
                    >
                      <IconPlus size={13} />
                      Add
                    </Button>
                  )}
                </div>
                <PlayerNotesSection notes={notes.slice(0, 3)} compact />
              </div>

              {/* Session breakdown */}
              <div className="bg-cream-100/75 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm p-6">
                <h3 className="font-semibold text-warm-900 mb-4">Sessions</h3>
                <div className="space-y-3">
                  {[
                    { label: 'Game', count: stats.filter((s) => s.stat_type === 'game').length, color: 'bg-primary-500' },
                    { label: 'Practice / Scrimmage', count: stats.filter((s) => s.stat_type === 'practice').length, color: 'bg-primary-300' },
                    { label: 'Other', count: stats.filter((s) => s.stat_type !== 'game' && s.stat_type !== 'practice').length, color: 'bg-warm-300' },
                  ].map(({ label, count, color }) => (
                    <div key={label} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
                        <span className="text-sm text-warm-600">{label}</span>
                      </div>
                      <span className="text-sm font-semibold text-warm-900">{count}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-2 border-t border-warm-100">
                    <span className="text-sm font-medium text-warm-700">Total</span>
                    <span className="text-sm font-bold text-primary-600">{stats.length}</span>
                  </div>
                </div>
                <Button variant="primary"
                  onClick={() => setActiveTab('stats')}
                  className="flex items-center justify-center gap-1 w-full mt-4 py-2 text-xs font-medium text-primary-600
                             bg-primary-50 hover:bg-primary-100 rounded-xl transition-colors"
                >
                  View all stats <IconChevronRight size={12} />
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            STATS TAB
        ═══════════════════════════════════════════════════════════════ */}
        {activeTab === 'stats' && (
        <motion.div
          key="panel-stats"
          role="tabpanel"
          id="pp-panel-stats"
          aria-labelledby="pp-tab-stats"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={prefersReducedMotion ? {} : { opacity: 0, y: -6 }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.18, ease: 'easeOut' }}
        >
          <div className="space-y-5">

            {/* Season stats banner — links to box score stats page */}
            <Link
              href={`/baseball/dashboard/players/${player.id}/stats`}
              className="flex items-center justify-between bg-primary-50 border border-primary-100 rounded-2xl px-5 py-3.5 hover:bg-primary-100 transition-colors group"
            >
              <div>
                <p className="text-xs font-semibold text-primary-700 uppercase tracking-wide mb-0.5">
                  Season Stats (Box Score)
                </p>
                <p className="text-xs text-primary-600">
                  AVG · OBP · SLG · OPS · ERA · WHIP · game log
                </p>
              </div>
              <span className="text-primary-600 text-sm font-medium group-hover:translate-x-1 transition-transform">
                View →
              </span>
            </Link>

            {/* Filter toggle */}
            <div className="flex items-center gap-2">
              <div className="flex bg-cream-100/75 backdrop-blur-sm border border-warm-200/45 rounded-xl p-1 gap-1 shadow-sm" role="group" aria-label="Filter sessions by type">
                {(['all', 'game', 'practice'] as const).map((f) => (
                  <Button variant="ghost"
                    key={f}
                    onClick={() => setStatFilter(f)}
                    aria-pressed={statFilter === f}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium min-h-0 transition-[color,background-color,box-shadow] ${
                      statFilter === f
                        ? 'bg-primary-600 text-white shadow-sm hover:bg-primary-600 hover:text-white'
                        : 'text-warm-600 hover:text-warm-900'
                    }`}
                  >
                    {f === 'all' ? 'All' : f === 'game' ? 'Game' : 'Scrimmage'}
                  </Button>
                ))}
              </div>
              <span className="text-xs text-warm-400">{filteredStats.length} sessions</span>
            </div>

            {/* Summary row */}
            {filteredStats.length > 0 && (
              <div className="bg-cream-100/75 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm p-4">
                <p className="text-eyebrow font-semibold text-warm-400 uppercase tracking-wide mb-3">
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
                      <p className="text-eyebrow text-warm-400 uppercase">{label}</p>
                      <p className="text-base font-bold text-warm-900 tabular-nums">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Stats table */}
            {filteredStats.length === 0 ? (
              <div className="bg-cream-100/75 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm p-12 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary-50 to-primary-100 text-primary-600/80">
                  <IconActivity size={28} />
                </div>
                <p className="font-semibold text-warm-900">No stats for this filter</p>
                <p className="mt-1 text-sm leading-relaxed text-warm-500">Switch to “All” to see every session.</p>
              </div>
            ) : (
              <div className="bg-cream-100/75 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm overflow-clip">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-warm-100 bg-warm-50/80">
                        <SortHeader label="Date" sortKey="date" currentKey={sortKey} dir={sortDir} onSort={handleSort} align="left" />
                        <th className="px-3 py-3 text-left text-xs font-semibold text-warm-500 uppercase tracking-wide">Type</th>
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
                            className="border-b border-warm-50 last:border-0 hover:bg-warm-50/80 transition-colors"
                          >
                            <td className="px-3 py-3 text-sm text-warm-700 whitespace-nowrap">
                              {formatDate(stat.session_date)}
                            </td>
                            <td className="px-3 py-3">
                              <span
                                className={`px-2 py-0.5 text-eyebrow font-semibold rounded-md whitespace-nowrap ${
                                  stat.stat_type === 'game'
                                    ? 'bg-primary-100 text-primary-700'
                                    : stat.stat_type === 'practice'
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-warm-100 text-warm-600'
                                }`}
                              >
                                {stat.stat_type === 'practice' ? 'Scrimmage' : stat.stat_type}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-center text-sm text-warm-600 tabular-nums">{stat.at_bats ?? '—'}</td>
                            <td className="px-3 py-3 text-center text-sm text-warm-600 tabular-nums">{stat.hits ?? '—'}</td>
                            <td className="px-3 py-3 text-center text-sm font-semibold text-warm-900 tabular-nums">
                              {formatAvg(sessionAvg)}
                            </td>
                            <td className="px-3 py-3 text-center text-sm text-warm-600 tabular-nums">{stat.home_runs ?? '—'}</td>
                            <td className="px-3 py-3 text-center text-sm text-warm-600 tabular-nums">{stat.rbis ?? '—'}</td>
                            <td className="px-3 py-3 text-center text-sm text-warm-600 tabular-nums">{stat.walks ?? '—'}</td>
                            <td className="px-3 py-3 text-center text-sm text-warm-600 tabular-nums">{stat.strikeouts ?? '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </motion.div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            VIDEOS TAB
        ═══════════════════════════════════════════════════════════════ */}
        {activeTab === 'videos' && (
        <motion.div
          key="panel-videos"
          role="tabpanel"
          id="pp-panel-videos"
          aria-labelledby="pp-tab-videos"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={prefersReducedMotion ? {} : { opacity: 0, y: -6 }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.18, ease: 'easeOut' }}
        >
          <div className="space-y-5">

            {/* Sub-tabs */}
            {videoTabs.length > 1 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                <div className="flex bg-cream-100/75 backdrop-blur-sm border border-warm-200/45 rounded-xl p-1 gap-1 shadow-sm" role="group" aria-label="Filter videos by type">
                  {videoTabs.map(({ key, label }) => (
                    <Button variant="ghost"
                      key={key}
                      onClick={() => setVideoFilter(key)}
                      aria-pressed={videoFilter === key}
                      className={`px-4 py-1.5 rounded-lg text-sm font-medium min-h-0 transition-[color,background-color,box-shadow] whitespace-nowrap ${
                        videoFilter === key
                          ? 'bg-primary-600 text-white shadow-sm hover:bg-primary-600 hover:text-white'
                          : 'text-warm-600 hover:text-warm-900'
                      }`}
                    >
                      {label}
                      {key !== 'all' && (videoTypeCounts[key] ?? 0) > 0 && (
                        <span className={`ml-1.5 text-eyebrow px-1.5 py-0.5 rounded-full ${
                          videoFilter === key ? 'glass-standard text-white' : 'bg-warm-100 text-warm-500'
                        }`}>
                          {videoTypeCounts[key]}
                        </span>
                      )}
                      {key === 'all' && (
                        <span className={`ml-1.5 text-eyebrow px-1.5 py-0.5 rounded-full ${
                          videoFilter === 'all' ? 'glass-standard text-white' : 'bg-warm-100 text-warm-500'
                        }`}>
                          {videos.length}
                        </span>
                      )}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Video grid / empty state */}
            {videosByFilter.length === 0 ? (
              <div className="bg-cream-100/75 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm p-12 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary-50 to-primary-100 text-primary-600/80">
                  <IconVideo size={28} />
                </div>
                <p className="font-semibold text-warm-900">No videos uploaded yet</p>
                <p className="mt-1 text-sm leading-relaxed text-warm-500">
                  Videos will appear here once the player uploads them.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {videosByFilter.map((video) => (
                  <Button variant="ghost"
                    key={video.id}
                    onClick={() => setSelectedVideo(video)}
                    aria-label={`Play ${video.title ?? 'video'}`}
                    className="group relative aspect-video rounded-2xl overflow-hidden bg-warm-100 p-0 min-h-0
                               hover:ring-2 hover:ring-primary-500 hover:shadow-md transition-shadow duration-200"
                  >
                    {video.thumbnail_url ? (
                      <Image
                        src={video.thumbnail_url}
                        alt={video.title ?? 'Video thumbnail'}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-warm-200 to-warm-300">
                        <IconVideo size={28} className="text-warm-400" />
                      </div>
                    )}

                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                      <div className="w-12 h-12 rounded-full bg-cream-50/92 flex items-center justify-center
                                      opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 transition-[opacity,transform] duration-200">
                        <IconPlay size={20} className="text-warm-900 ml-0.5" />
                      </div>
                    </div>

                    {/* Type badge */}
                    {video.video_type && (
                      <div className="absolute top-2 left-2">
                        <span className="px-2 py-0.5 text-eyebrow font-semibold bg-black/50 text-white rounded-md capitalize">
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
                  </Button>
                ))}
              </div>
            )}
          </div>
        </motion.div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            PERFORMANCE TAB
        ═══════════════════════════════════════════════════════════════ */}
        {activeTab === 'performance' && (
        <motion.div
          key="panel-performance"
          role="tabpanel"
          id="pp-panel-performance"
          aria-labelledby="pp-tab-performance"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={prefersReducedMotion ? {} : { opacity: 0, y: -6 }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.18, ease: 'easeOut' }}
        >
          {liftingOrgId && liftingAthleteId ? (
            <PlayerPerformanceTab orgId={liftingOrgId} athleteId={liftingAthleteId} />
          ) : (
            <div className="bg-cream-100/75 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm p-12 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary-50 to-primary-100 text-primary-600/80">
                <IconDumbbell size={28} />
              </div>
              <p className="font-semibold text-warm-900">No performance data yet</p>
              {!liftingOrgId ? (
                <p className="mt-1 text-sm leading-relaxed text-warm-500">
                  Set up Helm Lifting Lab for this team to unlock performance tracking.
                </p>
              ) : (
                <p className="mt-1 text-sm leading-relaxed text-warm-500">
                  This player&apos;s lifting athlete record has not been created yet.
                </p>
              )}
            </div>
          )}
        </motion.div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            PASSPORT TAB
        ═══════════════════════════════════════════════════════════════ */}
        {activeTab === 'passport' && (
        <motion.div
          key="panel-passport"
          role="tabpanel"
          id="pp-panel-passport"
          aria-labelledby="pp-tab-passport"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={prefersReducedMotion ? {} : { opacity: 0, y: -6 }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.18, ease: 'easeOut' }}
        >
          <div className="space-y-6">
            {/* Passport summary entry — links into the dedicated full surface */}
            <div className="bg-cream-100/75 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
                    <IconShieldCheck size={20} className="text-primary-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-warm-900">Player Passport</h3>
                    <p className="text-sm text-warm-500 mt-0.5">
                      Source-backed proof: measurables, development story, video, and performance
                      with full provenance for roster evaluation.
                    </p>
                  </div>
                </div>
                <Link
                  href={`/baseball/dashboard/players/${player.id}/passport`}
                  className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold transition-colors shadow-sm"
                >
                  <IconShieldCheck size={14} />
                  View passport
                </Link>
              </div>
            </div>

            {/* Scout Packet entry — links into the dedicated share surface */}
            <div className="bg-cream-100/75 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-warm-100 flex items-center justify-center flex-shrink-0">
                    <IconShieldCheck size={20} className="text-warm-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-warm-900">Scout Packet</h3>
                    <p className="text-sm text-warm-500 mt-0.5">
                      Mint revocable share links for college scouts. Control exactly
                      what a scout sees and track packet access.
                    </p>
                  </div>
                </div>
                <Link
                  href={`/baseball/dashboard/players/${player.id}/scout-packet`}
                  className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cream-100/75 hover:bg-warm-50 border border-warm-200/60 text-warm-700 text-sm font-semibold transition-colors shadow-sm"
                >
                  Manage
                  <IconChevronRight size={14} />
                </Link>
              </div>
            </div>

            {/* Visibility hint */}
            <p className="text-xs text-warm-400 text-center px-4">
              Passport visibility and scout-packet sharing are managed on the full passport surface.
              Changes take effect immediately across all active share links.
            </p>
          </div>
        </motion.div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            TIMELINE TAB
        ═══════════════════════════════════════════════════════════════ */}
        {activeTab === 'timeline' && (
        <motion.div
          key="panel-timeline"
          role="tabpanel"
          id="pp-panel-timeline"
          aria-labelledby="pp-tab-timeline"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={prefersReducedMotion ? {} : { opacity: 0, y: -6 }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.18, ease: 'easeOut' }}
        >
          <ProfileTimeline
            events={timelineEvents}
            viewerRole={timelineViewerRole}
            hiddenCount={timelineHiddenCount}
            acknowledged={timelineAcks}
          />
        </motion.div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            NOTES TAB
        ═══════════════════════════════════════════════════════════════ */}
        {activeTab === 'notes' && (
        <motion.div
          key="panel-notes"
          role="tabpanel"
          id="pp-panel-notes"
          aria-labelledby="pp-tab-notes"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={prefersReducedMotion ? {} : { opacity: 0, y: -6 }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.18, ease: 'easeOut' }}
        >
          <div className="space-y-5">
            {/* Add note form — staff only */}
            {notesCanAuthor && (
              <div className="bg-cream-100/75 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm p-6">
                <h3 className="font-semibold text-warm-900 mb-4 flex items-center gap-2">
                  <IconPlus size={15} className="text-primary-600" />
                  Add Note
                </h3>
                <Textarea
                  value={noteBody}
                  onChange={(e) => { setNoteBody(e.target.value); setNoteSuccess(false); }}
                  placeholder="Write a coaching observation…"
                  rows={4}
                  disabled={isPendingNote}
                />
                <div className="flex items-center justify-between mt-3">
                  <div>
                    {noteError && (
                      <p className="text-xs text-red-600">{noteError}</p>
                    )}
                    {noteSuccess && (
                      <p className="text-xs text-primary-600 flex items-center gap-1">
                        <IconCheck size={13} />
                        Note saved
                      </p>
                    )}
                  </div>
                  <Button
                    variant="primary"
                    onClick={handleAddNote}
                    disabled={isPendingNote || !noteBody.trim()}
                    className="px-5 py-2 text-sm font-semibold"
                  >
                    {isPendingNote ? 'Saving…' : 'Save Note'}
                  </Button>
                </div>
              </div>
            )}

            {/* Notes list */}
            <div className="bg-cream-100/75 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm p-6">
              <h3 className="font-semibold text-warm-900 mb-4 flex items-center gap-2">
                <IconNote size={15} className="text-warm-400" />
                Coach Notes
                {notes.length > 0 && (
                  <span className="ml-auto text-xs font-medium px-2 py-0.5 bg-warm-100 text-warm-600 rounded-full">
                    {notes.length}
                  </span>
                )}
              </h3>
              <PlayerNotesSection notes={notes} compact={false} />
            </div>
          </div>
        </motion.div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            TASKS TAB
        ═══════════════════════════════════════════════════════════════ */}
        {activeTab === 'tasks' && (
        <motion.div
          key="panel-tasks"
          role="tabpanel"
          id="pp-panel-tasks"
          aria-labelledby="pp-tab-tasks"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={prefersReducedMotion ? {} : { opacity: 0, y: -6 }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.18, ease: 'easeOut' }}
        >
          <div className="bg-cream-100/75 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm overflow-clip">
            <div className="flex items-center justify-between px-6 py-4 border-b border-warm-100">
              <h3 className="font-semibold text-warm-900 flex items-center gap-2">
                <IconList size={15} className="text-warm-400" />
                Tasks
              </h3>
              {tasks.length > 0 && (
                <span className="text-xs font-medium px-2 py-0.5 bg-warm-100 text-warm-600 rounded-full">
                  {tasks.length}
                </span>
              )}
            </div>

            {tasks.length === 0 ? (
              <div className="p-12 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary-50 to-primary-100 text-primary-600/80">
                  <IconList size={24} />
                </div>
                <p className="font-semibold text-warm-900">No tasks assigned</p>
                <p className="mt-1 text-sm leading-relaxed text-warm-500">
                  Tasks assigned to this player will appear here.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-warm-50">
                {tasks.map((task) => {
                  const isOverdue =
                    task.due_date &&
                    new Date(task.due_date) < new Date() &&
                    task.assignment_status !== 'completed';
                  return (
                    <li key={task.id} className="px-6 py-4 flex items-start gap-3 hover:bg-warm-50/60 transition-colors">
                      <span
                        className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${
                          task.assignment_status === 'completed'
                            ? 'bg-primary-500'
                            : isOverdue
                            ? 'bg-red-400'
                            : 'bg-warm-300'
                        }`}
                        aria-hidden="true"
                      />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium leading-snug ${
                          task.assignment_status === 'completed'
                            ? 'line-through text-warm-400'
                            : 'text-warm-900'
                        }`}>
                          {task.title}
                        </p>
                        {task.description && (
                          <p className="text-xs text-warm-500 mt-0.5 line-clamp-2">
                            {task.description}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          {task.due_date && (
                            <span className={`text-xs ${isOverdue ? 'text-red-500 font-medium' : 'text-warm-400'}`}>
                              Due {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                          {task.priority && (
                            <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${
                              task.priority === 'high'
                                ? 'bg-red-100 text-red-700'
                                : task.priority === 'medium'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-warm-100 text-warm-600'
                            }`}>
                              {task.priority}
                            </span>
                          )}
                          <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium capitalize ${
                            task.assignment_status === 'completed'
                              ? 'bg-primary-100 text-primary-700'
                              : isOverdue
                              ? 'bg-red-50 text-red-600'
                              : 'bg-warm-100 text-warm-600'
                          }`}>
                            {task.assignment_status}
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </motion.div>
        )}

        </AnimatePresence>

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
            transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.2 })}
            className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedVideo(null)}
          >
            <motion.div
              key="video-modal"
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={prefersReducedMotion ? { duration: 0 } : ({ type: 'spring', stiffness: 400, damping: 32 })}
              className="relative w-full max-w-4xl bg-warm-900 rounded-2xl overflow-hidden shadow-2xl"
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              {/* Close button */}
              <IconButton variant="default" aria-label="Close"
                onClick={() => setSelectedVideo(null)}
                className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-black/50 text-white
                           hover:bg-black/70 flex items-center justify-center transition-colors"
              >
                <IconX size={18} />
              </IconButton>

              {/* Video player */}
              <div className="aspect-video bg-black">
                {selectedVideo.video_url ? (
                  // eslint-disable-next-line jsx-a11y/media-has-caption -- user-uploaded video, no captions available
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
                    <IconVideo size={40} className="text-warm-600" />
                    <p className="text-warm-400 text-sm">Video unavailable</p>
                  </div>
                )}
              </div>

              {/* Video info footer */}
              <div className="px-5 py-4 bg-warm-900">
                <h3 className="font-semibold text-white text-base">
                  {selectedVideo.title ?? 'Untitled Video'}
                </h3>
                <div className="flex items-center gap-3 mt-1.5 text-sm text-warm-400">
                  <span className="flex items-center gap-1.5">
                    <IconClock size={13} />
                    {formatDate(selectedVideo.created_at)}
                  </span>
                  {selectedVideo.video_type && (
                    <span className="px-2 py-0.5 bg-warm-800 rounded-md capitalize text-xs">
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

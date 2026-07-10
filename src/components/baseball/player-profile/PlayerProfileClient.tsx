'use client';

import { useState, useMemo, useTransition, type ReactNode } from 'react';
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
  IconPlay,
  IconClock,
  IconPlus,
  IconChevronRight,
  IconShieldCheck,
  IconX,
} from '@/components/icons';
import type {
  BaseballCoachInsight,
  BaseballPlayerSeasonStats,
  BaseballBoxScoreBatting,
  BaseballBoxScorePitching,
  BaseballGame,
} from '@/lib/types';
import type { BaseballNoteScope } from '@/lib/types/baseball-extended';
import type { SnapshotHeader } from '@/lib/baseball/read-models/player-snapshot-cards';
import type { TimelineEventView } from '@/lib/baseball/read-models/timeline';
import { cn } from '@/lib/utils';
import {
  PaperCard,
  Masthead,
  Eyebrow,
  HairlineRule,
  InkBadge,
  RuledStatLine,
  StatReadout,
  EditorsLetter,
  Reveal,
  pressableClass,
} from '@/components/baseball/living-annual';
import { InlineNotice } from '@/components/fairway';
import { PlayerInsightsPanel } from './PlayerInsightsPanel';
import { PlayerNotesSection } from './PlayerNotesSection';
import { ProfileTimeline } from './ProfileTimeline';
import { PlayerGameLog } from '@/components/baseball/season-stats/PlayerGameLog';
import { SnapshotHeaderBand } from './snapshot-cards';
import { Button, IconButton } from '@/components/ui/button';
import { VideoPlayer } from '@/components/features/video-player';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/select';
import { PlayerPerformanceTab } from '@/components/lifting/performance/PlayerPerformanceTab';
import { createCoachNote } from '@/app/baseball/actions/coach-notes';

// =============================================================================
// PlayerProfileClient — MIGRATED to "The Living Annual" kit
// (design-system-living-annual.md §6 P0 #1 "The Player Passport Spread" idiom,
// applied to the coach-facing player profile island).
//
// PRESENTATION ONLY. Every backdrop-blur card is now a `<PaperCard>`, the
// gradient accent bar + gradient avatar are gone, trend/class/priority
// semantics route through `<InkBadge>` tones + graphite/green ink instead of
// raw amber/red, and the tab bar is the same Fairway-pattern tab system used
// elsewhere in baseball (raw `<button role="tab">` + `pressableClass` +
// `<InkBadge>`, with per-tab counts as a trailing `<InkBadge>`). Every empty
// state renders through `<EditorsLetter>` per the kit's empty-state doctrine.
//
// Data wiring, handlers, computed values, and prop contracts are unchanged.
// =============================================================================

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
  /**
   * Box-score-canonical season totals (baseball_player_season_stats via
   * recalculate_baseball_season_stats), current season year. Null when the
   * player has no season row yet (no box score saved this season). This is
   * the SAME source /players/[id]/stats reads — a coach's box-score save
   * updates this and the profile now reflects it immediately.
   */
  seasonStats: BaseballPlayerSeasonStats | null;
  /**
   * Box-score-canonical per-game batting log for the current season
   * (baseball_box_score_batting joined to baseball_games), most-recent-first
   * from getPlayerSeasonStats(). Drives the trend chart, game/scrimmage
   * split, last-5 average, and the Stats tab's session table — all derived
   * from real saved box scores instead of the deprecated flat stat log.
   */
  battingLog: Array<BaseballBoxScoreBatting & { game: Partial<BaseballGame> }>;
  /**
   * Box-score-canonical per-game pitching log for the current season
   * (baseball_box_score_pitching joined to baseball_games), same source and
   * shape contract as `battingLog` from getPlayerSeasonStats(). Renders via
   * the shared `PlayerGameLog` (same component /players/[id]/stats uses) in
   * the Stats tab so pitcher profiles show their own per-game history instead
   * of only ever reflecting batting.
   */
  pitchingLog: Array<BaseballBoxScorePitching & { game: Partial<BaseballGame> }>;
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
    is_clip?: boolean | null;
    clip_start_time?: number | null;
    clip_end_time?: number | null;
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
   * Per-event acknowledgement state for the SUBJECT PLAYER (not the viewing
   * coach), keyed by timeline event id, from getTimelineAcksForSubjectPlayer().
   * Read-only display on this surface — coaches see whether the player has
   * acknowledged an event, they do not toggle it (no `onToggleAck` is wired to
   * ProfileTimeline here).
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
type StatFilter = 'all' | 'game' | 'scrimmage';
type VideoFilter = 'all' | 'game' | 'scrimmage' | 'practice';
type StatSortKey = 'date' | 'ab' | 'h' | 'hr' | 'rbi' | 'bb' | 'so' | 'avg';
type SortDir = 'asc' | 'desc';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAvg(v: number | null | undefined): string {
  if (v == null) return '—';
  return v.toFixed(3).replace(/^0\./, '.');
}

// baseball_games.game_date is a `date` column — a bare YYYY-MM-DD value.
// `new Date(iso)` parses a bare date as UTC midnight, which renders a day
// early in any US timezone. Parse it as LOCAL midnight instead (matches
// BoxScoreView.tsx / BoxScoreEntry.tsx). Other callers here (e.g. video
// created_at) pass full timestamps, which already carry an explicit offset
// and parse correctly as-is.
function parseGameOrLocalDate(iso: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso);
}

function formatDate(iso: string): string {
  return parseGameOrLocalDate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatShortDate(iso: string): string {
  return parseGameOrLocalDate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Eyebrow-kicker card header, matching the SubSectionHeader idiom every other
 * migrated baseball surface uses. `count` renders as a trailing InkBadge
 * (the same "counts as trailing InkBadge" idiom the tab bar uses below);
 * `action` overrides it with a bespoke trailing control. */
function CardHeading({ title, count, action }: { title: string; count?: number; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <Eyebrow ink="team">{title}</Eyebrow>
      {action ? (
        <div className="flex items-center gap-2">{action}</div>
      ) : count != null && count > 0 ? (
        <InkBadge label={String(count)} tone="neutral" variant="soft" />
      ) : null}
    </div>
  );
}

/** Trend chip — icon + `<InkBadge>`. `declining` stays graphite (`neutral`),
 * never clay/red: clay is reserved for the War Room recruiting lane, and this
 * is a Pressbox/Passport (team) surface — the down arrow carries the meaning,
 * not a banned red badge. */
function TrendIndicator({ badge }: { badge: { label: string; icon: ReactNode; tone: 'team' | 'neutral' } }) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <span className={badge.tone === 'team' ? 'text-grade-plus' : 'text-text-tertiary'}>{badge.icon}</span>
      <InkBadge label={badge.label} tone={badge.tone} variant="soft" />
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
      className={cn(
        'font-annual text-eyebrow font-semibold uppercase tracking-[0.14em] text-text-tertiary',
        align === 'left' ? 'text-left' : 'text-center',
      )}
    >
      {/* A header-sized sort control; the Button primitive's fixed min-height + ripple
          would not fit a table heading row. */}
      {/* eslint-disable-next-line helm/no-raw-button */}
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'inline-flex w-full select-none items-center gap-1 rounded-fw-sm px-3 py-3',
          align === 'left' ? 'justify-start' : 'justify-center',
          active ? 'text-grade-plus' : 'hover:text-grade-plus',
          pressableClass({ ink: 'team' }),
        )}
      >
        {label}
        <span aria-hidden="true" className={cn('inline-block transition-opacity', active ? 'opacity-100' : 'opacity-0')}>
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
    <PaperCard grain={false} className="px-3 py-2.5">
      <p className="font-annual text-body-sm font-medium text-text-primary">{label}</p>
      <p className="font-annual text-h3 font-semibold tabular-nums text-text-primary">{formatAvg(data?.value)}</p>
      <p className="mt-0.5 text-eyebrow text-text-tertiary">
        {data?.payload.hits}/{data?.payload.atBats} AB
        {data?.payload.type && ` · ${data.payload.type}`}
      </p>
    </PaperCard>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PlayerProfileClient({
  player,
  seasonStats,
  battingLog,
  pitchingLog,
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
  // Both scopes are authorable by any staff member (canAuthorScope), so no
  // capability data is needed to offer this choice; the server still enforces it.
  const [noteScope, setNoteScope] = useState<BaseballNoteScope>('staff_public');
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

  // ── Season totals (box-score canonical) ─────────────────────────────────────
  // Straight field reads off baseball_player_season_stats — no client-side
  // summing needed, that's what recalculate_baseball_season_stats already did.
  const seasonAB = seasonStats?.ab ?? 0;
  const seasonHits = seasonStats?.h ?? 0;
  const seasonHR = seasonStats?.hr ?? 0;
  const seasonRBI = seasonStats?.rbi ?? 0;
  const seasonGames = seasonStats?.g ?? battingLog.length;

  // Game vs. scrimmage AVG split — computed from the box-score game log
  // (baseball_games.game_type is 'game' | 'scrimmage') since the season-stats
  // row doesn't carry a per-context breakdown.
  const { gameAvg, scrimmageAvg } = useMemo(() => {
    let gAb = 0, gH = 0, sAb = 0, sH = 0;
    for (const row of battingLog) {
      if (row.game?.game_type === 'game') {
        gAb += row.ab ?? 0;
        gH += row.h ?? 0;
      } else if (row.game?.game_type === 'scrimmage') {
        sAb += row.ab ?? 0;
        sH += row.h ?? 0;
      }
    }
    return {
      gameAvg: gAb > 0 ? gH / gAb : null,
      scrimmageAvg: sAb > 0 ? sH / sAb : null,
    };
  }, [battingLog]);

  // Last 5 games AVG — most recent 5 box-score batting rows by game date.
  const last5Avg = useMemo(() => {
    const sorted = [...battingLog].sort(
      (a, b) => (b.game?.game_date ?? '').localeCompare(a.game?.game_date ?? '')
    );
    const recent = sorted.slice(0, 5);
    const ab = recent.reduce((s, r) => s + (r.ab ?? 0), 0);
    const h = recent.reduce((s, r) => s + (r.h ?? 0), 0);
    return ab > 0 ? h / ab : null;
  }, [battingLog]);

  // Pressure index — same "game vs. scrimmage AVG gap" semantics the
  // deprecated aggregates.pressure_gap used to carry, now sourced from the
  // box-score game log so it actually reflects saved box scores.
  const pressureGap = gameAvg != null && scrimmageAvg != null ? gameAvg - scrimmageAvg : null;
  const pressureIndex =
    pressureGap != null
      ? pressureGap > 0
        ? 'Clutch'
        : pressureGap < -0.03
        ? 'Struggles'
        : 'Consistent'
      : null;

  // Trend velocity (rate-of-change) has no box-score-canonical equivalent —
  // it was a deprecated-aggregates-only derived metric. Always null; the
  // Advanced Metrics section below renders its honest "not yet available"
  // state for this card rather than a stale/never-synced number.
  const trendMagnitude: number | null = null;

  // ── Trend chart data — one point per box-score game, chronological ─────────
  const trendData = useMemo(() => {
    return [...battingLog]
      .filter((s) => s.game?.game_date)
      .sort((a, b) => new Date(a.game!.game_date!).getTime() - new Date(b.game!.game_date!).getTime())
      .map((s) => ({
        date: formatShortDate(s.game!.game_date!),
        avg: (s.ab ?? 0) > 0 ? (s.h ?? 0) / (s.ab ?? 0) : null,
        hits: s.h,
        atBats: s.ab,
        type: s.game?.game_type,
      }));
  }, [battingLog]);

  // ── Stats table logic (box-score game log) ──────────────────────────────────
  const filteredStats = useMemo(() => {
    const base =
      statFilter === 'all'
        ? battingLog
        : battingLog.filter((s) => s.game?.game_type === statFilter);

    return [...base].sort((a, b) => {
      const mult = sortDir === 'asc' ? 1 : -1;
      switch (sortKey) {
        case 'date': {
          const aTime = a.game?.game_date ? new Date(a.game.game_date).getTime() : 0;
          const bTime = b.game?.game_date ? new Date(b.game.game_date).getTime() : 0;
          return mult * (aTime - bTime);
        }
        case 'ab':
          return mult * ((a.ab ?? 0) - (b.ab ?? 0));
        case 'h':
          return mult * ((a.h ?? 0) - (b.h ?? 0));
        case 'hr':
          return mult * ((a.hr ?? 0) - (b.hr ?? 0));
        case 'rbi':
          return mult * ((a.rbi ?? 0) - (b.rbi ?? 0));
        case 'bb':
          return mult * ((a.bb ?? 0) - (b.bb ?? 0));
        case 'so':
          return mult * ((a.k ?? 0) - (b.k ?? 0));
        case 'avg': {
          const aAvg = (a.ab ?? 0) > 0 ? (a.h ?? 0) / (a.ab ?? 0) : -1;
          const bAvg = (b.ab ?? 0) > 0 ? (b.h ?? 0) / (b.ab ?? 0) : -1;
          return mult * (aAvg - bAvg);
        }
        default:
          return 0;
      }
    });
  }, [battingLog, statFilter, sortKey, sortDir]);

  // Summary row for stats tab
  const statSummary = useMemo(() => {
    const subset = statFilter === 'all' ? battingLog : battingLog.filter((s) => s.game?.game_type === statFilter);
    const ab = subset.reduce((s, r) => s + (r.ab ?? 0), 0);
    const h = subset.reduce((s, r) => s + (r.h ?? 0), 0);
    const hr = subset.reduce((s, r) => s + (r.hr ?? 0), 0);
    const rbi = subset.reduce((s, r) => s + (r.rbi ?? 0), 0);
    const bb = subset.reduce((s, r) => s + (r.bb ?? 0), 0);
    const so = subset.reduce((s, r) => s + (r.k ?? 0), 0);
    return { ab, h, hr, rbi, bb, so, avg: ab > 0 ? h / ab : null };
  }, [battingLog, statFilter]);

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
      const result = await createCoachNote({ playerId: player.id, body, scope: noteScope });
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
  // Derived from box-score data: last-5-games AVG vs. season AVG, replacing
  // the deprecated aggregates.recent_trend (which box-score saves never updated).
  const trend: 'improving' | 'declining' | 'stable' | undefined = useMemo(() => {
    if (last5Avg == null || seasonStats?.avg == null) return undefined;
    const diff = last5Avg - seasonStats.avg;
    if (diff > 0.02) return 'improving';
    if (diff < -0.02) return 'declining';
    return 'stable';
  }, [last5Avg, seasonStats]);
  // Tones stay inside the team (green/graphite) lane — clay is reserved for
  // the War Room recruiting lane, so "declining" reads as quiet graphite +
  // a down arrow, never a banned red/clay badge.
  const trendBadge = {
    improving: { label: 'Improving', icon: <IconTrendingUp size={13} />, tone: 'team' as const },
    declining: { label: 'Declining', icon: <IconTrendingDown size={13} />, tone: 'neutral' as const },
    stable: { label: 'Stable', icon: <IconMinus size={13} />, tone: 'neutral' as const },
  } as const;
  const badge = trend ? trendBadge[trend] : trendBadge.stable;

  // ── Video filter tabs (only show types that have videos) ───────────────────
  const videoTabs: Array<{ key: VideoFilter; label: string }> = [
    { key: 'all', label: 'All' },
    ...((['game', 'scrimmage', 'practice'] as const).filter(
      (t) => (videoTypeCounts[t] ?? 0) > 0
    ).map((t) => ({ key: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))),
  ];

  // ── Main tab bar — counts render as a trailing InkBadge ─────────────────────
  const TABS: Array<{ id: MainTab; label: string; count?: number }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'stats', label: 'Stats' },
    { id: 'videos', label: 'Videos', count: videos.length },
    { id: 'performance', label: 'Performance' },
    { id: 'passport', label: 'Passport' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'notes', label: 'Notes', count: notes.length },
    { id: 'tasks', label: 'Tasks', count: tasks.length },
  ];

  // ── Season Statistics grid rows (Overview) — box-score canonical ───────────
  const seasonStatRows: Array<{ label: string; value: number | string; ghost?: boolean }> = [
    { label: 'AVG', value: formatAvg(seasonStats?.avg), ghost: seasonStats?.avg == null },
    { label: 'OBP', value: formatAvg(seasonStats?.obp), ghost: seasonStats?.obp == null },
    { label: 'SLG', value: formatAvg(seasonStats?.slg), ghost: seasonStats?.slg == null },
    { label: 'OPS', value: seasonStats?.ops != null ? seasonStats.ops.toFixed(3) : '—', ghost: seasonStats?.ops == null },
    { label: 'Game AVG', value: formatAvg(gameAvg), ghost: gameAvg == null },
    { label: 'Scrimmage AVG', value: formatAvg(scrimmageAvg), ghost: scrimmageAvg == null },
    { label: 'Last 5 AVG', value: formatAvg(last5Avg), ghost: last5Avg == null },
    { label: 'AB', value: seasonAB },
    { label: 'Hits', value: seasonHits },
    { label: 'HR', value: seasonHR },
    { label: 'RBI', value: seasonRBI },
    { label: 'Games', value: seasonGames },
  ];

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">

        {/* ── Back button ─────────────────────────────────────────────── */}
        <div className="mb-7 flex items-center gap-3">
          <Link
            href="/baseball/dashboard/command-center"
            className={cn('group flex items-center gap-2 text-text-secondary', pressableClass({ ink: 'team', className: '-m-1 rounded-fw-md p-1' }))}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] shadow-[inset_0_1px_0_rgba(255,255,255,0.6),inset_0_-1px_0_rgba(0,0,0,0.06)] transition-colors group-hover:text-grade-plus">
              <IconArrowLeft size={16} />
            </span>
            <span className="hidden font-annual text-body-sm font-medium sm:inline">Back to Command Center</span>
          </Link>
          <span className="hidden text-text-tertiary sm:inline">/</span>
          <span className="hidden max-w-[200px] truncate font-annual text-body-sm text-text-tertiary sm:inline">{teamName}</span>
        </div>

        {/* ── Hero card ────────────────────────────────────────────────── */}
        <PaperCard registrationTick className="mb-6 p-6 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            {/* Portrait */}
            <div className="relative shrink-0 self-start">
              <div className="h-28 w-28 overflow-hidden rounded-card border border-[color:var(--hairline)] bg-[var(--paper-canvas)] sm:h-32 sm:w-32">
                {player.avatar_url ? (
                  <Image
                    src={player.avatar_url}
                    alt={fullName}
                    width={128}
                    height={128}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full select-none items-center justify-center font-annual text-h1 text-text-tertiary">
                    {initials}
                  </span>
                )}
              </div>
              {/* Jersey badge */}
              {player.jersey_number && (
                <span className="absolute -right-2 -top-2 flex h-7 min-w-[28px] items-center justify-center rounded-full border border-[color:var(--hairline)] bg-[var(--paper)] px-1.5 font-annual text-eyebrow font-semibold tabular-nums text-text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.6),inset_0_-1px_0_rgba(0,0,0,0.06)]">
                  #{player.jersey_number}
                </span>
              )}
            </div>

            {/* Masthead + info */}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <Masthead
                  given={player.first_name ?? ''}
                  surname={player.last_name ?? (player.first_name ? '' : 'Unknown Player')}
                  dateline={
                    <Eyebrow
                      ink="team"
                      items={[
                        player.primary_position,
                        player.secondary_position,
                        player.grad_year ? `Class of ${player.grad_year}` : null,
                        hometown,
                      ]}
                    />
                  }
                  ink="team"
                  accentRule
                />

                {/* Quick stat pills */}
                <div className="flex flex-col items-end gap-2">
                  <TrendIndicator badge={badge} />
                  {player.gpa ? <InkBadge label={`GPA ${player.gpa.toFixed(2)}`} tone="neutral" variant="soft" /> : null}
                </div>
              </div>

              {/* Physical row */}
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 font-annual text-body-sm text-text-secondary">
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
                  <span className="max-w-[200px] truncate">{player.high_school_name}</span>
                )}
              </div>
            </div>
          </div>

          <HairlineRule ink="hairline" className="my-6" />

          {/* ── Key stat row — season totals, box-score canonical ───────── */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
            <RuledStatLine label="AVG" value={formatAvg(seasonStats?.avg)} ghost={seasonStats?.avg == null} ink="team" size="row" />
            <RuledStatLine label="OBP" value={formatAvg(seasonStats?.obp)} ghost={seasonStats?.obp == null} ink="team" size="row" />
            <RuledStatLine label="HR" value={seasonHR} ink="team" size="row" />
            <RuledStatLine label="Games" value={seasonGames} ink="team" size="row" />
          </div>
        </PaperCard>

        {/* ── Snapshot Header Band — V7 operating status strip ────────── */}
        {snapshotHeader && (
          <div className="mb-6">
            <SnapshotHeaderBand header={snapshotHeader} playerId={player.id} />
          </div>
        )}

        {/* ── Tabs — the Fairway-pattern tab system (role=tab + InkBadge +
            pressableClass), matching ImportCenterShell / PostgameReviewClient.
            Per-tab counts render as a trailing InkBadge. ─────────────────── */}
        <div className="mb-6 flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide" role="tablist" aria-label="Player sections">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              // eslint-disable-next-line helm/no-raw-button
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`pp-panel-${tab.id}`}
                id={`pp-tab-${tab.id}`}
                aria-label={tab.count != null && tab.count > 0 ? `${tab.label} (${tab.count})` : tab.label}
                onClick={() => setActiveTab(tab.id)}
                className={cn('flex items-center gap-1.5 whitespace-nowrap rounded-fw-lg px-3 py-2', pressableClass({ ink: 'team' }))}
              >
                <InkBadge label={tab.label} tone={isActive ? 'team' : 'neutral'} variant={isActive ? 'solid' : 'soft'} />
                {tab.count != null && tab.count > 0 ? (
                  <InkBadge label={String(tab.count)} tone="neutral" variant="soft" />
                ) : null}
              </button>
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

              {/* Season stats grid — box-score canonical (baseball_player_season_stats) */}
              <PaperCard className="p-6 sm:p-8">
                <CardHeading title="Season Statistics" />
                <div className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
                  {seasonStatRows.map((row, i) => (
                    <Reveal key={row.label} staggerIndex={Math.min(i, 8)}>
                      <RuledStatLine label={row.label} value={row.ghost ? 0 : row.value} ghost={row.ghost} ink="team" size="row" />
                    </Reveal>
                  ))}
                </div>
              </PaperCard>

              {/* Trend chart */}
              {trendData.length > 0 && (
                <PaperCard className="p-6 sm:p-8">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <Eyebrow ink="team">Performance Trend</Eyebrow>
                      <p className="mt-1 font-annual text-body-sm text-text-tertiary">Batting average per game</p>
                    </div>
                    <TrendIndicator badge={badge} />
                  </div>
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#D6CBB0" strokeOpacity={0.8} vertical={false} />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 10, fill: '#6B655B' }}
                          axisLine={{ stroke: '#D6CBB0' }}
                          tickLine={false}
                          interval="preserveStartEnd"
                          minTickGap={40}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: '#6B655B' }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v: number) => formatAvg(v)}
                          domain={[0, 0.5]}
                          width={36}
                        />
                        <ReferenceLine y={0.3} stroke="#6B655B" strokeDasharray="4 4" strokeWidth={1} />
                        <Tooltip content={<TrendTooltip />} />
                        <Line
                          type="monotone"
                          dataKey="avg"
                          stroke="#16A34A"
                          strokeWidth={2.5}
                          dot={{ r: 3, fill: '#16A34A', stroke: '#F3EAD6', strokeWidth: 1.5 }}
                          activeDot={{ r: 5, fill: '#16A34A', stroke: '#F3EAD6', strokeWidth: 2 }}
                          connectNulls
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-3 flex items-center gap-4 font-annual text-eyebrow text-text-tertiary">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-0.5 w-3 rounded bg-grade-plus" />
                      Batting Average
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-0.5 w-3"
                        style={{ background: 'repeating-linear-gradient(90deg,#D6CBB0,#D6CBB0 3px,transparent 3px,transparent 6px)' }}
                      />
                      .300 Line
                    </span>
                  </div>
                </PaperCard>
              )}

              {/* Advanced metrics — always shown; individual rows appear when data exists */}
              <PaperCard className="p-6 sm:p-8">
                <CardHeading title="Advanced Metrics" />
                {!pressureIndex && trendMagnitude == null ? (
                  <EditorsLetter
                    ink="team"
                    title="Trend data not yet available."
                    body="Metrics populate once box scores are logged for both game and scrimmage contexts."
                  />
                ) : (
                  <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
                    <Reveal staggerIndex={0}>
                      <div>
                        <RuledStatLine label="Pressure" value={pressureIndex ?? 0} ghost={!pressureIndex} ink="team" size="row" />
                        {pressureGap != null && (
                          <p className="mt-1.5 text-eyebrow text-text-tertiary">
                            {pressureGap > 0 ? '+' : ''}{(pressureGap * 1000).toFixed(0)} pts game vs scrimmage
                          </p>
                        )}
                      </div>
                    </Reveal>
                    <Reveal staggerIndex={1}>
                      <div>
                        <RuledStatLine
                          label="Trend Velocity"
                          value={trendMagnitude != null ? (trendMagnitude * 100).toFixed(1) : 0}
                          unit={trendMagnitude != null ? '%' : undefined}
                          ghost={trendMagnitude == null}
                          ink="team"
                          size="row"
                        />
                        <p className="mt-1.5 text-eyebrow text-text-tertiary">Rate of change</p>
                      </div>
                    </Reveal>
                  </div>
                )}
              </PaperCard>

              {/* Recent videos preview */}
              {videos.length > 0 && (
                <PaperCard className="p-6 sm:p-8">
                  <CardHeading
                    title="Videos"
                    action={
                      // eslint-disable-next-line helm/no-raw-button
                      <button
                        type="button"
                        onClick={() => setActiveTab('videos')}
                        className={cn('flex items-center gap-1 font-annual text-body-sm font-medium text-grade-plus', pressableClass({ ink: 'team' }))}
                      >
                        View all ({videos.length}) <IconChevronRight size={13} />
                      </button>
                    }
                  />
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {videos.slice(0, 4).map((v, i) => (
                      <Reveal key={v.id} staggerIndex={Math.min(i, 4)}>
                        {/* eslint-disable-next-line helm/no-raw-button */}
                        <button
                          type="button"
                          onClick={() => { setSelectedVideo(v); setActiveTab('videos'); }}
                          aria-label={`Play ${v.title ?? 'video'}`}
                          className={cn(
                            'group relative aspect-video w-full overflow-hidden rounded-card border border-[color:var(--hairline)] bg-[var(--paper-canvas)] hover:ring-2 hover:ring-grade-plus',
                            pressableClass({ ink: 'team' }),
                          )}
                        >
                          {v.thumbnail_url ? (
                            <Image src={v.thumbnail_url} alt={v.title ?? 'Video'} fill className="object-cover" />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <IconVideo size={20} className="text-text-tertiary" />
                            </div>
                          )}
                          <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/25">
                            <div className="flex h-9 w-9 scale-75 items-center justify-center rounded-full bg-[var(--paper)]/92 opacity-0 transition-[opacity,transform] group-hover:scale-100 group-hover:opacity-100">
                              <IconPlay size={16} className="ml-0.5 text-text-primary" />
                            </div>
                          </div>
                        </button>
                      </Reveal>
                    ))}
                  </div>
                </PaperCard>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">

              {/* AI Insights */}
              <PaperCard className="p-6 sm:p-8">
                <CardHeading title="AI Insights" count={insights.length} />
                <PlayerInsightsPanel insights={insights.slice(0, 3)} />
                {insights.length > 3 && (
                  <p className="mt-3 text-center font-annual text-eyebrow text-text-tertiary">
                    +{insights.length - 3} more insights
                  </p>
                )}
              </PaperCard>

              {/* Notes */}
              <PaperCard className="p-6 sm:p-8">
                <CardHeading
                  title="Coach Notes"
                  action={
                    notesCanAuthor ? (
                      // eslint-disable-next-line helm/no-raw-button
                      <button
                        type="button"
                        onClick={() => setActiveTab('notes')}
                        className={cn('flex items-center gap-1 font-annual text-body-sm font-medium text-grade-plus', pressableClass({ ink: 'team' }))}
                      >
                        <IconPlus size={13} />
                        Add
                      </button>
                    ) : undefined
                  }
                />
                <PlayerNotesSection notes={notes.slice(0, 3)} compact />
              </PaperCard>

              {/* Games breakdown — box-score canonical (baseball_games.game_type) */}
              <PaperCard className="p-6 sm:p-8">
                <CardHeading title="Games" />
                <div className="space-y-3">
                  {[
                    { label: 'Game', count: battingLog.filter((s) => s.game?.game_type === 'game').length },
                    { label: 'Scrimmage', count: battingLog.filter((s) => s.game?.game_type === 'scrimmage').length },
                  ].map(({ label, count }) => (
                    <div key={label} className="flex items-center justify-between font-annual text-body-sm">
                      <span className="text-text-secondary">{label}</span>
                      <StatReadout value={count} className="text-h3" />
                    </div>
                  ))}
                  <HairlineRule ink="hairline" />
                  <div className="flex items-center justify-between font-annual text-body-sm font-medium">
                    <span className="text-text-primary">Total</span>
                    <StatReadout value={battingLog.length} emphasis className="text-h3" />
                  </div>
                </div>
                {/* eslint-disable-next-line helm/no-raw-button */}
                <button
                  type="button"
                  onClick={() => setActiveTab('stats')}
                  className={cn(
                    'mt-4 flex w-full items-center justify-center gap-1 rounded-fw-md border border-[color:var(--hairline)] py-2 font-annual text-body-sm font-medium text-grade-plus',
                    pressableClass({ ink: 'team' }),
                  )}
                >
                  View all stats <IconChevronRight size={12} />
                </button>
              </PaperCard>
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
              className={cn(
                'group flex items-center justify-between rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] px-5 py-3.5',
                pressableClass({ ink: 'team' }),
              )}
            >
              <div>
                <Eyebrow ink="team">Season Stats (Box Score)</Eyebrow>
                <p className="mt-0.5 font-annual text-body-sm text-text-secondary">
                  AVG · OBP · SLG · OPS · ERA · WHIP · game log
                </p>
              </div>
              <span className="flex items-center gap-1 font-annual text-body-sm font-medium text-grade-plus transition-transform group-hover:translate-x-1">
                View <IconChevronRight size={14} />
              </span>
            </Link>

            {/* Filter toggle */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-fw-lg border border-[color:var(--hairline)] bg-[var(--paper)] p-1" role="group" aria-label="Filter games by type">
                {(['all', 'game', 'scrimmage'] as const).map((f) => (
                  // eslint-disable-next-line helm/no-raw-button
                  <button
                    key={f}
                    type="button"
                    onClick={() => setStatFilter(f)}
                    aria-pressed={statFilter === f}
                    className={cn('rounded-fw-md px-3 py-1.5', pressableClass({ ink: 'team' }))}
                  >
                    <InkBadge
                      label={f === 'all' ? 'All' : f === 'game' ? 'Game' : 'Scrimmage'}
                      tone={statFilter === f ? 'team' : 'neutral'}
                      variant={statFilter === f ? 'solid' : 'soft'}
                    />
                  </button>
                ))}
              </div>
              <Eyebrow ink="muted">{filteredStats.length} games</Eyebrow>
            </div>

            {/* Summary row */}
            {filteredStats.length > 0 && (
              <PaperCard className="p-5">
                <Eyebrow ink="muted" className="mb-3">
                  Totals — {statFilter === 'all' ? 'All Games' : statFilter === 'game' ? 'Games' : 'Scrimmages'}
                </Eyebrow>
                <div className="grid grid-cols-3 gap-x-6 gap-y-5 sm:grid-cols-4 lg:grid-cols-7">
                  {[
                    { label: 'AB', value: statSummary.ab },
                    { label: 'H', value: statSummary.h },
                    { label: 'AVG', value: formatAvg(statSummary.avg), ghost: statSummary.avg == null },
                    { label: 'HR', value: statSummary.hr },
                    { label: 'RBI', value: statSummary.rbi },
                    { label: 'BB', value: statSummary.bb },
                    { label: 'SO', value: statSummary.so },
                  ].map((s) => (
                    <RuledStatLine key={s.label} label={s.label} value={s.ghost ? 0 : s.value} ghost={s.ghost} ink="team" size="row" />
                  ))}
                </div>
              </PaperCard>
            )}

            {/* Stats table */}
            {filteredStats.length === 0 ? (
              <EditorsLetter ink="team" title="No stats for this filter." body="Switch to “All” to see every game." />
            ) : (
              <PaperCard className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[color:var(--hairline)] bg-[var(--paper-canvas)]">
                        <SortHeader label="Date" sortKey="date" currentKey={sortKey} dir={sortDir} onSort={handleSort} align="left" />
                        <th className="px-3 py-3 text-left font-annual text-eyebrow font-semibold uppercase tracking-[0.14em] text-text-tertiary">Type</th>
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
                        const gameAvgForRow =
                          (stat.ab ?? 0) > 0 ? (stat.h ?? 0) / (stat.ab ?? 0) : null;
                        return (
                          <tr
                            key={stat.id}
                            className="border-b border-[color:var(--hairline)]/60 transition-colors last:border-0 hover:bg-[color:var(--paper-canvas)]"
                          >
                            <td className="whitespace-nowrap px-3 py-3 font-annual text-body-sm text-text-secondary">
                              {stat.game?.game_date ? formatDate(stat.game.game_date) : '—'}
                            </td>
                            <td className="px-3 py-3">
                              <InkBadge
                                label={stat.game?.game_type === 'scrimmage' ? 'Scrimmage' : stat.game?.game_type ?? '—'}
                                tone={stat.game?.game_type === 'game' ? 'team' : 'neutral'}
                                variant="soft"
                              />
                            </td>
                            <td className="px-3 py-3 text-center font-annual text-body-sm tabular-nums text-text-primary">{stat.ab ?? '—'}</td>
                            <td className="px-3 py-3 text-center font-annual text-body-sm tabular-nums text-text-primary">{stat.h ?? '—'}</td>
                            <td className="px-3 py-3 text-center font-annual text-body-sm font-semibold tabular-nums text-text-primary">
                              {formatAvg(gameAvgForRow)}
                            </td>
                            <td className="px-3 py-3 text-center font-annual text-body-sm tabular-nums text-text-primary">{stat.hr ?? '—'}</td>
                            <td className="px-3 py-3 text-center font-annual text-body-sm tabular-nums text-text-primary">{stat.rbi ?? '—'}</td>
                            <td className="px-3 py-3 text-center font-annual text-body-sm tabular-nums text-text-primary">{stat.bb ?? '—'}</td>
                            <td className="px-3 py-3 text-center font-annual text-body-sm tabular-nums text-text-primary">{stat.k ?? '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </PaperCard>
            )}

            {/* Pitching log — reuses the same PlayerGameLog component
                /players/[id]/stats renders, so a pitcher's per-game history
                shows here too instead of only ever reflecting batting. */}
            {pitchingLog.length > 0 && (
              <div className="pt-2">
                <Eyebrow ink="muted" className="mb-3">Pitching</Eyebrow>
                <PlayerGameLog batting={[]} pitching={pitchingLog} />
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
                <div className="flex items-center gap-1 rounded-fw-lg border border-[color:var(--hairline)] bg-[var(--paper)] p-1" role="group" aria-label="Filter videos by type">
                  {videoTabs.map(({ key, label }) => {
                    const active = videoFilter === key;
                    const count = key === 'all' ? videos.length : videoTypeCounts[key] ?? 0;
                    return (
                      // eslint-disable-next-line helm/no-raw-button
                      <button
                        key={key}
                        type="button"
                        onClick={() => setVideoFilter(key)}
                        aria-pressed={active}
                        aria-label={count > 0 ? `${label} (${count})` : label}
                        className={cn('flex items-center gap-1.5 whitespace-nowrap rounded-fw-md px-3 py-1.5', pressableClass({ ink: 'team' }))}
                      >
                        <InkBadge label={label} tone={active ? 'team' : 'neutral'} variant={active ? 'solid' : 'soft'} />
                        {count > 0 ? <InkBadge label={String(count)} tone="neutral" variant="soft" /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Video grid / empty state */}
            {videosByFilter.length === 0 ? (
              <EditorsLetter ink="team" title="No videos uploaded yet." body="Videos will appear here once the player uploads them." />
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {videosByFilter.map((video, i) => (
                  <Reveal key={video.id} staggerIndex={Math.min(i, 8)}>
                    {/* eslint-disable-next-line helm/no-raw-button */}
                    <button
                      type="button"
                      onClick={() => setSelectedVideo(video)}
                      aria-label={`Play ${video.title ?? 'video'}`}
                      className={cn(
                        'group relative aspect-video w-full overflow-hidden rounded-card border border-[color:var(--hairline)] bg-[var(--paper-canvas)] hover:ring-2 hover:ring-grade-plus',
                        pressableClass({ ink: 'team' }),
                      )}
                    >
                      {video.thumbnail_url ? (
                        <Image
                          src={video.thumbnail_url}
                          alt={video.title ?? 'Video thumbnail'}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <IconVideo size={28} className="text-text-tertiary" />
                        </div>
                      )}

                      {/* Hover overlay */}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
                        <div className="flex h-12 w-12 scale-75 items-center justify-center rounded-full bg-[var(--paper)]/92 opacity-0 transition-[opacity,transform] duration-200 group-hover:scale-100 group-hover:opacity-100">
                          <IconPlay size={20} className="ml-0.5 text-text-primary" />
                        </div>
                      </div>

                      {/* Type badge */}
                      {video.video_type && (
                        <div className="absolute left-2 top-2">
                          <span className="rounded-md bg-black/50 px-2 py-0.5 font-annual text-microbadge uppercase text-white">
                            {video.video_type}
                          </span>
                        </div>
                      )}

                      {/* Title */}
                      {video.title && (
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2.5">
                          <p className="truncate font-annual text-body-sm font-medium text-white">{video.title}</p>
                        </div>
                      )}
                    </button>
                  </Reveal>
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
            <EditorsLetter
              ink="team"
              title="No performance data yet."
              body={
                !liftingOrgId
                  ? 'Set up Helm Lifting Lab for this team to unlock performance tracking.'
                  : "This player's lifting athlete record has not been created yet."
              }
            />
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
            <PaperCard className="p-6 sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-grade-plus/10 text-grade-plus">
                    <IconShieldCheck size={20} />
                  </span>
                  <div>
                    <Eyebrow ink="team">Player Passport</Eyebrow>
                    <p className="mt-1 font-annual text-body-sm text-text-secondary">
                      Source-backed proof: measurables, development story, video, and performance
                      with full provenance for roster evaluation.
                    </p>
                  </div>
                </div>
                <Link
                  href={`/baseball/dashboard/players/${player.id}/passport`}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-card bg-grade-plus px-4 py-2 font-annual text-body-sm font-semibold text-white',
                    pressableClass({ ink: 'team' }),
                  )}
                >
                  <IconShieldCheck size={14} />
                  View passport
                </Link>
              </div>
            </PaperCard>

            {/* Scout Packet entry — links into the dedicated share surface */}
            <PaperCard className="p-6 sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[color:var(--hairline)] text-text-secondary">
                    <IconShieldCheck size={20} />
                  </span>
                  <div>
                    <Eyebrow ink="muted">Scout Packet</Eyebrow>
                    <p className="mt-1 font-annual text-body-sm text-text-secondary">
                      Mint revocable share links for college scouts. Control exactly
                      what a scout sees and track packet access.
                    </p>
                  </div>
                </div>
                <Link
                  href={`/baseball/dashboard/players/${player.id}/scout-packet`}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] px-4 py-2 font-annual text-body-sm font-semibold text-text-primary',
                    pressableClass({ ink: 'team' }),
                  )}
                >
                  Manage
                  <IconChevronRight size={14} />
                </Link>
              </div>
            </PaperCard>

            {/* Visibility hint */}
            <p className="px-4 text-center font-annual text-eyebrow text-text-tertiary">
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
              <PaperCard className="p-6 sm:p-8">
                <CardHeading title="Add Note" />
                <Textarea
                  value={noteBody}
                  onChange={(e) => { setNoteBody(e.target.value); setNoteSuccess(false); }}
                  placeholder="Write a coaching observation…"
                  rows={4}
                  disabled={isPendingNote}
                />
                {/* Visibility scope — staff-only vs. shared with the player. A
                    player_visible note surfaces on the player's Today + timeline. */}
                <div className="mt-3">
                  <label htmlFor="note-visibility" className="mb-1.5 block font-annual text-body-sm text-text-secondary">
                    Visibility
                  </label>
                  <NativeSelect
                    id="note-visibility"
                    value={noteScope}
                    onChange={(e) => setNoteScope(e.target.value as BaseballNoteScope)}
                    disabled={isPendingNote}
                    className="w-56 text-sm"
                  >
                    <option value="staff_public">Staff only</option>
                    <option value="player_visible">Visible to player</option>
                  </NativeSelect>
                  <p className="mt-1.5 font-annual text-eyebrow text-text-tertiary">
                    {noteScope === 'player_visible'
                      ? 'The player will see this note on their Today and timeline.'
                      : 'Only staff can see this note.'}
                  </p>
                </div>

                {noteError ? (
                  <InlineNotice tone="danger" className="mt-3">{noteError}</InlineNotice>
                ) : null}
                {noteSuccess ? (
                  <InlineNotice tone="success" className="mt-3">Note saved.</InlineNotice>
                ) : null}

                <div className="mt-3 flex items-center justify-end">
                  <Button
                    variant="primary"
                    onClick={handleAddNote}
                    disabled={isPendingNote || !noteBody.trim()}
                    className="px-5 py-2 text-sm font-semibold"
                  >
                    {isPendingNote ? 'Saving…' : 'Save Note'}
                  </Button>
                </div>
              </PaperCard>
            )}

            {/* Notes list */}
            <PaperCard className="p-6 sm:p-8">
              <CardHeading title="Coach Notes" count={notes.length} />
              <PlayerNotesSection notes={notes} compact={false} />
            </PaperCard>
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
          <PaperCard className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-[color:var(--hairline)] px-6 py-4">
              <Eyebrow ink="team">Tasks</Eyebrow>
              {tasks.length > 0 && <InkBadge label={String(tasks.length)} tone="neutral" variant="soft" />}
            </div>

            {tasks.length === 0 ? (
              <div className="p-8">
                <EditorsLetter ink="team" title="No tasks assigned." body="Tasks assigned to this player will appear here." />
              </div>
            ) : (
              <ul className="divide-y divide-[color:var(--hairline)]">
                {tasks.map((task, i) => {
                  const isOverdue =
                    task.due_date &&
                    new Date(task.due_date) < new Date() &&
                    task.assignment_status !== 'completed';
                  return (
                    <Reveal key={task.id} staggerIndex={Math.min(i, 8)}>
                      <li className="flex items-start gap-3 px-6 py-4">
                        <span
                          className={cn(
                            'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                            task.assignment_status === 'completed'
                              ? 'bg-grade-plus'
                              : isOverdue
                              ? 'bg-text-primary'
                              : 'bg-[color:var(--hairline)]',
                          )}
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                          <p className={cn(
                            'font-annual text-body-sm font-medium leading-snug',
                            task.assignment_status === 'completed' ? 'text-text-tertiary line-through' : 'text-text-primary',
                          )}>
                            {task.title}
                          </p>
                          {task.description && (
                            <p className="mt-0.5 line-clamp-2 font-annual text-body-sm text-text-secondary">
                              {task.description}
                            </p>
                          )}
                          <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            {task.due_date && (
                              <span className={cn(
                                'font-annual text-eyebrow',
                                isOverdue ? 'font-semibold text-text-primary' : 'text-text-tertiary',
                              )}>
                                Due {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                            )}
                            {task.priority && (
                              <InkBadge label={task.priority} tone="neutral" variant={task.priority === 'high' ? 'solid' : 'soft'} />
                            )}
                            <InkBadge
                              label={task.assignment_status}
                              tone={task.assignment_status === 'completed' ? 'team' : 'neutral'}
                              variant="soft"
                            />
                            {isOverdue && (
                              <InkBadge label="Overdue" tone="neutral" variant="solid" />
                            )}
                          </div>
                        </div>
                      </li>
                    </Reveal>
                  );
                })}
              </ul>
            )}
          </PaperCard>
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

              {/* Video player — clipStart/clipEnd clamp playback to the clip's
                  bounds instead of playing the full parent video (mirrors
                  video-detail-client.tsx and VideoLibraryClient's VideoModal). */}
              <div className="aspect-video bg-black">
                {selectedVideo.video_url ? (
                  <VideoPlayer
                    src={selectedVideo.video_url}
                    thumbnail={selectedVideo.thumbnail_url}
                    title={selectedVideo.title ?? undefined}
                    autoPlay
                    className="rounded-none aspect-auto h-full"
                    clipStart={selectedVideo.clip_start_time ?? undefined}
                    clipEnd={selectedVideo.clip_end_time ?? undefined}
                  />
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
    </>
  );
}

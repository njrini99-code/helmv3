'use client';

/**
 * ============================================================================
 * Fairway · player-game · FairwayGolfClasses — the player's academic classes
 * ----------------------------------------------------------------------------
 * The flag-on redesign of /golf/dashboard/classes (player-only). The legacy
 * page is a single inline `'use client'` component that owns ALL state, the
 * browser-client fetch, and the add/edit/delete handlers (which call the SAME
 * golf_player_classes writes + calendar-sync actions). This component is a
 * PRESENTATION-ONLY re-skin: it receives that already-computed state + the
 * verbatim handlers as props and renders the warm-premium layout.
 *
 * COMPOSITION (2026-07-23 premium pass):
 *   1. ViewHeader — the one masthead (unchanged actions).
 *   2. Today strip — one instrument row: the up-next / in-class-now reading
 *      plus three quiet tallies (classes · credits · days/week).
 *   3. Week timeline — the signature: a time-axis grid with positioned class
 *      blocks, hour rules, and today's column washed + tagged. Weekend
 *      columns appear only when a class meets on them. Mobile swaps the grid
 *      for a day picker + a time-railed list of the selected day. Classes
 *      with no fixed meeting (online/arranged) sit in a "Flexible" tray.
 *   4. All classes — the editable roster as FairwayEventCard-shaped rows
 *      (mono time block · title · meta), sorted by first meeting of the week,
 *      two columns on desktop.
 *   On-system idioms throughout: roster rows are Fairway <Button variant="ghost">
 *   in the canonical event-card recipe; per-class color is a leading DOT
 *   (never a side rail); the mobile day picker is the shared <Segmented>
 *   primitive; timeline cells use the month-grid chip idiom (soft tinted fill
 *   + dot). The absolutely-positioned timeline cells + mobile list rows stay
 *   raw <button>s (justified disables) because the Button primitive's fixed
 *   min-height/row-flex can't size a duration-positioned calendar cell.
 *
 * PRESERVED PLUMBING (owned by the legacy page, passed in — NEVER touched here):
 *   • fetchClasses + the golf_player_classes select.
 *   • handleAddClass / handleUpdateClass / handleConfirmClasses /
 *     handleDeleteClass / confirmDeleteAllClasses — the same insert/update/
 *     delete + calendar-sync calls. We re-skin the TRIGGERS only; the
 *     destructive single-class / delete-all deletes stay EXACTLY as the legacy
 *     page wired them (we add no new destructive write).
 *   • The four modals (AddClassModal / UploadScheduleModal / ConfirmClassesModal
 *     / ClassDetailModal) + the ConfirmDialog stay mounted by the LEGACY page —
 *     overlays are allowed glass and out of this surface's scope.
 *
 * ── HONESTY ─────────────────────────────────────────────────────────────────
 *   • Empty schedule → an honest EmptyState (no fabricated classes). The
 *     tallies render the real counts (0 is a legitimate count for a literal
 *     tally — these are not stats/scores/percentiles).
 *   • The "up next" reading is computed from the device clock and the real
 *     schedule; when nothing is left today it says so instead of inventing.
 *
 * ADDITIVE + GATED — imported only behind the isRedesignEnabled() fork in the
 * classes page. Renders inside the `.fairway-ds` scope on a bg-canvas page.
 * Built with Fairway tokens + primitives only (no bg-white / serif / gauges).
 * ========================================================================== */

import { useMemo, useState } from 'react';
import { BookOpen, Plus, Upload, MapPin } from 'lucide-react';

import {
  ViewHeader,
  InstrumentPanel,
  Surface,
  EmptyState,
  Skeleton,
  SkeletonCard,
  Segmented,
  Chip,
  Button,
} from '@/components/fairway';

/* ───────────────────────────────────────────────────────────────────────────
 * Props — the PRE-COMPUTED state + verbatim handlers the legacy page owns.
 * Mirrors the legacy PlayerClass shape exactly.
 * ────────────────────────────────────────────────────────────────────────── */

export interface FairwayPlayerClass {
  id: string;
  player_id: string;
  class_name: string;
  instructor: string | null;
  days: string[] | null;
  start_time: string | null;
  end_time: string | null;
  building: string | null;
  room: string | null;
  credits: number | null;
  color: string | null;
  notes: string | null;
  team_id: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface FairwayGolfClassesProps {
  classes: FairwayPlayerClass[];
  loading: boolean;
  /**
   * True when the signed-in user is NOT a player (Classes is a player-only
   * feature — a coach landing here gets an honest "wrong feature" state rather
   * than an empty schedule with CTAs that silently no-op).
   */
  isWrongRole?: boolean;
  /** True when the player has no team yet (join-a-team state). */
  hasTeam: boolean;
  /** Day → classes map, already grouped + time-sorted by the legacy page. */
  classesByDay: Record<string, FairwayPlayerClass[]>;
  totalCredits: number;
  /** Display helpers (verbatim from the legacy page). */
  parseClassName: (className: string) => { code: string; name: string };
  getLocationDisplay: (cls: FairwayPlayerClass) => string | null;
  formatTimeDisplay: (time: string) => string;
  formatDaysDisplay: (days: string[]) => string;
  /** Verbatim handlers (re-skinned triggers only). */
  onAddClass: () => void;
  onImportSchedule: () => void;
  onClassClick: (cls: FairwayPlayerClass) => void;
  onDeleteAll: () => void;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Week / time helpers (pure presentation math)
 * ────────────────────────────────────────────────────────────────────────── */

const DAY_ORDER = ['M', 'T', 'W', 'Th', 'F', 'Sa', 'Su'];
const DAY_NAMES: Record<string, string> = {
  M: 'Monday',
  T: 'Tuesday',
  W: 'Wednesday',
  Th: 'Thursday',
  F: 'Friday',
  Sa: 'Saturday',
  Su: 'Sunday',
};
const DAY_SHORT: Record<string, string> = {
  M: 'Mon',
  T: 'Tue',
  W: 'Wed',
  Th: 'Thu',
  F: 'Fri',
  Sa: 'Sat',
  Su: 'Sun',
};
/** JS Date.getDay() (0=Sunday) → our day token. */
const JS_DAY_TO_TOKEN = ['Su', 'M', 'T', 'W', 'Th', 'F', 'Sa'];

/** "HH:MM" or "HH:MM:SS" → minutes after midnight, or null. */
function toMinutes(time: string | null): number | null {
  if (!time) return null;
  const [h, m] = time.split(':');
  const hours = Number(h);
  const minutes = Number(m);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function hourLabel(hour: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${hour < 12 ? 'AM' : 'PM'}`;
}

interface TimedBlock {
  cls: FairwayPlayerClass;
  start: number;
  end: number;
  lane: number;
  lanes: number;
}

/**
 * Position a day's classes on the time axis. Overlapping meetings (rare for
 * one player, but real for back-to-back labs) share the column: greedy lane
 * assignment inside each overlap cluster, then every block in the cluster
 * learns the cluster's lane count so widths divide evenly.
 */
function layoutDay(dayClasses: FairwayPlayerClass[]): TimedBlock[] {
  const blocks: TimedBlock[] = [];
  for (const cls of dayClasses) {
    const start = toMinutes(cls.start_time);
    if (start == null) continue;
    const rawEnd = toMinutes(cls.end_time);
    const end = Math.max(rawEnd ?? start + 50, start + 30);
    blocks.push({ cls, start, end, lane: 0, lanes: 1 });
  }
  blocks.sort((a, b) => a.start - b.start || a.end - b.end);

  let cluster: TimedBlock[] = [];
  let laneEnds: number[] = [];
  const flush = () => {
    for (const b of cluster) b.lanes = Math.max(1, laneEnds.length);
    cluster = [];
    laneEnds = [];
  };
  for (const block of blocks) {
    const stillActive = laneEnds.some((end) => end > block.start);
    if (!stillActive && cluster.length > 0) flush();
    const freeLane = laneEnds.findIndex((end) => end <= block.start);
    if (freeLane === -1) {
      block.lane = laneEnds.length;
      laneEnds.push(block.end);
    } else {
      block.lane = freeLane;
      laneEnds[freeLane] = block.end;
    }
    cluster.push(block);
  }
  flush();
  return blocks;
}

/** Sort key: first meeting of the week (day, then time); flexible classes last. */
function firstMeetingKey(cls: FairwayPlayerClass): number {
  const days = cls.days ?? [];
  const start = toMinutes(cls.start_time);
  if (days.length === 0 || start == null) return Number.MAX_SAFE_INTEGER;
  const dayIdx = Math.min(
    ...days.map((d) => {
      const i = DAY_ORDER.indexOf(d);
      return i === -1 ? DAY_ORDER.length : i;
    }),
  );
  return dayIdx * 1440 + start;
}

/**
 * Per-class color is shown the on-system way (2026-07-23 review): the calendar
 * surfaces convey event color with a small leading DOT (FairwayEventCard,
 * FairwayExpenseList) and month-grid chips add a soft tinted FILL — never a
 * side rail (rails are reserved for warning banners). These helpers derive
 * both from a class's stored hex; a class with no color falls back to accent.
 */
const DOT_FALLBACK = 'var(--fw-color-accent-500)';
/** Full-strength dot color from the stored hex, or the accent fallback. */
function dotColor(hex: string | null): string {
  return hex || DOT_FALLBACK;
}
/** Soft tint for a timeline block fill (matches month-grid chip color.light). */
function tintFill(hex: string | null): string {
  // 6-digit hex → ~9% alpha; anything else falls back to the sunken surface.
  return hex && /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}17` : 'var(--fw-color-surface-sunken)';
}

/* ───────────────────────────────────────────────────────────────────────────
 * Component
 * ────────────────────────────────────────────────────────────────────────── */

export function FairwayGolfClasses({
  classes,
  loading,
  isWrongRole = false,
  hasTeam,
  classesByDay,
  totalCredits,
  parseClassName,
  getLocationDisplay,
  formatTimeDisplay,
  formatDaysDisplay,
  onAddClass,
  onImportSchedule,
  onClassClick,
  onDeleteAll,
}: FairwayGolfClassesProps) {
  const count = classes.length;
  const hasClasses = count > 0;
  const daysActive = Object.keys(classesByDay).filter((d) => (classesByDay[d] ?? []).length > 0).length;

  // Rendering happens client-side after the legacy page's fetch resolves
  // (loading gates the whole body), so the device clock is safe to read.
  const now = new Date();
  const todayToken = JS_DAY_TO_TOKEN[now.getDay()] ?? 'M';
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const todayLabel = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  /** Classes with no fixed meeting — online / arranged / async. */
  const flexClasses = useMemo(
    () => classes.filter((c) => (c.days ?? []).length === 0 || toMinutes(c.start_time) == null),
    [classes],
  );

  /** Week columns: Mon–Fri always; Sat/Sun only when something meets there. */
  const visibleDays = useMemo(() => {
    const base = ['M', 'T', 'W', 'Th', 'F'];
    for (const d of ['Sa', 'Su']) {
      if ((classesByDay[d] ?? []).length > 0) base.push(d);
    }
    return base;
  }, [classesByDay]);

  /** Per-day positioned blocks for the timeline. */
  const dayLayouts = useMemo(() => {
    const map: Record<string, TimedBlock[]> = {};
    for (const d of visibleDays) map[d] = layoutDay(classesByDay[d] ?? []);
    return map;
  }, [visibleDays, classesByDay]);

  /** Time window: pad to the hour around the real schedule; 8a–4p floor. */
  const { windowStart, windowEnd } = useMemo(() => {
    let min = 8 * 60;
    let max = 16 * 60;
    for (const d of Object.keys(dayLayouts)) {
      for (const b of dayLayouts[d] ?? []) {
        min = Math.min(min, b.start);
        max = Math.max(max, b.end);
      }
    }
    return {
      windowStart: Math.floor(min / 60) * 60,
      windowEnd: Math.ceil(max / 60) * 60,
    };
  }, [dayLayouts]);
  const PX_PER_MIN = 1.05;
  const timelineHeight = (windowEnd - windowStart) * PX_PER_MIN;
  const hours = useMemo(() => {
    const list: number[] = [];
    for (let h = windowStart / 60; h <= windowEnd / 60; h++) list.push(h);
    return list;
  }, [windowStart, windowEnd]);

  /** The live reading: in class now → up next today → next meeting this week. */
  const upNext = useMemo(() => {
    const todayBlocks = (dayLayouts[todayToken] ?? []).slice().sort((a, b) => a.start - b.start);
    for (const b of todayBlocks) {
      if (b.end > nowMinutes) {
        return { kind: b.start <= nowMinutes ? ('now' as const) : ('today' as const), block: b, day: todayToken };
      }
    }
    const todayIdx = JS_DAY_TO_TOKEN.indexOf(todayToken);
    for (let offset = 1; offset <= 7; offset++) {
      const token = JS_DAY_TO_TOKEN[(todayIdx + offset) % 7] ?? 'M';
      const blocks = dayLayouts[token] ?? [];
      if (blocks.length > 0) {
        const first = blocks.slice().sort((a, b) => a.start - b.start)[0];
        if (first) {
          return { kind: 'week' as const, block: first, day: token, offset };
        }
      }
    }
    return null;
  }, [dayLayouts, todayToken, nowMinutes]);

  /** Editable roster, ordered the way the week actually unfolds. */
  const sortedClasses = useMemo(
    () =>
      [...classes].sort(
        (a, b) => firstMeetingKey(a) - firstMeetingKey(b) || a.class_name.localeCompare(b.class_name),
      ),
    [classes],
  );

  /** Mobile: which day the picker shows. Defaults to today (or first school day). */
  const [selectedDay, setSelectedDay] = useState<string>(() =>
    ['M', 'T', 'W', 'Th', 'F', 'Sa', 'Su'].includes(todayToken) && todayToken !== 'Sa' && todayToken !== 'Su'
      ? todayToken
      : 'M',
  );

  // ── Wrong-role gate — Classes is player-only. A coach (no playerId) would
  // otherwise see an empty schedule with Add/Import CTAs that silently no-op. ──
  if (isWrongRole) {
    return (
      <div className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-6">
        <Surface elevation="border" padding="lg">
          <EmptyState
            icon={BookOpen}
            title="Classes are a player feature"
            description="Class schedules belong to individual players so coaches can plan practices around their academics. Head back to your dashboard to manage your team."
            action={
              <Button asChild variant="primary">
                <a href="/golf/dashboard">Back to dashboard</a>
              </Button>
            }
          />
        </Surface>
      </div>
    );
  }

  // ── No-team gate — honest, with the join CTA (mirrors legacy behavior) ──────
  if (!hasTeam) {
    return (
      <div className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-6">
        <Surface elevation="border" padding="lg">
          <EmptyState
            icon={BookOpen}
            title="Join a team first"
            description="You need to be on a team before you can add your class schedule. Ask your coach for a join code."
            action={
              <Button asChild variant="primary">
                <a href="/golf/join">Join a team</a>
              </Button>
            }
          />
        </Surface>
      </div>
    );
  }

  /* ── Timeline block content (dot + code + name; taller blocks add detail) ── */
  const renderBlockLabel = (cls: FairwayPlayerClass, compact: boolean) => {
    const { code, name } = parseClassName(cls.class_name);
    const location = getLocationDisplay(cls);
    return (
      <span className="flex min-w-0 flex-col gap-px text-left">
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            aria-hidden
            className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
            style={{ backgroundColor: dotColor(cls.color) }}
          />
          {code ? (
            <span className="truncate font-fw-mono text-caption font-semibold tracking-tight text-text-primary">
              {code}
            </span>
          ) : null}
        </span>
        <span className="min-w-0 truncate pl-3 font-fw-sans text-caption text-text-secondary">{name}</span>
        {!compact && cls.start_time ? (
          <span className="hidden truncate pl-3 font-fw-mono text-caption tabular-nums text-text-tertiary lg:block">
            {formatTimeDisplay(cls.start_time)}
            {cls.end_time ? ` – ${formatTimeDisplay(cls.end_time)}` : ''}
          </span>
        ) : null}
        {!compact && location ? (
          <span className="hidden truncate pl-3 font-fw-sans text-caption text-text-tertiary lg:block">
            {location}
          </span>
        ) : null}
      </span>
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-6">
      <div className="flex flex-col gap-8">
        {/* ════════════════ 1 · MASTHEAD (the ONE masthead) ═════════════════ */}
        <ViewHeader
          eyebrow="My Classes"
          title="Your classes this semester"
          description={
            hasClasses
              ? `${count} ${count === 1 ? 'class' : 'classes'} · ${totalCredits} ${totalCredits === 1 ? 'credit' : 'credits'}`
              : 'Add your schedule so coaches plan practices around your academics.'
          }
          primaryAction={
            <Button variant="primary" onClick={onAddClass} leftIcon={<Plus className="h-4 w-4" />}>
              Add class
            </Button>
          }
          secondaryActions={
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={onImportSchedule}
                leftIcon={<Upload className="h-4 w-4" />}
              >
                Import
              </Button>
              {hasClasses ? (
                <Button variant="ghost" size="sm" onClick={onDeleteAll}>
                  Delete all
                </Button>
              ) : null}
            </>
          }
        />

        {loading ? (
          /* ── Loading skeleton — mirrors the real shell (strip → timeline →
             2-col list). role/aria + sr-only match the codebase skeleton
             a11y contract (SkeletonGroup); SkeletonCard carries it per-card. ── */
          <div
            role="status"
            aria-busy="true"
            aria-live="polite"
            className="flex flex-col gap-8"
          >
            <span className="sr-only">Loading classes…</span>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-[420px] w-full" />
            <div className="grid gap-2.5 md:grid-cols-2">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          </div>
        ) : !hasClasses ? (
          /* ── Honest empty state ── */
          <Surface elevation="border" padding="lg">
            <EmptyState
              icon={BookOpen}
              title="No classes added"
              description="Add your class schedule to help your coaches plan practices around your academic commitments. Import a screenshot of your schedule and it syncs straight to your calendar."
              action={
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <Button
                    variant="secondary"
                    onClick={onImportSchedule}
                    leftIcon={<Upload className="h-4 w-4" />}
                  >
                    Import schedule
                  </Button>
                  <Button onClick={onAddClass} variant="primary" leftIcon={<Plus className="h-4 w-4" />}>
                    Add first class
                  </Button>
                </div>
              }
            />
          </Surface>
        ) : (
          <>
            {/* ════════════ 2 · TODAY STRIP (one instrument row) ════════════
                Uses InstrumentPanel's own bezel slots (eyebrow/header/readout)
                rather than hand-rolling the label row — the eyebrow token then
                comes from the primitive, not a local copy. */}
            <InstrumentPanel
              depth="base"
              padding="md"
              eyebrow={todayLabel}
              header={
                upNext ? (
                  <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="flex items-center gap-1.5 font-fw-sans text-caption font-medium uppercase tracking-wide text-accent-700">
                      <span
                        aria-hidden
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: dotColor(upNext.block.cls.color) }}
                      />
                      {upNext.kind === 'now'
                        ? 'In class now'
                        : upNext.kind === 'today'
                          ? 'Up next'
                          : upNext.offset === 1
                            ? 'Tomorrow'
                            : DAY_NAMES[upNext.day]}
                    </span>
                    <span className="font-fw-mono text-body-sm font-semibold text-text-primary">
                      {parseClassName(upNext.block.cls.class_name).code ||
                        parseClassName(upNext.block.cls.class_name).name}
                    </span>
                    <span className="min-w-0 truncate font-fw-sans text-body-sm text-text-secondary">
                      {parseClassName(upNext.block.cls.class_name).name}
                    </span>
                    <span className="font-fw-mono text-body-sm tabular-nums text-text-secondary">
                      {upNext.block.cls.start_time ? formatTimeDisplay(upNext.block.cls.start_time) : ''}
                    </span>
                    {getLocationDisplay(upNext.block.cls) ? (
                      <span className="flex min-w-0 items-center gap-1 font-fw-sans text-body-sm text-text-tertiary">
                        <MapPin className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
                        <span className="truncate">{getLocationDisplay(upNext.block.cls)}</span>
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <span className="font-fw-sans text-body-sm text-text-secondary">
                    {flexClasses.length === count
                      ? 'All classes are online or arranged — no fixed meetings this week.'
                      : 'Done for today — no more scheduled classes.'}
                  </span>
                )
              }
              readout={
                <div className="flex items-center gap-5">
                  {[
                    { value: count, label: count === 1 ? 'class' : 'classes' },
                    { value: totalCredits, label: totalCredits === 1 ? 'credit' : 'credits' },
                    { value: daysActive, label: 'days/week' },
                  ].map((stat) => (
                    <p key={stat.label} className="flex items-baseline gap-1.5">
                      <span className="font-fw-mono text-h3 font-semibold tabular-nums text-text-primary">
                        {stat.value}
                      </span>
                      <span className="font-fw-sans text-caption text-text-tertiary">{stat.label}</span>
                    </p>
                  ))}
                </div>
              }
            />

            {/* ════════════ 3 · WEEK TIMELINE (the signature) ═══════════════ */}
            <section className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between px-1">
                <h2 className="font-fw-display text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">
                  This week
                </h2>
                <p className="hidden font-fw-sans text-caption text-text-tertiary md:block">
                  Select a class for details
                </p>
              </div>

              {/* ── Desktop: time-axis grid ── */}
              <Surface elevation="border" padding="none" className="hidden md:block">
                <div
                  className="grid"
                  style={{ gridTemplateColumns: `56px repeat(${visibleDays.length}, minmax(0, 1fr))` }}
                >
                  {/* header row */}
                  <div className="border-b border-border-subtle" />
                  {visibleDays.map((day) => {
                    const isToday = day === todayToken;
                    return (
                      <div
                        key={`h-${day}`}
                        className={`flex min-w-0 items-center justify-center gap-1.5 overflow-hidden border-b border-l border-border-subtle px-1 py-2.5 ${
                          isToday ? 'bg-accent-50' : ''
                        }`}
                      >
                        <span
                          className={`truncate font-fw-sans text-caption font-medium ${
                            isToday ? 'text-accent-700' : 'text-text-secondary'
                          }`}
                        >
                          <span className="hidden lg:inline">{DAY_NAMES[day]}</span>
                          <span className="lg:hidden">{DAY_SHORT[day]}</span>
                        </span>
                        {isToday ? (
                          <span className="hidden lg:inline-flex">
                            <Chip tone="accent" size="sm">
                              Today
                            </Chip>
                          </span>
                        ) : null}
                      </div>
                    );
                  })}

                  {/* time gutter (+14px so the last hour label isn't clipped) */}
                  <div className="relative" style={{ height: timelineHeight + 14 }}>
                    {hours.map((h) => (
                      <span
                        key={h}
                        className="absolute right-2 -translate-y-1/2 font-fw-mono text-caption tabular-nums text-text-tertiary"
                        style={{ top: (h * 60 - windowStart) * PX_PER_MIN }}
                      >
                        {hourLabel(h)}
                      </span>
                    ))}
                  </div>

                  {/* day columns */}
                  {visibleDays.map((day) => {
                    const isToday = day === todayToken;
                    const blocks = dayLayouts[day] ?? [];
                    return (
                      <div
                        key={`c-${day}`}
                        className={`relative border-l border-border-subtle ${isToday ? 'bg-accent-50' : ''}`}
                        style={{ height: timelineHeight + 14 }}
                      >
                        {/* hour rules */}
                        {hours.slice(1).map((h) => (
                          <span
                            key={h}
                            aria-hidden
                            className="absolute inset-x-0 border-t border-border-subtle/70"
                            style={{ top: (h * 60 - windowStart) * PX_PER_MIN }}
                          />
                        ))}
                        {blocks.map((b) => {
                          const top = (b.start - windowStart) * PX_PER_MIN;
                          const height = Math.max((b.end - b.start) * PX_PER_MIN, 34);
                          const width = 100 / b.lanes;
                          const compact = height < 72;
                          const { code, name } = parseClassName(b.cls.class_name);
                          return (
                            // eslint-disable-next-line helm/no-raw-button -- absolutely-positioned timeline cell sized by meeting duration; <Button>'s fixed min-height/padding would break the time axis
                            <button
                              key={`${b.cls.id}-${day}`}
                              type="button"
                              onClick={() => onClassClick(b.cls)}
                              title={`${code ? `${code} — ` : ''}${name}${
                                b.cls.start_time
                                  ? ` · ${formatTimeDisplay(b.cls.start_time)}${
                                      b.cls.end_time ? ` – ${formatTimeDisplay(b.cls.end_time)}` : ''
                                    }`
                                  : ''
                              }`}
                              className="absolute overflow-hidden rounded-fw-sm border border-border-subtle px-2 py-1.5 text-left transition-shadow hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                              style={{
                                top,
                                height,
                                left: `calc(${b.lane * width}% + 3px)`,
                                width: `calc(${width}% - 6px)`,
                                backgroundColor: tintFill(b.cls.color),
                              }}
                            >
                              {renderBlockLabel(b.cls, compact)}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </Surface>

              {/* ── Mobile: day picker + time-railed list ── */}
              <div className="flex flex-col gap-3 md:hidden">
                {/* Shared Segmented primitive (moving pill, haptics, scroll-fade
                    overflow guard) — replaces the hand-rolled tab strip. */}
                <Segmented
                  value={selectedDay}
                  onValueChange={setSelectedDay}
                  size="sm"
                  fullWidth
                  aria-label="Day of week"
                  options={visibleDays.map((day) => {
                    const dayCount = (classesByDay[day] ?? []).length;
                    return {
                      value: day,
                      label: (
                        <span className="flex items-baseline gap-1">
                          <span className="font-fw-sans font-medium">{DAY_SHORT[day]}</span>
                          {dayCount > 0 ? (
                            <span className="font-fw-mono text-caption tabular-nums opacity-60">
                              {dayCount}
                            </span>
                          ) : null}
                        </span>
                      ),
                    };
                  })}
                />

                <div className="flex flex-col gap-2">
                  {(classesByDay[selectedDay] ?? []).length > 0 ? (
                    (classesByDay[selectedDay] ?? []).map((cls) => {
                      const { code, name } = parseClassName(cls.class_name);
                      const location = getLocationDisplay(cls);
                      return (
                        // eslint-disable-next-line helm/no-raw-button -- full-card time-rail row (multi-line, stretch layout); <Button>'s row flex + nowrap jammed this exact card into one clipped line before this pass
                        <button
                          key={`${cls.id}-${selectedDay}`}
                          type="button"
                          onClick={() => onClassClick(cls)}
                          className="flex w-full items-stretch gap-3 rounded-fw-md border border-border-subtle bg-surface px-3 py-2.5 text-left transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                        >
                          <span className="flex w-[74px] flex-shrink-0 flex-col items-end justify-center gap-0.5 border-r border-border-subtle pr-3">
                            {cls.start_time ? (
                              <>
                                <span className="font-fw-mono text-caption font-semibold tabular-nums text-text-primary">
                                  {formatTimeDisplay(cls.start_time)}
                                </span>
                                {cls.end_time ? (
                                  <span className="font-fw-mono text-caption tabular-nums text-text-tertiary">
                                    {formatTimeDisplay(cls.end_time)}
                                  </span>
                                ) : null}
                              </>
                            ) : (
                              <span className="font-fw-sans text-caption text-text-tertiary">Anytime</span>
                            )}
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span
                                aria-hidden
                                className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                                style={{ backgroundColor: dotColor(cls.color) }}
                              />
                              {code ? (
                                <span className="font-fw-mono text-caption font-semibold text-text-primary">
                                  {code}
                                </span>
                              ) : null}
                              <span className="truncate font-fw-sans text-body-sm text-text-secondary">
                                {name}
                              </span>
                            </span>
                            {location ? (
                              <span className="flex items-center gap-1 font-fw-sans text-caption text-text-tertiary">
                                <MapPin className="h-3 w-3 flex-shrink-0" aria-hidden />
                                <span className="truncate">{location}</span>
                              </span>
                            ) : null}
                          </span>
                        </button>
                      );
                    })
                  ) : (
                    <EmptyState
                      variant="subtle"
                      icon={BookOpen}
                      title="No classes"
                      description={`Nothing scheduled for ${DAY_NAMES[selectedDay]}.`}
                    />
                  )}
                </div>
              </div>

              {/* ── Flexible / online tray (both breakpoints) ── */}
              {flexClasses.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2 px-1 pt-1">
                  <span className="font-fw-sans text-caption font-medium text-text-tertiary">
                    Flexible · online
                  </span>
                  {flexClasses.map((cls) => {
                    const { code, name } = parseClassName(cls.class_name);
                    return (
                      // eslint-disable-next-line helm/no-raw-button -- compact chip-shaped tray item, not a <Button> pill
                      <button
                        key={`flex-${cls.id}`}
                        type="button"
                        onClick={() => onClassClick(cls)}
                        className="flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface py-1 pl-2 pr-2.5 transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      >
                        <span
                          aria-hidden
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: dotColor(cls.color) }}
                        />
                        <span className="font-fw-mono text-caption font-medium text-text-primary">
                          {code || name}
                        </span>
                        {code ? (
                          <span className="max-w-[16ch] truncate font-fw-sans text-caption text-text-tertiary">
                            {name}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </section>

            {/* ════════════ 4 · ALL CLASSES (editable roster) ═══════════════ */}
            <section className="flex flex-col gap-3">
              <h2 className="px-1 font-fw-display text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">
                All classes
              </h2>
              {/* Rows mirror FairwayEventCard exactly: mono time block · title ·
                  meta. Per-class color is a leading dot, never a rail. */}
              <div className="grid gap-2.5 md:grid-cols-2">
                {sortedClasses.map((cls) => {
                  const { code, name } = parseClassName(cls.class_name);
                  const location = getLocationDisplay(cls);
                  const days = cls.days ?? [];
                  // "Online / arranged · Online" reads twice — drop the location
                  // when it adds nothing beyond the no-meeting fallback label.
                  const showLocation =
                    location != null && !(days.length === 0 && /^online$/i.test(location.trim()));
                  return (
                    <Button
                      key={cls.id}
                      type="button"
                      variant="ghost"
                      onClick={() => onClassClick(cls)}
                      className="group block h-auto min-h-[68px] w-full rounded-card border border-border-subtle bg-surface p-4 text-left font-normal shadow-flat transition-[box-shadow,transform,border-color] [transition-duration:180ms] [transition-timing-function:cubic-bezier(0.22,0.61,0.36,1)] hover:-translate-y-px hover:border-border-strong hover:bg-surface hover:shadow-soft active:translate-y-[0.5px] active:shadow-flat focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0"
                    >
                      <span className="flex w-full items-stretch gap-4">
                        {/* Time block — fixed width, mono tabular (event-card idiom). */}
                        <span className="flex w-[68px] flex-shrink-0 flex-col items-start justify-center md:w-[76px]">
                          {cls.start_time ? (
                            <>
                              <span className="font-fw-mono text-body-sm font-medium tabular-nums text-text-primary">
                                {formatTimeDisplay(cls.start_time)}
                              </span>
                              {cls.end_time ? (
                                <span className="font-fw-mono text-caption tabular-nums text-text-tertiary">
                                  {formatTimeDisplay(cls.end_time)}
                                </span>
                              ) : null}
                            </>
                          ) : (
                            <span className="font-fw-sans text-caption text-text-tertiary">Flexible</span>
                          )}
                        </span>

                        {/* Title + meta. */}
                        <span className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span
                              aria-hidden
                              className="h-2 w-2 flex-shrink-0 rounded-full"
                              style={{ backgroundColor: dotColor(cls.color) }}
                            />
                            {code ? (
                              <span className="flex-shrink-0 font-fw-mono text-body-sm font-semibold text-text-primary">
                                {code}
                              </span>
                            ) : null}
                            <span className="min-w-0 truncate font-fw-sans text-body-sm font-medium text-text-primary">
                              {name}
                            </span>
                            {cls.credits != null ? (
                              <span className="ml-auto flex-shrink-0 font-fw-mono text-caption tabular-nums text-text-tertiary">
                                {cls.credits} cr
                              </span>
                            ) : null}
                          </span>
                          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 font-fw-sans text-caption text-text-tertiary">
                            <span className="font-medium text-text-secondary">
                              {days.length > 0 ? formatDaysDisplay(days) : 'Online / arranged'}
                            </span>
                            {showLocation ? (
                              <>
                                <span aria-hidden>·</span>
                                <span className="flex min-w-0 items-center gap-1">
                                  <MapPin className="h-3 w-3 flex-shrink-0" aria-hidden />
                                  <span className="truncate">{location}</span>
                                </span>
                              </>
                            ) : null}
                            {cls.instructor ? (
                              <>
                                <span aria-hidden>·</span>
                                <span className="truncate">{cls.instructor}</span>
                              </>
                            ) : null}
                          </span>
                        </span>
                      </span>
                    </Button>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

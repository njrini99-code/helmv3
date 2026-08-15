'use client';

/**
 * ============================================================================
 * Fairway · pages/whats-new · FairwayWhatsNew  (ADDITIVE · FLAG-GATED)
 * ----------------------------------------------------------------------------
 * The flag-on redesign of the COACH /golf/dashboard/whats-new route — a 7-day
 * lifecycle activity feed across the coach's team (insights detected / matured /
 * resolved, patterns validated, focus areas created / completed).
 *
 * PRESENTATION ONLY. Consumes the EXACT result the route already fetched via
 * getWhatsNewForCoach() — { success, error?, items?, truncated? } — passed
 * straight through by whats-new/page.tsx. No data work, no fetch happens here;
 * the day-grouping is pure presentation over the items the route provided.
 *
 * "WHAT'S NEW" SEEN-STATE (P387): the feed delivers on its name — events that
 * occurred since the coach's last visit are flagged "New" with a quiet badge and
 * an unread count in the header. Last-visit is tracked per-device in
 * localStorage (the data is already a bounded 7-day window, re-fetched fresh on
 * the server every load, so the seen-state is a presentation affordance, not a
 * source of truth). Cross-device / nav-badge persistence would need a
 * coach-keyed seen table — a DB change outside this component's scope.
 *
 * HONESTY (DESIGN-SYSTEM §0 #8): an empty feed renders an honest EmptyState
 * ("No activity yet") that still routes the coach somewhere useful; a failed
 * load renders an honest error InlineNotice; the count is the TRUE total (the
 * route no longer caps the feed) and, on the rare chance a single category hit
 * its row ceiling, `truncated` is disclosed rather than reported as definitive.
 *
 * Tokens ONLY: bg-canvas, text-text-*, font-fw-display/sans, rounded-card,
 * shadow-soft, border-border-subtle, tabular-nums. Green = the single accent.
 * No glass / warm-* / blur / primary-*.
 * ========================================================================== */

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  Sparkles,
  Activity,
  Target,
  Trophy,
  Flag,
  ChevronRight,
  ArrowRight,
  RefreshCw,
  LayoutGrid,
  type LucideIcon,
} from 'lucide-react';

import { ViewHeader, Surface, EmptyState, InlineNotice, Button, Badge } from '@/components/fairway';
import type { ViewHeaderSegment } from '@/components/fairway';
import type { WhatsNewItem, WhatsNewType } from '@/app/golf/actions/whats-new';

export interface FairwayWhatsNewProps {
  /** The verbatim getWhatsNewForCoach() result the route already fetched. */
  success: boolean;
  error?: string;
  items?: WhatsNewItem[];
  /** True when the feed may be incomplete (a category hit its row ceiling). */
  truncated?: boolean;
  /**
   * The team's IANA zone, from the server. Pins BOTH renders to one zone so
   * hydration agrees; undefined falls back to the viewer's zone, which is
   * applied identically on both sides.
   */
  timeZone?: string | null;
}

interface TypeDescriptor {
  label: string;
  Icon: LucideIcon;
  iconClass: string;
  bgClass: string;
}

// Per-device record of when the coach last viewed this feed. Items newer than
// this are surfaced as "New". Bumped (for the NEXT visit) on each view.
const LAST_SEEN_KEY = 'fw:whats-new:last-seen';

// Each lifecycle type gets a quiet tinted chip. Green is reserved for the
// positive "resolved / completed" outcomes (the single accent); everything else
// reads in restrained neutral/secondary tones — no rainbow of brand colors.
const TYPE_DESCRIPTORS: Record<WhatsNewType, TypeDescriptor> = {
  insight_resolved: {
    label: 'Insight resolved',
    Icon: CheckCircle2,
    iconClass: 'text-accent-700',
    bgClass: 'bg-accent-50',
  },
  insight_matured: {
    label: 'Insight matured',
    Icon: Trophy,
    iconClass: 'text-text-secondary',
    bgClass: 'bg-surface-sunken',
  },
  insight_detected: {
    label: 'New insight',
    Icon: Sparkles,
    iconClass: 'text-text-secondary',
    bgClass: 'bg-surface-sunken',
  },
  pattern_validated: {
    label: 'Pattern validated',
    Icon: Activity,
    iconClass: 'text-text-secondary',
    bgClass: 'bg-surface-sunken',
  },
  focus_area_created: {
    label: 'New focus area',
    Icon: Target,
    iconClass: 'text-text-secondary',
    bgClass: 'bg-surface-sunken',
  },
  focus_area_completed: {
    label: 'Focus area completed',
    Icon: Flag,
    iconClass: 'text-accent-700',
    bgClass: 'bg-accent-50',
  },
};

// ── Date helpers (pure presentation; mirror legacy page grouping) ────────────
function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function dayBucketKey(d: Date): string {
  return startOfDay(d).toISOString();
}

/**
 * Every formatter below takes an explicit locale and an explicit zone.
 *
 * They used to pass `undefined` as the locale, which means "whatever the
 * runtime default is" — Node's on the server, the browser's on the client.
 * This component carries `'use client'`, but Next server-renders it anyway, so
 * the two renders produced different strings for the same timestamp and React
 * threw #418 (text content mismatch) on this route in production. A time is
 * the worst case: any server/viewer zone difference changes it, which for a
 * function in `iad1` serving a coach anywhere is always.
 *
 * `'en-US'` pins the locale; `timeZone` (the team's, from the server) pins the
 * zone. When the team has not set one, `undefined` falls back to the viewer's
 * zone — still deterministic, because the same value is used on both sides of
 * hydration.
 */
const LOCALE = 'en-US';

function dayBucketLabel(
  bucketIso: string,
  todayKey: string,
  yesterdayKey: string,
  timeZone?: string,
): string {
  if (bucketIso === todayKey) return 'Today';
  if (bucketIso === yesterdayKey) return 'Yesterday';
  return new Date(bucketIso).toLocaleDateString(LOCALE, {
    month: 'short',
    day: 'numeric',
    timeZone,
  });
}

function timeOfDay(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleTimeString(LOCALE, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  });
}

// Full localized date+time for the <time> title/aria-label (P391) — disambiguates
// a bare time-of-day under a day-only header for assistive tech and on hover.
function fullDateTime(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleString(LOCALE, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  });
}

// "Updated Xm ago" freshness line (P392). Coarse + pure so it renders the same
// across re-runs within the same minute; a router.refresh() re-renders the page
// (re-runs the server fetch) so this anchors to "now" each render.
function timeAgo(fromMs: number, nowMs: number): string {
  const secs = Math.max(0, Math.round((nowMs - fromMs) / 1000));
  if (secs < 45) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

// ── Type filter (P397) ───────────────────────────────────────────────────────
// Quiet segment filtering for triage at scale. Each filter maps to the set of
// lifecycle types it admits; 'all' admits everything.
type WhatsNewFilter = 'all' | 'insights' | 'patterns' | 'focus';

const FILTER_TYPES: Record<Exclude<WhatsNewFilter, 'all'>, ReadonlySet<WhatsNewType>> = {
  insights: new Set<WhatsNewType>(['insight_resolved', 'insight_matured', 'insight_detected']),
  patterns: new Set<WhatsNewType>(['pattern_validated']),
  focus: new Set<WhatsNewType>(['focus_area_created', 'focus_area_completed']),
};

function itemMatchesFilter(item: WhatsNewItem, filter: WhatsNewFilter): boolean {
  if (filter === 'all') return true;
  return FILTER_TYPES[filter].has(item.type);
}

// Per-item deep link: every event carries a playerId, and the player profile is
// where that player's insights, patterns, and focus areas all live — so the row
// always resolves to the underlying entity's context, never a dead end (P388).
function hrefForItem(item: WhatsNewItem): string {
  return `/golf/dashboard/players/${item.playerId}/game?tab=scouting`;
}

export function FairwayWhatsNew({ success, error, items, truncated, timeZone }: FairwayWhatsNewProps) {
  const tz = timeZone ?? undefined;
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const todayKey = dayBucketKey(new Date());
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  const yesterdayKey = dayBucketKey(yest);

  // Freshness clock (P392): anchor to when this server snapshot arrived, then
  // tick a coarse "now" every 30s so the "Updated Xm ago" line advances instead
  // of lying as a frozen "just now". router.refresh() re-runs the server fetch
  // and feeds new props WITHOUT remounting this client instance, so we re-anchor
  // the clock whenever the item set changes (see whats-new/page.tsx).
  const itemsSignature = useMemo(
    () => `${items?.length ?? 0}:${items?.[0]?.occurredAt ?? ''}:${items?.[items.length - 1]?.occurredAt ?? ''}`,
    [items],
  );
  const [dataAtMs, setDataAtMs] = useState<number>(() => Date.now());
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    setDataAtMs(Date.now());
    setNowMs(Date.now());
  }, [itemsSignature]);
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Active type filter for triage (P397). Default 'all'; never persisted.
  const [filter, setFilter] = useState<WhatsNewFilter>('all');

  // Snapshot the last-seen timestamp ONCE on mount. We compute "new" against
  // this snapshot for the whole visit so badges don't vanish the instant we
  // re-stamp; the stamp below only affects the NEXT visit.
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(LAST_SEEN_KEY);
    } catch {
      stored = null;
    }
    setLastSeen(stored);
    setHydrated(true);
  }, []);

  const safeItems = useMemo(() => (success && items ? items : []), [success, items]);
  const newestOccurredAt = useMemo(
    () => safeItems.reduce<string | null>((max, i) => (max && max >= i.occurredAt ? max : i.occurredAt), null),
    [safeItems],
  );

  // Stamp the newest event time so the next visit clears these "New" badges.
  useEffect(() => {
    if (!hydrated || !newestOccurredAt) return;
    try {
      const prev = window.localStorage.getItem(LAST_SEEN_KEY);
      if (!prev || prev < newestOccurredAt) {
        window.localStorage.setItem(LAST_SEEN_KEY, newestOccurredAt);
      }
    } catch {
      /* localStorage unavailable (private mode / quota) — degrade silently */
    }
  }, [hydrated, newestOccurredAt]);

  const isNew = (item: WhatsNewItem): boolean =>
    hydrated && lastSeen !== null && item.occurredAt > lastSeen;

  const newCount = useMemo(
    () => (hydrated && lastSeen !== null ? safeItems.filter((i) => i.occurredAt > lastSeen).length : 0),
    [hydrated, lastSeen, safeItems],
  );

  // Per-filter totals drive the segment badges and the "showing N of M" meta.
  const filterCounts = useMemo(
    () => ({
      all: safeItems.length,
      insights: safeItems.filter((i) => itemMatchesFilter(i, 'insights')).length,
      patterns: safeItems.filter((i) => itemMatchesFilter(i, 'patterns')).length,
      focus: safeItems.filter((i) => itemMatchesFilter(i, 'focus')).length,
    }),
    [safeItems],
  );

  const visibleItems = useMemo(
    () => (filter === 'all' ? safeItems : safeItems.filter((i) => itemMatchesFilter(i, filter))),
    [safeItems, filter],
  );

  const grouped = new Map<string, WhatsNewItem[]>();
  for (const item of visibleItems) {
    const key = dayBucketKey(new Date(item.occurredAt));
    const arr = grouped.get(key);
    if (arr) arr.push(item);
    else grouped.set(key, [item]);
  }
  const dayKeys = Array.from(grouped.keys()).sort((a, b) => (a < b ? 1 : -1));
  const totalItems = safeItems.length;
  const visibleCount = visibleItems.length;
  const isFiltered = filter !== 'all';

  // Quiet segment filters (P397). Only render when there's enough to triage and
  // the load succeeded; badges show per-type counts so the density signal is
  // visible before clicking. Filters with zero items stay reachable but quiet.
  const filterSegments: ViewHeaderSegment[] = [
    { value: 'all', label: 'All', icon: <LayoutGrid aria-hidden />, badge: filterCounts.all },
    { value: 'insights', label: 'Insights', icon: <Sparkles aria-hidden />, badge: filterCounts.insights },
    { value: 'patterns', label: 'Patterns', icon: <Activity aria-hidden />, badge: filterCounts.patterns },
    { value: 'focus', label: 'Focus areas', icon: <Target aria-hidden />, badge: filterCounts.focus },
  ];
  const showFilters = success && totalItems > 1;

  const handleRefresh = () => {
    if (isRefreshing) return;
    startRefresh(() => router.refresh());
  };

  const meta =
    totalItems > 0 ? (
      <span className="flex flex-wrap items-center gap-2">
        <span className="tabular-nums">
          {isFiltered ? (
            <>
              {visibleCount} of {totalItems} {totalItems === 1 ? 'update' : 'updates'} · past 7 days
            </>
          ) : (
            <>
              {truncated ? 'Latest ' : ''}
              {totalItems} {totalItems === 1 ? 'update' : 'updates'} · past 7 days
            </>
          )}
        </span>
        {newCount > 0 && (
          <Badge tone="accent" variant="soft" size="sm" numeric>
            {newCount} new
          </Badge>
        )}
        {/* Freshness line (P392): the feed is a server snapshot, so disclose how
            stale it is and offer a manual refresh rather than reading as frozen. */}
        <span className="inline-flex items-center gap-1 text-text-tertiary" aria-live="polite">
          <span aria-hidden>·</span>
          <span>
            Updated{' '}
            <time dateTime={new Date(dataAtMs).toISOString()} title={fullDateTime(new Date(dataAtMs).toISOString(), tz)}>
              {timeAgo(dataAtMs, nowMs)}
            </time>
          </span>
        </span>
      </span>
    ) : undefined;

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-6 md:px-6 md:py-8 pb-24">
      <ViewHeader
        eyebrow="This Week"
        title="What’s new across your team."
        description={
          totalItems > 0
            ? 'CoachHelm lifecycle activity from the past 7 days — insights, patterns, and focus areas as your team plays.'
            : 'CoachHelm activity will appear here as your team plays more rounds.'
        }
        meta={meta}
        secondaryActions={
          success ? (
            <Button
              variant="ghost"
              size="sm"
              busy={isRefreshing}
              onClick={handleRefresh}
              leftIcon={<RefreshCw className="h-4 w-4" aria-hidden />}
            >
              Refresh
            </Button>
          ) : undefined
        }
        segments={showFilters ? filterSegments : undefined}
        segmentValue={filter}
        onSegmentChange={(value) => setFilter(value as WhatsNewFilter)}
        segmentsAriaLabel="Filter activity by type"
      />

      <div className="mt-8 flex flex-col gap-6">
        {!success ? (
          <InlineNotice tone="danger" title="Unable to load activity">
            {error ?? 'Failed to load activity'}
          </InlineNotice>
        ) : dayKeys.length === 0 && isFiltered ? (
          // The feed HAS activity, but the active type filter excludes all of it.
          // Honest empty state that points back to the unfiltered view (P397).
          <Surface elevation="shadow" padding="lg">
            <EmptyState
              icon={Sparkles}
              title="No matching activity"
              description="No updates of this type in the past 7 days. Clear the filter to see everything across your team."
              action={
                <Button variant="primary" size="md" onClick={() => setFilter('all')}>
                  Show all updates
                </Button>
              }
            />
          </Surface>
        ) : dayKeys.length === 0 ? (
          <Surface elevation="shadow" padding="lg">
            <EmptyState
              icon={Sparkles}
              title="No activity yet"
              description="No CoachHelm activity in the past 7 days. New insights and lifecycle changes will appear here as your team plays more rounds."
              action={
                <Button asChild variant="primary" size="md" rightIcon={<ArrowRight className="h-4 w-4" aria-hidden />}>
                  <Link href="/golf/dashboard/intelligence">Open CoachHelm</Link>
                </Button>
              }
              secondaryAction={
                <Button asChild variant="ghost" size="sm">
                  <Link href="/golf/dashboard/roster">View roster</Link>
                </Button>
              }
            />
          </Surface>
        ) : (
          <>
            {dayKeys.map((key) => {
              const dayItems = grouped.get(key) ?? [];
              const label = dayBucketLabel(key, todayKey, yesterdayKey, tz);
              return (
                <section
                  key={key}
                  className="flex flex-col gap-2"
                  // P395: the visual "(n)" count is aria-hidden, so give the
                  // group an accessible name carrying the same density signal.
                  aria-label={`${label}, ${dayItems.length} ${dayItems.length === 1 ? 'update' : 'updates'}`}
                >
                  <div className="flex items-baseline gap-2 px-1">
                    <h2 className="font-fw-display text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">
                      {label}
                    </h2>
                    <span
                      className="font-fw-sans text-caption tabular-nums text-text-tertiary"
                      aria-hidden
                    >
                      ({dayItems.length})
                    </span>
                  </div>
                  <Surface elevation="border" padding="none">
                    <ul className="divide-y divide-border-subtle">
                      {dayItems.map((item, idx) => (
                        <FeedRow
                          key={`${item.type}-${item.insightId ?? item.patternId ?? item.focusAreaId ?? idx}-${item.occurredAt}`}
                          item={item}
                          isNew={isNew(item)}
                          tz={tz}
                        />
                      ))}
                    </ul>
                  </Surface>
                </section>
              );
            })}

            {truncated && (
              <p className="px-1 font-fw-sans text-caption text-text-tertiary">
                Showing the latest {totalItems} updates from the past 7 days. Some older events may
                not be listed.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FeedRow({ item, isNew, tz }: { item: WhatsNewItem; isNew: boolean; tz?: string }) {
  const descriptor = TYPE_DESCRIPTORS[item.type];
  const { Icon } = descriptor;
  const href = hrefForItem(item);

  return (
    <li>
      <Link
        href={href}
        className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-0"
        aria-label={`${descriptor.label} for ${item.playerName}: ${item.title}${isNew ? ' (new)' : ''}`}
      >
        <span
          className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl ${descriptor.bgClass}`}
          aria-hidden
        >
          <Icon size={18} className={descriptor.iconClass} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-fw-sans text-eyebrow font-medium uppercase tracking-wide text-text-tertiary">
              {descriptor.label}
            </span>
            <span className="font-fw-sans text-caption text-text-tertiary" aria-hidden>
              ·
            </span>
            <span className="font-fw-sans text-body-sm font-medium text-text-secondary">
              {item.playerName}
            </span>
            {isNew && (
              <Badge tone="accent" variant="soft" size="sm">
                New
              </Badge>
            )}
            {/* P391: machine-readable <time> + full localized date in the
                title/aria-label so a bare time-of-day under a day-only header
                is never ambiguous (for sighted hover and assistive tech alike). */}
            <time
              dateTime={item.occurredAt}
              title={fullDateTime(item.occurredAt, tz)}
              aria-label={fullDateTime(item.occurredAt, tz)}
              className="ml-auto font-fw-sans text-caption tabular-nums text-text-tertiary"
            >
              {timeOfDay(item.occurredAt, tz)}
            </time>
          </div>
          <p className="mt-0.5 flex items-center gap-1 font-fw-sans text-body-sm font-medium text-text-primary">
            <span className="truncate group-hover:text-accent-700 group-focus-visible:text-accent-700">
              {item.title}
            </span>
            <ChevronRight
              size={14}
              className="flex-shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-accent-700"
              aria-hidden
            />
          </p>
          {item.description && (
            <p className="mt-0.5 line-clamp-2 font-fw-sans text-body-sm text-text-tertiary">
              {item.description}
            </p>
          )}
        </div>
      </Link>
    </li>
  );
}

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

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Sparkles,
  Activity,
  Target,
  Trophy,
  Flag,
  ChevronRight,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';

import { ViewHeader, Surface, EmptyState, InlineNotice, Button, Badge } from '@/components/fairway';
import type { WhatsNewItem, WhatsNewType } from '@/app/golf/actions/whats-new';

export interface FairwayWhatsNewProps {
  /** The verbatim getWhatsNewForCoach() result the route already fetched. */
  success: boolean;
  error?: string;
  items?: WhatsNewItem[];
  /** True when the feed may be incomplete (a category hit its row ceiling). */
  truncated?: boolean;
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

function dayBucketLabel(bucketIso: string, todayKey: string, yesterdayKey: string): string {
  if (bucketIso === todayKey) return 'Today';
  if (bucketIso === yesterdayKey) return 'Yesterday';
  return new Date(bucketIso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// Per-item deep link: every event carries a playerId, and the player profile is
// where that player's insights, patterns, and focus areas all live — so the row
// always resolves to the underlying entity's context, never a dead end (P388).
function hrefForItem(item: WhatsNewItem): string {
  return `/golf/dashboard/players/${item.playerId}`;
}

export function FairwayWhatsNew({ success, error, items, truncated }: FairwayWhatsNewProps) {
  const todayKey = dayBucketKey(new Date());
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  const yesterdayKey = dayBucketKey(yest);

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

  const grouped = new Map<string, WhatsNewItem[]>();
  for (const item of safeItems) {
    const key = dayBucketKey(new Date(item.occurredAt));
    const arr = grouped.get(key);
    if (arr) arr.push(item);
    else grouped.set(key, [item]);
  }
  const dayKeys = Array.from(grouped.keys()).sort((a, b) => (a < b ? 1 : -1));
  const totalItems = safeItems.length;

  const meta =
    totalItems > 0 ? (
      <span className="flex flex-wrap items-center gap-2">
        <span className="tabular-nums">
          {truncated ? 'Latest ' : ''}
          {totalItems} {totalItems === 1 ? 'update' : 'updates'} · past 7 days
        </span>
        {newCount > 0 && (
          <Badge tone="accent" variant="soft" size="sm" numeric>
            {newCount} new
          </Badge>
        )}
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
      />

      <div className="mt-8 flex flex-col gap-6">
        {!success ? (
          <InlineNotice tone="danger" title="Unable to load activity">
            {error ?? 'Failed to load activity'}
          </InlineNotice>
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
              const label = dayBucketLabel(key, todayKey, yesterdayKey);
              return (
                <section key={key} className="flex flex-col gap-2">
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

function FeedRow({ item, isNew }: { item: WhatsNewItem; isNew: boolean }) {
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
            <span className="ml-auto font-fw-sans text-caption tabular-nums text-text-tertiary">
              {timeOfDay(item.occurredAt)}
            </span>
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

export default FairwayWhatsNew;

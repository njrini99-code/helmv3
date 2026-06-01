/**
 * ============================================================================
 * Fairway · pages/whats-new · FairwayWhatsNew  (ADDITIVE · FLAG-GATED)
 * ----------------------------------------------------------------------------
 * The flag-on redesign of the COACH /golf/dashboard/whats-new route — a 7-day
 * lifecycle activity feed across the coach's team (insights detected / matured /
 * resolved, patterns validated, focus areas created / completed).
 *
 * PRESENTATION ONLY. Consumes the EXACT result the route already fetched via
 * getWhatsNewForCoach() — { success, error?, items? } — passed straight through
 * by whats-new/page.tsx. No data work, no fetch happens here; the day-grouping is
 * pure presentation over the items the route provided (same as the legacy page).
 *
 * HONESTY (DESIGN-SYSTEM §0 #8): an empty feed renders an honest EmptyState
 * ("No activity yet"), a failed load renders an honest error InlineNotice — only
 * real lifecycle events the route returned are ever shown.
 *
 * Tokens ONLY: bg-canvas, text-text-*, font-fw-display/sans, rounded-card,
 * shadow-soft, border-border-subtle, tabular-nums. Green = the single accent.
 * No glass / warm-* / blur / primary-*.
 * ========================================================================== */

import Link from 'next/link';
import {
  CheckCircle2,
  Sparkles,
  Activity,
  Target,
  Trophy,
  Flag,
  type LucideIcon,
} from 'lucide-react';

import { ViewHeader, Surface, EmptyState, InlineNotice } from '@/components/fairway';
import type { WhatsNewItem, WhatsNewType } from '@/app/golf/actions/whats-new';

export interface FairwayWhatsNewProps {
  /** The verbatim getWhatsNewForCoach() result the route already fetched. */
  success: boolean;
  error?: string;
  items?: WhatsNewItem[];
}

interface TypeDescriptor {
  label: string;
  Icon: LucideIcon;
  iconClass: string;
  bgClass: string;
}

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

export function FairwayWhatsNew({ success, error, items }: FairwayWhatsNewProps) {
  const todayKey = dayBucketKey(new Date());
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  const yesterdayKey = dayBucketKey(yest);

  const grouped = new Map<string, WhatsNewItem[]>();
  if (success && items) {
    for (const item of items) {
      const key = dayBucketKey(new Date(item.occurredAt));
      const arr = grouped.get(key);
      if (arr) arr.push(item);
      else grouped.set(key, [item]);
    }
  }
  const dayKeys = Array.from(grouped.keys()).sort((a, b) => (a < b ? 1 : -1));
  const totalItems = success && items ? items.length : 0;

  const meta =
    totalItems > 0 ? (
      <span className="tabular-nums">
        {totalItems} {totalItems === 1 ? 'update' : 'updates'} · past 7 days
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
              title="No activity yet"
              description="No CoachHelm activity in the past 7 days. New insights and lifecycle changes will appear here as your team plays more rounds."
            />
          </Surface>
        ) : (
          dayKeys.map((key) => {
            const dayItems = grouped.get(key) ?? [];
            const label = dayBucketLabel(key, todayKey, yesterdayKey);
            return (
              <section key={key} className="flex flex-col gap-2">
                <div className="flex items-baseline gap-2 px-1">
                  <h2 className="font-fw-display text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">
                    {label}
                  </h2>
                  <span className="font-fw-sans text-caption tabular-nums text-text-tertiary" aria-hidden>
                    ({dayItems.length})
                  </span>
                </div>
                <Surface elevation="border" padding="none">
                  <ul className="divide-y divide-border-subtle">
                    {dayItems.map((item, idx) => (
                      <FeedRow
                        key={`${item.type}-${item.insightId ?? item.patternId ?? item.focusAreaId ?? idx}-${item.occurredAt}`}
                        item={item}
                      />
                    ))}
                  </ul>
                </Surface>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

function FeedRow({ item }: { item: WhatsNewItem }) {
  const descriptor = TYPE_DESCRIPTORS[item.type];
  const { Icon } = descriptor;

  return (
    <li className="flex items-start gap-3 px-4 py-3">
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
          <span className="font-fw-sans text-caption text-text-tertiary" aria-hidden>·</span>
          <Link
            href={`/golf/dashboard/players/${item.playerId}`}
            className="font-fw-sans text-body-sm font-medium text-text-secondary transition-colors hover:text-accent-700"
          >
            {item.playerName}
          </Link>
          <span className="ml-auto font-fw-sans text-caption tabular-nums text-text-tertiary">
            {timeOfDay(item.occurredAt)}
          </span>
        </div>
        <p className="mt-0.5 truncate font-fw-sans text-body-sm font-medium text-text-primary">{item.title}</p>
        {item.description && (
          <p className="mt-0.5 line-clamp-2 font-fw-sans text-body-sm text-text-tertiary">{item.description}</p>
        )}
      </div>
    </li>
  );
}

export default FairwayWhatsNew;

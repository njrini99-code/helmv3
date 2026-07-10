'use client';

// =============================================================================
// src/components/baseball/player-profile/ProfileTimeline.tsx
//
// Wave 5 / packet P5.1 — Player Profile Timeline tab.
//
// Renders a chronological, visibility-aware feed of a player's timeline events
// (baseball_player_timeline_events) as produced by the Wave-3 read model
// getPlayerTimeline() — so the events handed in here are ALREADY filtered to what
// the current viewer may see (RLS + read-model defense-in-depth). This component
// therefore never decides access; it only RENDERS the visibility label + source
// provenance + (optional) acknowledgement chip honestly.
//
// Reuses GolfHelm primitives (Card / EmptyState / Skeleton) + cream/green tokens,
// matte cards, and framer-motion via LazyMotion/domAnimation + useReducedMotion.
// =============================================================================

import { useMemo } from 'react';
import { LazyMotion, m, useReducedMotion } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';

import {
  IconActivity,
  IconNote,
  IconSparkles,
  IconUpload,
  IconCalendar,
  IconBolt,
  IconAward,
  IconUserPlus,
  IconClock,
  IconLock,
  IconEye,
  IconCheck,
  IconList,
} from '@/components/icons';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { PaperCard } from '@/components/baseball/living-annual';
import type { TimelineEventView } from '@/lib/baseball/read-models/timeline';
import type { BaseballTimelineVisibility } from '@/lib/types';

// ─── Props ─────────────────────────────────────────────────────────────────

export interface ProfileTimelineProps {
  events: TimelineEventView[];
  /** The role the read model resolved for the viewer. Drives the staff hint. */
  viewerRole?: 'staff' | 'player' | 'none';
  /** Count of events the viewer is NOT permitted to see (staff_only, etc). */
  hiddenCount?: number;
  /** Honest error string from the read model, if the fetch failed. */
  error?: string | null;
  /** Render skeletons instead of content. */
  loading?: boolean;
  /**
   * Optional per-event acknowledgement state keyed by event id. When an entry
   * exists and is true, an "Acknowledged" chip is shown.
   */
  acknowledged?: Record<string, boolean>;
  /**
   * When provided, the acknowledgement chip becomes an interactive toggle (the
   * OUTCOME step of the source -> signal -> action -> timeline loop). Called with
   * the event id and the NEXT desired ack state. The parent owns the persistence
   * + optimistic state; this component only renders + forwards the intent.
   * When omitted, acks are read-only (display chip only).
   */
  onToggleAck?: (eventId: string, next: boolean) => void;
  /** Event ids whose ack toggle is mid-flight (disables + shows a busy hint). */
  pendingAckIds?: Set<string>;
}

// ─── Event-kind → icon mapping ───────────────────────────────────────────────

function eventIcon(eventType: string) {
  switch (eventType) {
    case 'stat':
      return <IconActivity size={15} />;
    case 'stat_milestone':
      return <IconAward size={15} />;
    case 'practice':
      return <IconCalendar size={15} />;
    case 'lift':
      return <IconBolt size={15} />;
    case 'note':
      return <IconNote size={15} />;
    case 'import':
      return <IconUpload size={15} />;
    case 'ai':
      return <IconSparkles size={15} />;
    case 'roster':
      return <IconUserPlus size={15} />;
    default:
      return <IconClock size={15} />;
  }
}

// ─── Visibility chip ─────────────────────────────────────────────────────────

const VISIBILITY_META: Record<
  BaseballTimelineVisibility,
  { label: string; cls: string; icon: React.ReactNode }
> = {
  team: {
    label: 'Team',
    cls: 'bg-primary-50 text-primary-700 border-primary-200/60',
    icon: <IconEye size={11} />,
  },
  player_only: {
    label: 'Player',
    cls: 'bg-warm-50 text-warm-700 border-warm-200/60',
    icon: <IconEye size={11} />,
  },
  staff_only: {
    // Ink system (Living Annual doctrine — no raw amber): restricted-visibility
    // reads pursuit clay soft, the same lane the Classes snapshot card uses for
    // "Academics restricted" (see snapshot-cards/shared.tsx ToneChip warning).
    label: 'Staff only',
    cls: 'bg-pursuit/10 text-pursuit border-pursuit/20',
    icon: <IconLock size={11} />,
  },
};

function VisibilityChip({ visibility }: { visibility: BaseballTimelineVisibility }) {
  const meta = VISIBILITY_META[visibility] ?? VISIBILITY_META.team;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-eyebrow font-semibold ${meta.cls}`}
    >
      {meta.icon}
      {meta.label}
    </span>
  );
}

// ─── Source / confidence chip ────────────────────────────────────────────────

const SOURCE_TONE: Record<string, string> = {
  ai: 'bg-warm-50 text-warm-700 border-warm-200/60',
  csv_import: 'bg-warm-100 text-warm-600 border-warm-200',
  integration: 'bg-warm-100 text-warm-600 border-warm-200',
  system: 'bg-warm-100 text-warm-600 border-warm-200',
  manual: 'bg-primary-50 text-primary-700 border-primary-200/60',
  unknown: 'bg-warm-100 text-warm-500 border-warm-200',
};

function SourceChip({
  label,
  source,
  confidence,
}: {
  label: string;
  source: string;
  confidence: number | null;
}) {
  const cls = SOURCE_TONE[source] ?? SOURCE_TONE.unknown;
  const pct = confidence === null ? null : Math.round(confidence * 100);
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-eyebrow font-medium ${cls}`}
    >
      {label}
      {pct !== null && <span className="tabular-nums opacity-80">· {pct}%</span>}
    </span>
  );
}

// ─── Acknowledged chip ───────────────────────────────────────────────────────

/**
 * Acknowledgement chip. Static when `onToggle` is omitted; an interactive,
 * accessible toggle button when provided (acknowledged <-> not). Disabled while
 * `pending` so a double-tap can't fire two mutations.
 */
function AckChip({
  acknowledged,
  onToggle,
  pending = false,
}: {
  acknowledged: boolean;
  onToggle?: (next: boolean) => void;
  pending?: boolean;
}) {
  const ackCls =
    'border-primary-200/60 bg-primary-50 text-primary-700';
  const unackCls =
    'border-warm-200 bg-warm-50 text-warm-500 hover:border-primary-200/60 hover:bg-primary-50 hover:text-primary-700';

  // Read-only display: only render anything when actually acknowledged.
  if (!onToggle) {
    if (!acknowledged) return null;
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-eyebrow font-semibold ${ackCls}`}
      >
        <IconCheck size={11} />
        Acknowledged
      </span>
    );
  }

  return (
    // A chip-sized toggle (text-eyebrow / px-2 py-0.5) — the Button primitive's
    // fixed sm/md/lg sizing + haptics would not produce a chip. Matches the
    // VisibilityChip/SourceChip siblings in the same row.
    // eslint-disable-next-line helm/no-raw-button
    <button
      type="button"
      onClick={() => onToggle(!acknowledged)}
      disabled={pending}
      aria-pressed={acknowledged}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-eyebrow font-semibold transition-colors disabled:opacity-60 disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300/60 ${
        acknowledged ? ackCls : unackCls
      }`}
    >
      <IconCheck size={11} />
      {acknowledged ? 'Acknowledged' : 'Acknowledge'}
    </button>
  );
}

// ─── Date formatting ─────────────────────────────────────────────────────────

function formatTimelineDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ─── Loading skeleton ────────────────────────────────────────────────────────

function TimelineSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex gap-4">
          <Skeleton variant="block" className="w-9 h-9 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton variant="line" className="h-4 w-1/2" />
            <Skeleton variant="line" className="h-3 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ProfileTimeline({
  events,
  viewerRole = 'staff',
  hiddenCount = 0,
  error = null,
  loading = false,
  acknowledged,
  onToggleAck,
  pendingAckIds,
}: ProfileTimelineProps) {
  const prefersReducedMotion = useReducedMotion();

  // Group events by calendar day for a clean editorial rhythm.
  const grouped = useMemo(() => {
    const groups = new Map<string, TimelineEventView[]>();
    for (const ev of events) {
      const day = ev.occurredAt.slice(0, 10); // YYYY-MM-DD
      const bucket = groups.get(day);
      if (bucket) bucket.push(ev);
      else groups.set(day, [ev]);
    }
    return Array.from(groups.entries());
  }, [events]);

  if (loading) {
    return (
      <Card variant="raised" className="p-6 md:p-8">
        <TimelineSkeleton />
      </Card>
    );
  }

  if (error) {
    return (
      <EmptyState
        variant="card"
        icon={<IconClock size={28} />}
        title="Timeline unavailable"
        description={error}
      />
    );
  }

  if (events.length === 0) {
    return (
      <EmptyState
        variant="card"
        icon={<IconList size={28} />}
        title="No timeline yet"
        description={
          viewerRole === 'player'
            ? 'Your activity will appear here as you log stats, attend practices, and your coaches add notes.'
            : 'Stats, practices, lifts, notes, imports, and AI insights for this player will appear here as they happen.'
        }
        suggestion={
          hiddenCount > 0
            ? `${hiddenCount} event${hiddenCount === 1 ? '' : 's'} are hidden by visibility rules.`
            : undefined
        }
      />
    );
  }

  return (
    <LazyMotion features={loadFeatures}>
      <div className="space-y-6">
        {/* Hidden-events honesty banner (staff context). PaperCard idiom —
            opaque paper + hairline, no glass/blur (Living Annual doctrine). */}
        {hiddenCount > 0 && (
          <PaperCard grain={false} className="flex items-center gap-2 px-4 py-2.5 text-sm text-warm-600">
            <IconLock size={14} />
            {hiddenCount} event{hiddenCount === 1 ? '' : 's'} hidden by visibility rules.
          </PaperCard>
        )}

        {grouped.map(([day, dayEvents], groupIdx) => (
          <div key={day}>
            {/* Day header */}
            <p className="text-eyebrow font-semibold text-warm-500 mb-3 uppercase tracking-wide">
              {new Date(`${day}T00:00:00`).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>

            <ol className="relative space-y-3 before:absolute before:left-[18px] before:top-2 before:bottom-2 before:w-px before:bg-warm-200/70">
              {dayEvents.map((ev, idx) => (
                <m.li
                  key={ev.id}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={
                    prefersReducedMotion
                      ? { duration: 0 }
                      : { duration: 0.25, delay: Math.min((groupIdx * 4 + idx) * 0.03, 0.3) }
                  }
                  className="relative flex gap-4"
                >
                  {/* Timeline node */}
                  <div className="relative z-[1] shrink-0 w-9 h-9 rounded-full bg-cream-50 border border-warm-200 flex items-center justify-center text-warm-600 shadow-sm">
                    {eventIcon(ev.eventType)}
                  </div>

                  {/* Card */}
                  <Card variant="flat" className="flex-1 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="text-sm font-semibold text-warm-900 leading-snug">
                          {ev.title}
                        </h4>
                        {ev.body && (
                          <p className="mt-1 text-sm text-warm-600 leading-relaxed">
                            {ev.body}
                          </p>
                        )}
                      </div>
                      <time
                        dateTime={ev.occurredAt}
                        className="shrink-0 text-eyebrow text-warm-400 tabular-nums whitespace-nowrap"
                      >
                        {formatTimelineDate(ev.occurredAt)}
                      </time>
                    </div>

                    {/* Chips row */}
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <VisibilityChip visibility={ev.visibility} />
                      <SourceChip
                        label={ev.sourceRef.label}
                        source={ev.sourceRef.source}
                        confidence={ev.confidence}
                      />
                      <AckChip
                        acknowledged={!!acknowledged?.[ev.id]}
                        onToggle={
                          onToggleAck
                            ? (next) => onToggleAck(ev.id, next)
                            : undefined
                        }
                        pending={pendingAckIds?.has(ev.id) ?? false}
                      />
                    </div>
                  </Card>
                </m.li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </LazyMotion>
  );
}

export default ProfileTimeline;

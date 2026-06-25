'use client';

// =============================================================================
// src/components/baseball/player-today/PlayerTodayClient.tsx
//
// Wave 4 / packet P4.2 — Player Today (daily loop), client surface.
//
// Renders the SELF-ONLY daily view from the Wave-3 read-model
// (PlayerTodayReadModel): today's schedule annotated with this player's
// acknowledgement status, recent captured stats, and the deferred
// assignments / readiness-check-in feeds.
//
// This component is DISPLAY-FIRST and honest:
//   - authorized:false / error  → labeled, recoverable states (no crash, no
//     fabricated data, no black background).
//   - deferred feeds            → "coming soon" cards driven by the read-model's
//     available:false flag; never invent assignments or check-ins.
//   - acknowledgement           → WIRED (P4.3 integration). Each event exposes a
//     real Acknowledge / Withdraw control backed by acknowledgeEvent /
//     withdrawAcknowledgement (actions/acknowledgements.ts). Optimistic local
//     state gives instant feedback; an honest error toast + revert covers
//     failure; router.refresh() reconciles against the server read-model. Initial
//     state is seeded from the read-model's per-event ackStatus (getPlayerToday
//     already self-joins baseball_event_acknowledgements server-side), so we do
//     NOT round-trip getMyEventAcknowledgements at mount — that action exists for
//     surfaces without a pre-joined model.
//
// EXTENSION SLOT: <div data-slot="player-lift-today"> is a labeled placeholder
// where the Performance vertical's PlayerLiftToday card is wired in integration.
// We deliberately do NOT import a lifting component that doesn't exist yet.
//
// UI: reuses GolfHelm primitives (Card / EmptyState / Skeleton / Button) +
// cream/green tokens + glass/matte patterns. Motion via LazyMotion/domAnimation
// honoring prefers-reduced-motion.
// =============================================================================

import { useCallback, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';

import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/sonner';
import {
  IconCalendar,
  IconClock,
  IconCheck,
  IconCheckCircle2,
  IconMapPin,
  IconActivity,
  IconDumbbell,
  IconClipboardList,
  IconAlertCircle,
  IconRotateCcw,
  IconSparkles,
  IconGauge,
  IconShieldCheck,
  IconShieldAlert,
  IconChevronRight,
  IconTarget,
  IconFlag,
  IconUsers,
  IconMessage,
  IconList,
} from '@/components/icons';
import {
  acknowledgeEvent,
  withdrawAcknowledgement,
} from '@/app/baseball/actions/acknowledgements';
import {
  acknowledgePlayerAction,
  completePlayerAction,
} from '@/app/baseball/actions/player-actions';
import type {
  PlayerTodayReadModel,
  PlayerTodayEvent,
  PlayerTodayStat,
  PlayerTodayAssignment,
  PlayerActionItem,
  PlayerActionType,
  PlayerTodayReadiness,
  AckStatus,
  PlayerTodayTaskItem,
  PlayerTodayCoachNote,
} from '@/lib/baseball/read-models/player-today';
import type { ActiveBaseballRole } from '@/lib/baseball/active-context-shared';
import PlayerLiftToday from '@/components/baseball/performance/PlayerLiftToday';
import type { DailyContractReadModel } from '@/lib/baseball/read-models/player-daily-contract';
import type { PassportReadModel } from '@/lib/baseball/read-models/player-passport';
import { DailyContract } from '@/components/baseball/daily-contract/DailyContract';
import { PlayerPassportCard } from '@/components/baseball/passport/PlayerPassportCard';
import { SorenessCheckCard } from '@/components/lifting/soreness/SorenessCheckCard';
import { WeightCheckInCard } from '@/components/lifting/weight/WeightCheckInCard';
import { NutritionPlanCard } from '@/components/lifting/nutrition/NutritionPlanCard';
import type { PerformanceCheckinSlot } from '@/app/baseball/(player-dashboard)/player/today/page';

// -----------------------------------------------------------------------------
// Props
// -----------------------------------------------------------------------------

interface PlayerTodayClientProps {
  model: PlayerTodayReadModel;
  /** Daily Contract loop (V5) — the daily commitment mechanic. */
  dailyContract: DailyContractReadModel;
  /** Player Passport (V5) — source-backed identity snapshot (compact embed). */
  passport: PassportReadModel;
  activeRole: ActiveBaseballRole;
  /** ISO date (YYYY-MM-DD) the read-model treated as "today" (display only). */
  todayIso: string;
  /**
   * Resolved server-side: due soreness check, weight check-in, and active
   * nutrition plan for the lifting Lab. null when the player has no athlete
   * row or no actionable items.
   */
  performanceSlot: PerformanceCheckinSlot | null;
}

// -----------------------------------------------------------------------------
// Formatting helpers
// -----------------------------------------------------------------------------

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatTimeRange(start: string, end: string | null): string {
  const s = formatTime(start);
  const e = formatTime(end);
  if (s && e) return `${s} – ${e}`;
  return s || 'All day';
}

function formatLongDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function prettyLabel(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const SOURCE_LABEL: Record<string, string> = {
  manual: 'Logged',
  csv_import: 'Imported',
  integration: 'Synced',
};

// -----------------------------------------------------------------------------
// Section header
// -----------------------------------------------------------------------------

function SectionHeader({
  icon,
  title,
  count,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  count?: number;
  /**
   * Optional trailing action (e.g. a "View all" deep-link to the section's full
   * depth surface). Right-aligned so the title + count stay left. Purely additive
   * — existing call sites omit it and render unchanged.
   */
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
        {icon}
      </span>
      <h2 className="text-xl font-semibold tracking-tight text-warm-900">{title}</h2>
      {typeof count === 'number' && count > 0 && (
        <span className="ml-0.5 rounded-full bg-warm-100 px-2 py-0.5 text-eyebrow font-semibold tabular-nums text-warm-600">
          {count}
        </span>
      )}
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Summary strip
// -----------------------------------------------------------------------------

function SummaryStrip({ model }: { model: PlayerTodayReadModel }) {
  const liftsOpen = model.summary.assignmentsOpen;
  const coachOpen = model.summary.coachActionsOpen;
  const coachDue = model.summary.coachActionsDue;
  const tiles = [
    {
      label: 'Events Today',
      value: model.summary.eventsToday,
      icon: <IconCalendar size={18} />,
      tone: 'text-warm-600',
      bg: 'bg-warm-100',
    },
    {
      label: 'Need Acknowledgement',
      value: model.summary.eventsPendingAck,
      icon: <IconAlertCircle size={18} />,
      tone: model.summary.eventsPendingAck > 0 ? 'text-amber-600' : 'text-warm-600',
      bg: model.summary.eventsPendingAck > 0 ? 'bg-amber-50' : 'bg-warm-100',
    },
    {
      // Coach assignments are the player-side of source -> signal -> action: the
      // most action-relevant tile on the daily loop. Emphasized amber when any is
      // due/overdue, green when there's open work, neutral when clear.
      label: 'From Coach',
      value: coachOpen,
      icon: <IconClipboardList size={18} />,
      tone:
        coachDue > 0
          ? 'text-amber-600'
          : coachOpen > 0
            ? 'text-primary-600'
            : 'text-warm-600',
      bg:
        coachDue > 0 ? 'bg-amber-50' : coachOpen > 0 ? 'bg-primary-50' : 'bg-warm-100',
    },
    {
      label: 'Lifts Today',
      value: model.summary.assignmentsToday,
      icon: <IconDumbbell size={18} />,
      tone: liftsOpen > 0 ? 'text-primary-600' : 'text-warm-600',
      bg: liftsOpen > 0 ? 'bg-primary-50' : 'bg-warm-100',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {tiles.map((t) => (
        <Card key={t.label} variant="raised" padding="md">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-eyebrow font-semibold uppercase tracking-wide text-warm-400">
                {t.label}
              </p>
              <p className="mt-1.5 text-2xl font-semibold tabular-nums text-warm-900">
                {t.value}
              </p>
            </div>
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-xl ${t.bg} ${t.tone}`}
            >
              {t.icon}
            </span>
          </div>
        </Card>
      ))}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Readiness gate — the daily loop's "are you good to train" signal
// -----------------------------------------------------------------------------

// Maps the read-model's cream/green tone to surface classes (no new palette).
const READINESS_TONE_CLASSES: Record<
  'success' | 'warning' | 'error' | 'info',
  { border: string; chipBg: string; chipText: string; iconBg: string; iconText: string }
> = {
  success: {
    border: 'border-primary-200',
    chipBg: 'bg-primary-50',
    chipText: 'text-primary-700',
    iconBg: 'bg-primary-100',
    iconText: 'text-primary-600',
  },
  warning: {
    border: 'border-amber-200',
    chipBg: 'bg-amber-50',
    chipText: 'text-amber-700',
    iconBg: 'bg-amber-100',
    iconText: 'text-amber-600',
  },
  error: {
    border: 'border-red-200',
    chipBg: 'bg-red-50',
    chipText: 'text-red-700',
    iconBg: 'bg-red-100',
    iconText: 'text-red-600',
  },
  info: {
    border: 'border-warm-200',
    chipBg: 'bg-warm-50',
    chipText: 'text-warm-700',
    iconBg: 'bg-warm-100',
    iconText: 'text-warm-600',
  },
};

function ReadinessGate({ readiness }: { readiness: PlayerTodayReadiness }) {
  // No check-in yet → honest prompt, never a fabricated band.
  if (!readiness.available || readiness.band == null) {
    return (
      <Card variant="raised" padding="md" className="border-warm-200">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warm-100 text-warm-500">
            <IconGauge size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-warm-900">Readiness</h2>
              <span className="rounded-full bg-warm-100 px-2.5 py-1 text-eyebrow font-semibold text-warm-500">
                Not checked in
              </span>
            </div>
            <p className="mt-1 text-sm text-warm-500">{readiness.note}</p>
            <p className="mt-2 text-eyebrow text-warm-400">
              Complete your daily check-in below to unlock today&apos;s readiness.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const tone = READINESS_TONE_CLASSES[readiness.tone ?? 'warning'];
  const isGood = readiness.tone === 'success';

  return (
    <Card variant="raised" padding="md" className={tone.border}>
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone.iconBg} ${tone.iconText}`}
        >
          {isGood ? <IconShieldCheck size={18} /> : <IconShieldAlert size={18} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-warm-900">Readiness</h2>
            <div className="flex items-center gap-1.5">
              {readiness.confidence && (
                <span className="rounded-full bg-warm-100 px-2 py-0.5 text-eyebrow font-semibold uppercase tracking-wide text-warm-500">
                  {readiness.confidence} confidence
                </span>
              )}
              <span
                className={`rounded-full px-2.5 py-1 text-eyebrow font-semibold ${tone.chipBg} ${tone.chipText}`}
              >
                {readiness.bandLabel}
              </span>
            </div>
          </div>

          {/* Why — each reason cites an input (source -> signal honesty). */}
          {readiness.reasons.length > 0 && (
            <ul className="mt-2 space-y-1">
              {readiness.reasons.map((r, i) => (
                <li key={i} className="flex items-start gap-1.5 text-sm text-warm-600">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-warm-300" />
                  <span className="first-letter:uppercase">{r}</span>
                </li>
              ))}
            </ul>
          )}

          {readiness.suggestedAction && (
            <p className="mt-2 text-sm font-medium text-warm-700">
              {readiness.suggestedAction}
            </p>
          )}

          {/* Honest footers: staleness + missing inputs, never hidden. */}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-eyebrow text-warm-400">
            {!readiness.submittedToday && (
              <span className="flex items-center gap-1">
                <IconAlertCircle size={12} />
                {readiness.stale
                  ? "Based on an older check-in — submit today's below."
                  : "No check-in for today yet — submit one below."}
              </span>
            )}
            {readiness.missingInputs.length > 0 && (
              <span>Missing: {readiness.missingInputs.join(', ')}</span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Assignments (lift sessions due) — real feed from baseball_lift_sessions
// -----------------------------------------------------------------------------

const LIFT_STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  assigned: { label: 'Assigned', cls: 'bg-warm-100 text-warm-700' },
  started: { label: 'In progress', cls: 'bg-amber-100 text-amber-700' },
  modified: { label: 'Adjusted', cls: 'bg-amber-100 text-amber-700' },
  completed: { label: 'Completed', cls: 'bg-primary-100 text-primary-700' },
  missed: { label: 'Missed', cls: 'bg-red-100 text-red-700' },
  excused: { label: 'Excused', cls: 'bg-warm-100 text-warm-600' },
};

function AssignmentsSection({
  feed,
}: {
  feed: PlayerTodayReadModel['assignments'];
}) {
  return (
    <section>
      <SectionHeader
        icon={<IconDumbbell size={16} />}
        title="Lifts Due"
        count={feed.items.length}
      />
      {feed.items.length === 0 ? (
        <EmptyState
          variant="card"
          glass
          icon={<IconDumbbell size={40} />}
          title="No lifts scheduled"
          description={feed.note}
        />
      ) : (
        <Card variant="raised" noPadding>
          <ul className="divide-y divide-warm-100">
            {feed.items.map((a: PlayerTodayAssignment) => {
              const badge = LIFT_STATUS_LABEL[a.status] ?? {
                label: prettyLabel(a.status),
                cls: 'bg-warm-100 text-warm-600',
              };
              return (
                <li
                  key={a.id}
                  className="flex items-center gap-3 px-5 py-3.5"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                    <IconDumbbell size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-warm-900">
                      {a.title}
                    </p>
                    <p className="text-eyebrow uppercase tracking-wide text-warm-400">
                      {a.isToday ? 'Today' : a.scheduledDate}
                      {a.estimatedMinutes ? ` · ~${a.estimatedMinutes} min` : ''}
                      {a.baseballContext ? ` · ${prettyLabel(a.baseballContext)}` : ''}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-eyebrow font-semibold ${badge.cls}`}
                  >
                    {badge.label}
                  </span>
                  <IconChevronRight size={14} className="shrink-0 text-warm-400" />
                </li>
              );
            })}
          </ul>
          <p className="border-t border-warm-100 px-5 py-2.5 text-eyebrow text-warm-400">
            Log your sets in the Lift &amp; Check-in card.
          </p>
        </Card>
      )}
    </section>
  );
}

// -----------------------------------------------------------------------------
// Coach assignments (player side of source -> signal -> action)
//
// A coach converting a signal into a player_task in the Signal Inbox assigns the
// player real work. This section is where that work finally LANDS on the player:
// a completable obligation with acknowledge + done controls that flip the
// action's status (feeding the staff outcome sweep), and a provenance line that
// shows the work traces back to a coaching signal.
// -----------------------------------------------------------------------------

const PLAYER_ACTION_META: Record<
  PlayerActionType,
  { label: string; icon: React.ReactNode }
> = {
  player_task: { label: 'Task', icon: <IconClipboardList size={16} /> },
  video_request: { label: 'Video', icon: <IconTarget size={16} /> },
  message: { label: 'Message', icon: <IconFlag size={16} /> },
};

const PLAYER_ACTION_STATUS_BADGE: Record<
  PlayerActionItem['status'],
  { label: string; cls: string }
> = {
  open: { label: 'New', cls: 'bg-amber-50 text-amber-700' },
  in_progress: { label: 'In progress', cls: 'bg-primary-50 text-primary-700' },
  blocked: { label: 'Blocked', cls: 'bg-red-50 text-red-700' },
};

/** Local optimistic status for a single assignment card. */
type ActionView = { status: PlayerActionItem['status'] | 'completed' };

function CoachAssignmentCard({
  item,
  view,
  busy,
  onAcknowledge,
  onComplete,
}: {
  item: PlayerActionItem;
  view: ActionView;
  busy: boolean;
  onAcknowledge: () => void;
  onComplete: () => void;
}) {
  const meta = PLAYER_ACTION_META[item.actionType];
  const completed = view.status === 'completed';
  const badge = completed
    ? { label: 'Completed', cls: 'bg-primary-100 text-primary-700' }
    : (PLAYER_ACTION_STATUS_BADGE[view.status as PlayerActionItem['status']] ?? {
        label: prettyLabel(view.status),
        cls: 'bg-warm-100 text-warm-600',
      });

  return (
    <Card
      variant="raised"
      padding="md"
      className={`transition-all duration-200 ${
        completed ? 'border-primary-200 bg-primary-50/30' : 'hover:border-warm-300 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
            completed
              ? 'bg-primary-100 text-primary-600'
              : 'bg-primary-50 text-primary-600'
          }`}
        >
          {completed ? <IconCheckCircle2 size={16} /> : meta.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3
                className={`truncate text-base font-semibold ${
                  completed ? 'text-warm-500 line-through' : 'text-warm-900'
                }`}
              >
                {item.title}
              </h3>
              <p className="mt-0.5 text-eyebrow font-semibold uppercase tracking-wide text-warm-400">
                {meta.label}
                {item.dueDate
                  ? item.isOverdue
                    ? ` · Overdue (${item.dueDate})`
                    : item.isDue
                      ? ' · Due today'
                      : ` · Due ${item.dueDate}`
                  : ''}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-eyebrow font-semibold ${badge.cls}`}
            >
              {badge.label}
            </span>
          </div>

          {item.detail && (
            <p className="mt-2 text-sm text-warm-600">{item.detail}</p>
          )}

          {/* Provenance: source -> signal -> assigned-to-you. */}
          <p className="mt-2 flex items-center gap-1.5 text-eyebrow text-warm-400">
            <IconSparkles size={12} className="shrink-0" />
            {item.sourceRef.label}
            {item.confidence != null && (
              <span className="tabular-nums">
                · {Math.round(item.confidence * 100)}% confidence
              </span>
            )}
          </p>

          {/* Controls — acknowledge to start, complete when done. A completed
              action is terminal from the player side (no withdraw). */}
          {!completed && (
            <div className="mt-3.5 flex items-center justify-end gap-2 border-t border-warm-100 pt-3">
              {view.status === 'open' || view.status === 'blocked' ? (
                <Button
                  variant="secondary"
                  size="sm"
                  isLoading={busy}
                  onClick={onAcknowledge}
                  leftIcon={<IconCheck size={14} />}
                >
                  Acknowledge
                </Button>
              ) : null}
              <Button
                variant="primary"
                size="sm"
                isLoading={busy}
                onClick={onComplete}
                leftIcon={<IconCheckCircle2 size={14} />}
              >
                Mark done
              </Button>
            </div>
          )}
          {completed && (
            <p className="mt-3 border-t border-warm-100 pt-3 text-eyebrow text-primary-600">
              Nice work — your coach can see this is done.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

function CoachAssignmentsSection({
  feed,
}: {
  feed: PlayerTodayReadModel['coachActions'];
}) {
  const router = useRouter();
  const { addToast } = useToast();
  const [, startTransition] = useTransition();

  // Optimistic per-action status overrides keyed by action id. Absent → fall
  // back to the read-model status. router.refresh() re-seeds from the server
  // (and a completed action drops out of the feed on the next read).
  const [overrides, setOverrides] = useState<Record<string, ActionView>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const viewFor = useCallback(
    (item: PlayerActionItem): ActionView =>
      overrides[item.id] ?? { status: item.status },
    [overrides],
  );

  const run = useCallback(
    async (
      item: PlayerActionItem,
      next: 'in_progress' | 'completed',
      fn: (id: string) => Promise<{ success: boolean; error?: string }>,
      successTitle: string,
    ) => {
      if (busyId) return;
      setBusyId(item.id);
      const prev = viewFor(item);
      setOverrides((o) => ({ ...o, [item.id]: { status: next } }));
      try {
        const res = await fn(item.id);
        if (res.success) {
          addToast({ type: 'success', title: successTitle });
          startTransition(() => router.refresh());
        } else {
          setOverrides((o) => ({ ...o, [item.id]: prev })); // revert
          addToast({
            type: 'error',
            title: 'Could not update',
            description: res.error ?? 'Please try again.',
          });
        }
      } catch {
        setOverrides((o) => ({ ...o, [item.id]: prev })); // revert
        addToast({
          type: 'error',
          title: 'Could not update',
          description: 'Please try again.',
        });
      } finally {
        setBusyId(null);
      }
    },
    [busyId, viewFor, addToast, router],
  );

  return (
    <section>
      <SectionHeader
        icon={<IconClipboardList size={16} />}
        title="From Your Coach"
        count={feed.items.length}
      />
      {feed.items.length === 0 ? (
        <EmptyState
          variant="card"
          glass
          icon={<IconClipboardList size={40} />}
          title="No assignments right now"
          description="When your coach assigns you a task from a coaching signal, it'll show up here for you to complete."
        />
      ) : (
        <div className="space-y-3">
          {feed.items.map((item) => (
            <CoachAssignmentCard
              key={item.id}
              item={item}
              view={viewFor(item)}
              busy={busyId === item.id}
              onAcknowledge={() =>
                run(
                  item,
                  'in_progress',
                  acknowledgePlayerAction,
                  'Assignment acknowledged',
                )
              }
              onComplete={() =>
                run(item, 'completed', completePlayerAction, 'Marked done')
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}

// -----------------------------------------------------------------------------
// Schedule
// -----------------------------------------------------------------------------

// Local, optimistic acknowledgement view-state. Seeded from the read-model's
// per-event ackStatus; mutated optimistically and reconciled by router.refresh().
type AckView = { status: AckStatus; acknowledgedAt: string | null };

function AckBadge({ status }: { status: AckStatus }) {
  if (status === 'acknowledged') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1 text-eyebrow font-semibold text-primary-700">
        <IconCheckCircle2 size={12} />
        Acknowledged
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-eyebrow font-semibold text-amber-700">
      <IconAlertCircle size={12} />
      Needs acknowledgement
    </span>
  );
}

function ScheduleCard({
  event,
  ack,
  busy,
  onAcknowledge,
  onWithdraw,
}: {
  event: PlayerTodayEvent;
  ack: AckView;
  busy: boolean;
  onAcknowledge: () => void;
  onWithdraw: () => void;
}) {
  const acknowledged = ack.status === 'acknowledged';

  return (
    <Card variant="raised" padding="md" className="transition-all duration-200 hover:border-warm-300 hover:shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold text-warm-900">{event.title}</h3>
            {event.isMandatory && (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-eyebrow font-semibold text-red-600">
                Mandatory
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-warm-500">{prettyLabel(event.eventType)}</p>
        </div>
        <AckBadge status={ack.status} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-warm-600">
        <span className="flex items-center gap-1.5 tabular-nums">
          <IconClock size={14} className="text-warm-400" />
          {formatTimeRange(event.startTime, event.endTime)}
        </span>
        {event.location && (
          <span className="flex items-center gap-1.5">
            <IconMapPin size={14} className="text-warm-400" />
            {event.location}
          </span>
        )}
      </div>

      {/* Acknowledge / Withdraw control — the spec's "Acknowledge" primary CTA. */}
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-warm-100 pt-3">
        {acknowledged ? (
          <p className="min-w-0 text-eyebrow text-warm-400">
            {ack.acknowledgedAt
              ? `Acknowledged ${formatTime(ack.acknowledgedAt) || 'today'}`
              : 'Acknowledged'}
          </p>
        ) : (
          <p className="min-w-0 text-eyebrow text-warm-400">
            Let your staff know you&apos;ve seen this.
          </p>
        )}
        {acknowledged ? (
          <Button
            variant="ghost"
            size="sm"
            isLoading={busy}
            onClick={onWithdraw}
            leftIcon={<IconRotateCcw size={14} />}
            className="shrink-0"
          >
            Withdraw
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            isLoading={busy}
            onClick={onAcknowledge}
            leftIcon={<IconCheck size={14} />}
            className="shrink-0"
          >
            Acknowledge
          </Button>
        )}
      </div>
    </Card>
  );
}

function ScheduleSection({ events }: { events: PlayerTodayEvent[] }) {
  const router = useRouter();
  const { addToast } = useToast();
  const [, startTransition] = useTransition();
  const [showAll, setShowAll] = useState(false);

  // Optimistic per-event ack overrides keyed by event id. Absent → fall back to
  // the read-model's seeded value. router.refresh() re-seeds from the server.
  const [overrides, setOverrides] = useState<Record<string, AckView>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const ackFor = useCallback(
    (e: PlayerTodayEvent): AckView =>
      overrides[e.id] ?? { status: e.ackStatus, acknowledgedAt: e.acknowledgedAt },
    [overrides],
  );

  const handleAcknowledge = useCallback(
    async (event: PlayerTodayEvent) => {
      if (busyId) return;
      setBusyId(event.id);
      const prev = ackFor(event);
      const optimisticAt = new Date().toISOString();
      // Optimistic flip for instant feedback.
      setOverrides((o) => ({
        ...o,
        [event.id]: { status: 'acknowledged', acknowledgedAt: optimisticAt },
      }));
      try {
        const res = await acknowledgeEvent(event.id);
        if (res.success) {
          setOverrides((o) => ({
            ...o,
            [event.id]: {
              status: 'acknowledged',
              acknowledgedAt: res.acknowledgedAt ?? optimisticAt,
            },
          }));
          addToast({ type: 'success', title: 'Acknowledged' });
          startTransition(() => router.refresh());
        } else {
          setOverrides((o) => ({ ...o, [event.id]: prev })); // revert
          addToast({
            type: 'error',
            title: 'Could not acknowledge',
            description: res.error ?? 'Please try again.',
          });
        }
      } catch {
        setOverrides((o) => ({ ...o, [event.id]: prev })); // revert
        addToast({
          type: 'error',
          title: 'Could not acknowledge',
          description: 'Please try again.',
        });
      } finally {
        setBusyId(null);
      }
    },
    [busyId, ackFor, addToast, router],
  );

  const handleWithdraw = useCallback(
    async (event: PlayerTodayEvent) => {
      if (busyId) return;
      setBusyId(event.id);
      const prev = ackFor(event);
      setOverrides((o) => ({
        ...o,
        [event.id]: { status: 'pending', acknowledgedAt: null },
      }));
      try {
        const res = await withdrawAcknowledgement(event.id);
        if (res.success) {
          addToast({ type: 'success', title: 'Acknowledgement withdrawn' });
          startTransition(() => router.refresh());
        } else {
          setOverrides((o) => ({ ...o, [event.id]: prev })); // revert
          addToast({
            type: 'error',
            title: 'Could not withdraw',
            description: res.error ?? 'Please try again.',
          });
        }
      } catch {
        setOverrides((o) => ({ ...o, [event.id]: prev })); // revert
        addToast({
          type: 'error',
          title: 'Could not withdraw',
          description: 'Please try again.',
        });
      } finally {
        setBusyId(null);
      }
    },
    [busyId, ackFor, addToast, router],
  );

  const visible = showAll ? events : events.slice(0, 4);

  return (
    <section>
      <SectionHeader
        icon={<IconCalendar size={16} />}
        title="Today's Schedule"
        count={events.length}
      />
      {events.length === 0 ? (
        <EmptyState
          variant="card"
          glass
          icon={<IconCalendar size={40} />}
          title="Nothing scheduled today"
          description="When your coach adds practices or games for today, they'll show up here."
        />
      ) : (
        <div className="space-y-3">
          {visible.map((e) => (
            <ScheduleCard
              key={e.id}
              event={e}
              ack={ackFor(e)}
              busy={busyId === e.id}
              onAcknowledge={() => handleAcknowledge(e)}
              onWithdraw={() => handleWithdraw(e)}
            />
          ))}
          {events.length > 4 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAll((v) => !v)}
              className="w-full"
            >
              {showAll ? 'Show less' : `Show ${events.length - 4} more`}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

// -----------------------------------------------------------------------------
// Recent stats
// -----------------------------------------------------------------------------

function RecentStatsSection({ stats }: { stats: PlayerTodayStat[] }) {
  // The full stats depth surface (season line, trend + game-vs-practice charts,
  // session history) lives at /baseball/dashboard/my-stats. Player Today only
  // PREVIEWS the most recent sessions inline — so every state links out to the
  // full page, making that depth reachable from the player's primary surface.
  const myStatsLink = (
    <Link
      href="/baseball/dashboard/my-stats"
      className="group inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-eyebrow font-semibold uppercase tracking-wide text-primary-600 transition-colors hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
    >
      My Stats
      <IconChevronRight
        size={14}
        className="transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );

  return (
    <section>
      <SectionHeader
        icon={<IconActivity size={16} />}
        title="Recent Sessions"
        count={stats.length}
        action={myStatsLink}
      />
      {stats.length === 0 ? (
        <EmptyState
          variant="card"
          glass
          icon={<IconActivity size={40} />}
          title="No recent sessions"
          description="Your captured game and practice stats will appear here as they're logged. Visit My Stats anytime to see your season totals and trends."
          action={
            <Link
              href="/baseball/dashboard/my-stats"
              className="inline-flex items-center gap-1.5 rounded-full bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
            >
              View My Stats
              <IconChevronRight size={16} />
            </Link>
          }
        />
      ) : (
        <Card variant="raised" noPadding>
          <ul className="divide-y divide-warm-100">
            {stats.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 px-5 py-3.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-warm-900">
                    {s.sessionName ?? prettyLabel(s.statType)}
                  </p>
                  <p className="text-eyebrow uppercase tracking-wide text-warm-400">
                    {prettyLabel(s.statType)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm tabular-nums text-warm-500">
                    {s.sessionDate}
                  </span>
                  <span className="rounded-full bg-warm-100 px-2 py-0.5 text-eyebrow font-semibold text-warm-500">
                    {SOURCE_LABEL[s.sourceRef.source] ?? prettyLabel(s.sourceRef.source)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <Link
            href="/baseball/dashboard/my-stats"
            className="group flex items-center justify-center gap-1.5 border-t border-warm-100 px-5 py-3 text-sm font-semibold text-primary-600 transition-colors hover:bg-primary-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/40"
          >
            View season totals &amp; trends
            <IconChevronRight
              size={16}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        </Card>
      )}
    </section>
  );
}

// -----------------------------------------------------------------------------
// Performance check-in section — soreness / weight / nutrition due today
//
// Additive surface: only renders when performanceSlot is non-null AND at least
// one item is actionable. Never fabricates cards or shows fake "coming soon"
// states — when there is nothing due, this section simply doesn't appear.
// -----------------------------------------------------------------------------

function PerformanceCheckinSection({ slot }: { slot: PerformanceCheckinSlot }) {
  const today = new Date().toISOString().slice(0, 10);

  const hasSoreness = slot.sorenessToday !== null;
  const hasWeight = slot.weightToday !== null;
  const hasNutrition = slot.nutritionPlan !== null;

  if (!hasSoreness && !hasWeight && !hasNutrition) return null;

  return (
    <section>
      <SectionHeader
        icon={<IconActivity size={16} />}
        title="Daily Check-Ins"
      />
      <div className="space-y-3">
        {hasSoreness && slot.sorenessToday && (
          <SorenessCheckCard
            request={slot.sorenessToday.request}
            orgId={slot.orgId}
            athleteId={slot.athleteId}
            alreadySubmitted={slot.sorenessToday.checkin !== null}
            sorenessStatus={slot.sorenessToday.checkin?.soreness_status ?? null}
          />
        )}

        {hasWeight && slot.weightToday && (
          <WeightCheckInCard
            orgId={slot.orgId}
            athleteId={slot.athleteId}
            requestId={slot.weightToday.pendingRequestId}
            dueDate={slot.weightToday.pendingDueDate ?? today}
          />
        )}

        {hasNutrition && slot.nutritionPlan && (
          <NutritionPlanCard
            card={slot.nutritionPlan}
            orgId={slot.orgId}
          />
        )}
      </div>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Lift + check-in input surface (the daily loop's execution card)
// -----------------------------------------------------------------------------

function LiftTodaySlot() {
  return (
    <section>
      <SectionHeader icon={<IconDumbbell size={16} />} title="Lift & Check-in" />
      {/*
        EXECUTION CARD — the interactive input surface for the daily loop.
        PlayerLiftToday writes the SAME baseball_lift_sessions + readiness rows the
        server read-model summarizes above (the "Lifts Due" feed + the Readiness
        gate). It resolves playerId/teamId from useAuth()/useTeamStore() and
        client-fetches the player's OWN sessions + today's check-in (RLS-scoped),
        owning all logging interactivity (submit check-in, open a session to log
        sets). Its internal empty/loading/error states cover the "no lift" case.
        Source of truth = baseball_lift_sessions; this card is one of two views of
        it, not a separate island.
      */}
      <div data-slot="player-lift-today" data-slot-status="integrated">
        <PlayerLiftToday />
      </div>
    </section>
  );
}

// -----------------------------------------------------------------------------
// My Tasks (spec line 81) — baseball_task_assignments → baseball_tasks
// -----------------------------------------------------------------------------

const TASK_PRIORITY_BADGE: Record<string, { label: string; cls: string }> = {
  high: { label: 'High', cls: 'bg-red-50 text-red-700' },
  medium: { label: 'Medium', cls: 'bg-amber-50 text-amber-700' },
  low: { label: 'Low', cls: 'bg-warm-100 text-warm-600' },
};

function MyTasksSection({ feed }: { feed: PlayerTodayReadModel['tasks'] }) {
  const dueTasks = feed.items.filter((t) => t.isOverdue);
  return (
    <section>
      <SectionHeader
        icon={<IconList size={16} />}
        title="My Tasks"
        count={feed.items.length}
        action={
          <Link
            href="/baseball/dashboard/tasks"
            className="group inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-eyebrow font-semibold uppercase tracking-wide text-primary-600 transition-colors hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            All tasks
            <IconChevronRight
              size={14}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        }
      />
      {dueTasks.length > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <IconAlertCircle size={14} className="shrink-0" />
          <span>
            {dueTasks.length === 1
              ? '1 overdue task needs your attention.'
              : `${dueTasks.length} overdue tasks need your attention.`}
          </span>
        </div>
      )}
      {feed.items.length === 0 ? (
        <EmptyState
          variant="card"
          glass
          icon={<IconList size={40} />}
          title="No tasks right now"
          description={feed.note}
        />
      ) : (
        <Card variant="raised" noPadding>
          <ul className="divide-y divide-warm-100">
            {feed.items.map((t: PlayerTodayTaskItem) => {
              const priorityBadge = t.priority
                ? (TASK_PRIORITY_BADGE[t.priority.toLowerCase()] ?? {
                    label: prettyLabel(t.priority),
                    cls: 'bg-warm-100 text-warm-600',
                  })
                : null;
              return (
                <li key={t.id} className="flex items-start gap-3 px-5 py-3.5">
                  <span
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      t.isOverdue ? 'bg-red-50 text-red-600' : 'bg-primary-50 text-primary-600'
                    }`}
                  >
                    <IconList size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-warm-900">{t.title}</p>
                    <p className="text-eyebrow uppercase tracking-wide text-warm-400">
                      {t.dueDate
                        ? t.isOverdue
                          ? `Overdue · ${t.dueDate}`
                          : t.isDue
                            ? 'Due today'
                            : `Due ${t.dueDate}`
                        : 'No due date'}
                      {t.category ? ` · ${prettyLabel(t.category)}` : ''}
                    </p>
                    {t.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-warm-500">{t.description}</p>
                    )}
                  </div>
                  {priorityBadge && (
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-eyebrow font-semibold ${priorityBadge.cls}`}
                    >
                      {priorityBadge.label}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <Link
            href="/baseball/dashboard/tasks"
            className="group flex items-center justify-center gap-1.5 border-t border-warm-100 px-5 py-2.5 text-eyebrow font-semibold uppercase tracking-wide text-primary-600 transition-colors hover:bg-primary-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/40"
          >
            View all tasks
            <IconChevronRight
              size={14}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        </Card>
      )}
    </section>
  );
}

// -----------------------------------------------------------------------------
// Coach Notes (spec line 85) — player-visible notes from baseball_coach_notes
// -----------------------------------------------------------------------------

function CoachNotesSection({ feed }: { feed: PlayerTodayReadModel['coachNotes'] }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggleNote = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <section>
      <SectionHeader
        icon={<IconMessage size={16} />}
        title="Notes from Coach"
        count={feed.items.length}
      />
      {feed.items.length === 0 ? (
        <EmptyState
          variant="card"
          glass
          icon={<IconMessage size={40} />}
          title="No notes yet"
          description="When your coach shares a note with you, it'll appear here."
        />
      ) : (
        <div className="space-y-3">
          {feed.items.map((note: PlayerTodayCoachNote) => {
            const isOpen = expanded[note.id] ?? false;
            const isLong = note.body.length > 200;
            return (
              <Card
                key={note.id}
                variant="raised"
                padding="md"
                className={note.pinned ? 'border-primary-200' : ''}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                    <IconMessage size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      {note.title && (
                        <p className="truncate text-sm font-semibold text-warm-900">
                          {note.title}
                        </p>
                      )}
                      {note.pinned && (
                        <span className="shrink-0 rounded-full bg-primary-50 px-2 py-0.5 text-eyebrow font-semibold text-primary-700">
                          Pinned
                        </span>
                      )}
                    </div>
                    <p
                      className={`mt-1 text-sm text-warm-700 ${!isOpen && isLong ? 'line-clamp-3' : ''}`}
                    >
                      {note.body}
                    </p>
                    {isLong && (
                      <Button
                        variant="ghost"
                        onClick={() => toggleNote(note.id)}
                        className="mt-1 text-eyebrow font-semibold text-primary-600 transition-colors hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                      >
                        {isOpen ? 'Show less' : 'Read more'}
                      </Button>
                    )}
                    <p className="mt-1.5 text-eyebrow text-warm-400">
                      {new Date(note.createdAt).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}

// -----------------------------------------------------------------------------
// Practice Group (spec line 84) — today's published practice plan
// -----------------------------------------------------------------------------

function PracticeGroupSection({
  feed,
}: {
  feed: PlayerTodayReadModel['practiceGroup'];
}) {
  return (
    <section>
      <SectionHeader
        icon={<IconUsers size={16} />}
        title="Today's Practice"
        action={
          feed.practiceId ? (
            <Link
              href="/baseball/dashboard/practice"
              className="group inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-eyebrow font-semibold uppercase tracking-wide text-primary-600 transition-colors hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              View plan
              <IconChevronRight
                size={14}
                className="transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          ) : undefined
        }
      />
      {!feed.available || !feed.practiceId ? (
        <EmptyState
          variant="card"
          glass
          icon={<IconUsers size={40} />}
          title="No practice plan today"
          description={feed.note}
        />
      ) : (
        <Card variant="raised" padding="md">
          <div>
            <h3 className="text-base font-semibold text-warm-900">{feed.practiceTitle}</h3>
            {feed.practiceFocus && (
              <p className="mt-0.5 text-sm text-warm-500">Focus: {feed.practiceFocus}</p>
            )}
          </div>
          {feed.blocks.length === 0 ? (
            <p className="mt-3 text-sm text-warm-500">{feed.note}</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {feed.blocks.map((block) => (
                <li key={block.id} className="flex items-start gap-3">
                  <span className="mt-0.5 w-10 shrink-0 text-right text-eyebrow tabular-nums text-warm-400">
                    {block.startOffsetMin}m
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-warm-900">{block.activity}</p>
                    <p className="text-eyebrow text-warm-400">
                      {block.durationMin} min
                      {block.location ? ` · ${block.location}` : ''}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/baseball/dashboard/practice"
            className="group mt-4 flex items-center gap-1.5 border-t border-warm-100 pt-3 text-eyebrow font-semibold uppercase tracking-wide text-primary-600 transition-colors hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            View full practice plan
            <IconChevronRight
              size={14}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        </Card>
      )}
    </section>
  );
}

// -----------------------------------------------------------------------------
// First-viewport hero — next required event (spec lines 65-76)
// -----------------------------------------------------------------------------

function NextEventHero({ events }: { events: PlayerTodayEvent[] }) {
  const next = events.find((e) => e.isMandatory) ?? events[0] ?? null;
  if (!next) return null;

  const isPending = next.ackStatus === 'pending';
  return (
    <div
      className={`flex items-start gap-4 rounded-2xl border px-5 py-4 ${
        isPending
          ? 'border-amber-200 bg-amber-50'
          : 'border-primary-200 bg-primary-50/60'
      }`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          isPending ? 'bg-amber-100 text-amber-700' : 'bg-primary-100 text-primary-700'
        }`}
      >
        <IconCalendar size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-eyebrow font-semibold uppercase tracking-wide text-warm-400">
          {next.isMandatory ? 'Next required event' : 'Coming up'}
        </p>
        <h2 className="mt-0.5 truncate text-base font-semibold text-warm-900">{next.title}</h2>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-warm-600">
          <span className="flex items-center gap-1.5 tabular-nums">
            <IconClock size={13} className="text-warm-400" />
            {formatTimeRange(next.startTime, next.endTime)}
          </span>
          {next.location && (
            <span className="flex items-center gap-1.5">
              <IconMapPin size={13} className="text-warm-400" />
              {next.location}
            </span>
          )}
        </div>
      </div>
      {isPending && (
        <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-eyebrow font-semibold text-amber-700">
          Needs ack
        </span>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Primary CTA row (spec lines 72-76): Check In · Acknowledge · View Today Plan
// Anchors to the correct surface sections via scroll behavior.
// -----------------------------------------------------------------------------

function PrimaryCtaRow({
  hasPendingAck,
  hasLiftToday,
  practiceId,
}: {
  hasPendingAck: boolean;
  hasLiftToday: boolean;
  practiceId: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {hasLiftToday && (
        <a
          href="#player-lift-today"
          className="inline-flex items-center gap-1.5 rounded-full bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
        >
          <IconCheck size={15} />
          Check In
        </a>
      )}
      {hasPendingAck && (
        <a
          href="#today-schedule"
          className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
        >
          <IconCheckCircle2 size={15} />
          Acknowledge
        </a>
      )}
      <Link
        href={
          practiceId
            ? '/baseball/dashboard/practice'
            : '/baseball/dashboard/calendar'
        }
        className="inline-flex items-center gap-1.5 rounded-full border border-warm-200 bg-cream-50 px-4 py-2 text-sm font-semibold text-warm-700 transition-colors hover:bg-warm-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
      >
        <IconCalendar size={15} />
        {practiceId ? 'View Today Plan' : 'View Schedule'}
      </Link>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Unauthorized / error envelopes
// -----------------------------------------------------------------------------

function UnauthorizedView() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <EmptyState
        variant="card"
        glass
        icon={<IconClipboardList size={40} />}
        title="No player profile on this team"
        description="Today's view is for players on a team roster. If you just joined, ask your coach to confirm you're on the roster."
        action={{ label: 'Back to dashboard', href: '/baseball/player' }}
      />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

export function PlayerTodayClient({
  model,
  dailyContract,
  passport,
  activeRole,
  todayIso,
  performanceSlot,
}: PlayerTodayClientProps) {
  // Hooks run unconditionally before any early return (rules-of-hooks).
  const reduceMotion = useReducedMotion();
  const longDate = useMemo(() => formatLongDate(todayIso), [todayIso]);

  // Honest unauthorized envelope — not a crash, not a redirect loop.
  if (!model.authorized) {
    return <UnauthorizedView />;
  }

  const fade = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] as const },
      };

  // Derived values for first-viewport hero + CTA row
  const hasPendingAck = model.summary.eventsPendingAck > 0;
  const hasLiftToday = model.summary.assignmentsToday > 0;
  const practiceId = model.practiceGroup.practiceId;

  // activeRole is always 'player' in this player-dashboard route group (coaches
  // are bounced at the layout level). Kept for future role-conditional sidebar
  // items and to satisfy the prop contract from the page server component.
  void activeRole;

  return (
    <LazyMotion features={domAnimation} strict>
      <div className="min-h-dvh bg-cream-100">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-10">
          {/* Header — includes first-viewport hero (spec lines 65-76). */}
          <m.header {...fade} className="mb-6">
            <p className="text-eyebrow font-semibold uppercase tracking-wide text-primary-600">
              Today
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-warm-900">
              {longDate}
            </h1>
            <p className="mt-1 text-warm-500">
              Your daily rundown — schedule, recent work, and what needs your attention.
            </p>

            {/* Primary CTA row (spec lines 72-76): Check In · Acknowledge · View Today Plan.
                Rendered above the fold so the player's three core actions are
                immediately reachable without scrolling. */}
            <div className="mt-4">
              <PrimaryCtaRow
                hasPendingAck={hasPendingAck}
                hasLiftToday={hasLiftToday}
                practiceId={practiceId}
              />
            </div>
          </m.header>

          {/* Non-fatal error notice (sub-read failure) — surfaced, never hidden. */}
          {model.error && (
            <div className="mb-6 flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <IconAlertCircle size={18} className="mt-0.5 shrink-0 text-amber-600" />
              <p className="text-sm text-amber-800">{model.error}</p>
            </div>
          )}

          {/* Next required event hero — first-viewport spec item (lines 67-68).
              Promoted above the summary strip so it's immediately visible. Only
              renders when there are events; hidden when the schedule is empty. */}
          {model.schedule.length > 0 && (
            <m.div {...fade} className="mb-6">
              <NextEventHero events={model.schedule} />
            </m.div>
          )}

          {/* Summary + readiness gate. The gate sits with the summary because it
              is the daily loop's single most important "can I train as planned"
              signal — the readiness gate now lives ON Today, not only on the
              coach board. Computed by the server read-model (computeReadiness). */}
          <m.div {...fade} className="mb-8 space-y-4">
            <SummaryStrip model={model} />
            <ReadinessGate readiness={model.readiness} />
          </m.div>

          {/* Body grid */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            {/* Primary column */}
            <div className="space-y-8 lg:col-span-2">
              {/* Daily Contract — the commitment loop sits first: it's the most
                  important thing a player DOES each day, and completing it
                  compounds into the Passport development story. */}
              <DailyContract model={dailyContract} />
              {/* Performance check-ins (soreness / weight / nutrition) — due items
                  from the Helm Lifting Lab. Rendered just after the Daily Contract
                  so scheduled health checks are a top daily priority. Only visible
                  when the player has an athlete row AND at least one due item. */}
              {performanceSlot && (
                <PerformanceCheckinSection slot={performanceSlot} />
              )}
              {/* From Your Coach — the player-side of source -> signal -> action.
                  A signal a coach converted into a player task lands here as a
                  real, completable obligation. Sits right under the Daily
                  Contract because acting on coach-assigned work is a top daily
                  priority, above the passive schedule. */}
              <CoachAssignmentsSection feed={model.coachActions} />
              {/* My Tasks (spec line 81): active task assignments for this player.
                  Reads baseball_task_assignments → baseball_tasks. */}
              <MyTasksSection feed={model.tasks} />
              {/* Today's Schedule (spec line 80): acknowledge section gets a scroll
                  anchor id so the "Acknowledge" CTA in the first-viewport row can
                  deep-link directly to it. */}
              <div id="today-schedule">
                <ScheduleSection events={model.schedule} />
              </div>
              {/* Practice group (spec line 84): today's published practice plan.
                  Shows between schedule and lift assignments so the player can see
                  what's on for today before diving into their lifts. */}
              <PracticeGroupSection feed={model.practiceGroup} />
              {/* Lifts due — real feed from baseball_lift_sessions (server
                  read-model). Source -> signal: each row links to the Lift &
                  Check-in card below where the player logs sets. */}
              <AssignmentsSection feed={model.assignments} />
              {/* Coach notes (spec line 85): player-visible notes only (scope =
                  'player_visible'). Staff-only scopes are never shown here. */}
              <CoachNotesSection feed={model.coachNotes} />
              <RecentStatsSection stats={model.recentStats} />
            </div>

            {/* Side column: passport snapshot + lift/check-in execution card. */}
            <div className="space-y-8">
              {/* Player Passport — source-backed identity snapshot (compact). */}
              <section>
                <SectionHeader
                  icon={<IconSparkles size={16} />}
                  title="Your Passport"
                  action={
                    <Link
                      href="/baseball/player/passport"
                      className="group inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-eyebrow font-semibold uppercase tracking-wide text-primary-600 transition-colors hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                    >
                      Full view
                      <IconChevronRight
                        size={14}
                        className="transition-transform group-hover:translate-x-0.5"
                      />
                    </Link>
                  }
                />
                <PlayerPassportCard
                  model={passport}
                  compact
                  fullHref="/baseball/player/passport"
                />
              </section>
              {/* The interactive lift + readiness check-in surface. Writing here
                  feeds the Lifts Due feed + Readiness gate above (same tables).
                  The id anchor lets the "Check In" CTA scroll here. */}
              <div id="player-lift-today">
                <LiftTodaySlot />
              </div>
              {/* My Timeline quick-link — the player's development story (stat
                  milestones, coach notes, import events, AI insights in order).
                  Surfaces the route from Today so the player's primary daily view
                  has a clear path to their full development narrative. */}
              <section>
                <SectionHeader icon={<IconClock size={16} />} title="My Timeline" />
                <Card variant="raised" padding="md" className="hover:border-warm-300 hover:shadow-sm transition-all duration-200">
                  <p className="text-sm text-warm-500">
                    Your full development story — stats, notes, and coach insights in order.
                  </p>
                  <Link
                    href="/baseball/player/timeline"
                    className="group mt-3 flex items-center gap-1.5 text-sm font-semibold text-primary-600 transition-colors hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                  >
                    View my timeline
                    <IconChevronRight
                      size={14}
                      className="transition-transform group-hover:translate-x-0.5"
                    />
                  </Link>
                </Card>
              </section>
            </div>
          </div>
        </div>
      </div>
    </LazyMotion>
  );
}

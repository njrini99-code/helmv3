'use client';

// =============================================================================
// src/components/baseball/player-today/PlayerTodayClient.tsx
//
// Player Today (daily loop) — migrated onto "The Living Annual" kit (docs/
// baseball/design-system-living-annual.md; map: docs/baseball/ui-migration-
// map.md Lane 3 "today" row — the premium editorial cover-page treatment for
// the highest-traffic player screen).
//
// PRESENTATION ONLY. Every data path below is byte-for-byte unchanged:
// fetchCoachTeam-adjacent read-model shapes, the acknowledgement optimistic
// flow (acknowledgeEvent / withdrawAcknowledgement), the coach-action flow
// (acknowledgePlayerAction / completePlayerAction), and every prop/handler
// wiring into DailyContract / PlayerLiftToday / the lifting check-in cards.
// Only the render moved to the kit: masthead, RuledStatLine-driven contents
// strip, PaperCard record-book rows, EditorsLetter/EmptyIssue empty states
// (no yellow/amber warning boxes anywhere), and the compact LA
// `PlayerPassportFairway` embed in place of the legacy `PlayerPassportCard`.
//
// HONESTY (carried over verbatim):
//   - authorized:false / error  → labeled, recoverable states (EditorsLetter),
//     never a crash or fabricated data.
//   - deferred feeds            → honest "coming soon" cards driven by the
//     read-model's available:false flag; never invent assignments/check-ins.
//   - acknowledgement           → WIRED. Each event exposes a real Acknowledge
//     / Withdraw control; optimistic local state + honest revert-on-failure;
//     router.refresh() reconciles against the server read-model.
//
// EXTENSION SLOT: <div data-slot="player-lift-today"> is the labeled mount
// point for the Performance vertical's PlayerLiftToday card (untouched here).
// =============================================================================

import { useCallback, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

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
import { showRecruitingActivationPrompt } from '@/lib/baseball/recruiting-activation';
import PlayerLiftToday from '@/components/baseball/performance/PlayerLiftToday';
import type { DailyContractReadModel } from '@/lib/baseball/read-models/player-daily-contract';
import type { PassportReadModel } from '@/lib/baseball/read-models/player-passport';
import { DailyContract } from '@/components/baseball/daily-contract/DailyContract';
import { PlayerPassportFairway } from '@/components/baseball/passport';
import { SorenessCheckCard } from '@/components/lifting/soreness/SorenessCheckCard';
import { WeightCheckInCard } from '@/components/lifting/weight/WeightCheckInCard';
import { NutritionPlanCard } from '@/components/lifting/nutrition/NutritionPlanCard';
import type { PerformanceCheckinSlot } from '@/app/baseball/(player-dashboard)/player/today/page';
import { cn } from '@/lib/utils';
import { fairwayScope } from '@/lib/redesign/flag';
import {
  SectionMasthead,
  Eyebrow,
  EditorsLetter,
  EmptyIssue,
  PaperCard,
  InkBadge,
  KPIContentsStrip,
  Reveal,
  pressableClass,
} from '@/components/baseball/living-annual';

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
  /**
   * This player's recruiting-activation state, resolved server-side.
   * `null` when the player is ineligible (college player — never activates)
   * or the lookup failed (honest degrade: the banner just doesn't render).
   * Drives the one-time "Activate Recruiting" nudge below — the registry
   * entry is deliberately command-palette/direct-URL only (not a permanent
   * rail tab), so Today is the one persistent surface that can tell an
   * eligible, not-yet-activated player the feature exists at all.
   */
  recruitingActivation: { activated: boolean } | null;
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
// Section header — the shared subsection pairing every migrated LA surface
// uses (Eyebrow + optional meta/action; see PlayerPassportFairway's local
// SubSectionHeader). Kept as a single helper so every call site below stays
// unchanged (icon/title/count/action) while the render moved to the kit.
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
  /** Optional trailing action (e.g. a "View all" deep-link). */
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="flex h-7 w-7 items-center justify-center rounded-full bg-grade-plus/10 text-grade-plus"
        >
          {icon}
        </span>
        <Eyebrow as="h2" ink="team">
          {title}
        </Eyebrow>
        {typeof count === 'number' && count > 0 && (
          <span className="font-annual text-eyebrow tabular-nums text-text-tertiary">{count}</span>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Readiness gate — the daily loop's "are you good to train" signal. No amber/
// red tone chrome: an unfilled check-in reads as an EditorsLetter prompt; a
// filled one reads as an honest PaperCard where the numeral/badge carries the
// only accent (green for a good band), never a colored border/background.
// -----------------------------------------------------------------------------

function ReadinessGate({ readiness }: { readiness: PlayerTodayReadiness }) {
  // No check-in yet → honest prompt, never a fabricated band.
  if (!readiness.available || readiness.band == null) {
    return (
      <EditorsLetter
        ink="team"
        live
        title="Readiness — not checked in"
        body={`${readiness.note} Complete your daily check-in below to unlock today's readiness.`}
      />
    );
  }

  const isGood = readiness.tone === 'success';

  return (
    <PaperCard className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Eyebrow ink="team">Readiness</Eyebrow>
        <div className="flex items-center gap-2">
          {readiness.confidence && (
            <InkBadge label={`${readiness.confidence} confidence`} tone="neutral" />
          )}
          <InkBadge
            label={readiness.bandLabel ?? 'Unknown'}
            tone={isGood ? 'team' : 'neutral'}
            variant={isGood ? 'solid' : 'soft'}
          />
        </div>
      </div>

      {/* Why — each reason cites an input (source -> signal honesty). */}
      {readiness.reasons.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {readiness.reasons.map((r, i) => (
            <li key={i} className="flex items-start gap-2 font-annual text-body-sm text-text-secondary">
              <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[color:var(--hairline)]" />
              <span className="first-letter:uppercase">{r}</span>
            </li>
          ))}
        </ul>
      )}

      {readiness.suggestedAction && (
        <p className="mt-3 font-annual text-body-sm font-medium text-text-primary">
          {readiness.suggestedAction}
        </p>
      )}

      {/* Honest footers: staleness + missing inputs, never hidden. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[color:var(--hairline)] pt-3 text-eyebrow text-text-tertiary">
        {!readiness.submittedToday && (
          <span>
            {readiness.stale
              ? "Based on an older check-in — submit today's below."
              : 'No check-in for today yet — submit one below.'}
          </span>
        )}
        {readiness.missingInputs.length > 0 && <span>Missing: {readiness.missingInputs.join(', ')}</span>}
      </div>
    </PaperCard>
  );
}

// -----------------------------------------------------------------------------
// Assignments (lift sessions due) — real feed from helm_lifting_sessions (the
// unified Helm Lifting Lab table; the legacy baseball_lift_sessions table is
// write-dead — see src/lib/baseball/read-models/player-today.ts)
// -----------------------------------------------------------------------------

const LIFT_STATUS_LABEL: Record<string, string> = {
  assigned: 'Assigned',
  started: 'In progress',
  modified: 'Adjusted',
  completed: 'Completed',
  missed: 'Missed',
  excused: 'Excused',
};

/** InkBadge tone/variant for a lift assignment row — never red/amber chrome. */
function liftStatusTone(a: PlayerTodayAssignment): { tone: 'team' | 'sodium' | 'neutral'; variant: 'soft' | 'solid' } {
  if (a.isOverdue) return { tone: 'sodium', variant: 'solid' };
  if (a.status === 'completed') return { tone: 'team', variant: 'solid' };
  return { tone: 'neutral', variant: 'soft' };
}

function AssignmentsSection({
  feed,
}: {
  feed: PlayerTodayReadModel['assignments'];
}) {
  return (
    <section>
      <SectionHeader icon={<IconDumbbell size={15} />} title="Lifts Due" count={feed.items.length} />
      {feed.items.length === 0 ? (
        <EditorsLetter ink="team" title="No lifts scheduled" body={feed.note} />
      ) : (
        <PaperCard className="p-0">
          <ul className="divide-y divide-[color:var(--hairline)]">
            {feed.items.map((a: PlayerTodayAssignment, i) => {
              const statusLabel = a.isOverdue ? 'Overdue' : (LIFT_STATUS_LABEL[a.status] ?? prettyLabel(a.status));
              const dateLabel = a.isToday
                ? 'Today'
                : a.isOverdue
                  ? `Overdue · ${a.scheduledDate}`
                  : a.scheduledDate;
              const tone = liftStatusTone(a);
              return (
                <Reveal key={a.id} staggerIndex={Math.min(i, 6)}>
                  {/* Was a bare <li> ending in a chevron with no Link/onClick —
                      a dead affordance duplicating PlayerLiftToday's identical,
                      correctly-linked row below it. Now a real row-level link to
                      the session detail screen, matching that sibling card's
                      `/baseball/dashboard/lift/${id}` pattern. */}
                  <li>
                    <Link
                      href={`/baseball/dashboard/lift/${a.id}`}
                      className={pressableClass({
                        ink: 'team',
                        className: 'flex items-center gap-3 px-5 py-3.5',
                      })}
                    >
                      <span
                        aria-hidden
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-grade-plus/10 text-grade-plus"
                      >
                        <IconDumbbell size={15} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-annual text-body-sm font-medium text-text-primary">{a.title}</p>
                        <p className="text-eyebrow uppercase tracking-[0.1em] text-text-tertiary">
                          {dateLabel}
                          {a.estimatedMinutes ? ` · ~${a.estimatedMinutes} min` : ''}
                          {a.baseballContext ? ` · ${prettyLabel(a.baseballContext)}` : ''}
                        </p>
                      </div>
                      <InkBadge label={statusLabel} tone={tone.tone} variant={tone.variant} className="shrink-0" />
                      <IconChevronRight size={14} className="shrink-0 text-text-tertiary" aria-hidden />
                    </Link>
                  </li>
                </Reveal>
              );
            })}
          </ul>
          <p className="border-t border-[color:var(--hairline)] px-5 py-2.5 text-eyebrow text-text-tertiary">
            Log your sets in the Lift &amp; Check-in card.
          </p>
        </PaperCard>
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
  player_task: { label: 'Task', icon: <IconClipboardList size={15} /> },
  video_request: { label: 'Video', icon: <IconTarget size={15} /> },
  message: { label: 'Message', icon: <IconFlag size={15} /> },
};

const PLAYER_ACTION_STATUS_LABEL: Record<PlayerActionItem['status'], string> = {
  open: 'New',
  in_progress: 'In progress',
  blocked: 'Blocked',
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
  const statusLabel = completed
    ? 'Completed'
    : (PLAYER_ACTION_STATUS_LABEL[view.status as PlayerActionItem['status']] ?? prettyLabel(view.status));

  return (
    <PaperCard className={cn('p-4 sm:p-5', completed && 'opacity-70')}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-grade-plus/10 text-grade-plus"
        >
          {completed ? <IconCheckCircle2 size={16} /> : meta.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3
                className={cn(
                  'truncate font-annual text-body-md font-semibold',
                  completed ? 'text-text-tertiary line-through' : 'text-text-primary',
                )}
              >
                {item.title}
              </h3>
              <p className="mt-0.5 text-eyebrow uppercase tracking-[0.1em] text-text-tertiary">
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
            <InkBadge
              label={statusLabel}
              tone={completed ? 'team' : item.isOverdue ? 'sodium' : 'neutral'}
              variant={completed || item.isOverdue ? 'solid' : 'soft'}
              className="shrink-0"
            />
          </div>

          {item.detail && <p className="mt-2 font-annual text-body-sm text-text-secondary">{item.detail}</p>}

          {/* Provenance: source -> signal -> assigned-to-you. */}
          <p className="mt-2 flex items-center gap-1.5 text-eyebrow text-text-tertiary">
            <IconSparkles size={11} className="shrink-0" aria-hidden />
            {item.sourceRef.label}
            {item.confidence != null && (
              <span className="tabular-nums">· {Math.round(item.confidence * 100)}% confidence</span>
            )}
          </p>

          {/* Controls — acknowledge to start, complete when done. A completed
              action is terminal from the player side (no withdraw). */}
          {!completed && (
            <div className="mt-3.5 flex items-center justify-end gap-2 border-t border-[color:var(--hairline)] pt-3">
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
            <p className="mt-3 border-t border-[color:var(--hairline)] pt-3 text-eyebrow text-grade-plus">
              Nice work. Your coach can see this is done.
            </p>
          )}
        </div>
      </div>
    </PaperCard>
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
        icon={<IconClipboardList size={15} />}
        title="From Your Coach"
        count={feed.items.length}
      />
      {feed.items.length === 0 ? (
        <EditorsLetter
          ink="team"
          title="No assignments right now"
          body="When your coach assigns you a task from a coaching signal, it'll show up here for you to complete."
        />
      ) : (
        <div className="space-y-3">
          {feed.items.map((item, i) => (
            <Reveal key={item.id} staggerIndex={Math.min(i, 6)}>
              <CoachAssignmentCard
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
            </Reveal>
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
    return <InkBadge label="Acknowledged" tone="team" variant="solid" />;
  }
  return <InkBadge label="Needs acknowledgement" tone="sodium" variant="solid" />;
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
    <PaperCard className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-annual text-body-md font-semibold text-text-primary">{event.title}</h3>
            {event.isMandatory && <InkBadge label="Mandatory" tone="sodium" />}
          </div>
          <p className="mt-0.5 font-annual text-body-sm text-text-secondary">{prettyLabel(event.eventType)}</p>
        </div>
        <AckBadge status={ack.status} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 font-annual text-body-sm text-text-secondary">
        <span className="flex items-center gap-1.5 tabular-nums">
          <IconClock size={13} className="text-text-tertiary" aria-hidden />
          {formatTimeRange(event.startTime, event.endTime)}
        </span>
        {event.location && (
          <span className="flex items-center gap-1.5">
            <IconMapPin size={13} className="text-text-tertiary" aria-hidden />
            {event.location}
          </span>
        )}
      </div>

      {/* Acknowledge / Withdraw control — the spec's "Acknowledge" primary CTA. */}
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-[color:var(--hairline)] pt-3">
        {acknowledged ? (
          <p className="min-w-0 text-eyebrow text-text-tertiary">
            {ack.acknowledgedAt
              ? `Acknowledged ${formatTime(ack.acknowledgedAt) || 'today'}`
              : 'Acknowledged'}
          </p>
        ) : (
          <p className="min-w-0 text-eyebrow text-text-tertiary">
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
    </PaperCard>
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
        icon={<IconCalendar size={15} />}
        title="Today's Schedule"
        count={events.length}
      />
      {events.length === 0 ? (
        <EmptyIssue variant="today" ink="team" />
      ) : (
        <div className="space-y-3">
          {visible.map((e, i) => (
            <Reveal key={e.id} staggerIndex={Math.min(i, 6)}>
              <ScheduleCard
                event={e}
                ack={ackFor(e)}
                busy={busyId === e.id}
                onAcknowledge={() => handleAcknowledge(e)}
                onWithdraw={() => handleWithdraw(e)}
              />
            </Reveal>
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
      className={pressableClass({
        ink: 'team',
        tint: false,
        className:
          'inline-flex items-center gap-1 rounded-fw-sm text-eyebrow font-semibold uppercase tracking-[0.14em] text-grade-plus',
      })}
    >
      My Stats
      <IconChevronRight size={13} aria-hidden />
    </Link>
  );

  return (
    <section>
      <SectionHeader
        icon={<IconActivity size={15} />}
        title="Recent Sessions"
        count={stats.length}
        action={myStatsLink}
      />
      {stats.length === 0 ? (
        <EditorsLetter
          ink="team"
          title="No recent sessions"
          body="Your captured game and practice stats will appear here as they're logged. Visit My Stats anytime to see your season totals and trends."
          action={
            <Link
              href="/baseball/dashboard/my-stats"
              className={pressableClass({
                ink: 'team',
                className:
                  'inline-flex items-center gap-1.5 rounded-card bg-grade-plus px-4 py-2 font-annual text-body-sm font-semibold text-white',
              })}
            >
              View My Stats
              <IconChevronRight size={16} aria-hidden />
            </Link>
          }
        />
      ) : (
        <PaperCard className="p-0">
          <ul className="divide-y divide-[color:var(--hairline)]">
            {stats.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="truncate font-annual text-body-sm font-medium text-text-primary">
                    {s.sessionName ?? prettyLabel(s.statType)}
                  </p>
                  <p className="text-eyebrow uppercase tracking-[0.1em] text-text-tertiary">
                    {prettyLabel(s.statType)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-annual text-body-sm tabular-nums text-text-secondary">
                    {s.sessionDate}
                  </span>
                  <InkBadge
                    label={SOURCE_LABEL[s.sourceRef.source] ?? prettyLabel(s.sourceRef.source)}
                    tone="neutral"
                  />
                </div>
              </li>
            ))}
          </ul>
          <Link
            href="/baseball/dashboard/my-stats"
            className={pressableClass({
              ink: 'team',
              className:
                'flex items-center justify-center gap-1.5 border-t border-[color:var(--hairline)] px-5 py-3 font-annual text-body-sm font-semibold text-grade-plus',
            })}
          >
            View season totals &amp; trends
            <IconChevronRight size={15} aria-hidden />
          </Link>
        </PaperCard>
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
// These three cards are a separate vertical (Lifting Lab) and are reused
// verbatim — no presentation changes here beyond the section header.
// -----------------------------------------------------------------------------

function PerformanceCheckinSection({ slot }: { slot: PerformanceCheckinSlot }) {
  const today = new Date().toISOString().slice(0, 10);

  const hasSoreness = slot.sorenessToday !== null;
  const hasWeight = slot.weightToday !== null;
  const hasNutrition = slot.nutritionPlan !== null;

  if (!hasSoreness && !hasWeight && !hasNutrition) return null;

  return (
    <section>
      <SectionHeader icon={<IconActivity size={15} />} title="Daily Check-Ins" />
      <div className="space-y-3">
        {hasSoreness && slot.sorenessToday && (
          <SorenessCheckCard
            request={slot.sorenessToday.request}
            orgId={slot.orgId}
            athleteId={slot.athleteId}
            checkinDate={slot.todayIso}
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
      <SectionHeader icon={<IconDumbbell size={15} />} title="Lift & Check-in" />
      {/*
        EXECUTION CARD — the interactive input surface for the daily loop.
        The server read-model above (the "Lifts Due" feed + the Readiness gate)
        reads the unified helm_lifting_sessions / helm_lifting_readiness_checkins
        tables — the canonical source of truth (the legacy baseball_lift_sessions
        / baseball_readiness_checkins tables are write-dead; real writes land in
        helm_lifting_* only — see src/app/baseball/actions/lifting.ts,
        lifting-v11.ts, signals.ts). PlayerLiftToday resolves playerId/teamId from
        useAuth()/useTeamStore() and client-fetches the player's OWN sessions +
        today's check-in (RLS-scoped), owning all logging interactivity (submit
        check-in, open a session to log sets); it should read the SAME
        helm_lifting_* tables so this card and the feed above never diverge — if
        it still reads the legacy tables directly, that is a bug in that
        component, not evidence the legacy tables are current. Its internal
        empty/loading/error states cover the "no lift" case. Unrelated Lifting
        Lab surface — presentation untouched by this pass.
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

/** InkBadge tone/variant for a task priority — never red/amber chrome (mirrors
 *  PostgameReviewClient's priorityTone precedent). */
function taskPriorityTone(p: string): { tone: 'sodium' | 'neutral'; variant: 'soft' | 'solid' } {
  const lower = p.toLowerCase();
  if (lower === 'high') return { tone: 'sodium', variant: 'solid' };
  if (lower === 'medium') return { tone: 'sodium', variant: 'soft' };
  return { tone: 'neutral', variant: 'soft' };
}

function MyTasksSection({ feed }: { feed: PlayerTodayReadModel['tasks'] }) {
  const dueTasks = feed.items.filter((t) => t.isOverdue);
  return (
    <section>
      <SectionHeader
        icon={<IconList size={15} />}
        title="My Tasks"
        count={feed.items.length}
        action={
          <Link
            href="/baseball/dashboard/tasks"
            className={pressableClass({
              ink: 'team',
              tint: false,
              className:
                'inline-flex items-center gap-1 rounded-fw-sm text-eyebrow font-semibold uppercase tracking-[0.14em] text-grade-plus',
            })}
          >
            All tasks
            <IconChevronRight size={13} aria-hidden />
          </Link>
        }
      />
      {dueTasks.length > 0 && (
        <p className="mb-3 flex items-center gap-2 font-annual text-body-sm text-sodium">
          <IconAlertCircle size={14} className="shrink-0" aria-hidden />
          <span>
            {dueTasks.length === 1
              ? '1 overdue task needs your attention.'
              : `${dueTasks.length} overdue tasks need your attention.`}
          </span>
        </p>
      )}
      {feed.items.length === 0 ? (
        <EditorsLetter ink="team" title="No tasks right now" body={feed.note} />
      ) : (
        <PaperCard className="p-0">
          <ul className="divide-y divide-[color:var(--hairline)]">
            {feed.items.map((t: PlayerTodayTaskItem) => {
              const tone = t.priority ? taskPriorityTone(t.priority) : null;
              return (
                <li key={t.id} className="flex items-start gap-3 px-5 py-3.5">
                  <span
                    aria-hidden
                    className={cn(
                      'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                      t.isOverdue ? 'bg-sodium/15 text-sodium' : 'bg-grade-plus/10 text-grade-plus',
                    )}
                  >
                    <IconList size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-annual text-body-sm font-medium text-text-primary">{t.title}</p>
                    <p className="text-eyebrow uppercase tracking-[0.1em] text-text-tertiary">
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
                      <p className="mt-1 line-clamp-2 font-annual text-body-sm text-text-tertiary">{t.description}</p>
                    )}
                  </div>
                  {tone && <InkBadge label={t.priority as string} tone={tone.tone} variant={tone.variant} className="shrink-0" />}
                </li>
              );
            })}
          </ul>
          <Link
            href="/baseball/dashboard/tasks"
            className={pressableClass({
              ink: 'team',
              className:
                'flex items-center justify-center gap-1.5 border-t border-[color:var(--hairline)] px-5 py-2.5 text-eyebrow font-semibold uppercase tracking-[0.1em] text-grade-plus',
            })}
          >
            View all tasks
            <IconChevronRight size={14} aria-hidden />
          </Link>
        </PaperCard>
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
        icon={<IconMessage size={15} />}
        title="Notes from Coach"
        count={feed.items.length}
      />
      {feed.items.length === 0 ? (
        <EditorsLetter
          ink="team"
          title="No notes yet"
          body="When your coach shares a note with you, it'll appear here."
        />
      ) : (
        <div className="space-y-3">
          {feed.items.map((note: PlayerTodayCoachNote, i) => {
            const isOpen = expanded[note.id] ?? false;
            const isLong = note.body.length > 200;
            return (
              <Reveal key={note.id} staggerIndex={Math.min(i, 6)}>
                <PaperCard className={cn('p-4 sm:p-5', note.pinned && 'ring-1 ring-grade-plus/25')}>
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-grade-plus/10 text-grade-plus"
                    >
                      <IconMessage size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        {note.title && (
                          <p className="truncate font-annual text-body-sm font-semibold text-text-primary">
                            {note.title}
                          </p>
                        )}
                        {note.pinned && <InkBadge label="Pinned" tone="team" />}
                      </div>
                      <p
                        className={cn(
                          'mt-1 font-annual text-body-sm text-text-secondary',
                          !isOpen && isLong && 'line-clamp-3',
                        )}
                      >
                        {note.body}
                      </p>
                      {isLong && (
                        <Button
                          variant="ghost"
                          onClick={() => toggleNote(note.id)}
                          className="mt-1 text-eyebrow font-semibold uppercase tracking-[0.1em] text-grade-plus"
                        >
                          {isOpen ? 'Show less' : 'Read more'}
                        </Button>
                      )}
                      <p className="mt-1.5 text-eyebrow text-text-tertiary">
                        {new Date(note.createdAt).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </p>
                    </div>
                  </div>
                </PaperCard>
              </Reveal>
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
        icon={<IconUsers size={15} />}
        title="Today's Practice"
        action={
          feed.practiceId ? (
            <Link
              href="/baseball/player/practice"
              className={pressableClass({
                ink: 'team',
                tint: false,
                className:
                  'inline-flex items-center gap-1 rounded-fw-sm text-eyebrow font-semibold uppercase tracking-[0.14em] text-grade-plus',
              })}
            >
              View plan
              <IconChevronRight size={13} aria-hidden />
            </Link>
          ) : undefined
        }
      />
      {!feed.available || !feed.practiceId ? (
        <EditorsLetter ink="team" title="No practice plan today" body={feed.note} />
      ) : (
        <PaperCard className="p-5 sm:p-6">
          <div>
            <h3 className="font-annual text-body-md font-semibold text-text-primary">{feed.practiceTitle}</h3>
            {feed.practiceFocus && (
              <p className="mt-0.5 font-annual text-body-sm text-text-secondary">Focus: {feed.practiceFocus}</p>
            )}
          </div>
          {feed.blocks.length === 0 ? (
            <p className="mt-3 font-annual text-body-sm text-text-secondary">{feed.note}</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {feed.blocks.map((block) => (
                <li key={block.id} className="flex items-start gap-3">
                  <span className="mt-0.5 w-10 shrink-0 text-right text-eyebrow tabular-nums text-text-tertiary">
                    {block.startOffsetMin}m
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-annual text-body-sm font-medium text-text-primary">{block.activity}</p>
                    <p className="text-eyebrow text-text-tertiary">
                      {block.durationMin} min
                      {block.location ? ` · ${block.location}` : ''}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/baseball/player/practice"
            className={pressableClass({
              ink: 'team',
              className:
                'mt-4 flex items-center gap-1.5 border-t border-[color:var(--hairline)] pt-3 text-eyebrow font-semibold uppercase tracking-[0.14em] text-grade-plus',
            })}
          >
            View full practice plan
            <IconChevronRight size={14} aria-hidden />
          </Link>
        </PaperCard>
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
    <PaperCard registrationTick className="p-5">
      <div className="flex items-start gap-4">
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-grade-plus/10 text-grade-plus"
        >
          <IconCalendar size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <Eyebrow ink="team">{next.isMandatory ? 'Next required event' : 'Coming up'}</Eyebrow>
          <h2 className="mt-0.5 truncate font-annual text-h3 font-semibold text-text-primary">{next.title}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-annual text-body-sm text-text-secondary">
            <span className="flex items-center gap-1.5 tabular-nums">
              <IconClock size={13} className="text-text-tertiary" aria-hidden />
              {formatTimeRange(next.startTime, next.endTime)}
            </span>
            {next.location && (
              <span className="flex items-center gap-1.5">
                <IconMapPin size={13} className="text-text-tertiary" aria-hidden />
                {next.location}
              </span>
            )}
          </div>
        </div>
        {isPending && <InkBadge label="Needs ack" tone="sodium" variant="solid" className="shrink-0" />}
      </div>
    </PaperCard>
  );
}

// -----------------------------------------------------------------------------
// Primary CTA row (#484): ONE filled primary CTA chosen by priority —
// pending ack > due check-in > view plan/schedule — with any remaining
// applicable action demoted to an inline text link (never hidden, never a
// second peer pill). Anchors to the correct surface sections via scroll
// behavior; "View Today Plan/Schedule" is real navigation via next/link.
// -----------------------------------------------------------------------------

type CtaIcon = typeof IconCheck;

interface CtaAction {
  key: 'acknowledge' | 'checkin' | 'view';
  label: string;
  href: string;
  icon: CtaIcon;
  /** Real navigation (next/link) rather than an in-page scroll anchor. */
  isNav?: boolean;
}

function CtaLink({ action, primary }: { action: CtaAction; primary?: boolean }) {
  const Icon = action.icon;
  const className = primary
    ? pressableClass({
        ink: 'team',
        className:
          'inline-flex items-center gap-1.5 rounded-card bg-grade-plus px-4 py-2 font-annual text-body-sm font-semibold text-white',
      })
    : pressableClass({
        ink: 'team',
        tint: false,
        className:
          'inline-flex items-center gap-1.5 font-annual text-body-sm font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline',
      });
  const content = (
    <>
      <Icon size={15} aria-hidden />
      {action.label}
    </>
  );
  if (action.isNav) {
    return (
      <Link href={action.href} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <a href={action.href} className={className}>
      {content}
    </a>
  );
}

function PrimaryCtaRow({
  hasPendingAck,
  hasLiftToday,
  practiceId,
}: {
  hasPendingAck: boolean;
  hasLiftToday: boolean;
  practiceId: string | null;
}) {
  // Priority order per #484's acceptance criteria: pending ack > due check-in
  // > view plan/schedule. "View" always applies (fallback), so the array is
  // never empty and index 0 is always well-formed.
  const actions: CtaAction[] = [];
  if (hasPendingAck) {
    actions.push({ key: 'acknowledge', label: 'Acknowledge', href: '#today-schedule', icon: IconCheckCircle2 });
  }
  if (hasLiftToday) {
    actions.push({ key: 'checkin', label: 'Check In', href: '#player-lift-today', icon: IconCheck });
  }
  actions.push({
    key: 'view',
    label: practiceId ? 'View Today Plan' : 'View Schedule',
    href: practiceId ? '/baseball/player/practice' : '/baseball/dashboard/calendar',
    icon: IconCalendar,
    isNav: true,
  });

  const primary = actions[0]!;
  const secondary = actions.slice(1);

  return (
    <div className="flex flex-col items-start gap-3">
      <CtaLink action={primary} primary />
      {secondary.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {secondary.map((action) => (
            <CtaLink key={action.key} action={action} />
          ))}
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Unauthorized / error envelopes
// -----------------------------------------------------------------------------

function UnauthorizedView() {
  return (
    <div className={cn(fairwayScope('mx-auto max-w-2xl px-4 py-16 sm:px-6'))}>
      <EditorsLetter
        ink="team"
        title="No player profile on this team"
        body="Today's view is for players on a team roster. If you just joined, ask your coach to confirm you're on the roster."
        action={
          <Link
            href="/baseball/player"
            className={pressableClass({
              ink: 'team',
              className:
                'inline-flex items-center gap-1.5 rounded-card bg-grade-plus px-4 py-2 font-annual text-body-sm font-semibold text-white',
            })}
          >
            Back to dashboard
          </Link>
        }
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
  recruitingActivation,
}: PlayerTodayClientProps) {
  // Hooks run unconditionally before any early return (rules-of-hooks).
  const longDate = useMemo(() => formatLongDate(todayIso), [todayIso]);

  // Honest unauthorized envelope — not a crash, not a redirect loop.
  if (!model.authorized) {
    return <UnauthorizedView />;
  }

  // Derived values for first-viewport hero + CTA row
  const hasPendingAck = model.summary.eventsPendingAck > 0;
  const hasLiftToday = model.summary.assignmentsDue > 0;
  const practiceId = model.practiceGroup.practiceId;

  // activeRole is always 'player' in this player-dashboard route group (coaches
  // are bounced at the layout level). Kept for future role-conditional sidebar
  // items and to satisfy the prop contract from the page server component.
  void activeRole;

  return (
    <div className={fairwayScope('min-h-dvh')}>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-10">
        {/* Masthead — the editorial cover-page treatment for the daily loop. */}
        <Reveal>
          <SectionMasthead eyebrow="THE PASSPORT · DAILY LOOP" title={longDate} ink="team">
            <p className="max-w-prose font-annual text-body-sm text-text-secondary">
              Your daily rundown: schedule, recent work, and what needs your attention.
            </p>
          </SectionMasthead>
        </Reveal>

        {/* Primary CTA row (#484): ONE filled primary CTA chosen by priority
            (pending ack > due check-in > view plan), any remaining action
            demoted to an inline text link. Rendered above the fold so the
            player's top action is immediately reachable without scrolling. */}
        <div className="mt-5">
          <PrimaryCtaRow
            hasPendingAck={hasPendingAck}
            hasLiftToday={hasLiftToday}
            practiceId={practiceId}
          />
        </div>

        {/* Non-fatal error notice (sub-read failure) — surfaced honestly, never
            hidden and never a colored warning box. */}
        {model.error && (
          <EditorsLetter className="mt-6" ink="team" title="Some of today's data is catching up." body={model.error} />
        )}

        {/* Next required event hero — first-viewport spec item (lines 67-68),
            and the real schedule content #484 wants reachable without
            scrolling. Ordered directly after the CTA row/error notice (ahead
            of the one-time recruiting nudge below) so a genuine "what's next"
            signal isn't pushed below a promotional card. Only renders when
            there are events; hidden when the schedule is empty. */}
        {model.schedule.length > 0 && (
          <div className="mt-6">
            <NextEventHero events={model.schedule} />
          </div>
        )}

        {/* Activate Recruiting nudge — one-time opt-in gate before college
            coaches can see this player's identity. The nav entry has no
            permanent rail slot by design (see hub-definitions.ts), so this is
            the persistent surface that keeps an eligible, not-yet-activated
            player from never discovering the feature exists. Placed after
            the real schedule content above (#484) rather than before it.
            Wrapped in showRecruitingActivationPrompt so the sunset removes it
            at read time: this is the FIRST screen a player sees after login,
            and its button now targets a module-gated route. The eligibility
            expression is unchanged and still correct for the day recruiting
            returns — `null` here means "not fetched", which must not prompt. */}
        {showRecruitingActivationPrompt(
          Boolean(recruitingActivation && !recruitingActivation.activated),
        ) && (
          <EditorsLetter
            className="mt-6"
            ink="team"
            live
            liveLabel="One-time"
            title="Activate recruiting to be seen by college coaches"
            body="Right now your Passport is invisible to recruiters. Turn on recruiting exposure once to let college coaches discover it."
            action={
              <Link
                href="/baseball/dashboard/activate"
                className={pressableClass({
                  ink: 'team',
                  className:
                    'inline-flex items-center gap-1.5 rounded-card bg-grade-plus px-4 py-2 font-annual text-body-sm font-semibold text-white',
                })}
              >
                Activate Recruiting
                <IconChevronRight size={16} aria-hidden />
              </Link>
            }
          />
        )}

        {/* Summary + readiness gate. The gate sits with the summary because it
            is the daily loop's single most important "can I train as planned"
            signal — the readiness gate now lives ON Today, not only on the
            coach board. Computed by the server read-model (computeReadiness). */}
        <div className="mt-9 space-y-6">
          <KPIContentsStrip
            columns={4}
            items={[
              { label: 'Events Today', value: model.summary.eventsToday },
              {
                label: 'Need Acknowledgement',
                value: model.summary.eventsPendingAck,
                emphasis: model.summary.eventsPendingAck > 0,
              },
              {
                label: 'From Coach',
                value: model.summary.coachActionsOpen,
                emphasis: model.summary.coachActionsOpen > 0,
              },
              {
                label: 'Lifts Due',
                value: model.summary.assignmentsDue,
                emphasis: model.summary.assignmentsDue > 0,
              },
            ]}
          />
          <ReadinessGate readiness={model.readiness} />
        </div>

        {/* Body grid */}
        <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-3">
          {/* Primary column */}
          <div className="space-y-10 lg:col-span-2">
            {/* Daily Contract — the commitment loop sits first: it's the most
                important thing a player DOES each day, and completing it
                compounds into the Passport development story. Separate
                vertical — presentation untouched by this pass. */}
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
            {/* Lifts due — real feed from helm_lifting_sessions (the unified
                Helm Lifting Lab table, via the server read-model; the legacy
                baseball_lift_sessions table is write-dead). Source -> signal:
                each row links to the Lift & Check-in card below where the
                player logs sets. */}
            <AssignmentsSection feed={model.assignments} />
            {/* Coach notes (spec line 85): player-visible notes only (scope =
                'player_visible'). Staff-only scopes are never shown here. */}
            <CoachNotesSection feed={model.coachNotes} />
            <RecentStatsSection stats={model.recentStats} />
          </div>

          {/* Side column: passport snapshot + lift/check-in execution card. */}
          <div className="space-y-10">
            {/* Player Passport — source-backed identity snapshot (compact). */}
            <section>
              <SectionHeader
                icon={<IconSparkles size={15} />}
                title="Your Passport"
                action={
                  <Link
                    href="/baseball/player/passport"
                    className={pressableClass({
                      ink: 'team',
                      tint: false,
                      className:
                        'inline-flex items-center gap-1 rounded-fw-sm text-eyebrow font-semibold uppercase tracking-[0.14em] text-grade-plus',
                    })}
                  >
                    Full view
                    <IconChevronRight size={13} aria-hidden />
                  </Link>
                }
              />
              <PlayerPassportFairway
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
              <SectionHeader icon={<IconClock size={15} />} title="My Timeline" />
              <PaperCard className="p-5">
                <p className="font-annual text-body-sm text-text-secondary">
                  Your full development story: stats, notes, and coach insights in order.
                </p>
                <Link
                  href="/baseball/player/timeline"
                  className={pressableClass({
                    ink: 'team',
                    tint: false,
                    className: 'mt-3 flex items-center gap-1.5 font-annual text-body-sm font-semibold text-grade-plus',
                  })}
                >
                  View my timeline
                  <IconChevronRight size={14} aria-hidden />
                </Link>
              </PaperCard>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

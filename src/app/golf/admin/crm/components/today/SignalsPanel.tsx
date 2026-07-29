'use client';

// ============================================================================
// SignalsPanel — engagement-driven action queues at the top of the Today tab.
//
// Turns tracking data that already exists but never surfaces anywhere (email
// engagement scores, follow-up dates) into three ranked next-action lists:
//   • Hot right now      — highest-scoring "Hot" temperature coaches
//   • Overdue follow-ups — next_follow_up_at already in the past
//   • No next step       — active pipeline coaches with no follow-up set
// Fetches its own data on mount via getEngagementSignals(); the quick-set
// buttons call setNextFollowUp() and optimistically drop the row locally.
// ============================================================================

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { IconClock, IconFlame, IconTarget } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import {
  getEngagementSignals,
  setNextFollowUp,
  type EngagementSignals,
  type SignalCoach,
} from '@/app/golf/actions/crm-signals';
import { overdueLabel, relativeCompact } from './signals-format';

interface SignalsPanelProps {
  onCoachClick: (coachId: string) => void;
  /**
   * Called after a quick-set follow-up write succeeds, with the coach id and
   * the new `next_follow_up_at` ISO timestamp. Optional — SignalsPanel keeps
   * working (rows still drop themselves locally) without it, but a parent
   * holding its own coach list (e.g. TodayQueue's `allCoaches`) should wire
   * this so that copy stays in sync instead of going stale.
   */
  onFollowUpSet?: (coachId: string, followUpAt: string) => void;
}

const EMPTY_SIGNALS: EngagementSignals = {
  hot: [],
  overdue: [],
  noNextStep: [],
  noNextStepTotal: 0,
};

/** ISO timestamp for 9:00 AM local time, `days` from now. */
function nowPlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

function isAllEmpty(s: EngagementSignals): boolean {
  return (
    s.hot.length === 0 &&
    s.overdue.length === 0 &&
    s.noNextStep.length === 0 &&
    s.noNextStepTotal === 0
  );
}

export function SignalsPanel({ onCoachClick, onFollowUpSet }: SignalsPanelProps) {
  const [signals, setSignals] = useState<EngagementSignals>(EMPTY_SIGNALS);
  const [loading, setLoading] = useState(true);
  // coach_id currently mid-request for a quick-set action — disables its buttons.
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getEngagementSignals();
        if (!cancelled) setSignals(data);
      } catch {
        // getEngagementSignals() already degrades individual-list DB failures
        // to [] internally — the only thing that can still reject here is the
        // admin gate itself (e.g. session not ready yet). Treat that the same
        // as "nothing to show" rather than surfacing a broken panel.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Quick-set a coach's next_follow_up_at, then optimistically remove the
  // row from whichever local list it came from. On failure the row stays put
  // and the failure is surfaced (matching the toast convention every other
  // CRM write path uses).
  const quickSet = useCallback(async (coach: SignalCoach, days: number, list: 'overdue' | 'noNextStep') => {
    setPendingId(coach.id);
    const followUpAt = nowPlusDays(days);
    try {
      await setNextFollowUp(coach.id, followUpAt);
      setSignals((prev) => ({
        ...prev,
        [list]: prev[list].filter((c) => c.id !== coach.id),
        ...(list === 'noNextStep'
          ? { noNextStepTotal: Math.max(0, prev.noNextStepTotal - 1) }
          : {}),
      }));
      onFollowUpSet?.(coach.id, followUpAt);
    } catch {
      toast.error(`Couldn't update follow-up for ${coach.name}`);
    } finally {
      setPendingId(null);
    }
  }, [onFollowUpSet]);

  if (loading) {
    return <div className="h-11 rounded-card border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)] skeleton-shimmer" aria-hidden="true" />;
  }

  if (isAllEmpty(signals)) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <SignalCard
        title="Hot right now"
        iconBg="bg-fw-danger-bg"
        icon={<IconFlame size={16} className="text-fw-danger-ink" />}
        emptyLabel="No hot engagement in the last 90 days."
      >
        {signals.hot.length > 0 && (
          <ul className="space-y-1">
            {signals.hot.slice(0, 8).map((coach) => (
              <SignalRow key={coach.id} coach={coach} onCoachClick={onCoachClick}>
                <span className="flex flex-shrink-0 items-center gap-1.5">
                  {typeof coach.score === 'number' && (
                    <span className="rounded-full bg-fw-danger-bg px-2 text-micro font-semibold tabular-nums text-fw-danger-ink">
                      {coach.score}
                    </span>
                  )}
                  <span className="text-micro tabular-nums text-text-tertiary">
                    {relativeCompact(coach.last_event_at)}
                  </span>
                </span>
              </SignalRow>
            ))}
          </ul>
        )}
      </SignalCard>

      <SignalCard
        title="Overdue follow-ups"
        iconBg="bg-fw-warning-bg"
        icon={<IconClock size={16} className="text-fw-warning-ink" />}
        emptyLabel="Nothing overdue."
      >
        {signals.overdue.length > 0 && (
          <ul className="space-y-1">
            {signals.overdue.slice(0, 8).map((coach) => (
              <SignalRow key={coach.id} coach={coach} onCoachClick={onCoachClick}>
                <span className="flex flex-shrink-0 items-center gap-1.5">
                  <span className="text-micro font-medium tabular-nums text-fw-warning-ink">
                    {overdueLabel(coach.next_follow_up_at)}
                  </span>
                  <Button
                    variant="ghost"
                    type="button"
                    haptic="none"
                    disabled={pendingId === coach.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      void quickSet(coach, 7, 'overdue');
                    }}
                    aria-label={`Push ${coach.name}'s follow-up out one week`}
                    title="Push out one week"
                    className="min-h-[32px] rounded-fw-sm bg-canvas px-2 py-0 text-micro font-medium text-text-secondary hover:bg-surface-tint disabled:opacity-50"
                  >
                    +1w
                  </Button>
                </span>
              </SignalRow>
            ))}
          </ul>
        )}
      </SignalCard>

      <SignalCard
        title="No next step"
        iconBg="bg-surface-sunken"
        icon={<IconTarget size={16} className="text-text-secondary" />}
        emptyLabel="Every open coach has a follow-up scheduled."
        headline={`${signals.noNextStepTotal} in pipeline with no follow-up`}
      >
        {signals.noNextStep.length > 0 && (
          <ul className="space-y-1">
            {signals.noNextStep.slice(0, 8).map((coach) => (
              <SignalRow key={coach.id} coach={coach} onCoachClick={onCoachClick}>
                <span className="flex flex-shrink-0 items-center gap-1">
                  {([
                    ['+3d', 3],
                    ['+1w', 7],
                    ['+2w', 14],
                  ] as const).map(([label, days]) => (
                    <Button
                      key={label}
                      variant="ghost"
                      type="button"
                      haptic="none"
                      disabled={pendingId === coach.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        void quickSet(coach, days, 'noNextStep');
                      }}
                      aria-label={`Set ${coach.name}'s next follow-up ${label.slice(1)} from now`}
                      className="min-h-[32px] rounded-fw-sm bg-canvas px-2 py-0 text-micro font-medium text-text-secondary hover:bg-surface-tint disabled:opacity-50"
                    >
                      {label}
                    </Button>
                  ))}
                </span>
              </SignalRow>
            ))}
          </ul>
        )}
      </SignalCard>
    </div>
  );
}

// ----------------------------------------------------------------------------
// SignalCard — shared card chrome (icon badge + title + optional headline
// stat) around each of the three lists.
// ----------------------------------------------------------------------------
interface SignalCardProps {
  title: string;
  iconBg: string;
  icon: ReactNode;
  emptyLabel: string;
  headline?: string;
  children: ReactNode;
}

function SignalCard({ title, iconBg, icon, emptyLabel, headline, children }: SignalCardProps) {
  return (
    <div className="rounded-card border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)] p-5">
      <div className="mb-1 flex items-center gap-2.5">
        <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-fw-sm ${iconBg}`}>
          {icon}
        </span>
        <h3 className="text-sm font-bold text-text-primary">{title}</h3>
      </div>
      {headline && <p className="mb-2 ml-[42px] text-micro text-text-tertiary">{headline}</p>}
      <div className={headline ? '' : 'mt-3'}>
        {isEmptyChildren(children) ? (
          <p className="text-caption text-text-tertiary">{emptyLabel}</p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function isEmptyChildren(children: ReactNode): boolean {
  if (children === false || children === null || children === undefined) return true;
  if (Array.isArray(children)) return children.every(isEmptyChildren);
  return false;
}

// ----------------------------------------------------------------------------
// SignalRow — shared row: name + school (clickable, opens the coach) on the
// left, arbitrary right-side content (score/time, or quick-set buttons)
// passed as children. Mirrors TodayQueue's own row shape (rank+identity as a
// ghost <Button>, quick actions as sibling controls) rather than a
// role="button" wrapper, so nothing here is an interactive element nested
// inside another one, and stopPropagation on the sibling buttons keeps them
// independent of the row click.
// ----------------------------------------------------------------------------
interface SignalRowProps {
  coach: SignalCoach;
  onCoachClick: (coachId: string) => void;
  children: ReactNode;
}

function SignalRow({ coach, onCoachClick, children }: SignalRowProps) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-fw-md transition-colors hover:bg-surface-tint">
      <Button
        variant="ghost"
        type="button"
        haptic="none"
        onClick={() => onCoachClick(coach.id)}
        className="min-h-[44px] flex-1 justify-start rounded-fw-md px-2 py-1.5 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-text-primary">{coach.name}</span>
          <span className="block truncate text-micro text-text-tertiary">{coach.school ?? '—'}</span>
        </span>
      </Button>
      {children}
    </li>
  );
}

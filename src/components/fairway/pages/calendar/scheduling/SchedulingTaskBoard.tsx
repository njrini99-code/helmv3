'use client';

/**
 * ============================================================================
 * Fairway · Calendar · SchedulingTaskBoard — the workspace's floating action
 * ----------------------------------------------------------------------------
 * ONE warm, lifted board at the bottom of the scheduling workspace whose
 * content changes with the task. The frame around it (SchedulingWorkspace)
 * reserves its space, so it never covers the last timeline row.
 *
 *   accepted        date · time, availability summary, the confirm action
 *   required busy   date · time, who is busy, "Next open time", confirm off
 *   unverified      date · time, what could not be checked, retry, confirm off
 *   error           "Could not verify schedules", the error, retry, confirm off
 *
 * The board renders what `acceptProposal` decided; it never re-derives its
 * own eligibility (§13C: one acceptance function drives the status, the
 * button and the dialog's final recheck). Material: Fairway `Elevated`
 * (opaque, shadow-raise) — the one floating object in this workspace, with
 * ordinary Buttons inside it, not more glass.
 * ========================================================================== */

import { AlertTriangle, ArrowRight, Check, RefreshCw } from 'lucide-react';
import { Button, Elevated } from '@/components/fairway';
import { cn } from '@/lib/utils';
import type { ScheduleAcceptance } from '@/lib/calendar/scheduling/evaluate';

export interface SchedulingTaskBoardProps {
  /** "Tue, Sep 8" */
  dateLabel: string;
  /** "3 – 4 PM" */
  windowLabel: string;
  acceptance: ScheduleAcceptance;
  /** "Everyone is available" / "2 of 3 available · 1 unverified" — the
   * workspace's summary line, shared with the status region. */
  summary: string;
  /** Required people busy at this time (labels, viewer first). */
  busyNames: string[];
  /** People whose schedule could not be verified. */
  unverifiedNames: string[];
  /** A schedule fetch or final recheck failure. Wins over every other state. */
  error?: string | null;
  onRetry?: () => void;
  /** The next open window after this one, when there is one. */
  nextOpen?: { start: string; label: string } | null;
  onJumpTo?: (start: string) => void;
  primaryActionLabel: string;
  onConfirm: () => void;
  loading?: boolean;
  disablePrimaryAction?: boolean;
  className?: string;
}

function listNames(names: string[]): string {
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}

export function SchedulingTaskBoard({
  dateLabel,
  windowLabel,
  acceptance,
  summary,
  busyNames,
  unverifiedNames,
  error = null,
  onRetry,
  nextOpen = null,
  onJumpTo,
  primaryActionLabel,
  onConfirm,
  loading = false,
  disablePrimaryAction = false,
  className,
}: SchedulingTaskBoardProps) {
  const selection = `${dateLabel} · ${windowLabel}`;
  let tone: 'accept' | 'warn' | 'block' = 'accept';
  let title = selection;
  let detail = summary;
  if (error) {
    tone = 'warn';
    title = 'Could not verify schedules';
    detail = error;
  } else if (acceptance.reason === 'unverified') {
    tone = 'warn';
    detail = unverifiedNames.length > 0 ? `${summary} · not verified: ${listNames(unverifiedNames)}` : summary;
  } else if (acceptance.reason === 'required_busy') {
    tone = 'block';
    detail = busyNames.length > 0 ? `${summary} · busy: ${listNames(busyNames)}` : summary;
  } else if (acceptance.reason === 'nobody') {
    tone = 'warn';
    detail = 'No one to check for this time.';
  }

  const confirmDisabled = !acceptance.ok || Boolean(error) || loading || disablePrimaryAction;

  return (
    <Elevated
      level="raise"
      padding="none"
      className={cn(
        'flex flex-col gap-3 border border-border-subtle px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5',
        className,
      )}
      data-testid="scheduling-task-board"
    >
      <div role="status" aria-live="polite" className="flex min-w-0 flex-1 items-start gap-3">
        <span
          aria-hidden
          className={cn(
            'mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full',
            tone === 'accept' && 'bg-accent-650 text-text-on-accent',
            tone === 'warn' && 'bg-fw-warning-bg text-fw-warning-ink',
            tone === 'block' && 'bg-fw-danger-bg text-fw-danger-ink',
          )}
        >
          {tone === 'accept' ? <Check className="h-4 w-4" strokeWidth={2.5} /> : <AlertTriangle className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-fw-sans text-body font-semibold text-text-primary">{title}</p>
          <p className="font-fw-sans text-caption text-text-secondary">{detail}</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:items-center">
        {(error || acceptance.reason === 'unverified') && onRetry ? (
          <Button variant="secondary" size="md" onClick={onRetry} leftIcon={<RefreshCw className="h-4 w-4" aria-hidden />}>
            Retry
          </Button>
        ) : null}
        {!error && acceptance.reason === 'required_busy' && nextOpen && onJumpTo ? (
          <Button variant="secondary" size="md" onClick={() => onJumpTo(nextOpen.start)}>
            Next open time · {nextOpen.label}
          </Button>
        ) : null}
        <Button
          variant="primary"
          size="lg"
          fullWidth
          busy={loading}
          disabled={confirmDisabled}
          onClick={onConfirm}
          rightIcon={<ArrowRight className="h-5 w-5" aria-hidden />}
          className="sm:w-auto sm:min-w-[200px]"
        >
          {primaryActionLabel}
        </Button>
      </div>
    </Elevated>
  );
}

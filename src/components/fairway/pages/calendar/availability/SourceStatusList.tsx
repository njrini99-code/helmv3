'use client';

/**
 * ============================================================================
 * Fairway · Calendar · SourceStatusList — S7 "My availability" Sources tab
 * ----------------------------------------------------------------------------
 * SCREEN-BUILD-PLAN.md §2.7 "Source status". `getScheduleWindow`'s snapshot
 * carries exactly ONE `verification` per person and one `checkedAt` for the
 * whole snapshot — there is no per-source (Helm events / classes / personal
 * blocks / outbound feeds) breakdown to render. Gate G6 tracks the contract
 * addition that would make one possible; until then this renders ONLY the
 * single honest line built from `checkedAt`, never four guessed rows.
 *
 * `verification: 'partial' | 'failed'` never renders as a clean checkmark —
 * both use the shared `.hatch` texture plus visible "Not verified" text
 * (SCREEN-BUILD-PLAN §3 / honesty rule: no verified-green from partial or
 * failed data).
 * ========================================================================== */

import { AlertTriangle, CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, Skeleton } from '@/components/fairway';
import styles from '../CalendarSurfaces.module.css';

export type SourceStatusState =
  | { kind: 'loading' }
  | { kind: 'no-team' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; verification: 'complete' | 'partial' | 'failed'; checkedAt: string };

export interface SourceStatusListProps {
  state: SourceStatusState;
  onRetry?: () => void;
  className?: string;
}

function formatCheckedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function SourceStatusList({ state, onRetry, className }: SourceStatusListProps) {
  if (state.kind === 'loading') {
    return (
      <div className={cn('space-y-2', className)} aria-busy="true" aria-label="Checking your schedule sources">
        <Skeleton className="h-14 rounded-fw-md" />
      </div>
    );
  }

  if (state.kind === 'no-team') {
    return (
      <p className={cn('font-fw-sans text-body-sm text-text-secondary', className)}>No team schedule to check yet.</p>
    );
  }

  if (state.kind === 'error') {
    return (
      <div
        className={cn(
          'flex items-center justify-between gap-3 rounded-fw-md px-3 py-2.5',
          'border border-fw-warning-ring bg-fw-warning-bg text-fw-warning-ink',
          className,
        )}
      >
        <span className="flex items-center gap-2 font-fw-sans text-body-sm">
          <XCircle className="h-4 w-4 shrink-0" aria-hidden />
          {state.message}
        </span>
        {onRetry ? (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </div>
    );
  }

  const time = formatCheckedAt(state.checkedAt);

  if (state.verification === 'complete') {
    return (
      <div
        className={cn(
          'flex items-center gap-3 rounded-fw-md px-3 py-2.5',
          'border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)]',
          className,
        )}
      >
        <span aria-hidden className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-full', 'bg-accent-650 text-text-on-accent')}>
          <CheckCircle2 className="h-4 w-4" aria-hidden />
        </span>
        <p className="font-fw-sans text-body-sm text-text-primary">
          Based on Helm schedules{time ? ` · checked ${time}` : ''}
        </p>
      </div>
    );
  }

  // partial or failed: hatched texture, explicit "Not verified" text.
  return (
    <div className={cn('flex items-center justify-between gap-3 rounded-fw-md px-3 py-2.5', styles.hatch, className)}>
      <span className="flex items-center gap-2 font-fw-sans text-body-sm">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        Not verified — some schedules could not be checked{time ? ` · checked ${time}` : ''}
      </span>
      {onRetry ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetry}
          leftIcon={<RefreshCw className="h-3.5 w-3.5" aria-hidden />}
        >
          Retry
        </Button>
      ) : null}
    </div>
  );
}

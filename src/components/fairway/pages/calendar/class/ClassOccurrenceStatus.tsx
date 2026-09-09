'use client';

/**
 * ============================================================================
 * Fairway · Calendar · ClassOccurrenceStatus — "This meeting" status block
 * ----------------------------------------------------------------------------
 * SCREEN-BUILD-PLAN.md §2.4: "This meeting (Scheduled / Excluded with the
 * exclusion reason and date range / Not synced to the team calendar)". Only
 * ever mounted for a detail-access viewer — see `CalendarClassDetail`, which
 * never reaches this component from the `free_busy` branch.
 *
 * `unsynced` is `CalendarClassDetail`'s own derived kind (from
 * `ClassOccurrenceDetail.synced === false`) — the server's own
 * `ClassOccurrenceStatus.state` only ever says `scheduled | excluded |
 * unknown`. `unknown` covers a failed academic-exclusion read: the server
 * reports it explicitly rather than defaulting to `scheduled`, so this never
 * claims a meeting is on when that couldn't actually be confirmed.
 * ========================================================================== */

import { CalendarCheck2, CalendarOff, CalendarClock, CircleHelp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InlineNotice } from '@/components/fairway';
import surfaces from '../CalendarSurfaces.module.css';

export interface ClassOccurrenceStatusProps {
  kind: 'scheduled' | 'excluded' | 'unknown' | 'unsynced';
  exclusion?: { reason: string | null; startDate: string | null; endDate: string | null };
}

/** Exclusion `start_date`/`end_date` are bare `YYYY-MM-DD` calendar dates,
 * not instants — format them in UTC so the displayed day never shifts a day
 * backward in a negative-offset team timezone (the classic `new
 * Date('2026-09-06')` + local-zone-format off-by-one). */
function formatCalendarDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(new Date(`${date}T00:00:00Z`));
}

export function ClassOccurrenceStatus({ kind, exclusion }: ClassOccurrenceStatusProps) {
  if (kind === 'scheduled') {
    return (
      <div className={cn('flex items-center gap-2 rounded-fw-md px-3 py-2.5', surfaces.paper)}>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-fw-success-bg text-fw-success-ink">
          <CalendarCheck2 className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="font-fw-sans text-body-sm font-semibold text-text-primary">Scheduled</p>
          <p className="font-fw-sans text-caption text-text-secondary">This meeting is on the team calendar.</p>
        </div>
      </div>
    );
  }

  if (kind === 'excluded') {
    return (
      <InlineNotice tone="warning" title="Excluded from this meeting" icon={CalendarOff}>
        {exclusion?.startDate && exclusion.endDate ? (
          <span>
            {exclusion.reason ?? 'Excluded'} · {formatCalendarDate(exclusion.startDate)}–{formatCalendarDate(exclusion.endDate)}
          </span>
        ) : (
          exclusion?.reason ?? 'This occurrence does not meet.'
        )}
      </InlineNotice>
    );
  }

  if (kind === 'unknown') {
    return (
      <InlineNotice tone="warning" title="Today's status could not be confirmed" icon={CircleHelp}>
        We couldn't check whether this class is excluded today. It may still be on.
      </InlineNotice>
    );
  }

  return (
    <InlineNotice tone="info" title="Not synced to the team calendar" icon={CalendarClock}>
      This class hasn’t been added to the team calendar yet — only you can see it.
    </InlineNotice>
  );
}

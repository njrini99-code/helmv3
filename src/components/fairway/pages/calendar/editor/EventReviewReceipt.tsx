'use client';

/**
 * Review receipt — What, When, Where, Who, Repeats, RSVP, and unresolved
 * issues, as a `<dl>` so assistive tech hears label/value pairs
 * (SCREEN-BUILD-PLAN.md §2.1 accessibility note). Shared by S1 (create) and
 * S2 (edit, where it also renders the changed-field diff via
 * `EventChangeSummary`).
 *
 * Deliberately never restates the verification panel's own sentences
 * ("Checking Helm schedules…", "No conflicts found…", "Schedules partially
 * checked…") or the invite grid's "N of M" / "N player added · M player
 * removed" copy — this is a summary, not a second copy of those panels, and
 * every existing test that queries that exact text must keep matching
 * exactly one node.
 *
 * Honesty: never claims a notification count the server doesn't return
 * ("Attendees will be notified", no number — §18); never upgrades a
 * partial/failed verification to a clean bill in this copy either.
 */

import { ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InlineNotice } from '@/components/fairway/feedback/InlineNotice';
import surfaces from '../CalendarSurfaces.module.css';
import { SpanSummary } from '@/components/fairway/pages/calendar/EventWhenFields';
import type { GolfEventFormData } from '@/components/golf/calendar/EventDetailModal';
import { EVENT_TYPES } from './EventEssentialsFields';
import { EventChangeSummary } from './EventChangeSummary';
import type { ChangedFieldEntry } from './changeDetection';
import type { ConflictData, VerificationStatus } from './EventVerificationPanel';

export interface EventReviewReceiptProps {
  headingId: string;
  isCreating: boolean;
  formData: GolfEventFormData;
  tzAbbrev: string | null;
  totalPlayers: number;
  attendeeAddCount: number;
  attendeeRemoveCount: number;
  recurrencePreview: string | null;
  verificationStatus: VerificationStatus;
  conflicts: ConflictData | null;
  /** Edit mode only — empty in create mode, where there is nothing to diff. */
  changes: ChangedFieldEntry[];
  offline: boolean;
}

function unresolvedIssuesText(status: VerificationStatus, conflicts: ConflictData | null): string {
  // `idle` means the check hasn't run at all (no start date yet, or the
  // effect bailed) — never claim a clean bill from zero data (honesty rule).
  if (status === 'idle') return 'Schedules not checked yet.';
  if (status === 'checking') return 'Checking Helm schedules — this will update automatically.';
  if (status === 'error') return 'Schedules could not be verified. Use Check again before publishing.';
  if (conflicts?.partial) return 'Some attendee schedules could not be verified.';
  if (conflicts?.hasConflict) {
    const count = conflicts.conflicts.length;
    return `${count} unresolved overlap${count === 1 ? '' : 's'} — review before publishing.`;
  }
  return 'All checked schedules are clear.';
}

function whoText(formData: GolfEventFormData, addCount: number, removeCount: number, isCreating: boolean): string {
  const base = formData.attendeeIds.length === 0
    ? 'No one invited yet'
    : `${formData.attendeeIds.length} invited`;
  if (isCreating || (addCount === 0 && removeCount === 0)) return base;
  const parts: string[] = [];
  if (addCount > 0) parts.push(`${addCount} added`);
  if (removeCount > 0) parts.push(`${removeCount} removed`);
  return `${base} (${parts.join(', ')})`;
}

export function EventReviewReceipt({
  headingId,
  isCreating,
  formData,
  tzAbbrev,
  attendeeAddCount,
  attendeeRemoveCount,
  recurrencePreview,
  verificationStatus,
  conflicts,
  changes,
  offline,
}: EventReviewReceiptProps) {
  const typeLabel = EVENT_TYPES.find((t) => t.type === formData.eventType)?.label ?? formData.eventType;
  const rsvpText = formData.requiresRsvp
    ? `Required${formData.rsvpDeadline ? ' · deadline set' : ''}`
    : 'Not required';

  return (
    <div role="group" aria-labelledby={headingId} className={cn('flex flex-col gap-4 rounded-card p-4', surfaces.paper, surfaces.enter)}>
      <div className="flex items-center gap-3">
        <span aria-hidden className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-full', surfaces.rowIcon)}>
          <ClipboardList className="h-4 w-4" aria-hidden />
        </span>
        <h3 id={headingId} className="font-fw-display text-body-lg font-semibold text-text-primary">
          Review
        </h3>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 font-fw-sans text-body-sm">
        <dt className="text-text-tertiary">What</dt>
        <dd className="font-medium text-text-primary">{formData.title.trim() || 'Untitled event'} · {typeLabel}</dd>

        <dt className="text-text-tertiary">When</dt>
        <dd className="text-text-primary">
          <SpanSummary
            startDate={formData.startDate}
            endDate={formData.endDate}
            startTime={formData.startTime}
            endTime={formData.endTime}
            allDay={formData.allDay}
            timezoneLabel={!formData.allDay ? tzAbbrev : null}
          />
        </dd>

        <dt className="text-text-tertiary">Where</dt>
        <dd className="text-text-primary">{formData.location || 'No location set'}</dd>

        <dt className="text-text-tertiary">Who</dt>
        <dd className="text-text-primary">{whoText(formData, attendeeAddCount, attendeeRemoveCount, isCreating)}</dd>

        <dt className="text-text-tertiary">Repeats</dt>
        <dd className="text-text-primary">{recurrencePreview || 'Does not repeat'}</dd>

        <dt className="text-text-tertiary">RSVP</dt>
        <dd className="text-text-primary">{rsvpText}</dd>
      </dl>

      {!isCreating ? (
        <div className="flex flex-col gap-1.5 border-t border-border-subtle pt-3">
          <p className="font-fw-sans text-caption font-medium text-text-secondary">What changed</p>
          <EventChangeSummary changes={changes} />
        </div>
      ) : null}

      <p role="status" className="font-fw-sans text-caption text-text-secondary">
        {unresolvedIssuesText(verificationStatus, conflicts)}
      </p>

      {/* Notification count is not returned by createGolfEvent / updateGolfEvent
          — say so without inventing a number (§18 "show count only when
          known"). */}
      <p className="font-fw-sans text-caption text-text-tertiary">Attendees will be notified.</p>

      {offline ? (
        <InlineNotice tone="warning" title="You're offline">
          Reconnect to publish. Your draft is kept.
        </InlineNotice>
      ) : null}
    </div>
  );
}

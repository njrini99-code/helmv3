'use client';

/**
 * ============================================================================
 * Fairway · Calendar · FairwayEventCard
 * ----------------------------------------------------------------------------
 * The Fairway re-skin of the legacy `editorial/EventChip` — a single horizontal
 * event row used inside the Agenda body. Native <button> (GOTCHA a), warm matte
 * card (border OR shadow, never both), tabular-nums time block, a non-skeuomorphic
 * StatusPill for the event_type, and an optional RSVP StatusPill on the right
 * (player view only).
 *
 * Token-only: bg-surface / border-border-subtle / text-text-* / font-fw-* /
 * rounded-card. NO bg-white, NO serif, NO glass.
 *
 * ADDITIVE + GATED — only mounted behind the isRedesignEnabled() fork.
 * ========================================================================== */

import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { StatusPill } from '@/components/fairway';
import type { FwStatusTone } from '@/components/fairway';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import type { RSVPStatus } from '@/hooks/useRSVP';

/**
 * event_type → { label, tone } using ONLY the Fairway status tones
 * (accent/success/warning/neutral). NO skeuomorphic chips — StatusPill is a
 * flat tinted pill where the label always carries the meaning too.
 */
const TYPE_META: Record<string, { label: string; tone: FwStatusTone }> = {
  practice: { label: 'Practice', tone: 'accent' },
  tournament: { label: 'Tournament', tone: 'warning' },
  qualifier: { label: 'Qualifier', tone: 'success' },
  qualifying: { label: 'Qualifier', tone: 'success' },
  travel: { label: 'Travel', tone: 'neutral' },
  workout: { label: 'Workout', tone: 'accent' },
  team_meeting: { label: 'Meeting', tone: 'neutral' },
  meeting: { label: 'Meeting', tone: 'neutral' },
  other: { label: 'Event', tone: 'neutral' },
};

// Standalone non-optional fallback (TYPE_META.other is `| undefined` under
// noUncheckedIndexedAccess, so it can't guarantee a non-undefined return).
const TYPE_META_FALLBACK: { label: string; tone: FwStatusTone } = { label: 'Event', tone: 'neutral' };

export function typeMeta(eventType: string | null | undefined): { label: string; tone: FwStatusTone } {
  return TYPE_META[(eventType || 'other').toLowerCase()] ?? TYPE_META_FALLBACK;
}

/** RSVP status → pill copy + tone (player's own response). */
const RSVP_PILL: Record<RSVPStatus, { label: string; tone: FwStatusTone }> = {
  accepted: { label: 'Going', tone: 'accent' },
  tentative: { label: 'Maybe', tone: 'warning' },
  declined: { label: 'Declined', tone: 'danger' },
  pending: { label: 'Reply', tone: 'neutral' },
};

export interface FairwayEventCardProps {
  event: CalendarEvent;
  /** Player's own RSVP status — only rendered when `showRsvp` is true. */
  rsvpStatus?: RSVPStatus | null;
  /** Show the RSVP pill on the right rail (player view only). */
  showRsvp?: boolean;
  /** Click handler — opens the detail drawer. */
  onClick?: (event: CalendarEvent) => void;
  className?: string;
}

function startTimeLabel(event: CalendarEvent): string {
  if (event.all_day) return 'All day';
  const start = event.start_time || event.start_date;
  if (!start) return 'Anytime';
  return format(new Date(start), 'h:mm a');
}

function endTimeLabel(event: CalendarEvent): string | null {
  if (event.all_day) return null;
  const end = event.end_time || event.end_date;
  const start = event.start_time || event.start_date;
  if (!end || end === start) return null;
  return format(new Date(end), 'h:mm a');
}

function timeAria(event: CalendarEvent): string {
  if (event.all_day) return 'All day';
  const start = startTimeLabel(event);
  const end = endTimeLabel(event);
  return end ? `${start} – ${end}` : start;
}

export function FairwayEventCard({
  event,
  rsvpStatus,
  showRsvp = false,
  onClick,
  className,
}: FairwayEventCardProps) {
  const { label: typeLabel, tone: typeTone } = typeMeta(event.event_type);
  const start = startTimeLabel(event);
  const end = endTimeLabel(event);
  const rsvp = showRsvp && rsvpStatus ? RSVP_PILL[rsvpStatus] : null;

  return (
    // GOTCHA (a): a real native <button>, NOT `Surface as="button"`.
    <button
      type="button"
      onClick={onClick ? () => onClick(event) : undefined}
      aria-label={`${event.title} — ${timeAria(event)}${event.location ? `, ${event.location}` : ''}`}
      className={cn(
        'group relative flex w-full items-stretch gap-4 text-left',
        'rounded-card bg-surface border border-border-subtle shadow-flat',
        'p-4 min-h-[64px]',
        'transition-[box-shadow,transform,border-color] [transition-duration:180ms] [transition-timing-function:cubic-bezier(0.22,0.61,0.36,1)]',
        'hover:-translate-y-px hover:shadow-soft hover:border-border-strong',
        'active:translate-y-[0.5px] active:shadow-flat',
        'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        'motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0',
        className,
      )}
    >
      {/* Time block — Fragment-Mono tabular-nums, fixed width for column alignment. */}
      <div className="flex w-[68px] flex-shrink-0 flex-col items-start justify-center md:w-[84px]">
        <span
          className="font-fw-mono text-body-sm font-medium tabular-nums text-text-primary"
          suppressHydrationWarning
        >
          {start}
        </span>
        {end ? (
          <span
            className="font-fw-mono text-caption tabular-nums text-text-tertiary"
            suppressHydrationWarning
          >
            {end}
          </span>
        ) : null}
      </div>

      {/* Title + location. */}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
        <p className="truncate font-fw-sans text-body-sm font-medium text-text-primary">
          {event.title}
        </p>
        <div className="flex min-w-0 items-center gap-2">
          <StatusPill tone={typeTone} size="sm" dot={false}>
            {typeLabel}
          </StatusPill>
          {event.location ? (
            <span className="truncate font-fw-sans text-caption text-text-tertiary">
              {event.location}
            </span>
          ) : null}
        </div>
      </div>

      {/* RSVP pill — player view only. */}
      {rsvp ? (
        <div className="flex flex-shrink-0 items-center">
          <StatusPill tone={rsvp.tone} size="sm">
            {rsvp.label}
          </StatusPill>
        </div>
      ) : null}
    </button>
  );
}

export default FairwayEventCard;

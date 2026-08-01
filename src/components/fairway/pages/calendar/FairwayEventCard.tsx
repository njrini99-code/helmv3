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

import { cn } from '@/lib/utils';
import { StatusPill } from '@/components/fairway';
import { Button } from '@/components/fairway/controls/button';
import type { FwStatusTone } from '@/components/fairway';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import type { RSVPStatus } from '@/hooks/useRSVP';
import { formatEventTime } from '@/lib/calendar/timezone';

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
  /** True for events whose day has already passed — renders at reduced opacity. */
  isPast?: boolean;
  /**
   * Team's canonical IANA timezone (golf_team_settings.timezone). Times
   * render anchored to this zone — NOT the runtime's own local zone — so the
   * SAME event agrees between server and client render, and between this
   * card and FairwayEventDetailDrawer (audit W1: cal-tz).
   */
  timezone?: string | null;
  className?: string;
}

function startTimeLabel(event: CalendarEvent, timezone?: string | null): string {
  if (event.all_day) return 'All day';
  const start = event.start_time || event.start_date;
  if (!start) return 'Anytime';
  return formatEventTime(start, timezone);
}

function endTimeLabel(event: CalendarEvent, timezone?: string | null): string | null {
  if (event.all_day) return null;
  const end = event.end_time || event.end_date;
  const start = event.start_time || event.start_date;
  if (!end || end === start) return null;
  return formatEventTime(end, timezone);
}

function timeAria(event: CalendarEvent, timezone?: string | null): string {
  if (event.all_day) return 'All day';
  const start = startTimeLabel(event, timezone);
  const end = endTimeLabel(event, timezone);
  return end ? `${start} – ${end}` : start;
}

export function FairwayEventCard({
  event,
  rsvpStatus,
  showRsvp = false,
  onClick,
  isPast = false,
  timezone,
  className,
}: FairwayEventCardProps) {
  const { label: typeLabel, tone: typeTone } = typeMeta(event.event_type);
  const start = startTimeLabel(event, timezone);
  const end = endTimeLabel(event, timezone);
  const rsvp = showRsvp && rsvpStatus ? RSVP_PILL[rsvpStatus] : null;
  // Cancelled events render DISTINCTLY at the list level too — badge + strike,
  // mirroring FairwayEventDetailDrawer's treatment (previously this only
  // showed up once a player tapped into the event's detail drawer; 2026-07-10
  // calendar-travel audit). Orthogonal to `isPast` — a cancelled event can be
  // past or upcoming, both cues apply independently.
  const isCancelled = event.status === 'cancelled';

  return (
    // GOTCHA (a): a real Fairway <Button variant="ghost">, NOT `Surface as="button"`.
    <Button
      type="button"
      variant="ghost"
      onClick={onClick ? () => onClick(event) : undefined}
      aria-label={`${event.title} — ${timeAria(event, timezone)}${event.location ? `, ${event.location}` : ''}`}
      className={cn(
        'group relative block h-auto min-h-[64px] w-full border text-left font-normal',
        'rounded-card bg-surface border-border-subtle shadow-flat',
        'p-4',
        'transition-[box-shadow,transform,border-color] [transition-duration:180ms] [transition-timing-function:cubic-bezier(0.22,0.61,0.36,1)]',
        'hover:-translate-y-px hover:bg-surface hover:shadow-soft hover:border-border-strong',
        'active:translate-y-[0.5px] active:shadow-flat',
        'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        'motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0',
        isPast && 'opacity-50',
        className,
      )}
    >
      <span className="flex w-full items-stretch gap-4">
        {/* Time block — Fragment-Mono tabular-nums, fixed width for column alignment. */}
        <span className="flex w-[68px] flex-shrink-0 flex-col items-start justify-center md:w-[84px]">
          <span className="font-fw-mono text-body-sm font-medium tabular-nums text-text-primary">
            {start}
          </span>
          {end ? (
            <span className="font-fw-mono text-caption tabular-nums text-text-tertiary">
              {end}
            </span>
          ) : null}
        </span>

        {/* Title + location. */}
        <span className="flex min-w-0 flex-1 flex-col justify-center gap-1">
          <p
            className={cn(
              'truncate font-fw-sans text-body-sm font-medium text-text-primary',
              isCancelled && 'text-text-tertiary line-through decoration-2',
            )}
          >
            {event.title}
          </p>
          <span className="flex min-w-0 items-center gap-2">
            <StatusPill tone={typeTone} size="sm" dot={false}>
              {typeLabel}
            </StatusPill>
            {isCancelled ? (
              <StatusPill tone="danger" size="sm" dot={false}>
                Cancelled
              </StatusPill>
            ) : null}
            {event.location ? (
              <span className="truncate font-fw-sans text-caption text-text-tertiary">
                {event.location}
              </span>
            ) : null}
          </span>
        </span>

        {/* RSVP pill — player view only. */}
        {rsvp ? (
          <span className="flex flex-shrink-0 items-center">
            <StatusPill tone={rsvp.tone} size="sm">
              {rsvp.label}
            </StatusPill>
          </span>
        ) : null}
      </span>
    </Button>
  );
}

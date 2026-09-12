'use client';

/**
 * ============================================================================
 * Fairway · Calendar · FairwayEventCard — one agenda row
 * ----------------------------------------------------------------------------
 * A single full-width pressable row: time column · event content · one
 * trailing affordance. The whole row is a Fairway `PressTarget` (native
 * button semantics, shared press response, green focus ring). Rows sit
 * together inside ONE day Surface owned by FairwayAgendaView, separated by
 * hairlines — a grouped daily schedule, not a list of floating cards. No
 * colored side strip, no icon pedestal: the event's identity comes from its
 * title, its small type cue and its status.
 *
 * Time and date rendering stay anchored to the team's timezone so the row
 * agrees with the detail drawer and across server/client renders.
 * ========================================================================== */

import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PressTarget, StatusPill } from '@/components/fairway';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import type { RSVPStatus } from '@/hooks/useRSVP';
import { formatEventTime } from '@/lib/calendar/timezone';
import { tintFor } from './FairwayCalendarMemberRail';
import { RSVP_PILL, typeIcon, typeMeta } from './eventPresentation';

export { typeMeta } from './eventPresentation';

export interface FairwayEventCardProps {
  event: CalendarEvent;
  /** Player's own RSVP status — only rendered when `showRsvp` is true. */
  rsvpStatus?: RSVPStatus | null;
  /** Show the RSVP pill in the trailing slot (player view only). */
  showRsvp?: boolean;
  /** Tap handler — opens the detail drawer. */
  onClick?: (event: CalendarEvent) => void;
  /** True for events whose day has already passed. Text quietens; it never fades below legibility. */
  isPast?: boolean;
  /** Kept for callers that still pass a list index; the row no longer animates in. */
  enterIndex?: number;
  /**
   * Team's canonical IANA timezone (golf_team_settings.timezone). Times render
   * anchored to this zone so the SAME event agrees between server and client
   * render, and between this row and FairwayEventDetailDrawer.
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

/** "9:00 AM" → { clock: "9:00", meridiem: "AM" }; "All day" stays whole. */
function splitClock(label: string): { clock: string; meridiem: string } {
  const match = /^(\d{1,2}:\d{2})\s*([AP]M)$/i.exec(label);
  return match ? { clock: match[1]!, meridiem: match[2]!.toUpperCase() } : { clock: label, meridiem: '' };
}

/** Memoized: a list of these re-renders only the rows whose props changed
 *  (the agenda's minute tick, a parent re-render, a scroll-driven state
 *  update elsewhere on the page all leave untouched rows alone). */
export const FairwayEventCard = React.memo(function FairwayEventCard({
  event,
  rsvpStatus,
  showRsvp = false,
  onClick,
  isPast = false,
  timezone,
  className,
}: FairwayEventCardProps) {
  const { label: typeLabel } = typeMeta(event.event_type);
  const Icon = typeIcon(event.event_type);
  const start = startTimeLabel(event, timezone);
  const end = endTimeLabel(event, timezone);
  const startParts = splitClock(start);
  const rsvp = showRsvp && rsvpStatus ? RSVP_PILL[rsvpStatus] : null;
  // Cancelled is orthogonal to past: both cues apply independently.
  const isCancelled = event.status === 'cancelled';
  const ownerTint = event.owner_label && event.owner_player_id ? tintFor(event.owner_player_id) : null;

  return (
    <PressTarget
      onClick={onClick ? () => onClick(event) : undefined}
      aria-label={`${event.title} — ${timeAria(event, timezone)}${event.location ? `, ${event.location}` : ''}${isCancelled ? ', cancelled' : ''}`}
      className={cn(
        // One row inside the day's Surface (FairwayAgendaView owns the frame
        // and the dividers). Rounded only so the focus ring follows the row.
        'group flex w-full items-stretch gap-3 rounded-none bg-surface px-3 py-2.5 text-left focus-visible:z-10 focus-visible:ring-inset focus-visible:ring-offset-0',
        // Hover on a pointer; a real press tint on touch (the press response
        // itself is PressTarget's), then back to rest.
        '[@media(hover:hover)]:hover:bg-surface-sunken active:bg-surface-sunken',
        'md:gap-4 md:px-4 md:py-3',
        className,
      )}
    >
      {/* Time column — a stable width so titles align down the list: the start
          with its meridiem, and the end time beneath it on every width. */}
      <span className="flex w-[60px] shrink-0 flex-col justify-center whitespace-nowrap md:w-[72px]">
        <span
          className={cn(
            'font-fw-sans text-body font-semibold tabular-nums leading-tight',
            isPast ? 'text-text-secondary' : 'text-text-primary',
          )}
        >
          {startParts.clock}
          {startParts.meridiem ? (
            <span className="ml-0.5 font-fw-sans text-eyebrow font-medium tabular-nums text-text-tertiary">
              {startParts.meridiem}
            </span>
          ) : null}
        </span>
        {end ? (
          <span className="mt-0.5 font-fw-sans text-caption tabular-nums leading-tight text-text-tertiary">
            {end}
          </span>
        ) : null}
      </span>

      <span aria-hidden className="w-px shrink-0 self-stretch bg-border-subtle" />

      {/* Event content — title first, then one line of useful detail. */}
      <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 py-0.5">
        <span
          className={cn(
            'line-clamp-2 font-fw-sans text-body font-semibold leading-snug',
            isPast ? 'text-text-secondary' : 'text-text-primary',
            isCancelled && 'text-text-tertiary line-through decoration-2',
          )}
        >
          {event.title}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 font-fw-sans text-body-sm text-text-secondary">
          <Icon className="h-3.5 w-3.5 shrink-0 text-text-tertiary" aria-hidden />
          {ownerTint ? (
            <span
              className="shrink-0 rounded-full px-1.5 py-px font-fw-sans text-caption font-semibold"
              style={{ backgroundColor: ownerTint.bg, color: ownerTint.text }}
            >
              {event.owner_label}
            </span>
          ) : (
            <span className="shrink-0">{typeLabel}</span>
          )}
          {event.location ? (
            <>
              <span aria-hidden className="shrink-0 text-text-tertiary">·</span>
              <span className="min-w-0 truncate">{event.location}</span>
            </>
          ) : null}
        </span>
      </span>

      {/* Trailing — one thing: a response status, a cancelled mark, or the disclosure. */}
      <span className="flex shrink-0 items-center gap-2 self-center">
        {isCancelled ? (
          <StatusPill tone="danger" size="sm" dot={false}>
            Cancelled
          </StatusPill>
        ) : rsvp ? (
          <StatusPill tone={rsvp.tone} size="sm">
            {rsvp.label}
          </StatusPill>
        ) : null}
        <ChevronRight
          aria-hidden
          className="h-4 w-4 text-text-tertiary transition-transform [@media(hover:hover)]:group-hover:translate-x-0.5 motion-reduce:transition-none"
        />
      </span>
    </PressTarget>
  );
});

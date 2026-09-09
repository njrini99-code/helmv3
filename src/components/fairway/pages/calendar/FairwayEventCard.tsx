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

import * as React from 'react';
import { cn } from '@/lib/utils';
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  Dumbbell,
  Flag,
  Plane,
  Target,
  Trophy,
  Users,
} from 'lucide-react';
import { StatusPill } from '@/components/fairway';
import { Button } from '@/components/fairway/controls/button';
import type { FwStatusTone } from '@/components/fairway';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import type { RSVPStatus } from '@/hooks/useRSVP';
import { formatEventTime } from '@/lib/calendar/timezone';
import { tintFor } from './FairwayCalendarMemberRail';
import surfaces from './CalendarSurfaces.module.css';
import { enterStyle } from './motion';

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
  // A synced class meeting. It shows on the team calendar's "All" lens by
  // design, so it has to SAY it's a class — otherwise a roster's worth of
  // classes reads as unexplained "Event" chips.
  class: { label: 'Class', tone: 'neutral' },
  other: { label: 'Event', tone: 'neutral' },
};

// Standalone non-optional fallback (TYPE_META.other is `| undefined` under
// noUncheckedIndexedAccess, so it can't guarantee a non-undefined return).
const TYPE_META_FALLBACK: { label: string; tone: FwStatusTone } = { label: 'Event', tone: 'neutral' };

/** event_type → icon for the row's disc. */
const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  practice: Flag,
  tournament: Trophy,
  qualifier: Target,
  qualifying: Target,
  travel: Plane,
  workout: Dumbbell,
  team_meeting: Users,
  meeting: Users,
  class: BookOpen,
  other: CalendarDays,
};

/** event_type → the row's rule/disc tint, as token custom properties consumed
 * by `.row` / `.rowIcon` (CalendarSurfaces.module.css). Class rows use the
 * calendar-local class colour declared on `.scope`. */
const TYPE_TINT: Record<string, { '--row-tint': string; '--row-tint-bg': string }> = {
  practice: { '--row-tint': 'var(--fw-color-accent-650)', '--row-tint-bg': 'var(--fw-color-accent-50)' },
  workout: { '--row-tint': 'var(--fw-color-accent-650)', '--row-tint-bg': 'var(--fw-color-accent-50)' },
  qualifier: { '--row-tint': 'var(--fw-color-accent-800)', '--row-tint-bg': 'var(--fw-color-accent-100)' },
  qualifying: { '--row-tint': 'var(--fw-color-accent-800)', '--row-tint-bg': 'var(--fw-color-accent-100)' },
  tournament: { '--row-tint': 'var(--fw-color-warning)', '--row-tint-bg': 'var(--fw-color-warning-bg)' },
  travel: { '--row-tint': 'var(--fw-color-text-secondary)', '--row-tint-bg': 'var(--fw-color-surface-sunken)' },
  team_meeting: { '--row-tint': 'var(--fw-color-warm-600)', '--row-tint-bg': 'var(--fw-color-warm-100)' },
  meeting: { '--row-tint': 'var(--fw-color-warm-600)', '--row-tint-bg': 'var(--fw-color-warm-100)' },
  class: { '--row-tint': 'var(--cal-class-ink)', '--row-tint-bg': 'var(--cal-class-bg)' },
  other: { '--row-tint': 'var(--fw-color-text-secondary)', '--row-tint-bg': 'var(--fw-color-surface-sunken)' },
};

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
   * Position in a freshly rendered list. Drives the staggered `.enter`
   * reveal (30ms per card, capped at 8 so long agendas never wait on the
   * animation). Omit for cards rendered alone.
   */
  enterIndex?: number;
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
  enterIndex,
}: FairwayEventCardProps) {
  const { label: typeLabel } = typeMeta(event.event_type);
  const start = startTimeLabel(event, timezone);
  const end = endTimeLabel(event, timezone);
  const rsvp = showRsvp && rsvpStatus ? RSVP_PILL[rsvpStatus] : null;
  // Cancelled events render DISTINCTLY at the list level too — badge + strike,
  // mirroring FairwayEventDetailDrawer's treatment (previously this only
  // showed up once a player tapped into the event's detail drawer; 2026-07-10
  // calendar-travel audit). Orthogonal to `isPast` — a cancelled event can be
  // past or upcoming, both cues apply independently.
  const isCancelled = event.status === 'cancelled';

  const Icon = TYPE_ICON[(event.event_type || 'other').toLowerCase()] ?? CalendarDays;
  // "9:00 AM" → { clock: "9:00", meridiem: "AM" }; "All day" stays whole.
  const startParts = (() => {
    const match = /^(\d{1,2}:\d{2})\s*([AP]M)$/i.exec(start);
    return match ? { clock: match[1]!, meridiem: match[2]!.toUpperCase() } : { clock: start, meridiem: '' };
  })();
  const tint = TYPE_TINT[(event.event_type || 'other').toLowerCase()] ?? TYPE_TINT.other!;

  return (
    // GOTCHA (a): a real Fairway <Button variant="ghost">, NOT `Surface as="button"`.
    // The Button is the whole row (time gutter + card) so the hit target and
    // the accessible name cover everything; the visible card is the inner
    // span carrying the material.
    <Button
      type="button"
      variant="ghost"
      onClick={onClick ? () => onClick(event) : undefined}
      aria-label={`${event.title} — ${timeAria(event, timezone)}${event.location ? `, ${event.location}` : ''}`}
      className={cn(
        'group relative flex h-auto min-h-[64px] w-full items-stretch justify-start whitespace-normal border-0 bg-transparent p-0 text-left font-normal',
        // Button wraps children in a bare <span>; make that span the row.
        '[&>span]:flex [&>span]:w-full [&>span]:min-w-0 [&>span]:items-stretch [&>span]:gap-3',
        'hover:bg-transparent active:bg-transparent',
        'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        surfaces.press,
        enterIndex !== undefined && surfaces.enter,
        isPast && 'opacity-60',
        className,
      )}
      style={enterStyle(enterIndex)}
    >
      {/* Time gutter — outside the card. Phone: "9:00" over "AM" like the
          reference; md+: start over end in mono. */}
      <span className="flex w-[52px] flex-shrink-0 flex-col items-start justify-center gap-0.5 whitespace-nowrap pl-0.5 md:w-[76px]">
        <span className="font-fw-sans text-body font-semibold tabular-nums leading-tight text-text-primary md:hidden">
          {startParts.clock}
        </span>
        {startParts.meridiem ? (
          <span className="font-fw-sans text-caption font-medium tabular-nums leading-tight text-text-secondary md:hidden">
            {startParts.meridiem}
          </span>
        ) : null}
        <span className="hidden font-fw-mono text-body-sm font-semibold tabular-nums leading-tight text-text-primary md:block">
          {start}
        </span>
        {end ? (
          <span className="hidden font-fw-mono text-caption tabular-nums leading-tight text-text-tertiary md:block">
            {end}
          </span>
        ) : null}
      </span>

      {/* The card — lifted ivory paper; the type reads from the icon disc. */}
      <span
        className={cn(
          'flex min-w-0 flex-1 items-center gap-3 rounded-card py-3 pl-3 pr-3',
          surfaces.row,
          surfaces.rise,
          'group-hover:shadow-soft',
        )}
        style={tint as React.CSSProperties}
      >
        {/* Type icon on a soft tinted disc — the card's identity mark. */}
        <span
          aria-hidden
          className={cn('grid h-10 w-10 flex-shrink-0 place-items-center rounded-full', surfaces.rowIcon)}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>

        <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
          <span
            className={cn(
              'line-clamp-2 font-fw-sans text-body-lg font-semibold leading-tight text-text-primary',
              isCancelled && 'text-text-tertiary line-through decoration-2',
            )}
          >
            {event.title}
          </span>
          <span className="flex min-w-0 items-center gap-2">
            {/* Whose class this is. Carries the player's identity tint — the
                same one their avatar wears in the member rail and on the
                roster — so the name and the color reinforce each other. */}
            {event.owner_label && event.owner_player_id ? (
              <span
                className="flex-shrink-0 rounded-full px-2 py-0.5 font-fw-sans text-caption font-semibold"
                style={{
                  backgroundColor: tintFor(event.owner_player_id).bg,
                  color: tintFor(event.owner_player_id).text,
                }}
              >
                {event.owner_label}
              </span>
            ) : null}
            {isCancelled ? (
              <StatusPill tone="danger" size="sm" dot={false}>
                Cancelled
              </StatusPill>
            ) : null}
            {event.location ? (
              <span className="truncate font-fw-sans text-body-sm text-text-secondary">
                {event.location}
              </span>
            ) : (
              <span className="truncate font-fw-sans text-body-sm text-text-tertiary">{typeLabel}</span>
            )}
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
        <ChevronRight
          aria-hidden
          className="h-4 w-4 flex-shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
        />
      </span>
    </Button>
  );
}

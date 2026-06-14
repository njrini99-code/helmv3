'use client';

/**
 * EventChip — editorial event row used inside the Agenda view.
 *
 * Single horizontal chip with:
 *  - 3px type-driven accent rail on the left edge
 *  - tabular-nums time block (Geist), aligned to the rail
 *  - title (warm-900 / medium) + optional location (warm-500 / 11px)
 *  - optional RSVP status pill on the right (player view)
 *
 * `surface-tile-hover` provides the lift + border-glow + shared 220ms
 * cubic-bezier(0.16, 1, 0.3, 1) easing used elsewhere in the product.
 *
 * Reduced-motion users get a static state — the underlying class gates
 * the transform inside its own media query.
 */

import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import type { RSVPStatus } from '@/hooks/useRSVP';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeTone } from '@/components/ui/badge';

// Type → accent rail color (token-driven; token classes resolve via tailwind).
const TYPE_RAIL_CLASS: Record<string, string> = {
  practice: 'bg-warm-400',
  tournament: 'bg-warning',
  qualifier: 'bg-primary-500',
  qualifying: 'bg-primary-500',
  travel: 'bg-warm-700',
  team_meeting: 'bg-warm-500',
  meeting: 'bg-warm-500',
};
const DEFAULT_RAIL_CLASS = 'bg-warm-400';

// Type → readable label for the eyebrow.
const TYPE_LABEL: Record<string, string> = {
  practice: 'Practice',
  tournament: 'Tournament',
  qualifier: 'Qualifier',
  qualifying: 'Qualifier',
  travel: 'Travel',
  team_meeting: 'Meeting',
  meeting: 'Meeting',
  other: 'Event',
};

// RSVP → pill copy + canonical Badge tone + the exact alpha-tint/ring override
// that makes the RSVP pill read against the cream event chip. Kept here so the
// chip is self-contained; the colored shell now delegates to <Badge>.
const RSVP_PILL: Record<RSVPStatus, { label: string; tone: BadgeTone; className: string }> = {
  accepted: {
    label: 'Going',
    tone: 'primary',
    className: 'bg-primary-50/80 text-primary-700 ring-1 ring-primary-500/20',
  },
  tentative: {
    label: 'Tentative',
    tone: 'amber',
    className: 'bg-amber-50/85 text-amber-700 ring-1 ring-amber-500/20',
  },
  declined: {
    label: 'Declined',
    tone: 'rose',
    className: 'bg-rose-50/80 text-rose-700 ring-1 ring-rose-500/20',
  },
  pending: {
    label: 'Reply',
    tone: 'warm',
    className: 'bg-cream-100/85 text-warm-700 ring-1 ring-warm-200/65',
  },
};

interface EventChipProps {
  event: CalendarEvent;
  /** Player's own RSVP status. Only rendered when `showRsvp` is true. */
  rsvpStatus?: RSVPStatus | null;
  /** Show the RSVP pill on the right rail (player view only). */
  showRsvp?: boolean;
  /** Click handler — opens the detail drawer. */
  onClick?: (event: CalendarEvent) => void;
  className?: string;
}

function formatTimeRange(event: CalendarEvent): string {
  if (event.all_day) return 'All day';
  const start = event.start_time || event.start_date;
  const end = event.end_time || event.end_date;
  if (!start) return 'Anytime';
  const startStr = format(new Date(start), 'h:mm a');
  if (!end || end === start) return startStr;
  return `${startStr} – ${format(new Date(end), 'h:mm a')}`;
}

export function EventChip({
  event,
  rsvpStatus,
  showRsvp = false,
  onClick,
  className,
}: EventChipProps) {
  const type = (event.event_type || 'other').toLowerCase();
  const railClass = TYPE_RAIL_CLASS[type] ?? DEFAULT_RAIL_CLASS;
  const typeLabel = TYPE_LABEL[type] ?? TYPE_LABEL.other;
  const timeRange = formatTimeRange(event);
  const rsvp = showRsvp && rsvpStatus ? RSVP_PILL[rsvpStatus] : null;

  return (
    <Button variant="ghost"
      type="button"
      onClick={onClick ? () => onClick(event) : undefined}
      className={cn(
        'group relative w-full text-left',
        'flex items-stretch gap-3 md:gap-4',
        'rounded-2xl border border-warm-200/55 bg-cream-50/70',
        'p-3 md:p-4 pl-4 md:pl-5',
        // Hover choreography (lift + border glow + 220ms ease).
        'surface-tile-hover',
        // Touch target ≥44px.
        'min-h-[64px]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
        className,
      )}
      aria-label={`${event.title} — ${timeRange}${event.location ? `, ${event.location}` : ''}`}
    >
      {/* Type accent rail — 3px wide, full height. */}
      <span
        aria-hidden
        className={cn(
          'absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full',
          railClass,
        )}
      />

      {/* Time block — Geist tabular-nums, fixed width on md+ for alignment. */}
      <div className="flex-shrink-0 flex flex-col items-start justify-center w-[72px] md:w-[88px] pr-1">
        <span className="font-serif uppercase text-eyebrow tracking-[0.12em] text-warm-400 mb-0.5">
          {typeLabel}
        </span>
        {/* Times are formatted in the system timezone (date-fns `format`),
            which differs between the SSR host (UTC) and the user's browser.
            The DOM structure is identical; only the text content differs.
            `suppressHydrationWarning` here scopes the suppression to the
            single text node that legitimately reformats post-hydration. */}
        <span
          className="text-body-sm font-medium text-warm-900 tabular-nums leading-tight"
          suppressHydrationWarning
        >
          {event.all_day ? 'All day' : format(new Date(event.start_time || event.start_date), 'h:mm a')}
        </span>
        {!event.all_day && event.end_time && (
          <span
            className="text-eyebrow text-warm-500 tabular-nums leading-tight"
            suppressHydrationWarning
          >
            {format(new Date(event.end_time), 'h:mm a')}
          </span>
        )}
      </div>

      {/* Title + location. */}
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
        <p className="font-medium text-body-sm text-warm-900 tracking-[-0.005em] truncate">
          {event.title}
        </p>
        {event.location && (
          <p className="text-eyebrow text-warm-500 truncate">
            {event.location}
          </p>
        )}
      </div>

      {/* RSVP pill — player view only. */}
      {rsvp && (
        <div className="flex-shrink-0 flex items-center">
          <Badge
            tone={rsvp.tone}
            size="none"
            // Plain string (not the shared cn): Badge's custom-fontSize-aware
            // merge keeps BOTH `text-eyebrow` and the RSVP text color. The
            // original used a ring (not a border) + alpha-tinted bg; preserved
            // verbatim — `border-transparent` + the ring layer over Badge.
            className={`gap-1 px-2.5 py-1 text-eyebrow tracking-[-0.005em] border-transparent ${rsvp.className}`}
          >
            {rsvp.label}
          </Badge>
        </div>
      )}
    </Button>
  );
}

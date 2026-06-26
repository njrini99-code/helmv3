'use client';

import {
  PremiumCalendarClient,
  type CalendarActionHandlers,
  type CalendarCapabilities,
  type TeamMember,
} from '@/components/shared/calendar/PremiumCalendarClient';
import {
  createBaseballEvent,
  updateBaseballEvent,
  deleteBaseballEvent,
  rsvpToBaseballEvent,
} from '@/app/baseball/actions/calendar';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';

// ── Design tokens ──────────────────────────────────────────────────────────────
// Uses primary-* (Helm green) and warm-* from the project design system.
// No off-palette colours (no emerald/indigo/sky raw classes).

// ── Types ──────────────────────────────────────────────────────────────────────

interface BaseballCalendarWrapperProps {
  initialEvents: CalendarEvent[];
  teamMembers: TeamMember[];
  teamId: string | null;
  isCoach?: boolean;
  currentUserId?: string;
  /** Show a full-calendar skeleton instead of the calendar — for Suspense / loading states */
  loading?: boolean;
}

/**
 * Baseball calendar capability flags.
 *
 * Disables golf-backed features that have no baseball backend yet:
 *  - recurring: recurring event creation/editing is backed by golf_events; no
 *    baseball_recurring_events table exists.
 *  - rsvpRead: RSVP count reads currently pull from golf_event_attendance via
 *    the shared hooks; baseball uses baseball_event_attendance.
 *  - availability: player availability overlay fetches from golf_player_classes;
 *    no equivalent baseball query is wired.
 *
 * Setting these false prevents the shared UI from silently hitting wrong tables.
 */
const BASEBALL_CALENDAR_CAPABILITIES = {
  recurring: false,
  rsvpRead: false,
  availability: false,
  rsvpWrite: true,
} satisfies Required<CalendarCapabilities>;

// ── RSVP vocabulary bridge ─────────────────────────────────────────────────────
//
// PremiumCalendarClient speaks golf RSVP vocab: 'accepted' | 'tentative' | 'declined' | 'pending'.
// baseball_event_attendance uses:              'going'   | 'maybe'    | 'not_going' | 'pending'.
//
// This map is load-bearing: if we ever miss a status the function returns
// { success: false } rather than silently writing a wrong value.

const GOLF_TO_BASEBALL_RSVP: Partial<Record<string, 'going' | 'maybe' | 'not_going'>> = {
  accepted: 'going',
  tentative: 'maybe',
  declined: 'not_going',
};

/**
 * Translate a golf-vocabulary RSVP response to the baseball vocabulary and
 * write it to `baseball_event_attendance` — never to `golf_event_attendance`.
 */
async function respondToBaseballEvent(
  eventId: string,
  golfResponse: string,
): Promise<{ success: boolean; error?: string }> {
  const baseballStatus = GOLF_TO_BASEBALL_RSVP[golfResponse];
  if (!baseballStatus) {
    // 'pending' and any unknown value are rejected: only a player-initiated
    // status (going/maybe/not_going) should be written via this path.
    return { success: false, error: `Unrecognised RSVP response: ${golfResponse}` };
  }
  return rsvpToBaseballEvent(eventId, baseballStatus);
}

// ── Action handlers ────────────────────────────────────────────────────────────

const baseballActionHandlers = {
  createEvent: (data: unknown) =>
    createBaseballEvent(data as Parameters<typeof createBaseballEvent>[0]),
  updateEvent: (id: string, data: unknown) =>
    updateBaseballEvent(id, data as Parameters<typeof updateBaseballEvent>[1]),
  deleteEvent: deleteBaseballEvent,
  /**
   * Injected RSVP handler — routes to `baseball_event_attendance`, NEVER to
   * the golf RSVP action.
   */
  respondToEvent: respondToBaseballEvent,
} satisfies CalendarActionHandlers;

// ── Loading skeleton ───────────────────────────────────────────────────────────

/**
 * Full-calendar loading skeleton. Renders the same outer shell as the calendar
 * so there is no layout jump when data arrives. Uses CSS animation only
 * (no framer-motion dependency in this leaf component).
 *
 * Respects prefers-reduced-motion: disables pulse when the user has requested
 * reduced motion.
 */
export function BaseballCalendarSkeleton() {
  return (
    <div
      className="flex flex-col h-full w-full rounded-2xl glass-standard backdrop-blur-xl border border-white/20 shadow-glass overflow-hidden"
      role="status"
      aria-label="Loading calendar"
      aria-busy="true"
    >
      {/* Header strip */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-warm-100/60">
        <div className="h-5 w-28 rounded-lg bg-warm-100 motion-safe:animate-pulse" />
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-warm-100 motion-safe:animate-pulse" />
          <div className="h-8 w-8 rounded-lg bg-warm-100 motion-safe:animate-pulse" />
          <div className="h-8 w-20 rounded-xl bg-warm-100 motion-safe:animate-pulse" />
        </div>
      </div>

      {/* Day-of-week header row */}
      <div className="flex-shrink-0 grid grid-cols-7 px-4 pt-3 pb-2 gap-1">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="text-center">
            <div className="h-3.5 w-6 mx-auto rounded bg-warm-100 motion-safe:animate-pulse" />
          </div>
        ))}
      </div>

      {/* Calendar grid cells */}
      <div className="flex-1 grid grid-cols-7 grid-rows-5 gap-px p-1">
        {Array.from({ length: 35 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg bg-warm-50/60 p-2 space-y-1.5"
          >
            <div className="h-4 w-4 rounded-md bg-warm-100/70 motion-safe:animate-pulse" />
            {/* Random event placeholder lines — only a handful of cells */}
            {(i === 4 || i === 9 || i === 18 || i === 25 || i === 30) && (
              <div className="h-5 w-full rounded-md bg-primary-100/50 motion-safe:animate-pulse" />
            )}
            {(i === 9 || i === 25) && (
              <div className="h-5 w-3/4 rounded-md bg-warm-200/40 motion-safe:animate-pulse" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Game event chip ────────────────────────────────────────────────────────────

/**
 * A distinct "Game" chip rendered alongside the event title on schedule-
 * imported game events. Uses Helm primary green (not emerald/sky/indigo).
 *
 * Schedule-imported events are identified by their `description` starting with
 * `__schedule_import__` (written by the `importSchedule` server action).
 */
export function GameSourceChip() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-micro font-semibold tracking-wide bg-primary-50 text-primary-700 border border-primary-200"
      aria-label="Schedule import"
    >
      <span
        className="w-1.5 h-1.5 rounded-full bg-primary-500 flex-shrink-0"
        aria-hidden="true"
      />
      Game
    </span>
  );
}

/**
 * Return true when a CalendarEvent was created by the `importSchedule` server
 * action. The action encodes its origin in `description` with the prefix
 * `__schedule_import__` so no schema column is needed.
 */
export function isScheduleImportedEvent(event: CalendarEvent): boolean {
  return (
    event.event_type === 'game' &&
    typeof event.description === 'string' &&
    event.description.startsWith('__schedule_import__')
  );
}

/**
 * Strip the internal schedule-import prefix from a description so it is never
 * shown raw to users.
 */
export function getDisplayDescription(event: CalendarEvent): string | null {
  if (!event.description) return null;
  if (event.description.startsWith('__schedule_import__')) {
    const rest = event.description.slice('__schedule_import__'.length).trim();
    return rest || null;
  }
  return event.description;
}

// ── Wrapper component ──────────────────────────────────────────────────────────

export function BaseballCalendarWrapper({
  initialEvents,
  teamMembers,
  teamId,
  isCoach = true,
  currentUserId,
  loading = false,
}: BaseballCalendarWrapperProps) {
  if (loading) {
    return <BaseballCalendarSkeleton />;
  }

  return (
    <PremiumCalendarClient
      initialEvents={initialEvents}
      teamMembers={teamMembers}
      teamId={teamId ?? undefined}
      isCoach={isCoach}
      currentUserId={currentUserId}
      actionHandlers={baseballActionHandlers}
      capabilities={BASEBALL_CALENDAR_CAPABILITIES}
    />
  );
}

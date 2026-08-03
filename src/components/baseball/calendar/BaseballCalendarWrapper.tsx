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
import { toast } from '@/components/ui/sonner';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import { PaperCard } from '@/components/baseball/living-annual';

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
  // #1263 — exactly the case the comment above describes. The per-event
  // Documents panel reads golf_event_documents joined to golf_documents, and
  // its write is fenced by an FK to golf_events plus a same-team trigger, so on
  // a baseball event the list was permanently empty and the coach's "Attach
  // document" picker could never be populated or saved. golf_event_documents
  // has 0 rows, consistent with nobody ever having got anything out of it.
  // Baseball has its own documents surface (baseball_documents); making this
  // section sport-aware is a product call, not a bug fix.
  eventDocuments: false,
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
  /**
   * The event row itself can succeed while a secondary, best-effort write
   * (RSVP invites, the linked `baseball_games` row) fails — `createBaseballEvent`
   * surfaces that as `result.warning` on an otherwise `success: true` result
   * (see `ActionResult` in `@/app/baseball/actions/calendar`). The shared
   * `PremiumCalendarClient` only branches on `result.success`, so it never
   * looks at `.warning` — this non-blocking toast is the only place that gap
   * gets surfaced to the coach. The result is returned unchanged so the rest
   * of the save flow (closing the modal, `router.refresh()`) is untouched.
   */
  createEvent: async (data: unknown) => {
    const result = await createBaseballEvent(data as Parameters<typeof createBaseballEvent>[0]);
    if (result.success && result.warning) {
      toast.warning('Event created', { description: result.warning });
    }
    return result;
  },
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
function BaseballCalendarSkeleton() {
  return (
    <PaperCard
      className="flex flex-col h-full w-full"
      grain={false}
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
    </PaperCard>
  );
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

'use client';

import surfaces from './CalendarSurfaces.module.css';

/**
 * Event details with role-specific actions and persistent RSVP confirmation.
 *
 * Rebuilt per docs/design/fairway-facelift/screens/calendar.mobile.md
 * ("CONTAINERS TO REMOVE / MERGE" item 5) as the frost bottom sheet: header
 * (type pill + overflow, title, time) -> Your response (one InsetGroup,
 * player only) -> metadata InsetGroup (owner / location / notes / linked
 * trip) -> response StatMatrix (coach) -> People InsetGroup -> Files
 * InsetGroup -> Attendance row -> sticky Sheet.Footer CTA. Destructive
 * actions live in the anchored `EventActionsMenu` "More" menu, not inline.
 * Desktop (>=1024px) renders as a right-side inspector; mobile renders the
 * frost bottom sheet — both are the SAME `Sheet`, just a different `side`
 * (+ `material`), so every section below is identical on both.
 */

import * as React from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  Check,
  X,
  MapPin,
  Clock,
  ExternalLink,
  Pencil,
  Lock,
  CalendarClock,
  Plane,
  ArrowRight,
  UserRound,
  ClipboardCheck,
  AlignLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, Button, StatusPill, InsetGroup } from '@/components/fairway';
import type { SheetSide } from '@/components/fairway';
import { StatMatrix } from '@/components/fairway/modules';
import { useMediaQuery } from '@/hooks/use-media-query';
import { fwHaptic } from '@/lib/fairway/haptics';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import type { RSVPStatus, RsvpRespondResult } from '@/hooks/useRSVP';
import { rsvpLockMessage } from '@/hooks/useRSVP';
import { getItineraryForEvent } from '@/app/golf/actions/travel';
import { formatEventTime, formatEventDateLabel } from '@/lib/calendar/timezone';
import { stripClassTag } from '@/lib/calendar/class-events';
import { typeMeta } from './eventPresentation';
import { EventPeopleSection, type EventAttendee } from './detail/EventPeopleSection';
import { EventActionsMenu } from './detail/EventActionsMenu';
import { EventFilesSection } from './files/EventFilesSection';
import { CalendarAttendanceScreen } from './attendance/CalendarAttendanceScreen';

/** One hour, in ms — the window before an event's start at which the
 * Attendance entry becomes the prominent (primary-styled) action for a
 * coach, per SCREEN-BUILD-PLAN §2.10. Never affects server permissions. */
const ATTENDANCE_PROMINENT_WINDOW_MS = 60 * 60 * 1000;

/** Upper bound of the sheet's open transition (brief §motion: 240–320 ms for
 *  sheets) — after this the heavy sections mount even if no animationend
 *  event ever arrived. */
const SETTLE_FALLBACK_MS = 360;

/** Anchor-only attributes threaded onto an `InsetGroup.Row` when it renders
 *  as `as="a"`. `InsetGroupRowProps` doesn't declare `target`/`rel` (it only
 *  types the generic `HTMLAttributes<HTMLElement>` + its own `href`) — kept
 *  as a typed, spread-in object rather than inline JSX attributes so the
 *  extra anchor props reach the rendered `<a>` without an excess-property
 *  error against that narrower prop type. */
const EXTERNAL_LINK_PROPS: React.AnchorHTMLAttributes<HTMLAnchorElement> = {
  target: '_blank',
  rel: 'noopener noreferrer',
};

const RSVP_OPTIONS: Array<{
  value: RSVPStatus;
  label: string;
  icon: React.ReactNode;
}> = [
  { value: 'accepted', label: 'Going', icon: <Check className="h-4 w-4" aria-hidden /> },
  { value: 'tentative', label: 'Maybe', icon: <CalendarClock className="h-4 w-4" aria-hidden /> },
  { value: 'declined', label: 'Decline', icon: <X className="h-4 w-4" aria-hidden /> },
];

export interface FairwayEventDetailDrawerProps {
  event: CalendarEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** True when the viewer is a coach (read-only summary, no RSVP CTA). */
  isCoach: boolean;
  /** Player's own RSVP status — highlights the selected button. */
  rsvpStatus?: RSVPStatus | null;
  /** Coach view: read-only counts. ZERO is rendered as 0, never hidden. */
  rsvpSummary?: {
    accepted: number;
    declined: number;
    tentative: number;
    pending: number;
    total: number;
  } | null;
  /**
   * Coach view: the attendee list from the SAME `getEventRSVP` call that
   * produced `rsvpSummary`, so the People section never fetches it a second
   * time. `null` while that call is in flight; omit it (player view, or the
   * orchestrator's fetch failed) and the People section fetches for itself.
   */
  attendees?: EventAttendee[] | null;
  /** Player RSVP submit (the EXISTING respondToEvent action, via the parent). */
  onRespond?: (eventId: string, status: RSVPStatus) => Promise<RsvpRespondResult>;
  /** Coach view: opens the Fairway create/edit editor for this event. */
  onEdit?: (event: CalendarEvent) => void;
  /**
   * Team's canonical IANA timezone (golf_team_settings.timezone). The
   * start/end time render anchored to this zone — NOT the runtime's own
   * local zone — so the SAME event agrees with FairwayEventCard/agenda
   * (audit W1: cal-tz).
   */
  timezone?: string | null;
  /**
   * Destructive actions surfaced through the "More" menu (§2.10). Each is
   * OPTIONAL and independently gated: a handler not passed simply hides
   * that menu item rather than showing a fake/disabled affordance. None are
   * wired from the calendar orchestrator yet — see the handoff note in this
   * pass's summary for the integration this needs.
   */
  onCancelEvent?: (event: CalendarEvent) => Promise<{ success: boolean; error?: string }>;
  onRestoreEvent?: (event: CalendarEvent) => Promise<{ success: boolean; error?: string }>;
  onDeletePermanently?: (event: CalendarEvent) => Promise<{ success: boolean; error?: string }>;
}

/** Player-facing copy for the current response in locked states. */
const RSVP_STATUS_LABEL: Record<RSVPStatus, string> = {
  accepted: 'Going',
  tentative: 'Maybe',
  declined: 'Declined',
  pending: 'No response',
};

function mapsHref(location: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

function formatDateLine(event: CalendarEvent, timezone?: string | null): string {
  const start = event.start_time || event.start_date;
  if (!start) return '';
  if (event.all_day) {
    const startDay = format(new Date(`${start.slice(0, 10)}T12:00:00`), 'EEE, MMM d');
    const end = event.end_time || event.end_date;
    const endDay = end && end.slice(0, 10) !== start.slice(0, 10)
      ? ` – ${format(new Date(`${end.slice(0, 10)}T12:00:00`), 'EEE, MMM d')}` : '';
    return `${startDay}${endDay} · All day`;
  }
  const datePart = formatEventDateLabel(start, timezone);
  const startTime = formatEventTime(start, timezone);
  const end = event.end_time || event.end_date;
  if (!end || end === start) return `${datePart} · ${startTime}`;
  return `${datePart} · ${startTime} – ${formatEventTime(end, timezone)}`;
}

export function FairwayEventDetailDrawer({
  event,
  open,
  onOpenChange,
  isCoach,
  rsvpStatus,
  rsvpSummary,
  attendees,
  onRespond,
  onEdit,
  timezone,
  onCancelEvent,
  onRestoreEvent,
  onDeletePermanently,
}: FairwayEventDetailDrawerProps) {
  const [pendingStatus, setPendingStatus] = React.useState<RSVPStatus | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [savedResponse, setSavedResponse] = React.useState<RSVPStatus | null>(null);
  const responseRequest = React.useRef(0);
  // Calendar→travel cross-link (P440): the travel itinerary linked to this event,
  // looked up on open via the reverse join (golf_travel_itineraries.event_id).
  // null = no linked trip → the affordance stays hidden (honest).
  const [linkedTrip, setLinkedTrip] = React.useState<
    { id: string; event_name: string; destination: string } | null
  >(null);
  // S5 — the attendance screen (§2.10 "Attendance" section opens it).
  const [attendanceOpen, setAttendanceOpen] = React.useState(false);

  // §2.10: >=1024px renders the SAME Sheet as a right-side inspector instead
  // of a bottom sheet. `useMediaQuery` server-snapshots `false` (mobile-first,
  // see the hook's own doc comment), so SSR/first paint is always the bottom
  // sheet — correct, since the desktop grid it would sit beside isn't the one
  // rendering on a phone anyway.
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const side: SheetSide = isDesktop ? 'right' : 'bottom';

  // PERF: the People and Files lists (each a fetch + a list of rows) mount
  // only once the sheet has SETTLED, so the open translate animates a light
  // tree — header, response group, metadata. The Sheet reports the panel's
  // own animation end; the timer is the fallback for environments where no
  // animation runs (reduced motion, a non-animating test double) so the
  // sections never stay unmounted. Reset on every close.
  const [settled, setSettled] = React.useState(false);
  React.useEffect(() => {
    if (!open) {
      setSettled(false);
      return;
    }
    const id = window.setTimeout(() => setSettled(true), SETTLE_FALLBACK_MS);
    return () => window.clearTimeout(id);
  }, [open]);
  const onSheetAnimationEnd = React.useCallback((e: React.AnimationEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) setSettled(true);
  }, []);
  const sectionsActive = open && settled;

  React.useEffect(() => {
    responseRequest.current += 1;
    setPendingStatus(null);
    setSavedResponse(null);
    setError(null);
    setAttendanceOpen(false);
    return () => { responseRequest.current += 1; };
  }, [open, event?.id]);

  const eventId = event?.id;

  // Resolve the linked itinerary when the drawer opens for an event. Self-
  // contained (no orchestrator threading) + failure-silent — a lookup error or
  // unlinked event simply leaves `linkedTrip` null, so the link never asserts a
  // trip that isn't there.
  React.useEffect(() => {
    if (!open || !eventId) {
      setLinkedTrip(null);
      return;
    }
    let cancelled = false;
    setLinkedTrip(null);
    void (async () => {
      try {
        const res = await getItineraryForEvent(eventId);
        if (!cancelled) setLinkedTrip(res.success ? res.data ?? null : null);
      } catch {
        if (!cancelled) setLinkedTrip(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, eventId]);

  // The ONE event-type presentation table (eventPresentation.ts) — shared
  // with the agenda row and the month grid so a "qualifier" never disagrees
  // between screens (audit finding #5).
  const meta = typeMeta(event?.event_type);

  // ── RSVP gating (audit finding #16) ────────────────────────────────────────
  // The drawer previously rendered live RSVP buttons on past events, non-RSVP
  // events, and after the deadline. Recomputed per open so the snapshot is
  // fresh (the drawer only renders post-interaction — no hydration concern).
  const nowMs = Date.now();
  const isCancelled = event?.status === 'cancelled';
  const requiresRsvp = event?.requires_rsvp === true;
  const startMs = event ? new Date(event.start_time || event.start_date).getTime() : NaN;
  // Match updateRSVP: all-day storage uses UTC midnight and remains open
  // through its 24-hour grace window. Explicit deadlines still take effect.
  const lockMs = event?.all_day ? startMs + 24 * 60 * 60 * 1000 : startMs;
  const hasStarted = Number.isFinite(lockMs) && lockMs <= nowMs;
  const deadlineMs = event?.rsvp_deadline ? new Date(event.rsvp_deadline).getTime() : null;
  const deadlinePassed = deadlineMs !== null && deadlineMs < nowMs;
  const rsvpLocked = hasStarted || deadlinePassed || isCancelled;
  const lockReason = isCancelled
    ? 'This event has been cancelled.'
    : hasStarted
      ? 'RSVPs are locked — this event has already started.'
      : 'RSVPs are locked — the deadline has passed.';
  // Deadline rendered in the VIEWER's local timezone (new Date parses the
  // stored timestamptz; format() prints local wall-time).
  const deadlineLabel =
    deadlineMs !== null && Number.isFinite(deadlineMs) ? format(new Date(deadlineMs), "EEE, MMM d 'at' h:mm a") : null;

  // §2.10: the Attendance entry becomes the prominent (primary) action for a
  // coach starting one hour before the event's start — a visual affordance
  // only, never a server-permission change.
  const attendanceProminent =
    isCoach && Number.isFinite(startMs) && startMs - nowMs <= ATTENDANCE_PROMINENT_WINDOW_MS;
  // Whether the prominent case actually gets its own footer CTA — also
  // requires a team event (the Attendance screen needs `event.team_id`).
  const attendanceCta = attendanceProminent && Boolean(event?.team_id);

  const displayedResponse = savedResponse ?? rsvpStatus;
  const handleRespond = async (status: RSVPStatus) => {
    if (!onRespond || !event || pendingStatus !== null) return;
    const request = ++responseRequest.current;
    setPendingStatus(status);
    setError(null);
    setSavedResponse(null);
    try {
      const result = await onRespond(event.id, status);
      if (request !== responseRequest.current) return;
      if (!result.success) {
        setError(rsvpLockMessage(result.code, result.error ?? 'Could not save your response.'));
        return;
      }
      setSavedResponse(status);
    } catch {
      if (request === responseRequest.current) setError('Could not save your response. Try again.');
    } finally {
      if (request === responseRequest.current) setPendingStatus(null);
    }
  };

  // Plain `InsetGroup.Row as="button"` carries none of `Button`'s own
  // haptic — fire the selection tick by hand to keep parity with the
  // `PressTarget` row this replaced. NOT used for the footer CTA below,
  // which is a real `Button` and already fires its own (impact) haptic.
  const openAttendanceRow = () => {
    fwHaptic('selection');
    setAttendanceOpen(true);
  };
  const openAttendance = () => setAttendanceOpen(true);

  const showDock = isCoach && Boolean(onEdit);
  const showFooter = showDock || attendanceCta;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      side={side}
      // Frost is a bottom-sheet-only material (Sheet keeps docked sides
      // matte automatically) — the desktop right inspector is unaffected.
      material="frost"
      title={event?.title ?? 'Event'}
      hideTitle
      onAnimationEnd={onSheetAnimationEnd}
      className={cn(
        surfaces.scope,
        // The shell's own X is an absolute sibling after the body; lift it
        // over the sticky matte header so it stays tappable while scrolled.
        '[&>button[aria-label=Close]]:z-30',
        side === 'bottom'
          ? // NOT `surfaces.panel` here: that class paints a fully opaque
            // canvas background, which would completely hide the frost
            // blur underneath it. The frost tier's own background carries
            // the sheet's material on this side.
            'sm:mx-auto sm:max-w-xl'
          : cn('w-[400px] max-w-full', surfaces.inspector),
      )}
    >
      {event ? (
        <>
          <Sheet.Body className="flex flex-col px-0 py-0 first:pt-0 last:pb-0">
            {/* Sticky header — type pill (+ cancelled badge), title, date/time
                line, plus the anchored "More" menu for destructive actions
                (§2.10). Cancelled events render DISTINCTLY (badge + strike)
                instead of disappearing — soft-cancel lifecycle. Plain matte
                (bg-surface + hairline), never blurred: the header is not a
                floating element, and the sheet around it already is. */}
            <header
              className={cn(
                'sticky top-0 z-20 flex flex-col gap-2.5 border-b border-border-subtle bg-surface px-5 pb-4 pr-14 pt-5',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <StatusPill tone={meta.tone} size="sm" dot={false}>
                    {meta.label}
                  </StatusPill>
                  {isCancelled ? (
                    <StatusPill tone="danger" size="sm" dot={false}>
                      Cancelled
                    </StatusPill>
                  ) : null}
                </div>
                {isCoach ? (
                  <EventActionsMenu
                    event={event}
                    onCancelEvent={onCancelEvent}
                    onRestoreEvent={onRestoreEvent}
                    onDeletePermanently={onDeletePermanently}
                  />
                ) : null}
              </div>
              <h2
                className={cn(
                  'font-fw-display text-h2 font-medium tracking-[-0.005em] text-text-primary',
                  isCancelled && 'text-text-tertiary line-through decoration-2',
                )}
              >
                {event.title}
              </h2>
              <p className="flex items-center gap-1.5 font-fw-sans text-body-sm tabular-nums text-text-secondary">
                <Clock className="h-3.5 w-3.5 flex-shrink-0 text-accent-700" aria-hidden />
                <span>{formatDateLine(event, timezone)}</span>
              </p>
            </header>

            <div className={cn('flex flex-col gap-5 px-5 pt-4', showFooter ? 'pb-5' : 'pb-[max(1.5rem,env(safe-area-inset-bottom))]')}>
              {/* Player "Your response" — one InsetGroup, not a bordered card.
                  GATED: hidden for non-RSVP events; LOCKED (read-only) for
                  past / post-deadline / cancelled events (audit finding #16). */}
              {!isCoach && onRespond && requiresRsvp ? (
                <InsetGroup variant="inset" aria-label="Your response">
                  {rsvpLocked ? (
                    <InsetGroup.Row icon={<Lock aria-hidden />} align="start">
                      <p className="font-fw-sans text-body-sm font-medium text-text-primary">{lockReason}</p>
                      <p className="mt-0.5 font-fw-sans text-caption text-text-tertiary">
                        Your response: {displayedResponse ? RSVP_STATUS_LABEL[displayedResponse] : '—'}
                      </p>
                    </InsetGroup.Row>
                  ) : (
                    <InsetGroup.Row align="start" className="flex-col items-stretch gap-3 py-3">
                      <p className="font-fw-sans text-body-sm font-semibold text-text-primary">
                        Your response
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {RSVP_OPTIONS.map((opt) => {
                          const isSelected = displayedResponse === opt.value;
                          return (
                            <Button
                              key={opt.value}
                              type="button"
                              variant={isSelected ? 'primary' : 'secondary'}
                              size="md"
                              fullWidth
                              busy={pendingStatus === opt.value}
                              disabled={pendingStatus !== null}
                              aria-pressed={isSelected}
                              leftIcon={opt.icon}
                              onClick={() => handleRespond(opt.value)}
                            >
                              {opt.label}
                            </Button>
                          );
                        })}
                      </div>
                      {savedResponse ? (
                        <p role="status" className="flex items-center gap-1.5 font-fw-sans text-body-sm text-accent-700">
                          <Check className="h-4 w-4" aria-hidden />
                          Response saved · {RSVP_STATUS_LABEL[savedResponse]}
                        </p>
                      ) : null}
                      {deadlineLabel ? (
                        <p className="flex items-center gap-1.5 font-fw-sans text-caption text-text-tertiary">
                          <CalendarClock className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
                          <span suppressHydrationWarning>Respond by {deadlineLabel}</span>
                        </p>
                      ) : null}
                      {error ? (
                        <p className="font-fw-sans text-caption text-fw-danger-ink" role="alert">
                          {error}
                        </p>
                      ) : null}
                    </InsetGroup.Row>
                  )}
                </InsetGroup>
              ) : !isCoach && !requiresRsvp ? (
                // No response required — say so explicitly rather than leaving a
                // silent gap where the RSVP section would otherwise sit.
                <p className="font-fw-sans text-caption text-text-tertiary">
                  No response needed for this event.
                </p>
              ) : null}

              {/* Metadata — owner, location, notes, linked trip. Only rendered
                  when at least one applies (honest: no empty group). */}
              {(event.owner_label && event.owner_player_id) || event.location || stripClassTag(event.description) || linkedTrip ? (
                <InsetGroup variant="inset">
                  {/* Whose class this is. Only ever set on synced class meetings,
                      and the one place the FULL name is shown — the chips
                      elsewhere are abbreviated to fit. */}
                  {event.owner_label && event.owner_player_id ? (
                    <InsetGroup.Row icon={<UserRound aria-hidden />}>
                      <span className="truncate font-fw-sans text-body-sm font-medium text-text-primary">
                        {event.owner_label}
                      </span>
                    </InsetGroup.Row>
                  ) : null}

                  {/* Location — taps through to Maps. */}
                  {event.location ? (
                    <InsetGroup.Row
                      as="a"
                      href={mapsHref(event.location)}
                      {...EXTERNAL_LINK_PROPS}
                      aria-label={`Open ${event.location} in Google Maps (opens in a new tab)`}
                      icon={<MapPin aria-hidden />}
                      trailing={<ExternalLink aria-hidden />}
                    >
                      <span className="truncate font-fw-sans text-body-sm font-medium text-text-primary">
                        {event.location}
                      </span>
                    </InsetGroup.Row>
                  ) : null}

                  {/* Description. The `[class:<id>]` ownership marker is internal
                      plumbing, not prose — it was rendering verbatim to coaches
                      under a class's instructor and credits. */}
                  {stripClassTag(event.description) ? (
                    <InsetGroup.Row icon={<AlignLeft aria-hidden />} align="start">
                      <p className="whitespace-pre-wrap font-fw-sans text-body-sm leading-[1.5] text-text-secondary">
                        {stripClassTag(event.description)}
                      </p>
                    </InsetGroup.Row>
                  ) : null}

                  {/* Linked travel itinerary (P440) — only when this event has a
                      trip in golf_travel_itineraries pointing back at it. Deep-
                      links to the SPECIFIC trip (?trip=<id>) so Travel HQ auto-
                      selects it. Honest: hidden when the event has no linked trip. */}
                  {linkedTrip ? (
                    <InsetGroup.Row
                      as={Link}
                      href={`/golf/dashboard/travel?trip=${linkedTrip.id}`}
                      icon={<Plane aria-hidden />}
                      trailing={<ArrowRight aria-hidden />}
                    >
                      View itinerary:{' '}
                      <span className="font-medium text-text-primary">
                        {linkedTrip.destination || linkedTrip.event_name || 'travel itinerary'}
                      </span>
                    </InsetGroup.Row>
                  ) : null}
                </InsetGroup>
              ) : null}

              {/* Coach responses — one information object, not four cards.
                  Sits directly above the per-person People list below: one
                  summary, one roster, not two disconnected counts. */}
              {isCoach && rsvpSummary ? (
                <StatMatrix
                  label="Responses"
                  detail={`${rsvpSummary.total} invited`}
                  variant="inset"
                  items={[
                    { label: 'Accepted', value: rsvpSummary.accepted, tone: rsvpSummary.accepted > 0 ? 'accent' : 'neutral' },
                    { label: 'Maybe', value: rsvpSummary.tentative },
                    { label: 'No', value: rsvpSummary.declined },
                    { label: 'Pending', value: rsvpSummary.pending },
                  ]}
                />
              ) : null}

              {/* People — who is involved and their status (its own eyebrow +
                  InsetGroup, no wrapper card here). Mounts once the sheet has
                  settled; a coach's list arrives via `attendees`. */}
              <EventPeopleSection eventId={event.id} active={sectionsActive} attendees={attendees} />

              {/* Files (§2.6) — attach-from-library, count in the eyebrow.
                  Mounts once the sheet has settled. */}
              {event.team_id ? (
                <EventFilesSection
                  eventId={event.id}
                  teamId={event.team_id}
                  isCoach={isCoach}
                  active={sectionsActive}
                />
              ) : null}

              {/* Attendance (§2.5) — opens the dedicated screen. Prominent
                  (primary-styled) for a coach starting one hour before the
                  event's start becomes the Sheet.Footer CTA instead (below);
                  otherwise it is a quiet disclosure row here. Players see
                  their own recorded status only (S5 branches on the server's
                  `viewerIsCoach`/`viewerPlayerId`, never on this button). */}
              {event.team_id && !attendanceCta ? (
                <InsetGroup variant="inset">
                  <InsetGroup.Row
                    as="button"
                    icon={<ClipboardCheck aria-hidden />}
                    trailing={<ChevronRight aria-hidden />}
                    onClick={openAttendanceRow}
                  >
                    {isCoach ? 'Record attendance' : 'View my attendance'}
                  </InsetGroup.Row>
                </InsetGroup>
              ) : null}
            </div>
          </Sheet.Body>

          {/* Sticky CTA — the ONE primary action for a coach preparing the
              event. When Attendance is prominent (within the hour), it takes
              the primary slot and "Edit event" drops to secondary. */}
          {showFooter ? (
            <Sheet.Footer className="flex-col sm:flex-col">
              {attendanceCta ? (
                <Button
                  variant="primary"
                  size="lg"
                  shape="block"
                  fullWidth
                  leftIcon={<ClipboardCheck className="h-4 w-4" aria-hidden />}
                  onClick={openAttendance}
                >
                  {isCoach ? 'Record attendance' : 'View my attendance'}
                </Button>
              ) : null}
              {showDock && onEdit ? (
                <Button
                  variant={attendanceCta ? 'secondary' : 'primary'}
                  size="lg"
                  shape="block"
                  fullWidth
                  leftIcon={<Pencil className="h-4 w-4" aria-hidden />}
                  onClick={() => onEdit(event)}
                >
                  Edit event
                </Button>
              ) : null}
            </Sheet.Footer>
          ) : null}
        </>
      ) : null}

      {event?.team_id ? (
        <CalendarAttendanceScreen
          // Remounts the whole screen (and its useAttendanceDraft instance)
          // whenever the drawer is pointed at a different event. Without
          // this, switching events while the drawer stays open lets one
          // event's staged marks/search/selection survive into the next
          // event's roster — a coach's unsaved mark for a player on event A
          // could get saved against event B instead.
          key={event.id}
          open={attendanceOpen}
          onOpenChange={setAttendanceOpen}
          eventId={event.id}
          eventTitle={event.title}
          isCoach={isCoach}
        />
      ) : null}
    </Sheet>
  );
}

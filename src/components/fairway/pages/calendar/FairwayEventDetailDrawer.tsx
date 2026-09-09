'use client';

import surfaces from './CalendarSurfaces.module.css';

/**
 * Event details with role-specific actions and persistent RSVP confirmation.
 *
 * §18 section order (SCREEN-BUILD-PLAN §2.10): header -> response/Edit ->
 * location -> Description -> People -> Files -> Attendance (prominent for
 * coaches from one hour before start). History is omitted entirely — it is
 * gated on G2 (SCREEN-BUILD-PLAN §5) and has no honest content to show yet.
 * Destructive actions live in the anchored `EventActionsMenu` "More" menu,
 * not inline. Desktop (>=1024px) renders as a right-side inspector; mobile
 * keeps the bottom sheet — both are the SAME `Sheet`, just a different
 * `side`, so every section below is identical on both.
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, Inset, Readout, Button, StatusPill } from '@/components/fairway';
import type { FwStatusTone, SheetSide } from '@/components/fairway';
import { useMediaQuery } from '@/hooks/use-media-query';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import type { RSVPStatus, RsvpRespondResult } from '@/hooks/useRSVP';
import { rsvpLockMessage } from '@/hooks/useRSVP';
import { getItineraryForEvent } from '@/app/golf/actions/travel';
import { formatEventTime, formatEventDateLabel } from '@/lib/calendar/timezone';
import { stripClassTag } from '@/lib/calendar/class-events';
import { EventPeopleSection } from './detail/EventPeopleSection';
import { EventActionsMenu } from './detail/EventActionsMenu';
import { EventFilesSection } from './files/EventFilesSection';
import { CalendarAttendanceScreen } from './attendance/CalendarAttendanceScreen';

/** One hour, in ms — the window before an event's start at which the
 * Attendance entry becomes the prominent (primary-styled) action for a
 * coach, per SCREEN-BUILD-PLAN §2.10. Never affects server permissions. */
const ATTENDANCE_PROMINENT_WINDOW_MS = 60 * 60 * 1000;

const TYPE_META: Record<string, { label: string; tone: FwStatusTone }> = {
  practice: { label: 'Practice', tone: 'accent' },
  tournament: { label: 'Tournament', tone: 'warning' },
  qualifier: { label: 'Qualifier', tone: 'success' },
  qualifying: { label: 'Qualifier', tone: 'success' },
  travel: { label: 'Travel', tone: 'neutral' },
  workout: { label: 'Workout', tone: 'accent' },
  team_meeting: { label: 'Meeting', tone: 'neutral' },
  meeting: { label: 'Meeting', tone: 'neutral' },
  // Kept in step with FairwayEventCard's TYPE_META — this is a second copy of
  // that map, so a type added there and not here reads "Class" on the card and
  // "Event" in the drawer for the same event.
  class: { label: 'Class', tone: 'neutral' },
  other: { label: 'Event', tone: 'neutral' },
};

const RSVP_OPTIONS: Array<{
  value: RSVPStatus;
  label: string;
  icon?: React.ReactNode;
}> = [
  { value: 'accepted', label: 'Going', icon: <Check className="h-4 w-4" /> },
  { value: 'tentative', label: 'Maybe' },
  { value: 'declined', label: 'Decline', icon: <X className="h-4 w-4" /> },
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

  // Standalone non-optional fallback — TYPE_META.other is `| undefined` under
  // noUncheckedIndexedAccess, so it can't guarantee a non-undefined `meta`.
  const META_FALLBACK: { label: string; tone: FwStatusTone } = { label: 'Event', tone: 'neutral' };
  const meta = event
    ? TYPE_META[(event.event_type || 'other').toLowerCase()] ?? META_FALLBACK
    : META_FALLBACK;

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

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      side={side}
      title={event?.title ?? 'Event'}
      hideTitle
      className={cn(
        side === 'bottom' ? cn('sm:mx-auto sm:max-w-xl', surfaces.panel) : surfaces.inspector,
      )}
    >
      {event ? (
        <Sheet.Body className="flex flex-col gap-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          {/* Header — type pill (+ cancelled badge) + title + date/time line,
              plus the anchored "More" menu for destructive actions (§2.10).
              Cancelled events render DISTINCTLY (badge + strike) instead of
              disappearing — soft-cancel lifecycle. */}
          <div className={cn("flex flex-col gap-3 rounded-card p-5", surfaces.paper)}>
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
            <p className="flex items-center gap-1.5 font-fw-sans text-body-sm text-text-tertiary">
              <Clock className="h-3.5 w-3.5 flex-shrink-0 text-text-tertiary" aria-hidden />
              <span>{formatDateLine(event, timezone)}</span>
            </p>
          </div>

          {/* Coach: edit this event — moved up next to the header (finding
              #52), the primary action for a coach preparing the event
              (§18 "Event detail: progressive depth"). */}
          {isCoach && onEdit ? (
            <Button
              variant="primary"
              size="md"
              fullWidth
              leftIcon={<Pencil className="h-4 w-4" aria-hidden />}
              onClick={() => onEdit(event)}
            >
              Edit event
            </Button>
          ) : null}

          {/* Player RSVP — 3 Fairway Buttons wired to the existing respondToEvent.
              GATED: hidden for non-RSVP events; LOCKED (read-only) for past /
              post-deadline / cancelled events (audit finding #16). Sits in
              the same "response or Edit" slot as the coach's Edit button
              above (§2.10/§18 order: header, response-or-edit, location) —
              this was previously placed after location/owner_label, which
              pushed it below the fold on a 320px screen. */}
          {!isCoach && onRespond && requiresRsvp ? (
            rsvpLocked ? (
              <div className="rounded-fw-md bg-surface-sunken px-4 py-3">
                <p className="flex items-center gap-2 font-fw-sans text-body-sm font-medium text-text-secondary">
                  <Lock className="h-3.5 w-3.5 flex-shrink-0 text-text-tertiary" aria-hidden />
                  {lockReason}
                </p>
                <p className="mt-1.5 font-fw-sans text-caption text-text-tertiary">
                  Your response: {displayedResponse ? RSVP_STATUS_LABEL[displayedResponse] : '—'}
                </p>
              </div>
            ) : (
              <div>
                <p className="mb-2.5 font-fw-sans text-body-sm font-medium text-text-secondary">
                  Your response
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {RSVP_OPTIONS.map((opt) => {
                    const isSelected = displayedResponse === opt.value;
                    return (
                      <Button
                        key={opt.value}
                        variant={opt.value === 'accepted' ? 'primary' : 'secondary'}
                        size="md"
                        fullWidth
                        busy={pendingStatus === opt.value}
                        disabled={pendingStatus !== null}
                        aria-pressed={isSelected}
                        className={isSelected ? 'ring-2 ring-border-focus ring-offset-2 ring-offset-canvas' : undefined}
                        leftIcon={opt.icon}
                        onClick={() => handleRespond(opt.value)}
                      >
                        {opt.label}
                      </Button>
                    );
                  })}
                </div>
                {savedResponse ? (
                  <p role="status" className="mt-2.5 flex items-center gap-1.5 font-fw-sans text-body-sm text-accent-700">
                    <Check className="h-4 w-4" aria-hidden />
                    Response saved · {RSVP_STATUS_LABEL[savedResponse]}
                  </p>
                ) : null}
                {deadlineLabel ? (
                  <p className="mt-2.5 flex items-center gap-1.5 font-fw-sans text-caption text-text-tertiary">
                    <CalendarClock className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
                    <span suppressHydrationWarning>Respond by {deadlineLabel}</span>
                  </p>
                ) : null}
                {error ? (
                  <p className="mt-2.5 font-fw-sans text-caption text-fw-danger-ink" role="alert">
                    {error}
                  </p>
                ) : null}
              </div>
            )
          ) : !isCoach && !requiresRsvp ? (
            // No response required — say so explicitly rather than leaving a
            // silent gap where the RSVP section would otherwise sit.
            <p className="font-fw-sans text-caption text-text-tertiary">
              No response needed for this event.
            </p>
          ) : null}

          {/* Whose class this is. Only ever set on synced class meetings, and
              the one place the FULL name is shown — the chips elsewhere are
              abbreviated to fit. */}
          {event.owner_label && event.owner_player_id ? (
            <div className="flex items-center gap-2.5 rounded-fw-md bg-surface-sunken px-4 py-3">
              <UserRound className="h-5 w-5 shrink-0 text-text-tertiary" aria-hidden />
              <span className="truncate font-fw-sans text-body-sm font-medium text-text-primary">
                {event.owner_label}
              </span>
            </div>
          ) : null}

          {/* Location — taps through to Maps. */}
          {event.location ? (
            <a
              href={mapsHref(event.location)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${event.location} in Google Maps (opens in a new tab)`}
              className={cn(
                'flex items-center justify-between gap-3 rounded-fw-md bg-surface-sunken px-4 py-3',
                'outline-none transition-colors [transition-duration:180ms] hover:bg-surface-tint',
                'focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
              )}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <MapPin className="h-4 w-4 flex-shrink-0 text-text-tertiary" aria-hidden />
                <span className="truncate font-fw-sans text-body-sm font-medium text-text-primary">
                  {event.location}
                </span>
              </span>
              <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 text-text-tertiary" aria-hidden />
            </a>
          ) : null}

          {/* Description. The `[class:<id>]` ownership marker is internal
              plumbing, not prose — it was rendering verbatim to coaches under
              a class's instructor and credits. */}
          {stripClassTag(event.description) ? (
            <p className="whitespace-pre-wrap font-fw-sans text-body-sm leading-[1.5] text-text-secondary">
              {stripClassTag(event.description)}
            </p>
          ) : null}

          {/* Linked travel itinerary (P440) — only when this event has a trip in
              golf_travel_itineraries pointing back at it. Deep-links to the
              SPECIFIC trip (?trip=<id>) so Travel HQ auto-selects it, mirroring
              the reverse "View on calendar" affordance on FairwayTripDetail
              (which deep-links with ?event=<id>). Honest: hidden when the event
              has no linked trip. */}
          {linkedTrip ? (
            <Link
              href={`/golf/dashboard/travel?trip=${linkedTrip.id}`}
              className={cn(
                'group flex items-center gap-2.5 rounded-fw-md border border-border-subtle bg-surface-sunken px-3.5 py-2.5',
                'font-fw-sans text-body-sm text-text-secondary transition-colors hover:border-accent-500 hover:bg-surface',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40',
              )}
            >
              <Plane className="h-4 w-4 shrink-0 text-accent-700" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                View itinerary:{' '}
                <span className="font-medium text-text-primary">
                  {linkedTrip.destination || linkedTrip.event_name || 'travel itinerary'}
                </span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-accent-700" aria-hidden />
            </Link>
          ) : null}

          {/* Coach aggregate — 4 Readouts, tabular-nums, 0 rendered as 0.
              Sits directly above the per-person People list below: one
              summary, one roster, not two disconnected counts. */}
          {isCoach && rsvpSummary ? (
            <div>
              <p className="mb-2.5 font-fw-sans text-body-sm font-medium text-text-secondary">
                Responses · {rsvpSummary.total} invited
              </p>
              {/* 2-up on phone, 4-up from `sm`. Readout's label is
                  `uppercase tracking-[0.14em]`, so "ACCEPTED" / "PENDING"
                  need far more than the ~80px a 4-column grid leaves at
                  390pt: they spilled across their tiles and clipped at the
                  screen edge (owner device report, 2026-08-26). */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { label: 'Accepted', value: rsvpSummary.accepted },
                  { label: 'Maybe', value: rsvpSummary.tentative },
                  { label: 'No', value: rsvpSummary.declined },
                  { label: 'Pending', value: rsvpSummary.pending },
                ].map((stat) => (
                  <Inset key={stat.label} padding="sm" className="flex min-w-0 justify-center">
                    <Readout
                      value={stat.value}
                      format={{ maximumFractionDigits: 0 }}
                      label={stat.label}
                      size="sm"
                      state="live"
                      align="start"
                    />
                  </Inset>
                ))}
              </div>
            </div>
          ) : null}

          {/* People — who is involved and their status (§2.10, §18). */}
          <EventPeopleSection eventId={event.id} active={open} />

          {/* Files (§2.6) — attach-from-library, count in the heading. */}
          {event.team_id ? (
            <EventFilesSection
              eventId={event.id}
              teamId={event.team_id}
              isCoach={isCoach}
              active={open}
            />
          ) : null}

          {/* Attendance (§2.5) — opens the dedicated screen. Prominent
              (primary-styled) for a coach starting one hour before the
              event's start; a quiet secondary entry otherwise. Players see
              their own recorded status only (S5 branches on the server's
              `viewerIsCoach`/`viewerPlayerId`, never on this button). */}
          {event.team_id ? (
            <div>
              <p className="mb-2.5 font-fw-sans text-body-sm font-medium text-text-secondary">
                Attendance
              </p>
              <Button
                variant={attendanceProminent ? 'primary' : 'secondary'}
                size="md"
                fullWidth
                leftIcon={<ClipboardCheck className="h-4 w-4" aria-hidden />}
                onClick={() => setAttendanceOpen(true)}
              >
                {isCoach ? 'Record attendance' : 'View my attendance'}
              </Button>
            </div>
          ) : null}

        </Sheet.Body>
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

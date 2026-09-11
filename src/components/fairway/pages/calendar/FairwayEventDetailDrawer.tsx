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
  AlignLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, Button, PressTarget, StatusPill } from '@/components/fairway';
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

  /** Icon at the head of a detail row: a bare emerald glyph in a 32px
   *  alignment box (a cream disc on a cream card washes out; the accent is
   *  the drawer's one colour — owner, 2026-09-09), or a semantic-tone disc
   *  when the tone carries meaning. */
  const rowIcon = (Icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>, tint?: 'warning' | 'success') => (
    <span
      aria-hidden
      className={cn(
        'grid h-8 w-8 shrink-0 place-items-center rounded-full',
        tint === 'warning'
          ? 'bg-fw-warning-bg text-fw-warning-ink'
          : tint === 'success'
            ? 'bg-fw-success-bg text-fw-success-ink'
            : 'text-accent-700',
      )}
    >
      <Icon className="h-[18px] w-[18px]" aria-hidden />
    </span>
  );

  const showDock = isCoach && Boolean(onEdit);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      side={side}
      title={event?.title ?? 'Event'}
      hideTitle
      className={cn(
        surfaces.scope,
        // The shell's own X is an absolute sibling after the body; lift it
        // over the sticky glass header so it stays tappable while scrolled.
        '[&>button[aria-label=Close]]:z-30',
        side === 'bottom'
          ? cn('sm:mx-auto sm:max-w-xl', surfaces.panel)
          : cn('w-[400px] max-w-full', surfaces.inspector),
      )}
    >
      {event ? (
        <Sheet.Body className="flex flex-col px-0 py-0 first:pt-0 last:pb-0">
          {/* Sticky glass header — type pill (+ cancelled badge), title,
              date/time line, plus the anchored "More" menu for destructive
              actions (§2.10). Cancelled events render DISTINCTLY (badge +
              strike) instead of disappearing — soft-cancel lifecycle. The
              header stays pinned while the sections below scroll under it. */}
          <header
            className={cn(
              'sticky top-0 z-20 flex flex-col gap-2.5 border-b px-5 pb-4 pr-14 pt-5',
              'fw-glass-chrome',
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

          <div className={cn('flex flex-col gap-4 px-5 pt-4', showDock ? 'pb-4' : 'pb-[max(1.5rem,env(safe-area-inset-bottom))]')}>
          {/* Player RSVP — 3 large selectable cards wired to the existing
              respondToEvent. GATED: hidden for non-RSVP events; LOCKED
              (read-only) for past / post-deadline / cancelled events (audit
              finding #16). Sits directly under the header (§2.10/§18 order:
              header, response-or-edit, location). */}
          {!isCoach && onRespond && requiresRsvp ? (
            rsvpLocked ? (
              <div className={cn('flex items-center gap-3 rounded-card p-4', 'border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)]')}>
                {rowIcon(Lock)}
                <div className="min-w-0">
                  <p className="font-fw-sans text-body-sm font-medium text-text-primary">{lockReason}</p>
                  <p className="mt-0.5 font-fw-sans text-caption text-text-tertiary">
                    Your response: {displayedResponse ? RSVP_STATUS_LABEL[displayedResponse] : '—'}
                  </p>
                </div>
              </div>
            ) : (
              <div className={cn('flex flex-col gap-3 rounded-card p-4', 'border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)]')}>
                <p className="font-fw-sans text-body-sm font-semibold text-text-primary">
                  Your response
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {RSVP_OPTIONS.map((opt) => {
                    const isSelected = displayedResponse === opt.value;
                    const Icon = opt.value === 'accepted' ? Check : opt.value === 'declined' ? X : CalendarClock;
                    return (
                      <Button
                        key={opt.value}
                        variant="ghost"
                        size="md"
                        fullWidth
                        busy={pendingStatus === opt.value}
                        disabled={pendingStatus !== null}
                        aria-pressed={isSelected}
                        onClick={() => handleRespond(opt.value)}
                        className={cn(
                          'h-auto min-h-[84px] flex-col gap-2 rounded-fw-md px-2 py-3 font-fw-sans text-body-sm font-semibold',
                          'text-text-primary hover:bg-transparent hover:text-text-primary',
                          'border border-border-subtle bg-surface',
                          isSelected && 'ring-2 ring-accent-600 ring-offset-2 ring-offset-surface',
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            'grid h-8 w-8 place-items-center rounded-full',
                            isSelected ? 'bg-accent-650 text-text-on-accent' : 'text-text-secondary',
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
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
              </div>
            )
          ) : !isCoach && !requiresRsvp ? (
            // No response required — say so explicitly rather than leaving a
            // silent gap where the RSVP section would otherwise sit.
            <p className="font-fw-sans text-caption text-text-tertiary">
              No response needed for this event.
            </p>
          ) : null}

          {/* Details card — owner, location, description, linked trip. Each
              is a 44px row with a tinted icon disc; rows that navigate carry
              a chevron / external-link glyph. */}
          {(event.owner_label && event.owner_player_id) || event.location || stripClassTag(event.description) || linkedTrip ? (
            <div className={cn('flex flex-col rounded-card px-4 py-1', 'border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)]')}>
              {/* Whose class this is. Only ever set on synced class meetings,
                  and the one place the FULL name is shown — the chips
                  elsewhere are abbreviated to fit. */}
              {event.owner_label && event.owner_player_id ? (
                <div className="flex min-h-11 items-center gap-3 py-2">
                  {rowIcon(UserRound)}
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
                    'flex min-h-11 items-center justify-between gap-3 rounded-fw-md py-2',
                    'outline-none transition-colors [transition-duration:180ms] hover:text-accent-700',
                    'focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                  )}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    {rowIcon(MapPin)}
                    <span className="truncate font-fw-sans text-body-sm font-medium text-text-primary">
                      {event.location}
                    </span>
                  </span>
                  <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 text-text-tertiary" aria-hidden />
                </a>
              ) : null}

              {/* Description. The `[class:<id>]` ownership marker is internal
                  plumbing, not prose — it was rendering verbatim to coaches
                  under a class's instructor and credits. */}
              {stripClassTag(event.description) ? (
                <div className="flex items-start gap-3 py-2.5">
                  {rowIcon(AlignLeft)}
                  <p className="min-w-0 whitespace-pre-wrap pt-1.5 font-fw-sans text-body-sm leading-[1.5] text-text-secondary">
                    {stripClassTag(event.description)}
                  </p>
                </div>
              ) : null}

              {/* Linked travel itinerary (P440) — only when this event has a
                  trip in golf_travel_itineraries pointing back at it. Deep-
                  links to the SPECIFIC trip (?trip=<id>) so Travel HQ auto-
                  selects it. Honest: hidden when the event has no linked trip. */}
              {linkedTrip ? (
                <Link
                  href={`/golf/dashboard/travel?trip=${linkedTrip.id}`}
                  className={cn(
                    'group flex min-h-11 items-center gap-3 rounded-fw-md py-2',
                    'font-fw-sans text-body-sm text-text-secondary transition-colors hover:text-accent-700',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40',
                  )}
                >
                  {rowIcon(Plane)}
                  <span className="min-w-0 flex-1 truncate">
                    View itinerary:{' '}
                    <span className="font-medium text-text-primary">
                      {linkedTrip.destination || linkedTrip.event_name || 'travel itinerary'}
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-accent-700" aria-hidden />
                </Link>
              ) : null}
            </div>
          ) : null}

          {/* Coach aggregate — 4 Readouts, tabular-nums, 0 rendered as 0.
              Sits directly above the per-person People list below: one
              summary, one roster, not two disconnected counts. */}
          {isCoach && rsvpSummary ? (
            <div className={cn('flex flex-col gap-3 rounded-card p-4', 'border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)]')}>
              <div className="flex items-center gap-3">
                {rowIcon(ClipboardCheck)}
                <p className="font-fw-sans text-body-sm font-semibold text-text-primary">
                  Responses · {rsvpSummary.total} invited
                </p>
              </div>
              {/* One centred stat strip: figure over label, hairline dividers.
                  Not four sunken tiles — cream on cream washed out and the
                  left-aligned figures read off-centre (owner, 2026-09-09). */}
              <dl className="grid grid-cols-4 divide-x divide-border-subtle">
                {[
                  { label: 'Accepted', value: rsvpSummary.accepted, accent: true },
                  { label: 'Maybe', value: rsvpSummary.tentative, accent: false },
                  { label: 'No', value: rsvpSummary.declined, accent: false },
                  { label: 'Pending', value: rsvpSummary.pending, accent: false },
                ].map((stat) => (
                  <div key={stat.label} className="flex min-w-0 flex-col items-center gap-0.5 px-1 py-1 text-center">
                    <dd
                      className={cn(
                        'font-fw-sans text-h3 font-semibold tabular-nums leading-none',
                        // The accepted count is the figure that matters; it carries the accent.
                        stat.accent && stat.value > 0 ? 'text-accent-700' : 'text-text-primary',
                      )}
                    >
                      {stat.value}
                    </dd>
                    <dt className="truncate font-fw-sans text-caption font-medium text-text-secondary">{stat.label}</dt>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          {/* People — who is involved and their status (§2.10, §18). */}
          <div className={cn('rounded-card p-4', 'border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)]')}>
            <EventPeopleSection eventId={event.id} active={open} />
          </div>

          {/* Files (§2.6) — attach-from-library, count in the heading. */}
          {event.team_id ? (
            <div className={cn('rounded-card p-4', 'border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)]')}>
              <EventFilesSection
                eventId={event.id}
                teamId={event.team_id}
                isCoach={isCoach}
                active={open}
              />
            </div>
          ) : null}

          {/* Attendance (§2.5) — opens the dedicated screen. Prominent
              (primary-styled) for a coach starting one hour before the
              event's start; a quiet row otherwise. Players see their own
              recorded status only (S5 branches on the server's
              `viewerIsCoach`/`viewerPlayerId`, never on this button). */}
          {event.team_id ? (
            attendanceProminent ? (
              // A labeled action: the shared Button, nothing reaching into it.
              <Button
                variant="primary"
                size="lg"
                fullWidth
                leftIcon={<ClipboardCheck className="h-4 w-4" aria-hidden />}
                onClick={() => setAttendanceOpen(true)}
              >
                {isCoach ? 'Record attendance' : 'View my attendance'}
              </Button>
            ) : (
              // A quiet disclosure row: the unstyled pressable with its own layout.
              <PressTarget
                onClick={() => setAttendanceOpen(true)}
                className="flex min-h-[60px] w-full items-center gap-3 rounded-card border border-border-subtle bg-surface px-4 py-3 text-left font-fw-sans text-body-sm font-semibold text-text-primary [box-shadow:var(--fw-shadow-card)] hover:bg-surface-sunken"
              >
                {rowIcon(ClipboardCheck)}
                <span className="min-w-0 flex-1">{isCoach ? 'Record attendance' : 'View my attendance'}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden />
              </PressTarget>
            )
          ) : null}
          </div>

          {/* Coach dock — the ONE primary action for a coach preparing the
              event (§18 "Event detail: progressive depth"). Pinned to the
              bottom of the sheet so it never scrolls away. */}
          {showDock && onEdit ? (
            <div
              className={cn(
                'sticky bottom-0 z-20 mt-auto flex border-t px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:justify-end',
                'fw-glass-chrome',
              )}
            >
              <Button
                variant="primary"
                size="lg"
                fullWidth
                leftIcon={<Pencil className="h-4 w-4" aria-hidden />}
                onClick={() => onEdit(event)}
                className={'sm:w-auto'}
              >
                Edit event
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

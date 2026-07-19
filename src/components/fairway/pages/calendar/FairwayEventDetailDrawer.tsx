'use client';

/**
 * ============================================================================
 * Fairway · Calendar · FairwayEventDetailDrawer
 * ----------------------------------------------------------------------------
 * The Fairway re-skin of the legacy `editorial/EventDetailDrawer` — a Fairway
 * Sheet (bottom, vaul-backed) for event detail. Tap a FairwayEventCard → this
 * opens. Pure SHELL re-skin: it does NOT own create/edit/delete (that stays in
 * the legacy EventDetailModal behind the grid). It only reads RSVP context and
 * lets the player respond via the EXISTING `respondToEvent` action (handed in
 * as `onRespond` from the orchestrator).
 *
 * Coach → read-only attendance summary as 4 Readouts (accepted / maybe / no /
 *   pending), tabular-nums, REAL counts. ZERO is rendered as 0 — never hidden.
 * Player → 3 Fairway Buttons (Going accent / Maybe warning / Decline danger)
 *   wired to the existing respondToEvent → updateRSVP write path.
 *
 * Token-only: Sheet (bg-elevated), Inset, Readout, Button, text-text-*, font-fw-*.
 * NO bg-white, NO serif, NO glass.
 * ========================================================================== */

import * as React from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { format } from 'date-fns';
import { Check, X, MapPin, Clock, ExternalLink, Pencil, Lock, CalendarClock, Plane, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, Inset, Readout, Button, StatusPill, Skeleton } from '@/components/fairway';
import type { FwStatusTone } from '@/components/fairway';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import type { RSVPStatus, RsvpRespondResult } from '@/hooks/useRSVP';
import { rsvpLockMessage } from '@/hooks/useRSVP';
import { getItineraryForEvent } from '@/app/golf/actions/travel';
import { formatEventTime, formatEventDateLabel } from '@/lib/calendar/timezone';

// Coach-only roll-call panel — code-split so players never download it.
const AttendancePanel = dynamic(
  () =>
    import('@/components/golf/calendar/AttendancePanel').then((m) => m.AttendancePanel),
  {
    loading: () => (
      <Skeleton className="h-24 rounded-fw-md" aria-hidden />
    ),
  },
);

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

const RSVP_OPTIONS: Array<{
  value: RSVPStatus;
  label: string;
  variant: 'primary' | 'secondary' | 'danger';
  icon?: React.ReactNode;
}> = [
  { value: 'accepted', label: 'Going', variant: 'primary', icon: <Check className="h-4 w-4" /> },
  { value: 'tentative', label: 'Maybe', variant: 'secondary' },
  { value: 'declined', label: 'Decline', variant: 'danger', icon: <X className="h-4 w-4" /> },
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
  const datePart = formatEventDateLabel(start, timezone);
  if (event.all_day) return `${datePart} · All day`;
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
}: FairwayEventDetailDrawerProps) {
  const [pendingStatus, setPendingStatus] = React.useState<RSVPStatus | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  // Calendar→travel cross-link (P440): the travel itinerary linked to this event,
  // looked up on open via the reverse join (golf_travel_itineraries.event_id).
  // null = no linked trip → the affordance stays hidden (honest).
  const [linkedTrip, setLinkedTrip] = React.useState<
    { id: string; event_name: string; destination: string } | null
  >(null);

  React.useEffect(() => {
    if (!open) {
      setPendingStatus(null);
      setError(null);
    }
  }, [open]);

  // Resolve the linked itinerary when the drawer opens for an event. Self-
  // contained (no orchestrator threading) + failure-silent — a lookup error or
  // unlinked event simply leaves `linkedTrip` null, so the link never asserts a
  // trip that isn't there.
  React.useEffect(() => {
    if (!open || !event) {
      setLinkedTrip(null);
      return;
    }
    let cancelled = false;
    const eventId = event.id;
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
  }, [open, event]);

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
  const hasStarted = Number.isFinite(startMs) && startMs <= nowMs;
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
    deadlineMs !== null ? format(new Date(deadlineMs), "EEE, MMM d 'at' h:mm a") : null;

  const handleRespond = async (status: RSVPStatus) => {
    if (!onRespond || !event) return;
    setPendingStatus(status);
    setError(null);
    const result = await onRespond(event.id, status);
    setPendingStatus(null);
    if (!result.success) {
      // Typed lock codes get specific copy; anything else falls back to the
      // server's error string.
      setError(rsvpLockMessage(result.code, result.error ?? 'Could not save your response.'));
      return;
    }
    // Soft close — let the user register the new state for a beat.
    setTimeout(() => onOpenChange(false), 240);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      side="bottom"
      title={event?.title ?? 'Event'}
      hideTitle
      className="sm:mx-auto sm:max-w-xl"
    >
      {event ? (
        <Sheet.Body className="flex flex-col gap-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          {/* Header — type pill (+ cancelled badge) + title + date/time line.
              Cancelled events render DISTINCTLY (badge + strike) instead of
              disappearing — soft-cancel lifecycle. */}
          <div className="flex flex-col gap-2">
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
              #52). A long roster in AttendancePanel below could push this
              action below the fold on a coach's first scroll, so it no
              longer waits at the very bottom of the drawer's content. */}
          {isCoach && onEdit ? (
            <Button
              variant="secondary"
              size="md"
              fullWidth
              leftIcon={<Pencil className="h-4 w-4" aria-hidden />}
              onClick={() => onEdit(event)}
            >
              Edit event
            </Button>
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

          {/* Description. */}
          {event.description ? (
            <p className="whitespace-pre-wrap font-fw-sans text-body-sm leading-[1.5] text-text-secondary">
              {event.description}
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

          {/* Coach attendance — 4 Readouts, tabular-nums, 0 rendered as 0. */}
          {isCoach && rsvpSummary ? (
            <div>
              <p className="mb-2.5 font-fw-display text-eyebrow uppercase tracking-[0.12em] text-text-tertiary">
                Attendance
              </p>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Accepted', value: rsvpSummary.accepted },
                  { label: 'Maybe', value: rsvpSummary.tentative },
                  { label: 'No', value: rsvpSummary.declined },
                  { label: 'Pending', value: rsvpSummary.pending },
                ].map((stat) => (
                  <Inset key={stat.label} padding="sm" className="flex justify-center">
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

          {/* Coach roll-call — full invitee roster with RSVP + check-in marks.
              (AttendancePanel contract: { eventId, teamId, canManage }.) */}
          {isCoach && event.team_id ? (
            <AttendancePanel eventId={event.id} teamId={event.team_id} canManage />
          ) : null}

          {/* Player RSVP — 3 Fairway Buttons wired to the existing respondToEvent.
              GATED: hidden for non-RSVP events; LOCKED (read-only) for past /
              post-deadline / cancelled events (audit finding #16). */}
          {!isCoach && onRespond && requiresRsvp ? (
            rsvpLocked ? (
              <div className="rounded-fw-md bg-surface-sunken px-4 py-3">
                <p className="flex items-center gap-2 font-fw-sans text-body-sm font-medium text-text-secondary">
                  <Lock className="h-3.5 w-3.5 flex-shrink-0 text-text-tertiary" aria-hidden />
                  {lockReason}
                </p>
                <p className="mt-1.5 font-fw-sans text-caption text-text-tertiary">
                  Your response: {rsvpStatus ? RSVP_STATUS_LABEL[rsvpStatus] : '—'}
                </p>
              </div>
            ) : (
              <div>
                <p className="mb-2.5 font-fw-display text-eyebrow uppercase tracking-[0.12em] text-text-tertiary">
                  Your response
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {RSVP_OPTIONS.map((opt) => {
                    const isSelected = rsvpStatus === opt.value;
                    return (
                      <Button
                        key={opt.value}
                        variant={isSelected ? opt.variant : 'secondary'}
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
                {deadlineLabel ? (
                  <p className="mt-2.5 flex items-center gap-1.5 font-fw-sans text-caption text-text-tertiary">
                    <CalendarClock className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
                    <span suppressHydrationWarning>Respond by {deadlineLabel}</span>
                  </p>
                ) : null}
                {error ? (
                  <p className="mt-2.5 font-fw-sans text-caption text-fw-danger" role="alert">
                    {error}
                  </p>
                ) : null}
              </div>
            )
          ) : null}
        </Sheet.Body>
      ) : null}
    </Sheet>
  );
}

export default FairwayEventDetailDrawer;

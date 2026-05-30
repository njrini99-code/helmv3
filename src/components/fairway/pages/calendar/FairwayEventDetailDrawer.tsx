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
import { format } from 'date-fns';
import { Check, X, MapPin, Clock, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, Inset, Readout, Button, StatusPill } from '@/components/fairway';
import type { FwStatusTone } from '@/components/fairway';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import type { RSVPStatus } from '@/hooks/useRSVP';

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
  onRespond?: (eventId: string, status: RSVPStatus) => Promise<{ success: boolean; error?: string }>;
}

function mapsHref(location: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

function formatDateLine(event: CalendarEvent): string {
  const start = event.start_time || event.start_date;
  if (!start) return '';
  const startDate = new Date(start);
  const datePart = format(startDate, 'EEEE, MMMM d');
  if (event.all_day) return `${datePart} · All day`;
  const startTime = format(startDate, 'h:mm a');
  const end = event.end_time || event.end_date;
  if (!end || end === start) return `${datePart} · ${startTime}`;
  return `${datePart} · ${startTime} – ${format(new Date(end), 'h:mm a')}`;
}

export function FairwayEventDetailDrawer({
  event,
  open,
  onOpenChange,
  isCoach,
  rsvpStatus,
  rsvpSummary,
  onRespond,
}: FairwayEventDetailDrawerProps) {
  const [pendingStatus, setPendingStatus] = React.useState<RSVPStatus | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setPendingStatus(null);
      setError(null);
    }
  }, [open]);

  // Standalone non-optional fallback — TYPE_META.other is `| undefined` under
  // noUncheckedIndexedAccess, so it can't guarantee a non-undefined `meta`.
  const META_FALLBACK: { label: string; tone: FwStatusTone } = { label: 'Event', tone: 'neutral' };
  const meta = event
    ? TYPE_META[(event.event_type || 'other').toLowerCase()] ?? META_FALLBACK
    : META_FALLBACK;

  const handleRespond = async (status: RSVPStatus) => {
    if (!onRespond || !event) return;
    setPendingStatus(status);
    setError(null);
    const result = await onRespond(event.id, status);
    setPendingStatus(null);
    if (!result.success) {
      setError(result.error ?? 'Could not save your response.');
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
          {/* Header — type pill + title + date/time line. */}
          <div className="flex flex-col gap-2">
            <StatusPill tone={meta.tone} size="sm" dot={false}>
              {meta.label}
            </StatusPill>
            <h2 className="font-fw-display text-h2 font-medium tracking-[-0.005em] text-text-primary">
              {event.title}
            </h2>
            <p className="flex items-center gap-1.5 font-fw-sans text-body-sm text-text-tertiary">
              <Clock className="h-3.5 w-3.5 flex-shrink-0 text-text-tertiary" aria-hidden />
              <span suppressHydrationWarning>{formatDateLine(event)}</span>
            </p>
          </div>

          {/* Location — taps through to Maps. */}
          {event.location ? (
            <a
              href={mapsHref(event.location)}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'flex items-center justify-between gap-3 rounded-fw-md bg-surface-sunken px-4 py-3',
                'outline-none transition-colors duration-[180ms] hover:bg-surface-tint',
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

          {/* Player RSVP — 3 Fairway Buttons wired to the existing respondToEvent. */}
          {!isCoach && onRespond ? (
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
              {error ? (
                <p className="mt-2.5 font-fw-sans text-caption text-fw-danger">{error}</p>
              ) : null}
            </div>
          ) : null}
        </Sheet.Body>
      ) : null}
    </Sheet>
  );
}

export default FairwayEventDetailDrawer;

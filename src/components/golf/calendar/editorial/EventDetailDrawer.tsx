'use client';

/**
 * EventDetailDrawer — vaul-backed bottom sheet for event detail.
 *
 * Tap an EventChip → this opens. Pulls the user's own RSVP status (player)
 * or a coach RSVP summary, lets the player respond, and opens the location
 * in Maps when tapped. RSVP action is the existing `respondToEvent` server
 * action — we re-import it lazily to keep the chip lean.
 *
 * For coaches we show a read-only attendance summary (tap counts to open the
 * full edit modal — that responsibility stays with EventDetailModal).
 */

import * as React from 'react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/utils/capacitor';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from '@/components/ui/drawer';
import { IconCheck, IconX, IconMapPin, IconClock, IconExternalLink } from '@/components/icons';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import type { RSVPStatus } from '@/hooks/useRSVP';

// Same color/label vocabulary as EventChip — kept in sync intentionally.
const TYPE_RAIL_CLASS: Record<string, string> = {
  practice: 'bg-sage-500',
  tournament: 'bg-helm-amber',
  qualifier: 'bg-primary-500',
  qualifying: 'bg-primary-500',
  travel: 'bg-warm-700',
  team_meeting: 'bg-warm-500',
  meeting: 'bg-warm-500',
};
const DEFAULT_RAIL_CLASS = 'bg-warm-400';

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

interface EventDetailDrawerProps {
  event: CalendarEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** True when the viewer is a coach (suppresses RSVP CTA, shows summary). */
  isCoach: boolean;
  /** Player's own RSVP status — drives selected CTA highlighting. */
  rsvpStatus?: RSVPStatus | null;
  /** Coach view: read-only counts. */
  rsvpSummary?: {
    accepted: number;
    declined: number;
    tentative: number;
    pending: number;
    total: number;
  } | null;
  /** Player RSVP submit. Returns success flag for inline feedback. */
  onRespond?: (eventId: string, status: RSVPStatus) => Promise<{ success: boolean; error?: string }>;
  /** "Edit details" affordance for coaches — opens the existing detail modal. */
  onEdit?: (event: CalendarEvent) => void;
}

const RSVP_OPTIONS: Array<{ value: RSVPStatus; label: string; tone: 'primary' | 'amber' | 'rose' }> = [
  { value: 'accepted', label: 'Going', tone: 'primary' },
  { value: 'tentative', label: 'Maybe', tone: 'amber' },
  { value: 'declined', label: 'Decline', tone: 'rose' },
];

function mapsHref(location: string): string {
  const q = encodeURIComponent(location);
  // iOS handles maps: schemes; the universal Google Maps URL works everywhere.
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
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
  const endTime = format(new Date(end), 'h:mm a');
  return `${datePart} · ${startTime} – ${endTime}`;
}

export function EventDetailDrawer({
  event,
  open,
  onOpenChange,
  isCoach,
  rsvpStatus,
  rsvpSummary,
  onRespond,
  onEdit,
}: EventDetailDrawerProps) {
  const [pendingStatus, setPendingStatus] = React.useState<RSVPStatus | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Reset transient state on open/close.
  React.useEffect(() => {
    if (!open) {
      setPendingStatus(null);
      setError(null);
    }
  }, [open]);

  if (!event) return null;

  const type = (event.event_type || 'other').toLowerCase();
  const railClass = TYPE_RAIL_CLASS[type] ?? DEFAULT_RAIL_CLASS;
  const typeLabel = TYPE_LABEL[type] ?? TYPE_LABEL.other;

  const handleRespond = async (status: RSVPStatus) => {
    if (!onRespond) return;
    setPendingStatus(status);
    setError(null);
    void triggerHaptic('light');
    const result = await onRespond(event.id, status);
    setPendingStatus(null);
    if (!result.success) {
      setError(result.error ?? 'Could not save your response.');
      return;
    }
    // Soft close — let the user see the new state for a beat.
    setTimeout(() => onOpenChange(false), 240);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="sm:max-w-xl sm:mx-auto">
        <DrawerHeader>
          {/* Eyebrow strip — type label + accent dot. */}
          <div className="flex items-center gap-2 mb-1">
            <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', railClass)} />
            <span className="font-serif uppercase text-[11px] tracking-[0.16em] text-warm-500">
              {typeLabel}
            </span>
          </div>
          <DrawerTitle>{event.title}</DrawerTitle>
          <p className="text-[13px] text-warm-500 leading-relaxed mt-1.5 flex items-center gap-1.5">
            <IconClock size={13} className="flex-shrink-0 text-warm-400" />
            <span>{formatDateLine(event)}</span>
          </p>
        </DrawerHeader>

        <div className="px-6 pb-2 space-y-5">
          {/* Location row — taps through to Maps. */}
          {event.location && (
            <a
              href={mapsHref(event.location)}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'flex items-center justify-between gap-3 rounded-2xl',
                'bg-cream-100/55 border border-warm-200/55 px-4 py-3',
                'transition-colors duration-200 hover:bg-cream-100/85',
              )}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <IconMapPin size={16} className="flex-shrink-0 text-warm-500" />
                <span className="text-[14px] text-warm-900 font-medium truncate">{event.location}</span>
              </span>
              <IconExternalLink size={14} className="flex-shrink-0 text-warm-400" />
            </a>
          )}

          {/* Description — only when present. */}
          {event.description && (
            <p className="text-[14px] leading-[1.55] text-warm-700 whitespace-pre-wrap">
              {event.description}
            </p>
          )}

          {/* Coach summary — read-only counts. */}
          {isCoach && rsvpSummary && (
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                { label: 'Going', value: rsvpSummary.accepted, tone: 'text-primary-700' },
                { label: 'Maybe', value: rsvpSummary.tentative, tone: 'text-amber-700' },
                { label: 'No', value: rsvpSummary.declined, tone: 'text-rose-700' },
                { label: 'Pending', value: rsvpSummary.pending, tone: 'text-warm-500' },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl border border-warm-200/55 bg-cream-50/70 p-3"
                >
                  <p className={cn('text-[20px] font-display font-medium leading-none tabular-nums', stat.tone)}>
                    {stat.value}
                  </p>
                  <p className="font-serif uppercase text-[10px] tracking-[0.12em] text-warm-500 mt-1.5">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Player RSVP CTA row. */}
          {!isCoach && onRespond && (
            <div>
              <p className="font-serif uppercase text-[11px] tracking-[0.16em] text-warm-500 mb-2.5">
                Your response
              </p>
              <div className="grid grid-cols-3 gap-2">
                {RSVP_OPTIONS.map((opt) => {
                  const isSelected = rsvpStatus === opt.value;
                  const isPending = pendingStatus === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleRespond(opt.value)}
                      disabled={pendingStatus !== null}
                      aria-pressed={isSelected}
                      className={cn(
                        'inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-2xl',
                        'min-h-[44px] text-[13px] font-medium tracking-[-0.005em]',
                        'transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
                        'disabled:opacity-60',
                        isSelected
                          ? opt.tone === 'primary'
                            ? 'bg-primary-600 text-white ring-1 ring-primary-700/30'
                            : opt.tone === 'amber'
                            ? 'bg-helm-amber text-warm-900 ring-1 ring-amber-700/30'
                            : 'bg-rose-500 text-white ring-1 ring-rose-700/30'
                          : 'bg-cream-100/65 text-warm-700 ring-1 ring-warm-200/55 hover:bg-cream-100/95 hover:text-warm-900',
                        isPending && 'opacity-80',
                      )}
                    >
                      {opt.value === 'accepted' && <IconCheck size={14} />}
                      {opt.value === 'declined' && <IconX size={14} />}
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
              {error && (
                <p className="text-[12px] text-rose-600 mt-2.5">{error}</p>
              )}
            </div>
          )}
        </div>

        {/* Footer — coach edit affordance + close. */}
        <div
          className="flex items-center justify-between gap-3 px-6 py-4"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
        >
          {isCoach && onEdit ? (
            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                onEdit(event);
              }}
              className="text-[13px] font-medium text-primary-700 hover:text-primary-800 transition-colors"
            >
              Edit details
            </button>
          ) : (
            <span aria-hidden />
          )}
          <DrawerClose asChild>
            <button
              type="button"
              className="text-[13px] font-medium text-warm-500 hover:text-warm-800 transition-colors"
            >
              Close
            </button>
          </DrawerClose>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

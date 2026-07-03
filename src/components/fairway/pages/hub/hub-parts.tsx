'use client';

/**
 * ============================================================================
 * Fairway · pages/hub · FairwayPlayerHub local sub-parts
 * ----------------------------------------------------------------------------
 * Presentation-only building blocks for the redesigned PLAYER Hub (route
 * /golf/dashboard/hub, player role). These are page-local compositions of
 * Fairway primitives (Surface / Inset / InsightCard / StatusPill / Sheet / etc.)
 * — they hold NO data fetching and almost no business logic. The two optimistic
 * write paths (completeTask / respondToEvent) stay in the legacy
 * PlayerHubWrapper; these parts only invoke the callbacks passed down from it.
 *
 * The ONE exception is the announcements list, which — exactly like the legacy
 * PlayerHubAnnouncementsSection — owns its own acknowledge path (it calls the
 * unchanged `acknowledgeAnnouncement` server action with the legacy optimistic
 * state + toast + badge-refetch). That is the "acknowledge callback" contract;
 * the mutation is NOT moved into the page.
 *
 * Mental model: triage → what's-next → reference. Honest-empty everywhere — the
 * sparse demo data NEVER fabricates a hero (the single junk past trip only ever
 * appears, as a "Completed" status, in the Trips tab).
 *
 * ADDITIVE + GATED. Renders inside a `.fairway-ds` scope on `bg-canvas`.
 * ========================================================================== */

import { useCallback, useEffect, useState, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plane,
  MapPin,
  CalendarClock,
  Clock,
  Check,
  ChevronRight,
  Bell,
  ClipboardList,
  Upload,
} from 'lucide-react';

import {
  Surface,
  Inset,
  Button,
  Badge,
  StatusPill,
  EmptyState,
  Sheet,
  InlineNotice,
} from '@/components/fairway';
import { cn } from '@/lib/utils';
import { useFormatDate } from '@/hooks/golf/use-appearance-preferences';
import { useToast } from '@/components/ui/sonner';
import { useNotificationBadges } from '@/contexts/notification-badge-context';
import { acknowledgeAnnouncement } from '@/app/golf/actions/communication';
import type { GolfAnnouncementMeta } from '@/lib/types/golf';

/* ─────────────────────────────────────────────────────────────────────────
 * Shared data shapes — IDENTICAL to the legacy PlayerHub props (verbatim).
 * ──────────────────────────────────────────────────────────────────────── */

export interface TripData {
  id: string;
  event_name: string;
  destination: string;
  transportation_type: 'bus' | 'van' | 'fly' | 'carpool';
  departure_date: string;
  departure_time: string | null;
  departure_location: string | null;
  return_date: string | null;
  return_time: string | null;
  hotel_name: string | null;
  hotel_address: string | null;
  hotel_phone: string | null;
  hotel_confirmation: string | null;
  uniform_requirements: string | null;
  gear_list: string | null;
  room_assignments: string | null;
  notes: string | null;
  flight_info: string | null;
}

export interface PlayerTask {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  category: string | null;
  requires_upload: boolean;
  status: 'pending' | 'overdue' | 'completed';
  completed_at: string | null;
}

export interface EventInvite {
  id: string;
  event_id: string;
  title: string;
  event_type: string;
  start_time: string;
  end_time: string | null;
  location: string | null;
  is_mandatory: boolean;
  rsvp_status: 'pending' | 'accepted' | 'declined' | 'tentative' | null;
  going_count: number;
  maybe_count: number;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Time-of-day greeting — mirrors FairwayPlayerDashboard. The firstName is
 * server-known and renders on first paint; only the time word resolves on the
 * client to avoid an SSR timezone mismatch.
 * ──────────────────────────────────────────────────────────────────────── */

export function useTimeWord(): string {
  const [timeWord, setTimeWord] = useState('Welcome back');
  useEffect(() => {
    const hour = new Date().getHours();
    setTimeWord(hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening');
  }, []);
  return timeWord;
}

/* ─────────────────────────────────────────────────────────────────────────
 * SectionTitle — one quiet General Sans h3 voice for all overview sections.
 * ──────────────────────────────────────────────────────────────────────── */

export function SectionTitle({
  children,
  count,
  action,
}: {
  children: ReactNode;
  count?: number;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <div className="flex items-baseline gap-2">
        <h2 className="font-fw-sans text-h3 font-semibold text-text-primary">{children}</h2>
        {count != null ? (
          <span className="font-fw-mono text-body-sm tabular-nums text-text-tertiary">{count}</span>
        ) : null}
      </div>
      {action ? (
        <Button
          type="button"
          variant="ghost"
    
          onClick={action.onClick}
          className={cn(
            'group h-auto min-h-0 shrink-0 items-center gap-1 font-fw-sans text-body-sm font-medium text-accent-700',
            'rounded-full px-1 py-0.5 transition-colors duration-base',
            'hover:bg-transparent hover:text-accent-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
          )}
        >
          {action.label}
          <ChevronRight
            aria-hidden
            className="h-3.5 w-3.5 transition-transform duration-base group-hover:translate-x-0.5"
          />
        </Button>
      ) : null}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Date / time formatting helpers (presentation-only).
 * ──────────────────────────────────────────────────────────────────────── */

function formatTime(timeStr: string): string {
  const parts = timeStr.split(':');
  const hour = parseInt(parts[0] || '0', 10);
  const min = parts[1] || '00';
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${min} ${ampm}`;
}

function formatEventTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatRelativeDate(dateStr: string, now: Date | null): string {
  const date = new Date(dateStr);
  if (!now) return '';
  const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays < 0) return `${Math.abs(diffDays)}d ago`;
  if (diffDays <= 7) return `In ${diffDays} days`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const TRANSPORT_LABEL: Record<string, string> = {
  fly: 'Flight',
  bus: 'Bus',
  van: 'Van',
  carpool: 'Carpool',
};

/** A trip's lifecycle status as a Fairway StatusPill tone + label.
 *  The lone demo trip (return before departure, is_upcoming FALSE) resolves to
 *  "Completed" here — never an "upcoming" hero. */
function tripStatus(
  trip: TripData,
  now: Date | null,
): { label: string; tone: 'neutral' | 'accent' | 'warning'; pulse?: boolean } {
  if (!now) return { label: 'Upcoming', tone: 'neutral' };
  const departure = new Date(trip.departure_date);
  const returnDate = trip.return_date ? new Date(trip.return_date) : null;
  if (returnDate && now > returnDate) return { label: 'Completed', tone: 'neutral' };
  if (now >= departure && returnDate && now <= returnDate) {
    return { label: 'In transit', tone: 'accent', pulse: true };
  }
  const diffDays = Math.ceil((departure.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 7 && diffDays > 0) return { label: `${diffDays}d away`, tone: 'warning' };
  if (departure < now) return { label: 'Completed', tone: 'neutral' };
  return { label: 'Upcoming', tone: 'neutral' };
}

/* ─────────────────────────────────────────────────────────────────────────
 * TripRow — a matte Surface row that opens the Fairway Sheet (replaces the
 * legacy framer bottom sheet + bg-cream/backdrop-blur TripDetailSheet).
 * ──────────────────────────────────────────────────────────────────────── */

export function TripRow({
  trip,
  now,
  onOpen,
}: {
  trip: TripData;
  now: Date | null;
  onOpen: () => void;
}) {
  const fmtDate = useFormatDate();
  const status = tripStatus(trip, now);
  return (
    <Button
      type="button"
      variant="ghost"

      onClick={onOpen}
      className={cn(
        // matte Surface look, as a native button (NOT Surface as="button")
        'group relative h-auto min-h-0 w-full items-center gap-3 rounded-card bg-surface p-4 text-left',
        'border border-border-subtle shadow-flat',
        'cursor-pointer transition-[box-shadow,transform,border-color]',
        '[transition-duration:180ms] [transition-timing-function:cubic-bezier(0.22,0.61,0.36,1)]',
        'hover:bg-surface hover:shadow-raise hover:-translate-y-px active:translate-y-[0.5px] active:shadow-flat',
        'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        'motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0',
      )}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-fw-md bg-surface-sunken text-text-tertiary">
        <Plane aria-hidden className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate font-fw-sans text-body-sm font-medium text-text-primary">
            {trip.event_name || 'Trip'}
          </p>
          <StatusPill tone={status.tone} size="sm" dot pulse={status.pulse}>
            {status.label}
          </StatusPill>
        </div>
        <p className="mt-0.5 flex items-center gap-1.5 font-fw-sans text-caption text-text-tertiary">
          <MapPin aria-hidden className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{trip.destination || 'Destination TBD'}</span>
          <span aria-hidden>·</span>
          <span className="tabular-nums">{fmtDate(trip.departure_date)}</span>
        </p>
      </div>
      <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-text-tertiary" />
    </Button>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * TripDetailSheet — the Fairway overlays/Sheet read of one trip.
 * ──────────────────────────────────────────────────────────────────────── */

function DetailField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="font-fw-sans text-eyebrow uppercase tracking-[0.08em] text-text-tertiary">
        {label}
      </p>
      <p className="mt-1 font-fw-sans text-body-sm text-text-secondary">{value}</p>
    </div>
  );
}

export function TripDetailSheet({
  trip,
  open,
  onOpenChange,
}: {
  trip: TripData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const fmtDate = useFormatDate();
  if (!trip) return null;
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      side="bottom"
      title={trip.event_name || 'Trip'}
      description={`${TRANSPORT_LABEL[trip.transportation_type] ?? 'Travel'} · ${trip.destination || 'Destination TBD'}`}
    >
      <Sheet.Body className="space-y-5">
        {/* Schedule */}
        <div className="grid grid-cols-2 gap-3">
          <Inset padding="sm">
            <p className="font-fw-sans text-eyebrow uppercase tracking-[0.08em] text-text-tertiary">
              Depart
            </p>
            <p className="mt-1 font-fw-sans text-body-sm font-medium text-text-primary tabular-nums">
              {fmtDate(trip.departure_date)}
            </p>
            {trip.departure_time ? (
              <p className="font-fw-sans text-caption text-text-tertiary tabular-nums">
                {formatTime(trip.departure_time)}
              </p>
            ) : null}
            {trip.departure_location ? (
              <p className="mt-0.5 font-fw-sans text-caption text-text-tertiary">
                {trip.departure_location}
              </p>
            ) : null}
          </Inset>
          {trip.return_date ? (
            <Inset padding="sm">
              <p className="font-fw-sans text-eyebrow uppercase tracking-[0.08em] text-text-tertiary">
                Return
              </p>
              <p className="mt-1 font-fw-sans text-body-sm font-medium text-text-primary tabular-nums">
                {fmtDate(trip.return_date)}
              </p>
              {trip.return_time ? (
                <p className="font-fw-sans text-caption text-text-tertiary tabular-nums">
                  {formatTime(trip.return_time)}
                </p>
              ) : null}
            </Inset>
          ) : null}
        </div>

        {trip.hotel_name ? (
          <Inset padding="sm">
            <p className="font-fw-sans text-eyebrow uppercase tracking-[0.08em] text-text-tertiary">
              Lodging
            </p>
            <p className="mt-1 font-fw-sans text-body-sm font-medium text-text-primary">
              {trip.hotel_name}
            </p>
            {trip.hotel_address ? (
              <p className="font-fw-sans text-caption text-text-secondary">{trip.hotel_address}</p>
            ) : null}
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-fw-sans text-caption text-text-tertiary">
              {trip.hotel_phone ? <span>Phone: {trip.hotel_phone}</span> : null}
              {trip.hotel_confirmation ? <span>Conf: {trip.hotel_confirmation}</span> : null}
            </div>
          </Inset>
        ) : null}

        {trip.room_assignments ? (
          <DetailField label="Room assignment" value={trip.room_assignments} />
        ) : null}
        {trip.uniform_requirements ? (
          <DetailField label="Uniform" value={trip.uniform_requirements} />
        ) : null}
        {trip.gear_list ? <DetailField label="Gear list" value={trip.gear_list} /> : null}
        {trip.flight_info ? <DetailField label="Flight info" value={trip.flight_info} /> : null}
        {trip.notes ? <DetailField label="Notes" value={trip.notes} /> : null}
      </Sheet.Body>
      <Sheet.Footer>
        <Button variant="secondary" fullWidth onClick={() => onOpenChange(false)}>
          Close
        </Button>
      </Sheet.Footer>
    </Sheet>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * TaskRow — a matte Surface/Inset row. The complete control is a native
 * <button> with matte classes (NOT Surface as="button"); it calls the
 * onComplete callback (the legacy optimistic completeTask path, unchanged).
 * ──────────────────────────────────────────────────────────────────────── */

export function TaskRow({
  task,
  now,
  onComplete,
}: {
  task: PlayerTask;
  now: Date | null;
  onComplete: () => Promise<void> | void;
}) {
  const [completing, setCompleting] = useState(false);
  const isCompleted = task.status === 'completed';
  const isOverdue = task.status === 'overdue';

  const handleComplete = useCallback(async () => {
    if (isCompleted || completing) return;
    setCompleting(true);
    try {
      await onComplete();
    } finally {
      setCompleting(false);
    }
  }, [isCompleted, completing, onComplete]);

  return (
    <Inset
      padding="sm"
      className={cn('flex items-start gap-3', isCompleted && 'opacity-60')}
    >
      <Button
        type="button"
        variant="ghost"
  
        onClick={handleComplete}
        disabled={isCompleted || completing}
        aria-label={isCompleted ? 'Task completed' : 'Mark task complete'}
        className={cn(
          // 44×44px tap target (WCAG 2.2 / premium DoD) — the visual checkbox
          // stays 28px via the nested <span>; the button is the padded hit zone.
          // Negative margins keep the 28px glyph aligned with its old mt-0.5 spot.
          'group -mt-1.5 -ml-1.5 grid h-11 min-h-0 w-11 shrink-0 place-items-center rounded-fw-md p-0 hover:bg-transparent',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        )}
      >
        <span
          className={cn(
            'grid h-7 w-7 place-items-center rounded-fw-md border',
            'transition-[background-color,border-color] duration-base',
            isCompleted
              ? 'border-transparent bg-accent-500 text-text-on-accent'
              : 'border-border-strong bg-surface text-transparent group-hover:border-accent-500 group-hover:bg-accent-50',
            completing && 'animate-pulse',
          )}
        >
          <Check aria-hidden className="h-4 w-4" />
        </span>
      </Button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p
            className={cn(
              'truncate font-fw-sans text-body-sm font-medium text-text-primary',
              isCompleted && 'text-text-tertiary line-through',
            )}
          >
            {task.title}
          </p>
          {task.requires_upload && !isCompleted ? (
            <Badge tone="neutral" size="sm" leadingIcon={<Upload aria-hidden />}>
              Upload
            </Badge>
          ) : null}
        </div>
        {task.description ? (
          <p className="mt-0.5 line-clamp-1 font-fw-sans text-caption text-text-tertiary">
            {task.description}
          </p>
        ) : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {isOverdue ? (
            <StatusPill tone="danger" size="sm" dot>
              Overdue
            </StatusPill>
          ) : task.due_date && !isCompleted ? (
            <span className="font-fw-sans text-caption text-text-tertiary tabular-nums">
              {formatRelativeDate(task.due_date, now)}
            </span>
          ) : null}
          {isCompleted && task.completed_at ? (
            <span className="inline-flex items-center gap-1 font-fw-sans text-caption text-accent-700">
              <Check aria-hidden className="h-3 w-3" />
              Done {formatRelativeDate(task.completed_at, now)}
            </span>
          ) : null}
          {task.category ? (
            <span className="font-fw-sans text-caption text-text-tertiary">
              {task.category.replace(/_/g, ' ')}
            </span>
          ) : null}
        </div>
      </div>
    </Inset>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * RSVPRow — matte Surface row with the three RSVP actions. Calls the onRSVP
 * callback (the legacy optimistic respondToEvent path, unchanged).
 * ──────────────────────────────────────────────────────────────────────── */

export function RSVPRow({
  event,
  now,
  onRSVP,
}: {
  event: EventInvite;
  now: Date | null;
  onRSVP: (status: 'accepted' | 'declined' | 'tentative') => Promise<void> | void;
}) {
  const fmtDate = useFormatDate();
  const [submitting, setSubmitting] = useState<string | null>(null);
  const eventDate = new Date(event.start_time);
  const isToday = now ? now.toDateString() === eventDate.toDateString() : false;
  const isPast = now ? eventDate < now : false;

  const handleRSVP = useCallback(
    async (status: 'accepted' | 'declined' | 'tentative') => {
      setSubmitting(status);
      try {
        await onRSVP(status);
      } finally {
        setSubmitting(null);
      }
    },
    [onRSVP],
  );

  return (
    <Surface padding="sm" className={cn('flex flex-col gap-3', isPast && 'opacity-60')}>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-fw-md bg-surface-sunken text-text-tertiary">
          <CalendarClock aria-hidden className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-fw-sans text-body-sm font-medium text-text-primary">
              {event.title}
            </p>
            {event.is_mandatory ? (
              <Badge tone="danger" size="sm">
                Required
              </Badge>
            ) : null}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-fw-sans text-caption text-text-tertiary">
            <span className={cn('inline-flex items-center gap-1', isToday && 'text-accent-700')}>
              <Clock aria-hidden className="h-3.5 w-3.5" />
              {isToday ? 'Today' : fmtDate(event.start_time)} · {formatEventTime(event.start_time)}
            </span>
            {event.location ? (
              <span className="inline-flex items-center gap-1">
                <MapPin aria-hidden className="h-3.5 w-3.5" />
                <span className="truncate">{event.location}</span>
              </span>
            ) : null}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge tone="accent" size="sm" numeric>
              {event.going_count} going
            </Badge>
            {event.maybe_count > 0 ? (
              <Badge tone="warning" size="sm" numeric>
                {event.maybe_count} maybe
              </Badge>
            ) : null}
          </div>
        </div>
      </div>

      {!isPast ? (
        // 3-up grid (not a flex row) so the three pills get equal width, never
        // crowd/truncate, and never trigger horizontal scroll at 320px. Each
        // Button is fullWidth in its cell; size="sm" already expands to a 44px
        // min-height on coarse (touch) pointers via the Button primitive.
        <div className="grid grid-cols-3 gap-2">
          <Button
            variant={event.rsvp_status === 'accepted' ? 'primary' : 'secondary'}
            size="sm"
            fullWidth
            busy={submitting === 'accepted'}
            disabled={submitting !== null}
            onClick={() => handleRSVP('accepted')}
            leftIcon={event.rsvp_status === 'accepted' ? <Check className="h-3.5 w-3.5" /> : undefined}
          >
            Going
          </Button>
          <Button
            variant={event.rsvp_status === 'tentative' ? 'primary' : 'ghost'}
            size="sm"
            fullWidth
            busy={submitting === 'tentative'}
            disabled={submitting !== null}
            onClick={() => handleRSVP('tentative')}
          >
            Maybe
          </Button>
          <Button
            variant={event.rsvp_status === 'declined' ? 'primary' : 'ghost'}
            size="sm"
            fullWidth
            busy={submitting === 'declined'}
            disabled={submitting !== null}
            onClick={() => handleRSVP('declined')}
          >
            Can&apos;t go
          </Button>
        </div>
      ) : null}
    </Surface>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * AnnouncementsList — Fairway-native rebuild of PlayerHubAnnouncementsSection.
 * Owns its own acknowledge path: it calls the UNCHANGED `acknowledgeAnnouncement`
 * server action with the same optimistic-set + toast + badge-refetch as legacy.
 * The mutation is NOT moved into the page; this is the "acknowledge callback".
 * ──────────────────────────────────────────────────────────────────────── */

const URGENCY_TONE: Record<string, 'neutral' | 'accent' | 'warning' | 'danger'> = {
  low: 'neutral',
  normal: 'accent',
  high: 'warning',
  urgent: 'danger',
};

function announcementUnread(ann: GolfAnnouncementMeta, nowTs: number, acked: boolean): boolean {
  if (acked) return false;
  if (ann.requires_acknowledgement && !ann.has_player_acknowledged) return true;
  if (!ann.requires_acknowledgement && ann.published_at && nowTs) {
    return nowTs - new Date(ann.published_at).getTime() < 24 * 3600000;
  }
  return false;
}

function relativeTime(dateStr: string, nowTs: number): string {
  if (!nowTs) return '';
  const mins = Math.floor((nowTs - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function AnnouncementsList({
  announcements,
  loadError = false,
}: {
  announcements: GolfAnnouncementMeta[];
  /** True when the announcements fetch FAILED — render an honest error affordance
   *  with a retry instead of a silent empty (B3/B4, P147). */
  loadError?: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const badges = useNotificationBadges();
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());
  const [acknowledging, setAcknowledging] = useState<string | null>(null);
  const [retrying, startRetry] = useTransition();
  const [nowTs, setNowTs] = useState(0);
  useEffect(() => {
    setNowTs(Date.now());
  }, []);

  const handleAcknowledge = useCallback(
    async (announcementId: string) => {
      setAcknowledging(announcementId);
      const result = await acknowledgeAnnouncement(announcementId);
      if (result.success) {
        setAcknowledged((prev) => new Set(prev).add(announcementId));
        showToast('Acknowledged', 'success');
        badges.refetch();
      } else {
        showToast(result.error || 'Failed to acknowledge', 'error');
      }
      setAcknowledging(null);
    },
    [showToast, badges],
  );

  // B3/B4: a failed fetch must never look like "no announcements". When the load
  // errored AND we have nothing to show, render an explicit error + retry. (P147)
  if (loadError && announcements.length === 0) {
    return (
      <section>
        <SectionTitle>Announcements</SectionTitle>
        <InlineNotice
          tone="danger"
          title="Couldn't load announcements"
          action={
            <Button
              variant="secondary"
              size="sm"
              busy={retrying}
              onClick={() => startRetry(() => router.refresh())}
            >
              Retry
            </Button>
          }
        >
          Something went wrong fetching your team&rsquo;s announcements. This is a
          temporary hiccup — retry to load them again.
        </InlineNotice>
      </section>
    );
  }

  if (announcements.length === 0) return null;

  // Unread first, limit to 3 (matches legacy).
  const sorted = [...announcements]
    .sort((a, b) => {
      const aU = announcementUnread(a, nowTs, acknowledged.has(a.id));
      const bU = announcementUnread(b, nowTs, acknowledged.has(b.id));
      if (aU && !bU) return -1;
      if (!aU && bU) return 1;
      return 0;
    })
    .slice(0, 3);

  return (
    <section>
      <SectionTitle>Announcements</SectionTitle>
      <Surface padding="sm" className="flex flex-col gap-1.5">
        {sorted.map((ann) => {
          const acked = ann.has_player_acknowledged || acknowledged.has(ann.id);
          const needsAck = ann.requires_acknowledgement && !acked;
          const unread = announcementUnread(ann, nowTs, acknowledged.has(ann.id));
          const tone = URGENCY_TONE[ann.urgency || 'normal'] ?? 'accent';
          return (
            <Inset key={ann.id} padding="sm" className="flex items-start gap-3">
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-fw-md bg-surface text-text-tertiary">
                <Bell aria-hidden className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-fw-sans text-body-sm font-medium text-text-primary">
                    {ann.title}
                  </p>
                  {needsAck ? (
                    <StatusPill tone={tone} size="sm" dot>
                      Action
                    </StatusPill>
                  ) : unread ? (
                    <StatusPill tone="accent" size="sm" dot pulse>
                      New
                    </StatusPill>
                  ) : null}
                </div>
                {ann.body ? (
                  <p className="mt-0.5 line-clamp-1 font-fw-sans text-caption text-text-tertiary">
                    {ann.body}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span className="font-fw-sans text-caption text-text-tertiary tabular-nums">
                  {ann.published_at ? relativeTime(ann.published_at, nowTs) : ''}
                </span>
                {needsAck ? (
                  <Button
                    variant="primary"
                    size="sm"
                    busy={acknowledging === ann.id}
                    disabled={acknowledging !== null}
                    onClick={() => handleAcknowledge(ann.id)}
                    leftIcon={<Check className="h-3.5 w-3.5" />}
                  >
                    Ack
                  </Button>
                ) : acked ? (
                  <span className="inline-flex items-center gap-1 font-fw-sans text-caption text-accent-700">
                    <Check aria-hidden className="h-3.5 w-3.5" />
                    Acked
                  </span>
                ) : null}
              </div>
            </Inset>
          );
        })}
        <div className="pt-1">
          <Button
            asChild
            variant="ghost"
            size="sm"
            rightIcon={<ChevronRight className="h-4 w-4" />}
          >
            <Link href="/golf/dashboard/announcements">View all announcements</Link>
          </Button>
        </div>
      </Surface>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Honest-empty composites — NEVER fabricate. Sparse demo data shows these.
 * ──────────────────────────────────────────────────────────────────────── */

export function NoUpcomingTrips() {
  return (
    <Surface padding="sm">
      <EmptyState
        variant="subtle"
        icon={Plane}
        title="No upcoming trips"
        description="Your last trip has wrapped — new itineraries from your coach will show up here."
      />
    </Surface>
  );
}



export function NoTasks() {
  return (
    <Surface padding="sm">
      <EmptyState
        variant="subtle"
        icon={ClipboardList}
        title="No tasks assigned"
        description="You're clear — assigned tasks will show up here."
      />
    </Surface>
  );
}





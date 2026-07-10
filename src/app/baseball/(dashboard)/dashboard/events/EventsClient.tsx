'use client';

import { useState, useEffect, useTransition } from 'react';
import { format } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { Button, IconButton } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/hooks/use-auth';
import { useTeams } from '@/hooks/use-teams';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import {
  IconPlus,
  IconMapPin,
  IconClock,
  IconTrash,
} from '@/components/icons';
import { SectionMasthead, EditorsLetter, EmptyIssue, PaperCard, InkBadge, Eyebrow } from '@/components/baseball/living-annual';
import type { InkBadgeProps } from '@/components/baseball/living-annual';
import { InlineNotice } from '@/components/fairway';
import { createBaseballEvent, deleteBaseballEvent } from '@/app/baseball/actions/calendar';
import { eventInk } from './event-ink';

interface Event {
  id: string;
  team_id: string;
  title: string;
  event_type: string;
  start_time: string;
  end_time: string | null;
  location: string | null;
  description: string | null;
  all_day: boolean | null;
  recurring: boolean | null;
  recurrence_rule: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
  team?: {
    id: string;
    name: string;
    primary_color: string | null;
  };
}

// Ink monogram tile (row avatar) — a lane-ink-tinted tile bearing the team's
// initial, replacing the old arbitrary `team.primary_color` background
// swatch. `neutral` event types keep a bare hairline tile so graphite still
// carries the contrast (design-system-living-annual.md §4.2 contrast law).
const MONOGRAM_TONE: Record<NonNullable<InkBadgeProps['tone']>, string> = {
  team: 'border-grade-plus/25 bg-grade-plus/10 text-grade-plus',
  pursuit: 'border-pursuit/25 bg-pursuit/10 text-pursuit',
  neutral: 'border-[color:var(--hairline)] text-text-primary',
  sodium: 'border-sodium/25 bg-sodium/10 text-sodium',
};

const eventTypeOptions = [
  { value: 'game', label: 'Game' },
  { value: 'practice', label: 'Practice' },
  { value: 'showcase', label: 'Showcase' },
  { value: 'tryout', label: 'Tryout' },
  { value: 'tournament', label: 'Tournament' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'other', label: 'Other' },
];

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

function EventsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading events">
      {[0, 1].map((g) => (
        <div key={g}>
          <div className="h-4 w-40 bg-warm-200 rounded mb-3" />
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <PaperCard key={i} className="p-4">
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-fw-md bg-warm-200 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-48 bg-warm-200 rounded" />
                    <div className="h-3 w-32 bg-warm-100 rounded" />
                    <div className="flex gap-2">
                      <div className="h-5 w-16 bg-warm-100 rounded-full" />
                      <div className="h-5 w-20 bg-warm-100 rounded-full" />
                    </div>
                  </div>
                </div>
              </PaperCard>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function EventsPage() {
  const { coach, loading: authLoading } = useAuth();
  const { teams } = useTeams();

  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filterTeam, setFilterTeam] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');

  // Create event form state
  const [newEvent, setNewEvent] = useState({
    team_id: '',
    title: '',
    event_type: 'game',
    start_time: '',
    end_time: '',
    location: '',
    description: '',
  });
  const [createError, setCreateError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Per-event delete error (keyed by event id)
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});
  // Event pending the in-kit confirm dialog (replaces native `confirm()`).
  const [confirmDeleteEventId, setConfirmDeleteEventId] = useState<string | null>(null);

  // Focus-trapped, Esc-to-close, focus-restoring dialogs (spec §7.1 doesn't
  // cover modals directly, but the same `useFocusTrap` hook backing
  // `ConfirmDialog` elsewhere in the app gives every dialog here the same
  // role="dialog"/aria-modal contract).
  const { modalRef: createModalRef } = useFocusTrap(showCreateModal, () => setShowCreateModal(false));
  const { modalRef: deleteDialogRef } = useFocusTrap(confirmDeleteEventId !== null, () => setConfirmDeleteEventId(null));

  // ---------------------------------------------------------------------------
  // Fetch events (read-path — client SELECT is fine, RLS governs it)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    async function fetchEvents() {
      if (authLoading || !coach?.id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setFetchError(null);
      const supabase = createClient();

      const teamIds = teams.map((t) => t.id);

      if (teamIds.length === 0) {
        setEvents([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('baseball_events')
        .select(`
          *,
          team:baseball_teams (id, name, primary_color)
        `)
        .in('team_id', teamIds)
        .gte('start_time', new Date().toISOString())
        .order('start_time', { ascending: true });

      if (error) {
        setFetchError('Unable to load events. Please refresh to try again.');
        setEvents([]);
      } else {
        setEvents((data || []) as Event[]);
      }

      setLoading(false);
    }

    if (teams.length > 0) {
      fetchEvents();
    } else if (!authLoading) {
      // Auth is ready but the coach has no teams (e.g. a new showcase org):
      // clear the skeleton and fall through to the honest empty state instead
      // of spinning on `loading` forever.
      setEvents([]);
      setLoading(false);
    }
  }, [authLoading, coach?.id, teams]);

  // ---------------------------------------------------------------------------
  // Create event — server action
  // ---------------------------------------------------------------------------

  const handleCreateEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!coach?.id || !newEvent.title.trim() || !newEvent.team_id || !newEvent.start_time) return;

    setCreateError(null);
    startTransition(async () => {
      // Derive date/time parts from the datetime-local value (YYYY-MM-DDTHH:mm)
      const startParts = newEvent.start_time.split('T');
      const startDate: string = startParts[0] ?? '';
      const startTime: string | null = startParts[1] ?? null;

      const endParts = newEvent.end_time ? newEvent.end_time.split('T') : null;
      const endDate: string | null = endParts ? (endParts[0] ?? null) : null;
      const endTime: string | null = endParts ? (endParts[1] ?? null) : null;

      const result = await createBaseballEvent({
        teamId: newEvent.team_id,
        title: newEvent.title.trim(),
        eventType: newEvent.event_type,
        startDate,
        startTime,
        endDate,
        endTime,
        location: newEvent.location || null,
        description: newEvent.description || null,
        // datetime-local inputs are wall-clock time in the coach's browser tz;
        // without this, the server stores it assuming UTC (mirrors the golf
        // calendar fix in src/app/golf/actions/golf.ts).
        timezoneOffset: new Date().getTimezoneOffset(),
      });

      if (!result.success) {
        setCreateError(result.error ?? 'Failed to create event. Please try again.');
        return;
      }

      // The event row itself succeeded while a secondary, best-effort write
      // (RSVP invites, the linked baseball_games row) can still fail —
      // createBaseballEvent surfaces that as `result.warning` on an
      // otherwise `success: true` result. Non-blocking: the event stays
      // created, this just tells the coach the secondary write needs a look.
      if (result.warning) {
        toast.warning('Event created', { description: result.warning });
      }

      // Optimistically add the new event to local state so UI updates instantly
      // without waiting for a full re-fetch.
      const created = result.data as Event | undefined;
      if (created) {
        const selectedTeam = teams.find((t) => t.id === newEvent.team_id);
        const withTeam: Event = {
          ...created,
          team: selectedTeam
            ? { id: selectedTeam.id, name: selectedTeam.name, primary_color: null }
            : undefined,
        };
        setEvents((prev) =>
          [...prev, withTeam].sort(
            (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
          ),
        );
      }

      setShowCreateModal(false);
      setNewEvent({
        team_id: '',
        title: '',
        event_type: 'game',
        start_time: '',
        end_time: '',
        location: '',
        description: '',
      });
    });
  };

  // ---------------------------------------------------------------------------
  // Delete event — server action
  // ---------------------------------------------------------------------------

  // Opens the in-kit PaperCard confirm dialog (replaces native `confirm()`)
  // instead of deleting immediately.
  const requestDeleteEvent = (eventId: string) => {
    setConfirmDeleteEventId(eventId);
  };

  const cancelDeleteEvent = () => {
    setConfirmDeleteEventId(null);
  };

  const confirmDeleteEvent = () => {
    const eventId = confirmDeleteEventId;
    if (!eventId) return;

    setConfirmDeleteEventId(null);
    setDeleteErrors((prev) => ({ ...prev, [eventId]: '' }));
    startTransition(async () => {
      const result = await deleteBaseballEvent(eventId);

      if (!result.success) {
        setDeleteErrors((prev) => ({
          ...prev,
          [eventId]: result.error ?? 'Failed to delete event.',
        }));
        return;
      }

      setEvents((prev) => prev.filter((ev) => ev.id !== eventId));
    });
  };

  // ---------------------------------------------------------------------------
  // Filter + group
  // ---------------------------------------------------------------------------

  const filteredEvents = events.filter((event) => {
    if (filterTeam !== 'all' && event.team_id !== filterTeam) return false;
    if (filterType !== 'all' && event.event_type !== filterType) return false;
    return true;
  });

  const groupedEvents = filteredEvents.reduce((groups, event) => {
    const date = format(new Date(event.start_time), 'yyyy-MM-dd');
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(event);
    return groups;
  }, {} as Record<string, Event[]>);

  // Filters narrowed a non-empty list down to zero vs. day-one/no-events-yet —
  // two different empty states (see the render branch below).
  const hasAnyEvents = events.length > 0;
  const eventPendingDelete = confirmDeleteEventId
    ? events.find((ev) => ev.id === confirmDeleteEventId)
    : undefined;

  // ---------------------------------------------------------------------------
  // Auth/route guards
  // ---------------------------------------------------------------------------

  if (authLoading) {
    return (
      <>
        <div className="px-4 pt-6 sm:px-6 lg:px-8">
          <SectionMasthead eyebrow="ORGANIZATION · EVENTS" title="Events" ink="team" />
        </div>
        <div className="p-6">
          <EventsSkeleton />
        </div>
      </>
    );
  }

  if (!coach) {
    return (
      <>
        <div className="px-4 pt-6 sm:px-6 lg:px-8">
          <SectionMasthead eyebrow="ORGANIZATION · EVENTS" title="Events" ink="team" />
        </div>
        <div className="p-6">
          <EditorsLetter
            ink="team"
            title="Showcase coach access required"
            body="Please log in as a showcase coach to manage events."
          />
        </div>
      </>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      <div className="px-4 pt-6 sm:px-6 lg:px-8">
        <SectionMasthead
          eyebrow="ORGANIZATION · EVENTS"
          title="Events"
          ink="team"
          actions={
            <Button onClick={() => setShowCreateModal(true)}>
              <IconPlus size={16} />
              New Event
            </Button>
          }
        >
          <p className="max-w-prose font-annual text-body text-text-secondary">
            {loading
              ? 'Loading…'
              : `${filteredEvents.length} upcoming event${filteredEvents.length !== 1 ? 's' : ''}`}
          </p>
        </SectionMasthead>
      </div>

      <div className="p-6">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
          <div className="w-full sm:w-48">
            <Select
              placeholder="All Teams"
              value={filterTeam}
              onChange={(value) => setFilterTeam(value)}
              options={[
                { value: 'all', label: 'All Teams' },
                ...teams.map((t) => ({ value: t.id, label: t.name })),
              ]}
            />
          </div>
          <div className="w-full sm:w-48">
            <Select
              placeholder="All Types"
              value={filterType}
              onChange={(value) => setFilterType(value)}
              options={[
                { value: 'all', label: 'All Types' },
                ...eventTypeOptions,
              ]}
            />
          </div>
        </div>

        {/* Fetch error — page-level load failure, via the kit's composed
            error surface (design-system-living-annual.md §7: empty AND error
            states render through EditorsLetter, never a red/amber inline box). */}
        {fetchError && (
          <div role="alert" className="mb-4">
            <EditorsLetter ink="team" title="Unable to load events" body={fetchError} />
          </div>
        )}

        {/* Skeleton while loading */}
        {loading ? (
          <EventsSkeleton />
        ) : fetchError ? null : !hasAnyEvents ? (
          // Day-one: no events exist yet for any team — the composed
          // first-use empty issue with the "Create Your First Event" CTA.
          <EmptyIssue
            variant="calendar"
            ink="team"
            action={
              <Button onClick={() => setShowCreateModal(true)}>
                <IconPlus size={16} />
                Create Your First Event
              </Button>
            }
          />
        ) : filteredEvents.length === 0 ? (
          // Events exist, but the current team/type filters narrowed the list
          // to zero — a distinct, bespoke EditorsLetter (not the `calendar`
          // EmptyIssue preset, which reads as "no events at all") with a
          // "Clear filters" recovery action instead of the create CTA.
          <EditorsLetter
            ink="team"
            title="Nothing matches these filters"
            body="Try a different team or event type — or clear your filters to see everything on the schedule."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setFilterTeam('all');
                  setFilterType('all');
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedEvents).map(([date, dateEvents]) => (
              <div key={date}>
                {/* Date group header — a graphite (max-contrast), tabular
                    Eyebrow dateline instead of a plain gray h3. */}
                <Eyebrow as="h3" ink="muted" className="mb-3 text-text-primary tabular-nums">
                  {format(new Date(date), 'EEEE, MMMM d, yyyy')}
                </Eyebrow>
                <div className="space-y-3">
                  {dateEvents.map((event) => (
                    <div key={event.id}>
                      <PaperCard className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex min-w-0 items-start gap-4">
                            {/* Ink monogram — replaces the arbitrary
                                `team.primary_color` avatar tile. */}
                            <span
                              aria-hidden
                              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-fw-md border font-annual text-h3 font-semibold uppercase ${MONOGRAM_TONE[eventInk(event.event_type).tone]}`}
                            >
                              {(event.team?.name?.charAt(0) || 'E').toUpperCase()}
                            </span>
                            <div className="min-w-0">
                              <h4 className="min-w-0 truncate font-annual text-body-lg font-semibold text-text-primary">
                                {event.title}
                              </h4>
                              <div className="mt-1 flex flex-wrap items-center gap-3 font-annual text-body-sm text-text-tertiary">
                                <span className="flex items-center gap-1">
                                  <IconClock size={14} />
                                  {format(new Date(event.start_time), 'h:mm a')}
                                  {event.end_time &&
                                    ` - ${format(new Date(event.end_time), 'h:mm a')}`}
                                </span>
                                {event.location && (
                                  <span className="flex items-center gap-1">
                                    <IconMapPin size={14} />
                                    {event.location}
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 mt-2">
                                <InkBadge
                                  tone={eventInk(event.event_type).tone}
                                  variant={eventInk(event.event_type).variant}
                                  label={
                                    event.event_type.charAt(0).toUpperCase() +
                                    event.event_type.slice(1)
                                  }
                                />
                                {event.team?.name && (
                                  <InkBadge tone="neutral" variant="soft" label={event.team.name} />
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <IconButton
                              variant="default"
                              onClick={() => requestDeleteEvent(event.id)}
                              className="min-w-[44px] min-h-[44px] p-3 rounded-lg text-warm-400 hover:text-pursuit hover:bg-pursuit/10 active:bg-pursuit/20 transition-colors flex items-center justify-center"
                              aria-label="Delete event"
                              disabled={isPending}
                            >
                              <IconTrash size={16} aria-hidden="true" />
                            </IconButton>
                          </div>
                        </div>
                      </PaperCard>
                      {/* Inline delete error for this event */}
                      {deleteErrors[event.id] && (
                        <p
                          role="alert"
                          className="mt-1 px-2 text-xs text-destructive"
                        >
                          {deleteErrors[event.id]}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Event Modal — a real dialog: role="dialog"/aria-modal, Esc to
          close, a focus trap while open, and focus restored to the trigger on
          close (all via the shared `useFocusTrap` hook — the same contract
          `ConfirmDialog` uses elsewhere in the app). */}
      {showCreateModal && (
        <div
          role="presentation"
          className="fixed inset-0 z-50 flex items-center justify-center bg-warm-900/50 backdrop-blur-sm p-4"
          onClick={(e) => {
            // Close only on a true backdrop click — clicks inside the dialog
            // bubble here with a different target, so no stopPropagation is
            // needed on the content (which would also swallow the keydown
            // path useFocusTrap's document listener relies on).
            if (e.target === e.currentTarget) setShowCreateModal(false);
          }}
        >
          <div
            ref={createModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-event-heading"
            className="w-full max-w-lg"
          >
            <PaperCard className="shadow-xl max-h-[90vh] overflow-y-auto" grain={false}>
              <div className="px-6 py-4 border-b border-warm-100 sticky top-0 bg-cream-50">
                <h2 id="create-event-heading" className="text-lg font-semibold tracking-tight text-warm-900">
                  Create New Event
                </h2>
              </div>
              <form onSubmit={handleCreateEvent} className="p-6 space-y-4">
                {/* Inline create error — the shared InlineNotice component (danger
                    tone), not an ad-hoc red box; matches the fetchError treatment
                    above via EditorsLetter for the composed page-level case. */}
                {createError && <InlineNotice tone="danger">{createError}</InlineNotice>}
                <Select
                  label="Team"
                  placeholder="Select team"
                  value={newEvent.team_id}
                  onChange={(value) => setNewEvent({ ...newEvent, team_id: value })}
                  options={teams.map((t) => ({ value: t.id, label: t.name }))}
                />
                <Input
                  label="Event Name"
                  placeholder="e.g., Game vs. Texas Elite"
                  value={newEvent.title}
                  onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                  required
                />
                <Select
                  label="Event Type"
                  value={newEvent.event_type}
                  onChange={(value) => setNewEvent({ ...newEvent, event_type: value })}
                  options={eventTypeOptions}
                />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="event-start-time"
                      className="block text-sm font-medium text-warm-700 mb-1.5"
                    >
                      Start Time
                    </label>
                    <Input
                      id="event-start-time"
                      type="datetime-local"
                      value={newEvent.start_time}
                      onChange={(e) => setNewEvent({ ...newEvent, start_time: e.target.value })}
                      className="rounded-xl border-warm-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                      required
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="event-end-time"
                      className="block text-sm font-medium text-warm-700 mb-1.5"
                    >
                      End Time
                    </label>
                    <Input
                      id="event-end-time"
                      type="datetime-local"
                      value={newEvent.end_time}
                      onChange={(e) => setNewEvent({ ...newEvent, end_time: e.target.value })}
                      className="rounded-xl border-warm-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                    />
                  </div>
                </div>
                <Input
                  label="Location"
                  placeholder="e.g., Main Field, Houston, TX"
                  value={newEvent.location}
                  onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                />
                <div>
                  <label
                    htmlFor="event-description"
                    className="block text-sm font-medium text-warm-700 mb-1.5"
                  >
                    Description (Optional)
                  </label>
                  <Textarea
                    id="event-description"
                    value={newEvent.description}
                    onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                    placeholder="Add notes or details about this event..."
                    rows={3}
                    className="rounded-xl border-warm-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                  />
                </div>
                <div className="flex items-center gap-3 pt-4">
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1"
                    onClick={() => setShowCreateModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1" isLoading={isPending}>
                    Create Event
                  </Button>
                </div>
              </form>
            </PaperCard>
          </div>
        </div>
      )}

      {/* Delete confirm — an in-kit PaperCard dialog (replaces native
          `confirm()`), wired through the same accessible-dialog contract as
          the create-event modal above. */}
      {confirmDeleteEventId && (
        <div
          role="presentation"
          className="fixed inset-0 z-50 flex items-center justify-center bg-warm-900/50 backdrop-blur-sm p-4"
          onClick={(e) => {
            // Backdrop-only close — same pattern as the create-event modal.
            if (e.target === e.currentTarget) cancelDeleteEvent();
          }}
        >
          <div
            ref={deleteDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-event-heading"
            className="w-full max-w-sm"
          >
            <PaperCard className="p-6 shadow-xl" grain={false}>
              <h2 id="delete-event-heading" className="font-annual text-h3 font-semibold text-text-primary">
                Delete this event?
              </h2>
              <p className="mt-2 font-annual text-body-sm text-text-secondary">
                {eventPendingDelete
                  ? `“${eventPendingDelete.title}” will be removed from the schedule. This can’t be undone.`
                  : 'This event will be removed from the schedule. This can’t be undone.'}
              </p>
              <div className="mt-6 flex items-center gap-3">
                <Button type="button" variant="secondary" className="flex-1" onClick={cancelDeleteEvent}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="flex-1 border-transparent bg-pursuit text-white hover:border-transparent hover:bg-pursuit/90 hover:-translate-y-0 hover:shadow-none"
                  onClick={confirmDeleteEvent}
                  isLoading={isPending}
                >
                  Delete
                </Button>
              </div>
            </PaperCard>
          </div>
        </div>
      )}
    </>
  );
}

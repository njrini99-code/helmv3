'use client';

import { useState, useEffect, useTransition } from 'react';
import { format } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { Header } from '@/components/layout/header';
import { Button, IconButton } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import { useTeams } from '@/hooks/use-teams';
import {
  IconPlus,
  IconCalendar,
  IconMapPin,
  IconClock,
  IconTrash,
} from '@/components/icons';
import { createBaseballEvent, deleteBaseballEvent } from '@/app/baseball/actions/calendar';

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

const eventTypeColors: Record<string, string> = {
  game: 'bg-blue-50 text-blue-700',
  practice: 'bg-primary-50 text-primary-700',
  showcase: 'bg-purple-50 text-purple-700',
  tryout: 'bg-amber-50 text-amber-700',
  tournament: 'bg-red-50 text-red-700',
  meeting: 'bg-warm-100 text-warm-700',
  other: 'bg-warm-100 text-warm-600',
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
              <div key={i} className="bg-white rounded-xl border border-warm-200 p-4">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-warm-200 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-48 bg-warm-200 rounded" />
                    <div className="h-3 w-32 bg-warm-100 rounded" />
                    <div className="flex gap-2">
                      <div className="h-5 w-16 bg-warm-100 rounded-full" />
                      <div className="h-5 w-20 bg-warm-100 rounded-full" />
                    </div>
                  </div>
                </div>
              </div>
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

  const handleDeleteEvent = (eventId: string) => {
    if (!confirm('Are you sure you want to delete this event?')) return;

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

  // ---------------------------------------------------------------------------
  // Auth/route guards
  // ---------------------------------------------------------------------------

  if (authLoading) {
    return (
      <>
        <Header title="Events" subtitle="Loading…" />
        <div className="p-6">
          <EventsSkeleton />
        </div>
      </>
    );
  }

  if (!coach) {
    return (
      <>
        <Header title="Events" subtitle="Showcase coach access required" />
        <div className="p-6">
          <div className="bg-white rounded-2xl border border-warm-200 p-12 text-center">
            <p className="text-warm-500">Please log in as a showcase coach to manage events.</p>
          </div>
        </div>
      </>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      <Header
        title="Events"
        subtitle={
          loading
            ? 'Loading…'
            : `${filteredEvents.length} upcoming event${filteredEvents.length !== 1 ? 's' : ''}`
        }
      >
        <Button onClick={() => setShowCreateModal(true)}>
          <IconPlus size={16} />
          New Event
        </Button>
      </Header>

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

        {/* Fetch error */}
        {fetchError && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {fetchError}
          </div>
        )}

        {/* Skeleton while loading */}
        {loading ? (
          <EventsSkeleton />
        ) : filteredEvents.length === 0 ? (
          /* Honest empty state */
          <div className="bg-white rounded-2xl border border-warm-200 p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-warm-100 flex items-center justify-center">
              <IconCalendar size={24} className="text-warm-400" />
            </div>
            <h3 className="text-lg font-medium text-warm-900 mb-2">No upcoming events</h3>
            <p className="text-warm-500 mb-6 max-w-sm mx-auto">
              No upcoming events — coaches can add events from the calendar.
            </p>
            <Button onClick={() => setShowCreateModal(true)}>
              <IconPlus size={16} />
              Create Your First Event
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedEvents).map(([date, dateEvents]) => (
              <div key={date}>
                <h3 className="text-sm font-medium text-warm-500 mb-3">
                  {format(new Date(date), 'EEEE, MMMM d, yyyy')}
                </h3>
                <div className="space-y-3">
                  {dateEvents.map((event) => (
                    <div key={event.id}>
                      <div className="bg-white rounded-xl border border-warm-200 p-4 hover:border-warm-300 hover:shadow-sm transition-all">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-4">
                            <div
                              className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-lg font-medium flex-shrink-0"
                              style={{
                                backgroundColor:
                                  event.team?.primary_color || 'var(--color-primary-600)',
                              }}
                            >
                              {event.team?.name?.charAt(0) || 'E'}
                            </div>
                            <div>
                              <h4 className="font-medium text-warm-900">{event.title}</h4>
                              <div className="flex items-center gap-3 mt-1 text-sm text-warm-500">
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
                              <div className="flex items-center gap-2 mt-2">
                                <Badge
                                  className={
                                    eventTypeColors[event.event_type] || eventTypeColors.other
                                  }
                                >
                                  {event.event_type.charAt(0).toUpperCase() +
                                    event.event_type.slice(1)}
                                </Badge>
                                <Badge variant="secondary">{event.team?.name}</Badge>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <IconButton
                              variant="default"
                              onClick={() => handleDeleteEvent(event.id)}
                              className="min-w-[44px] min-h-[44px] p-3 rounded-lg text-warm-400 hover:text-red-600 hover:bg-red-50 active:bg-red-100 transition-colors flex items-center justify-center"
                              aria-label="Delete event"
                              disabled={isPending}
                            >
                              <IconTrash size={16} aria-hidden="true" />
                            </IconButton>
                          </div>
                        </div>
                      </div>
                      {/* Inline delete error for this event */}
                      {deleteErrors[event.id] && (
                        <p
                          role="alert"
                          className="mt-1 px-2 text-xs text-red-600"
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

      {/* Create Event Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <Button
            type="button"
            variant="ghost"
            aria-label="Close modal"
            haptic="none"
            className="min-h-0 absolute inset-0 block w-full h-full rounded-none bg-warm-900/50 backdrop-blur-sm cursor-default hover:bg-warm-900/50"
            onClick={() => setShowCreateModal(false)}
          >
            {''}
          </Button>
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-warm-100 sticky top-0 bg-white">
              <h2 className="text-lg font-semibold tracking-tight text-warm-900">
                Create New Event
              </h2>
            </div>
            <form onSubmit={handleCreateEvent} className="p-6 space-y-4">
              {/* Inline create error */}
              {createError && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                >
                  {createError}
                </div>
              )}
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
          </div>
        </div>
      )}
    </>
  );
}

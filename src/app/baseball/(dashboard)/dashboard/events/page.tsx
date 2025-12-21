'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { Header } from '@/components/layout/header';
import { PageLoading } from '@/components/ui/loading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import { useRouteProtection } from '@/hooks/use-route-protection';
import { useTeams } from '@/hooks/use-teams';
import {
  IconPlus,
  IconCalendar,
  IconMapPin,
  IconClock,
  IconTrash,
} from '@/components/icons';

interface Event {
  id: string;
  team_id: string;
  name: string;
  event_type: string;
  start_time: string;
  end_time: string | null;
  location_venue: string | null;
  location_city: string | null;
  location_state: string | null;
  description: string | null;
  team?: {
    id: string;
    name: string;
    primary_color: string | null;
  };
}

const eventTypeColors: Record<string, string> = {
  game: 'bg-blue-50 text-blue-700',
  practice: 'bg-green-50 text-green-700',
  showcase: 'bg-purple-50 text-purple-700',
  tryout: 'bg-amber-50 text-amber-700',
  tournament: 'bg-red-50 text-red-700',
  meeting: 'bg-slate-100 text-slate-700',
  other: 'bg-slate-100 text-slate-600',
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

export default function EventsPage() {
  const { coach, loading: authLoading } = useAuth();
  const { isAllowed, isLoading: routeLoading } = useRouteProtection({
    allowedCoachTypes: ['showcase'],
    redirectTo: '/baseball/dashboard',
  });
  const { teams } = useTeams();

  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filterTeam, setFilterTeam] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');

  // Create event form state
  const [newEvent, setNewEvent] = useState({
    team_id: '',
    name: '',
    event_type: 'game',
    start_time: '',
    end_time: '',
    location_venue: '',
    location_city: '',
    location_state: '',
    description: '',
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    async function fetchEvents() {
      if (authLoading || !coach?.id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      const supabase = createClient();

      // Get all team IDs for this coach
      const teamIds = teams.map((t) => t.id);

      if (teamIds.length === 0) {
        setEvents([]);
        setLoading(false);
        return;
      }

      const query = supabase
        .from('events')
        .select(`
          *,
          team:teams (id, name, primary_color)
        `)
        .in('team_id', teamIds)
        .gte('start_time', new Date().toISOString())
        .order('start_time', { ascending: true });

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching events:', error.message);
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

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coach?.id || !newEvent.name.trim() || !newEvent.team_id || !newEvent.start_time) return;

    setCreating(true);
    const supabase = createClient();

    const { data, error } = await supabase
      .from('events')
      .insert({
        team_id: newEvent.team_id,
        name: newEvent.name.trim(),
        event_type: newEvent.event_type,
        start_time: new Date(newEvent.start_time).toISOString(),
        end_time: newEvent.end_time ? new Date(newEvent.end_time).toISOString() : null,
        location_venue: newEvent.location_venue || null,
        location_city: newEvent.location_city || null,
        location_state: newEvent.location_state || null,
        description: newEvent.description || null,
      })
      .select(`
        *,
        team:teams (id, name, primary_color)
      `)
      .single();

    if (error) {
      console.error('Error creating event:', error.message);
      setCreating(false);
      return;
    }

    setEvents([data as Event, ...events].sort((a, b) =>
      new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    ));
    setShowCreateModal(false);
    setNewEvent({
      team_id: '',
      name: '',
      event_type: 'game',
      start_time: '',
      end_time: '',
      location_venue: '',
      location_city: '',
      location_state: '',
      description: '',
    });
    setCreating(false);
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!confirm('Are you sure you want to delete this event?')) return;

    const supabase = createClient();
    const { error } = await supabase.from('events').delete().eq('id', eventId);

    if (error) {
      console.error('Error deleting event:', error.message);
      return;
    }

    setEvents(events.filter((e) => e.id !== eventId));
  };

  // Filter events
  const filteredEvents = events.filter((event) => {
    if (filterTeam !== 'all' && event.team_id !== filterTeam) return false;
    if (filterType !== 'all' && event.event_type !== filterType) return false;
    return true;
  });

  // Group events by date
  const groupedEvents = filteredEvents.reduce((groups, event) => {
    const date = format(new Date(event.start_time), 'yyyy-MM-dd');
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(event);
    return groups;
  }, {} as Record<string, Event[]>);

  if (authLoading || routeLoading || loading) {
    return <PageLoading />;
  }

  if (!isAllowed) {
    return <PageLoading />;
  }

  if (!coach) {
    return (
      <>
        <Header title="Events" subtitle="Showcase coach access required" />
        <div className="p-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <p className="text-slate-500">Please log in as a showcase coach to manage events.</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title="Events"
        subtitle={`${filteredEvents.length} upcoming event${filteredEvents.length !== 1 ? 's' : ''}`}
      >
        <Button onClick={() => setShowCreateModal(true)}>
          <IconPlus size={16} />
          New Event
        </Button>
      </Header>

      <div className="p-6">
        {/* Filters */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-48">
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
          <div className="w-48">
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

        {filteredEvents.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
              <IconCalendar size={24} className="text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-2">No upcoming events</h3>
            <p className="text-slate-500 mb-6 max-w-sm mx-auto">
              Create events to manage your team schedules, showcases, and tryouts.
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
                <h3 className="text-sm font-medium text-slate-500 mb-3">
                  {format(new Date(date), 'EEEE, MMMM d, yyyy')}
                </h3>
                <div className="space-y-3">
                  {dateEvents.map((event) => (
                    <div
                      key={event.id}
                      className="bg-white rounded-xl border border-slate-200 p-4 hover:border-slate-300 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4">
                          <div
                            className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-lg font-medium flex-shrink-0"
                            style={{ backgroundColor: event.team?.primary_color || '#16A34A' }}
                          >
                            {event.team?.name?.charAt(0) || 'E'}
                          </div>
                          <div>
                            <h4 className="font-medium text-slate-900">{event.name}</h4>
                            <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
                              <span className="flex items-center gap-1">
                                <IconClock size={14} />
                                {format(new Date(event.start_time), 'h:mm a')}
                                {event.end_time && ` - ${format(new Date(event.end_time), 'h:mm a')}`}
                              </span>
                              {event.location_venue && (
                                <span className="flex items-center gap-1">
                                  <IconMapPin size={14} />
                                  {event.location_venue}
                                  {event.location_city && `, ${event.location_city}`}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                              <Badge className={eventTypeColors[event.event_type] || eventTypeColors.other}>
                                {event.event_type.charAt(0).toUpperCase() + event.event_type.slice(1)}
                              </Badge>
                              <Badge variant="secondary">{event.team?.name}</Badge>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDeleteEvent(event.id)}
                            className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <IconTrash size={16} />
                          </button>
                        </div>
                      </div>
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
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setShowCreateModal(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-100 sticky top-0 bg-white">
              <h2 className="text-lg font-semibold text-slate-900">Create New Event</h2>
            </div>
            <form onSubmit={handleCreateEvent} className="p-6 space-y-4">
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
                value={newEvent.name}
                onChange={(e) => setNewEvent({ ...newEvent, name: e.target.value })}
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
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Start Time
                  </label>
                  <input
                    type="datetime-local"
                    value={newEvent.start_time}
                    onChange={(e) => setNewEvent({ ...newEvent, start_time: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:border-green-500 focus:ring-2 focus:ring-green-100"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    End Time
                  </label>
                  <input
                    type="datetime-local"
                    value={newEvent.end_time}
                    onChange={(e) => setNewEvent({ ...newEvent, end_time: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:border-green-500 focus:ring-2 focus:ring-green-100"
                  />
                </div>
              </div>
              <Input
                label="Venue"
                placeholder="e.g., Main Field"
                value={newEvent.location_venue}
                onChange={(e) => setNewEvent({ ...newEvent, location_venue: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="City"
                  placeholder="e.g., Houston"
                  value={newEvent.location_city}
                  onChange={(e) => setNewEvent({ ...newEvent, location_city: e.target.value })}
                />
                <Input
                  label="State"
                  placeholder="e.g., TX"
                  maxLength={2}
                  value={newEvent.location_state}
                  onChange={(e) => setNewEvent({ ...newEvent, location_state: e.target.value.toUpperCase() })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Description (Optional)
                </label>
                <textarea
                  value={newEvent.description}
                  onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                  placeholder="Add notes or details about this event..."
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:border-green-500 focus:ring-2 focus:ring-green-100 resize-none"
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
                <Button type="submit" className="flex-1" loading={creating}>
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

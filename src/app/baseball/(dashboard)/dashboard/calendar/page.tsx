'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageLoading } from '@/components/ui/loading';
import { IconCalendar, IconPlus, IconClock, IconMapPin, IconTrash, IconEdit } from '@/components/icons';
import { useAuth } from '@/hooks/use-auth';
import { useTeamStore } from '@/stores/team-store';
import { createClient } from '@/lib/supabase/client';
import { EventModal } from '@/components/coach/EventModal';
import { CalendarView } from '@/components/shared/CalendarView';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface Event {
  id: string;
  name: string;
  description: string | null;
  event_type: string;
  start_time: string;
  end_time: string | null;
  location_venue: string | null;
  location_city: string | null;
  location_state: string | null;
  opponent: string | null;
  home_away: string | null;
  notes: string | null;
  created_at: string;
}

export default function CalendarPage() {
  const { user, coach, player, loading: authLoading } = useAuth();
  const { selectedTeamId } = useTeamStore();
  const { showToast } = useToast();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'month' | 'week' | 'list'>('list');
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isCoach = user?.role === 'coach';

  useEffect(() => {
    if (selectedTeamId) {
      fetchEvents();
    }
  }, [selectedTeamId]);

  async function fetchEvents() {
    if (!selectedTeamId) return;

    setLoading(true);
    const supabase = createClient();

    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('team_id', selectedTeamId)
      .order('start_time', { ascending: true });

    if (error) {
    } else {
      setEvents(data || []);
    }

    setLoading(false);
  }

  async function handleDeleteConfirm() {
    if (!deleteConfirm) return;
    setDeleting(true);

    const supabase = createClient();
    const { error } = await supabase
      .from('events')
      .delete()
      .eq('id', deleteConfirm);

    if (error) {
      showToast('Failed to delete event', 'error');
    } else {
      showToast('Event deleted successfully', 'success');
      fetchEvents();
    }
    setDeleting(false);
    setDeleteConfirm(null);
  }

  function handleEditEvent(event: Event) {
    setEditingEvent(event);
    setShowEventModal(true);
  }

  function handleCloseModal() {
    setShowEventModal(false);
    setEditingEvent(null);
  }

  if (authLoading) return <PageLoading />;

  const getEventColor = (type: string) => {
    switch (type) {
      case 'practice':
        return 'bg-blue-500';
      case 'game':
        return 'bg-green-500';
      case 'tournament':
        return 'bg-purple-500';
      case 'meeting':
        return 'bg-amber-500';
      default:
        return 'bg-slate-400';
    }
  };

  const getEventBadgeVariant = (type: string): 'default' | 'secondary' | 'success' => {
    switch (type) {
      case 'game':
        return 'success';
      case 'practice':
        return 'default';
      default:
        return 'secondary';
    }
  };

  const formatEventType = (type: string) => {
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const now = new Date();
  const upcomingEvents = events.filter(e => new Date(e.start_time) >= now).slice(0, 5);
  const currentMonth = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
  const monthEvents = events.filter(e => {
    const eventDate = new Date(e.start_time);
    return eventDate >= monthStart && eventDate <= monthEnd;
  });

  const stats = {
    practices: monthEvents.filter(e => e.event_type === 'practice').length,
    games: monthEvents.filter(e => e.event_type === 'game').length,
    total: monthEvents.length,
  };

  return (
    <>
      <Header
        title="Calendar"
        subtitle={isCoach ? 'Manage team schedule and events' : 'View your team schedule'}
      >
        {isCoach && (
          <Button onClick={() => setShowEventModal(true)}>
            <IconPlus size={16} className="mr-2" />
            Add Event
          </Button>
        )}
      </Header>
      <div className="p-8">
        {/* View Selector */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div role="tablist" aria-label="Calendar view options" className="flex items-center gap-2">
                <Button
                  role="tab"
                  aria-selected={view === 'month'}
                  variant={view === 'month' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setView('month')}
                >
                  Month
                </Button>
                <Button
                  role="tab"
                  aria-selected={view === 'week'}
                  variant={view === 'week' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setView('week')}
                >
                  Week
                </Button>
                <Button
                  role="tab"
                  aria-selected={view === 'list'}
                  variant={view === 'list' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setView('list')}
                >
                  List
                </Button>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-sm font-medium text-slate-900">{currentMonth}</p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setCurrentDate(new Date())}
                  >
                    Today
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Calendar Grid / List */}
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2">
            {view === 'month' || view === 'week' ? (
              <CalendarView
                events={events.map(e => ({
                  id: e.id,
                  title: e.name,
                  start_date: e.start_time,
                  end_date: e.end_time || undefined,
                  event_category: e.event_type as any,
                  location: e.location_venue || undefined,
                  description: e.description || undefined,
                }))}
                view={view}
                currentDate={currentDate}
                onDateChange={setCurrentDate}
                canAddEvents={isCoach}
                onEventClick={(event) => {
                  const fullEvent = events.find(e => e.id === event.id);
                  if (fullEvent && isCoach) {
                    handleEditEvent(fullEvent);
                  }
                }}
                onAddEvent={() => setShowEventModal(true)}
              />
            ) : (
              <Card glass>
                <CardHeader>
                  <h2 className="font-semibold text-slate-900">Schedule</h2>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="space-y-3 py-4">
                      {[1, 2, 3, 4].map(i => (
                        <div
                          key={i}
                          className="border border-slate-200 rounded-lg p-4 animate-pulse"
                          style={{ animationDelay: `${i * 100}ms` }}
                        >
                          <div className="flex items-start gap-3">
                            <div className="w-1 h-14 rounded-full bg-slate-200" />
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="h-5 bg-slate-200 rounded w-32" />
                                <div className="h-5 bg-slate-200 rounded-full w-16" />
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="h-4 bg-slate-200 rounded w-24" />
                                <div className="h-4 bg-slate-200 rounded w-20" />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : events.length === 0 ? (
                  /* Empty State */
                  <div className="text-center py-16">
                    <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                      <IconCalendar size={32} className="text-slate-400" />
                    </div>
                    <h3 className="text-lg font-medium text-slate-900 mb-2">No events scheduled</h3>
                    <p className="text-sm leading-relaxed text-slate-500 mb-6 max-w-md mx-auto">
                      {isCoach
                        ? 'Add practices, games, and team events to keep everyone on the same page.'
                        : 'Your team schedule will appear here once your coach adds events.'}
                    </p>
                    {isCoach && (
                      <Button onClick={() => setShowEventModal(true)}>
                        <IconPlus size={16} className="mr-2" />
                        Add First Event
                      </Button>
                    )}
                  </div>
                ) : (
                  /* Events List */
                  <div className="space-y-3">
                    {events.map((event) => (
                      <div
                        key={event.id}
                        className="border border-slate-200 rounded-lg p-4 hover:border-slate-300 hover:shadow-sm transition-all"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 flex-1">
                            <div className={`w-1 h-full rounded-full ${getEventColor(event.event_type)}`}></div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-semibold text-slate-900">{event.name}</h3>
                                <Badge variant={getEventBadgeVariant(event.event_type)}>
                                  {formatEventType(event.event_type)}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-4 text-sm text-slate-600 mb-2">
                                <span className="flex items-center gap-1">
                                  <IconCalendar size={14} />
                                  {formatDate(event.start_time)}
                                </span>
                                <span className="flex items-center gap-1">
                                  <IconClock size={14} />
                                  {formatTime(event.start_time)}
                                  {event.end_time && ` - ${formatTime(event.end_time)}`}
                                </span>
                              </div>
                              {(event.location_venue || event.location_city) && (
                                <p className="text-sm leading-relaxed text-slate-500 flex items-center gap-1 mb-2">
                                  <IconMapPin size={14} />
                                  {event.location_venue}
                                  {event.location_city && `, ${event.location_city}`}
                                  {event.location_state && `, ${event.location_state}`}
                                </p>
                              )}
                              {event.opponent && (
                                <p className="text-sm leading-relaxed text-slate-600 mb-2">
                                  vs {event.opponent} {event.home_away && `(${event.home_away})`}
                                </p>
                              )}
                              {event.description && (
                                <p className="text-sm leading-relaxed text-slate-500 line-clamp-2">{event.description}</p>
                              )}
                            </div>
                          </div>
                          {isCoach && (
                            <div className="flex items-center gap-2">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleEditEvent(event)}
                                aria-label={`Edit ${event.name}`}
                              >
                                <IconEdit size={14} />
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setDeleteConfirm(event.id)}
                                aria-label={`Delete ${event.name}`}
                              >
                                <IconTrash size={14} />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            )}
          </div>

          <div className="space-y-6">
            {/* Event Types Legend */}
            <Card glass>
              <CardHeader>
                <h2 className="font-semibold text-slate-900">Event Types</h2>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span className="text-sm leading-relaxed text-slate-600">Practice</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span className="text-sm leading-relaxed text-slate-600">Game</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                  <span className="text-sm leading-relaxed text-slate-600">Tournament</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                  <span className="text-sm leading-relaxed text-slate-600">Team Meeting</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-slate-400"></div>
                  <span className="text-sm leading-relaxed text-slate-600">Other</span>
                </div>
              </CardContent>
            </Card>

            {/* Upcoming Events */}
            <Card glass>
              <CardHeader>
                <h2 className="font-semibold text-slate-900">Upcoming</h2>
              </CardHeader>
              <CardContent>
                {upcomingEvents.length === 0 ? (
                  <div className="text-center py-8">
                    <IconCalendar size={32} className="text-slate-300 mx-auto mb-2" />
                    <p className="text-sm leading-relaxed text-slate-500">No upcoming events</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {upcomingEvents.map((event) => (
                      <div key={event.id} className="pb-3 border-b border-slate-200 last:border-0 last:pb-0">
                        <div className="flex items-start gap-2 mb-1">
                          <div className={`w-2 h-2 rounded-full mt-1.5 ${getEventColor(event.event_type)}`}></div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900 truncate">{event.name}</p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {formatDate(event.start_time)} • {formatTime(event.start_time)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <Card glass>
              <CardHeader>
                <h2 className="font-semibold text-slate-900">This Month</h2>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm leading-relaxed text-slate-600">Practices</span>
                  <span className="text-sm font-semibold text-slate-900">{stats.practices}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm leading-relaxed text-slate-600">Games</span>
                  <span className="text-sm font-semibold text-slate-900">{stats.games}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm leading-relaxed text-slate-600">Total Events</span>
                  <span className="text-sm font-semibold text-slate-900">{stats.total}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Event Modal */}
      {showEventModal && selectedTeamId && coach?.id && (
        <EventModal
          teamId={selectedTeamId}
          coachId={coach.id}
          event={editingEvent}
          onClose={handleCloseModal}
          onSuccess={() => {
            fetchEvents();
            handleCloseModal();
          }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={!!deleteConfirm}
        title="Delete Event"
        message="Are you sure you want to delete this event? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteConfirm(null)}
      />
    </>
  );
}

'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { useMediaQuery } from '@/hooks/use-media-query';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { CalendarHeader, type CalendarView } from '@/components/golf/calendar/CalendarHeader';
import { CalendarAvatarSidebar } from '@/components/golf/calendar/CalendarAvatarSidebar';
import { AvailabilityDayView } from '@/components/golf/calendar/AvailabilityDayView';
import { WeekView } from '@/components/golf/calendar/WeekView';
import { MonthView } from '@/components/golf/calendar/MonthView';
import { DayView } from '@/components/golf/calendar/DayView';
import { EventCard } from '@/components/golf/calendar/EventCard';
import { EventDetailModal, type GolfEventFormData } from '@/components/golf/calendar/EventDetailModal';
import { NotificationCenter } from '@/components/golf/calendar/NotificationCenter';
import { createGolfEvent, updateGolfEvent, deleteGolfEvent } from '@/app/golf/actions/golf';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';

export interface TeamMember {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url?: string;
}

type CalendarActionResult<T = unknown> = Promise<{ success: boolean; error?: string; data?: T }>;

// Action handler types for different sports - use generic types for flexibility
export interface CalendarActionHandlers {
  createEvent: (data: unknown) => CalendarActionResult<unknown>;
  updateEvent: (id: string, data: unknown) => CalendarActionResult<unknown>;
  deleteEvent: (id: string) => CalendarActionResult<unknown>;
}

// Default golf action handlers - wrap to match CalendarActionHandlers signature
const defaultActionHandlers: CalendarActionHandlers = {
  createEvent: (data: unknown) => createGolfEvent(data as Parameters<typeof createGolfEvent>[0]),
  updateEvent: (id: string, data: unknown) => updateGolfEvent(id, data as Parameters<typeof updateGolfEvent>[1]),
  deleteEvent: deleteGolfEvent,
};

export interface PremiumCalendarClientProps {
  initialEvents: CalendarEvent[];
  teamMembers: TeamMember[];
  isCoach?: boolean;
  onSyncSettings?: () => void;
  // Optional custom action handlers (defaults to golf actions)
  actionHandlers?: CalendarActionHandlers;
}

export function PremiumCalendarClient({
  initialEvents,
  teamMembers,
  isCoach = true,
  onSyncSettings,
  actionHandlers = defaultActionHandlers,
}: PremiumCalendarClientProps) {
  const router = useRouter();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [view, setView] = useState<CalendarView>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [showPlayerFilter, setShowPlayerFilter] = useState(false);

  // CRUD Modal State
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [isSavingEvent, setIsSavingEvent] = useState(false);

  // Drag-and-drop state
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  // Coach busy periods (always for current coach)
  const [coachBusyPeriods, setCoachBusyPeriods] = useState<Array<Record<string, unknown> & { start: string; end: string; ownerType?: 'coach' | 'player' }>>([]);

  // Player busy periods (only when player is selected)
  const [playerBusyPeriods, setPlayerBusyPeriods] = useState<Array<Record<string, unknown> & { start: string; end: string }>>([]);

  // Auto-switch to day view on mobile
  useEffect(() => {
    if (isMobile && view !== 'day') {
      setView('day');
    } else if (!isMobile && view === 'day' && !selectedPlayerId) {
      // Only switch back to week if not viewing a player's schedule
      setView('week');
    }
  }, [isMobile]); // Only run when mobile state changes

  // Fetch player availability when player is selected
  useEffect(() => {
    if (!selectedPlayerId) {
      setPlayerBusyPeriods([]);
      return;
    }

    const fetchPlayerAvailability = async () => {
      // Calculate date range based on current view
      let startDate: Date;
      let endDate: Date;

      if (view === 'day') {
        startDate = currentDate;
        endDate = currentDate;
      } else if (view === 'week') {
        startDate = startOfWeek(currentDate, { weekStartsOn: 0 });
        endDate = endOfWeek(currentDate, { weekStartsOn: 0 });
      } else {
        startDate = startOfMonth(currentDate);
        endDate = endOfMonth(currentDate);
      }

      // Import and use the action
      const { getPlayerAvailability } = await import('@/app/golf/actions/golf');
      const result = await getPlayerAvailability(
        selectedPlayerId,
        format(startDate, 'yyyy-MM-dd'),
        format(endDate, 'yyyy-MM-dd')
      );

      if (result.success && result.data) {
        // Keep as ISO strings for BusyPeriod interface
        const rawPeriods = result.data as unknown as Array<Record<string, unknown> & { start: string; end: string }>;
        const periods = rawPeriods.map((p) => ({
          ...p,
          start: p.start,
          end: p.end,
          type: (p.type as 'event' | 'class' | 'blocked') || 'event',
        })) as Array<Record<string, unknown> & { start: string; end: string }>;
        setPlayerBusyPeriods(periods);
      }
    };

    fetchPlayerAvailability();
  }, [selectedPlayerId, currentDate, view]);

  // Fetch current user's busy periods (works for both coaches and players)
  // This shows YOUR schedule when comparing availability with a selected team member
  useEffect(() => {
    // Only fetch if a team member is selected (comparing availability)
    if (!selectedPlayerId) {
      setCoachBusyPeriods([]);
      return;
    }

    const fetchCurrentUserAvailability = async () => {
      // Calculate date range based on current view
      let startDate: Date;
      let endDate: Date;

      if (view === 'day') {
        startDate = currentDate;
        endDate = currentDate;
      } else if (view === 'week') {
        startDate = startOfWeek(currentDate, { weekStartsOn: 0 });
        endDate = endOfWeek(currentDate, { weekStartsOn: 0 });
      } else {
        startDate = startOfMonth(currentDate);
        endDate = endOfMonth(currentDate);
      }

      // Import and use the action - this gets YOUR busy periods (events + classes)
      const { getCurrentUserBusyPeriods } = await import('@/app/golf/actions/golf');
      const result = await getCurrentUserBusyPeriods(
        format(startDate, 'yyyy-MM-dd'),
        format(endDate, 'yyyy-MM-dd')
      );

      if (result.success && result.data) {
        // Keep as ISO strings for BusyPeriod interface
        const rawPeriods = result.data as unknown as Array<Record<string, unknown> & { start: string; end: string }>;
        const periods = rawPeriods.map((p) => ({
          ...p,
          start: p.start,
          end: p.end,
          type: (p.type as 'event' | 'class' | 'blocked') || 'event',
          ownerType: isCoach ? 'coach' : 'player',
        })) as Array<Record<string, unknown> & { start: string; end: string; ownerType?: 'coach' | 'player' }>;
        setCoachBusyPeriods(periods);
      }
    };

    fetchCurrentUserAvailability();
  }, [currentDate, view, selectedPlayerId, isCoach]);

  // Configure drag sensors - require 8px movement before drag starts
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Get selected player object
  const selectedPlayer = useMemo(() => {
    if (!selectedPlayerId) return null;
    return teamMembers.find(m => m.id === selectedPlayerId) || null;
  }, [selectedPlayerId, teamMembers]);

  // All events are shown (no filtering needed)
  const filteredEvents = initialEvents;

  const handleNavigate = (direction: 'prev' | 'next' | 'today') => {
    if (direction === 'today') {
      setCurrentDate(new Date());
      return;
    }

    const newDate = new Date(currentDate);

    if (view === 'day') {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
    } else if (view === 'week') {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
    } else if (view === 'month') {
      newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
    }

    setCurrentDate(newDate);
  };

  // Event click opens detail/edit modal
  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setIsCreatingEvent(false);
    setIsEventModalOpen(true);
  };

  // Add event button opens create modal
  const handleAddEvent = () => {
    setSelectedEvent(null);
    setIsCreatingEvent(true);
    setIsEventModalOpen(true);
  };

  const handleDateClick = (date: Date) => {
    setCurrentDate(date);
    setView('day');
  };

  // Handle quick event creation from availability view
  const handleTimeSlotClick = (date: Date, _hour: number) => {
    void _hour;
    setCurrentDate(date);
    setIsCreatingEvent(true);
    setSelectedEvent(null);
    setIsEventModalOpen(true);
    // Modal will use currentDate for default date
  };

  // Save event (create or update)
  const handleSaveEvent = async (data: GolfEventFormData) => {
    setIsSavingEvent(true);
    try {
      if (isCreatingEvent) {
        const result = await actionHandlers.createEvent({
          title: data.title,
          eventType: data.eventType,
          startDate: data.startDate,
          endDate: data.endDate || undefined,
          startTime: data.startTime || undefined,
          endTime: data.endTime || undefined,
          allDay: data.allDay,
          location: data.location || undefined,
          courseName: data.courseName || undefined,
          description: data.description || undefined,
          isMandatory: data.isMandatory,
          requiresRsvp: data.requiresRsvp,
          rsvpDeadline: data.rsvpDeadline || undefined,
          maxAttendees: data.maxAttendees || undefined,
          attendeeIds: data.attendeeIds.length > 0 ? data.attendeeIds : undefined,
        });
        if (!result.success) {
          throw new Error(result.error || 'Failed to create event');
        }
      } else if (selectedEvent) {
        const result = await actionHandlers.updateEvent(selectedEvent.id, {
          title: data.title,
          eventType: data.eventType,
          startDate: data.startDate,
          endDate: data.endDate || undefined,
          startTime: data.startTime || undefined,
          endTime: data.endTime || undefined,
          allDay: data.allDay,
          location: data.location || undefined,
          courseName: data.courseName || undefined,
          description: data.description || undefined,
          isMandatory: data.isMandatory,
          requiresRsvp: data.requiresRsvp,
          rsvpDeadline: data.rsvpDeadline || undefined,
          maxAttendees: data.maxAttendees || undefined,
          attendeeIds: data.attendeeIds.length > 0 ? data.attendeeIds : undefined,
        });
        if (!result.success) {
          throw new Error(result.error || 'Failed to update event');
        }
      }
      setIsEventModalOpen(false);
      setSelectedEvent(null);
      router.refresh();
    } catch (error) {
      // Event save failed - re-throw for error handling
      throw error;
    } finally {
      setIsSavingEvent(false);
    }
  };

  // Delete event
  const handleDeleteEvent = async () => {
    if (!selectedEvent) return;
    setIsSavingEvent(true);
    try {
      const result = await actionHandlers.deleteEvent(selectedEvent.id);
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete event');
      }
      setIsEventModalOpen(false);
      setSelectedEvent(null);
      router.refresh();
    } catch (error) {
      // Event delete failed - re-throw for error handling
      throw error;
    } finally {
      setIsSavingEvent(false);
    }
  };

  // Drag start handler
  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  };

  // Drag end handler - reschedule event to new time slot
  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDragId(null);

    const { active, over } = event;
    if (!over) return;

    const eventId = active.id as string;
    const dropData = over.data.current as { type: string; date: string; hour: number } | undefined;

    if (!dropData || dropData.type !== 'timeSlot') return;

    // Find the dragged event
    const draggedEvent = initialEvents.find((e) => e.id === eventId);
    if (!draggedEvent) return;

    // Calculate new date and time
    const newDate = dropData.date;
    const newHour = dropData.hour;
    const newStartTime = `${String(newHour).padStart(2, '0')}:00:00`;

    // Calculate event duration if end_date exists
    let newEndTime: string | undefined;
    if (draggedEvent.end_date) {
      // Assume 1 hour duration for now
      const endHour = newHour + 1;
      newEndTime = `${String(endHour).padStart(2, '0')}:00:00`;
    }

    try {
      const result = await actionHandlers.updateEvent(eventId, {
        startDate: newDate,
        startTime: newStartTime,
        endTime: newEndTime,
      });

      if (!result.success) {
        // Reschedule failed - exit silently
        return;
      }

      router.refresh();
    } catch {
      // Reschedule failed - events will not update
    }
  };

  // Get the dragged event for overlay
  const draggedEvent = activeDragId
    ? initialEvents.find((e) => e.id === activeDragId)
    : null;

  const getWeekStart = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
  };

  const weekStart = view === 'week' ? getWeekStart(currentDate) : currentDate;

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-col md:flex-row h-full gap-4">
          {/* Premium Avatar Sidebar - Hidden on mobile, shown on desktop */}
          {!isMobile && (
            <CalendarAvatarSidebar
              teamMembers={teamMembers}
              selectedPlayerId={selectedPlayerId}
              onPlayerSelect={setSelectedPlayerId}
              onSyncSettings={onSyncSettings}
            />
          )}

          {/* Premium Glass Calendar Container */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              // Premium frosted glass - semi-transparent cream/white
              background: 'rgba(255, 253, 250, 0.6)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid rgba(255, 255, 255, 0.5)',
              borderRadius: '20px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.03), inset 0 1px 0 rgba(255,255,255,0.7)',
            }}
          >
            {/* Mobile Player Filter Header */}
            {isMobile && (
              <div className="px-4 py-3 border-b border-white/20 flex items-center justify-between">
                <button
                  onClick={() => setShowPlayerFilter(!showPlayerFilter)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/50 text-slate-700 text-sm font-medium min-h-[44px]"
                >
                  <span>
                    {selectedPlayerId 
                      ? teamMembers.find(m => m.id === selectedPlayerId)?.first_name || 'Player'
                      : 'All Players'}
                  </span>
                </button>
                <NotificationCenter />
              </div>
            )}

            {/* Mobile Player Filter Chips */}
            {isMobile && showPlayerFilter && (
              <div className="px-4 py-3 border-b border-white/20 overflow-x-auto scrollbar-hide">
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setSelectedPlayerId(null);
                      setShowPlayerFilter(false);
                    }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap min-h-[44px] transition-colors ${
                      !selectedPlayerId
                        ? 'bg-emerald-500 text-white'
                        : 'bg-white/50 text-slate-700'
                    }`}
                  >
                    <span className="text-sm font-medium">All</span>
                  </button>
                  {teamMembers.map((member) => (
                    <button
                      key={member.id}
                      onClick={() => {
                        setSelectedPlayerId(member.id === selectedPlayerId ? null : member.id);
                        setShowPlayerFilter(false);
                      }}
                      className={`flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap min-h-[44px] transition-colors ${
                        selectedPlayerId === member.id
                          ? 'bg-emerald-500 text-white'
                          : 'bg-white/50 text-slate-700'
                      }`}
                    >
                      {member.avatar_url ? (
                        <img
                          src={member.avatar_url}
                          alt={`${member.first_name} ${member.last_name}`}
                          className="w-6 h-6 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-slate-300 flex items-center justify-center">
                          <span className="text-xs font-medium text-slate-600">
                            {member.first_name[0]}{member.last_name[0]}
                          </span>
                        </div>
                      )}
                      <span className="text-sm font-medium">
                        {member.first_name} {member.last_name[0]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Header with Notification Center */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/20">
              <CalendarHeader
                view={view}
                onViewChange={setView}
                currentDate={currentDate}
                onNavigate={handleNavigate}
                onAddEvent={handleAddEvent}
              />
              {!isMobile && <NotificationCenter />}
            </div>

            {/* Availability Day View (when player selected) */}
            {selectedPlayer && view === 'day' ? (
              <div className="flex-1 overflow-y-auto p-6 overscroll-contain touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }} data-scroll-container>
                <AvailabilityDayView
                  date={currentDate}
                  coachBusyPeriods={coachBusyPeriods as unknown as import('./AvailabilityDayView').BusyPeriod[]}
                  playerBusyPeriods={playerBusyPeriods as unknown as import('./AvailabilityDayView').BusyPeriod[]}
                  selectedPlayer={selectedPlayer}
                  onTimeSlotClick={handleTimeSlotClick}
                />
              </div>
            ) : (
              <>
                {view === 'week' && (
                  <WeekView
                    weekStart={weekStart}
                    events={filteredEvents}
                    onEventClick={handleEventClick}
                    isDraggable={true}
                    playerBusyPeriods={selectedPlayer ? (playerBusyPeriods as unknown as import('./WeekView').BusyPeriod[]) : []}
                    selectedPlayerName={selectedPlayer ? `${selectedPlayer.first_name} ${selectedPlayer.last_name}` : undefined}
                  />
                )}

                {view === 'month' && (
                  <MonthView
                    month={currentDate}
                    events={filteredEvents}
                    onDateClick={handleDateClick}
                    onEventClick={handleEventClick}
                    isDraggable={true}
                  />
                )}

                {view === 'day' && (
                  <DayView
                    date={currentDate}
                    events={filteredEvents}
                    onEventClick={handleEventClick}
                    isDraggable={true}
                  />
                )}
              </>
            )}
          </div>
        </div>

        {/* Drag overlay - shows event being dragged */}
        <DragOverlay>
          {draggedEvent && (
            <div className="w-48 opacity-90">
              <EventCard
                id={draggedEvent.id}
                title={draggedEvent.title}
                type={draggedEvent.event_type}
                startTime={draggedEvent.start_date}
                endTime={draggedEvent.end_date || draggedEvent.start_date}
                location={draggedEvent.location || undefined}
                isOverlay
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Event Detail/Create Modal */}
      <EventDetailModal
        isOpen={isEventModalOpen}
        onClose={() => {
          setIsEventModalOpen(false);
          setSelectedEvent(null);
        }}
        event={selectedEvent}
        isCreating={isCreatingEvent}
        isCoach={isCoach}
        onSave={handleSaveEvent}
        onDelete={selectedEvent ? handleDeleteEvent : undefined}
        isSaving={isSavingEvent}
        teamPlayers={teamMembers}
      />
    </>
  );
}

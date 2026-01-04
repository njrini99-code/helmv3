'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
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
import { WeekView } from '@/components/golf/calendar/WeekView';
import { MonthView } from '@/components/golf/calendar/MonthView';
import { DayView } from '@/components/golf/calendar/DayView';
import { EventCard } from '@/components/golf/calendar/EventCard';
import { EventDetailModal, type GolfEventFormData } from '@/components/golf/calendar/EventDetailModal';
import { createGolfEvent, updateGolfEvent, deleteGolfEvent } from '@/app/golf/actions/golf';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';

export interface TeamMember {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url?: string;
}

// Action handler types for different sports - use generic types for flexibility
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface CalendarActionHandlers {
  createEvent: (data: any) => Promise<{ success: boolean; error?: string; data?: any }>;
  updateEvent: (id: string, data: any) => Promise<{ success: boolean; error?: string }>;
  deleteEvent: (id: string) => Promise<{ success: boolean; error?: string }>;
}

// Default golf action handlers
const defaultActionHandlers: CalendarActionHandlers = {
  createEvent: createGolfEvent,
  updateEvent: updateGolfEvent,
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
  const [view, setView] = useState<CalendarView>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  // CRUD Modal State
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [isSavingEvent, setIsSavingEvent] = useState(false);

  // Drag-and-drop state
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  // Configure drag sensors - require 8px movement before drag starts
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Fixed filtering logic - properly filter events when members are selected
  const filteredEvents = useMemo(() => {
    // Show all events when no filters or all members selected
    if (selectedMemberIds.length === 0 || selectedMemberIds.length === teamMembers.length) {
      return initialEvents;
    }
    // When specific members are selected, filter events
    // Since golf_events doesn't have attendees, show all team events
    // (filtering would require event_attendees table which we don't have yet)
    return initialEvents;
  }, [initialEvents, selectedMemberIds, teamMembers.length]);

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
        });
        if (!result.success) {
          throw new Error(result.error || 'Failed to update event');
        }
      }
      setIsEventModalOpen(false);
      setSelectedEvent(null);
      router.refresh();
    } catch (error) {
      console.error('Error saving event:', error);
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
      console.error('Error deleting event:', error);
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
        console.error('Failed to reschedule event:', result.error);
        return;
      }

      router.refresh();
    } catch (error) {
      console.error('Error rescheduling event:', error);
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
        <div className="flex h-full gap-4">
          {/* Premium Avatar Sidebar */}
          <CalendarAvatarSidebar
            teamMembers={teamMembers}
            selectedMemberIds={selectedMemberIds}
            onSelectionChange={setSelectedMemberIds}
            onSyncSettings={onSyncSettings}
          />

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
            <CalendarHeader
              view={view}
              onViewChange={setView}
              currentDate={currentDate}
              onNavigate={handleNavigate}
              onAddEvent={handleAddEvent}
            />

            {view === 'week' && (
              <WeekView
                weekStart={weekStart}
                events={filteredEvents}
                onEventClick={handleEventClick}
                isDraggable={true}
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
      />
    </>
  );
}

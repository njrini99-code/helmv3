'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMediaQuery } from '@/hooks/use-media-query';
import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import { CalendarHeader, type BaseballCalendarView } from './CalendarHeader';
import { MonthView, type BaseballCalendarEvent } from './MonthView';
import { WeekView } from './WeekView';
import { DayView } from './DayView';
import { EventListView } from './EventListView';
import { QuickAddEventFAB, type BaseballEventType } from './QuickAddEventFAB';
import { BaseballEventDetailModal, type BaseballEventFormData } from './EventDetailModal';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';

// ============================================================================
// Types
// ============================================================================

export interface TeamMember {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url?: string;
}

type CalendarActionResult<T = unknown> = Promise<{ success: boolean; error?: string; data?: T }>;

export interface CalendarActionHandlers {
  createEvent: (data: unknown) => CalendarActionResult<unknown>;
  updateEvent: (id: string, data: unknown) => CalendarActionResult<unknown>;
  deleteEvent: (id: string) => CalendarActionResult<unknown>;
}

interface BaseballCalendarClientProps {
  initialEvents: CalendarEvent[];
  teamMembers: TeamMember[];
  isCoach?: boolean;
  currentUserId?: string;
  actionHandlers: CalendarActionHandlers;
}

// ============================================================================
// Helpers
// ============================================================================

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  return new Date(d.setDate(diff));
}

function toBaseballEvent(event: CalendarEvent): BaseballCalendarEvent {
  return {
    id: event.id,
    title: event.title,
    event_type: event.event_type,
    start_date: event.start_date,
    end_date: event.end_date,
    start_time: event.start_time,
    end_time: event.end_time,
    location: event.location,
    description: event.description,
    is_mandatory: false,
    rsvp_going_count: 0,
    rsvp_maybe_count: 0,
    rsvp_not_going_count: 0,
    rsvp_pending_count: 0,
    rsvp_total_count: 0,
    max_attendees: null,
    rsvp_deadline: null,
    created_by: null,
  };
}

const calendarSpring = {
  viewTransition: { type: 'spring' as const, stiffness: 300, damping: 28 },
};

// ============================================================================
// Component
// ============================================================================

export function BaseballCalendarClient({
  initialEvents,
  teamMembers,
  isCoach = true,
  currentUserId,
  actionHandlers,
}: BaseballCalendarClientProps) {
  const router = useRouter();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const prefersReducedMotion = useReducedMotion();

  // State
  const [view, setView] = useState<BaseballCalendarView>(isMobile ? 'day' : 'week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<BaseballCalendarEvent | null>(null);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [initialEventType, setInitialEventType] = useState<BaseballEventType | undefined>(undefined);

  // Convert events to baseball format
  const baseballEvents = useMemo(() => initialEvents.map(toBaseballEvent), [initialEvents]);

  // Auto-switch view on mobile/desktop
  useEffect(() => {
    if (isMobile && view !== 'day' && view !== 'list') {
      setView('day');
    } else if (!isMobile && (view === 'list' || view === 'day')) {
      setView('week');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile]);

  // Navigation
  const handleNavigate = useCallback((direction: 'prev' | 'next' | 'today') => {
    if (direction === 'today') {
      setCurrentDate(new Date());
      return;
    }

    const newDate = new Date(currentDate);
    if (view === 'day' || view === 'list') {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
    } else if (view === 'week') {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
    } else if (view === 'month') {
      newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
    }
    setCurrentDate(newDate);
  }, [currentDate, view]);

  // Event handlers
  const handleEventClick = useCallback((event: BaseballCalendarEvent) => {
    setSelectedEvent(event);
    setIsCreatingEvent(false);
    setInitialEventType(undefined);
    setIsEventModalOpen(true);
  }, []);

  const handleAddEvent = useCallback((eventType?: BaseballEventType) => {
    setSelectedEvent(null);
    setIsCreatingEvent(true);
    setInitialEventType(eventType);
    setIsEventModalOpen(true);
  }, []);

  const handleDateClick = useCallback((date: Date) => {
    setCurrentDate(date);
    setView('day');
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsEventModalOpen(false);
    setSelectedEvent(null);
    setInitialEventType(undefined);
  }, []);

  // Save event
  const handleSaveEvent = useCallback(async (data: BaseballEventFormData) => {
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
      handleCloseModal();
      router.refresh();
    } finally {
      setIsSavingEvent(false);
    }
  }, [isCreatingEvent, selectedEvent, actionHandlers, handleCloseModal, router]);

  // Delete event
  const handleDeleteEvent = useCallback(async () => {
    if (!selectedEvent) return;
    setIsSavingEvent(true);
    try {
      const result = await actionHandlers.deleteEvent(selectedEvent.id);
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete event');
      }
      handleCloseModal();
      router.refresh();
    } finally {
      setIsSavingEvent(false);
    }
  }, [selectedEvent, actionHandlers, handleCloseModal, router]);

  const weekStart = view === 'week' ? getWeekStart(currentDate) : currentDate;

  // Convert selected event for modal - add initial event type for new events
  const modalEvent = selectedEvent
    ? {
        id: selectedEvent.id,
        title: selectedEvent.title,
        event_type: selectedEvent.event_type,
        start_date: selectedEvent.start_date,
        end_date: selectedEvent.end_date,
        start_time: selectedEvent.start_time,
        end_time: selectedEvent.end_time,
        location: selectedEvent.location,
        description: selectedEvent.description,
        is_mandatory: selectedEvent.is_mandatory,
        requires_rsvp: false,
        rsvp_deadline: selectedEvent.rsvp_deadline,
        max_attendees: selectedEvent.max_attendees,
      }
    : initialEventType
    ? {
        id: '',
        title: '',
        event_type: initialEventType,
        start_date: currentDate.toISOString().slice(0, 10),
        end_date: null,
        start_time: null,
        end_time: null,
        location: null,
        description: null,
        is_mandatory: false,
        requires_rsvp: false,
        rsvp_deadline: null,
        max_attendees: null,
      }
    : null;

  return (
    <>
      {/* Main Calendar Container */}
      <div
        className="flex flex-col h-full overflow-hidden"
        style={{
          background: 'rgba(255, 253, 250, 0.6)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(255, 255, 255, 0.5)',
          borderRadius: '20px',
          boxShadow:
            '0 8px 32px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.03), inset 0 1px 0 rgba(255,255,255,0.7)',
        }}
      >
        {/* Header */}
        <CalendarHeader
          view={view}
          onViewChange={setView}
          currentDate={currentDate}
          onNavigate={handleNavigate}
          onAddEvent={isCoach ? () => handleAddEvent() : undefined}
        />

        {/* Calendar View Content */}
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={view}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0, y: -4 }}
            transition={prefersReducedMotion ? { duration: 0 } : calendarSpring.viewTransition}
            className="flex-1 flex flex-col min-h-0"
          >
            {view === 'month' && (
              <MonthView
                month={currentDate}
                events={baseballEvents}
                onDateClick={handleDateClick}
                onEventClick={handleEventClick}
              />
            )}

            {view === 'week' && (
              <WeekView
                weekStart={weekStart}
                events={baseballEvents}
                onEventClick={handleEventClick}
                onDateClick={handleDateClick}
              />
            )}

            {view === 'day' && (
              <DayView
                date={currentDate}
                events={baseballEvents}
                onEventClick={handleEventClick}
                onDateChange={setCurrentDate}
              />
            )}

            {view === 'list' && (
              <EventListView events={baseballEvents} onEventClick={handleEventClick} />
            )}
          </m.div>
        </AnimatePresence>
      </div>

      {/* Event Detail Modal */}
      <BaseballEventDetailModal
        isOpen={isEventModalOpen}
        onClose={handleCloseModal}
        event={modalEvent}
        isCreating={isCreatingEvent}
        isCoach={isCoach}
        onSave={handleSaveEvent}
        onDelete={selectedEvent && isCoach ? handleDeleteEvent : undefined}
        isSaving={isSavingEvent}
        teamPlayers={teamMembers}
        currentUserId={currentUserId}
      />

      {/* Mobile FAB for quick event creation (coaches only) */}
      {isMobile && isCoach && (
        <QuickAddEventFAB onAddEvent={handleAddEvent} />
      )}
    </>
  );
}

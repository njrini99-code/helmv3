'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { format, startOfWeek as startOfWeekFn, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { useMediaQuery } from '@/hooks/use-media-query';
import { toast } from '@/components/ui/sonner';
import { useMobileDetection } from '@/hooks/use-mobile-detection';
import { triggerHaptic } from '@/lib/utils/capacitor';
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
import { CalendarAvatarSidebar, PLAYER_COLORS } from '@/components/golf/calendar/CalendarAvatarSidebar';
import { AvailabilityDayView } from '@/components/golf/calendar/AvailabilityDayView';
import { WeekView } from '@/components/golf/calendar/WeekView';
import { MonthView } from '@/components/golf/calendar/MonthView';
import { DayView } from '@/components/golf/calendar/DayView';
import { EventCard } from '@/components/golf/calendar/EventCard';
import { EventDetailModal, type GolfEventFormData } from '@/components/golf/calendar/EventDetailModal';
import { NotificationCenter } from '@/components/golf/calendar/NotificationCenter';
import { MobileEventSheet, type MobileEventFormData } from '@/components/golf/calendar/MobileEventSheet';
import { CalendarDayViewSwipeable } from '@/components/golf/calendar/CalendarDayViewSwipeable';
import { QuickAddEventFAB } from '@/components/golf/calendar/QuickAddEventFAB';
import type { RSVPResponse } from '@/components/golf/calendar/MobileRSVPButtons';
import '@/styles/calendar-tokens.css';
import { usePlayerEventRSVP, useEventRSVP } from '@/hooks/useRSVP';
import { useCalendarKeyboard } from '@/hooks/golf/use-calendar-keyboard';
import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import { calendarSpring } from '@/lib/motion';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import { Button } from '@/components/ui/button';

export interface TeamMember {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url?: string;
}

type CalendarActionResult<T = unknown> = Promise<{ success: boolean; error?: string; data?: T }>;

// Action handler types for different sports - use generic types for flexibility
interface CalendarActionHandlers {
  createEvent: (data: unknown) => CalendarActionResult<unknown>;
  updateEvent: (id: string, data: unknown) => CalendarActionResult<unknown>;
  deleteEvent: (id: string) => CalendarActionResult<unknown>;
}

async function loadGolfCalendarActions() {
  return import('@/app/golf/actions/golf');
}

// Default golf action handlers - wrap to match CalendarActionHandlers signature
const defaultActionHandlers: CalendarActionHandlers = {
  createEvent: async (data: unknown) => {
    const { createGolfEvent } = await loadGolfCalendarActions();
    return createGolfEvent(data as never);
  },
  updateEvent: async (id: string, data: unknown) => {
    const { updateGolfEvent } = await loadGolfCalendarActions();
    return updateGolfEvent(id, data as never);
  },
  deleteEvent: async (id: string) => {
    const { deleteGolfEvent } = await loadGolfCalendarActions();
    return deleteGolfEvent(id);
  },
};

interface PremiumCalendarClientProps {
  initialEvents: CalendarEvent[];
  teamMembers: TeamMember[];
  isCoach?: boolean;
  currentUserId?: string; // Current user's coach/player ID to exclude from attendee lists
  onSyncSettings?: () => void;
  // Optional custom action handlers (defaults to golf actions)
  actionHandlers?: CalendarActionHandlers;
  teamTimezone?: string | null;
  teamId?: string;
  /**
   * Optional initial view to seed the legacy grid with — used by the new
   * EditorialCalendarSurface so picking "Month" in the editorial tab bar
   * actually renders a month grid (rather than the legacy default of week).
   */
  initialView?: CalendarView;
  /**
   * Optional initial focus date — used by the editorial surface to land on
   * the week the user navigated to via the day strip.
   */
  initialDate?: Date;
}

export function PremiumCalendarClient({
  initialEvents,
  teamMembers,
  isCoach = true,
  currentUserId,
  onSyncSettings,
  actionHandlers = defaultActionHandlers,
  teamTimezone,
  teamId: teamIdProp,
  initialView,
  initialDate,
}: PremiumCalendarClientProps) {
  const router = useRouter();
  const isMobileQuery = useMediaQuery('(max-width: 768px)');
  const { isMobile: isMobileDevice, isTablet, preferMobileUI } = useMobileDetection();

  // Use either media query or device detection for mobile UI
  const isMobile = isMobileQuery || (isMobileDevice && preferMobileUI);
  const showMobileUI = isMobile || (isTablet && preferMobileUI);
  const prefersReducedMotion = useReducedMotion();

  const [view, setView] = useState<CalendarView>(initialView ?? 'week');
  // Initialize to midnight today so server and client produce identical HTML
  // during hydration (avoids React error #418 when SSR timestamp differs).
  const [currentDate, setCurrentDate] = useState(() => {
    if (initialDate) {
      return new Date(initialDate.getFullYear(), initialDate.getMonth(), initialDate.getDate());
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  });
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [showPlayerFilter, setShowPlayerFilter] = useState(false);
  const [secondaryTimezone, setSecondaryTimezone] = useState<string | null>(null);

  // CRUD Modal State
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [isSavingEvent, setIsSavingEvent] = useState(false);

  // Mobile Sheet State
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);
  // Track initial event type for pre-filling from quick-add FAB
  const [initialEventType, setInitialEventType] = useState<string | undefined>(undefined);

  // RSVP State - Track user's RSVP status for all events
  const [userRsvpStatuses, setUserRsvpStatuses] = useState<Map<string, RSVPResponse>>(new Map());

  // Get RSVP status for selected event (for mobile sheet)
  const { status: selectedEventRsvpStatus } = usePlayerEventRSVP(
    selectedEvent?.id,
    !isCoach && !!selectedEvent
  );

  // Get RSVP summary for coaches viewing an event
  const { rsvpSummary: selectedEventRsvpSummary } = useEventRSVP(
    isCoach && selectedEvent?.id ? selectedEvent.id : ''
  );

  // Drag-and-drop state
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  // Coach busy periods (always for current coach)
  const [coachBusyPeriods, setCoachBusyPeriods] = useState<Array<Record<string, unknown> & { start: string; end: string; ownerType?: 'coach' | 'player' }>>([]);

  // Multi-player busy periods with colors (keyed by player ID)
  const [multiPlayerBusyPeriods, setMultiPlayerBusyPeriods] = useState<Map<string, Array<Record<string, unknown> & { start: string; end: string; color: typeof PLAYER_COLORS[0] }>>>(new Map());

  // For backward compatibility - flatten all player busy periods
  const playerBusyPeriods = Array.from(multiPlayerBusyPeriods.values()).flat();

  // Auto-switch to list view on mobile (more touch-friendly than day view)
  useEffect(() => {
    if (showMobileUI && view !== 'day') {
      // Mobile defaults to day/list view
      setView('day');
    } else if (!showMobileUI && view === 'day' && selectedPlayerIds.length === 0) {
      // Only switch back to week if not viewing any player's schedule
      setView('week');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- Only run when mobile/desktop state changes, not on every view change
  }, [showMobileUI]);

  // Handle RSVP for a specific event (used by mobile list view)
  const handleRsvp = useCallback(async (eventId: string, response: RSVPResponse): Promise<{ success: boolean; error?: string }> => {
    try {
      const { respondToEvent } = await loadGolfCalendarActions();
      const result = await respondToEvent(eventId, response as 'accepted' | 'tentative' | 'declined' | 'pending');
      if (result.success) {
        // Update local state optimistically
        setUserRsvpStatuses((prev) => {
          const next = new Map(prev);
          next.set(eventId, response);
          return next;
        });
        return { success: true };
      }
      return { success: false, error: result.error || 'Failed to update RSVP' };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }, []);

  // Handle RSVP from mobile sheet for selected event
  const handleMobileSheetRsvp = useCallback(async (response: RSVPResponse): Promise<{ success: boolean; error?: string }> => {
    if (!selectedEvent) return { success: false, error: 'No event selected' };
    return handleRsvp(selectedEvent.id, response);
  }, [selectedEvent, handleRsvp]);

  // Debounce ref for availability fetch
  const availabilityDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch player availability when players are selected (multi-select) — debounced 300ms
  useEffect(() => {
    if (selectedPlayerIds.length === 0) {
      setMultiPlayerBusyPeriods(new Map());
      return;
    }

    if (availabilityDebounceRef.current) {
      clearTimeout(availabilityDebounceRef.current);
    }

    availabilityDebounceRef.current = setTimeout(() => {
      const fetchAllPlayerAvailability = async () => {
        try {
          // Calculate date range based on current view
          let startDate: Date;
          let endDate: Date;

          if (view === 'day') {
            startDate = currentDate;
            endDate = currentDate;
          } else if (view === 'week') {
            startDate = startOfWeekFn(currentDate, { weekStartsOn: 0 });
            endDate = endOfWeek(currentDate, { weekStartsOn: 0 });
          } else {
            startDate = startOfMonth(currentDate);
            endDate = endOfMonth(currentDate);
          }

          // Import and use the action
          const { getPlayerAvailability } = await import('@/app/golf/actions/golf');

          // Fetch availability for all selected players in parallel
          const results = await Promise.all(
            selectedPlayerIds.map(async (playerId, index) => {
              try {
                const result = await getPlayerAvailability(
                  playerId,
                  format(startDate, 'yyyy-MM-dd'),
                  format(endDate, 'yyyy-MM-dd')
                );

                const color = PLAYER_COLORS[index % PLAYER_COLORS.length];

                if (result.success && result.data) {
                  const rawPeriods = result.data as unknown as Array<Record<string, unknown> & { start: string; end: string }>;
                  const periods = rawPeriods.map((p) => ({
                    ...p,
                    start: p.start,
                    end: p.end,
                    type: (p.type as 'event' | 'class' | 'blocked') || 'event',
                    color,
                    playerId,
                  })) as Array<Record<string, unknown> & { start: string; end: string; color: typeof PLAYER_COLORS[0] }>;
                  return { playerId, periods };
                }
              } catch {
                // Individual player fetch failed — return empty so others still show
              }
              return { playerId, periods: [] as Array<Record<string, unknown> & { start: string; end: string; color: typeof PLAYER_COLORS[0] }> };
            })
          );

          // Build the map of player ID -> busy periods
          const newMap = new Map<string, Array<Record<string, unknown> & { start: string; end: string; color: typeof PLAYER_COLORS[0] }>>();
          results.forEach(({ playerId, periods }) => {
            newMap.set(playerId, periods);
          });
          setMultiPlayerBusyPeriods(newMap);
        } catch {
          // Entire availability fetch failed — silently degrade (calendar still works, just no availability overlay)
          console.warn('[PremiumCalendarClient] Failed to fetch player availability');
        }
      };

      fetchAllPlayerAvailability();
    }, 300);

    return () => {
      if (availabilityDebounceRef.current) {
        clearTimeout(availabilityDebounceRef.current);
      }
    };
  }, [selectedPlayerIds, currentDate, view]);

  // Fetch current user's busy periods (works for both coaches and players)
  // This shows YOUR schedule when comparing availability with selected team members
  useEffect(() => {
    // Only fetch if team members are selected (comparing availability)
    if (selectedPlayerIds.length === 0) {
      setCoachBusyPeriods([]);
      return;
    }

    const fetchCurrentUserAvailability = async () => {
      try {
        // Calculate date range based on current view
        let startDate: Date;
        let endDate: Date;

        if (view === 'day') {
          startDate = currentDate;
          endDate = currentDate;
        } else if (view === 'week') {
          startDate = startOfWeekFn(currentDate, { weekStartsOn: 0 });
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
      } catch {
        // Availability fetch failed — calendar still works, just no busy-period overlay
        console.warn('[PremiumCalendarClient] Failed to fetch current user availability');
      }
    };

    fetchCurrentUserAvailability();
  }, [currentDate, view, selectedPlayerIds, isCoach]);

  // Real-time subscription for calendar events — refresh on any change
  useEffect(() => {
    // Derive teamId from prop, events, or team members
    const teamId = teamIdProp || initialEvents[0]?.team_id || (teamMembers[0] as unknown as Record<string, unknown> | undefined)?.team_id as string | undefined;
    if (!teamId) return;

    const supabase = createClient();
    const channel = supabase
      .channel('calendar-events')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'golf_events',
          filter: `team_id=eq.${teamId}`,
        },
        () => {
          router.refresh();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [teamIdProp, initialEvents, teamMembers, router]);

  // Configure drag sensors - require 8px movement before drag starts
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Get selected player objects with their assigned colors
  const selectedPlayers = useMemo(() => {
    return selectedPlayerIds
      .map((id, index) => {
        const member = teamMembers.find(m => m.id === id);
        if (!member) return null;
        return {
          ...member,
          color: PLAYER_COLORS[index % PLAYER_COLORS.length],
        };
      })
      .filter((m): m is TeamMember & { color: typeof PLAYER_COLORS[0] } => m !== null);
  }, [selectedPlayerIds, teamMembers]);

  // For backward compatibility - first selected player
  const selectedPlayer = selectedPlayers[0] || null;

  // When no players are selected (ALL mode), show all team events
  // When players are selected, still show all team events (availability overlay handles the rest)
  const filteredEvents = initialEvents;

  // When ALL is clicked (selection cleared), reset to week view if we were in day/availability mode
  useEffect(() => {
    if (selectedPlayerIds.length === 0 && !showMobileUI && view === 'day') {
      setView('week');
    }
  }, [selectedPlayerIds.length]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Event click opens detail/edit modal (or mobile sheet on mobile)
  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setIsCreatingEvent(false);
    if (showMobileUI) {
      setIsMobileSheetOpen(true);
    } else {
      setIsEventModalOpen(true);
    }
  };

  // Add event button opens create modal (or mobile sheet on mobile)
  const handleAddEvent = () => {
    setSelectedEvent(null);
    setIsCreatingEvent(true);
    if (showMobileUI) {
      setIsMobileSheetOpen(true);
    } else {
      setIsEventModalOpen(true);
    }
  };

  const handleDateClick = (date: Date) => {
    setCurrentDate(date);
    setView('day');
  };

  // Desktop keyboard shortcuts (J/K/T/N/1/2/3)
  useCalendarKeyboard({
    enabled: !showMobileUI,
    isModalOpen: isEventModalOpen || isMobileSheetOpen,
    onNavigatePrev: () => handleNavigate('prev'),
    onNavigateNext: () => handleNavigate('next'),
    onToday: () => handleNavigate('today'),
    onNewEvent: isCoach ? handleAddEvent : undefined,
    onViewDay: () => setView('day'),
    onViewWeek: () => setView('week'),
    onViewMonth: () => setView('month'),
  });

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
    const timezoneOffset = new Date().getTimezoneOffset();
    try {
      if (isCreatingEvent) {
        if (data.recurrence && data.recurrence !== 'none') {
          // Build a minimal RRULE; createRecurringEvent expands into one row
          // per occurrence under the hood since golf_events has no
          // parent_event_id column.
          const freq = data.recurrence.toUpperCase();
          const recurrenceRule = `RRULE:FREQ=${freq};INTERVAL=1;COUNT=${data.recurrenceCount}`;
          const { createRecurringEvent } = await import('@/app/golf/actions/recurring-events');
          const result = await createRecurringEvent({
            title: data.title,
            eventType: data.eventType,
            startDate: data.startDate,
            endDate: data.endDate || undefined,
            startTime: data.allDay ? undefined : (data.startTime || undefined),
            endTime: data.allDay ? undefined : (data.endTime || undefined),
            location: data.location || undefined,
            description: data.description || undefined,
            recurrenceRule,
            requiresRsvp: data.requiresRsvp,
            rsvpDeadline: data.rsvpDeadline || undefined,
            maxAttendees: data.maxAttendees || undefined,
            timezoneOffset,
          });
          if (!result.success) {
            throw new Error(result.error || 'Failed to create recurring event');
          }
        } else {
          const result = await actionHandlers.createEvent({
            title: data.title,
            eventType: data.eventType,
            startDate: data.startDate,
            endDate: data.endDate || undefined,
            startTime: data.allDay ? undefined : (data.startTime || undefined),
            endTime: data.allDay ? undefined : (data.endTime || undefined),
            allDay: data.allDay,
            location: data.location || undefined,
            courseName: data.courseName || undefined,
            description: data.description || undefined,
            isMandatory: data.isMandatory,
            requiresRsvp: data.requiresRsvp,
            rsvpDeadline: data.rsvpDeadline || undefined,
            maxAttendees: data.maxAttendees || undefined,
            attendeeIds: data.attendeeIds.length > 0 ? data.attendeeIds : undefined,
            timezoneOffset,
          });
          if (!result.success) {
            throw new Error(result.error || 'Failed to create event');
          }
        }
      } else if (selectedEvent) {
        // Series-scoped edits route to editRecurringEvent so siblings are
        // updated together. 'this' (or no scope) takes the regular update
        // path so the action's existing logic for attendees / RSVP / etc.
        // continues to apply.
        if (data.editScope && data.editScope !== 'this') {
          const { editRecurringEvent } = await import('@/app/golf/actions/recurring-events');
          const result = await editRecurringEvent({
            eventId: selectedEvent.id,
            originalStartDate: selectedEvent.start_date,
            scope: data.editScope,
            timezoneOffset,
            updates: {
              title: data.title,
              description: data.description || undefined,
              startDate: data.startDate,
              endDate: data.endDate || data.startDate,
              startTime: data.allDay ? undefined : (data.startTime || undefined),
              endTime: data.allDay ? undefined : (data.endTime || undefined),
              location: data.location || undefined,
            },
          });
          if (!result.success) {
            throw new Error(result.error || 'Failed to update recurring event');
          }
        } else {
          const result = await actionHandlers.updateEvent(selectedEvent.id, {
            title: data.title,
            eventType: data.eventType,
            startDate: data.startDate,
            // Always send endDate so the server preserves the date range.
            endDate: data.endDate || data.startDate,
            startTime: data.allDay ? undefined : (data.startTime || undefined),
            endTime: data.allDay ? undefined : (data.endTime || undefined),
            allDay: data.allDay,
            location: data.location || undefined,
            courseName: data.courseName || undefined,
            description: data.description || undefined,
            isMandatory: data.isMandatory,
            requiresRsvp: data.requiresRsvp,
            rsvpDeadline: data.rsvpDeadline || undefined,
            maxAttendees: data.maxAttendees || undefined,
            attendeeIds: data.attendeeIds.length > 0 ? data.attendeeIds : undefined,
            timezoneOffset,
          });
          if (!result.success) {
            throw new Error(result.error || 'Failed to update event');
          }
        }
      }
      setIsEventModalOpen(false);
      setSelectedEvent(null);
      router.refresh();
    } catch (err) {
      // Stale deployment: server action IDs changed after a new deploy
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('server action') && msg.toLowerCase().includes('not found')) {
        window.location.reload();
        return;
      }
      toast.error('Save failed', msg || 'Failed to save event. Please try again.');
    } finally {
      setIsSavingEvent(false);
    }
  };

  // Delete event. When the modal hands us a scope (this/future/all), the
  // event is part of a recurring series and we route to deleteRecurringEvent
  // so siblings get the same treatment.
  const handleDeleteEvent = async (scope?: 'this' | 'thisAndFuture' | 'all') => {
    if (!selectedEvent) return;
    setIsSavingEvent(true);
    try {
      if (scope && scope !== 'this') {
        const { deleteRecurringEvent } = await import('@/app/golf/actions/recurring-events');
        const result = await deleteRecurringEvent(
          selectedEvent.id,
          selectedEvent.start_date,
          scope,
        );
        if (!result.success) {
          throw new Error(result.error || 'Failed to delete recurring event');
        }
      } else {
        const result = await actionHandlers.deleteEvent(selectedEvent.id);
        if (!result.success) {
          throw new Error(result.error || 'Failed to delete event');
        }
      }
      setIsEventModalOpen(false);
      setSelectedEvent(null);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('server action') && msg.toLowerCase().includes('not found')) {
        window.location.reload();
        return;
      }
      throw err;
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

    void triggerHaptic('medium');

    // Calculate new date and time
    const newDate = dropData.date;
    const newHour = dropData.hour;
    const newStartTime = `${String(newHour).padStart(2, '0')}:00`;

    // Preserve original event duration
    let newEndTime: string | undefined;
    if (draggedEvent.start_date && draggedEvent.end_date) {
      const originalStart = new Date(draggedEvent.start_date);
      const originalEnd = new Date(draggedEvent.end_date);
      const durationMs = originalEnd.getTime() - originalStart.getTime();
      const durationHours = durationMs / (1000 * 60 * 60);

      if (durationHours > 0 && durationHours < 24) {
        const endHour = newHour + Math.floor(durationHours);
        const endMinute = Math.round((durationHours % 1) * 60);
        const clampedHour = Math.min(endHour, 23);
        const clampedMinute = endHour > 23 ? 59 : endMinute;
        newEndTime = `${String(clampedHour).padStart(2, '0')}:${String(clampedMinute).padStart(2, '0')}`;
      } else {
        // Fallback: 1 hour duration
        const endHour = Math.min(newHour + 1, 23);
        newEndTime = `${String(endHour).padStart(2, '0')}:00`;
      }
    } else {
      // No end date — default 1 hour
      const endHour = Math.min(newHour + 1, 23);
      newEndTime = `${String(endHour).padStart(2, '0')}:00`;
    }

    try {
      const result = await actionHandlers.updateEvent(eventId, {
        startDate: newDate,
        endDate: newDate,
        startTime: newStartTime,
        endTime: newEndTime,
        allDay: false,
        timezoneOffset: new Date().getTimezoneOffset(),
      });

      if (!result.success) {
        console.error('Failed to reschedule event:', result.error);
        return;
      }

      router.refresh();
    } catch (err) {
      console.error('Failed to reschedule event:', err);
    }
  };

  // Get the dragged event for overlay
  const draggedEvent = activeDragId
    ? initialEvents.find((e) => e.id === activeDragId)
    : null;

  const weekStart = view === 'week' ? startOfWeekFn(currentDate, { weekStartsOn: 0 }) : currentDate;

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-col md:flex-row h-full gap-4" style={{ minHeight: 0 }}>
          {/* Premium Avatar Sidebar - Hidden on mobile, shown on desktop */}
          {!isMobile && (
            <div style={{ display: 'flex', flexShrink: 0, minHeight: 0, maxHeight: '100%' }}>
              <CalendarAvatarSidebar
                teamMembers={teamMembers}
                selectedPlayerIds={selectedPlayerIds}
                onPlayerSelect={setSelectedPlayerIds}
                onSyncSettings={onSyncSettings}
              />
            </div>
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
                <Button variant="ghost"
                  onClick={() => setShowPlayerFilter(!showPlayerFilter)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-cream-100/60 text-warm-700 text-sm font-medium min-h-[44px]"
                >
                  <span>
                    {selectedPlayerIds.length > 0
                      ? `${selectedPlayerIds.length} player${selectedPlayerIds.length > 1 ? 's' : ''}`
                      : 'All Players'}
                  </span>
                </Button>
                <NotificationCenter />
              </div>
            )}

            {/* Mobile Player Filter Chips */}
            {isMobile && showPlayerFilter && (
              <div className="pills-scroll px-4 py-3 border-b border-white/20">
                  <Button variant="primary"
                    onClick={() => {
                      setSelectedPlayerIds([]);
                      setShowPlayerFilter(false);
                    }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap min-h-[44px] transition-colors ${
                      selectedPlayerIds.length === 0
                        ? 'bg-primary-500 text-white'
                        : 'bg-cream-100/60 text-warm-700'
                    }`}
                  >
                    <span className="text-sm font-medium">All</span>
                  </Button>
                  {teamMembers.map((member) => {
                    const isSelected = selectedPlayerIds.includes(member.id);
                    const colorIndex = selectedPlayerIds.indexOf(member.id);
                    const color = colorIndex >= 0 ? PLAYER_COLORS[colorIndex % PLAYER_COLORS.length] : null;
                    return (
                      <Button variant="ghost"
                        key={member.id}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedPlayerIds(selectedPlayerIds.filter(id => id !== member.id));
                          } else if (selectedPlayerIds.length < 8) {
                            setSelectedPlayerIds([...selectedPlayerIds, member.id]);
                          }
                        }}
                        className="flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap min-h-[44px] transition-colors"
                        style={{
                          backgroundColor: isSelected && color ? color.bg : 'rgba(255,255,255,0.5)',
                          color: isSelected ? 'white' : '#374151',
                        }}
                      >
                        {member.avatar_url ? (
                          <img
                            src={member.avatar_url}
                            alt={`${member.first_name} ${member.last_name}`}
                            className="w-6 h-6 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-warm-300 flex items-center justify-center">
                            <span className="text-xs font-medium text-warm-600">
                              {member.first_name[0]}{member.last_name[0]}
                            </span>
                          </div>
                        )}
                        <span className="text-sm font-medium">
                          {member.first_name} {member.last_name[0]}
                        </span>
                      </Button>
                    );
                  })}
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
                teamTimezone={teamTimezone ?? undefined}
                secondaryTimezone={secondaryTimezone}
                onSecondaryTimezoneChange={setSecondaryTimezone}
              />
              {!isMobile && <NotificationCenter />}
            </div>

            {/* Calendar view content with spring transition */}
            <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={`${view}-${selectedPlayer?.id ?? 'none'}`}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0, y: -4 }}
              transition={prefersReducedMotion ? { duration: 0 } : calendarSpring.viewTransition}
              className="flex-1 flex flex-col min-h-0"
            >
              {/* Availability Day View (when player selected) */}
              {selectedPlayer && view === 'day' ? (
                <div className="flex-1 overflow-y-auto p-6 overscroll-contain touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }} data-scroll-container>
                  <AvailabilityDayView
                    date={currentDate}
                    coachBusyPeriods={coachBusyPeriods as unknown as import('./AvailabilityDayView').BusyPeriod[]}
                    playerBusyPeriods={playerBusyPeriods as unknown as import('./AvailabilityDayView').BusyPeriod[]}
                    selectedPlayer={selectedPlayer}
                    selectedPlayers={selectedPlayers}
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
                      secondaryTimezone={secondaryTimezone}
                    />
                  )}

                  {view === 'month' && (
                    <MonthView
                      month={currentDate}
                      events={filteredEvents}
                      onDateClick={handleDateClick}
                      onEventClick={handleEventClick}
                      isDraggable={true}
                      playerBusyPeriods={selectedPlayer ? (playerBusyPeriods as unknown as import('./MonthView').MonthBusyPeriod[]) : []}
                    />
                  )}

                  {view === 'day' && (
                    showMobileUI ? (
                      // Mobile: Use enhanced swipeable day view with RSVP buttons
                      <CalendarDayViewSwipeable
                        events={filteredEvents}
                        currentDate={currentDate}
                        onDateChange={setCurrentDate}
                        isCoach={isCoach}
                        userRsvpStatuses={userRsvpStatuses}
                        onRsvp={!isCoach ? handleRsvp : undefined}
                        onEventClick={handleEventClick}
                        onAddEvent={isCoach ? handleAddEvent : undefined}
                        onRefresh={async () => {
                          router.refresh();
                        }}
                      />
                    ) : (
                      // Desktop: Use traditional day view
                      <DayView
                        date={currentDate}
                        events={filteredEvents}
                        onEventClick={handleEventClick}
                        isDraggable={true}
                        secondaryTimezone={secondaryTimezone}
                      />
                    )
                  )}
                </>
              )}
            </m.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Drag overlay - shows event being dragged with spring lift */}
        <DragOverlay dropAnimation={{
          duration: 200,
          easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}>
          {draggedEvent && (
            <m.div
              initial={prefersReducedMotion ? false : { scale: 1, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
              animate={{
                scale: prefersReducedMotion ? 1 : 1.05,
                boxShadow: '0 12px 32px rgba(0,0,0,0.15)',
                rotate: prefersReducedMotion ? 0 : 1.5,
              }}
              transition={prefersReducedMotion ? { duration: 0 } : calendarSpring.dragLift}
              className="w-48"
            >
              <EventCard
                id={draggedEvent.id}
                title={draggedEvent.title}
                type={draggedEvent.event_type}
                startTime={draggedEvent.start_date}
                endTime={draggedEvent.end_date || draggedEvent.start_date}
                location={draggedEvent.location || undefined}
                isOverlay
              />
            </m.div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Event Detail/Create Modal (Desktop) */}
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
        currentUserId={currentUserId}
      />

      {/* Mobile Event Sheet */}
      <MobileEventSheet
        isOpen={isMobileSheetOpen}
        onClose={() => {
          setIsMobileSheetOpen(false);
          setSelectedEvent(null);
          setInitialEventType(undefined);
        }}
        event={selectedEvent}
        isCreating={isCreatingEvent}
        isCoach={isCoach}
        onSave={async (data: MobileEventFormData) => {
          setIsSavingEvent(true);
          const timezoneOffset = new Date().getTimezoneOffset();
          try {
            if (isCreatingEvent) {
              if (data.recurrence && data.recurrence !== 'none') {
                const freq = data.recurrence.toUpperCase();
                const recurrenceRule = `RRULE:FREQ=${freq};INTERVAL=1;COUNT=${data.recurrenceCount}`;
                const { createRecurringEvent } = await import('@/app/golf/actions/recurring-events');
                const result = await createRecurringEvent({
                  title: data.title,
                  eventType: data.eventType,
                  startDate: data.startDate,
                  endDate: data.endDate || undefined,
                  startTime: data.allDay ? undefined : (data.startTime || undefined),
                  endTime: data.allDay ? undefined : (data.endTime || undefined),
                  location: data.location || undefined,
                  description: data.description || undefined,
                  recurrenceRule,
                  timezoneOffset,
                });
                if (!result.success) {
                  throw new Error(result.error || 'Failed to create recurring event');
                }
              } else {
                const result = await actionHandlers.createEvent({
                  title: data.title,
                  eventType: data.eventType,
                  startDate: data.startDate,
                  endDate: data.endDate || undefined,
                  startTime: data.allDay ? undefined : (data.startTime || undefined),
                  endTime: data.allDay ? undefined : (data.endTime || undefined),
                  allDay: data.allDay,
                  location: data.location || undefined,
                  description: data.description || undefined,
                  timezoneOffset,
                });
                if (!result.success) {
                  throw new Error(result.error || 'Failed to create event');
                }
              }
            } else if (selectedEvent) {
              const result = await actionHandlers.updateEvent(selectedEvent.id, {
                title: data.title,
                eventType: data.eventType,
                startDate: data.startDate,
                endDate: data.endDate || data.startDate,
                startTime: data.allDay ? undefined : (data.startTime || undefined),
                endTime: data.allDay ? undefined : (data.endTime || undefined),
                allDay: data.allDay,
                location: data.location || undefined,
                description: data.description || undefined,
                timezoneOffset,
              });
              if (!result.success) {
                throw new Error(result.error || 'Failed to update event');
              }
            }
            setIsMobileSheetOpen(false);
            setSelectedEvent(null);
            setInitialEventType(undefined);
            router.refresh();
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.toLowerCase().includes('server action') && msg.toLowerCase().includes('not found')) {
              window.location.reload();
              return;
            }
            throw err;
          } finally {
            setIsSavingEvent(false);
          }
        }}
        onDelete={selectedEvent && isCoach ? async () => {
          setIsSavingEvent(true);
          try {
            const result = await actionHandlers.deleteEvent(selectedEvent.id);
            if (!result.success) {
              throw new Error(result.error || 'Failed to delete event');
            }
            setIsMobileSheetOpen(false);
            setSelectedEvent(null);
            setInitialEventType(undefined);
            router.refresh();
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.toLowerCase().includes('server action') && msg.toLowerCase().includes('not found')) {
              window.location.reload();
              return;
            }
            throw err;
          } finally {
            setIsSavingEvent(false);
          }
        } : undefined}
        userRsvpStatus={selectedEventRsvpStatus as RSVPResponse | null}
        onRsvp={!isCoach ? handleMobileSheetRsvp : undefined}
        rsvpSummary={isCoach ? selectedEventRsvpSummary : null}
        initialEventType={initialEventType as 'practice' | 'tournament' | 'qualifier' | 'meeting' | 'travel' | 'other' | undefined}
      />

      {/* Mobile FAB for quick event creation (coaches only) */}
      {showMobileUI && isCoach && (
        <QuickAddEventFAB
          onAddEvent={(eventType) => {
            setSelectedEvent(null);
            setIsCreatingEvent(true);
            setInitialEventType(eventType);
            setIsMobileSheetOpen(true);
          }}
        />
      )}
    </>
  );
}

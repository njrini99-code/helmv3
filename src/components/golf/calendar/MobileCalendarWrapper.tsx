'use client';

/**
 * MobileCalendarWrapper - Responsive calendar wrapper for mobile devices
 *
 * This component automatically switches between mobile and desktop calendar views
 * based on device detection and screen size.
 *
 * Features:
 * - Automatic mobile detection
 * - Day view as default on mobile (more touch-friendly)
 * - Swipeable day navigation
 * - Touch-optimized RSVP buttons
 * - FAB for quick event creation (coaches only)
 * - Pull-to-refresh support
 * - Safe area handling for notches/home indicators
 * - Smooth transitions between views
 */

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { startOfDay } from 'date-fns';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useMobileDetection } from '@/hooks/use-mobile-detection';
import { CalendarDayViewSwipeable, MobileWeekPicker } from './CalendarDayViewSwipeable';
import { MobileEventSheet, type MobileEventFormData } from './MobileEventSheet';
import { QuickAddEventFAB } from './QuickAddEventFAB';
import { MobileCalendarListView } from './MobileCalendarListView';
import type { RSVPResponseType } from './RSVPButtonsEnhanced';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import type { RSVPResponse } from './MobileRSVPButtons';
import {
  Calendar,
  List,
  Settings2,
} from 'lucide-react';

// Re-export for convenience
export type { RSVPResponseType };

type MobileView = 'day' | 'list' | 'week';

interface MobileCalendarWrapperProps {
  events: CalendarEvent[];
  teamId: string;
  isCoach: boolean;
  // Event handlers
  onCreateEvent?: (data: MobileEventFormData) => Promise<void>;
  onUpdateEvent?: (eventId: string, data: MobileEventFormData) => Promise<void>;
  onDeleteEvent?: (eventId: string) => Promise<void>;
  // RSVP handlers
  onRsvp?: (eventId: string, response: RSVPResponse) => Promise<{ success: boolean; error?: string }>;
  userRsvpStatuses?: Map<string, RSVPResponse>;
  // Coach-specific props
  getRsvpSummary?: (eventId: string) => { accepted: number; tentative: number; declined: number; pending: number; total: number } | null;
  // Refresh handler
  onRefresh?: () => Promise<void>;
  // Optional settings link
  onOpenSettings?: () => void;
  className?: string;
}

export function MobileCalendarWrapper({
  events,
  isCoach,
  onCreateEvent,
  onUpdateEvent,
  onDeleteEvent,
  onRsvp,
  userRsvpStatuses,
  getRsvpSummary,
  onRefresh,
  onOpenSettings,
  className,
}: MobileCalendarWrapperProps) {
  const router = useRouter();
  const isMobileQuery = useMediaQuery('(max-width: 768px)');
  const { isMobile: isMobileDevice, isTablet, preferMobileUI } = useMobileDetection();

  // Determine if we should show mobile UI
  const showMobileUI = isMobileQuery || (isMobileDevice && preferMobileUI) || (isTablet && preferMobileUI);

  // State
  const [currentDate, setCurrentDate] = useState<Date>(startOfDay(new Date()));
  const [currentView, setCurrentView] = useState<MobileView>('day');
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_isSaving, setIsSaving] = useState(false);
  // Track initial event type for pre-filling from quick-add FAB
  const [initialEventType, setInitialEventType] = useState<string | undefined>(undefined);

  // If not mobile, don't render this component - let parent handle desktop view
  if (!showMobileUI) {
    return null;
  }

  // Event click handler
  const handleEventClick = useCallback((event: CalendarEvent) => {
    setSelectedEvent(event);
    setIsCreatingEvent(false);
    setIsSheetOpen(true);
  }, []);

  // Add event handler (for FAB)
  const handleAddEvent = useCallback((eventType?: string) => {
    setSelectedEvent(null);
    setIsCreatingEvent(true);
    setInitialEventType(eventType);
    setIsSheetOpen(true);
  }, []);

  // Save event handler
  const handleSaveEvent = useCallback(async (data: MobileEventFormData) => {
    setIsSaving(true);
    try {
      if (isCreatingEvent && onCreateEvent) {
        await onCreateEvent(data);
      } else if (selectedEvent && onUpdateEvent) {
        await onUpdateEvent(selectedEvent.id, data);
      }
      setIsSheetOpen(false);
      setSelectedEvent(null);
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  }, [isCreatingEvent, selectedEvent, onCreateEvent, onUpdateEvent, router]);

  // Delete event handler
  const handleDeleteEvent = useCallback(async () => {
    if (!selectedEvent || !onDeleteEvent) return;
    setIsSaving(true);
    try {
      await onDeleteEvent(selectedEvent.id);
      setIsSheetOpen(false);
      setSelectedEvent(null);
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  }, [selectedEvent, onDeleteEvent, router]);

  // RSVP handler for sheet
  const handleSheetRsvp = useCallback(async (response: RSVPResponse) => {
    if (!selectedEvent || !onRsvp) {
      return { success: false, error: 'RSVP not available' };
    }
    return onRsvp(selectedEvent.id, response);
  }, [selectedEvent, onRsvp]);

  // Get RSVP summary for selected event
  const selectedEventRsvpSummary = useMemo(() => {
    if (!selectedEvent || !getRsvpSummary) return null;
    return getRsvpSummary(selectedEvent.id);
  }, [selectedEvent, getRsvpSummary]);

  // Get user's RSVP status for selected event
  const selectedEventRsvpStatus = useMemo(() => {
    if (!selectedEvent || !userRsvpStatuses) return null;
    return userRsvpStatuses.get(selectedEvent.id) || null;
  }, [selectedEvent, userRsvpStatuses]);

  return (
    <div className={cn('flex flex-col h-full bg-[#FFFEFA]', className)}>
      {/* View Toggle Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/50 bg-white/80 backdrop-blur-sm">
        <div className="flex items-center gap-1 p-1 bg-slate-100/80 rounded-lg">
          <button
            type="button"
            onClick={() => setCurrentView('day')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium',
              'transition-all duration-200 min-h-[40px]',
              currentView === 'day'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            )}
          >
            <Calendar className="w-4 h-4" />
            <span>Day</span>
          </button>
          <button
            type="button"
            onClick={() => setCurrentView('list')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium',
              'transition-all duration-200 min-h-[40px]',
              currentView === 'list'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            )}
          >
            <List className="w-4 h-4" />
            <span>List</span>
          </button>
        </div>

        {/* Settings button */}
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className={cn(
              'p-2.5 rounded-lg',
              'text-slate-500 hover:text-slate-900 hover:bg-slate-100',
              'transition-colors min-w-[44px] min-h-[44px]',
              'flex items-center justify-center'
            )}
          >
            <Settings2 className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Week Picker (always visible) */}
      <div className="border-b border-slate-200/50 bg-white/60 backdrop-blur-sm">
        <MobileWeekPicker
          currentDate={currentDate}
          onDateSelect={setCurrentDate}
          events={events}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        {currentView === 'day' && (
          <CalendarDayViewSwipeable
            events={events}
            currentDate={currentDate}
            onDateChange={setCurrentDate}
            isCoach={isCoach}
            userRsvpStatuses={userRsvpStatuses}
            onRsvp={onRsvp}
            onEventClick={handleEventClick}
            onAddEvent={isCoach ? () => handleAddEvent() : undefined}
            onRefresh={onRefresh}
          />
        )}

        {currentView === 'list' && (
          <MobileListView
            events={events}
            currentDate={currentDate}
            isCoach={isCoach}
            userRsvpStatuses={userRsvpStatuses}
            onRsvp={onRsvp}
            onEventClick={handleEventClick}
          />
        )}
      </div>

      {/* FAB for coaches */}
      {isCoach && onCreateEvent && (
        <QuickAddEventFAB onAddEvent={handleAddEvent} />
      )}

      {/* Event Detail/Edit Sheet */}
      <MobileEventSheet
        isOpen={isSheetOpen}
        onClose={() => {
          setIsSheetOpen(false);
          setSelectedEvent(null);
          setInitialEventType(undefined);
        }}
        event={selectedEvent}
        isCreating={isCreatingEvent}
        isCoach={isCoach}
        onSave={handleSaveEvent}
        onDelete={selectedEvent && isCoach ? handleDeleteEvent : undefined}
        userRsvpStatus={selectedEventRsvpStatus}
        onRsvp={!isCoach ? handleSheetRsvp : undefined}
        rsvpSummary={isCoach ? selectedEventRsvpSummary : null}
        initialEventType={initialEventType as 'practice' | 'tournament' | 'qualifier' | 'meeting' | 'travel' | 'other' | undefined}
      />
    </div>
  );
}

/**
 * Mobile List View - Shows all upcoming events in a scrollable list
 */
function MobileListView({
  events,
  currentDate,
  isCoach,
  userRsvpStatuses,
  onRsvp,
  onEventClick,
}: {
  events: CalendarEvent[];
  currentDate: Date;
  isCoach: boolean;
  userRsvpStatuses?: Map<string, RSVPResponse>;
  onRsvp?: (eventId: string, response: RSVPResponse) => Promise<{ success: boolean; error?: string }>;
  onEventClick?: (event: CalendarEvent) => void;
}) {
  const handleRsvp = useCallback(
    (eventId: string, response: RSVPResponse) => {
      if (!onRsvp) return Promise.resolve({ success: false, error: 'RSVP not available' });
      return onRsvp(eventId, response);
    },
    [onRsvp]
  );

  return (
    <MobileCalendarListView
      events={events}
      currentDate={currentDate}
      isCoach={isCoach}
      userRsvpStatuses={userRsvpStatuses}
      onRsvp={handleRsvp}
      onEventClick={onEventClick}
    />
  );
}

/**
 * useIsMobileCalendar - Hook to determine if mobile calendar should be shown
 */
export function useIsMobileCalendar(): boolean {
  const isMobileQuery = useMediaQuery('(max-width: 768px)');
  const { isMobile, isTablet, preferMobileUI } = useMobileDetection();

  return isMobileQuery || (isMobile && preferMobileUI) || (isTablet && preferMobileUI);
}

/**
 * ResponsiveCalendarContainer - Container that handles mobile/desktop switching
 */
export function ResponsiveCalendarContainer({
  children,
  mobileContent,
}: {
  children: React.ReactNode; // Desktop content
  mobileContent: React.ReactNode; // Mobile content
}) {
  const isMobile = useIsMobileCalendar();

  return <>{isMobile ? mobileContent : children}</>;
}

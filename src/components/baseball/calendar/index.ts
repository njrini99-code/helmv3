/**
 * Baseball Calendar Components
 *
 * A complete calendar system for baseball team management with:
 * - Day/Week/Month views
 * - Event creation and editing
 * - RSVP and attendance tracking
 * - Mobile-responsive with swipe navigation
 */

// Main wrapper (use this in pages)
export { BaseballCalendarWrapper } from './BaseballCalendarWrapper';

// Client component
export { BaseballCalendarClient } from './BaseballCalendarClient';
export type { TeamMember, CalendarActionHandlers } from './BaseballCalendarClient';

// Views
export { CalendarHeader } from './CalendarHeader';
export type { BaseballCalendarView, CalendarHeaderProps } from './CalendarHeader';

export { MonthView } from './MonthView';
export type { BaseballCalendarEvent } from './MonthView';

export { WeekView } from './WeekView';
export type { WeekViewProps } from './WeekView';

export { DayView } from './DayView';
export type { DayViewProps } from './DayView';

export { EventListView } from './EventListView';

// Event components
export { BaseballEventCard } from './EventCard';
export type { BaseballEventCardProps } from './EventCard';

export { BaseballEventDetailModal } from './EventDetailModal';
export type { BaseballEventFormData, BaseballCalendarEvent as EventModalEvent } from './EventDetailModal';

export { QuickAddEventFAB } from './QuickAddEventFAB';

// RSVP components
export { RSVPButtons } from './RSVPButtons';
export { RSVPStatusSection } from './RSVPStatusSection';
export { AttendanceCheckIn } from './AttendanceCheckIn';

// Configuration
export { BASEBALL_EVENT_TYPES, getEventTypeConfig, formatEventTime, formatEventDate } from './event-type-config';
export type { BaseballEventType, EventTypeConfig } from './event-type-config';

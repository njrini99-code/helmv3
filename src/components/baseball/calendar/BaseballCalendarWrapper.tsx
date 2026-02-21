'use client';

import { BaseballCalendarClient, type TeamMember, type CalendarActionHandlers } from './BaseballCalendarClient';
import { createBaseballEvent, updateBaseballEvent, deleteBaseballEvent } from '@/app/baseball/actions/calendar';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';

interface BaseballCalendarWrapperProps {
  initialEvents: CalendarEvent[];
  teamMembers: TeamMember[];
  isCoach?: boolean;
  currentUserId?: string;
}

// Baseball-specific action handlers
const baseballActionHandlers: CalendarActionHandlers = {
  createEvent: (data: unknown) => createBaseballEvent(data as Parameters<typeof createBaseballEvent>[0]),
  updateEvent: (id: string, data: unknown) => updateBaseballEvent(id, data as Parameters<typeof updateBaseballEvent>[1]),
  deleteEvent: deleteBaseballEvent,
};

/**
 * Client wrapper for the Baseball Calendar with baseball-specific components and server actions.
 */
export function BaseballCalendarWrapper({
  initialEvents,
  teamMembers,
  isCoach = true,
  currentUserId,
}: BaseballCalendarWrapperProps) {
  return (
    <BaseballCalendarClient
      initialEvents={initialEvents}
      teamMembers={teamMembers}
      isCoach={isCoach}
      currentUserId={currentUserId}
      actionHandlers={baseballActionHandlers}
    />
  );
}

'use client';

import { PremiumCalendarClient, type TeamMember } from '@/components/golf/calendar/PremiumCalendarClient';
import {
  createBaseballEvent,
  updateBaseballEvent,
  deleteBaseballEvent,
} from '@/app/baseball/actions/calendar';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';

interface BaseballCalendarWrapperProps {
  initialEvents: CalendarEvent[];
  teamMembers: TeamMember[];
  isCoach?: boolean;
  currentUserId?: string;
}

// Wire baseball server actions into the golf PremiumCalendarClient action handler interface
const baseballActionHandlers = {
  createEvent: (data: unknown) =>
    createBaseballEvent(data as Parameters<typeof createBaseballEvent>[0]),
  updateEvent: (id: string, data: unknown) =>
    updateBaseballEvent(id, data as Parameters<typeof updateBaseballEvent>[1]),
  deleteEvent: deleteBaseballEvent,
};

export function BaseballCalendarWrapper({
  initialEvents,
  teamMembers,
  isCoach = true,
  currentUserId,
}: BaseballCalendarWrapperProps) {
  return (
    <PremiumCalendarClient
      initialEvents={initialEvents}
      teamMembers={teamMembers}
      isCoach={isCoach}
      currentUserId={currentUserId}
      actionHandlers={baseballActionHandlers}
    />
  );
}

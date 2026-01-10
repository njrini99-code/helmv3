'use client';

import { useState } from 'react';
import { PremiumCalendarClient, type TeamMember, type CalendarActionHandlers } from '@/components/golf/calendar/PremiumCalendarClient';
import { SyncModal } from '@/components/calendar/sync-modal';
import { createBaseballEvent, updateBaseballEvent, deleteBaseballEvent } from '@/app/baseball/actions/calendar';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';

interface BaseballCalendarWrapperProps {
  initialEvents: CalendarEvent[];
  teamMembers: TeamMember[];
  isCoach?: boolean;
}

// Baseball-specific action handlers - wrap to match CalendarActionHandlers signature
const baseballActionHandlers: CalendarActionHandlers = {
  createEvent: (data: unknown) => createBaseballEvent(data as Parameters<typeof createBaseballEvent>[0]),
  updateEvent: (id: string, data: unknown) => updateBaseballEvent(id, data as Parameters<typeof updateBaseballEvent>[1]),
  deleteEvent: deleteBaseballEvent,
};

/**
 * Client wrapper for the Baseball Calendar that manages sync modal state.
 * Uses the same premium calendar UI but with baseball-specific server actions.
 */
export function BaseballCalendarWrapper({
  initialEvents,
  teamMembers,
  isCoach = true,
}: BaseballCalendarWrapperProps) {
  const [showSyncModal, setShowSyncModal] = useState(false);

  // Placeholder handlers for sync functionality
  const handleConnectGoogle = async () => {
    console.log('Connecting to Google Calendar...');
  };

  const handleConnectApple = async () => {
    console.log('Connecting to Apple Calendar...');
  };

  const handleDisconnectGoogle = async () => {
    console.log('Disconnecting Google Calendar...');
  };

  const handleDisconnectApple = async () => {
    console.log('Disconnecting Apple Calendar...');
  };

  const handleSync = async () => {
    console.log('Syncing calendars...');
  };

  return (
    <>
      <PremiumCalendarClient
        initialEvents={initialEvents}
        teamMembers={teamMembers}
        isCoach={isCoach}
        onSyncSettings={() => setShowSyncModal(true)}
        actionHandlers={baseballActionHandlers}
      />

      <SyncModal
        isOpen={showSyncModal}
        onClose={() => setShowSyncModal(false)}
        googleConnected={false}
        appleConnected={false}
        onConnectGoogle={handleConnectGoogle}
        onConnectApple={handleConnectApple}
        onDisconnectGoogle={handleDisconnectGoogle}
        onDisconnectApple={handleDisconnectApple}
        onSync={handleSync}
      />
    </>
  );
}

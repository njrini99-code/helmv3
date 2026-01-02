'use client';

import { useState } from 'react';
import { PremiumCalendarClient, type TeamMember } from './PremiumCalendarClient';
import { SyncModal } from '@/components/calendar/sync-modal';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';

interface GolfCalendarWrapperProps {
  initialEvents: CalendarEvent[];
  teamMembers: TeamMember[];
  isCoach?: boolean;
}

/**
 * Client wrapper for the Golf Calendar that manages sync modal state.
 * This allows the server component page to pass data while the client
 * handles interactive modal states.
 */
export function GolfCalendarWrapper({
  initialEvents,
  teamMembers,
  isCoach = true,
}: GolfCalendarWrapperProps) {
  const [showSyncModal, setShowSyncModal] = useState(false);

  // Placeholder handlers for sync functionality
  // These will be connected to actual OAuth flows in the future
  const handleConnectGoogle = async () => {
    // TODO: Implement Google OAuth flow
    console.log('Connecting to Google Calendar...');
  };

  const handleConnectApple = async () => {
    // TODO: Implement Apple Calendar sync
    console.log('Connecting to Apple Calendar...');
  };

  const handleDisconnectGoogle = async () => {
    // TODO: Implement disconnect
    console.log('Disconnecting Google Calendar...');
  };

  const handleDisconnectApple = async () => {
    // TODO: Implement disconnect
    console.log('Disconnecting Apple Calendar...');
  };

  const handleSync = async () => {
    // TODO: Implement manual sync
    console.log('Syncing calendars...');
  };

  return (
    <>
      <PremiumCalendarClient
        initialEvents={initialEvents}
        teamMembers={teamMembers}
        isCoach={isCoach}
        onSyncSettings={() => setShowSyncModal(true)}
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

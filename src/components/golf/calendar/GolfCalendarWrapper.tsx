'use client';

import { useState } from 'react';
import { PremiumCalendarClient, type TeamMember } from './PremiumCalendarClient';
import { CalendarFeedManager } from './CalendarFeedManager';
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
  const [showFeedManager, setShowFeedManager] = useState(false);

  return (
    <>
      <PremiumCalendarClient
        initialEvents={initialEvents}
        teamMembers={teamMembers}
        isCoach={isCoach}
        onSyncSettings={() => setShowFeedManager(true)}
      />

      <CalendarFeedManager
        isOpen={showFeedManager}
        onClose={() => setShowFeedManager(false)}
      />
    </>
  );
}

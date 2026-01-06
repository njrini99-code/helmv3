'use client';

import { useState } from 'react';
import { PremiumCalendarClient, type TeamMember } from './PremiumCalendarClient';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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

      <Dialog open={showFeedManager} onOpenChange={setShowFeedManager}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Calendar Feeds</DialogTitle>
          </DialogHeader>
          <div className="p-6">
            <p className="text-sm text-slate-600">
              Calendar feed management will be available soon. You'll be able to subscribe to your calendar in Apple Calendar, Google Calendar, or Outlook.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

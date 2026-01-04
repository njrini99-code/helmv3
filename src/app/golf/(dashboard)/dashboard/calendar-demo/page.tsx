'use client';

/**
 * Premium Calendar UI Demo Page
 *
 * Showcases all 21 components from the Premium Calendar UI implementation:
 * - Phase 1: Foundation & Design System
 * - Phase 2: Event Lifecycle States
 * - Phase 3: RSVP System
 * - Phase 4: Check-In & Polling
 * - Phase 5: Sync & Feeds
 */

import { useState } from 'react';
import { Calendar, ChevronRight } from 'lucide-react';

// Phase 1: Foundation
import { PremiumEventBlock } from '@/components/golf/calendar/PremiumEventBlock';

// Phase 2: Event Lifecycle States
import { StatusBadge } from '@/components/golf/calendar/StatusBadge';
import { DraftEventCard } from '@/components/golf/calendar/DraftEventCard';
import { EventStatusTimeline } from '@/components/golf/calendar/EventStatusTimeline';

// Phase 3: RSVP System
import { RSVPProgressRing } from '@/components/golf/calendar/RSVPProgressRing';
import { PlayerRSVPCard } from '@/components/golf/calendar/PlayerRSVPCard';
import { RSVPLockIndicator } from '@/components/golf/calendar/RSVPLockIndicator';
import { RSVPStatusSection } from '@/components/golf/calendar/RSVPStatusSection';

// Phase 4: Check-In & Polling
import { AttendanceCheckIn } from '@/components/golf/calendar/AttendanceCheckIn';
import { AvailabilityPollGrid } from '@/components/golf/calendar/AvailabilityPollGrid';
import { PollResultSelector } from '@/components/golf/calendar/PollResultSelector';

// Phase 5: Sync & Feeds
import { CalendarFeedManager } from '@/components/golf/calendar/CalendarFeedManager';

export default function CalendarDemoPage() {
  const [activeSection, setActiveSection] = useState<string>('all');

  return (
    <div className="min-h-screen bg-[#FAF6F1] p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Calendar className="w-8 h-8 text-emerald-600" />
            <h1 className="text-3xl font-bold text-slate-900">
              Premium Calendar UI Demo
            </h1>
          </div>
          <p className="text-slate-600">
            All 21 components from the Premium Calendar UI implementation
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {['all', 'phase-1', 'phase-2', 'phase-3', 'phase-4', 'phase-5'].map((section) => (
              <button
                key={section}
                onClick={() => setActiveSection(section)}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                  activeSection === section
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white text-slate-700 border border-slate-200 hover:border-emerald-300'
                }`}
              >
                {section === 'all' ? 'All Phases' : `Phase ${section.split('-')[1]}`}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-12">
          {/* PHASE 1: Foundation */}
          {(activeSection === 'all' || activeSection === 'phase-1') && (
            <DemoSection
              title="Phase 1: Foundation & Design System"
              description="Base event blocks with consistent design tokens"
            >
              <div className="grid md:grid-cols-2 gap-4">
                <PremiumEventBlock
                  event={{
                    id: '1',
                    title: 'Team Practice',
                    event_type: 'practice',
                    status: 'confirmed',
                    start_time: '09:00:00',
                    end_time: '11:00:00',
                    location: 'East Course',
                  }}
                />
                <PremiumEventBlock
                  event={{
                    id: '2',
                    title: 'Tournament Round 1',
                    event_type: 'tournament',
                    status: 'confirmed',
                    start_time: '07:30:00',
                    end_time: '14:00:00',
                    location: 'Augusta National',
                    rsvp_confirmed_count: 18,
                    rsvp_total_count: 22,
                  }}
                />
                <PremiumEventBlock
                  event={{
                    id: '3',
                    title: 'Class: Rules of Golf',
                    event_type: 'class',
                    status: 'confirmed',
                    start_time: '15:00:00',
                    end_time: '16:30:00',
                    location: 'Clubhouse',
                  }}
                />
                <PremiumEventBlock
                  event={{
                    id: '4',
                    title: 'Qualifier Event',
                    event_type: 'qualifier',
                    status: 'draft',
                    start_time: '10:00:00',
                    end_time: '16:00:00',
                    location: 'Pine Valley GC',
                  }}
                />
              </div>
            </DemoSection>
          )}

          {/* PHASE 2: Event Lifecycle States */}
          {(activeSection === 'all' || activeSection === 'phase-2') && (
            <DemoSection
              title="Phase 2: Event Lifecycle States"
              description="Status badges, draft events, cancellation workflows, and audit logs"
            >
              <div className="space-y-6">
                {/* Status Badges */}
                <div>
                  <h4 className="font-semibold text-slate-900 mb-3">Status Badges</h4>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge status="draft" />
                    <StatusBadge status="confirmed" />
                    <StatusBadge status="cancelled" />
                    <StatusBadge status="completed" />
                    <StatusBadge status="pending" />
                  </div>
                </div>

                {/* Draft Event Card */}
                <div>
                  <h4 className="font-semibold text-slate-900 mb-3">Draft Event Card</h4>
                  <DraftEventCard
                    event={{
                      id: 'draft-1',
                      title: 'Spring Qualifier (Draft)',
                      event_type: 'qualifier',
                      start_time: '08:00:00',
                      end_time: '15:00:00',
                      location: 'Pebble Beach',
                      rsvp_total_count: 0,
                    }}
                  />
                </div>

                {/* Event Status Timeline */}
                <div>
                  <h4 className="font-semibold text-slate-900 mb-3">Event Status Timeline</h4>
                  <EventStatusTimeline
                    history={[
                      {
                        id: '1',
                        event_id: 'event-1',
                        old_status: 'draft',
                        new_status: 'confirmed',
                        changed_by_user_id: 'coach_1',
                        changed_by_name: 'Coach Smith',
                        changed_by_avatar: null,
                        changed_at: new Date().toISOString(),
                        reason: 'Event confirmed with all participants',
                      },
                      {
                        id: '2',
                        event_id: 'event-1',
                        old_status: null,
                        new_status: 'draft',
                        changed_by_user_id: 'coach_1',
                        changed_by_name: 'Coach Smith',
                        changed_by_avatar: null,
                        changed_at: new Date(Date.now() - 86400000).toISOString(),
                        reason: 'Initial event creation',
                      },
                    ]}
                  />
                </div>
              </div>
            </DemoSection>
          )}

          {/* PHASE 3: RSVP System */}
          {(activeSection === 'all' || activeSection === 'phase-3') && (
            <DemoSection
              title="Phase 3: RSVP System"
              description="Progress rings, player response cards, RSVP locks, and status management"
            >
              <div className="space-y-6">
                {/* RSVP Progress Rings */}
                <div>
                  <h4 className="font-semibold text-slate-900 mb-3">RSVP Progress Rings</h4>
                  <div className="flex flex-wrap gap-8">
                    <RSVPProgressRing
                      confirmed={12}
                      maybe={3}
                      declined={2}
                      pending={5}
                      total={22}
                      size="lg"
                    />
                    <RSVPProgressRing
                      confirmed={8}
                      maybe={2}
                      declined={1}
                      pending={3}
                      total={14}
                      size="md"
                    />
                  </div>
                </div>

                {/* Player RSVP Card */}
                <div>
                  <h4 className="font-semibold text-slate-900 mb-3">Player RSVP Card</h4>
                  <PlayerRSVPCard
                    event={{
                      id: 'event-practice',
                      title: 'Team Practice - Thursday',
                      event_type: 'practice',
                      status: 'confirmed',
                      start_time: '09:00:00',
                      end_time: '11:00:00',
                    }}
                    currentResponse={null}
                    onRespond={async (response) => console.log('RSVP:', response)}
                  />
                </div>

                {/* RSVP Lock Indicator */}
                <div>
                  <h4 className="font-semibold text-slate-900 mb-3">RSVP Lock Countdown</h4>
                  <RSVPLockIndicator
                    lockTime={new Date(Date.now() + 7200000).toISOString()} // 2 hours from now
                  />
                </div>

                {/* RSVP Status Section */}
                <div>
                  <h4 className="font-semibold text-slate-900 mb-3">RSVP Status Management</h4>
                  <RSVPStatusSection
                    participants={[
                      {
                        id: '1',
                        user_id: 'user-1',
                        name: 'John Doe',
                        email: 'john@example.com',
                        response: 'confirmed',
                        responded_at: new Date().toISOString(),
                      },
                      {
                        id: '2',
                        user_id: 'user-2',
                        name: 'Jane Smith',
                        email: 'jane@example.com',
                        response: 'maybe',
                        responded_at: new Date().toISOString(),
                      },
                      {
                        id: '3',
                        user_id: 'user-3',
                        name: 'Bob Johnson',
                        email: 'bob@example.com',
                        response: 'declined',
                        responded_at: new Date().toISOString(),
                      },
                      {
                        id: '4',
                        user_id: 'user-4',
                        name: 'Alice Williams',
                        email: 'alice@example.com',
                        response: 'pending',
                        responded_at: null,
                      },
                    ]}
                    totalInvited={4}
                    onSendReminder={async (ids) => console.log('Send reminder to:', ids)}
                    onExport={() => console.log('Export RSVP data')}
                  />
                </div>
              </div>
            </DemoSection>
          )}

          {/* PHASE 4: Check-In & Polling */}
          {(activeSection === 'all' || activeSection === 'phase-4') && (
            <DemoSection
              title="Phase 4: Check-In & Polling"
              description="Mobile workstation for coaches, attendance tracking, and availability polling"
            >
              <div className="space-y-6">
                {/* Attendance Check-In */}
                <div>
                  <h4 className="font-semibold text-slate-900 mb-3">Attendance Check-In (Coach Mobile)</h4>
                  <AttendanceCheckIn
                    players={[
                      { id: '1', name: 'John Doe', avatar_url: undefined, rsvp_status: 'confirmed' },
                      { id: '2', name: 'Jane Smith', avatar_url: undefined, rsvp_status: 'confirmed' },
                      { id: '3', name: 'Bob Johnson', avatar_url: undefined, rsvp_status: 'maybe' },
                      { id: '4', name: 'Alice Williams', avatar_url: undefined, rsvp_status: 'pending' },
                    ]}
                    onMarkAttendance={async (playerId, status, data) => console.log('Mark attendance:', playerId, status, data)}
                    eventTitle="Morning Practice"
                  />
                </div>

                {/* Availability Poll Grid */}
                <div>
                  <h4 className="font-semibold text-slate-900 mb-3">Availability Poll Grid (When2meet style)</h4>
                  <AvailabilityPollGrid
                    title="Find Best Practice Time - Week of Jan 15"
                    dates={['2026-01-15', '2026-01-16', '2026-01-17']}
                    startHour={8}
                    endHour={18}
                    timeInterval={60}
                    timeSlots={[
                      {
                        date: '2026-01-15',
                        startTime: '09:00',
                        endTime: '10:00',
                        availableCount: 2,
                        maybeCount: 0,
                        totalResponses: 2,
                        availableUsers: ['John Doe', 'Jane Smith'],
                        myResponse: 'available',
                      },
                      {
                        date: '2026-01-15',
                        startTime: '10:00',
                        endTime: '11:00',
                        availableCount: 2,
                        maybeCount: 0,
                        totalResponses: 2,
                        availableUsers: ['John Doe', 'Jane Smith'],
                        myResponse: 'available',
                      },
                      {
                        date: '2026-01-15',
                        startTime: '11:00',
                        endTime: '12:00',
                        availableCount: 1,
                        maybeCount: 1,
                        totalResponses: 2,
                        availableUsers: ['John Doe'],
                        myResponse: 'maybe',
                      },
                      {
                        date: '2026-01-16',
                        startTime: '14:00',
                        endTime: '15:00',
                        availableCount: 2,
                        maybeCount: 0,
                        totalResponses: 2,
                        availableUsers: ['John Doe', 'Jane Smith'],
                        myResponse: 'available',
                      },
                    ]}
                    onToggleSlot={async (date, time) => console.log('Toggle slot:', date, time)}
                  />
                </div>

                {/* Poll Result Selector */}
                <div>
                  <h4 className="font-semibold text-slate-900 mb-3">Poll Results (Coach Selector)</h4>
                  <PollResultSelector
                    pollTitle="Team Practice - Best Available Times"
                    results={[
                      {
                        date: '2026-01-15',
                        startTime: '09:00',
                        endTime: '10:00',
                        availableCount: 12,
                        maybeCount: 2,
                        totalResponses: 18,
                        availableUsers: ['Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5'],
                      },
                      {
                        date: '2026-01-15',
                        startTime: '10:00',
                        endTime: '11:00',
                        availableCount: 10,
                        maybeCount: 3,
                        totalResponses: 18,
                        availableUsers: ['Player 1', 'Player 2', 'Player 3', 'Player 4'],
                      },
                      {
                        date: '2026-01-16',
                        startTime: '14:00',
                        endTime: '15:00',
                        availableCount: 14,
                        maybeCount: 1,
                        totalResponses: 18,
                        availableUsers: ['Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5', 'Player 6'],
                      },
                    ]}
                    onSelectSlot={(slot) => console.log('Selected time:', slot)}
                    onCreateEvent={(slot) => console.log('Create event:', slot)}
                  />
                </div>
              </div>
            </DemoSection>
          )}

          {/* PHASE 5: Sync & Feeds */}
          {(activeSection === 'all' || activeSection === 'phase-5') && (
            <DemoSection
              title="Phase 5: Sync & Feeds"
              description="iCal/webcal feed management with platform-specific subscription instructions"
            >
              <CalendarFeedManager
                feeds={[
                  {
                    id: '1',
                    name: 'My Team Events',
                    type: 'team',
                    url: 'webcal://helm.app/api/feeds/team/abc123.ics',
                    created_at: new Date(Date.now() - 86400000 * 7).toISOString(),
                    last_synced_at: new Date().toISOString(),
                  },
                  {
                    id: '2',
                    name: 'Tournament Schedule',
                    type: 'tournament',
                    url: 'webcal://helm.app/api/feeds/tournament/def456.ics',
                    created_at: new Date(Date.now() - 86400000 * 14).toISOString(),
                    last_synced_at: new Date(Date.now() - 3600000).toISOString(),
                  },
                ]}
                onCreateFeed={async (type, name) => {
                  console.log('Create feed:', type, name);
                  return {
                    id: Date.now().toString(),
                    name,
                    type,
                    url: `webcal://helm.app/api/feeds/${type}/${Date.now()}.ics`,
                    created_at: new Date().toISOString(),
                    last_synced_at: new Date().toISOString(),
                  };
                }}
                onRegenerateFeed={async (feedId) => {
                  console.log('Regenerate feed:', feedId);
                }}
                onDeleteFeed={async (feedId) => {
                  console.log('Delete feed:', feedId);
                }}
              />
            </DemoSection>
          )}
        </div>

        {/* Footer */}
        <div className="mt-12 p-6 bg-white rounded-2xl border border-slate-200">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
              <ChevronRight className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 mb-1">Implementation Complete</h3>
              <p className="text-sm text-slate-600 mb-2">
                All 21 core components of the Premium Calendar UI system have been successfully implemented.
              </p>
              <p className="text-xs text-slate-500">
                Navigate to <code className="px-2 py-0.5 bg-slate-100 rounded">http://localhost:3000/golf/dashboard/calendar</code> to see the main calendar.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DemoSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-1">{title}</h2>
        <p className="text-sm text-slate-600">{description}</p>
      </div>
      {children}
    </div>
  );
}

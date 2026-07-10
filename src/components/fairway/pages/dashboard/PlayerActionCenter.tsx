'use client';

/**
 * ============================================================================
 * Fairway · pages/dashboard · PlayerActionCenter
 * ----------------------------------------------------------------------------
 * WAVE W2 nav consolidation (PRODUCTION_READINESS_MISSION_2026-07-09.md,
 * Target IA §Golf player, item 1): the standalone player "Hub" front door is
 * merged INTO the Dashboard — one home, not two. This section renders the
 * Hub's triage content (pending tasks, awaiting-RSVP events, recent
 * announcements, upcoming trips) directly on /golf/dashboard, below the
 * existing analytical overview. /golf/dashboard/hub itself now just
 * server-redirects here.
 *
 * Reuses the Hub's own presentational building blocks VERBATIM
 * (TaskRow / RSVPRow / TripRow / TripDetailSheet / AnnouncementsList from
 * hub-parts.tsx) and the SAME two optimistic write paths the former
 * FairwayPlayerHubWrapper held (completeTask / respondToEvent) — no new
 * business logic, just re-composed on the Dashboard route. Full lists +
 * write surfaces for tasks/travel/announcements still live in the Team Hub
 * (and full RSVP/scheduling in Calendar); this section shows only the top
 * few "needs you now" items, exactly like the Hub did, and links out for
 * the rest — never a duplicate second management surface (P442 lineage).
 *
 * Honest-empty: if there is nothing to triage AND no announcements (or
 * announcements failed to load), renders null — this section is
 * supplementary, not a hero, so an empty state here would just be noise
 * under the Dashboard's own hero.
 *
 * ADDITIVE. Renders inside the `.fairway-ds` scope the Dashboard page already
 * provides.
 * ========================================================================== */

import { useCallback, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { completeTask } from '@/app/golf/actions/tasks';
import { respondToEvent } from '@/app/golf/actions/golf';
import { fairwayToast, Surface } from '@/components/fairway';
import { useNotificationBadges } from '@/contexts/notification-badge-context';
import type { GolfAnnouncementMeta } from '@/lib/types/golf';
import {
  TaskRow,
  RSVPRow,
  TripRow,
  TripDetailSheet,
  AnnouncementsList,
  type TripData,
  type PlayerTask,
  type EventInvite,
} from '@/components/fairway/pages/hub/hub-parts';

import { SectionTitle } from './player-dashboard-parts';

const TEAM_HUB_TASKS = '/golf/dashboard/team-hub?tab=tasks';
const TEAM_HUB_TRAVEL = '/golf/dashboard/team-hub?tab=travel';
const CALENDAR = '/golf/dashboard/calendar';

export interface PlayerActionCenterProps {
  trips: TripData[];
  tasks: PlayerTask[];
  events: EventInvite[];
  announcements: GolfAnnouncementMeta[];
  announcementsLoadError?: boolean;
}

export function PlayerActionCenter({
  trips,
  tasks: initialTasks,
  events: initialEvents,
  announcements,
  announcementsLoadError = false,
}: PlayerActionCenterProps) {
  const router = useRouter();
  const badges = useNotificationBadges();
  const [tasks, setTasks] = useState(initialTasks);
  const [events, setEvents] = useState(initialEvents);
  const [, startTransition] = useTransition();
  const [selectedTrip, setSelectedTrip] = useState<TripData | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // A single stable `now` — matches the former Hub's day-granularity
  // classification so there is no SSR/hydration mismatch and no trip/task
  // ever flashes into the wrong bucket on first paint.
  const now = useMemo(() => new Date(), []);

  const pendingTasks = useMemo(() => tasks.filter((t) => t.status !== 'completed'), [tasks]);
  const pendingEvents = useMemo(
    () =>
      events.filter(
        (e) => (!e.rsvp_status || e.rsvp_status === 'pending') && new Date(e.start_time) >= now,
      ),
    [events, now],
  );
  const upcomingTrips = useMemo(
    () => trips.filter((t) => new Date(t.departure_date) >= now),
    [trips, now],
  );

  const handleCompleteTask = useCallback(
    async (taskId: string) => {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, status: 'completed' as const, completed_at: new Date().toISOString() } : t,
        ),
      );
      const result = await completeTask(taskId);
      if (!result.success) {
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, status: 'pending' as const, completed_at: null } : t)),
        );
        fairwayToast.error(result.error ?? "Couldn't mark that task complete. Please try again.");
      } else {
        // The sidebar "Tasks" badge count is a separate polled feed — refetch it
        // so it drops immediately instead of waiting up to 45s (conn-golf-player
        // Finding 3).
        badges.refetch();
      }
      startTransition(() => router.refresh());
    },
    [router, badges],
  );

  const handleRSVP = useCallback(
    async (eventId: string, status: 'accepted' | 'declined' | 'tentative') => {
      setEvents((prev) => prev.map((e) => (e.event_id === eventId ? { ...e, rsvp_status: status } : e)));
      const result = await respondToEvent(eventId, status);
      if (!result.success) {
        setEvents(initialEvents);
        fairwayToast.error(result.error ?? "Couldn't save your RSVP. Please try again.");
      } else {
        const confirmation =
          status === 'accepted'
            ? "RSVP saved — you're going"
            : status === 'tentative'
              ? 'RSVP saved — marked as maybe'
              : "RSVP saved — you can't go";
        fairwayToast.success(confirmation);
        // The "Awaiting RSVP" calendar-notification badge is a separate polled
        // feed — refetch it so it drops immediately (conn-golf-player Finding 3).
        badges.refetch();
      }
      startTransition(() => router.refresh());
    },
    [router, initialEvents, badges],
  );

  const openTrip = useCallback((trip: TripData) => {
    setSelectedTrip(trip);
    setSheetOpen(true);
  }, []);

  const hasAnything =
    pendingTasks.length > 0 ||
    pendingEvents.length > 0 ||
    upcomingTrips.length > 0 ||
    announcements.length > 0 ||
    announcementsLoadError;

  if (!hasAnything) return null;

  return (
    <div className="flex flex-col gap-8" id="action-center">
      {pendingTasks.length > 0 ? (
        <section>
          <SectionTitle action={{ label: 'Open Team Hub', href: TEAM_HUB_TASKS }}>Tasks</SectionTitle>
          <Surface padding="sm" className="flex flex-col gap-1.5">
            {pendingTasks.slice(0, 3).map((task) => (
              <TaskRow key={task.id} task={task} now={now} onComplete={() => handleCompleteTask(task.id)} />
            ))}
          </Surface>
        </section>
      ) : null}

      {pendingEvents.length > 0 ? (
        <section>
          <SectionTitle action={{ label: 'View calendar', href: CALENDAR }}>Awaiting RSVP</SectionTitle>
          <div className="flex flex-col gap-2">
            {pendingEvents.slice(0, 3).map((event) => (
              <RSVPRow
                key={event.id}
                event={event}
                now={now}
                onRSVP={(status) => handleRSVP(event.event_id, status)}
              />
            ))}
          </div>
        </section>
      ) : null}

      <AnnouncementsList announcements={announcements} loadError={announcementsLoadError} />

      {upcomingTrips.length > 0 ? (
        <section>
          <SectionTitle action={{ label: 'Open Team Hub', href: TEAM_HUB_TRAVEL }}>Upcoming trips</SectionTitle>
          <div className="flex flex-col gap-2">
            {upcomingTrips.slice(0, 2).map((trip) => (
              <TripRow key={trip.id} trip={trip} now={now} onOpen={() => openTrip(trip)} />
            ))}
          </div>
        </section>
      ) : null}

      <TripDetailSheet trip={selectedTrip} open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}

export default PlayerActionCenter;

'use client';

/**
 * ============================================================================
 * Fairway · pages/hub · FairwayPlayerHub
 * ----------------------------------------------------------------------------
 * The redesigned PLAYER Hub (route /golf/dashboard/hub, player role) in the warm
 * "Fairway" design system. This is a PRESENTATION + LAYOUT rebuild — it consumes
 * the EXACT same props the legacy PlayerHub takes (trips / tasks / events /
 * announcements / playerName / onCompleteTask / onRSVP / signalCard) and does NOT
 * fetch, mutate, or reshape any business data.
 *
 * The two optimistic write paths stay in the legacy PlayerHubWrapper:
 *   • onCompleteTask  → wraps completeTask (optimistic set + router.refresh)
 *   • onRSVP          → wraps respondToEvent (optimistic set + router.refresh)
 * This component only invokes those callbacks (via TaskRow / RSVPRow). The
 * announcement-acknowledge path lives in AnnouncementsList, which calls the
 * unchanged acknowledgeAnnouncement action with its own optimistic state — same
 * contract as the legacy PlayerHubAnnouncementsSection. No mutation moves into
 * the page; nothing here is destructive.
 *
 * Mental model (per the redesign plan): triage → what's-next → reference.
 *   • ONE masthead — a single ViewHeader (eyebrow = team, title = greeting,
 *     description = caught-up/needs-attention). The duplicate editorial
 *     "Welcome back" PageHeader band is DELETED (two-masthead §4 violation).
 *   • ONE hero (focal) — the triage card: overdue tasks promoted to an
 *     InsightCard variant="hero". The CoachHelm signal sits UNDER it as a
 *     secondary (matte) signal, never a second glass hero. ONE glass per view.
 *   • ONE primary action — contextual in the ViewHeader (Review tasks when
 *     overdue, else a calm calendar link).
 *   • SECTIONS via Fairway Tabs (Overview / Trips / Tasks / Events), replacing
 *     the legacy GolfTabBar.
 *   • HONEST-EMPTY everywhere — the sparse demo data never fabricates a hero
 *     (the single junk past trip only ever appears as "Completed" in the Trips
 *     tab; Overview "upcoming trips" is an honest EmptyState).
 *
 * ADDITIVE + GATED. Renders inside a `.fairway-ds` scope on `bg-canvas` (the
 * page supplies the scope wrapper). useNotificationBadges() (in AnnouncementsList)
 * is fine because the dashboard layout provides the notification-badge Provider.
 * ========================================================================== */

import { useCallback, useEffect, useState, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ClipboardList, ArrowRight, LayoutGrid } from 'lucide-react';

import { completeTask } from '@/app/golf/actions/tasks';
import { respondToEvent } from '@/app/golf/actions/golf';

import { ViewHeader, Button, InsightCard, Surface } from '@/components/fairway';
import type { GolfAnnouncementMeta } from '@/lib/types/golf';

import {
  useTimeWord,
  SectionTitle,
  TripRow,
  TripDetailSheet,
  TaskRow,
  RSVPRow,
  AnnouncementsList,
  type TripData,
  type PlayerTask,
  type EventInvite,
} from './hub-parts';

/** Where the full lists now live (consolidated into the Team Hub) + Calendar. */
const TEAM_HUB_TASKS = '/golf/dashboard/team-hub?tab=tasks';
const TEAM_HUB_TRAVEL = '/golf/dashboard/team-hub?tab=travel';
const CALENDAR = '/golf/dashboard/calendar';

/* ─────────────────────────────────────────────────────────────────────────
 * Props — IDENTICAL data + callbacks to the legacy PlayerHub, plus the
 * server-known first name + team name for the masthead (no extra fetch).
 * ──────────────────────────────────────────────────────────────────────── */

export interface FairwayPlayerHubProps {
  trips: TripData[];
  tasks: PlayerTask[];
  events: EventInvite[];
  announcements: GolfAnnouncementMeta[];
  /** Full player name (e.g. "Nick Rini"); the masthead uses the first word. */
  playerName: string;
  /** Team name for the masthead eyebrow. */
  teamName: string;
  /** The legacy optimistic completeTask path (do NOT reimplement here). */
  onCompleteTask: (taskId: string) => Promise<void>;
  /** The legacy optimistic respondToEvent path (do NOT reimplement here). */
  onRSVP: (eventId: string, status: 'accepted' | 'declined' | 'tentative') => Promise<void>;
  /** Pre-rendered CoachHelm signal card (HubInsightSignalCard) — rendered as-is
   *  UNDER the hero as a secondary matte signal. Pass null/omit to hide. */
  signalCard?: ReactNode;
}

export function FairwayPlayerHub({
  trips,
  tasks,
  events,
  announcements,
  playerName,
  teamName,
  onCompleteTask,
  onRSVP,
  signalCard,
}: FairwayPlayerHubProps) {
  const router = useRouter();
  const timeWord = useTimeWord();
  const firstName = playerName.split(' ')[0] || 'there';

  const [selectedTrip, setSelectedTrip] = useState<TripData | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // A single stable `now`, computed once at first render (day-granularity
  // classification → no visible server/client hydration text mismatch). Using a
  // deterministic `now` is what keeps honest-empty correct: the junk past trip
  // is classified out of "upcoming" on the very first paint, so it can never
  // flash as an upcoming hero. We still refresh it on mount so a long-lived tab
  // re-classifies against the real current time.
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    setNow(new Date());
  }, []);

  // ── Derived buckets — the "today" view surfaces only what needs the player
  // now; the FULL lists (all tasks / travel / announcements) live in the Team
  // Hub, and full events live in the Calendar. ───────────────────────────────
  const pendingTasks = tasks.filter((t) => t.status !== 'completed');
  const overdueTasks = tasks.filter((t) => t.status === 'overdue');
  const pendingEvents = events.filter((e) => !e.rsvp_status || e.rsvp_status === 'pending');
  // HONEST: only genuinely-upcoming trips qualify for the today glance. A past
  // trip (return-before-departure) is excluded here; the full history lives in
  // the Team Hub's Travel tab.
  const upcomingTrips = trips.filter((t) => new Date(t.departure_date) >= now);

  const urgentCount = overdueTasks.length + pendingEvents.length;

  const openTrip = (trip: TripData) => {
    setSelectedTrip(trip);
    setSheetOpen(true);
  };

  // ── ONE primary action: contextual in the masthead ───────────────────────
  const primaryAction =
    overdueTasks.length > 0 ? (
      <Button
        variant="primary"
        leftIcon={<ClipboardList className="h-4 w-4" />}
        onClick={() => router.push(TEAM_HUB_TASKS)}
      >
        Review tasks
      </Button>
    ) : (
      <Button asChild variant="secondary" rightIcon={<ArrowRight className="h-4 w-4" />}>
        <Link href={CALENDAR}>View calendar</Link>
      </Button>
    );

  // ── ONE description line (caught-up vs needs-attention) ───────────────────
  const description =
    urgentCount > 0
      ? `${urgentCount} item${urgentCount === 1 ? '' : 's'} need${urgentCount === 1 ? 's' : ''} your attention — start at the top.`
      : "You're all caught up — a quiet day to sharpen what matters.";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6 md:py-10">
      {/* ── ONE masthead ─────────────────────────────────────────────────── */}
      <ViewHeader
        eyebrow={teamName}
        title={`${timeWord}, ${firstName}`}
        description={description}
        primaryAction={primaryAction}
        className="mb-8"
      />

      {/* ── TODAY — one focused column, no tabs. The FULL lists now live in the
          Team Hub (Tasks / Announcements / Travel / Classes) and the Calendar
          (events); here we surface only what needs the player NOW and link out
          for the rest. Write boundaries (completeTask / RSVP / ack) unchanged. */}
      <div className="flex flex-col gap-8">
        {/* ONE HERO (focal): the triage card. */}
        {overdueTasks.length > 0 ? (
          <InsightCard
            variant="hero"
            priority="medium"
            overline="Triage"
            title={`${overdueTasks.length} task${overdueTasks.length === 1 ? ' is' : 's are'} past due — clear these first`}
            actions={
              <Button
                variant="primary"
                leftIcon={<ClipboardList className="h-4 w-4" />}
                onClick={() => router.push(TEAM_HUB_TASKS)}
              >
                Open tasks
              </Button>
            }
          >
            These have slipped past their due date. Knocking them out is the highest-leverage
            thing you can do right now.
          </InsightCard>
        ) : (
          <InsightCard
            variant="hero"
            priority="info"
            empty
            overline="Triage"
            title="Nothing urgent today"
            emptyMessage="No overdue tasks or pending RSVPs — you're on top of things. Use the calm to get ahead."
          />
        )}

        {/* CoachHelm signal — UNDER the hero, secondary matte signal (renders
            nothing when there's no surfaceable insight). NOT a second glass hero. */}
        {signalCard ? <div>{signalCard}</div> : null}

        {/* Needs you now — pending tasks (top 3); full list lives in the Team Hub. */}
        {pendingTasks.length > 0 ? (
          <section>
            <SectionTitle
              count={pendingTasks.length}
              action={{ label: 'Open Team Hub', onClick: () => router.push(TEAM_HUB_TASKS) }}
            >
              Tasks
            </SectionTitle>
            <Surface padding="sm" className="flex flex-col gap-1.5">
              {pendingTasks.slice(0, 3).map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  now={now}
                  onComplete={() => onCompleteTask(task.id)}
                />
              ))}
            </Surface>
          </section>
        ) : null}

        {/* Awaiting RSVP — respond here; the full schedule lives in the Calendar. */}
        {pendingEvents.length > 0 ? (
          <section>
            <SectionTitle
              count={pendingEvents.length}
              action={{ label: 'View calendar', onClick: () => router.push(CALENDAR) }}
            >
              Awaiting RSVP
            </SectionTitle>
            <div className="flex flex-col gap-2">
              {pendingEvents.slice(0, 3).map((event) => (
                <RSVPRow
                  key={event.id}
                  event={event}
                  now={now}
                  onRSVP={(status) => onRSVP(event.event_id, status)}
                />
              ))}
            </div>
          </section>
        ) : null}

        {/* Announcements — compact + self-acknowledging (renders nothing when none). */}
        <AnnouncementsList announcements={announcements} />

        {/* Next trips — a glance; the full Travel list lives in the Team Hub. */}
        {upcomingTrips.length > 0 ? (
          <section>
            <SectionTitle
              count={upcomingTrips.length}
              action={{ label: 'Open Team Hub', onClick: () => router.push(TEAM_HUB_TRAVEL) }}
            >
              Upcoming trips
            </SectionTitle>
            <div className="flex flex-col gap-2">
              {upcomingTrips.slice(0, 2).map((trip) => (
                <TripRow key={trip.id} trip={trip} now={now} onOpen={() => openTrip(trip)} />
              ))}
            </div>
          </section>
        ) : null}

        {/* A calm doorway to everything else — the consolidated Team Hub. */}
        <Link href="/golf/dashboard/team-hub" className="block rounded-card">
          <Surface interactive padding="md" className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-3">
              <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-fw-md bg-accent-50 text-accent-700">
                <LayoutGrid className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block font-fw-sans text-body font-medium text-text-primary">
                  Team Hub
                </span>
                <span className="block font-fw-sans text-body-sm text-text-tertiary">
                  Tasks, announcements, travel &amp; your class schedule
                </span>
              </span>
            </span>
            <ArrowRight className="h-4 w-4 flex-shrink-0 text-text-tertiary" aria-hidden />
          </Surface>
        </Link>
      </div>

      {/* Trip detail — Fairway Sheet (read of one trip), kept for the glance. */}
      <TripDetailSheet trip={selectedTrip} open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * FairwayPlayerHubWrapper — the optimistic write boundary.
 * ----------------------------------------------------------------------------
 * Holds the SAME two optimistic write paths as the legacy PlayerHubWrapper,
 * VERBATIM (completeTask + respondToEvent, each: optimistic setState → call the
 * unchanged server action → revert on failure → router.refresh in a transition).
 * The mutations are NOT in the server page — they live here in the client
 * boundary, exactly as before; the page only passes raw server data down.
 * `FairwayPlayerHub` (above) stays pure presentation and receives these as the
 * SAME onCompleteTask / onRSVP callbacks. Announcement-acknowledge is owned by
 * AnnouncementsList (same acknowledgeAnnouncement action as legacy).
 * ──────────────────────────────────────────────────────────────────────── */

export interface FairwayPlayerHubWrapperProps {
  trips: TripData[];
  tasks: PlayerTask[];
  events: EventInvite[];
  announcements: GolfAnnouncementMeta[];
  playerName: string;
  teamName: string;
  signalCard?: ReactNode;
}

export function FairwayPlayerHubWrapper({
  trips,
  tasks: initialTasks,
  events: initialEvents,
  announcements,
  playerName,
  teamName,
  signalCard,
}: FairwayPlayerHubWrapperProps) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [events, setEvents] = useState(initialEvents);
  const [, startTransition] = useTransition();

  const handleCompleteTask = useCallback(
    async (taskId: string) => {
      // Optimistic update
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? { ...t, status: 'completed' as const, completed_at: new Date().toISOString() }
            : t,
        ),
      );

      const result = await completeTask(taskId);

      if (!result.success) {
        // Revert on failure
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId ? { ...t, status: 'pending' as const, completed_at: null } : t,
          ),
        );
      }

      startTransition(() => {
        router.refresh();
      });
    },
    [router],
  );

  const handleRSVP = useCallback(
    async (eventId: string, status: 'accepted' | 'declined' | 'tentative') => {
      // Optimistic update
      setEvents((prev) =>
        prev.map((e) => (e.event_id === eventId ? { ...e, rsvp_status: status } : e)),
      );

      const rsvpStatus =
        status === 'accepted' ? 'accepted' : status === 'tentative' ? 'tentative' : 'declined';

      const result = await respondToEvent(eventId, rsvpStatus);

      if (!result.success) {
        // Revert on failure
        setEvents(initialEvents);
      }

      startTransition(() => {
        router.refresh();
      });
    },
    [router, initialEvents],
  );

  return (
    <FairwayPlayerHub
      trips={trips}
      tasks={tasks}
      events={events}
      announcements={announcements}
      playerName={playerName}
      teamName={teamName}
      onCompleteTask={handleCompleteTask}
      onRSVP={handleRSVP}
      signalCard={signalCard}
    />
  );
}

export default FairwayPlayerHub;

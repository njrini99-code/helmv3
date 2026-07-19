'use client';

/**
 * ============================================================================
 * Fairway · pages/team-hub · FairwayTeamHub
 * ----------------------------------------------------------------------------
 * The redesigned PLAYER "Team Hub" (route /golf/dashboard/team-hub, player role)
 * in the warm "Fairway" design system. It CONSOLIDATES four previously-scattered
 * team surfaces into ONE destination with sub-tabs across the top:
 *
 *     Tasks · Announcements · Travel · Class schedule
 *
 * This is a PRESENTATION + LAYOUT rebuild — it does NOT fetch, reshape, or
 * duplicate any business data. The server page (team-hub/page.tsx) fetches the
 * four datasets with the SAME queries the player Hub uses and passes them down.
 * Every sub-tab REUSES the Hub's existing Fairway-native building blocks so the
 * write boundaries are preserved exactly:
 *
 *   • Tasks         → TaskRow rows; the ONE optimistic write (completeTask) lives
 *                     in FairwayTeamHubWrapper (cloned from FairwayPlayerHubWrapper)
 *                     — never in the server page, never destructive.
 *   • Announcements → AnnouncementsList (self-contained: owns its own
 *                     acknowledgeAnnouncement optimistic path + badge refetch).
 *   • Travel        → TripRow + TripDetailSheet (read-only; itinerary writes are
 *                     coach-only and stay out of the player surface).
 *   • Class schedule→ a READ-ONLY schedule view (links out to /dashboard/classes
 *                     for edits) — deliberately NOT duplicating that page's
 *                     destructive delete-then-reinsert write surface.
 *
 * ADDITIVE + GATED. Renders inside a `.fairway-ds` scope on `bg-canvas` (the
 * page supplies the scope wrapper). AnnouncementsList's useNotificationBadges()
 * is fine because the dashboard layout provides the badge Provider.
 * ========================================================================== */

import { useCallback, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, GraduationCap, Megaphone } from 'lucide-react';

import { completeTask } from '@/app/golf/actions/tasks';
import { useNotificationBadges } from '@/contexts/notification-badge-context';
import {
  ViewHeader,
  Button,
  Surface,
  EmptyState,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  fairwayToast,
} from '@/components/fairway';
import type { GolfAnnouncementMeta } from '@/lib/types/golf';
import { formatTimeDisplay, formatDaysDisplay } from '@/lib/utils/schedule-parser';

import {
  SectionTitle,
  TripRow,
  TripDetailSheet,
  TaskRow,
  AnnouncementsList,
  NoUpcomingTrips,
  NoTasks,
  type TripData,
  type PlayerTask,
} from '../hub/hub-parts';
import {
  FairwayPlayerRoster,
  type FairwayPlayerRosterPlayer,
} from '../roster/FairwayPlayerRoster';

/* ─────────────────────────────────────────────────────────────────────────
 * A read-only class schedule row shape (subset of golf_player_classes). The
 * Team Hub Class tab DISPLAYS the schedule; all edits route to the canonical
 * /golf/dashboard/classes editor (whose write surface stays the single source).
 * ──────────────────────────────────────────────────────────────────────── */
export interface TeamHubClass {
  id: string;
  class_name: string;
  instructor: string | null;
  days: string[] | null;
  start_time: string | null;
  end_time: string | null;
  building: string | null;
  room: string | null;
  credits: number | null;
  color: string | null;
}

type TabId = 'tasks' | 'announcements' | 'travel' | 'classes' | 'teammates';

const TAB_IDS: readonly TabId[] = ['tasks', 'announcements', 'travel', 'classes', 'teammates'];

/** Resolve the `?tab=` deep-link (Cmd+K / bookmarks) to a valid tab. */
function normalizeTab(raw: string | undefined): TabId {
  return raw && (TAB_IDS as readonly string[]).includes(raw) ? (raw as TabId) : 'tasks';
}

export interface FairwayTeamHubProps {
  tasks: PlayerTask[];
  announcements: GolfAnnouncementMeta[];
  /**
   * True when the announcements fetch itself FAILED (RPC error, permission
   * denial, transient network hiccup) — distinguishes that from a genuinely
   * empty `announcements` array so the tab never renders the cheerful "No
   * announcements" state over a real outage (W1 count-coherence audit).
   */
  announcementsLoadError?: boolean;
  trips: TripData[];
  classes: TeamHubClass[];
  /** Teammates on the player's team (the roster, folded into the hub). */
  teammates: FairwayPlayerRosterPlayer[];
  playerName: string;
  teamName: string;
  /** Deep-link target from the `?tab=` query (server-passed). Defaults to Tasks. */
  initialTab?: string;
  /** The legacy optimistic completeTask path (owned by the wrapper). */
  onCompleteTask: (taskId: string) => Promise<void>;
}

/**
 * Pure decision for the Announcements tab's branch (W1 count-coherence audit).
 * AnnouncementsList itself already renders an honest "Couldn't load" + retry
 * state when `loadError` is set (see hub-parts.tsx), but only if it's actually
 * mounted — a caller that gates on `announcements.length > 0` alone skips
 * straight to the plain "No announcements" EmptyState on a failed fetch,
 * because a failure and a genuine empty list both arrive as `[]`. A load
 * error must always route to AnnouncementsList so its error state can render.
 * Exported for deterministic unit tests.
 */
export function showAnnouncementsList(announcementCount: number, loadError: boolean): boolean {
  return announcementCount > 0 || loadError;
}

export function FairwayTeamHub({
  tasks,
  announcements,
  announcementsLoadError = false,
  trips,
  classes,
  teammates,
  teamName,
  initialTab,
  onCompleteTask,
}: FairwayTeamHubProps) {
  const [activeTab, setActiveTab] = useState<TabId>(() => normalizeTab(initialTab));
  const [selectedTrip, setSelectedTrip] = useState<TripData | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Keep the URL in sync with the active tab so the view is deep-linkable
  // (Cmd+K / bookmarks) WITHOUT a server round-trip (history.replaceState, not
  // router) — Tasks is the default so it gets a clean URL.
  const handleTabChange = (v: string) => {
    const next = normalizeTab(v);
    setActiveTab(next);
    if (typeof window !== 'undefined') {
      const url = next === 'tasks' ? window.location.pathname : `${window.location.pathname}?tab=${next}`;
      window.history.replaceState(null, '', url);
    }
  };

  // A single stable `now`, set on mount (day-granularity → no hydration text
  // mismatch). TaskRow / TripRow accept a null `now` until it resolves.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
  }, []);

  const pendingTasks = tasks.filter((t) => t.status !== 'completed');
  const completedTasks = tasks.filter((t) => t.status === 'completed');

  const openTrip = (trip: TripData) => {
    setSelectedTrip(trip);
    setSheetOpen(true);
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6 md:py-10">
      {/* ── ONE masthead ─────────────────────────────────────────────────── */}
      <ViewHeader
        eyebrow={teamName}
        title="Team Hub"
        description="Tasks, announcements, travel, and your class schedule — all in one place."
        className="mb-8"
      />

      {/* ── Sub-tabs across the top ──────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList aria-label="Team hub sections">
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="announcements">Announcements</TabsTrigger>
          <TabsTrigger value="travel">Travel</TabsTrigger>
          <TabsTrigger value="classes">Class schedule</TabsTrigger>
          <TabsTrigger value="teammates">Teammates</TabsTrigger>
        </TabsList>

        {/* ═══════════ TASKS ═══════════ */}
        <TabsContent value="tasks">
          {tasks.length > 0 ? (
            <div className="flex flex-col gap-8">
              {pendingTasks.length > 0 ? (
                <section>
                  <SectionTitle count={pendingTasks.length}>To-do</SectionTitle>
                  <Surface padding="sm" className="flex flex-col gap-1.5">
                    {pendingTasks.map((task) => (
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
              {completedTasks.length > 0 ? (
                <section>
                  <SectionTitle count={completedTasks.length}>Completed</SectionTitle>
                  <Surface padding="sm" className="flex flex-col gap-1.5">
                    {completedTasks.map((task) => (
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
            </div>
          ) : (
            <NoTasks />
          )}
        </TabsContent>

        {/* ═══════════ ANNOUNCEMENTS ═══════════ (self-contained acknowledge;
            AnnouncementsList renders null when empty, so guard with an honest
            empty-state so the tab is never blank — but a LOAD FAILURE must
            still route to AnnouncementsList (loadError) rather than the plain
            "No announcements" state, or an outage reads as a genuinely quiet
            team (W1 count-coherence audit).
              P152 — this tab's data comes from get_player_hub_announcements(),
            which (server-side, outside this component) hard-windows to posts
            published in the last 30 days. The dedicated /dashboard/announcements
            page has no such window, so a team with older posts can legitimately
            show 4 there and 0 here — that is NOT a bug in this component, it's
            two different server queries. Rather than let the empty state imply
            "your coach has never posted", the copy is honest about the 30-day
            scope and always offers a way to the full history. */}
        <TabsContent value="announcements">
          {showAnnouncementsList(announcements.length, announcementsLoadError) ? (
            <AnnouncementsList announcements={announcements} loadError={announcementsLoadError} />
          ) : (
            <Surface padding="sm">
              <EmptyState
                variant="subtle"
                icon={Megaphone}
                title="No recent announcements"
                description="Nothing posted in the last 30 days. Older announcements from your coach still live on the full Announcements page."
                action={
                  <Button asChild variant="secondary" size="sm" rightIcon={<ArrowRight className="h-4 w-4" />}>
                    <Link href="/golf/dashboard/announcements">View all announcements</Link>
                  </Button>
                }
              />
            </Surface>
          )}
        </TabsContent>

        {/* ═══════════ TRAVEL ═══════════ (read-only) */}
        <TabsContent value="travel">
          {trips.length > 0 ? (
            <div className="flex flex-col gap-2">
              {trips.map((trip) => (
                <TripRow key={trip.id} trip={trip} now={now} onOpen={() => openTrip(trip)} />
              ))}
            </div>
          ) : (
            <NoUpcomingTrips />
          )}
        </TabsContent>

        {/* ═══════════ CLASS SCHEDULE ═══════════ (read-only; edits route out) */}
        <TabsContent value="classes">
          <ClassScheduleReadonly classes={classes} />
        </TabsContent>

        {/* ═══════════ TEAMMATES ═══════════ (the player roster, folded into the
            hub; read-only teammate grid — header hidden since the hub masthead
            + tab already title it). */}
        <TabsContent value="teammates">
          <FairwayPlayerRoster players={teammates} teamName={teamName} hideHeader />
        </TabsContent>
      </Tabs>

      {/* Trip detail — Fairway Sheet (read-only), reused from the Hub. */}
      <TripDetailSheet trip={selectedTrip} open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * ClassScheduleReadonly — a calm, readable display of the player's classes.
 * READ-ONLY by design: the canonical editor (with its add/import/delete +
 * calendar-mirror writes) stays at /golf/dashboard/classes. Honest-empty.
 * ──────────────────────────────────────────────────────────────────────── */
function ClassScheduleReadonly({ classes }: { classes: TeamHubClass[] }) {
  const manageLink = (
    <Button asChild variant="secondary" rightIcon={<ArrowRight className="h-4 w-4" />}>
      <Link href="/golf/dashboard/classes">Manage classes</Link>
    </Button>
  );

  if (classes.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <SectionTitle>Class schedule</SectionTitle>
        <Surface padding="lg" className="flex flex-col items-center gap-4 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-accent-50 text-accent-700">
            <GraduationCap className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="font-fw-display text-body-lg font-medium text-text-primary">
              No classes added yet
            </p>
            <p className="mt-1 font-fw-sans text-body-sm text-text-tertiary">
              Add your class schedule and it mirrors into the team calendar so conflicts surface early.
            </p>
          </div>
          {manageLink}
        </Surface>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionTitle count={classes.length}>Class schedule</SectionTitle>
      <Surface padding="sm" className="flex flex-col gap-1">
        {classes.map((c) => (
          <ClassRow key={c.id} klass={c} />
        ))}
      </Surface>
      <div className="flex justify-end">{manageLink}</div>
    </div>
  );
}

function ClassRow({ klass }: { klass: TeamHubClass }) {
  const time =
    klass.start_time && klass.end_time
      ? `${formatTimeDisplay(klass.start_time)} – ${formatTimeDisplay(klass.end_time)}`
      : klass.start_time
        ? formatTimeDisplay(klass.start_time)
        : null;
  const when = [
    klass.days && klass.days.length > 0 ? formatDaysDisplay(klass.days) : null,
    time,
  ]
    .filter(Boolean)
    .join(' · ');
  const where = [klass.building, klass.room].filter(Boolean).join(' ');

  return (
    <div className="flex items-center gap-3 rounded-fw-md px-3 py-2.5">
      {/* Course color dot — the player's own per-class color, honestly shown. */}
      <span
        aria-hidden
        className="h-2.5 w-2.5 flex-shrink-0 rounded-full ring-1 ring-inset ring-border-strong"
        style={{ backgroundColor: klass.color || 'var(--fw-color-accent-500)' }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-fw-sans text-body font-medium text-text-primary">
          {klass.class_name}
        </p>
        {when ? (
          <p className="truncate font-fw-sans text-caption text-text-tertiary">{when}</p>
        ) : null}
      </div>
      {where ? (
        <span className="flex-shrink-0 font-fw-mono text-caption text-text-tertiary">{where}</span>
      ) : null}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * FairwayTeamHubWrapper — the optimistic write boundary.
 * ----------------------------------------------------------------------------
 * Holds the SAME completeTask optimistic path as FairwayPlayerHubWrapper,
 * VERBATIM (optimistic setState → call the unchanged completeTask action →
 * revert on failure → router.refresh in a transition). The mutation is NOT in
 * the server page; it lives here in the client boundary. AnnouncementsList owns
 * its own acknowledge path; Travel + Classes are read-only on the player side.
 * ──────────────────────────────────────────────────────────────────────── */
export interface FairwayTeamHubWrapperProps {
  tasks: PlayerTask[];
  announcements: GolfAnnouncementMeta[];
  /** True when the announcements fetch itself failed (see FairwayTeamHubProps). */
  announcementsLoadError?: boolean;
  trips: TripData[];
  classes: TeamHubClass[];
  teammates: FairwayPlayerRosterPlayer[];
  playerName: string;
  teamName: string;
  /** Deep-link target from the `?tab=` query (server-passed). */
  initialTab?: string;
}

export function FairwayTeamHubWrapper({
  tasks: initialTasks,
  announcements,
  announcementsLoadError = false,
  trips,
  classes,
  teammates,
  playerName,
  teamName,
  initialTab,
}: FairwayTeamHubWrapperProps) {
  const router = useRouter();
  const badges = useNotificationBadges();
  const [tasks, setTasks] = useState(initialTasks);
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
        // Surface the failure so the silent revert is explained (gate B3 / Nielsen #1, #9).
        fairwayToast.error(result.error || 'Could not mark task complete. Please try again.');
      } else {
        // The sidebar "Tasks" badge is a separate polled feed — refetch it so it
        // drops immediately instead of waiting up to 45s (conn-golf-player
        // Finding 3).
        void badges.refetch();
      }

      startTransition(() => {
        router.refresh();
      });
    },
    [router, badges],
  );

  return (
    <FairwayTeamHub
      tasks={tasks}
      announcements={announcements}
      announcementsLoadError={announcementsLoadError}
      trips={trips}
      classes={classes}
      teammates={teammates}
      playerName={playerName}
      teamName={teamName}
      initialTab={initialTab}
      onCompleteTask={handleCompleteTask}
    />
  );
}

export default FairwayTeamHub;

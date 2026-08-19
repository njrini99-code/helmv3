'use client';

/**
 * ============================================================================
 * Fairway · pages/team-hub · FairwayTeamHub
 * ----------------------------------------------------------------------------
 * The PLAYER "Team Hub" (route /golf/dashboard/team-hub, player role) as a
 * BENTO OVERVIEW ("Locker room" direction, 2026-08-18). Every team domain is
 * one glanceable card, sized by urgency, and each card routes to its CANONICAL
 * detail page (TEAM_HUB_CARD_ROUTES in ./team-hub-routes) — the sub-tab layer
 * this surface used to carry is gone, and the server page redirects the old
 * `?tab=` deep links to the same destinations, so no pre-redesign link breaks:
 *
 *     Tasks         → /dashboard/tasks           (inline complete stays here)
 *     Announcements → /dashboard/announcements
 *     Travel        → /dashboard/travel?trip=…   (next trip auto-selects)
 *     Classes       → /dashboard/classes
 *     Teammates     → /dashboard/roster
 *
 * This is a PRESENTATION + LAYOUT surface — it does NOT fetch, reshape, or
 * duplicate any business data. The server page (team-hub/page.tsx) fetches the
 * same datasets the tabbed hub used and passes them down, each with an honest
 * per-domain load-error flag (never render a failed read as a quiet week).
 * Write boundaries are preserved exactly:
 *
 *   • Tasks    → TaskRow rows; the ONE optimistic write (completeTask) lives in
 *                FairwayTeamHubWrapper — never in the server page, never
 *                destructive. Because these rows are interactive, the Tasks
 *                card is NOT a whole-card link (design-system invariant: no
 *                interactive children inside a fully-clickable element) — its
 *                header and footer are the links instead.
 *   • Announcements / Travel / Classes / Teammates → read-only previews with
 *                NO nested interactive children, so each whole card is one
 *                <Link>. On a load error the card renders as a plain Surface
 *                with a retry button instead (retry = router.refresh()).
 *
 * Trip recency runs on the TEAM's wall clock: the server passes
 * `todayInTeamZone` (YYYY-MM-DD via todayIsoInZone) and the countdown is pure
 * date-string arithmetic — no viewer-clock reads, no hydration drift.
 *
 * ADDITIVE + GATED. Renders inside a `.fairway-ds` scope on `bg-canvas` (the
 * page supplies the scope wrapper).
 * ========================================================================== */

import { useCallback, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  GraduationCap,
  Megaphone,
  Plane,
  Users,
} from 'lucide-react';

import { completeTask } from '@/app/golf/actions/tasks';
import { useNotificationBadges } from '@/contexts/notification-badge-context';
import { ViewHeader, Button, Surface, EmptyState, fairwayToast } from '@/components/fairway';
import type { GolfAnnouncementMeta } from '@/lib/types/golf';
import { formatTimeDisplay, formatDaysDisplay } from '@/lib/utils/schedule-parser';

import { TaskRow, type TripData, type PlayerTask } from '../hub/hub-parts';
import { TEAM_HUB_CARD_ROUTES } from './team-hub-routes';

/* ─────────────────────────────────────────────────────────────────────────
 * A read-only class schedule row shape (subset of golf_player_classes). The
 * Classes card DISPLAYS the schedule; all edits route to the canonical
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

/** The Teammates card's compact roster preview shape. */
export interface TeamHubTeammate {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

export interface FairwayTeamHubProps {
  tasks: PlayerTask[];
  /** The task assignment or task-detail read failed; never present that as no work. */
  tasksLoadError?: boolean;
  announcements: GolfAnnouncementMeta[];
  /**
   * True when the announcements fetch itself FAILED (RPC error, permission
   * denial, transient network hiccup) — distinguishes that from a genuinely
   * empty `announcements` array so the card never renders the cheerful "No
   * recent announcements" state over a real outage (W1 count-coherence audit).
   */
  announcementsLoadError?: boolean;
  /** The first itinerary whose STAY has not ended, resolved on the team clock
   *  (return_date participates — an in-progress trip is still the next trip,
   *  #1514). */
  nextUpcomingTrip?: TripData | null;
  /** The travel itinerary read failed; never present that as no travel. */
  tripsLoadError?: boolean;
  classes: TeamHubClass[];
  /** The class schedule read failed; never present that as no classes. */
  classesLoadError?: boolean;
  teammates: TeamHubTeammate[];
  /** The roster read failed; never present that as an empty team. */
  teammatesLoadError?: boolean;
  /** The team wall-clock "today" (YYYY-MM-DD, server-resolved via todayIsoInZone). */
  todayInTeamZone: string;
  teamName: string;
  /** The legacy optimistic completeTask path (owned by the wrapper). */
  onCompleteTask: (taskId: string) => Promise<void>;
}

/** Max pending TaskRows previewed on the Tasks card before the footer count. */
const TASK_PREVIEW_CAP = 5;
/** Max class rows previewed on the Classes card. */
const CLASS_PREVIEW_CAP = 3;
/** Max avatars in the Teammates stack before the "+N" overflow chip. */
const AVATAR_STACK_CAP = 6;

/** Whole days between two YYYY-MM-DD strings (UTC-anchored, pure). */
function diffDays(fromIso: string, toIso: string): number | null {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.round((to - from) / 86_400_000);
}

/**
 * Human label for how far out the next trip's departure is, on the team
 * clock. Departure in the past reads "In progress" — the server only nominates
 * a trip whose stay has not ended. Exported for deterministic unit tests.
 */
export function tripCountdownLabel(
  departureDate: string | null | undefined,
  todayInTeamZone: string,
): string | null {
  if (!departureDate) return null;
  const days = diffDays(todayInTeamZone, departureDate);
  if (days === null) return null;
  if (days > 1) return `In ${days} days`;
  if (days === 1) return 'Tomorrow';
  if (days === 0) return 'Today';
  return 'In progress';
}

export function FairwayTeamHub({
  tasks,
  tasksLoadError = false,
  announcements,
  announcementsLoadError = false,
  nextUpcomingTrip = null,
  tripsLoadError = false,
  classes,
  classesLoadError = false,
  teammates,
  teammatesLoadError = false,
  todayInTeamZone,
  teamName,
  onCompleteTask,
}: FairwayTeamHubProps) {
  const router = useRouter();

  // A single stable `now`, set on mount (day-granularity → no hydration text
  // mismatch). TaskRow accepts a null `now` until it resolves; the trip
  // countdown deliberately does NOT read it (team clock only, see header).
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
  }, []);

  const retryLoad = () => router.refresh();

  const pendingTasks = tasks.filter((t) => t.status !== 'completed');
  const previewTasks = pendingTasks.slice(0, TASK_PREVIEW_CAP);

  const countdown = nextUpcomingTrip
    ? tripCountdownLabel(nextUpcomingTrip.departure_date, todayInTeamZone)
    : null;

  const latestAnnouncement = announcements[0] ?? null;
  const needsAckCount = announcements.filter(
    (a) => a.requires_acknowledgement && !a.has_player_acknowledged,
  ).length;

  const previewClasses = classes.slice(0, CLASS_PREVIEW_CAP);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-6 md:py-10">
      <ViewHeader
        eyebrow={teamName}
        title="Team Hub"
        description="Your team at a glance — open a card for the full picture."
        className="mb-8"
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* ═══════════ TASKS — interactive rows, so header/footer link ═══════ */}
        <Surface padding="md" className="flex flex-col gap-4 md:row-span-2">
          <Link
            href={TEAM_HUB_CARD_ROUTES.tasks}
            className="group flex items-center justify-between gap-2 rounded-fw-sm"
          >
            <span className="flex items-center gap-2">
              <h2 className="font-fw-sans text-body-sm font-semibold text-text-secondary">Tasks</h2>
              {!tasksLoadError && pendingTasks.length > 0 ? (
                <span className="rounded-full bg-surface-sunken px-2 font-fw-mono text-caption text-text-tertiary">
                  {pendingTasks.length} open
                </span>
              ) : null}
            </span>
            <ChevronRight
              className="h-4 w-4 text-text-tertiary transition-transform duration-150 group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>

          {tasksLoadError ? (
            <EmptyState
              variant="subtle"
              icon={ClipboardList}
              title="Couldn't load tasks"
              description="Try again to see your assigned work."
              action={
                <Button type="button" variant="secondary" size="sm" onClick={retryLoad}>
                  Try again
                </Button>
              }
            />
          ) : previewTasks.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {previewTasks.map((task) => (
                <TaskRow key={task.id} task={task} now={now} onComplete={() => onCompleteTask(task.id)} />
              ))}
            </div>
          ) : (
            <EmptyState
              variant="subtle"
              icon={CheckCircle2}
              title="You're all caught up"
              description="Anything your coach assigns lands here, with due dates up front."
            />
          )}

          {!tasksLoadError ? (
            <div className="mt-auto">
              <Link
                href={TEAM_HUB_CARD_ROUTES.tasks}
                className="font-fw-sans text-body-sm font-medium text-accent-700 hover:text-accent-800"
              >
                {pendingTasks.length > 0 ? `All tasks · ${pendingTasks.length} open` : 'All tasks'}
              </Link>
            </div>
          ) : null}
        </Surface>

        {/* ═══════════ TRAVEL — read-only preview, whole card links ═════════ */}
        {tripsLoadError ? (
          <CardErrorState
            label="Travel"
            icon={Plane}
            title="Couldn't load travel plans"
            description="Try again to see your team itineraries."
            onRetry={retryLoad}
          />
        ) : (
          <CardLink
            href={
              nextUpcomingTrip
                ? `${TEAM_HUB_CARD_ROUTES.travel}?trip=${encodeURIComponent(nextUpcomingTrip.id)}`
                : TEAM_HUB_CARD_ROUTES.travel
            }
          >
            <CardHeader label="Travel" />
            {nextUpcomingTrip ? (
              <div className="flex flex-col gap-1">
                {countdown ? (
                  <span className="font-fw-mono text-h2 font-semibold text-text-primary">{countdown}</span>
                ) : null}
                <p className="font-fw-sans text-body font-semibold text-text-primary">
                  {nextUpcomingTrip.event_name || nextUpcomingTrip.destination || 'Team trip'}
                </p>
                <p className="font-fw-sans text-body-sm text-text-secondary">
                  {[
                    nextUpcomingTrip.destination,
                    nextUpcomingTrip.departure_time
                      ? `departs ${formatTimeDisplay(nextUpcomingTrip.departure_time)}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'Itinerary details inside'}
                </p>
              </div>
            ) : (
              <EmptyState
                variant="subtle"
                icon={Plane}
                title="No upcoming travel"
                description="Tournament travel shows up here with departure times and lodging."
              />
            )}
          </CardLink>
        )}

        {/* ═══════════ ANNOUNCEMENTS — read-only preview, whole card links ══
            P152 — this card's data comes from get_player_hub_announcements(),
            which (server-side) hard-windows to posts published in the last 30
            days. The dedicated /dashboard/announcements page has no such
            window, so a team with older posts can legitimately show rows there
            and none here — the empty copy is honest about that scope and the
            card itself routes to the full history. A LOAD FAILURE renders the
            retry state, never the quiet-team state (W1 audit; #1514 gave this
            card the same retry affordance as its siblings). */}
        {announcementsLoadError ? (
          <CardErrorState
            label="Announcements"
            icon={Megaphone}
            title="Couldn't load announcements"
            description="Try again to see updates from your coach."
            onRetry={retryLoad}
          />
        ) : (
          <CardLink href={TEAM_HUB_CARD_ROUTES.announcements}>
            <CardHeader
              label="Announcements"
              accent={
                needsAckCount > 0 ? (
                  <span className="rounded-full bg-accent-50 px-2 font-fw-mono text-caption text-accent-800">
                    {needsAckCount} to acknowledge
                  </span>
                ) : null
              }
            />
            {latestAnnouncement ? (
              <div className="flex flex-col gap-1">
                <p className="line-clamp-2 font-fw-sans text-body font-medium text-text-primary">
                  {latestAnnouncement.title}
                </p>
                <p className="font-fw-sans text-caption text-text-tertiary">
                  {announcements.length === 1
                    ? 'Latest from your coach'
                    : `Latest of ${announcements.length} recent`}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <p className="font-fw-sans text-body font-medium text-text-primary">
                  No recent announcements
                </p>
                <p className="font-fw-sans text-body-sm text-text-tertiary">
                  Nothing posted in the last 30 days. View all announcements for the full history.
                </p>
              </div>
            )}
          </CardLink>
        )}

        {/* ═══════════ CLASSES — read-only preview, whole card links ════════ */}
        {classesLoadError ? (
          <CardErrorState
            label="Class schedule"
            icon={GraduationCap}
            title="Couldn't load your class schedule"
            description="Try again to see your classes."
            onRetry={retryLoad}
          />
        ) : (
          <CardLink href={TEAM_HUB_CARD_ROUTES.classes}>
            <CardHeader
              label="Class schedule"
              accent={
                classes.length > CLASS_PREVIEW_CAP ? (
                  <span className="rounded-full bg-surface-sunken px-2 font-fw-mono text-caption text-text-tertiary">
                    {classes.length} classes
                  </span>
                ) : null
              }
            />
            {previewClasses.length > 0 ? (
              <div className="flex flex-col gap-2">
                {previewClasses.map((c) => (
                  <ClassPreviewRow key={c.id} klass={c} />
                ))}
              </div>
            ) : (
              <EmptyState
                variant="subtle"
                icon={GraduationCap}
                title="No classes added yet"
                description="Add your schedule and it mirrors into the team calendar so conflicts surface early."
              />
            )}
          </CardLink>
        )}

        {/* ═══════════ TEAMMATES — read-only preview, whole card links ══════ */}
        {teammatesLoadError ? (
          <CardErrorState
            label="Teammates"
            icon={Users}
            title="Couldn't load your roster"
            description="Try again to see your teammates."
            onRetry={retryLoad}
            className="md:col-span-2"
          />
        ) : (
          <CardLink href={TEAM_HUB_CARD_ROUTES.teammates} className="md:col-span-2">
            <div className="flex flex-wrap items-center gap-4">
              <CardHeader label="Teammates" className="flex-1 basis-40" />
              {teammates.length > 0 ? (
                <>
                  <div className="flex items-center">
                    {teammates.slice(0, AVATAR_STACK_CAP).map((tm, i) => (
                      <TeammateAvatar key={tm.id} teammate={tm} stacked={i > 0} />
                    ))}
                    {teammates.length > AVATAR_STACK_CAP ? (
                      <span className="-ml-2 grid h-8 w-8 place-items-center rounded-full border-2 border-surface bg-surface-sunken font-fw-mono text-caption font-semibold text-text-secondary">
                        +{teammates.length - AVATAR_STACK_CAP}
                      </span>
                    ) : null}
                  </div>
                  <span className="font-fw-sans text-body-sm font-medium text-accent-700">View roster</span>
                </>
              ) : (
                <span className="font-fw-sans text-body-sm text-text-tertiary">
                  No teammates yet — your roster fills in as players join the team.
                </span>
              )}
            </div>
          </CardLink>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Card shells — read-only cards are ONE link each (no nested interactive
 * children, per the design-system invariant), sharing Surface's resting
 * treatment with a quiet hover tint + chevron slide as the affordance. A
 * card in a load-error state swaps to a plain Surface with a retry button.
 * ──────────────────────────────────────────────────────────────────────── */

function CardLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={`group block rounded-card ${className ?? ''}`}>
      <Surface
        padding="md"
        className="flex h-full flex-col gap-3 transition-colors duration-150 group-hover:bg-surface-tint"
      >
        {children}
      </Surface>
    </Link>
  );
}

function CardHeader({
  label,
  accent,
  className,
}: {
  label: string;
  accent?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between gap-2 ${className ?? ''}`}>
      <span className="flex items-center gap-2">
        <h2 className="font-fw-sans text-body-sm font-semibold text-text-secondary">{label}</h2>
        {accent}
      </span>
      <ChevronRight
        className="h-4 w-4 text-text-tertiary transition-transform duration-150 group-hover:translate-x-0.5"
        aria-hidden
      />
    </div>
  );
}

function CardErrorState({
  label,
  icon,
  title,
  description,
  onRetry,
  className,
}: {
  label: string;
  icon: typeof ClipboardList;
  title: string;
  description: string;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <Surface padding="md" className={`flex h-full flex-col gap-3 ${className ?? ''}`}>
      <h2 className="font-fw-sans text-body-sm font-semibold text-text-secondary">{label}</h2>
      <EmptyState
        variant="subtle"
        icon={icon}
        title={title}
        description={description}
        action={
          <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        }
      />
    </Surface>
  );
}

function ClassPreviewRow({ klass }: { klass: TeamHubClass }) {
  const time =
    klass.start_time && klass.end_time
      ? `${formatTimeDisplay(klass.start_time)} – ${formatTimeDisplay(klass.end_time)}`
      : klass.start_time
        ? formatTimeDisplay(klass.start_time)
        : null;
  const when = [klass.days && klass.days.length > 0 ? formatDaysDisplay(klass.days) : null, time]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex items-center gap-3">
      {/* Course color dot — the player's own per-class color, honestly shown. */}
      <span
        aria-hidden
        className="h-2.5 w-2.5 flex-shrink-0 rounded-full ring-1 ring-inset ring-border-strong"
        style={{ backgroundColor: klass.color || 'var(--fw-color-accent-500)' }}
      />
      <p className="min-w-0 flex-1 truncate font-fw-sans text-body-sm font-medium text-text-primary">
        {klass.class_name}
      </p>
      {when ? (
        <span className="flex-shrink-0 font-fw-mono text-caption text-text-tertiary">{when}</span>
      ) : null}
    </div>
  );
}

function TeammateAvatar({ teammate, stacked }: { teammate: TeamHubTeammate; stacked: boolean }) {
  const initials =
    `${teammate.first_name?.[0] ?? ''}${teammate.last_name?.[0] ?? ''}`.toUpperCase() || '•';
  const name = `${teammate.first_name ?? ''} ${teammate.last_name ?? ''}`.trim();
  return (
    <span
      title={name || undefined}
      className={`grid h-8 w-8 place-items-center overflow-hidden rounded-full border-2 border-surface bg-accent-100 font-fw-mono text-caption font-semibold text-accent-800 ${stacked ? '-ml-2' : ''}`}
    >
      {teammate.avatar_url ? (
        /* Plain <img>: a 32px avatar chip — next/image adds nothing at this size. */
        <img src={teammate.avatar_url} alt="" className="h-full w-full object-cover" />
      ) : (
        initials
      )}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * FairwayTeamHubWrapper — the optimistic write boundary.
 * ----------------------------------------------------------------------------
 * Holds the SAME completeTask optimistic path as FairwayPlayerHubWrapper,
 * VERBATIM (optimistic setState → call the unchanged completeTask action →
 * revert on failure → router.refresh in a transition). The mutation is NOT in
 * the server page; it lives here in the client boundary. All other card
 * domains are read-only on this surface — their writes live on the detail
 * pages the cards route to.
 * ──────────────────────────────────────────────────────────────────────── */
export interface FairwayTeamHubWrapperProps {
  tasks: PlayerTask[];
  tasksLoadError?: boolean;
  announcements: GolfAnnouncementMeta[];
  /** True when the announcements fetch itself failed (see FairwayTeamHubProps). */
  announcementsLoadError?: boolean;
  nextUpcomingTrip?: TripData | null;
  tripsLoadError?: boolean;
  classes: TeamHubClass[];
  classesLoadError?: boolean;
  teammates: TeamHubTeammate[];
  teammatesLoadError?: boolean;
  todayInTeamZone: string;
  teamName: string;
}

export function FairwayTeamHubWrapper({
  tasks: initialTasks,
  tasksLoadError = false,
  announcements,
  announcementsLoadError = false,
  nextUpcomingTrip = null,
  tripsLoadError = false,
  classes,
  classesLoadError = false,
  teammates,
  teammatesLoadError = false,
  todayInTeamZone,
  teamName,
}: FairwayTeamHubWrapperProps) {
  const router = useRouter();
  const badges = useNotificationBadges();
  const [tasks, setTasks] = useState(initialTasks);
  const [, startTransition] = useTransition();

  // A retry calls `router.refresh()`, which streams a fresh server prop into
  // this still-mounted client wrapper. Keep the optimistic local copy in sync
  // with that prop so a recovered task read does not remain an empty array.
  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

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
        // The dark-rail "Team" badge is a separate polled feed — refetch it so
        // it drops immediately instead of waiting up to 45s (conn-golf-player
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
      tasksLoadError={tasksLoadError}
      announcements={announcements}
      announcementsLoadError={announcementsLoadError}
      nextUpcomingTrip={nextUpcomingTrip}
      tripsLoadError={tripsLoadError}
      classes={classes}
      classesLoadError={classesLoadError}
      teammates={teammates}
      teammatesLoadError={teammatesLoadError}
      todayInTeamZone={todayInTeamZone}
      teamName={teamName}
      onCompleteTask={handleCompleteTask}
    />
  );
}

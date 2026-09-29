import { notFound } from 'next/navigation';
import { ClubhouseFrame } from '@/clubhouse/shell/ClubhouseFrame';
import { CoachHome } from '@/clubhouse/screens/home/CoachHome';
import { HomeSkeleton } from '@/clubhouse/screens/home/HomeSkeleton';
import { PreviewError } from '@/clubhouse/preview/PreviewError';
import { Roster } from '@/clubhouse/screens/roster/Roster';
import { RosterSkeleton } from '@/clubhouse/screens/roster/RosterSkeleton';
import { PREVIEW_ROSTER, PREVIEW_ROSTER_EMPTY, PREVIEW_ROSTER_FAILED } from '@/clubhouse/preview/fixtures-roster';
import { StatsTeam } from '@/clubhouse/screens/stats/StatsTeam';
import { StatsPlayer } from '@/clubhouse/screens/stats/StatsPlayer';
import { StatsSkeleton } from '@/clubhouse/screens/stats/StatsSkeleton';
import { PREVIEW_PLAYER, PREVIEW_PLAYER_EARLY, PREVIEW_TEAM_STATS } from '@/clubhouse/preview/fixtures-stats';
import '@/clubhouse/styles/stats.css';
import '@/clubhouse/styles/calendar.css';
import '@/clubhouse/styles/messages.css';
import { PreviewMessages } from '@/clubhouse/preview/PreviewMessages';
import { MessagesSkeleton } from '@/clubhouse/screens/messages/MessagesSkeleton';
import { Calendar } from '@/clubhouse/screens/calendar/Calendar';
import { CalendarSkeleton } from '@/clubhouse/screens/calendar/CalendarSkeleton';
import {
  PREVIEW_CALENDAR,
  PREVIEW_CALENDAR_EMPTY,
  PREVIEW_CALENDAR_FAILED,
  PREVIEW_CALENDAR_PARTIAL,
  PREVIEW_CALENDAR_PLAYER,
} from '@/clubhouse/preview/fixtures-calendar';
import {
  PREVIEW_COACH,
  PREVIEW_HOME,
  PREVIEW_HOME_EMPTY,
  PREVIEW_HOME_FAILED,
  PREVIEW_PLAYER as PREVIEW_PLAYER_USER,
  PREVIEW_SHELL,
} from '@/clubhouse/preview/fixtures';

/**
 * Dev-only Clubhouse preview: every screen and state rendered from the
 * handoff's sample data, with no auth and no database, for comparison with
 * design/handoff/screenshots. 404 in production.
 *
 *   /clubhouse-preview/home   ?state=empty | failed | loading | error
 *   /clubhouse-preview/calendar ?state=empty | failed | partial | loading, &view=, &date=, &event=
 *   /clubhouse-preview/calendar-player
 *   /clubhouse-preview/messages ?state=empty | rail | failed | thread-failed | loading | loading-route
 */
export default async function ClubhousePreview({
  params,
  searchParams,
}: {
  params: Promise<{ screen: string }>;
  searchParams: Promise<{ state?: string; view?: string; date?: string; event?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { screen } = await params;
  const { state, view, date, event } = await searchParams;
  const calView = view === 'day' || view === 'month' || view === 'agenda' ? view : 'week';

  const screens: Record<string, { path: string; node: React.ReactNode }> = {
    home: {
      path: '/golf/dashboard',
      node:
        state === 'loading' ? (
          <HomeSkeleton />
        ) : state === 'error' ? (
          <PreviewError kind="unknown" />
        ) : (
          <CoachHome data={state === 'empty' ? PREVIEW_HOME_EMPTY : state === 'failed' ? PREVIEW_HOME_FAILED : PREVIEW_HOME} />
        ),
    },
    roster: {
      path: '/golf/dashboard/roster',
      node:
        state === 'loading' ? (
          <RosterSkeleton />
        ) : (
          <Roster data={state === 'empty' ? PREVIEW_ROSTER_EMPTY : state === 'failed' ? PREVIEW_ROSTER_FAILED : PREVIEW_ROSTER} />
        ),
    },
    stats: {
      path: '/golf/dashboard/stats',
      node:
        state === 'loading' ? (
          <StatsSkeleton />
        ) : state === 'empty' ? (
          <StatsTeam data={{ ...PREVIEW_TEAM_STATS, roundCount: 0, grid: [], players: [], putting: null, bests: [] }} />
        ) : (
          <StatsTeam data={PREVIEW_TEAM_STATS} />
        ),
    },
    player: {
      path: '/golf/dashboard/stats',
      node: <StatsPlayer data={state === 'early' ? PREVIEW_PLAYER_EARLY : state === 'self' ? { ...PREVIEW_PLAYER, viewer: 'player', nav: null } : PREVIEW_PLAYER} coachId={state === 'self' ? null : 'preview-coach'} />,
    },
    calendar: {
      path: '/golf/dashboard/calendar',
      node:
        state === 'loading' ? (
          <CalendarSkeleton />
        ) : (
          <Calendar
            frozen
            initialEvent={event}
            data={{
              ...(state === 'empty' ? PREVIEW_CALENDAR_EMPTY : state === 'failed' ? PREVIEW_CALENDAR_FAILED : state === 'partial' ? PREVIEW_CALENDAR_PARTIAL : PREVIEW_CALENDAR),
              view: calView,
              anchor: date ?? PREVIEW_CALENDAR.anchor,
            }}
          />
        ),
    },
    'calendar-player': {
      path: '/golf/dashboard/calendar',
      node: <Calendar frozen initialEvent={event} data={{ ...PREVIEW_CALENDAR_PLAYER, view: calView, anchor: date ?? PREVIEW_CALENDAR.anchor }} />,
    },
    messages: {
      path: '/golf/dashboard/messages',
      node: state === 'loading-route' ? <MessagesSkeleton /> : <PreviewMessages state={state} />,
    },
    'messages-player': {
      path: '/golf/dashboard/messages',
      node: <PreviewMessages state={state} role="player" />,
    },
  };
  const entry = screens[screen];
  if (!entry) notFound();
  const user = screen === 'calendar-player' || screen === 'messages-player' ? { ...PREVIEW_PLAYER_USER, name: 'Jonah Okafor' } : PREVIEW_COACH;

  return (
    <ClubhouseFrame userData={user} shell={PREVIEW_SHELL} pathname={entry.path} forceRebuilt>
      {entry.node}
    </ClubhouseFrame>
  );
}

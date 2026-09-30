import { notFound } from 'next/navigation';
import { ClubhouseFrame } from '@/clubhouse/shell/ClubhouseFrame';
import { CoachHome } from '@/clubhouse/screens/home/CoachHome';
import { PlayerHome } from '@/clubhouse/screens/home/PlayerHome';
import { PreviewHub } from '@/clubhouse/preview/PreviewHub';
import { PreviewRounds } from '@/clubhouse/preview/PreviewRounds';
import { RoundReview } from '@/clubhouse/screens/rounds/RoundReview';
import { PREVIEW_REVIEW, PREVIEW_REVIEW_COACH, PREVIEW_REVIEW_HOLE_BY_HOLE, PREVIEW_REVIEW_NO_HOLES, PREVIEW_REVIEW_NO_SHOTS, PREVIEW_REVIEW_TOTAL_ONLY } from '@/clubhouse/preview/fixtures-round-review';
import { PREVIEW_ROUNDS, PREVIEW_ROUNDS_EMPTY, PREVIEW_ROUNDS_FAILED, PREVIEW_ROUNDS_IDLE, PREVIEW_ROUNDS_MANY, PREVIEW_ROUNDS_NO_SEASON, PREVIEW_ROUNDS_UNFINISHED_FAILED } from '@/clubhouse/preview/fixtures-rounds';
import '@/clubhouse/styles/rounds.css';
import { PREVIEW_HUB_COACH, PREVIEW_HUB_COACH_EMPTY, PREVIEW_HUB_COACH_FAILED, PREVIEW_HUB_PLAYER, PREVIEW_HUB_PLAYER_EMPTY, PREVIEW_HUB_PLAYER_FAILED } from '@/clubhouse/preview/fixtures-hub';
import { PREVIEW_PLAYER_HOME, PREVIEW_PLAYER_HOME_EMPTY, PREVIEW_PLAYER_HOME_FAILED, PREVIEW_PLAYER_HOME_NO_EVENTS } from '@/clubhouse/preview/fixtures-player-home';
import { HomeSkeleton } from '@/clubhouse/screens/home/HomeSkeleton';
import { PreviewError } from '@/clubhouse/preview/PreviewError';
import { Roster } from '@/clubhouse/screens/roster/Roster';
import { RosterSkeleton } from '@/clubhouse/screens/roster/RosterSkeleton';
import { PREVIEW_ROSTER, PREVIEW_ROSTER_EMPTY, PREVIEW_ROSTER_FAILED, PREVIEW_ROSTER_PARTIAL } from '@/clubhouse/preview/fixtures-roster';
import { StatsTeam } from '@/clubhouse/screens/stats/StatsTeam';
import { StatsPlayer } from '@/clubhouse/screens/stats/StatsPlayer';
import { StatsSkeleton } from '@/clubhouse/screens/stats/StatsSkeleton';
import { PREVIEW_PLAYER, PREVIEW_PLAYER_EARLY, PREVIEW_TEAM_STATS } from '@/clubhouse/preview/fixtures-stats';
import '@/clubhouse/styles/stats.css';
import '@/clubhouse/styles/calendar.css';
import '@/clubhouse/styles/messages.css';
import { PreviewMessages } from '@/clubhouse/preview/PreviewMessages';
import { PreviewBell } from '@/clubhouse/preview/PreviewBell';
import { PreviewSettings } from '@/clubhouse/preview/PreviewSettings';
import { QualifiersList } from '@/clubhouse/screens/qualifiers/QualifiersList';
import { QualifierDetailSkeleton, QualifierFormSkeleton, QualifiersSkeleton } from '@/clubhouse/screens/qualifiers/QualifiersSkeleton';
import { PreviewQualifierDetail, PreviewQualifierForm, PreviewQualifierSelection } from '@/clubhouse/preview/PreviewQualifiers';
import { DETAIL_INDEX, previewCreateForm, previewDetail, previewEditForm, previewList, previewSelection } from '@/clubhouse/preview/fixtures-qualifiers';
import { SettingsSkeleton } from '@/clubhouse/screens/settings/SettingsSkeleton';
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
  PREVIEW_HOME_NO_EVENTS,
  PREVIEW_HOME_NOW,
  PREVIEW_PLAYER as PREVIEW_PLAYER_USER,
  PREVIEW_SHELL,
} from '@/clubhouse/preview/fixtures';

/**
 * Dev-only Clubhouse preview: every screen and state rendered from the
 * handoff's sample data, with no auth and no database, for comparison with
 * design/handoff/screenshots. 404 in production.
 *
 *   /clubhouse-preview/home   ?state=empty | noevents | failed | loading | error   (empty is the first-run page)
 *   /clubhouse-preview/home-player ?state=empty | noevents | failed | loading   (Theo; empty is the first-run page)
 *   /clubhouse-preview/hub, hub-player ?state=empty | failed | failwrites, &tab=home | ann | travel | docs | tasks
 *   /clubhouse-preview/rounds ?state=idle | many | empty | noseason | failed | unfinished-failed | failwrites   (Jonah)
 *   /clubhouse-preview/round ?state=coach | noshots | noholes | total | holebyhole   (a round's review)
 *   /clubhouse-preview/roster ?state=empty | failed | partial | loading
 *   /clubhouse-preview/stats  ?state=empty | failed | partial | crash | loading
 *   /clubhouse-preview/calendar ?state=empty | failed | partial | loading, &view=, &date=, &event=
 *   /clubhouse-preview/calendar-player
 *   /clubhouse-preview/messages ?state=empty | rail | failed | thread-failed | loading | loading-route | files-failed | add-failed
 *   /clubhouse-preview/settings ?state=player | noteam | failed | partial | assistant | failwrites | loading, &section=
 *   /clubhouse-preview/qualifiers ?state=empty | failed | partial | loading  (and qualifiers-player, my-qualifiers ?state=empty)
 *   /clubhouse-preview/qualifier ?q=live | upcoming | selected | completed | spring, &state=failed | scores | partial | failwrites | loading
 *   /clubhouse-preview/qualifier-player ?q=…   /clubhouse-preview/qualifier-new, qualifier-edit ?state=failed | noroster | courses | failwrites | loading
 *   /clubhouse-preview/qualifier-selection ?q=standings | picking | picked | selected, &state=failwrites
 *   any screen &bell=empty | failed | slow   (the top-bar notifications feed)
 */
export default async function ClubhousePreview({
  params,
  searchParams,
}: {
  params: Promise<{ screen: string }>;
  searchParams: Promise<{ state?: string; view?: string; date?: string; event?: string; bell?: string; new?: string; section?: string; q?: string; tab?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { screen } = await params;
  const { state, view, date, event, bell, new: isNew, section, q, tab } = await searchParams;
  const qDetail = (role: 'coach' | 'player') => {
    const d = previewDetail(DETAIL_INDEX[q ?? 'live'] ?? 0, role);
    if (state === 'failed') return { ...d, entriesError: true, board: null, entrants: 0 };
    if (state === 'scores') return { ...d, roundsError: true, board: null };
    if (state === 'partial') return { ...d, holesError: true, coursesError: true, par: null, selectionsError: true, selections: null };
    return d;
  };
  const qList = (role: 'coach' | 'player', mode: 'all' | 'mine') => {
    const l = previewList(role, mode);
    if (state === 'empty') return { ...l, items: [] };
    if (state === 'failed') return { ...l, items: [], listError: true };
    if (state === 'partial') return { ...l, standingsError: true, items: l.items.map((i) => ({ ...i, leaders: [] })) };
    return l;
  };
  const qForm = (edit: boolean) => {
    const f = edit ? previewEditForm() : previewCreateForm();
    if (state === 'failed') return { ...f, playersError: true };
    if (state === 'noroster') return { ...f, players: [], initial: { ...f.initial, playerIds: [] } };
    if (state === 'courses') return { ...f, coursesError: true, roundCourses: [] };
    return f;
  };
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
          <CoachHome
            data={state === 'empty' ? PREVIEW_HOME_EMPTY : state === 'failed' ? PREVIEW_HOME_FAILED : state === 'noevents' ? PREVIEW_HOME_NO_EVENTS : PREVIEW_HOME}
            now={PREVIEW_HOME_NOW}
          />
        ),
    },
    'home-player': {
      path: '/golf/dashboard',
      node:
        state === 'loading' ? (
          <HomeSkeleton />
        ) : (
          <PlayerHome
            data={state === 'empty' ? PREVIEW_PLAYER_HOME_EMPTY : state === 'failed' ? PREVIEW_PLAYER_HOME_FAILED : state === 'noevents' ? PREVIEW_PLAYER_HOME_NO_EVENTS : PREVIEW_PLAYER_HOME}
            now={PREVIEW_HOME_NOW}
          />
        ),
    },
    hub: {
      path: '/golf/dashboard/team-hub',
      node: <PreviewHub data={state === 'empty' ? PREVIEW_HUB_COACH_EMPTY : state === 'failed' ? PREVIEW_HUB_COACH_FAILED : PREVIEW_HUB_COACH} state={state} tab={tab} />,
    },
    'hub-player': {
      path: '/golf/dashboard/team-hub',
      node: <PreviewHub data={state === 'empty' ? PREVIEW_HUB_PLAYER_EMPTY : state === 'failed' ? PREVIEW_HUB_PLAYER_FAILED : PREVIEW_HUB_PLAYER} state={state} tab={tab} />,
    },
    rounds: {
      path: '/golf/dashboard/rounds',
      node: (
        <PreviewRounds
          state={state}
          data={
            {
              idle: PREVIEW_ROUNDS_IDLE,
              many: PREVIEW_ROUNDS_MANY,
              empty: PREVIEW_ROUNDS_EMPTY,
              noseason: PREVIEW_ROUNDS_NO_SEASON,
              failed: PREVIEW_ROUNDS_FAILED,
              'unfinished-failed': PREVIEW_ROUNDS_UNFINISHED_FAILED,
            }[state ?? ''] ?? PREVIEW_ROUNDS
          }
        />
      ),
    },
    round: {
      path: `/golf/dashboard/rounds/${PREVIEW_REVIEW.id}`,
      node: (
        <RoundReview
          review={
            { coach: PREVIEW_REVIEW_COACH, noshots: PREVIEW_REVIEW_NO_SHOTS, noholes: PREVIEW_REVIEW_NO_HOLES, total: PREVIEW_REVIEW_TOTAL_ONLY, holebyhole: PREVIEW_REVIEW_HOLE_BY_HOLE }[state ?? ''] ?? PREVIEW_REVIEW
          }
        />
      ),
    },
    roster: {
      path: '/golf/dashboard/roster',
      node:
        state === 'loading' ? (
          <RosterSkeleton />
        ) : (
          <Roster data={state === 'empty' ? PREVIEW_ROSTER_EMPTY : state === 'failed' ? PREVIEW_ROSTER_FAILED : state === 'partial' ? PREVIEW_ROSTER_PARTIAL : PREVIEW_ROSTER} />
        ),
    },
    stats: {
      path: '/golf/dashboard/stats',
      node:
        state === 'loading' ? (
          <StatsSkeleton />
        ) : state === 'empty' ? (
          <StatsTeam data={{ ...PREVIEW_TEAM_STATS, roundCount: 0, grid: [], players: [], putting: null, bests: [] }} />
        ) : state === 'failed' ? (
          <StatsTeam data={{ ...PREVIEW_TEAM_STATS, roundsError: true }} />
        ) : state === 'partial' ? (
          <StatsTeam data={{ ...PREVIEW_TEAM_STATS, cacheError: true, puttsError: true, figures: PREVIEW_TEAM_STATS.figures.map((f) => (f.label === 'Scoring average' ? f : { ...f, value: null, delta: null })) }} />
        ) : state === 'crash' ? (
          // Malformed sections, so every SectionBoundary (CH-4204 to CH-4208) catches and reports once.
          <StatsTeam data={{ ...PREVIEW_TEAM_STATS, figures: null as never, players: null as never, legWeeks: null as never, putting: { putts: 1, bands: null as never }, bests: null as never }} />
        ) : (
          <StatsTeam data={PREVIEW_TEAM_STATS} />
        ),
    },
    player: {
      path: '/golf/dashboard/stats',
      node:
        state === 'failed' ? (
          <StatsPlayer data={{ ...PREVIEW_PLAYER, roundsError: true, statsError: true, devError: true }} coachId="preview-coach" />
        ) : (
          <StatsPlayer data={state === 'early' ? PREVIEW_PLAYER_EARLY : state === 'self' ? { ...PREVIEW_PLAYER, viewer: 'player', nav: null } : PREVIEW_PLAYER} coachId={state === 'self' ? null : 'preview-coach'} />
        ),
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
            initialNew={isNew === '1'}
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
    settings: {
      path: '/golf/dashboard/settings',
      node: state === 'loading' ? <SettingsSkeleton /> : <PreviewSettings state={state} section={section} />,
    },
    qualifiers: {
      path: '/golf/dashboard/qualifiers',
      node: state === 'loading' ? <QualifiersSkeleton /> : <QualifiersList data={qList('coach', 'all')} />,
    },
    'qualifiers-player': {
      path: '/golf/dashboard/qualifiers',
      node: <QualifiersList data={qList('player', 'all')} />,
    },
    'my-qualifiers': {
      path: '/golf/dashboard/my-qualifiers',
      node: <QualifiersList data={qList('player', 'mine')} />,
    },
    qualifier: {
      path: '/golf/dashboard/qualifiers',
      node: state === 'loading' ? <QualifierDetailSkeleton /> : <PreviewQualifierDetail data={qDetail('coach')} state={state} />,
    },
    'qualifier-player': {
      path: '/golf/dashboard/qualifiers',
      node: <PreviewQualifierDetail data={qDetail('player')} state={state} />,
    },
    'qualifier-new': {
      path: '/golf/dashboard/qualifiers',
      node: state === 'loading' ? <QualifierFormSkeleton /> : <PreviewQualifierForm data={qForm(false)} state={state} />,
    },
    'qualifier-edit': {
      path: '/golf/dashboard/qualifiers',
      node: state === 'loading' ? <QualifierFormSkeleton /> : <PreviewQualifierForm data={qForm(true)} state={state} />,
    },
    'qualifier-selection': {
      path: '/golf/dashboard/qualifiers',
      node: <PreviewQualifierSelection data={previewSelection(q === 'picking' || q === 'picked' || q === 'selected' ? q : 'standings')} state={state} />,
    },
    'messages-player': {
      path: '/golf/dashboard/messages',
      node: <PreviewMessages state={state} role="player" />,
    },
  };
  const entry = screens[screen];
  if (!entry) notFound();
  const user = screen === 'home-player' || screen === 'hub-player' ? { ...PREVIEW_PLAYER_USER, name: 'Theo Marchetti' } : screen === 'rounds' || (screen === 'round' && state !== 'coach') || screen === 'calendar-player' || screen === 'messages-player' || screen === 'qualifiers-player' || screen === 'qualifier-player' || screen === 'my-qualifiers' || (screen === 'settings' && (state === 'player' || state === 'noteam')) ? { ...PREVIEW_PLAYER_USER, name: 'Jonah Okafor' } : PREVIEW_COACH;

  return (
    <PreviewBell state={bell}>
      <ClubhouseFrame userData={user} shell={PREVIEW_SHELL} pathname={entry.path} forceRebuilt>
        {entry.node}
      </ClubhouseFrame>
    </PreviewBell>
  );
}

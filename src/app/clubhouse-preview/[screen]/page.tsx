import { notFound } from 'next/navigation';
import { ClubhouseFrame } from '@/clubhouse/shell/ClubhouseFrame';
import { CoachHome } from '@/clubhouse/screens/home/CoachHome';
import { PlayerHome } from '@/clubhouse/screens/home/PlayerHome';
import { PreviewHub } from '@/clubhouse/preview/PreviewHub';
import { PreviewRounds } from '@/clubhouse/preview/PreviewRounds';
import { PreviewTracking } from '@/clubhouse/preview/PreviewTracking';
import { PreviewSetup } from '@/clubhouse/preview/PreviewSetup';
import { RoundReview } from '@/clubhouse/screens/rounds/RoundReview';
import { PREVIEW_REVIEW, PREVIEW_REVIEW_COACH, PREVIEW_REVIEW_HOLE_BY_HOLE, PREVIEW_REVIEW_NO_HOLES, PREVIEW_REVIEW_NO_SG, PREVIEW_REVIEW_NO_SHOTS, PREVIEW_REVIEW_TOTAL_ONLY } from '@/clubhouse/preview/fixtures-round-review';
import { PREVIEW_ROUNDS, PREVIEW_ROUNDS_EMPTY, PREVIEW_ROUNDS_FAILED, PREVIEW_ROUNDS_IDLE, PREVIEW_ROUNDS_MANY, PREVIEW_ROUNDS_NO_SEASON, PREVIEW_ROUNDS_UNFINISHED_FAILED } from '@/clubhouse/preview/fixtures-rounds';
import '@/clubhouse/styles/rounds.css';
import { PreviewClasses } from '@/clubhouse/preview/PreviewClasses';
import { ClassesNoTeam } from '@/clubhouse/screens/classes/ClassesNoTeam';
import { ClassesSkeleton } from '@/clubhouse/screens/classes/ClassesSkeleton';
import { PREVIEW_CLASSES, PREVIEW_CLASSES_CLEAR, PREVIEW_CLASSES_EMPTY, PREVIEW_CLASSES_FAILED, PREVIEW_CLASSES_MIXED, PREVIEW_CLASSES_PARTIAL } from '@/clubhouse/preview/fixtures-classes';
import '@/clubhouse/styles/classes.css';
import { PREVIEW_HUB_COACH, PREVIEW_HUB_COACH_EMPTY, PREVIEW_HUB_COACH_FAILED, PREVIEW_HUB_PLAYER, PREVIEW_HUB_PLAYER_EMPTY, PREVIEW_HUB_PLAYER_FAILED } from '@/clubhouse/preview/fixtures-hub';
import { PREVIEW_PLAYER_HOME, PREVIEW_PLAYER_HOME_EMPTY, PREVIEW_PLAYER_HOME_FAILED, PREVIEW_PLAYER_HOME_NO_EVENTS } from '@/clubhouse/preview/fixtures-player-home';
import { HomeSkeleton } from '@/clubhouse/screens/home/HomeSkeleton';
import { PreviewError } from '@/clubhouse/preview/PreviewError';
import { Roster } from '@/clubhouse/screens/roster/Roster';
import { RosterNoTeam } from '@/clubhouse/screens/roster/RosterNoTeam';
import { TeamRoster } from '@/clubhouse/screens/roster/TeamRoster';
import { RosterSkeleton } from '@/clubhouse/screens/roster/RosterSkeleton';
import { PREVIEW_PLAYER_ROSTER, PREVIEW_PLAYER_ROSTER_EMPTY, PREVIEW_PLAYER_ROSTER_FAILED, PREVIEW_ROSTER, PREVIEW_ROSTER_EMPTY, PREVIEW_ROSTER_FAILED, PREVIEW_ROSTER_PARTIAL } from '@/clubhouse/preview/fixtures-roster';
import { StatsTeam } from '@/clubhouse/screens/stats/StatsTeam';
import { StatsPlayer } from '@/clubhouse/screens/stats/StatsPlayer';
import { StatsSkeleton } from '@/clubhouse/screens/stats/StatsSkeleton';
import {
  PREVIEW_PLAYER,
  PREVIEW_PLAYER_EARLY,
  PREVIEW_PLAYER_FILTERED,
  PREVIEW_PLAYER_NINES,
  PREVIEW_PLAYER_NOMATCH,
  PREVIEW_TEAM_EARLY_FILTER,
  PREVIEW_TEAM_FILTERED,
  PREVIEW_TEAM_NINES,
  PREVIEW_TEAM_NOMATCH,
  PREVIEW_TEAM_STATS,
} from '@/clubhouse/preview/fixtures-stats';
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
  PREVIEW_CALENDAR_FIRST,
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
import { PreviewCoachHelm } from '@/clubhouse/preview/PreviewCoachHelm';
import { PreviewRecruiting } from '@/clubhouse/preview/PreviewRecruiting';
import { RecruitingNoTeam } from '@/clubhouse/screens/recruiting/RecruitingNoTeam';
import { RecruitingSkeleton } from '@/clubhouse/screens/recruiting/RecruitingSkeleton';
import { PREVIEW_RECRUITING, PREVIEW_RECRUITING_EMPTY, PREVIEW_RECRUITING_FAILED } from '@/clubhouse/preview/fixtures-recruiting';
import '@/clubhouse/styles/recruiting.css';
import { CoachHelmSkeleton } from '@/clubhouse/screens/coachhelm/CoachHelmSkeleton';
import {
  PREVIEW_HELM_COACH,
  PREVIEW_HELM_COACH_ASSIGNED,
  PREVIEW_HELM_COACH_EMPTY,
  PREVIEW_HELM_COACH_FAILED,
  PREVIEW_HELM_COACH_NO_ROSTER,
  PREVIEW_HELM_COACH_OFF,
  PREVIEW_HELM_COACH_PULSE_FAILED,
  PREVIEW_HELM_COACH_QUIET,
  PREVIEW_HELM_PLAYER,
  PREVIEW_HELM_PLAYER_EMPTY,
  PREVIEW_HELM_PLAYER_FAILED,
  PREVIEW_HELM_PLAYER_NO_ROUNDS,
  PREVIEW_HELM_PLAYER_OFF,
  PREVIEW_HELM_PLAYER_PROPOSALS_FAILED,
  PREVIEW_HELM_PLAYER_PROPOSED,
  PREVIEW_HELM_PLAYER_WORKING,
} from '@/clubhouse/preview/fixtures-coachhelm';
import { PreviewCoachHelmPlayer } from '@/clubhouse/preview/PreviewCoachHelmPlayer';
import { PreviewAsk } from '@/clubhouse/preview/PreviewAsk';
import { PreviewCoachHelmViews } from '@/clubhouse/preview/PreviewCoachHelmViews';
import '@/clubhouse/styles/coachhelm.css';
import '@/clubhouse/styles/coachhelm-ask.css';
import '@/clubhouse/styles/coachhelm-views.css';
import '@/clubhouse/styles/coachhelm-profile.css';
import '@/clubhouse/styles/coachhelm-standing.css';
import '@/clubhouse/styles/coachhelm-dive.css';

/**
 * Dev-only Clubhouse preview: every screen and state rendered from the
 * handoff's sample data, with no auth and no database, for comparison with
 * design/handoff/screenshots. 404 in production.
 *
 *   /clubhouse-preview/home   ?state=empty | noevents | failed | loading | error   (empty is the first-run page)
 *   /clubhouse-preview/home-player ?state=empty | noevents | failed | loading   (Theo; empty is the first-run page)
 *   /clubhouse-preview/hub, hub-player ?state=empty | failed | failwrites, &tab=home | ann | travel | docs | tasks
 *   /clubhouse-preview/rounds ?state=idle | many | empty | noseason | failed | unfinished-failed | failwrites   (Jonah)
 *   /clubhouse-preview/round ?state=coach | noshots | noholes | total | holebyhole | nosg   (a round's review)
 *   /clubhouse-preview/classes ?state=clear | empty | failed | partial | mixed | noteam | loading | failwrites | failsync | read-notschedule | read-fault | read-none | read-warn   (Jonah)
 *   /clubhouse-preview/setup ?state=failcourses | failtees | failholes | failstart | noqualifiers | qualifiersfailed   (new round)
 *   /clubhouse-preview/track ?state=approach | putt | holed | checkpointfail | last | meters | exit | card | summary | submitting | posted | submitfail   (the shot screen)
 *   /clubhouse-preview/roster ?state=empty | failed | partial | loading
 *   /clubhouse-preview/roster-player ?state=empty | failed | noteam | loading   (the player's read-only roster; Theo)
 *   /clubhouse-preview/stats  ?state=empty | failed | partial | crash | loading | filtered | nomatch | earlyfilter | nines   (the round filter: a filter on, none matching, two rounds, nine-hole rounds in)
 *   /clubhouse-preview/player ?state=failed | early | self | filtered | nomatch | nines
 *   /clubhouse-preview/calendar ?state=empty | firstrun | failed | partial | loading, &view=, &date=, &event=
 *   /clubhouse-preview/calendar-player
 *   /clubhouse-preview/messages ?state=empty | rail | failed | thread-failed | loading | loading-route | files-failed | add-failed
 *   /clubhouse-preview/settings ?state=player | noteam | failed | partial | assistant | failwrites | loading, &section=
 *   /clubhouse-preview/qualifiers ?state=empty | failed | partial | loading  (and qualifiers-player, my-qualifiers ?state=empty)
 *   /clubhouse-preview/qualifier ?q=live | upcoming | selected | completed | spring, &state=failed | scores | partial | failwrites | loading
 *   /clubhouse-preview/qualifier-player ?q=…   /clubhouse-preview/qualifier-new, qualifier-edit ?state=failed | noroster | courses | failwrites | loading
 *   /clubhouse-preview/qualifier-selection ?q=standings | picking | picked | selected, &state=failwrites
 *   /clubhouse-preview/coachhelm ?state=assigned | empty | noroster | failed | pulsefailed | quiet | off | loading | failwrites | failundo | duplicate   (the coach; Maya)
 *   /clubhouse-preview/coachhelm-player ?state=empty | norounds | working | failed | off | loading | proposed | failproposal | proposalsfailed   (Jonah)
 *   /clubhouse-preview/coachhelm-ask ?state=… &q=…   (the Ask sub-tab; states in src/clubhouse/preview/PreviewAsk.tsx)
 *   /clubhouse-preview/coachhelm-views ?view=profile ?state=partial | empty | edge | failed | off | loading   (the player's Game profile; Jonah)
 *   /clubhouse-preview/coachhelm-views ?view=standing ?state=early | empty | womens | nobaseline | failed | off | loading   (the player's Standing)
 *   /clubhouse-preview/coachhelm-views ?view=deep-dive ?state=young | partsfailed | empty | norounds | failed | off | loading, &q=in-slope | in-pen | in-brk | in-dbl   (the player's Deep dive; q is the read it opens on)
 *   /clubhouse-preview/recruiting ?state=empty | nomatch | failed | loading | sparse | noteam | detail | add | edit | delete | docsfailed | failwrites | failstage | slow   (the coach; eight prospects, Mason Reilly first)
 *   any screen &bell=empty | failed | slow   (the top-bar notifications feed)
 *   any coach screen &teams=2   (a head coach on two teams: the team switcher; picking one fails here, there is no session)
 */
export default async function ClubhousePreview({
  params,
  searchParams,
}: {
  params: Promise<{ screen: string }>;
  searchParams: Promise<{ state?: string; view?: string; date?: string; event?: string; bell?: string; new?: string; section?: string; q?: string; tab?: string; teams?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { screen } = await params;
  const { state, view, date, event, bell, new: isNew, section, q, tab, teams } = await searchParams;
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
    setup: {
      path: '/golf/dashboard/rounds/new',
      node: <PreviewSetup key={state ?? ''} state={state} />,
    },
    track: {
      path: '/golf/dashboard/rounds/new',
      node: <PreviewTracking key={state ?? ''} state={state} />,
    },
    classes: {
      path: '/golf/dashboard/classes',
      node:
        state === 'loading' ? (
          <ClassesSkeleton />
        ) : state === 'noteam' ? (
          <ClassesNoTeam />
        ) : (
          <PreviewClasses
            state={state}
            data={{ clear: PREVIEW_CLASSES_CLEAR, empty: PREVIEW_CLASSES_EMPTY, failed: PREVIEW_CLASSES_FAILED, partial: PREVIEW_CLASSES_PARTIAL, mixed: PREVIEW_CLASSES_MIXED }[state ?? ''] ?? PREVIEW_CLASSES}
          />
        ),
    },
    round: {
      path: `/golf/dashboard/rounds/${PREVIEW_REVIEW.id}`,
      node: (
        <RoundReview
          review={
            { coach: PREVIEW_REVIEW_COACH, noshots: PREVIEW_REVIEW_NO_SHOTS, noholes: PREVIEW_REVIEW_NO_HOLES, total: PREVIEW_REVIEW_TOTAL_ONLY, holebyhole: PREVIEW_REVIEW_HOLE_BY_HOLE, nosg: PREVIEW_REVIEW_NO_SG }[state ?? ''] ?? PREVIEW_REVIEW
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
    'roster-player': {
      path: '/golf/dashboard/roster',
      node:
        state === 'loading' ? (
          <RosterSkeleton />
        ) : state === 'noteam' ? (
          <RosterNoTeam viewer="player" />
        ) : (
          <TeamRoster data={state === 'empty' ? PREVIEW_PLAYER_ROSTER_EMPTY : state === 'failed' ? PREVIEW_PLAYER_ROSTER_FAILED : PREVIEW_PLAYER_ROSTER} />
        ),
    },
    stats: {
      path: '/golf/dashboard/stats',
      node:
        state === 'loading' ? (
          <StatsSkeleton />
        ) : state === 'empty' ? (
          <StatsTeam data={{ ...PREVIEW_TEAM_STATS, roundCount: 0, grid: [], players: [], putting: null, bests: [], filterOptions: { ...PREVIEW_TEAM_STATS.filterOptions, rounds: [], total: 0, courses: [] } }} />
        ) : state === 'failed' ? (
          <StatsTeam data={{ ...PREVIEW_TEAM_STATS, roundsError: true }} />
        ) : state === 'partial' ? (
          <StatsTeam data={{ ...PREVIEW_TEAM_STATS, cacheError: true, puttsError: true, figures: PREVIEW_TEAM_STATS.figures.map((f) => (f.label === 'Scoring average' ? f : { ...f, value: null, delta: null })) }} />
        ) : state === 'filtered' ? (
          <StatsTeam data={PREVIEW_TEAM_FILTERED} />
        ) : state === 'nomatch' ? (
          <StatsTeam data={PREVIEW_TEAM_NOMATCH} />
        ) : state === 'earlyfilter' ? (
          <StatsTeam data={PREVIEW_TEAM_EARLY_FILTER} />
        ) : state === 'nines' ? (
          <StatsTeam data={PREVIEW_TEAM_NINES} />
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
        ) : state === 'filtered' ? (
          <StatsPlayer data={PREVIEW_PLAYER_FILTERED} coachId="preview-coach" />
        ) : state === 'nomatch' ? (
          <StatsPlayer data={PREVIEW_PLAYER_NOMATCH} coachId="preview-coach" />
        ) : state === 'nines' ? (
          <StatsPlayer data={PREVIEW_PLAYER_NINES} coachId="preview-coach" />
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
              ...(state === 'empty' ? PREVIEW_CALENDAR_EMPTY : state === 'firstrun' ? PREVIEW_CALENDAR_FIRST : state === 'failed' ? PREVIEW_CALENDAR_FAILED : state === 'partial' ? PREVIEW_CALENDAR_PARTIAL : PREVIEW_CALENDAR),
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
      // eslint-disable-next-line jsx-a11y/aria-role -- role is a component prop, not an ARIA role
      node: <PreviewMessages state={state} role="player" />,
    },
    coachhelm: {
      path: '/golf/dashboard/coachhelm',
      node:
        state === 'loading' ? (
          <CoachHelmSkeleton view="coach" />
        ) : (
          <PreviewCoachHelm
            state={state}
            data={{ assigned: PREVIEW_HELM_COACH_ASSIGNED, empty: PREVIEW_HELM_COACH_EMPTY, noroster: PREVIEW_HELM_COACH_NO_ROSTER, failed: PREVIEW_HELM_COACH_FAILED, pulsefailed: PREVIEW_HELM_COACH_PULSE_FAILED, quiet: PREVIEW_HELM_COACH_QUIET, off: PREVIEW_HELM_COACH_OFF }[state ?? ''] ?? PREVIEW_HELM_COACH}
          />
        ),
    },
    recruiting: {
      path: '/golf/dashboard/recruiting',
      node:
        state === 'loading' ? (
          <RecruitingSkeleton />
        ) : state === 'noteam' ? (
          <RecruitingNoTeam />
        ) : (
          <PreviewRecruiting
            state={state}
            data={state === 'empty' ? PREVIEW_RECRUITING_EMPTY : state === 'failed' ? PREVIEW_RECRUITING_FAILED : PREVIEW_RECRUITING}
            initial={
              {
                nomatch: { query: 'Tampa', stage: 'offered' as const, openId: 'p-owen' },
                sparse: { openId: 'p-owen', detail: true },
                detail: { openId: 'p-mason', detail: true },
                add: { form: 'add' as const },
                edit: { openId: 'p-mason', detail: true, form: 'edit' as const },
                delete: { openId: 'p-mason', detail: true, asking: true },
              }[state ?? ''] ?? {}
            }
          />
        ),
    },
    'coachhelm-player': {
      path: '/golf/dashboard/coachhelm',
      node:
        state === 'loading' ? (
          <CoachHelmSkeleton view="player" />
        ) : (
          <PreviewCoachHelmPlayer
            state={state}
            data={{ empty: PREVIEW_HELM_PLAYER_EMPTY, norounds: PREVIEW_HELM_PLAYER_NO_ROUNDS, working: PREVIEW_HELM_PLAYER_WORKING, failed: PREVIEW_HELM_PLAYER_FAILED, off: PREVIEW_HELM_PLAYER_OFF, proposed: PREVIEW_HELM_PLAYER_PROPOSED, failproposal: PREVIEW_HELM_PLAYER_PROPOSED, proposalsfailed: PREVIEW_HELM_PLAYER_PROPOSALS_FAILED }[state ?? ''] ?? PREVIEW_HELM_PLAYER}
          />
        ),
    },
    'coachhelm-ask': {
      path: '/golf/dashboard/coachhelm',
      node: <PreviewAsk state={state} kind={q} />,
    },
    'coachhelm-views': {
      path: '/golf/dashboard/coachhelm',
      node: <PreviewCoachHelmViews view={view} state={state} insight={q} />,
    },
  };
  const entry = screens[screen];
  if (!entry) notFound();
  const viewer = screen === 'home-player' || screen === 'hub-player' || screen === 'roster-player' ? { ...PREVIEW_PLAYER_USER, name: 'Theo Marchetti' } : screen === 'rounds' || screen === 'classes' || screen === 'track' || screen === 'setup' || (screen === 'round' && state !== 'coach') || screen === 'calendar-player' || screen === 'messages-player' || screen === 'qualifiers-player' || screen === 'qualifier-player' || screen === 'my-qualifiers' || (screen === 'settings' && (state === 'player' || state === 'noteam')) ? { ...PREVIEW_PLAYER_USER, name: 'Jonah Okafor' } : PREVIEW_COACH;
  const user = teams === '2' && viewer.role === 'coach' ? { ...viewer, coachTeams: [{ id: 'preview-team', name: 'Varsity', gender: 'mens' }, { id: 'preview-team-w', name: 'Varsity Women', gender: 'womens' }], canSwitchTeams: true } : viewer;

  return (
    <PreviewBell state={bell}>
      <ClubhouseFrame userData={screen === 'coachhelm-player' || screen === 'coachhelm-views' ? { ...PREVIEW_PLAYER_USER, name: 'Jonah Okafor' } : user} shell={PREVIEW_SHELL} pathname={entry.path} forceRebuilt>
        {entry.node}
      </ClubhouseFrame>
    </PreviewBell>
  );
}

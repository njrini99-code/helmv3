/**
 * Preview fixtures: the handoff's own sample data (design/handoff/*.html),
 * shaped as the real loaders' output. Used only by /clubhouse-preview, which
 * returns 404 in production. Never imported by app routes.
 */
import type { GolfUserData } from '@/contexts/golf-user-context';
import type { ChCoachHome, ChCoachQueue, ChHoleScore, ChTeamLegs } from '../data/home';
import type { ChShellData } from '../data/shell';
import { homeSubline } from '../screens/home/model';

export const PREVIEW_COACH: GolfUserData = {
  role: 'coach',
  userId: 'preview-coach',
  name: 'Maya Reyes',
  teamName: 'Varsity',
  coachId: 'preview-coach',
  teamId: 'preview-team',
};

export const PREVIEW_PLAYER: GolfUserData = {
  role: 'player',
  userId: 'preview-player',
  name: 'Theo Marchetti',
  teamName: 'Varsity',
  playerId: 'theo',
  teamId: 'preview-team',
};

export const PREVIEW_SHELL: ChShellData = {
  nextEvent: { id: 'e-pinehurst', title: 'Pinehurst qualifier', whenLabel: 'In 2 days', metaLabel: 'Fri, Oct 16 · 8:42 AM · Pinehurst No. 2', ready: { accepted: 5, invited: 6 } },
  pendingJoinRequests: 2,
  timezone: 'America/New_York',
  askAvailable: true,
  // Maya is the head coach (the boards' "Head coach · Varsity"); a player's line ignores it.
  viewerIsHeadCoach: true,
};

/** A round on the course (P001-C1): the preview's &round=1. */
export const PREVIEW_ROUND_IN_PROGRESS = { id: '6f1c2a8e-4b5d-4c3e-9f7a-1b2c3d4e5f60', course: 'Oakmont CC', hole: 7 };

const PARS = [4, 4, 3, 4, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const holes = (off: number[]): ChHoleScore[] => PARS.map((par, i) => ({ n: i + 1, par, score: par + (off[i] ?? 0) }));
const total = (h: ChHoleScore[]) => h.reduce((a, x) => a + (x.score ?? 0), 0);

const r1 = holes([0, 1, 0, 1, 0, -1, 0, 0, 0, -1, 0, 0, -1, 0, 1, 0, 0, -1]);
const r2 = holes([0, 0, 0, -1, 1, 0, 0, 0, 0, 0, 1, 0, -1, 0, 0, 0, 0, -1]);
const r3 = holes([1, 0, 0, 1, 0, 0, 2, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, -1]);

const LEADERS: ChCoachHome['leaderboard']['rows'] = [
  { playerId: 'theo', name: 'Theo Marchetti', classYear: 'Senior', rounds: 11, avg: 70.9, toPar: -1.1, trend: [72, 71, 71, 70, 70, 71, 70], sgPerRound: 1.8, status: 'steady', quietDays: 2 },
  { playerId: 'sofia', name: 'Sofia Alvarez', classYear: 'Senior', rounds: 10, avg: 71.6, toPar: -0.4, trend: [72, 72, 71, 72, 71, 71, 71], sgPerRound: 1.1, status: 'steady', quietDays: 2 },
  { playerId: 'ava', name: 'Ava Lindqvist', classYear: 'Junior', rounds: 10, avg: 72.4, toPar: 0.4, trend: [73, 74, 72, 72, 72, 73, 72], sgPerRound: 0.6, status: 'steady', quietDays: 2 },
  { playerId: 'jonah', name: 'Jonah Okafor', classYear: 'Sophomore', rounds: 9, avg: 74.1, toPar: 2.1, trend: [72, 72, 73, 74, 75, 74, 75], sgPerRound: -0.9, status: 'steady', quietDays: 3 },
  { playerId: 'eli', name: 'Eli Brandt', classYear: 'Junior', rounds: 8, avg: 74.8, toPar: 2.8, trend: [74, 75, 74, 75, 75, 74, 75], sgPerRound: -0.4, status: 'steady', quietDays: 9 },
  { playerId: 'priya', name: 'Priya Natarajan', classYear: 'Freshman', rounds: 2, avg: 75.2, toPar: 3.2, trend: [76, 75], sgPerRound: null, status: 'early', quietDays: 4 },
];

const NEXT_INVITEES = ['Theo Marchetti', 'Sofia Alvarez', 'Ava Lindqvist', 'Jonah Okafor', 'Eli Brandt', 'Priya Natarajan'];

/** What is waiting on the coach (spec B §2): a join request, three replies across two events, two overdue tasks, one post. */
export const PREVIEW_QUEUE: ChCoachQueue = {
  joinRequests: 1,
  replies: { missing: 3, events: [{ id: 'a1', date: '2026-10-14', missing: 1 }, { id: 'a5', date: '2026-10-16', missing: 2 }] },
  overdueTasks: 2,
  unackedPosts: 1,
};

const who = (ids: string[], names: string[], value: number) => ({ ids, names, value });

/** The team's four parts (spec B §1) on the form's thirty rounds: the greens and putts are the form's own. */
export const PREVIEW_LEGS: ChTeamLegs = {
  holeRounds: 30,
  ranked: true,
  tour: 'pga',
  cacheError: false,
  tourError: false,
  rows: [
    { key: 'tee', label: 'Off the tee', stat: { label: 'Fairways', value: 61, unit: '%', digits: 0, tour: 66 }, sg: 0.4, delta: 0.5, se: 0.3, gains: who(['theo'], ['Theo M.'], 1.1), loses: who(['eli'], ['Eli B.'], -0.8) },
    { key: 'approach', label: 'Approach', stat: { label: 'Greens', value: 61, unit: '%', digits: 0, tour: 67 }, sg: -0.9, delta: -0.1, se: 0.4, gains: who(['sofia'], ['Sofia A.'], 0.3), loses: who(['jonah'], ['Jonah O.'], -1.6) },
    { key: 'around', label: 'Around green', stat: { label: 'Up and down', value: 52, unit: '%', digits: 0, tour: 59 }, sg: -0.2, delta: -0.6, se: 0.3, gains: who(['ava', 'sofia'], ['Ava L.', 'Sofia A.'], 0.5), loses: who(['jonah'], ['Jonah O.'], -1.0) },
    { key: 'putting', label: 'Putting', stat: { label: 'Putts', value: 30.4, unit: '', digits: 1, tour: 29.0 }, sg: -0.5, delta: 0.1, se: 0.4, gains: who(['theo'], ['Theo M.'], 0.6), loses: who(['eli', 'jonah', 'ava'], ['Eli B.', 'Jonah O.', 'Ava L.'], -1.2) },
  ],
};

export const PREVIEW_HOME: ChCoachHome = {
  greeting: 'Good morning, Maya',
  teamChatId: 'c-team',
  subline: homeSubline(LEADERS, { roundsError: false, nextCompetition: { title: 'Qualifier · Pinehurst No. 2', when: 'Friday' } }),
  todayLabel: 'Wednesday 14 October',
  week: {
    error: false,
    days: [
      // The week of Wednesday 14 October 2026: every weekday is its date's own.
      ['Mon', 12, 2, false],
      ['Tue', 13, 2, false],
      ['Wed', 14, 4, false],
      ['Thu', 15, 2, false],
      ['Fri', 16, 1, true],
      ['Sat', 17, 1, false],
      ['Sun', 18, 0, false],
    ].map(([weekday, dayOfMonth, eventCount, hasCompetition]) => ({
      date: `2026-10-${dayOfMonth}`,
      weekday: weekday as string,
      dayOfMonth: dayOfMonth as number,
      isToday: dayOfMonth === 14,
      eventCount: eventCount as number,
      hasCompetition: hasCompetition as boolean,
      // Friday's competition is the Pinehurst qualifier.
      competitionType: hasCompetition ? ('qualifier' as const) : null,
    })),
    agenda: [
      { id: 'a1', timeLabel: '3:30', title: 'Short-game block', detail: 'Practice green · 6 players', isNext: true, isCompetition: false, when: 'today' },
      { id: 'a2', timeLabel: '4:45', title: '1:1 with Jonah', detail: 'Range bay 4', isNext: false, isCompetition: false, when: 'today' },
      { id: 'a3', timeLabel: '5:30', title: 'Putting ladder', detail: 'Green 2 · Priya, Ava', isNext: false, isCompetition: false, when: 'today' },
      { id: 'a4', timeLabel: '6:00', title: 'Parent call', detail: 'Natarajan family', isNext: false, isCompetition: false, when: 'today' },
      { id: 'a5', timeLabel: 'Fri', title: 'Qualifier · Pinehurst No. 2', detail: 'First tee 8:42 · 5 of 6 going', isNext: false, isCompetition: true, when: 'later' },
    ],
  },
  latestRounds: {
    error: false,
    holesError: false,
    rounds: [
      { id: 'r1', playerId: 'theo', playerName: 'Theo Marchetti', meta: 'Oakmont CC · Mon 12 Oct · Member tees', score: total(r1), toPar: total(r1) - 72, holes: r1, gir: '14/18', putts: 28, sg: 2.4 },
      { id: 'r2', playerId: 'sofia', playerName: 'Sofia Alvarez', meta: 'Oakmont CC · Mon 12 Oct · Member tees', score: total(r2), toPar: total(r2) - 72, holes: r2, gir: '12/18', putts: 30, sg: 1.2 },
      { id: 'r3', playerId: 'jonah', playerName: 'Jonah Okafor', meta: 'Pine Needles · Sun 11 Oct · Back tees', score: total(r3), toPar: total(r3) - 72, holes: null, gir: '8/18', putts: 31, sg: -1.6 },
    ],
  },
  leaderboard: {
    error: false,
    scorecards: 58,
    rosterSize: 6,
    rows: LEADERS,
  },
  phone: {
    next: {
      id: 'a1',
      title: 'Short-game block',
      type: 'practice',
      date: '2026-10-14',
      startIso: '2026-10-14T19:30:00Z',
      endIso: '2026-10-14T21:00:00Z',
      allDay: false,
      startLabel: '3:30 PM',
      rangeLabel: '3:30 – 5:00 PM',
      location: 'Practice green',
      invitees: NEXT_INVITEES,
      going: 5,
      awaiting: [{ id: 'eli', name: 'Eli Brandt' }],
      inviteeIds: ['theo', 'sofia', 'ava', 'jonah', 'eli', 'priya'],
      conflict: false,
      replyOpen: true,
    },
    today: [
      ['a1', 'Short-game block', 'practice', '19:30', '21:00', 'Practice green', '3:30 PM', '3:30 – 5:00 PM', false],
      ['a2', '1:1 with Jonah', 'meeting', '20:45', '21:15', 'Range bay 4', '4:45 PM', '4:45 – 5:15 PM', true],
      ['a3', 'Putting ladder', 'practice', '21:30', '22:30', 'Green 2', '5:30 PM', '5:30 – 6:30 PM', false],
      ['a4', 'Parent call', 'meeting', '22:00', '22:30', null, '6:00 PM', '6:00 – 6:30 PM', true],
    ].map(([id, title, type, start, end, location, startLabel, rangeLabel, conflict]) => ({
      id: id as string,
      title: title as string,
      type: type as 'practice' | 'meeting',
      date: '2026-10-14',
      startIso: `2026-10-14T${start}:00Z`,
      endIso: `2026-10-14T${end}:00Z`,
      allDay: false,
      startLabel: startLabel as string,
      rangeLabel: rangeLabel as string,
      location: location as string | null,
      invitees: null,
      going: null,
      conflict: conflict as boolean,
      // The Next row (Short-game block) asks for replies and Eli hasn't given one: the desktop agenda's reply line and Nudge.
      ...(id === 'a1' ? { invitees: NEXT_INVITEES, going: 5, awaiting: [{ id: 'eli', name: 'Eli Brandt' }], inviteeIds: ['theo', 'sofia', 'ava', 'jonah', 'eli', 'priya'], replyOpen: true } : {}),
    })),
    form: {
      avg: 73.4,
      delta: -0.9,
      deltaSe: 1.0,
      line: [74.6, 74.4, 74.5, 74.1, 74.0, 73.9, 74.0, 73.7, 73.6, 73.5, 73.6, 73.4],
      roundsThisWeek: 11,
      basis: { rounds: 30, from: '2026-09-02', to: '2026-10-13', girRounds: 30, puttsRounds: 30 },
      gir: { pct: 61, delta: 3, se: 3.9 },
      putts: { avg: 30.4, delta: 0.3, se: 0.6 },
    },
    weekNote: { weekday: 'Friday', title: 'Qualifier · Pinehurst No. 2' },
  },
  legs: PREVIEW_LEGS,
  queue: PREVIEW_QUEUE,
};

/** The preview's frozen clock: Wednesday 14 October, 2:40 PM Eastern, as the phone boards draw it. */
export const PREVIEW_HOME_NOW = '2026-10-14T18:40:00Z';

/** Failure and empty variants, so every state can be seen without breaking anything. */
export const PREVIEW_HOME_FAILED: ChCoachHome = {
  ...PREVIEW_HOME,
  subline: null,
  week: { ...PREVIEW_HOME.week, error: true },
  latestRounds: { rounds: [], error: true, holesError: false },
  leaderboard: { ...PREVIEW_HOME.leaderboard, error: true },
  phone: { next: null, today: [], form: null, weekNote: null },
};

export const PREVIEW_HOME_EMPTY: ChCoachHome = {
  ...PREVIEW_HOME,
  subline: null,
  // A new team: the first players asking to join are what waits (the row shows on the first run too).
  queue: { joinRequests: 2, replies: { missing: 0, events: [] }, overdueTasks: 0, unackedPosts: 0 },
  legs: null,
  week: { ...PREVIEW_HOME.week, agenda: [], days: PREVIEW_HOME.week.days.map((d) => ({ ...d, eventCount: 0, hasCompetition: false })) },
  latestRounds: { rounds: [], error: false, holesError: false },
  leaderboard: { rows: [], scorecards: 0, rosterSize: 0, error: false },
  phone: { next: null, today: [], form: null, weekNote: null },
};

/** A new team with its first events but nobody on the roster: still the first run, the week above Invite players. */
export const PREVIEW_HOME_EVENTS_ONLY: ChCoachHome = {
  ...PREVIEW_HOME_EMPTY,
  week: PREVIEW_HOME.week,
  phone: { ...PREVIEW_HOME.phone, form: null },
};

/** Players and events, but no round posted yet: the leaderboard's line says so, and the latest round steps aside. */
export const PREVIEW_HOME_NO_ROUNDS: ChCoachHome = {
  ...PREVIEW_HOME,
  subline: null,
  latestRounds: { rounds: [], error: false, holesError: false },
  leaderboard: { rows: [], scorecards: 0, rosterSize: 7, error: false },
  phone: { ...PREVIEW_HOME.phone, form: null },
};

/** Players and rounds, but nothing on the calendar ahead: the phone's Up next shows how to add the first event. */
export const PREVIEW_HOME_NO_EVENTS: ChCoachHome = {
  ...PREVIEW_HOME,
  week: { ...PREVIEW_HOME.week, agenda: [], days: PREVIEW_HOME.week.days.map((d) => ({ ...d, eventCount: 0, hasCompetition: false })) },
  phone: { ...PREVIEW_HOME.phone, next: null, today: [], weekNote: null },
};

/** The four parts with up-and-down missing (CH-2218): its "—" and one notice, strokes gained intact. */
export const PREVIEW_HOME_LEGS_CACHE_FAILED: ChCoachHome = {
  ...PREVIEW_HOME,
  legs: { ...PREVIEW_LEGS, cacheError: true, rows: PREVIEW_LEGS.rows.map((r) => (r.key === 'around' ? { ...r, stat: { ...r.stat, value: null } } : r)) },
};

/** The Tour's marks missing (CH-2219): each stat without its mark, and one notice. */
export const PREVIEW_HOME_LEGS_TOUR_FAILED: ChCoachHome = {
  ...PREVIEW_HOME,
  legs: { ...PREVIEW_LEGS, tourError: true, rows: PREVIEW_LEGS.rows.map((r) => ({ ...r, stat: { ...r.stat, tour: null } })) },
};

/** A part of "Waiting on you" didn't load (CH-2220): the rest still counts, and the row says some didn't load. */
export const PREVIEW_HOME_QUEUE_FAILED: ChCoachHome = { ...PREVIEW_HOME, queue: { ...PREVIEW_QUEUE, unackedPosts: null } };

/** No round in the last ten with hole scores (CH-2314). */
export const PREVIEW_HOME_LEGS_NO_HOLES: ChCoachHome = { ...PREVIEW_HOME, legs: { ...PREVIEW_LEGS, holeRounds: 0 } };

/** Rounds with holes but nobody with enough of them to rank (CH-2315). */
export const PREVIEW_HOME_LEGS_UNRANKED: ChCoachHome = {
  ...PREVIEW_HOME,
  legs: { ...PREVIEW_LEGS, ranked: false, rows: PREVIEW_LEGS.rows.map((r) => ({ ...r, sg: null, delta: null, se: null, gains: null, loses: null })) },
};

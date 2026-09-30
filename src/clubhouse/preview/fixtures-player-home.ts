import type { ChHoleScore } from '../data/home';
import type { ChPlayerHome, ChPlayerLeg } from '../data/player-home';
import { PREVIEW_HOME } from './fixtures';

/**
 * Player Home sample data: Theo, as design/handoff/Player - Home.html draws
 * him (the week of Tuesday 14 October, a qualifier on Thursday). The week is
 * the coach preview's, without who else is invited.
 */

const PAR = [4, 4, 3, 4, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const card = (diffs: number[]): ChHoleScore[] => PAR.map((par, i) => ({ n: i + 1, par, score: par + (diffs[i] ?? 0) }));
const total = (h: ChHoleScore[]) => h.reduce((a, x) => a + (x.score ?? 0), 0);
const oak = card([0, -1, 0, 0, 1, 0, -1, 0, 0, 0, -1, 0, -1, 0, 1, 0, 0, 0]);
const pine = card([0, -1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 0, -1, 0, 0, 0, 0, 0]);

const SCORES: Array<[string, number]> = [
  ['Aug 2', 73], ['Aug 5', 72], ['Aug 9', 72], ['Aug 12', 71], ['Aug 16', 73], ['Aug 19', 72], ['Aug 23', 71], ['Aug 26', 72], ['Aug 30', 71], ['Sep 6', 73],
  ['Sep 9', 71], ['Sep 13', 70], ['Sep 20', 70], ['Sep 23', 71], ['Sep 29', 70], ['Oct 4', 71], ['Oct 8', 70], ['Oct 11', 69], ['Oct 11', 70], ['Oct 12', total(oak)],
];

const leg = (key: ChPlayerLeg['key'], label: string, stat: string, value: number, unit: '%' | '', digits: number, lowerIsBetter: boolean, sg: number, d1: number | null, trend: number[], note: string): ChPlayerLeg => ({
  key,
  label,
  stat,
  value,
  unit,
  digits,
  lowerIsBetter,
  sg,
  d1,
  trend,
  note,
});

const { invitees: _i, going: _g, ...nextEvent } = PREVIEW_HOME.phone.next!;
void _i;
void _g;

export const PREVIEW_PLAYER_HOME: ChPlayerHome = {
  greeting: 'Good afternoon, Theo.',
  todayLabel: 'Tuesday, 14 October',
  brief: 'Your last three rounds average 69.7. Off the tee is gaining you 0.8 strokes a round.',
  coachUserId: 'coach-maya',
  week: {
    ...PREVIEW_HOME.week,
    agenda: [
      { id: 'a1', timeLabel: '3:30', title: 'Short-game block', detail: 'Practice green', isNext: true, isCompetition: false, when: 'today' },
      { id: 'a3', timeLabel: '5:30', title: 'Team dinner', detail: 'Carolina Inn', isNext: false, isCompetition: false, when: 'today' },
      { id: 'a5', timeLabel: 'Thu', title: 'Qualifier · Pinehurst No. 2', detail: 'First tee 8:42', isNext: false, isCompetition: true, when: 'later' },
    ],
  },
  next: {
    ...nextEvent,
    id: 'q1',
    title: 'Pinehurst No. 2',
    type: 'qualifier',
    date: '2026-10-16',
    startIso: '2026-10-16T12:42:00Z',
    endIso: null,
    startLabel: '8:42 AM',
    rangeLabel: '8:42 AM',
    location: 'Your tee time · Bus leaves 6:15',
    invitees: null,
    going: null,
  },
  today: PREVIEW_HOME.phone.today.filter((e) => e.id === 'a1' || e.id === 'a3').map((e) => (e.id === 'a3' ? { ...e, title: 'Team dinner', type: 'other' as const, location: 'Carolina Inn' } : e)),
  weekNote: PREVIEW_HOME.phone.weekNote,
  latest: {
    error: false,
    holesError: false,
    rounds: [
      { id: 'p1', playerId: 'theo', playerName: 'Theo', meta: 'Oakmont CC · Sun 12 Oct · Member tees', score: total(oak), toPar: total(oak) - 72, holes: oak, gir: '14/18', putts: 28, sg: 2.4 },
      { id: 'p2', playerId: 'theo', playerName: 'Theo', meta: 'Pine Needles · Sat 11 Oct · Back tees', score: total(pine), toPar: total(pine) - 72, holes: pine, gir: '13/18', putts: 27, sg: 3.1 },
      { id: 'p3', playerId: 'theo', playerName: 'Theo', meta: 'Finley GC · Sat 4 Oct · Blue tees', score: 71, toPar: -1, holes: null, gir: '12/18', putts: 29, sg: 1.2 },
    ],
  },
  scoring: { error: false, points: SCORES.map(([label, score], i) => ({ id: `s${i}`, label, score, par: 72 })) },
  sgPerRound: 1.8,
  handicap: -0.8,
  legs: {
    cacheError: false,
    d1Error: false,
    rows: [
      leg('tee', 'Off the tee', 'Fairways hit', 71, '%', 0, false, 0.8, null, [62, 64, 66, 65, 68, 70, 71], '101 of 142 fairways in the last 10 rounds'),
      leg('approach', 'Approach', 'Greens in regulation', 74, '%', 0, false, 0.6, 60, [64, 66, 65, 70, 72, 71, 74], '133 of 180 greens in the last 10 rounds'),
      leg('short', 'Short game', 'Scrambling', 62, '%', 0, false, 0.3, null, [54, 58, 55, 60, 57, 61, 62], 'Up and down 29 of 47 · sand saves 6 of 11'),
      leg('putting', 'Putting', 'Putts per round', 29.0, '', 1, true, 0.1, null, [29.4, 29.8, 29.1, 29.6, 28.9, 29.3, 29.0], '1.0 three-putts a round'),
    ],
  },
};

export const PREVIEW_PLAYER_HOME_FAILED: ChPlayerHome = {
  ...PREVIEW_PLAYER_HOME,
  brief: null,
  week: { ...PREVIEW_PLAYER_HOME.week, error: true },
  next: null,
  today: [],
  latest: { rounds: [], error: true, holesError: false },
  scoring: { points: [], error: true },
  legs: null,
};

/** A new player: no rounds and nothing on the calendar (the first-run page, CH-2312). */
export const PREVIEW_PLAYER_HOME_EMPTY: ChPlayerHome = {
  ...PREVIEW_PLAYER_HOME,
  brief: null,
  week: { error: false, agenda: [], days: PREVIEW_HOME.week.days.map((d) => ({ ...d, eventCount: 0, hasCompetition: false })) },
  next: null,
  today: [],
  weekNote: null,
  latest: { rounds: [], error: false, holesError: false },
  scoring: { points: [], error: false },
  sgPerRound: null,
  legs: { rows: PREVIEW_PLAYER_HOME.legs!.rows.map((l) => ({ ...l, value: null, sg: null, trend: [], note: null })), cacheError: false, d1Error: false },
};

/** Rounds, but nothing on the calendar ahead. */
export const PREVIEW_PLAYER_HOME_NO_EVENTS: ChPlayerHome = {
  ...PREVIEW_PLAYER_HOME,
  week: { error: false, agenda: [], days: PREVIEW_HOME.week.days.map((d) => ({ ...d, eventCount: 0, hasCompetition: false })) },
  next: null,
  today: [],
  weekNote: null,
};

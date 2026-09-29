/** Roster preview fixture: design/handoff/roster-data.js, shaped as loadRoster output. */
import type { ChRoster, ChRosterPlayer } from '../data/roster';

type Raw = [id: string, name: string, cls: string, grad: number, home: string, status: 'active' | 'inactive', avg: number, hcp: number, rounds: number, sg: number | null, trend: number[], focus: number, goals: number, last: Array<[string, string, number, number]>, attention: ChRosterPlayer['attention'], jersey: string | null];

const RAW: Raw[] = [
  ['theo', 'Theo Marchetti', 'Senior', 2027, 'Asheville, NC', 'active', 70.9, -0.8, 24, 1.8, [72, 71, 71, 70, 70, 71, 70], 1, 3, [['Oakmont CC', 'Oct 12', 70, -1], ['Pine Needles', 'Oct 11', 69, -3], ['Finley GC', 'Oct 4', 71, -1]], null, '4'],
  ['sofia', 'Sofia Alvarez', 'Senior', 2027, 'San Antonio, TX', 'active', 71.6, 1.9, 22, 1.1, [72, 72, 71, 72, 71, 71, 71], 2, 2, [['Oakmont CC', 'Oct 12', 71, 0], ['Finley GC', 'Oct 8', 72, 0], ['Finley GC', 'Oct 4', 71, -1]], null, '11'],
  ['ava', 'Ava Lindqvist', 'Junior', 2028, 'Gothenburg, SE', 'active', 72.4, 2.4, 19, 0.6, [73, 74, 72, 72, 72, 73, 72], 1, 2, [['Oakmont CC', 'Oct 12', 72, 1], ['Finley GC', 'Oct 8', 73, 1], ['Finley GC', 'Oct 4', 72, 0]], null, null],
  ['jonah', 'Jonah Okafor', 'Sophomore', 2029, 'Charlotte, NC', 'active', 74.1, 3.9, 21, -0.9, [72, 72, 73, 74, 75, 74, 75], 2, 1, [['Pine Needles', 'Oct 11', 76, 4], ['Finley GC', 'Oct 8', 75, 3], ['Finley GC', 'Oct 4', 74, 2]], { tone: 'warning', text: 'Scoring up 2.1' }, null],
  ['eli', 'Eli Brandt', 'Junior', 2028, 'Raleigh, NC', 'active', 74.8, 4.2, 14, -0.4, [74, 75, 74, 75, 75, 74, 75], 0, 0, [['Finley GC', 'Oct 5', 75, 3], ['Finley GC', 'Sep 28', 74, 2], ['Lonnie Poole', 'Sep 27', 75, 3]], { tone: 'warning', text: 'No rounds in 9 days' }, null],
  ['priya', 'Priya Natarajan', 'Freshman', 2030, 'Cary, NC', 'active', 75.2, 5.1, 16, -1.4, [78, 77, 77, 76, 75, 75, 74], 1, 2, [['Finley GC', 'Oct 10', 74, 2], ['Finley GC', 'Oct 8', 75, 3], ['Finley GC', 'Oct 4', 75, 3]], { tone: 'positive', text: '4 rounds under average' }, null],
  ['luca', 'Luca Ferraro', 'Freshman', 2030, 'Bologna, IT', 'active', 76.3, 6.0, 2, null, [77, 76], 0, 1, [['Finley GC', 'Oct 8', 76, 4], ['Finley GC', 'Oct 1', 77, 5]], null, null],
  ['mia', 'Mia Thornton', 'Junior', 2028, 'Greenville, SC', 'inactive', 73.8, 3.4, 9, -0.2, [74, 73, 74, 74, 73], 0, 0, [['Finley GC', 'Sep 12', 74, 2]], null, null],
];

export const PREVIEW_ROSTER: ChRoster = {
  teamName: 'Varsity',
  season: 'Fall 2026',
  joinCode: 'FINLEY-26',
  teamError: false,
  notesError: false,
  playersError: false,
  statsError: false,
  requestsError: false,
  requests: [
    { id: 'r1', name: 'Grace Liu', meta: 'Freshman · Class of 2030 · requested yesterday', handicap: 7.2 },
    { id: 'r2', name: 'Owen Park', meta: 'Sophomore · Class of 2029 · requested 3 days ago', handicap: 4.8 },
  ],
  players: RAW.map(([id, name, cls, grad, home, status, avg, hcp, rounds, sg, trend, focus, goals, last, attention, jersey]) => ({
    id,
    name,
    firstName: name.split(' ')[0] ?? name,
    classYear: cls,
    gradYear: grad,
    hometown: home,
    highSchool: id === 'theo' ? 'Asheville School' : null,
    jersey,
    handicap: hcp,
    status,
    joined: 'Joined Aug 2023',
    rounds,
    avg,
    sgPerRound: sg,
    trend,
    form: trend.length < 3 ? 'early' : trend[trend.length - 1]! < trend[0]! ? 'improving' : trend[trend.length - 1]! > trend[0]! ? 'slipping' : 'steady',
    recent: last.map(([course, date, score, toPar], i) => ({ id: `${id}-${i}`, course, date, score, toPar })),
    focusAreas: focus,
    goals,
    coachNote: id === 'jonah' ? 'Confidence dips after a bad hole. Keep 1:1s short and specific.' : null,
    attention,
  })),
};

export const PREVIEW_ROSTER_EMPTY: ChRoster = { ...PREVIEW_ROSTER, players: [], requests: [] };
export const PREVIEW_ROSTER_FAILED: ChRoster = { ...PREVIEW_ROSTER, playersError: true, requestsError: true, players: [], requests: [] };
/** Reads that fail while the roster itself loads: stats, the team row and this coach's notes. */
export const PREVIEW_ROSTER_PARTIAL: ChRoster = {
  ...PREVIEW_ROSTER,
  statsError: true,
  teamError: true,
  notesError: true,
  joinCode: null,
  teamName: 'Your team',
  season: null,
  // What loadRoster returns when rounds fail: no season figures, no attention chips, counts unknown.
  players: PREVIEW_ROSTER.players.map((p) => ({ ...p, rounds: 0, avg: null, sgPerRound: null, trend: [], form: 'early' as const, recent: [], attention: null, focusAreas: null, goals: null })),
};

/** Roster preview fixture: design/handoff/roster-data.js, shaped as loadRoster output. */
import type { ChRoster, ChRosterPlayer } from '../data/roster';
import type { ChPlayerRoster } from '../data/roster-player';

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

/** Strokes gained by leg (tee, approach, around the green, putting), adding up to each player's SG / round; none without one. */
const LEGS: Record<string, [number, number, number, number]> = {
  theo: [0.5, 0.6, 0.3, 0.4],
  sofia: [0.3, 0.4, 0.2, 0.2],
  ava: [0.2, 0.3, -0.1, 0.2],
  jonah: [0.2, -0.3, 0.3, -1.1],
  eli: [-0.5, 0.1, 0, 0],
  priya: [-0.2, -0.7, -0.3, -0.2],
  mia: [0.1, -0.2, 0, -0.1],
};
const NO_LEGS: ChRosterPlayer['sgLegs'] = { tee: null, approach: null, around: null, putting: null };
const legsOf = (id: string): ChRosterPlayer['sgLegs'] => {
  const l = LEGS[id];
  return l ? { tee: l[0], approach: l[1], around: l[2], putting: l[3] } : NO_LEGS;
};

/** What CoachHelm reads in each player's rounds (loadRoster `helm`): Luca and Mia have no current read. */
export const PREVIEW_ROSTER_HELM: ChRoster['helm'] = {
  status: 'on',
  byPlayer: {
    theo: { costing: 1, working: 2 },
    sofia: { costing: 2, working: 1 },
    ava: { costing: 2, working: 0 },
    jonah: { costing: 3, working: 1 },
    eli: { costing: 1, working: 0 },
    priya: { costing: 4, working: 1 },
  },
};

export const PREVIEW_ROSTER: ChRoster = {
  teamName: 'Varsity',
  season: 'Fall 2026',
  joinCode: 'FINLEY-26',
  teamError: false,
  notesError: false,
  playersError: false,
  statsError: false,
  requestsError: false,
  helm: PREVIEW_ROSTER_HELM,
  requests: [
    { id: 'r1', name: 'Grace Liu', meta: 'Freshman · Class of 2030 · requested yesterday', classYear: 'Freshman', gradYear: 2030, requested: 'yesterday', handicap: 7.2 },
    { id: 'r2', name: 'Owen Park', meta: 'Sophomore · Class of 2029 · requested 3 days ago', classYear: 'Sophomore', gradYear: 2029, requested: '3 days ago', handicap: 4.8 },
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
    sgLegs: legsOf(id),
    trend,
    form: trend.length < 3 ? 'early' : trend[trend.length - 1]! < trend[0]! ? 'improving' : trend[trend.length - 1]! > trend[0]! ? 'slipping' : 'steady',
    recent: last.map(([course, date, score, toPar], i) => ({ id: `${id}-${i}`, course, date, score, toPar })),
    focusAreas: focus,
    goals,
    coachNote: id === 'jonah' ? 'Confidence dips after a bad hole. Keep 1:1s short and specific.' : null,
    attention,
    availability: 'available' as const,
    availabilityUpdated: null,
  })),
};

/** Days before the preview's clock, as an ISO stamp (availability's "Updated 3 days ago"). */
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const AVAILABILITY: Record<string, Pick<ChRosterPlayer, 'availability' | 'availabilityUpdated'>> = {
  ava: { availability: 'injured', availabilityUpdated: daysAgo(3) },
  luca: { availability: 'away', availabilityUpdated: daysAgo(0) },
};
/**
 * `?state=availability`: Ava injured and Luca away (P003, availability). Both are active players, so the head counts
 * "7 active · 1 injured · 1 away"; neither is asked about under Needs a look.
 */
export const PREVIEW_ROSTER_AVAILABILITY: ChRoster = {
  ...PREVIEW_ROSTER,
  players: PREVIEW_ROSTER.players.map((p) => (AVAILABILITY[p.id] ? { ...p, ...AVAILABILITY[p.id], attention: null } : p)),
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
  players: PREVIEW_ROSTER.players.map((p) => ({ ...p, rounds: 0, avg: null, sgPerRound: null, sgLegs: NO_LEGS, trend: [], form: 'early' as const, recent: [], attention: null, focusAreas: null, goals: null })),
};

/** `?state=helm-failed`: CoachHelm's counts did not load (the panel's dashes, CH-3212); everything else did. */
export const PREVIEW_ROSTER_HELM_FAILED: ChRoster = { ...PREVIEW_ROSTER, helm: { status: 'failed' } };
/** `?state=helm-off`: CoachHelm is off for this coach, so the panel draws no CoachHelm block. */
export const PREVIEW_ROSTER_HELM_OFF: ChRoster = { ...PREVIEW_ROSTER, helm: { status: 'off' } };

/** The player's Roster (Theo's): the coaches, then the active players only, as loadPlayerRoster returns them (name, class, handicap). */
export const PREVIEW_PLAYER_ROSTER: ChPlayerRoster = {
  teamName: PREVIEW_ROSTER.teamName,
  season: PREVIEW_ROSTER.season,
  teamError: false,
  playersError: false,
  players: PREVIEW_ROSTER.players.filter((p) => p.status === 'active').map((p) => ({ id: p.id, name: p.name, classYear: p.classYear, gradYear: p.gradYear, handicap: p.handicap, isYou: p.id === 'theo' })),
  // The staff over the players (wave 7), head coach first, as the loader orders them.
  coaches: [
    { id: 'c-maya', name: 'Maya Reyes', role: 'Head coach' },
    { id: 'c-dan', name: 'Dan Whitfield', role: 'Assistant coach' },
  ],
};
export const PREVIEW_PLAYER_ROSTER_EMPTY: ChPlayerRoster = { ...PREVIEW_PLAYER_ROSTER, players: [] };
export const PREVIEW_PLAYER_ROSTER_FAILED: ChPlayerRoster = { ...PREVIEW_PLAYER_ROSTER, playersError: true, players: [] };

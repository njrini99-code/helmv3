import { toChInsight } from '../data/coachhelm-map';
import { courseReads, stationFigures, teamTotalOf, worstOf, type ChStation, type ChTeamBoardData, type ChTeamLeg, type ChTeamPlayer } from '../data/coachhelm-team-shape';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { CourseHistory } from '@/lib/coachhelm/v3/team-board/course-shape';
import { HELM_PLAYERS, PREVIEW_TOUR, slope } from './fixtures-coachhelm';
import { PREVIEW_TRACK_RECORD } from './fixtures-coachhelm-track';
import { CAST } from './cast';

/** The design page's board (`redesign/coachhelm-team.html`, P, READS, CRS): five players, their legs, reads and the course table. */
const PLAYERS = {
  ...HELM_PLAYERS,
  sam: { id: 'pl-sam', name: 'Sam Whitfield' },
} as const;

const leg = (strokes: number, rounds: number): ChTeamLeg => ({ strokes, rounds, missing: null });
const legs = (r: number, tee: number, approach: number, short_game: number, putting: number) => ({ tee: leg(tee, r), approach: leg(approach, r), short_game: leg(short_game, r), putting: leg(putting, r) });

/** A read's drill belongs to its area: the base insight is the putting one, so a read anywhere else swaps it or carries none. */
const DRILLS: Record<string, EvidenceInsight['drills']> = {
  tee: [{ id: 'dr-gate', slug: 'fairway-gate', title: 'Fairway gate', duration_min: 15, difficulty: 'intermediate' }],
  approach: [{ id: 'dr-carry', slug: 'carry-ladder', title: 'Carry-number ladder', duration_min: 15, difficulty: 'intermediate' }],
  short_game: [{ id: 'dr-landing', slug: 'landing-spot-ladder', title: 'Landing-spot ladder', duration_min: 12, difficulty: 'intermediate' }],
};

const read = (playerId: string, id: string, category: string, title: string, content: string, drawn?: { stakes: string; sample: string; assigned?: 'proposed'; word?: string; label?: string; compare?: { own: number; team: number; tour: number; unit: string; higherBetter: boolean } }) => {
  const r = toChInsight({ ...slope(playerId, id), category, title, content, ...(category === 'putting' ? {} : { drills: DRILLS[category] ?? [] }) } as EvidenceInsight, { tour: PREVIEW_TOUR, viewer: { role: 'coach', first: title.split(' ')[0] ?? 'Player' } });
  if (!drawn) return r;
  const evidence = { ...r.evidence, sample: drawn.sample, ...(drawn.label ? { label: drawn.label } : {}), ...(drawn.word && r.evidence.read ? { read: { ...r.evidence.read, word: drawn.word } } : {}) };
  return { ...r, stakes: drawn.stakes, evidence, ...(drawn.assigned ? { assigned: drawn.assigned } : {}), ...(drawn.compare ? { compare: { ...r.compare, ...drawn.compare } } : {}) } as typeof r;
};

const READS: Record<string, ReturnType<typeof read>[]> = {
  [PLAYERS.eli.id]: [
    read(PLAYERS.eli.id, 'r1', 'approach', 'Long approaches finish short-right', 'From 175 yards and out, 9 of Eli’s 16 missed greens finish short and right.', { stakes: '.6', sample: '21 rounds', word: 'Solid read', label: 'Greens hit from 175 yd and out', compare: { own: 31, team: 38, tour: 52, unit: '%', higherBetter: true } }),
    read(PLAYERS.eli.id, 'r8', 'course_management', 'Penalty strokes: 1.1 per round', 'Across 21 rounds Eli averages 1.1 penalty strokes a round, most from the tee.', { stakes: '.8', sample: '21 rounds', word: 'Early read', assigned: 'proposed' }),
    read(PLAYERS.eli.id, 'r13', 'course_management', 'Worst holes on Oak Hollow: #4, #11, #17', 'Across 11 rounds at Oak Hollow, Eli averages 1.1 over par on holes 4, 11 and 17.', { stakes: '.4', sample: '21 rounds', word: 'Early read' }),
  ],
  [PLAYERS.jonah.id]: [
    read(PLAYERS.jonah.id, 'r4', 'putting', 'Downhill putts from 5 to 10 feet', 'Jonah makes 4 of 15 downhill putts from 5 to 10 feet, against 9 of 16 uphill.'),
    read(PLAYERS.jonah.id, 'r10', 'short_game', 'Chips from 20 to 40 yards run past', 'Jonah’s chips from 20 to 40 yards finish 9 feet away, most of them past the hole.'),
    read(PLAYERS.jonah.id, 'r11', 'scoring', 'Double bogey-or-worse rate: 7.6%', 'Jonah makes double bogey or worse on 7.6% of holes across 18 rounds. Tour is 2.0%.', { stakes: '.6', sample: '18 rounds', word: 'Early read' }),
  ],
  [PLAYERS.priya.id]: [
    read(PLAYERS.priya.id, 'r2', 'approach', 'Approaches from 100 to 150 come up short', '11 of Priya’s 18 missed greens from 100 to 150 yards finish short of the green.', { stakes: '.5', sample: '16 rounds' }),
    read(PLAYERS.priya.id, 'r6', 'putting', 'Putts from 5 to 10 feet', 'Priya makes 44% from 5 to 10 feet. The cause isn’t traced yet.'),
    read(PLAYERS.priya.id, 'r12', 'pressure', 'Opening hole gap: +0.19 strokes vs round avg', 'Priya scores 0.19 worse on the first hole than on an average hole, from 16 rounds.'),
  ],
  [PLAYERS.theo.id]: [
    read(PLAYERS.theo.id, 'r5', 'putting', 'Three-putts from 30 feet and out', 'Theo three-putts 1.2 times a round from 30 feet and out, from 4 rounds.'),
    read(PLAYERS.theo.id, 'r7', 'tee', 'Drives finish right of the fairway', '1 in 3 of Theo’s drives finish in the right rough or worse, from 4 rounds.'),
    read(PLAYERS.theo.id, 'r3', 'approach', 'Proximity from 125 to 175', 'Theo’s approaches from 125 to 175 finish 41 feet away on average, from 4 rounds.', { stakes: '.4', sample: '4 rounds', word: 'Thin read' }),
    read(PLAYERS.theo.id, 'r14', 'scoring', 'Par 3 scoring: 3.48 (+0.48 vs par)', 'Theo averages 3.48 on par 3s, from 4 rounds. Tour is 3.00.'),
  ],
  // Sam has 3 rounds on file: a player is read from 4 (preview/cast.ts), so he stands on the hole with no read.
};

const player = (p: { id: string; name: string }, classYear: string, rounds: number, l: Record<ChStation, ChTeamLeg>, early = rounds < 5): ChTeamPlayer => {
  const values = Object.values(l).map((x) => x.strokes as number);
  return {
    id: p.id,
    name: p.name,
    first: p.name.split(' ')[0] as string,
    classYear,
    rounds,
    early,
    legs: l,
    // The page's figure; the app's total is the stored per-round mean (8 K).
    total: values.reduce((a, b) => a + b, 0),
    worst: worstOf(l),
    first10: null,
    reads: { needs: READS[p.id] ?? [], working: [] },
    heldBack: 0,
  };
};

const LIST: ChTeamPlayer[] = [
  // Who they are, their year and their rounds on file come from the one cast every preview shares.
  player(PLAYERS.eli, CAST.eli.classYear, CAST.eli.rounds, legs(CAST.eli.rounds, -0.31, -1.08, -0.22, -0.47)),
  player(PLAYERS.jonah, CAST.jonah.classYear, CAST.jonah.rounds, legs(CAST.jonah.rounds, 0.12, -0.54, -0.38, -0.96)),
  player(PLAYERS.priya, CAST.priya.classYear, CAST.priya.rounds, legs(CAST.priya.rounds, -0.18, -0.89, 0.08, -0.71)),
  player(PLAYERS.theo, CAST.theo.classYear, CAST.theo.rounds, legs(CAST.theo.rounds, -0.64, -0.41, -0.29, -0.83)),
  player(PLAYERS.sam, CAST.sam.classYear, CAST.sam.rounds, legs(CAST.sam.rounds, -0.22, -0.77, -0.51, -0.35)),
];

const WEEK_STARTS = ['2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'];
const WEEK_VALUES = [7.6, 6.9, 8.1, 6.3, 6.6, 5.9, 6.2, 6.8, 5.4, 5.7, 6.1];

const HISTORY: CourseHistory = {
  season: 6.4,
  rounds: 62,
  last4: 6.0,
  weeks: WEEK_STARTS.map((start, i) => ({ start, value: WEEK_VALUES[i] as number, n: 6 })),
  courses: [
    { id: 'oak', name: 'Oak Hollow', rounds: 33, value: 5.9, last: '2026-10-26', players: [
      { id: PLAYERS.jonah.id, rounds: 4, value: 4.6, season: 3.9 },
      { id: PLAYERS.priya.id, rounds: 4, value: 7.1, season: 6.2 },
      { id: PLAYERS.theo.id, rounds: 1, value: 9.0, season: 8.3 },
      { id: PLAYERS.eli.id, rounds: 5, value: 9.4, season: 7.8 },
      { id: PLAYERS.sam.id, rounds: 1, value: 10.0, season: 9.1 },
    ] },
    { id: 'hill', name: 'Hilltop', rounds: 15, value: 7.5, last: '2026-10-29', players: [
      { id: PLAYERS.jonah.id, rounds: 4, value: 4.6, season: 3.9 },
      { id: PLAYERS.priya.id, rounds: 4, value: 7.1, season: 6.2 },
      { id: PLAYERS.theo.id, rounds: 1, value: 9.0, season: 8.3 },
      { id: PLAYERS.eli.id, rounds: 5, value: 9.4, season: 7.8 },
      { id: PLAYERS.sam.id, rounds: 1, value: 10.0, season: 9.1 },
    ] },
    { id: 'lake', name: 'Lakeside', rounds: 5, value: 6.6, last: '2026-09-16', players: [] },
    { id: 'ridge', name: 'Ridgeview', rounds: 5, value: 7.3, last: '2026-08-18', players: [] },
    { id: 'brook', name: 'Brookfield', rounds: 4, value: 5.0, last: '2026-10-14', players: [] },
  ],
};

export const PREVIEW_TEAM_BOARD: ChTeamBoardData = {
  off: null,
  team: { name: 'Demo University Golf', tourKnown: true, baselineLabel: 'to Tour' },
  roster: { count: LIST.length, error: false },
  players: { list: LIST, error: false },
  legsError: false,
  stations: stationFigures(LIST),
  teamTotal: { strokes: teamTotalOf(LIST), rounds: 62 },
  course: {
    history: HISTORY,
    reads: courseReads(LIST),
    against: [
      { id: 'scoring_par_3', team: 0.36, tour: 0, n: 5 },
      { id: 'scoring_par_4', team: 0.27, tour: -0.03, n: 5 },
      { id: 'scoring_par_5', team: 0.02, tour: -0.45, n: 5 },
      { id: 'penalty_rate_per_round', team: 0.6, tour: 0.3, n: 5 },
      { id: 'big_number_rate', team: 6.1, tour: 2, n: 5 },
      { id: 'opening_hole_delta', team: 0.12, tour: 0.1, n: 5 },
    ],
  },
  patterns: {
    rows: [
      {
        id: 'approach-short',
        title: 'Eli, Priya and Theo all miss approaches short',
        members: '3 of 5 players',
        strokes: null,
        next: 'the ball finishes short of the green',
        who: [],
        memberIds: [PLAYERS.eli.id, PLAYERS.priya.id, PLAYERS.theo.id],
        area: 'approach',
      },
    ],
    below: null,
    reach: '5 of 5 players have enough rounds for reads.',
  },
  pulse: { rows: [], error: false },
  record: { status: 'ok', value: PREVIEW_TRACK_RECORD },
  storyRounds: {
    status: 'ok',
    value: {
      [PLAYERS.eli.name]: { date: '2026-10-29', course: 'Hilltop', tracked: 18, holes: [0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 2, 0, 0, 1, 0].map((toPar, i) => ({ n: i + 1, toPar })) },
    },
  },
  brief: {
    status: 'ok',
    value: {
      team: '5 players',
      week: 'Week of Oct 26',
      reads: [{ id: 'r1', kind: 'read', who: PLAYERS.eli.name, title: 'Two doubles from penalties', tag: 'Likely', strokes: null, next: null, behind: 'Holes 7 and 14: both drives went into the hazard, then a penalty drop. That’s the same leak as Eli’s open penalty read.', href: '#' }],
      counts: '4 rounds · 2 new reads · 1 cleared',
      cleared: [],
      outOfDate: null,
      patterns: null,
      working: [
        { id: 'w1', who: PLAYERS.jonah.name, playerId: PLAYERS.jonah.id, title: 'Lag putting from 30 ft and out', word: 'Active', line: 'Three-putts 0.9 to 0.5 a round · target 0.4', since: '5 rounds in', href: '#', progress: { from: 0.9, now: 0.5, target: 0.4 } },
        { id: 'w2', who: PLAYERS.priya.name, playerId: PLAYERS.priya.id, title: 'Wedges from 50 to 100 yd', word: 'In progress', line: 'Proximity 24 ft to 21 ft · target 18 ft', since: '3 rounds in', href: '#', progress: { from: 24, now: 21, target: 18 } },
      ],
      record: null,
      goals: [],
      goalsNone: null,
    } as never,
  },
};

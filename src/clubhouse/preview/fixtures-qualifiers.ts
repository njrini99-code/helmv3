import type { ChQDetail, ChQFormData, ChQList, ChQListItem } from '../data/qualifiers';
import { buildBoard, roundPars, type ChQEntrant, type ChQHole, type ChQRound, type ChQSelection, type ChQSelectionState, type ChQStatus } from '../screens/qualifiers/model';

/**
 * The Qualifiers handoff's sample program (design/handoff/qual-data.js), run
 * through the same model the loader uses, for the dev preview and the tests.
 */

const PAR = [4, 5, 3, 4, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5];
/** The handoff's deterministic scorecard: a round `toPar` over par spread across 18 holes. */
function card(seed: number, toPar: number): ChQHole[] {
  let s = seed;
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const d = PAR.map(() => 0);
  let left = toPar;
  let guard = 0;
  while (left !== 0 && guard++ < 400) {
    const i = Math.floor(rnd() * 18);
    const st = left > 0 ? 1 : -1;
    if (Math.abs((d[i] ?? 0) + st) <= (st > 0 ? 2 : 1)) {
      d[i] = (d[i] ?? 0) + st;
      left -= st;
    }
  }
  for (let k = 0; k < 3; k++) {
    const a = Math.floor(rnd() * 18);
    const b = Math.floor(rnd() * 18);
    if (a !== b && (d[a] ?? 0) < 1 && (d[b] ?? 0) > -1) {
      d[a] = (d[a] ?? 0) + 1;
      d[b] = (d[b] ?? 0) - 1;
    }
  }
  return PAR.map((p, i) => ({ n: i + 1, par: p, score: p + (d[i] ?? 0) }));
}

const P: Record<string, { name: string; year: string; active: boolean }> = {
  sofia: { name: 'Sofia Alvarez', year: 'Senior', active: true },
  theo: { name: 'Theo Marchetti', year: 'Senior', active: true },
  jonah: { name: 'Jonah Okafor', year: 'Sophomore', active: true },
  ava: { name: 'Ava Lindqvist', year: 'Junior', active: true },
  eli: { name: 'Eli Brandt', year: 'Junior', active: true },
  priya: { name: 'Priya Natarajan', year: 'Freshman', active: true },
  luca: { name: 'Luca Ferraro', year: 'Freshman', active: true },
  mia: { name: 'Mia Thornton', year: 'Junior', active: false },
};
export const PLAYER_ID = Object.fromEntries(Object.keys(P).map((k, i) => [k, `00000000-0000-4000-8000-0000000000${String(i + 10)}`])) as Record<keyof typeof P, string>;

interface Sample {
  id: string;
  name: string;
  status: ChQStatus;
  selectionState: ChQSelectionState;
  description: string;
  start: string;
  end: string;
  deadline: string;
  course: string;
  par: number;
  numRounds: number;
  squad: number;
  picks: number;
  rules: string;
  roundCourses: Array<[string, string]>;
  entries: Array<[string, Array<number | null>]>;
  selections?: ChQSelection[];
}

const qid = (n: number) => `10000000-0000-4000-8000-00000000000${n}`;
const SAMPLES: Sample[] = [
  {
    id: qid(1),
    name: 'Pinehurst qualifier',
    status: 'in_progress',
    selectionState: 'scoring',
    description: 'Three 18-hole rounds counting toward a cumulative total. The top four make the Pinehurst trip on score.',
    start: '2026-09-22',
    end: '2026-10-01',
    deadline: '2026-09-21',
    course: 'Finley GC',
    par: 72,
    numRounds: 3,
    squad: 5,
    picks: 1,
    rules: 'Lowest aggregate over all rounds. Ties broken by final-round scorecard playoff.',
    roundCourses: [
      ['Finley GC', '2026-09-22'],
      ['Finley GC', '2026-09-26'],
      ['Hope Valley CC', '2026-10-01'],
    ],
    entries: [
      ['sofia', [-1, -2]],
      ['theo', [1, -1]],
      ['jonah', [4, 0]],
      ['ava', [2, 3]],
      ['eli', [6, 1]],
      ['priya', [3, 7]],
      ['luca', [8]],
      ['mia', []],
    ],
  },
  {
    id: qid(2),
    name: 'Conference qualifier',
    status: 'upcoming',
    selectionState: 'open',
    description: 'Three rounds at Hope Valley. Top four qualify on score, one coach’s pick.',
    start: '2026-10-19',
    end: '2026-10-23',
    deadline: '2026-10-16',
    course: 'Hope Valley CC',
    par: 71,
    numRounds: 3,
    squad: 5,
    picks: 1,
    rules: 'Lowest aggregate over all rounds. Ties broken by final-round scorecard playoff.',
    roundCourses: [
      ['Hope Valley CC', '2026-10-19'],
      ['Hope Valley CC', '2026-10-21'],
      ['Hope Valley CC', '2026-10-23'],
    ],
    entries: ['sofia', 'theo', 'jonah', 'ava', 'eli', 'priya', 'luca'].map((k) => [k, []]),
  },
  {
    id: qid(3),
    name: 'Fall invitational qualifier',
    status: 'completed',
    selectionState: 'selected',
    description: 'Two rounds at Finley. Both count.',
    start: '2026-09-01',
    end: '2026-09-04',
    deadline: '2026-08-31',
    course: 'Finley GC',
    par: 72,
    numRounds: 2,
    squad: 5,
    picks: 1,
    rules: 'Lowest aggregate over both rounds.',
    roundCourses: [
      ['Finley GC', '2026-09-01'],
      ['Finley GC', '2026-09-04'],
    ],
    entries: [
      ['theo', [-2, 0]],
      ['sofia', [1, 1]],
      ['ava', [2, 3]],
      ['jonah', [3, 3]],
      ['mia', [4, 3]],
      ['eli', [5, 3]],
      ['priya', [6, 5]],
    ],
    selections: [
      ...['theo', 'sofia', 'ava', 'jonah'].map((k) => ({ playerId: PLAYER_ID[k]!, type: 'top_score' as const, reasoning: null })),
      { playerId: PLAYER_ID.eli!, type: 'coach_pick', reasoning: 'Two top-10s last spring at Pine Needles, the invitational course.' },
    ],
  },
  {
    id: qid(4),
    name: 'Preseason qualifier',
    status: 'completed',
    selectionState: 'open',
    description: 'One round to set the first travel squad.',
    start: '2026-08-22',
    end: '2026-08-22',
    deadline: '2026-08-20',
    course: 'Finley GC',
    par: 72,
    numRounds: 1,
    squad: 5,
    picks: 0,
    rules: 'Single 18-hole round.',
    roundCourses: [['Finley GC', '2026-08-22']],
    entries: [
      ['sofia', [0]],
      ['theo', [1]],
      ['ava', [3]],
      ['jonah', [4]],
      ['mia', [4]],
      ['eli', [6]],
    ],
  },
  {
    id: qid(5),
    name: 'Spring conference qualifier',
    status: 'completed',
    selectionState: 'open',
    description: 'Three rounds at Hope Valley.',
    start: '2026-04-06',
    end: '2026-04-10',
    deadline: '2026-04-03',
    course: 'Hope Valley CC',
    par: 71,
    numRounds: 3,
    squad: 5,
    picks: 1,
    rules: 'Lowest aggregate over all rounds.',
    roundCourses: [
      ['Hope Valley CC', '2026-04-06'],
      ['Hope Valley CC', '2026-04-08'],
      ['Hope Valley CC', '2026-04-10'],
    ],
    entries: [
      ['theo', [0, 1, -1]],
      ['sofia', [2, 0, 1]],
      ['mia', [3, 2, 2]],
      ['ava', [4, 3, 1]],
      ['eli', [5, 4, 3]],
    ],
  },
];

function roundsOf(s: Sample): { rounds: ChQRound[]; holes: Record<string, ChQHole[]> } {
  const rounds: ChQRound[] = [];
  const holes: Record<string, ChQHole[]> = {};
  for (const [k, list] of s.entries) {
    list.forEach((toPar, i) => {
      if (toPar == null) return;
      const id = `${s.id.slice(-2)}-${k}-${i + 1}`;
      const [course, date] = s.roundCourses[i] ?? [s.course, s.start];
      rounds.push({ id, playerId: PLAYER_ID[k]!, number: i + 1, total: s.par + toPar, toPar, date, course, holesPlayed: 18 });
      holes[id] = card(k.length * 31 + i * 7 + 3, toPar);
    });
  }
  return { rounds, holes };
}
const entrantsOf = (s: Sample): ChQEntrant[] => s.entries.map(([k]) => ({ playerId: PLAYER_ID[k]!, name: P[k]!.name, classYear: P[k]!.year }));
const nameOf = (id: string) => Object.entries(PLAYER_ID).find(([, v]) => v === id)?.[0] ?? '';

export function previewDetail(index: number, role: 'coach' | 'player' = 'coach', viewer: keyof typeof P = 'jonah'): ChQDetail {
  const s = SAMPLES[index]!;
  const { rounds, holes } = roundsOf(s);
  const selections = s.selectionState === 'selected' && s.selections ? s.selections.map((x) => ({ ...x, reasoning: role === 'coach' ? x.reasoning : null, name: P[nameOf(x.playerId)]!.name })) : null;
  const board = buildBoard({ entrants: entrantsOf(s), rounds, squad: s.squad, picks: s.picks, status: s.status, selectionState: s.selectionState, selections });
  const pars = roundPars({ numRounds: s.numRounds, teePars: new Map(s.roundCourses.map(([c], i) => [i + 1, c === 'Hope Valley CC' ? 71 : 72])), rounds });
  const viewerId = role === 'player' ? PLAYER_ID[viewer]! : null;
  return {
    role,
    viewerPlayerId: viewerId,
    id: s.id,
    name: s.name,
    description: s.description,
    status: s.status,
    selectionState: s.selectionState,
    startDate: s.start,
    endDate: s.end,
    deadline: s.deadline,
    course: s.course,
    rules: s.rules,
    numRounds: s.numRounds,
    squad: s.squad,
    picks: s.picks,
    entrants: s.entries.length,
    board,
    entriesError: false,
    roundsError: false,
    holes: role === 'coach' ? holes : Object.fromEntries(Object.entries(holes).filter(([id]) => rounds.find((r) => r.id === id)?.playerId === viewerId)),
    holesError: false,
    roundCourses: s.roundCourses.map(([c], i) => ({ number: i + 1, course: c, teeName: 'Blue', par: pars.byRound[i] ?? null })),
    par: pars.single,
    coursesError: false,
    selections,
    selectionsError: false,
  };
}

/** Detail samples by name: live (Pinehurst), upcoming (Conference), selected (Fall invitational), completed (Preseason), spring (three rounds). */
export const DETAIL_INDEX: Record<string, number> = { live: 0, upcoming: 1, selected: 2, completed: 3, spring: 4 };

export function previewList(role: 'coach' | 'player' = 'coach', mode: 'all' | 'mine' = 'all', viewer: keyof typeof P = 'jonah'): ChQList {
  const items: ChQListItem[] = SAMPLES.map((s, i) => {
    const d = previewDetail(i, role, viewer);
    const me = [...d.board!.rows, ...d.board!.unscored].find((r) => r.playerId === d.viewerPlayerId);
    return {
      id: s.id,
      name: s.name,
      description: s.description,
      status: s.status,
      startDate: s.start,
      endDate: s.end,
      course: s.course,
      numRounds: s.numRounds,
      squad: s.squad,
      picks: s.picks,
      entrants: s.entries.length,
      submitted: d.board!.submitted,
      topScore: d.board!.topScore,
      leaders: d.board!.rows.slice(0, d.board!.topScore + 1).map((r) => ({ playerId: r.playerId, name: r.name, position: (r.tied ? 'T' : '') + r.position, played: r.played, toPar: r.toPar })),
      mine: role === 'player' ? { entered: !!me, position: me?.position != null ? (me.tied ? 'T' : '') + me.position : null, toPar: me?.toPar ?? null, played: me?.played ?? 0 } : null,
    };
  });
  const visible = mode === 'mine' ? items.filter((i) => i.mine?.entered) : items;
  return { role, mode, items: role === 'player' ? [...visible.filter((i) => i.mine?.entered), ...visible.filter((i) => !i.mine?.entered)] : visible, listError: false, standingsError: false };
}

const ROSTER = Object.entries(P)
  .filter(([, p]) => p.active)
  .map(([k, p]) => ({ id: PLAYER_ID[k]!, name: p.name, classYear: p.year, locked: false as const, inactive: false }))
  .sort((a, b) => (a.name.split(' ')[1] ?? '').localeCompare(b.name.split(' ')[1] ?? ''));

export function previewCreateForm(): ChQFormData {
  return {
    mode: 'create',
    id: null,
    name: null,
    initial: {
      name: '',
      description: '',
      startDate: '',
      endDate: '',
      entryDeadline: '',
      rounds: '3',
      oneRoundAck: false,
      course: 'Finley GC',
      rules: '',
      squad: '5',
      picks: '1',
      playerIds: ROSTER.map((p) => p.id),
    },
    roundCourses: [],
    players: ROSTER,
    playersError: false,
    coursesError: false,
    squadLocked: false,
    minRounds: 1,
  };
}

export function previewEditForm(): ChQFormData {
  const s = SAMPLES[0]!;
  const played = new Set(s.entries.filter(([, r]) => r.length > 0).map(([k]) => PLAYER_ID[k]!));
  const players: ChQFormData['players'] = [
    ...ROSTER.map((p) => ({ ...p, locked: played.has(p.id) ? ('round' as const) : (false as const) })),
    { id: PLAYER_ID.mia!, name: P.mia!.name, classYear: P.mia!.year, locked: false, inactive: true },
  ];
  return {
    mode: 'edit',
    id: s.id,
    name: s.name,
    initial: {
      name: s.name,
      description: s.description,
      startDate: s.start,
      endDate: s.end,
      entryDeadline: s.deadline,
      rounds: String(s.numRounds),
      oneRoundAck: false,
      course: s.course,
      rules: s.rules,
      squad: String(s.squad),
      picks: String(s.picks),
      playerIds: s.entries.map(([k]) => PLAYER_ID[k]!),
    },
    roundCourses: s.roundCourses.map(([c], i) => ({ number: i + 1, courseId: `c-${i}`, courseName: c, teeId: `t-${i}`, teeName: 'Blue', par: c === 'Hope Valley CC' ? 71 : 72 })),
    players,
    playersError: false,
    coursesError: false,
    squadLocked: false,
    minRounds: 2,
  };
}

export const PREVIEW_COURSES = [
  { id: 'c-finley', name: 'Finley GC', place: 'Chapel Hill, NC', par: 72 },
  { id: 'c-hope', name: 'Hope Valley CC', place: 'Durham, NC', par: 71 },
  { id: 'c-pine', name: 'Pine Needles', place: 'Southern Pines, NC', par: 71 },
];
export const PREVIEW_TEES = [
  { id: 't-blue', name: 'Blue', par: 72, yards: 6820, holes: 18 },
  { id: 't-white', name: 'White', par: 72, yards: 6310, holes: 18 },
];

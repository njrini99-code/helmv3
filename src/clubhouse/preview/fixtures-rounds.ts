import { seasonFrom, toLibraryRound, type ChLibraryRound, type ChRoundListRow, type ChRoundsLibrary, type ChUnfinishedRound } from '../data/rounds-shape';

/** Rounds sample data: design/handoff/rounds-data.js (Jonah Okafor, Fall 2026; today is 14 October). */

export const PREVIEW_ROUNDS_TODAY = '2026-10-14';

// [date, course, tees, type, score, par, putts, fairways hit/of, greens, out]
const SAMPLE: Array<[string, string, string, string, number, number, number, [number, number], number, number]> = [
  ['2026-09-26', 'Finley GC', 'Blue', 'qualifier', 72, 72, 30, [9, 14], 12, 35],
  ['2026-09-22', 'Finley GC', 'Blue', 'qualifier', 76, 72, 33, [7, 14], 10, 39],
  ['2026-09-18', 'Hope Valley CC', 'Blue', 'practice', 71, 70, 29, [10, 14], 12, 36],
  ['2026-09-12', 'Hope Valley CC', 'Blue', 'tournament', 74, 70, 31, [8, 14], 11, 37],
  ['2026-09-05', 'Finley GC', 'Blue', 'practice', 75, 72, 32, [8, 14], 10, 38],
  ['2026-08-30', 'Old Chatham GC', 'White', 'practice', 73, 72, 31, [9, 14], 11, 37],
  ['2026-08-24', 'Finley GC', 'Blue', 'practice', 77, 72, 34, [6, 14], 9, 38],
  // The board's Aug 18 round is a 75; here it is a 69 on Championship tees, so the preview shows an under-par round and a tee with no colour.
  ['2026-08-18', 'Carolina GC', 'Championship', 'qualifier', 69, 72, 27, [11, 14], 14, 34],
];

export function previewRow(i: number, [date, course, tees, type, score, par, putts, fir, gir, out]: (typeof SAMPLE)[number]): ChRoundListRow {
  return {
    id: `r${i + 1}`,
    course_name: course,
    tees_played: tees,
    round_date: date,
    round_type: type,
    total_score: score,
    score_to_par: score - par,
    front_nine: out,
    back_nine: score - out,
    holes_played: 18,
    total_putts: putts,
    total_gir: gir,
    total_gir_possible: 18,
    total_fairways_hit: fir[0],
    total_fairways: fir[1],
  };
}

const LIST: ChLibraryRound[] = SAMPLE.map((s, i) => toLibraryRound(previewRow(i, s))).filter((r): r is ChLibraryRound => r != null);
// A 9-hole practice loop: listed, but it sets no season figure (full 18 only).
const NINE = toLibraryRound({ ...previewRow(20, ['2026-09-09', 'Finley GC', 'Blue', 'practice', 38, 36, 16, [4, 7], 5, 38]), id: 'r9h', holes_played: 9, back_nine: null, total_gir_possible: 9 });
const WITH_NINE = [...LIST.slice(0, 4), ...(NINE ? [NINE] : []), ...LIST.slice(4)];

// The in-progress round on the board: Finley GC, Blue, practice, holes 1–3 scored (4, 6, 3 on par 4, 5, 3).
export const PREVIEW_UNFINISHED: ChUnfinishedRound = {
  id: 'u1',
  course: 'Finley GC',
  tee: 'Blue tees',
  teeColor: 'blue',
  type: 'practice',
  holes: 18,
  date: PREVIEW_ROUNDS_TODAY,
  played: [
    { n: 1, score: 4, par: 4 },
    { n: 2, score: 6, par: 5 },
    { n: 3, score: 3, par: 3 },
  ],
  toParThru: 1,
  nextHole: 4,
  readyToSubmit: false,
};

const lib = (list: ChLibraryRound[], unfinished: ChUnfinishedRound[], over: Partial<ChRoundsLibrary> = {}): ChRoundsLibrary => ({
  todayIso: PREVIEW_ROUNDS_TODAY,
  rounds: { list, error: false },
  season: seasonFrom(list, '2026-08-01'),
  unfinished: { list: unfinished, error: false },
  ...over,
});

export const PREVIEW_ROUNDS = lib(WITH_NINE, [PREVIEW_UNFINISHED]);
export const PREVIEW_ROUNDS_IDLE = lib(WITH_NINE, []);
export const PREVIEW_ROUNDS_EMPTY = lib([], []);
/** Only a 9-hole round: listed, with the season card's empty state. */
export const PREVIEW_ROUNDS_NO_SEASON = lib(NINE ? [NINE] : [], []);
export const PREVIEW_ROUNDS_FAILED = lib([], [PREVIEW_UNFINISHED], { rounds: { list: [], error: true } });
export const PREVIEW_ROUNDS_UNFINISHED_FAILED = lib(WITH_NINE, [], { unfinished: { list: [], error: true } });
/** Three unfinished rounds, the oldest with every hole scored (ready to submit). */
export const PREVIEW_ROUNDS_MANY = lib(WITH_NINE, [
  PREVIEW_UNFINISHED,
  { ...PREVIEW_UNFINISHED, id: 'u2', course: 'Hope Valley CC', date: '2026-10-02', played: [], toParThru: null, nextHole: 1 },
  {
    ...PREVIEW_UNFINISHED,
    id: 'u3',
    course: 'Governors Club',
    date: '2026-09-29',
    played: Array.from({ length: 18 }, (_, i) => ({ n: i + 1, score: 4, par: 4 })),
    toParThru: 0,
    nextHole: null,
    readyToSubmit: true,
  },
]);

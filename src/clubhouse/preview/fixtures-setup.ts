import type { ChSetupCourse, ChSetupHole, ChSetupQualifier, ChSetupTee } from '../screens/rounds/setup/shape';
import { PREVIEW_FINLEY } from './fixtures-round-review';

/**
 * Round setup from design/handoff/rounds-flow.jsx (Setup, Picker): the course
 * library as the player sees it, Finley GC's tees and the fall qualifier.
 * Today is Oct 14, 2026, as on the boards.
 */

export const PREVIEW_SETUP_TODAY = '2026-10-14';

export const PREVIEW_SETUP_COURSES: ChSetupCourse[] = [
  { id: 'finley', name: 'Finley GC', place: 'Chapel Hill, NC', par: 72, teeCount: 4, group: 'recent', lastPlayed: 'Oct 2' },
  { id: 'pinehurst8', name: 'Pinehurst No. 8', place: 'Pinehurst, NC', par: 72, teeCount: 3, group: 'recent', lastPlayed: 'Sep 26' },
  { id: 'governors', name: 'Governors Club', place: 'Chapel Hill, NC', par: 72, teeCount: 3, group: 'team', lastPlayed: null },
  { id: 'duke', name: 'Duke University GC', place: 'Durham, NC', par: 71, teeCount: 4, group: 'team', lastPlayed: null },
  { id: 'chatham', name: 'Old Chatham GC', place: 'Durham, NC', par: 72, teeCount: 3, group: 'library', lastPlayed: null },
  { id: 'chapel-ridge', name: 'Chapel Ridge GC', place: 'Pittsboro, NC', par: 72, teeCount: 1, group: 'library', lastPlayed: null },
];

const tee = (t: Partial<ChSetupTee> & Pick<ChSetupTee, 'id' | 'name'>): ChSetupTee => ({
  color: null,
  category: null,
  yards: null,
  par: 72,
  rating: null,
  slope: null,
  holesCount: 18,
  draft: false,
  ...t,
});

export const PREVIEW_SETUP_TEES: Record<string, ChSetupTee[]> = {
  finley: [
    tee({ id: 'finley-black', name: 'Black', color: 'black', category: 'Championship', yards: 7190, rating: 74.6, slope: 139 }),
    tee({ id: 'finley-blue', name: 'Blue', color: 'blue', category: "Men's", yards: 6984, rating: 73.1, slope: 133 }),
    tee({ id: 'finley-white', name: 'White', color: 'white', category: "Men's forward", yards: 6420, rating: 70.6, slope: 126 }),
    tee({ id: 'finley-gold', name: 'Gold', color: 'gold', yards: null, draft: true }),
  ],
  'chapel-ridge': [tee({ id: 'cr-blue', name: 'Blue', color: 'blue', draft: true })],
};

/** A tee's holes: Finley's Blue card, scaled to the tee's length. */
export function previewTeeHoles(teeId: string): ChSetupHole[] {
  const t = Object.values(PREVIEW_SETUP_TEES)
    .flat()
    .find((x) => x.id === teeId);
  const scale = (t?.yards ?? 6984) / 6984;
  return PREVIEW_FINLEY.map(([par, y], i) => ({ n: i + 1, par, yards: String(Math.round(y * scale)) }));
}

export const PREVIEW_SETUP_QUALIFIERS: ChSetupQualifier[] = [
  { id: 'q-fall-2', name: 'Fall qualifier 2', courseId: 'finley', courseName: 'Finley GC', teeId: 'finley-blue', teeName: 'Blue', nextRound: 3, rounds: 3, completed: 2, blocked: null },
  {
    id: 'q-pinehurst',
    name: 'Pinehurst travel qualifier',
    courseId: 'pinehurst8',
    courseName: 'Pinehurst No. 8',
    teeId: null,
    teeName: null,
    nextRound: null,
    rounds: 2,
    completed: 2,
    blocked: 'Both rounds are in; your coach is selecting.',
  },
];

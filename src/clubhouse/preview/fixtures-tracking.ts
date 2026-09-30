import type { RoundHole, ShotRecord } from '@/lib/types/golf';
import type { ChTrackingRound } from '../screens/rounds/track/RoundTracking';
import { PREVIEW_FINLEY, PREVIEW_FINLEY_PATTERN } from './fixtures-round-review';

/**
 * Round tracking from design/handoff/rounds-track.jsx: Finley GC, Blue tees,
 * practice, on hole 4 (par 4, 381 yds) after three holes. Shots are real
 * ShotRecords, as the engine stores them, built like the board's buildRound.
 */

export const PREVIEW_TRACK_ROUND: ChTrackingRound = { course: 'Finley GC', teeLabel: 'Blue', teeColor: 'blue', type: 'practice' };

const shot = (s: Partial<ShotRecord> & Pick<ShotRecord, 'shotNumber' | 'shotType' | 'result'>): ShotRecord => ({
  clubType: s.shotType === 'putting' ? 'putter' : 'non_driver',
  lieBefore: 'fairway',
  distanceToHoleBefore: 0,
  distanceUnitBefore: 'yards',
  distanceToHoleAfter: 0,
  distanceUnitAfter: 'yards',
  shotDistance: 0,
  isPenalty: false,
  ...s,
});

/** A holed-out hole's shots for a score and putt count (the board's buildRound, simplified). */
function holeShots(par: number, yards: number, score: number, putts: number, i: number): ShotRecord[] {
  const out: ShotRecord[] = [];
  const full = score - putts;
  let n = 1;
  let from = yards;
  let fromUnit: 'yards' | 'feet' = 'yards';
  let lie: ShotRecord['lieBefore'] = 'tee';
  for (let k = 0; k < full; k++) {
    const last = k === full - 1;
    const tee = k === 0;
    const green = last;
    const to = green ? 12 + ((i * 7) % 20) : Math.round(from * (par === 5 && tee ? 0.46 : 0.36));
    const result: ShotRecord['result'] = green ? 'green' : tee && i % 3 === 1 ? 'rough' : 'fairway';
    out.push(
      shot({
        shotNumber: n++,
        shotType: tee ? 'tee' : from < 40 ? 'around_green' : 'approach',
        clubType: tee && par !== 3 && i % 4 !== 2 ? 'driver' : 'non_driver',
        lieBefore: lie,
        distanceToHoleBefore: from,
        distanceUnitBefore: fromUnit,
        result,
        distanceToHoleAfter: to,
        distanceUnitAfter: green ? 'feet' : 'yards',
        shotDistance: green ? Math.round(from - to / 3) : from - to,
        missDirection: result === 'rough' ? 'right' : undefined,
      }),
    );
    from = to;
    fromUnit = green ? 'feet' : 'yards';
    lie = result as ShotRecord['lieBefore'];
  }
  for (let k = 0; k < putts; k++) {
    const last = k === putts - 1;
    out.push(
      shot({
        shotNumber: n++,
        shotType: 'putting',
        lieBefore: 'green',
        distanceToHoleBefore: from,
        distanceUnitBefore: 'feet',
        result: last ? 'hole' : 'green',
        distanceToHoleAfter: last ? 0 : 3,
        distanceUnitAfter: 'feet',
        puttBreak: (['left_to_right', 'straight', 'right_to_left'] as const)[i % 3],
        puttSlope: (['uphill', 'level', 'downhill'] as const)[i % 3],
        puttDistanceFeet: from,
      }),
    );
    from = 3;
  }
  return out;
}

const HOLES: RoundHole[] = PREVIEW_FINLEY.map(([par, yardage], i) => ({ number: i + 1, par, yardage, score: null }));
const PLAYED = PREVIEW_FINLEY.map(([par, yards], i) => {
  const d = PREVIEW_FINLEY_PATTERN[i]!;
  const putts = d < 0 ? 1 : d > 0 && i % 2 ? 3 : 2;
  return holeShots(par, yards, par + d, putts, i);
});

// Hole 4 in progress: the tee shot, the approach, then the putt that holes it.
const H4_TEE = shot({
  shotNumber: 1,
  shotType: 'tee',
  clubType: 'driver',
  lieBefore: 'tee',
  distanceToHoleBefore: 381,
  result: 'fairway',
  distanceToHoleAfter: 142,
  shotDistance: 239,
});
const H4_APPROACH = shot({
  shotNumber: 2,
  shotType: 'approach',
  lieBefore: 'fairway',
  distanceToHoleBefore: 142,
  result: 'green',
  distanceToHoleAfter: 18,
  distanceUnitAfter: 'feet',
  shotDistance: 136,
});

export interface ChTrackFixture {
  holes: RoundHole[];
  index: number;
  shotsByHole: Record<number, ShotRecord[]>;
  sheet: 'exit' | 'card' | 'summary' | null;
  submit: 'saving' | 'done' | 'failed' | null;
  /** onHoleComplete resolves false (the hole didn't save). */
  checkpointFails: boolean;
  meters: boolean;
}

/** `?state=` of /clubhouse-preview/track. */
export function trackingFixture(state: string | undefined): ChTrackFixture {
  const upTo = (n: number) => HOLES.map((h, i) => (i < n ? { ...h, score: PLAYED[i]!.length } : h));
  const shotsUpTo = (n: number) => Object.fromEntries(PLAYED.slice(0, n).map((s, i) => [i, s]));
  const base: ChTrackFixture = { holes: upTo(3), index: 3, shotsByHole: shotsUpTo(3), sheet: null, submit: null, checkpointFails: false, meters: false };
  const on4 = (shots: ShotRecord[]) => ({ ...base.shotsByHole, 3: shots });
  switch (state) {
    case 'approach':
      return { ...base, shotsByHole: on4([H4_TEE]) };
    case 'meters':
      return { ...base, shotsByHole: on4([H4_TEE]), meters: true };
    case 'putt':
      return { ...base, shotsByHole: on4([H4_TEE, H4_APPROACH]) };
    case 'checkpointfail':
      return { ...base, shotsByHole: on4([H4_TEE, H4_APPROACH]), checkpointFails: true };
    case 'holed':
      return { ...base, holes: upTo(4), shotsByHole: shotsUpTo(4) };
    case 'last':
      return { ...base, holes: upTo(17), index: 17, shotsByHole: { ...shotsUpTo(17), 17: PLAYED[17]!.slice(0, -1) } };
    case 'exit':
      return { ...base, shotsByHole: on4([H4_TEE]), sheet: 'exit' };
    case 'card':
      return { ...base, shotsByHole: on4([H4_TEE]), sheet: 'card' };
    case 'summary':
      return { ...base, holes: upTo(18), index: 17, shotsByHole: shotsUpTo(18), sheet: 'summary' };
    case 'submitting':
      return { ...base, holes: upTo(18), index: 17, shotsByHole: shotsUpTo(18), submit: 'saving' };
    case 'posted':
      return { ...base, holes: upTo(18), index: 17, shotsByHole: shotsUpTo(18), submit: 'done' };
    case 'submitfail':
      return { ...base, holes: upTo(18), index: 17, shotsByHole: shotsUpTo(18), submit: 'failed' };
    default:
      return base;
  }
}

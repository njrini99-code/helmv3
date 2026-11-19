/**
 * Synthetic players for the writer's tests and its offline eval: made-up ids, no names, built with the analyst's own
 * fixture builder (`../../__tests__/fixtures.ts`) so their fact sheets and notability are the real code's output.
 */
import { assembleFactSheets } from '../../fact-sheet';
import { findNotable, type Notability } from '../../notability';
import { TeamFixture, tenRounds, type Legs, type RoundSpec } from '../../__tests__/fixtures';
import type { FactSheet } from '../../types';

export interface SyntheticPlayer {
  id: string;
  /** What the fixture is meant to show, for the eval's table. */
  shape: string;
  sheet: FactSheet;
  notability: Notability;
}

/** Putts for one round: long first putts that rarely drop, short ones that do. [feet, made] */
const longPutter = (i: number): RoundSpec['putts'] => [
  ...Array.from({ length: 6 }, (_, k) => [28 + ((i + k) % 12), k === 0 && i % 3 === 0] as const),
  ...Array.from({ length: 4 }, (_, k) => [4 + (k % 2), true] as const),
  ...Array.from({ length: 3 }, (_, k) => [12 + k, k === 1] as const),
];
const shortMisser = (i: number): RoundSpec['putts'] => [
  ...Array.from({ length: 6 }, (_, k) => [3 + (k % 3), (i + k) % 3 !== 0] as const),
  ...Array.from({ length: 4 }, (_, k) => [30 + k, false] as const),
];
/** Approaches: [yards before, feet after, on the green]. */
const longIrons = (i: number): RoundSpec['approaches'] => [
  ...Array.from({ length: 5 }, (_, k) => [180 + k * 5, 60 + ((i + k) % 4) * 10, k === 0] as const),
  ...Array.from({ length: 5 }, (_, k) => [100 + k * 5, 18 + k, true] as const),
];

function team(subject: { legs: Legs; extra: (i: number) => Partial<RoundSpec> }): TeamFixture {
  const fx = new TeamFixture();
  fx.player('subject', tenRounds(2, subject.legs, subject.extra));
  for (let k = 0; k < 5; k++) fx.player(`mate-${k}`, tenRounds(2, { tee: -0.5, approach: -2.6 - k * 0.1, around: -0.6, putting: -0.7 }, (i) => ({ putts: shortMisser(i + k), approaches: longIrons(i + k) })));
  return fx;
}

function build(id: string, shape: string, fx: TeamFixture): SyntheticPlayer {
  const sheet = assembleFactSheets(fx.rows()).find((s) => s.player_id === 'subject')!;
  return { id, shape, sheet, notability: findNotable(sheet) };
}

/** Three players whose facts differ: putting from long range, approach from 175 and out, a leaning read. */
export function syntheticPlayers(): SyntheticPlayer[] {
  return [
    build('long-putter', 'putting, loses strokes from 25 feet and longer', team({ legs: { tee: -0.4, approach: -0.6, around: -0.5, putting: -2.4 }, extra: (i) => ({ putts: longPutter(i), approaches: longIrons(i) }) })),
    build('long-irons', 'approach, loses strokes from 175 yards and longer', team({ legs: { tee: -0.5, approach: -3.1, around: -0.4, putting: -0.6 }, extra: (i) => ({ putts: shortMisser(i), approaches: longIrons(i) }) })),
    build('leaning', 'a lowest area the rounds cannot yet separate', team({ legs: { tee: 0.1, approach: -0.05, around: 0.1, putting: 0.1 }, extra: (i) => ({ putts: shortMisser(i), approaches: longIrons(i) }) })),
  ];
}

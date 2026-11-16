import type { ChExportHole } from '@/app/golf/actions/rounds-export';
import type { ChLibraryRound } from '../../data/rounds-shape';
import { chCsvName, type ChCsvFile, type ChCsvValue } from '../../lib/csv';
import { TYPE_LABEL } from './labels';

/**
 * Launch readiness F-02: rounds with their holes, as one spreadsheet (the player's own Rounds, the coach's Team rounds). One
 * row a round, newest first as the page lists them: the round's figures as the page shows them, whether it is in the
 * averages, then each hole's score and par. A 9-hole round leaves holes 10 to 18 empty; a round posted as a total only
 * (Q-123) has no holes.
 */

export type { ChExportHole };

type Round = ChLibraryRound & { player?: string };

const HOLES = 18;
const range = (k: string) => Array.from({ length: HOLES }, (_, i) => `${k} ${i + 1}`);

/** In the averages: a countable 18-hole round that isn't practice, the rule Stats, Home and Rounds read (`seasonFrom`). */
export function inAverages(r: ChLibraryRound): boolean {
  return r.countable && r.holes === 18 && r.averaged !== false;
}

export function roundsCsv(input: {
  rounds: readonly Round[];
  holes: Readonly<Record<string, readonly ChExportHole[]>>;
  team: boolean;
  name: Array<string | null | undefined>;
}): ChCsvFile {
  const head = [
    ...(input.team ? ['Player'] : []),
    'Date',
    'Course',
    'Tees',
    'Type',
    'Holes',
    'Score',
    'To par',
    'Out',
    'In',
    'Putts',
    'Fairways hit',
    'Fairways',
    'Greens hit',
    'Greens',
    'In averages',
    ...range('Hole'),
    ...range('Par'),
  ];
  const rows = input.rounds.map((r): ChCsvValue[] => {
    const holes = r.totalOnly ? [] : (input.holes[r.id] ?? []);
    const at = (n: number) => holes.find((h) => h.n === n);
    return [
      ...(input.team ? [r.player ?? ''] : []),
      r.date,
      r.course,
      r.tee,
      r.type ? TYPE_LABEL[r.type] : null,
      r.holes,
      r.score,
      r.toPar,
      r.out,
      r.inn,
      r.putts,
      r.fairways?.hit,
      r.fairways?.of,
      r.greens?.hit,
      r.greens?.of,
      inAverages(r),
      ...Array.from({ length: HOLES }, (_, i) => at(i + 1)?.score),
      ...Array.from({ length: HOLES }, (_, i) => at(i + 1)?.par),
    ];
  });
  return { name: chCsvName(...input.name), head, rows };
}

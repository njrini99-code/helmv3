import { chCsvName, csvRound, type ChCsvFile, type ChCsvValue } from '../../lib/csv';
import { STATE_LABEL, type ChQBoard, type ChQRow } from './model';

/**
 * Launch readiness F-02: a qualifier's standings as one spreadsheet, in the board's order (`buildBoard`, the rule the page
 * states). One row a player: place ("T3" for a tie), name, class, each round's gross score, total, to par, the rounds in,
 * the 18-hole average, and where they stand (Qualifying, Bubble, Selected, Coach’s pick, Tie at cut, Missed a round).
 * Entrants with no round in follow, with no place.
 */
export function standingsCsv(input: {
  name: string;
  board: Pick<ChQBoard, 'rows' | 'unscored'>;
  numRounds: number;
  /** The day it is exported, for the file name. */ day: string;
}): ChCsvFile {
  const rounds = Math.max(input.numRounds, ...input.board.rows.flatMap((r) => r.rounds.map((x) => x.number)), 1);
  const head = ['Place', 'Player', 'Class', ...Array.from({ length: rounds }, (_, i) => `R${i + 1}`), 'Total', 'To par', 'Rounds', 'Average', 'Standing'];
  const row = (r: ChQRow, placed: boolean): ChCsvValue[] => [
    placed && r.position != null ? `${r.tied ? 'T' : ''}${r.position}` : null,
    r.name,
    r.classYear,
    ...Array.from({ length: rounds }, (_, i) => r.rounds.find((x) => x.number === i + 1)?.total ?? null),
    r.total,
    r.toPar,
    r.played,
    csvRound(r.avg, 1),
    r.missed ? 'Missed a round' : r.state ? STATE_LABEL[r.state].label : null,
  ];
  return {
    name: chCsvName(input.name, 'standings', input.day),
    head,
    rows: [...input.board.rows.map((r) => row(r, true)), ...input.board.unscored.map((r) => row(r, false))],
  };
}

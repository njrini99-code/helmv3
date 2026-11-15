import { chCsvName, csvPlace, type ChCsvFile, type ChCsvValue } from '../../lib/csv';
import { plural } from '../../lib/plural';
import { deskRows } from './desk-model';
import type { ChTourDeskData, ChTourFieldTeam, ChTourPlayerRound } from './types';

/**
 * Launch readiness F-02: an event's results as one spreadsheet, from the desk's own figures (nothing is recomputed here).
 * One table, so it sorts and filters as one: the teams first, in the order they finished (the field as entered or
 * imported; with no field, our team alone, from the scores our players' cards make), then our players in the desk's
 * order (lineup by slot, alternates, individuals). A round's cell is the strokes, or why there are none (WD, DQ); a
 * player's to par is the sum over the rounds they finished.
 */

const ROLE: Record<'lineup' | 'alternate' | 'individual', string> = { lineup: 'Lineup', alternate: 'Alternate', individual: 'Individual' };

function cell(pr: ChTourPlayerRound | null): ChCsvValue {
  if (!pr) return null;
  if (pr.status === 'wd') return 'WD';
  if (pr.status === 'dq') return 'DQ';
  if (pr.status === 'dq_pending') return 'DQ pending';
  return pr.total;
}

const placeOrder = (a: ChTourFieldTeam, b: ChTourFieldTeam) =>
  (a.placeN ?? Number.POSITIVE_INFINITY) - (b.placeN ?? Number.POSITIVE_INFINITY) ||
  (a.total ?? Number.POSITIVE_INFINITY) - (b.total ?? Number.POSITIVE_INFINITY) ||
  a.name.localeCompare(b.name);

export function resultsCsv(data: Pick<ChTourDeskData, 'event' | 'players' | 'teamName'>, day: string): ChCsvFile {
  const e = data.event;
  const n = e.rounds.length;
  const us = data.teamName?.trim() || e.field?.teams.find((t) => t.us)?.name || 'Our team';
  const head = ['Row', 'Place', 'Name', 'Team', 'Role', ...e.rounds.map((r) => `R${r.number}`), 'Total', 'To par', 'Rounds counted'];

  const teams: ChCsvValue[][] = e.field?.teams.length
    ? [...e.field.teams]
        .sort(placeOrder)
        .map((t) => [
          'Team',
          csvPlace(t.place),
          t.squad === 'B' ? `${t.name} B` : t.name,
          null,
          null,
          ...Array.from({ length: n }, (_, i) => t.rounds[i] ?? null),
          t.total,
          t.toPar,
          null,
        ])
    : e.team.result
      ? [
          [
            'Team',
            csvPlace(e.finish?.place),
            us,
            null,
            null,
            ...e.rounds.map((r) => e.team.rounds.find((x) => x.roundNumber === r.number)?.total ?? null),
            e.team.result.total,
            e.team.result.toPar,
            null,
          ],
        ]
      : [];

  const players = deskRows(e, data.players).map((row): ChCsvValue[] => {
    const done = row.cells.filter((c): c is ChTourPlayerRound => c != null && c.status === 'ok' && c.total != null);
    const toPar = done.length && done.every((c) => c.toPar != null) ? done.reduce((s, c) => s + (c.toPar ?? 0), 0) : null;
    return [
      'Player',
      null,
      row.player?.name ?? 'Unnamed player',
      row.entry.squad === 'B' ? `${us} B` : us,
      ROLE[row.entry.role],
      ...row.cells.map(cell),
      row.total,
      toPar,
      row.individual || row.alternate ? null : `${row.counted} of ${row.played}`,
    ];
  });

  return { name: chCsvName(e.name, 'results', day), head, rows: [...teams, ...players] };
}

/** What a results file holds, for its toast: "12 teams, 5 players". */
export function resultsCount(f: Pick<ChCsvFile, 'rows'>): string {
  const teams = f.rows.filter((r) => r[0] === 'Team').length;
  const players = f.rows.length - teams;
  return [teams ? plural(teams, 'team') : null, players ? plural(players, 'player') : null].filter(Boolean).join(', ');
}

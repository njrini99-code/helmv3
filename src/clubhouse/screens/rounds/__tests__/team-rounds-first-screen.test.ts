import { describe, expect, it } from 'vitest';
import type { ChTeamRound } from '../../../data/team-rounds-shape';
import { FIRST_SCREEN_ROWS, firstScreenRows } from '../TeamRounds';

/**
 * F-23 (verify after merge, 2026-11-19): the phone's switch to Rounds draws only its first screen of rows in the switch's
 * frame, in order and in whole groups up to the cut; the rest follow a frame later (useArrivalPainted).
 */
const round = (id: string): ChTeamRound => ({ id }) as unknown as ChTeamRound;
const group = (key: string, n: number) => ({ key, rounds: Array.from({ length: n }, (_, i) => round(`${key}-${i}`)) });

describe('firstScreenRows', () => {
  it('cuts the shown rows to the first screen, across groups, in order', () => {
    const a = group('nov', 6);
    const b = group('oct', 8);
    const c = group('sep', 5);
    const shown = [a, b, c].map((g) => ({ group: g, rows: g.rounds }));
    const cut = firstScreenRows(shown);
    expect(cut.map((s) => s.group.key)).toEqual(['nov', 'oct']);
    expect(cut.flatMap((s) => s.rows).length).toBe(FIRST_SCREEN_ROWS);
    expect(cut[1]!.rows.map((r) => r.id)).toEqual(['oct-0', 'oct-1', 'oct-2', 'oct-3']);
    // A group cut short is still the whole group, so its heading keeps its count and average.
    expect(cut[1]!.group).toBe(b);
  });

  it('keeps a list shorter than a screen whole', () => {
    const a = group('nov', 3);
    const shown = [{ group: a, rows: a.rounds }];
    expect(firstScreenRows(shown)).toEqual(shown);
  });

  it('cuts from the rows already shown, not from the whole group', () => {
    const a = group('nov', 30);
    const shown = [{ group: a, rows: a.rounds.slice(0, 4) }];
    expect(firstScreenRows(shown)[0]!.rows).toHaveLength(4);
  });
});

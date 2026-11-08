import { describe, expect, it } from 'vitest';
import { auditNumericClaims, collectEnvelopeNumbers, type ToolEnvelope } from '../provenance';

// Staging 2026-11-08 (6da3a6b2): "Cole three-putted 10 times in his last five rounds, and 8 of those came in two rounds on Oct 21".
// Those two rounds had 3 + 3 = 6. An 8 exists in the reads (pars, fairways hit, one-putts), and small integers are not audited, so it passed.

const COLE = 'p-cole';
const roster = [{ id: COLE, name: 'Cole Bennett' }, { id: 'p-ethan', name: 'Ethan Park' }];
const round = (date: string, score: number, putts: number, three_putts: number, extra: Record<string, number> = {}) => ({ date, total_score: score, putts, three_putts, holes: 18, ...extra });
const rounds = {
  summary: "Cole Bennett's last 5 recorded rounds.", measurements: [], series: [], coverage: 'complete', coverage_note: null, as_of: '2026-11-08T00:00:00.000Z',
  detail: { player: { name: 'Cole Bennett', player_id: COLE }, rounds: [round('2026-10-21', 73, 30, 0, { pars: 7, fairways_hit: 8 }), round('2026-10-21', 77, 37, 3, { one_putts: 8 }), round('2026-10-21', 74, 37, 3), round('2026-10-06', 82, 31, 2), round('2026-09-30', 75, 30, 2)] },
} as unknown as ToolEnvelope;
const sums = { summary: '2 figures worked out from 5 rows.', measurements: [], series: [], coverage: 'complete', coverage_note: null, as_of: '2026-11-08T00:00:00.000Z', detail: { kind: 'summary', rows_used: 5, results: [{ id: 'summary:tp', op: 'sum', field: 'three_putts', results: [{ rows: 5, value: 10 }] }, { id: 'summary:pt', op: 'sum', field: 'putts', results: [{ rows: 5, value: 165 }] }] } } as unknown as ToolEnvelope;

const audit = (text: string, cited: string[] = []) => auditNumericClaims(text, [], [], [rounds, sums].flatMap(collectEnvelopeNumbers), ['2026-10-21', '2026-10-06', '2026-09-30'], 'America/New_York', { players: roster, citedValues: cited }).map((c) => c.text);

describe('a count of some of the things just talked about is a derived figure', () => {
  const lead = 'Cole three-putted 10 times in his last five rounds, and ';
  it('"8 of those" is not grounded by an 8 that counts something else', () => {
    expect(audit(`${lead}8 of those came in two rounds on Oct 21. He took 165 putts over the five rounds.`)).toEqual(['8']);
  });
  it('the true count, 6, is not in the reads either, so it needs a summarise_data result and a cite', () => {
    expect(audit(`${lead}6 of those came in two rounds on Oct 21.`)).toEqual(['6']);
    expect(audit(`${lead}6 of those came in two rounds on Oct 21.`, ['6'])).toEqual([]);
  });
  it('the totals, the per-row figures and a count of rounds are unaffected', () => {
    expect(audit('Cole took 165 putts over the five rounds and three-putted 10 times. Oct 21: 77 (37 putts, 3 three-putts); Oct 6: 82 (31 putts, 2 three-putts).')).toEqual([]);
    expect(audit('Only 8 of those rounds have a full stat line, and 3 of those holes were par fives.')).toEqual([]);
    expect(audit('Cole three-putted 3 times in each of two rounds.')).toEqual([]);
  });
  it('a subset count that matches a figure of the metric it counts is grounded', () => {
    expect(audit('Cole three-putted 10 times. 3 of those came in one round.')).toEqual([]);
  });
});

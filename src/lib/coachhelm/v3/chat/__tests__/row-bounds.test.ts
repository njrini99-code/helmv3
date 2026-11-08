import { describe, expect, it } from 'vitest';
import { auditRowBounds, roundSets } from '../row-bounds';
import { auditCountClaims, statedCounts } from '../count-claims';
import { collectEnvelopeDates, collectEnvelopeNumbers, type ToolEnvelope } from '../provenance';
import { computeTurnVerdict } from '../verdict';

// Staging 21a4a215, "Cole's last 5 rounds with putts and three-putts": the answer said "The other 5 rounds had 30 putts or fewer, with 0 to 2
// three-putts". Two of the five had 37 putts and 3 three-putts, so three were left, and one of those had 31 putts. It was accepted because 5 is
// the size of the window and 30 is a value in the read.
const rounds = [
  { round_id: 'a', date: '2026-10-21', total_score: 73, putts: 30, three_putts: 0 },
  { round_id: 'b', date: '2026-10-21', total_score: 77, putts: 37, three_putts: 3 },
  { round_id: 'c', date: '2026-10-21', total_score: 74, putts: 37, three_putts: 3 },
  { round_id: 'd', date: '2026-10-06', total_score: 82, putts: 31, three_putts: 2 },
  { round_id: 'e', date: '2026-09-30', total_score: 75, putts: 30, three_putts: 2 },
];
const roster = [{ id: 'p-cole', name: 'Cole Bennett' }, { id: 'p-owen', name: 'Owen Carter' }];
const envelope = (detail: unknown, summary = 'x') => ({ summary, measurements: [], series: [], coverage: 'complete', coverage_note: null, as_of: '2026-11-08T00:00:00.000Z', detail }) as unknown as ToolEnvelope;
const read = envelope({ player: 'Cole Bennett', rounds });
const teamRows = envelope({ kind: 'team_data', noun: 'rounds', row_count: 5, rows: rounds.map((r) => ({ player: 'Cole Bennett', round_date: r.date, total_putts: r.putts, three_putts: r.three_putts, total_score: r.total_score })) });
const evidence = new Map<string, ToolEnvelope>([['e1', read], ['e2', teamRows]]);

const verdict = (text: string) =>
  computeTurnVerdict({ streamComplete: true, text, measurements: [], series: [], detailNumbers: [...collectEnvelopeNumbers(read), ...collectEnvelopeNumbers(teamRows)], detailDates: collectEnvelopeDates(read, 'America/New_York'), timezone: 'America/New_York', players: roster, cites: { cites: [], evidence } });
const flagged = (text: string) => { const v = verdict(text); return v.outcome === 'rejected' ? v.unsupported.map((u) => u.text) : []; };

describe('"the other N" is the group less the ones named', () => {
  const stated = new Set([5, 3, 2, 124, 10]);
  it('the live wrong accept: two of five named, "the other 5"', () => {
    const text = 'Two of the three tournament rounds on Oct 21 had 37 putts and 3 three-putts each. The other 5 rounds had many fewer.';
    expect(auditCountClaims(text, stated, []).map((u) => u.text)).toEqual(['5']);
  });
  it('the right complement passes: five less the two named is three', () => {
    expect(auditCountClaims('Two of his five rounds had 37 putts each. The other three rounds had 31 putts or fewer.', stated, [])).toEqual([]);
  });
  it('one named item takes one off the group: "his best round, the other 4"', () => {
    expect(auditCountClaims('His best round was the 73. The other 4 rounds were above 74.', new Set([5]), [])).toEqual([]);
    expect(auditCountClaims('His best round was the 73. The other 5 rounds were above 74.', new Set([5]), [])).toHaveLength(1);
  });
  it('a verified cite for the figure stands for it', () => {
    expect(auditCountClaims('Two of the five had 37 putts. The other 5 rounds were fine.', stated, ['5'])).toEqual([]);
  });
  it('a date, a decimal or a window is not a subset', () => {
    expect(auditCountClaims('On Oct 2 he had 3.5 putts per hole over his last 2 rounds. The other 5 rounds were fine.', new Set([5, 7]), [])).toHaveLength(1);
  });
  it('a sum that is only the roster does not pass: 5 + 3 = 8 players is not a group of 8 rounds', () => {
    const text = 'Three of the five rounds had 37 putts. The other 5 rounds had 31 putts or fewer.';
    expect(auditCountClaims(text, new Set([3, 5, 8]), [], 8).map((u) => u.text)).toEqual(['5']);
    expect(auditCountClaims(text, new Set([3, 5, 8]), [], 0)).toEqual([]);
  });
  it('through the verdict: the full live answer is withheld', () => {
    const text = 'Two of the three tournament rounds on Oct 21 had 37 putts and 3 three-putts each. The other 5 rounds had 31 putts or fewer.';
    expect(flagged(text)).toContain('5');
  });
});

describe('bounds over a set of rounds', () => {
  it('reads the rounds of both shapes', () => {
    expect(roundSets([read, teamRows]).map((s) => s.length)).toEqual([5, 5]);
  });
  it('the live answer: "the other 5 rounds had 30 putts or fewer, with 0 to 2 three-putts" is flagged on both bounds', () => {
    const out = auditRowBounds('The other 5 rounds had 30 putts or fewer, with 0 to 2 three-putts.', roundSets([read]));
    expect(out.map((u) => u.text)).toEqual(['30', '0 to 2']);
  });
  it('the true version passes: three rounds have 31 putts or fewer, and three have 0 to 2 three-putts', () => {
    expect(auditRowBounds('The other 3 rounds had 31 putts or fewer, with 0 to 2 three-putts.', roundSets([read]))).toEqual([]);
  });
  it('three rounds at 30 putts or fewer is false: only two are', () => {
    expect(auditRowBounds('The other 3 rounds had 30 putts or fewer.', roundSets([read])).map((u) => u.text)).toEqual(['30']);
    expect(auditRowBounds('The other 2 rounds had 30 putts or fewer.', roundSets([read]))).toEqual([]);
  });
  it('"all rounds under 80" needs every row; "all rounds under 83" holds', () => {
    expect(auditRowBounds('All rounds were under 80.', roundSets([read])).map((u) => u.text)).toEqual(['80']);
    expect(auditRowBounds('All rounds were under 83.', roundSets([read]))).toEqual([]);
    expect(auditRowBounds('Every round was under 82.', roundSets([read])).map((u) => u.text)).toEqual(['82']);
  });
  it('under and at-most differ at the bound', () => {
    expect(auditRowBounds('Every round had at most 37 putts.', roundSets([read]))).toEqual([]);
    expect(auditRowBounds('Every round had fewer than 37 putts.', roundSets([read])).map((u) => u.text)).toEqual(['37']);
  });
  it('a set with a word inside it, or two sets in a sentence, is left alone', () => {
    expect(auditRowBounds('All his tournament rounds were under 70.', roundSets([read]))).toEqual([]);
    expect(auditRowBounds('All rounds were under 70, and the other 2 rounds were over 90.', roundSets([read]))).toEqual([]);
  });
  it('a bound with no metric beside it, or on a field the rows lack, abstains', () => {
    expect(auditRowBounds('All rounds were within 3 of each other.', roundSets([read]))).toEqual([]);
    expect(auditRowBounds('All rounds had 60% or more of greens.', roundSets([read]))).toEqual([]);
  });
  it('no rounds read, nothing to check', () => {
    expect(auditRowBounds('All rounds were under 70.', [])).toEqual([]);
  });
  it('a read of other things (a list of players) is not a set of rounds', () => {
    expect(roundSets([envelope({ players: [{ name: 'A', score: 1 }, { name: 'B', score: 2 }] })])).toEqual([]);
  });
  it('through the verdict', () => {
    expect(flagged('All five rounds were under 80.')).toContain('80');
    expect(flagged('All five rounds were under 83.')).toEqual([]);
    expect(flagged('The other 3 rounds had 31 putts or fewer, with 0 to 2 three-putts.')).toEqual([]);
  });
});

describe('the staging answer', () => {
  it('statedCounts holds the window but "the other 5" is still not one of the answers it can stand for', () => {
    expect(statedCounts([read, teamRows], roster).has(5)).toBe(true);
  });
});

// Live Q4 (ask-perf): "Audit Testplayer has no recorded rounds. Six other players have rounds but no season strokes gained, so only one player's figures are in the season read."
// Eight on the roster, less Cole (the one in the read) and Audit, is six. It is true; "Seven other players" is not.
describe('"N other players" is the roster less the players named so far', () => {
  const roster8 = ['Cole Bennett', 'Owen Carter', 'Ethan Park', 'Mason Rivers', 'Dylan Brooks', 'Tyler Hayes', 'Jackson Hale', 'Audit Testplayer'].map((name, i) => ({ id: `p${i}`, name }));
  const text = (n: string) => `All 11 rounds were played by Cole Bennett. Audit Testplayer has no rounds at all. ${n} other players have rounds but no season figures.`;
  it('six passes, seven does not', () => {
    expect(auditCountClaims(text('Six'), new Set([8, 11]), [], 8, roster8)).toEqual([]);
    expect(auditCountClaims(text('Seven'), new Set([8, 11]), [], 8, roster8).map((u) => u.text)).toEqual(['Seven']);
  });
  it('with nobody named before it, it is still a count a read has to state', () => {
    expect(auditCountClaims('Six other players have rounds.', new Set([8]), [], 8, roster8).map((u) => u.text)).toEqual(['Six']);
  });
});

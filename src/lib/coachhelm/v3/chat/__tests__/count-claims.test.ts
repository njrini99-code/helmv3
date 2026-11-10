import { describe, expect, it } from 'vitest';
import { auditCountClaims, statedCounts } from '../count-claims';
import { collectEnvelopeDates, collectEnvelopeNumbers, type ToolEnvelope } from '../provenance';
import { computeTurnVerdict } from '../verdict';

// Staging 9c9c279d, the three-putt question, one round_lines read of 26 rows, no summarise: "The 12 qualifier rounds on September 25 and 26 have
// no putt total" (the read had 14) and "Four Pebble Beach practice rounds on Oct 2, Oct 8 and Oct 25" (it had 3). Mental tallies of rows, and the
// audit skipped every integer up to 12. Counts of three or more of a counted thing are figures now, in a coach turn that carries citations.
const roster = [{ id: 'p-cole', name: 'Cole Bennett' }, { id: 'p-owen', name: 'Owen Carter' }];
const line = (i: number, type: string, course: string, date: string) => ({ round_id: `r${String.fromCharCode(97 + i)}`, player: 'Cole Bennett', round_type: type, course_name: course, round_date: date, total_putts: null });
const rows = [
  ...Array.from({ length: 14 }, (_, i) => line(i, 'qualifier', 'Springfield', i < 7 ? '2026-09-25' : '2026-09-26')),
  ...Array.from({ length: 3 }, (_, i) => line(14 + i, 'practice', 'Pebble Beach', ['2026-10-02', '2026-10-08', '2026-10-25'][i]!)),
  ...Array.from({ length: 9 }, (_, i) => line(17 + i, 'tournament', ['Oakmont', 'Bryan', 'Starmount'][i % 3]!, '2026-10-21')),
];
const read = { summary: '26 rows.', measurements: [], series: [], coverage: 'complete', coverage_note: null, as_of: '2026-11-08T00:00:00.000Z', detail: { kind: 'team_data', rows, row_count: 26 } } as unknown as ToolEnvelope;
const evidence = new Map<string, ToolEnvelope>([['e1', read]]);

const verdict = (text: string, cites: Array<{ v: string; ref: string; key: string; subject: string }> = []) =>
  computeTurnVerdict({ streamComplete: true, text, measurements: [], series: [], detailNumbers: collectEnvelopeNumbers(read), detailDates: collectEnvelopeDates(read, 'America/New_York'), timezone: 'America/New_York', players: roster, cites: { cites, evidence } });
const flagged = (text: string) => { const v = verdict(text); return v.outcome === 'rejected' ? v.unsupported.map((u) => u.text) : []; };

describe('counts of things', () => {
  it('the two mental tallies are withheld: 12 where the read has 14, Four where it has 3', () => {
    expect(flagged('The 12 qualifier rounds on September 25 and 26 have no putt total.')).toContain('12');
    expect(flagged('Four Pebble Beach practice rounds on Oct 2, Oct 8 and Oct 25 have none either.')).toContain('Four');
  });
  it('the true counts a read states pass: the rows, a status count, a list length', () => {
    expect(flagged('There are 26 rounds in the read.')).toEqual([]);
    expect(flagged('The 14 qualifier rounds on September 25 and 26 have no putt total.')).toEqual([]);
    expect(flagged('Nine tournament rounds are on Oct 21.')).toEqual([]);
    expect(flagged('Three Pebble Beach practice rounds on Oct 2, Oct 8 and Oct 25 have none.')).toEqual([]);
  });
  it('a verified cite stands for a count the server worked out', () => {
    const summary = { summary: '1 figure worked out from 26 rows.', measurements: [{ metric_id: 'summary:n', metric_label: 'Rows', unit: 'count', value: 5, entity: { kind: 'team', id: 't', label: 'T' }, window_start: null, window_end: null, sample_size: 5, sample_unit: 'rounds', as_of: '2026-11-08T00:00:00.000Z', coverage: 'complete', coverage_note: null, source: 'summarised reads', method: 'summary_count', denominator: null, benchmark: null, direction: null }], series: [], coverage: 'complete', coverage_note: null, as_of: '2026-11-08T00:00:00.000Z' } as unknown as ToolEnvelope;
    const measurements = summary.measurements;
    const both = new Map<string, ToolEnvelope>([['e1', read], ['e2', summary]]);
    const v = computeTurnVerdict({ streamComplete: true, text: 'Five rounds were played in the rain.', measurements, series: [], detailNumbers: [], detailDates: [], timezone: 'America/New_York', players: roster, cites: { cites: [{ v: '5', ref: 'e2', key: 'summary:n', subject: 'team' }], evidence: both } });
    expect(v.outcome).toBe('accepted');
  });
  it('windows, positions and small counts are not tallies', () => {
    expect(auditCountClaims('His last 5 rounds and the next 4 events; the top 5 players; over 6 rounds; in 2 rounds; one round.', new Set(), [])).toEqual([]);
    expect(auditCountClaims('He shot 3 under par rounds on average.', new Set(), [])).toEqual([]);
  });
  it('without citations (an old turn, a replay) nothing changes', () => {
    const v = computeTurnVerdict({ streamComplete: true, text: 'The 12 qualifier rounds have no putt total.', measurements: [], series: [], detailNumbers: collectEnvelopeNumbers(read), detailDates: [], timezone: 'America/New_York', players: roster });
    expect(v.outcome).toBe('accepted');
  });
  it('stated counts include the roster, a read’s measured players and its summary', () => {
    const s = statedCounts([read], roster);
    expect([2, 26, 14, 3, 9].every((n) => s.has(n))).toBe(true);
    expect(s.has(12)).toBe(false);
    expect(s.has(4)).toBe(false);
  });
});

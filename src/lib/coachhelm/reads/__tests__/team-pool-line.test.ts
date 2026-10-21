import { describe, expect, it } from 'vitest';
import type { ComparisonLine, InsightEvidence } from '@/lib/coachhelm/v2/insights/types';
import { teamPoolLine } from '../team-pool-line';

// Synthetic values only.
const line = (over: Partial<ComparisonLine> = {}): ComparisonLine => ({
  source: 'team_pool',
  label: 'Team pool',
  value: 72,
  n: 240,
  unit: 'percent',
  n_unit: 'putts',
  n_noun: 'putts',
  players: 6,
  ...over,
});
const ev = (primary: ComparisonLine | undefined): Pick<InsightEvidence, 'comparison'> =>
  primary ? { comparison: { primary, lines: [primary] } } : {};

describe('teamPoolLine', () => {
  it('says the pooled number and its count, the way the design writes it', () => {
    expect(teamPoolLine(ev(line()))).toBe('Team pool 72% (240 putts)');
    expect(teamPoolLine(ev(line({ value: 3.32, n: 1296, n_unit: 'holes', n_noun: 'putted holes' })))).toBe('Team pool 3.3% (1,296 putted holes)');
    expect(teamPoolLine(ev(line({ value: 4.31, unit: 'strokes', n: 1080, n_unit: 'holes', n_noun: 'holes' })))).toBe('Team pool 4.31 (1,080 holes)');
    expect(teamPoolLine(ev(line({ value: 0.6, unit: 'count', n: 212, n_unit: 'rounds', n_noun: 'rounds' })))).toBe('Team pool 0.6 a round (212 rounds)');
  });

  it('is null with no team line: flag-off rows, a Tour primary, or a line with no count', () => {
    expect(teamPoolLine(ev(undefined))).toBeNull();
    expect(teamPoolLine(null)).toBeNull();
    expect(teamPoolLine(ev(line({ source: 'tour', n: null })))).toBeNull();
    expect(teamPoolLine(ev(line({ n: 0 })))).toBeNull();
    expect(teamPoolLine(ev(line({ value: Number.NaN })))).toBeNull();
  });

  it("leaves a Slice 5a angle's own team_pool median to its own words", () => {
    const angle = { source: 'team_pool', label: "Teammates' median fairways hit %", value: 62, n: 6 } as unknown as ComparisonLine;
    expect(teamPoolLine(ev(angle))).toBeNull();
    expect(teamPoolLine(ev(line({ players: undefined })))).toBeNull();
  });

  it('never carries a teammate: one number, one count', () => {
    const text = teamPoolLine(ev(line())) ?? '';
    expect(text.match(/\d[\d,.]*/g)).toEqual(['72', '240']);
  });
});

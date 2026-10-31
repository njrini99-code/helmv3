import { describe, expect, it } from 'vitest';
import { PuttDistanceGenerator } from '../putt-distance';

// F-0070: the putting read gives the rate once, its likely range once and the Tour figure once.
const agg = (over: Partial<{ playerValue: number; cohort_gender: 'mens' | 'womens' }> = {}) => ({
  sampleN: 40,
  playerValue: over.playerValue ?? 35,
  bucket: '5_10ft' as const,
  rawValue: (over.playerValue ?? 35) / 100,
  rounds_played: 8,
  cohort_gender: over.cohort_gender ?? ('mens' as const),
  attempts: 40,
  spanDays: 30,
  last_round_date: '2026-10-20',
  attempts_per_round: 5,
  strokes_impact: 0,
});
const count = (s: string, sub: string) => s.split(sub).length - 1;

describe('putt-distance copy (F-0070)', () => {
  it('says the Tour figure once, as a whole number, with no "~" and no "95% range"', () => {
    const c = new PuttDistanceGenerator('p1', '5_10ft').composeContent(agg());
    expect(count(c.content, '62')).toBe(1);
    expect(c.content).toContain('PGA Tour players make 62%.');
    expect(c.content).not.toContain('95% range');
    expect(c.content).not.toContain('~');
    expect(count(c.content, '35%')).toBe(1);
    expect(c.content).toMatch(/\(30 days, 40 attempts, likely \d+–\d+%\)\. PGA/);
    expect(c.evidence.comparison_value).toBe(62.2);
  });
  it('the coach copy carries the same numbers in the third person', () => {
    const c = new PuttDistanceGenerator('p1', '5_10ft').composeContent(agg());
    const coach = (c as { coach?: { content: string } }).coach?.content ?? '';
    expect(coach).toMatch(/^The player makes 35% of putts from/);
    expect(count(coach, '62')).toBe(1);
  });
  it('a women’s team reads the LPGA figure', () => {
    const c = new PuttDistanceGenerator('p1', '5_10ft').composeContent(agg({ cohort_gender: 'womens' }));
    expect(c.content).toMatch(/LPGA Tour players make \d+%\./);
  });
});

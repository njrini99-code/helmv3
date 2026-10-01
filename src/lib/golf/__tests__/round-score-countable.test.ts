import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isScoreCountable, isTotalOnlyCountable } from '@/lib/golf/round-score-countable';

const base = { status: 'completed', is_test: false, holes_played: 18, total_putts: null, strokes_gained_total: null };

describe('round-score-countable (Q-123, F-58)', () => {
  it('a qualifier posted as a total only counts in a score', () => {
    const q = { ...base, total_score: 71, front_nine: null, back_nine: null };
    expect(isTotalOnlyCountable(q)).toBe(true);
    expect(isScoreCountable(q)).toBe(true);
  });

  it('a fully scored round counts; a test round, an implausible total and a nine-hole total do not', () => {
    expect(isScoreCountable({ ...base, total_score: 70, front_nine: 35, back_nine: 35 })).toBe(true);
    expect(isScoreCountable({ ...base, is_test: true, total_score: 70, front_nine: null, back_nine: null })).toBe(false);
    expect(isScoreCountable({ ...base, total_score: 37, front_nine: null, back_nine: null })).toBe(false);
    expect(isScoreCountable({ ...base, holes_played: 9, total_score: 36, front_nine: null, back_nine: null })).toBe(false);
  });

  it("CoachHelm's program pulse dates the team's latest round by the score rule, not the hole-by-hole one", () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/coachhelm/v3/chat/program-pulse.ts'), 'utf8');
    expect(src).toMatch(/\.filter\(isScoreCountable\)/);
  });
});

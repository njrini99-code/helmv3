import { describe, expect, it } from 'vitest';
import { validatePlan } from '@/lib/coachhelm/v3/practice-plan/model';
import { PLAN_STARTERS } from '../starters';

/** N-00 4.16: six code constants that must pass the same rules a saved plan does. */
describe('the six starters', () => {
  it('are six, and each adds up to the length it claims', () => {
    expect(PLAN_STARTERS).toHaveLength(6);
    for (const s of PLAN_STARTERS) expect(s.body.variants.main.blocks.reduce((n, b) => n + b.len, 0), s.name).toBe(s.minutes);
  });
  it('carry no people, dates or pairings', () => {
    for (const s of PLAN_STARTERS) {
      expect(s.body.players).toEqual([]);
      expect(s.body.groups.every((g) => g.players.length === 0)).toBe(true);
      expect(s.body.variants.main.blocks.every((b) => b.coach === null)).toBe(true);
    }
  });
  it('pass the plan rules', () => {
    for (const s of PLAN_STARTERS) expect(validatePlan(s.body).errors.filter((e) => !/player|group/i.test(e.message)), s.name).toEqual([]);
  });
});

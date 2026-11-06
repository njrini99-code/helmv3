import { describe, expect, it } from 'vitest';
import { PP_COACHES, PP_NAMES, PP_PLAN_PART } from '../../../../preview/fixtures-practice-plan';
import { toSheetModel } from '../sheet/plan-sheet-model';

const input = { body: PP_PLAN_PART.draft.body, why: PP_PLAN_PART.draft.why, title: PP_PLAN_PART.title, team: 'Demo University Golf', start: new Date('2026-11-05T19:00:00Z'), end: new Date('2026-11-05T22:00:00Z'), zone: 'America/New_York', coaches: PP_COACHES, names: PP_NAMES, state: 'Draft' };

describe('plan sheet model', () => {
  it('a player model holds no why, aim or read figure', () => {
    const text = JSON.stringify(toSheetModel(input, 'player'));
    expect(text).not.toMatch(/"why"|aim|because|0\.9/i);
  });
  it('a coach model carries the Because, and none for a routine or lean block', () => {
    const rows = toSheetModel(input, 'coach').rows;
    expect(rows.find((r) => r.id === 'rot')?.why).toContain('0.9');
    expect(rows.find((r) => r.id === 'warm')?.why).toBeUndefined();
    expect(rows.find((r) => r.id === 'holes')?.why).toBeUndefined();
  });
  it('starts blocks on the clock in the team zone', () => {
    const rows = toSheetModel(input, 'coach').rows;
    expect(rows[0]!.start).toBe('2:00');
    expect(rows[1]!.start).toBe('2:30');
  });
  it('draws the rotation as the design does', () => {
    const rot = toSheetModel(input, 'coach').rows[1]!.rotation!;
    expect(rot.rows.map((r) => r.cells)).toEqual([['A', 'C', 'B'], ['B', 'A', 'C'], ['C', 'B', 'A']]);
  });
});

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PlanBodyV2 } from '@/lib/coachhelm/v3/practice-plan/model';
import { PP_COACHES, PP_NAMES, PP_PLAN_PART } from '../../../../preview/fixtures-practice-plan';
import { PracticePlanSheet } from '../sheet/PracticePlanSheet';
import { toSheetModel } from '../sheet/plan-sheet-model';

const body = PP_PLAN_PART.draft.body;
const groupB = body.groups[1]!;
const me = groupB.players[0]!;
const others = body.groups.filter((g) => g.id !== groupB.id).flatMap((g) => g.players.map((p) => PP_NAMES.get(p)!));
const base = { title: PP_PLAN_PART.title, team: 'Demo University Golf', start: new Date('2026-11-05T19:00:00Z'), end: new Date('2026-11-05T22:00:00Z'), zone: 'America/New_York', coaches: PP_COACHES, names: PP_NAMES, state: 'Published' };
const model = (b: PlanBodyV2 = body, viewer: string | undefined = me) => toSheetModel({ ...base, body: b }, 'player', viewer);

describe('a player’s sheet holds their own group only', () => {
  it('keeps the group’s letter from the whole plan: Group B stays B', () => {
    expect(model().groups.map((g) => g.letter)).toEqual(['B']);
    expect(model().groups[0]!.names).toEqual(groupB.players.map((p) => PP_NAMES.get(p)));
  });

  it('has no other group’s names or letters in the payload', () => {
    const text = JSON.stringify(model());
    for (const name of others) expect(text).not.toContain(name);
    expect(text).not.toMatch(/"letter":"[AC]"/);
    expect(text).not.toMatch(/"cells":\[[^\]]*"[AC]"/);
  });

  it('has no other group’s names or letters in the DOM, not hidden but absent', () => {
    const html = renderToStaticMarkup(<PracticePlanSheet plan={model()} />);
    for (const name of others) expect(html).not.toContain(name);
    expect(html).not.toMatch(/g-[AC]\b/);
    expect(html).toMatch(/g-B\b/);
    expect(html).not.toMatch(/(?<!aria-)hidden|display:\s*none/);
  });

  it('draws the rotation as this group’s path: the coach grid is A C B / B A C / C B A', () => {
    const rot = model().rows.find((r) => r.id === 'rot')!.rotation!;
    const coach = toSheetModel({ ...base, body }, 'coach').rows.find((r) => r.id === 'rot')!.rotation!;
    expect(rot.turns).toEqual(coach.turns);
    expect(rot.rows.map((r) => r.place).sort()).toEqual(coach.rows.map((r) => r.place).sort());
    coach.rows.forEach((row) => {
      const mine = rot.rows.find((r) => r.place === row.place)!;
      expect(mine.cells).toEqual(row.cells.map((c) => (c === 'B' ? 'B' : '')));
    });
  });

  it('leaves out a station this group never goes to, and a block it sits out', () => {
    const stationsBlock = body.variants.main.blocks.find((b) => b.id === 'rot')!;
    const twoOnly: PlanBodyV2 = { ...body, variants: { rain: null, main: { blocks: [{ ...stationsBlock, grid: [['A', 'B', ''], ['B', 'A', '']] } as never] } } };
    const rot = model(twoOnly).rows[0]!.rotation!;
    expect(rot.rows).toHaveLength(2);
    expect(rot.turns).toHaveLength(2);
    const sitsOut: PlanBodyV2 = { ...body, variants: { rain: null, main: { blocks: [{ ...stationsBlock, grid: [['A', '', 'C']] } as never] } } };
    expect(model(sitsOut).rows).toEqual([]);
  });

  it('shows a course block’s own pairing only, and no row when they aren’t in one', () => {
    const [a, b] = [body.groups[0]!.players[0]!, me];
    const course = { id: 'c', kind: 'course', title: 'Holes', len: 60, coach: null, note: '', holeFrom: 1, holeTo: 6, format: 'stroke', pairings: [{ teeMin: 0, players: [a] }, { teeMin: 10, players: [b] }], qualifierId: null };
    const withCourse: PlanBodyV2 = { ...body, variants: { rain: null, main: { blocks: [course as never] } } };
    expect(model(withCourse).rows[0]!.who).toEqual([{ letter: 'B', text: 'Tee +10' }]);
    const notIn: PlanBodyV2 = { ...body, variants: { rain: null, main: { blocks: [{ ...course, pairings: [{ teeMin: 0, players: [a] }] } as never] } } };
    expect(model(notIn).rows).toEqual([]);
  });

  it('a later block’s clock is unmoved when an earlier one is left out', () => {
    const coach = toSheetModel({ ...base, body }, 'coach').rows;
    const noGroup = toSheetModel({ ...base, body }, 'player', 'not-in-a-group').rows;
    expect(noGroup.find((r) => r.id === 'finish')!.start).toBe(coach.find((r) => r.id === 'finish')!.start);
  });

  it('with no viewer or no group, shows no group part at all', () => {
    for (const m of [toSheetModel({ ...base, body }, 'player'), toSheetModel({ ...base, body }, 'player', 'not-in-a-group')]) {
      expect(m.groups).toEqual([]);
      expect(m.rows.some((r) => r.rotation)).toBe(false);
      expect(JSON.stringify(m)).not.toMatch(/"letter"/);
    }
  });

  it('leaves a coach’s sheet with every group', () => {
    expect(toSheetModel({ ...base, body }, 'coach').groups.map((g) => g.letter)).toEqual(['A', 'B', 'C']);
  });
});

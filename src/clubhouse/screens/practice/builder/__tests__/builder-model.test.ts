import { describe, expect, it } from 'vitest';
import { parsePlanBody, stationsLen, validatePlan, type PlanBodyV2, type PlanDraft, type StationsBlock } from '@/lib/coachhelm/v3/practice-plan/model';
import { addBlock, addGroup, blocksOf, copyBody, drillSlots, emptyBody, fmtMinutes, ghostsFrom, keepGhost, makeBlock, moveBlock, movePlayer, removeBlock, ribbon, setSlotDrill, splitGroups, stepLength, totalOf } from '../builder-model';

const ROSTER = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'];
const body = (): PlanBodyV2 => emptyBody('Lakeside', ROSTER, false);

describe('the builder’s plan edits', () => {
  it('a blank plan parses, and a plan with no helper starts with a Warm-up', () => {
    expect(parsePlanBody(body())).toBeTruthy();
    expect(blocksOf(body())).toEqual([]);
    expect(blocksOf(emptyBody('Lakeside', ROSTER, true)).map((b) => b.title)).toEqual(['Warm-up']);
  });

  it('every new block is what the save takes: a length in 5s from 5 to 360', () => {
    for (const kind of ['team', 'stations', 'course', 'own', 'break'] as const) {
      const b = makeBlock(kind, body());
      expect(b.len % 5, kind).toBe(0);
      expect(b.len).toBeGreaterThanOrEqual(5);
      expect(b.title.length).toBeGreaterThan(0);
    }
  });

  it('a Stations block’s length always matches its turns and stays in 5s when its turn changes', () => {
    let b = makeBlock('stations', body()) as StationsBlock;
    expect(b.len).toBe(stationsLen(b));
    b = stepLength(b, 5) as StationsBlock;
    expect(b.turnMin).toBe(25);
    expect(b.len).toBe(stationsLen(b));
    expect(b.len % 5).toBe(0);
  });

  it('length stops at 5 and 360', () => {
    const b = { ...makeBlock('team', body()), len: 5 };
    expect(stepLength(b, -5).len).toBe(5);
    expect(stepLength({ ...b, len: 360 }, 5).len).toBe(360);
  });

  it('moves and removes by id, and an impossible move changes nothing', () => {
    const a = makeBlock('team', body(), 'a');
    const c = makeBlock('break', body(), 'c');
    const plan = addBlock(addBlock(body(), a), c);
    expect(blocksOf(moveBlock(plan, 'c', -1)).map((b) => b.id)).toEqual(['c', 'a']);
    expect(moveBlock(plan, 'a', -1)).toBe(plan);
    expect(blocksOf(removeBlock(plan, 'a')).map((b) => b.id)).toEqual(['c']);
  });

  it('splits every player into lettered groups, and stations follow them', () => {
    const plan = splitGroups(addBlock(body(), makeBlock('stations', body(), 's')), 3);
    expect(plan.groups.map((g) => g.name)).toEqual(['A', 'B', 'C']);
    expect(plan.groups.flatMap((g) => g.players).sort()).toEqual(ROSTER);
    const st = blocksOf(plan)[0] as StationsBlock;
    expect(st.groupIds).toEqual(plan.groups.map((g) => g.id));
    expect(validatePlan(plan).errors).toEqual([]);
  });

  it('a player is in one group at most; taking one out of the practice leaves every group', () => {
    const plan = splitGroups(body(), 2);
    const moved = movePlayer(plan, 'p1', plan.groups[1]!.id);
    expect(moved.groups.filter((g) => g.players.includes('p1')).map((g) => g.id)).toEqual([plan.groups[1]!.id]);
    const out = movePlayer(moved, 'p1', null, true);
    expect(out.players).not.toContain('p1');
    expect(out.groups.some((g) => g.players.includes('p1'))).toBe(false);
  });

  it('adding groups stops at F', () => {
    let plan = body();
    for (let i = 0; i < 9; i += 1) plan = addGroup(plan);
    expect(plan.groups.map((g) => g.name).join('')).toBe('ABCDEF');
  });

  it('a slot is a Team block or a station; a drill lands on just that one', () => {
    const st = makeBlock('stations', body(), 's') as StationsBlock;
    const plan = addBlock(addBlock(body(), makeBlock('team', body(), 't')), st);
    expect(drillSlots(plan)).toHaveLength(1 + st.stations.length);
    const next = setSlotDrill(plan, st.stations[1]!.id, { src: 'lib', id: 'x' });
    expect((blocksOf(next)[1] as StationsBlock).stations.map((s) => s.drill?.id ?? null)).toEqual([null, 'x', null]);
  });

  it('a copy leaves own-work lines and pairings behind, and players who left', () => {
    const own = { ...makeBlock('own', body(), 'o'), lines: { p1: 'Wedges' } } as PlanBodyV2['variants']['main']['blocks'][number];
    const course = { ...makeBlock('course', body(), 'c'), pairings: [{ teeMin: 0, players: ['p1'] }] } as PlanBodyV2['variants']['main']['blocks'][number];
    const source = { ...splitGroups(addBlock(addBlock(body(), own), course), 2) };
    const copy = copyBody(source, ['p1', 'p2']);
    const [o, c] = blocksOf(copy);
    expect(o!.kind === 'own' && o!.lines).toEqual({});
    expect(c!.kind === 'course' && c!.pairings).toEqual([]);
    expect(copy.players).toEqual(['p1', 'p2']);
    expect(copy.groups.flatMap((g) => g.players).sort()).toEqual(['p1', 'p2']);
  });

  it('the ribbon says what’s planned against the practice', () => {
    expect(ribbon(0, 180)).toEqual({ used: '0 of 3 h', rest: '3 h open', over: false });
    expect(ribbon(165, 180)).toEqual({ used: '2 h 45 of 3 h', rest: '15 min open', over: false });
    expect(ribbon(180, 180).rest).toBe('On time');
    expect(ribbon(195, 180)).toEqual({ used: '3 h 15 of 3 h', rest: '15 min over', over: true });
    expect(fmtMinutes(45)).toBe('45 min');
  });
});

describe('suggestions', () => {
  const st = makeBlock('stations', { ...body(), groups: [{ id: 'g1', name: 'A', players: ['p1'], savedGroupId: null }] }, 'd2') as StationsBlock;
  const draftBody: PlanBodyV2 = { ...body(), groups: [{ id: 'g1', name: 'A', players: ['p1'], savedGroupId: null }], variants: { main: { blocks: [makeBlock('team', body(), 'd1'), st] }, rain: null } };
  const draft: PlanDraft = { body: draftBody, why: { d1: { aim: 'Warm', because: null, sources: [], lean: false, routine: true } }, version: 1 };

  it('nothing joins the plan until kept, and a suggestion can’t collide with a block the coach made', () => {
    const plan = addBlock(body(), makeBlock('team', body(), 'd1'));
    const ghosts = ghostsFrom(draft);
    expect(totalOf(plan)).toBe(30);
    const kept = keepGhost(plan, {}, ghosts[0]!, draftBody);
    expect(blocksOf(kept.body).map((b) => b.id)).toEqual(['d1', 'g-d1']);
    expect(kept.why['g-d1']?.aim).toBe('Warm');
  });

  it('keeping a rotation brings the draft’s groups, once, only when the plan has none', () => {
    const ghosts = ghostsFrom(draft);
    const kept = keepGhost(body(), {}, ghosts[1]!, draftBody);
    expect(kept.body.groups.map((g) => g.id)).toEqual(['g1']);
    const own = splitGroups(body(), 2);
    expect(keepGhost(own, {}, ghosts[1]!, draftBody).body.groups.map((g) => g.name)).toEqual(['A', 'B']);
  });
});

import { describe, expect, it } from 'vitest';
import { autoGrid, diffVersions, parsePlanBody, pathFor, splitEvenly, stationsLen, toPlayerPlan, toSaveBody, validatePlan, type PlanBodyV2, type StationsBlock } from '../model';

const body = (over: Partial<PlanBodyV2> = {}): PlanBodyV2 => ({
  v: 2,
  focus: 'Lag',
  notes: '',
  place: 'Lakeside',
  arrivalBufferMin: 15,
  bring: [],
  players: ['p1', 'p2'],
  groups: [
    { id: 'A', name: 'A', players: ['p1'], savedGroupId: null },
    { id: 'B', name: 'B', players: ['p2'], savedGroupId: null },
  ],
  variants: {
    rain: null,
    main: {
      blocks: [
        { id: 'w', kind: 'team', title: 'Warm-up', len: 30, coach: null, note: '', place: 'Range', drill: null },
        { id: 's', kind: 'stations', title: 'Rotation', len: 40, coach: null, note: '', stations: [{ id: 's1', place: 'Back', coach: null, drill: null, note: '' }, { id: 's2', place: 'Front', coach: null, drill: null, note: '' }], groupIds: ['A', 'B'], turnMin: 20, moveMin: 0, turns: 2, grid: null },
      ],
    },
  },
  ...over,
});
const start = new Date('2026-11-05T19:00:00Z');

describe('plan model', () => {
  it('rotates each group one station a turn', () => {
    expect(autoGrid({ stations: [{}, {}, {}] as never, groupIds: ['A', 'B', 'C'], turns: 3 })).toEqual([
      ['A', 'B', 'C'],
      ['C', 'A', 'B'],
      ['B', 'C', 'A'],
    ]);
  });
  it('gets a station block length from its turns and moves', () => {
    expect(stationsLen({ turns: 3, turnMin: 20, moveMin: 5 })).toBe(70);
  });
  it('rejects a body of an unknown version', () => {
    expect(parsePlanBody({ v: 3 })).toBeNull();
    expect(parsePlanBody(null)).toBeNull();
  });
  it('gives a player only their own stops, at the right times', () => {
    const stops = pathFor(body(), 'p2', start);
    expect(stops.map((s) => s.place)).toEqual(['Range', 'Front', 'Back']);
    expect(stops[1]!.start.toISOString()).toBe('2026-11-05T19:30:00.000Z');
    expect(stops[2]!.start.toISOString()).toBe('2026-11-05T19:50:00.000Z');
  });
  it('splits players evenly', () => {
    expect(splitEvenly(['a', 'b', 'c'], 2)).toEqual([['a', 'c'], ['b']]);
  });
  it('refuses a plan with no blocks and passes a sound one', () => {
    const empty = body({ variants: { main: { blocks: [] }, rain: null } });
    expect(validatePlan(empty).errors.map((e) => e.code)).toContain('CH-17116');
    expect(validatePlan(body()).errors).toEqual([]);
  });
  it('flags a station length that does not match its turns', () => {
    const b = body();
    (b.variants.main.blocks[1] as { len: number }).len = 35;
    expect(validatePlan(b).errors.some((e) => e.message.includes('length'))).toBe(true);
  });
  it('refuses a drill outside the bank', () => {
    const b = body();
    (b.variants.main.blocks[0] as { drill: unknown }).drill = { src: 'lib', id: 'nope' };
    expect(validatePlan(b, { drillIds: new Set() }).errors).toHaveLength(1);
  });
  it('warns on a player in no group', () => {
    const b = body({ players: ['p1', 'p2', 'p3'] });
    expect(validatePlan(b).warnings.map((w) => w.code)).toContain('CH-17105');
  });
  it('treats a wording change as telling nobody', () => {
    const next = body({ focus: 'Different words' });
    expect(diffVersions(body(), next, start, 'America/New_York').wordingOnly).toBe(true);
  });
  it('names who a moved station affects', () => {
    const next = body();
    next.variants.main.blocks[0]!.len = 45;
    const d = diffVersions(body(), next, start, 'America/New_York');
    expect(d.wordingOnly).toBe(false);
    expect(d.affected.sort()).toEqual(['p1', 'p2']);
  });
  it('leaves other groups and any why out of a player copy', () => {
    const copy = toPlayerPlan(body(), 'p1', start);
    expect(JSON.stringify(copy)).not.toMatch(/why|aim|because/i);
    expect(copy.group).toBe('A');
  });
});

/**
 * golf_practice_plan_save walks `lax $.blocks[*].grid[*][*]`: a null grid (the automatic one) yields a null "cell" that names no
 * group, so every Stations block on its automatic grid was refused as practice_plan_block_group (coach audit 13 Nov). A body
 * with no grid key yields no cells, and the save already allows a missing grid.
 */
describe('the body a save sends', () => {
  const stationsOf = (b: unknown) => ((b as PlanBodyV2).variants.main.blocks.find((x) => x.kind === 'stations') ?? null) as unknown as Record<string, unknown>;

  it('leaves out the grid of a Stations block on its automatic grid', () => {
    const sent = toSaveBody(body());
    expect('grid' in stationsOf(sent)).toBe(false);
  });

  it('keeps a grid the coach set, cell for cell', () => {
    const own: StationsBlock['grid'] = [['A', 'B'], ['B', '']];
    const b = body();
    const set = { ...b, variants: { ...b.variants, main: { blocks: b.variants.main.blocks.map((x) => (x.kind === 'stations' ? { ...x, grid: own } : x)) } } };
    expect(stationsOf(toSaveBody(set)).grid).toEqual(own);
  });

  it('does the same in the rain layout', () => {
    const b = body();
    const sent = toSaveBody({ ...b, variants: { main: b.variants.main, rain: { blocks: b.variants.main.blocks } } }) as PlanBodyV2;
    expect(sent.variants.rain!.blocks.some((x) => x.kind === 'stations' && 'grid' in x)).toBe(false);
  });

  it('reads back as the same plan: a missing grid is the automatic one', () => {
    expect(parsePlanBody(toSaveBody(body()))).toEqual(body());
  });

  it('changes nothing else', () => {
    const b = body();
    const sent = toSaveBody(b) as PlanBodyV2;
    expect(sent.variants.main.blocks[0]).toBe(b.variants.main.blocks[0]);
    expect(sent.groups).toBe(b.groups);
  });
});

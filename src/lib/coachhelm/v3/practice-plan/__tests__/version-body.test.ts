import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { changeLines, parsePlanBody, parseVersionBody, pathFor, toPlayerPlan, withOwnLines, type PlanBodyV2 } from '../model';

const draft: PlanBodyV2 = {
  v: 2,
  focus: 'Lag',
  notes: 'Bring water',
  place: 'Lakeside',
  arrivalBufferMin: 10,
  bring: [{ item: 'Sticks', qty: 2 }],
  players: ['p1', 'p2'],
  groups: [
    { id: 'A', name: 'A', players: ['p1'], savedGroupId: null },
    { id: 'B', name: 'B', players: ['p2'], savedGroupId: null },
  ],
  variants: {
    rain: { blocks: [{ id: 'gym', kind: 'team', title: 'Gym', len: 30, coach: null, note: '', place: 'Gym', drill: null }] },
    main: {
      blocks: [
        { id: 'w', kind: 'team', title: 'Warm-up', len: 30, coach: null, note: '', place: 'Range', drill: null },
        { id: 's', kind: 'stations', title: 'Rotation', len: 40, coach: null, note: '', stations: [{ id: 's1', place: 'Back', coach: null, drill: null, note: '' }, { id: 's2', place: 'Front', coach: null, drill: null, note: '' }], groupIds: ['A', 'B'], turnMin: 20, moveMin: 0, turns: 2, grid: null },
        { id: 'o', kind: 'own', title: 'Own work', len: 20, coach: null, note: '', place: 'Range', lines: { p1: 'Wedges', p2: 'Driver' } },
      ],
    },
  },
};

/** `golf_practice_plan_public_body` and the keys publish adds, in TypeScript. The guard below fails if the SQL stops doing this. */
function publicBody(body: PlanBodyV2, variant: 'main' | 'rain') {
  const { variants, ...rest } = body;
  const blocks = (variants[variant]?.blocks ?? []).map((b) => {
    if (b.kind !== 'own') return b;
    const { lines: _lines, ...kept } = b;
    return kept;
  });
  return JSON.parse(JSON.stringify({ ...rest, variant, blocks, title: 'Thursday', drills: {}, eventStart: '2026-11-05T19:00:00Z', eventEnd: null, eventLocation: null, dueOn: null })) as unknown;
}

const start = new Date('2026-11-05T19:00:00Z');

describe('a frozen version body, writer to reader', () => {
  it('the SQL writer is still flat, with lines removed: this mirror is the real shape', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261026010600_golf_practice_plan_publish.sql'), 'utf8');
    expect(sql).toContain("(p_body - 'variants' - 'why' - 'coach_why')");
    expect(sql).toContain("'blocks', COALESCE((");
    expect(sql).toContain("THEN b.value - 'lines' ELSE b.value END");
  });

  it('the draft parser refuses the flat form: that was the bug, and drafts stay strict', () => {
    expect(parsePlanBody(publicBody(draft, 'main'))).toBeNull();
  });

  it('round-trips a published body', () => {
    const back = parseVersionBody(publicBody(draft, 'main'))!;
    expect(back).not.toBeNull();
    expect(back.focus).toBe('Lag');
    expect(back.notes).toBe('Bring water');
    expect(back.arrivalBufferMin).toBe(10);
    expect(back.bring).toEqual(draft.bring);
    expect(back.players).toEqual(draft.players);
    expect(back.groups).toEqual(draft.groups);
    expect(back.variants.rain).toBeNull();
    expect(back.variants.main.blocks.map((b) => b.id)).toEqual(['w', 's', 'o']);
    expect(back.variants.main.blocks[1]).toEqual(draft.variants.main.blocks[1]);
  });

  it('a body published on the rain layout reads that layout', () => {
    expect(parseVersionBody(publicBody(draft, 'rain'))!.variants.main.blocks.map((b) => b.id)).toEqual(['gym']);
  });

  it('an older row already written without variants still parses, and a player path reads from it', () => {
    const row = { v: 2, focus: 'Lag', notes: '', place: 'Lakeside', arrivalBufferMin: 15, bring: [], players: ['p1'], groups: [], variant: 'main', blocks: [{ id: 'o', kind: 'own', title: 'Own', len: 20, coach: null, note: '', place: 'Range' }], title: 'Old', drills: {} };
    const back = parseVersionBody(row)!;
    expect(pathFor(back, 'p1', start).map((s) => s.title)).toEqual(['Own']);
  });

  it('still reads a nested body', () => {
    expect(parseVersionBody(JSON.parse(JSON.stringify(draft)))!.variants.main.blocks).toHaveLength(3);
  });

  it('refuses what is not a version body', () => {
    expect(parseVersionBody(null)).toBeNull();
    expect(parseVersionBody('x')).toBeNull();
    expect(parseVersionBody({ v: 3, blocks: [] })).toBeNull();
    expect(parseVersionBody({ v: 2 })).toBeNull();
    expect(parseVersionBody({ v: 2, blocks: 'nope' })).toBeNull();
  });

  it('gives back the same stops the draft gives, once a player has their own line', () => {
    const live = withOwnLines(parseVersionBody(publicBody(draft, 'main'))!, 'p2', [{ block_id: 'o', line: 'Driver' }]);
    const strip = (stops: ReturnType<typeof pathFor>) => stops.map((s) => [s.blockId, s.place, s.note, s.start.toISOString()]);
    expect(strip(pathFor(live, 'p2', start))).toEqual(strip(pathFor(draft, 'p2', start)));
    expect(toPlayerPlan(live, 'p2', start).group).toBe('B');
  });

  it('never carries another player’s line, whatever the row holds', () => {
    const live = withOwnLines(parseVersionBody(JSON.parse(JSON.stringify(draft)))!, 'p2', [{ block_id: 'o', line: 'Driver' }]);
    expect(JSON.stringify(live)).not.toContain('Wedges');
    expect(JSON.stringify(parseVersionBody(JSON.parse(JSON.stringify(draft))))).not.toContain('Driver');
  });
});

describe('what a republish records', () => {
  const change = (line: string) => ({ player: 'p', line });
  it('is the strings the RPC takes, not objects', () => {
    expect(changeLines({ changes: [change('Back is new at 2:00 PM')] })).toEqual(['Back is new at 2:00 PM']);
  });
  it('holds one row per line, at most 30, each 1 to 140 characters', () => {
    expect(changeLines({ changes: [change('a'), change('a'), change('  ')] })).toEqual(['a']);
    expect(changeLines({ changes: Array.from({ length: 40 }, (_, i) => change(`line ${i}`)) })).toHaveLength(30);
    expect(changeLines({ changes: [change('x'.repeat(200))] })[0]).toHaveLength(140);
  });
});

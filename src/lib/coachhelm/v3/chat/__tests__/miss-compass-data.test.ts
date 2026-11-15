/**
 * CoachHelm Studio Phase 1, the Miss Compass: the data and compiler half (COACHHELM_STUDIO_PHASE0.md, sections 2, 4 and 5).
 *
 * The shots behind each miss direction ride on the read in `detail.ui_only` (ui-only.ts): kept with the stored read, so a later
 * "Ask about these shots" is resolved against it, and passed over by everything that turns a read into words or numbers for
 * the model. Truth: each direction's count is getShotPattern's, its list is at most 40 with the true count beside it. Off (no
 * drawer): the read is exactly what it was. Synthetic ids only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { CoachChatContext } from '../context';
import { aboutLine } from '../engine/about';
import type { ToolContext } from '../engine/tool';
import { supportedNumbers } from '../grounding';
import type { ToolEnvelope } from '../provenance';
import { plain } from '../reader-kit';
import { showVisual } from '../readers-direct';
import { MISS_DIRECTIONS, MISS_SHOTS_CAP, getShotPattern, missPatternOf, missShotsOf, type ShotRow } from '../shot-reads';
import { rowsOfEnvelope } from '../summarise-data';
import { UI_ONLY_KEY, withoutUiOnly } from '../ui-only';
import { compileComposition } from '../visuals/compile-composition';
import { ValidatedComposition, salvageComposition } from '../visuals/composition';
import { missCompassEnabled, missCompassTeams } from '../visuals/miss-compass-flag';
import { detailTable, evidenceBlocks } from '../../../../../clubhouse/data/coachhelm-chat-thread';

const NOW = new Date('2026-11-12T16:00:00Z');
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const TEAM = 'team-1';
const ROSTER = [
  { id: 'p-1', name: 'Jonah Okafor', first_name: 'Jonah', last_name: 'Okafor', graduation_year: 2028 },
  { id: 'p-2', name: 'Priya Natarajan', first_name: 'Priya', last_name: 'Natarajan', graduation_year: 2027 },
];
const ctx = { coach_id: 'c1', user_id: 'u1', team_id: TEAM, team_name: 'Finley University', timezone: 'America/New_York', roster: ROSTER } as unknown as CoachChatContext;

// Six rounds, newest last; 50 "right" misses (past the cap), a few of every other kind, putts and shots with no direction.
// Two players' rounds, and the newest played by someone no longer on the active roster.
const ROUNDS = ['2026-09-02', '2026-09-16', '2026-09-30', '2026-10-14', '2026-10-28', '2026-11-04'].map((round_date, i) => ({ id: `r-${i + 1}`, round_date, course_name: i % 2 ? 'Hilltop' : 'Pine Ridge', player_id: i === 5 ? 'p-gone' : `p-${(i % 2) + 1}` }));
const SPREAD: Array<[string | null, number]> = [['right', 50], ['short_right', 11], ['short', 9], ['long', 4], ['left', 3], ['long_left', 1], [null, 6], ['sideways', 2]];
const SHOTS: ShotRow[] = [];
let n = 0;
for (const [dir, count] of SPREAD) {
  for (let i = 0; i < count; i++) {
    n++;
    const round = ROUNDS[n % ROUNDS.length]!;
    SHOTS.push({ id: `s-${String(n).padStart(3, '0')}`, round_id: round.id, hole_id: `h-${(n % 18) + 1}`, miss_direction: dir, distance_to_hole_before: 120 + (n % 40), distance_unit_before: 'yards', distance_to_hole_after: 10 + (n % 30), distance_unit_after: 'feet', lie_before: 'fairway', lie_after: 'green', club_type: 'iron', is_penalty: false, putt_distance_feet: null, putt_made: null });
  }
}
// Putts are not approach shots: never in the pattern, never in the lists.
SHOTS.push({ id: 's-900', round_id: 'r-1', hole_id: 'h-1', miss_direction: 'right', distance_to_hole_before: 20, distance_unit_before: 'feet', distance_to_hole_after: 2, distance_unit_after: 'feet', lie_before: 'green', lie_after: 'green', club_type: 'putter', is_penalty: false, putt_distance_feet: 20, putt_made: false });

/** A Supabase double for the two reads getShotPattern makes: the team's completed rounds, then their shots, paged. */
function fakeSb() {
  const rounds = { select: () => rounds, eq: () => rounds, gte: () => rounds, then: (ok: (v: unknown) => unknown) => ok({ data: ROUNDS, error: null }) };
  let ids: string[] = [];
  const shots = {
    select: () => shots,
    in: (_c: string, v: string[]) => ((ids = v), shots),
    order: () => shots,
    range: (from: number, to: number) => Promise.resolve({ data: SHOTS.filter((s) => ids.includes(s.round_id!)).slice(from, to + 1), error: null }),
  };
  return { from: (t: string) => (t === 'golf_rounds' ? rounds : shots) } as never;
}

const read = (drawer: boolean) => getShotPattern(fakeSb(), ctx, { since_days: 90, mode: 'approach', ...(drawer ? { drawer } : {}) });

describe('truth: the lists agree with the pattern', () => {
  it('each direction’s count is getShotPattern’s wedge count; its list is min(count, 40), newest round first', async () => {
    const env = await read(true);
    const detail = env.detail as { pattern: ReturnType<typeof missPatternOf>; ui_only: { miss_shots: ReturnType<typeof missShotsOf> } };
    const kept = detail[UI_ONLY_KEY].miss_shots;
    expect(kept.cap).toBe(MISS_SHOTS_CAP);
    for (const w of detail.pattern.wedges) {
      const d = kept.directions[w.direction as (typeof MISS_DIRECTIONS)[number]];
      expect(d.count, w.direction).toBe(w.count);
      expect(d.shots).toHaveLength(Math.min(w.count, 40));
      const dates = d.shots.map((s) => s.round_date ?? '');
      expect([...dates].sort().reverse()).toEqual(dates);
    }
    expect(kept.directions.right.count).toBe(50);
    expect(kept.directions.right.shots).toHaveLength(40);
    // No putt, no direction outside the eight, no shot with no direction is listed.
    const listed = MISS_DIRECTIONS.flatMap((d) => kept.directions[d].shots.map((s) => s.id));
    expect(listed).not.toContain('s-900');
    expect(listed.length).toBe(MISS_DIRECTIONS.reduce((a, d) => a + Math.min(kept.directions[d].count, 40), 0));
    // The shot says where and how far: its round's date and course, distances in feet.
    const one = kept.directions.short.shots[0]!;
    expect(one).toMatchObject({ round_id: expect.stringMatching(/^r-\d$/), hole_id: expect.stringMatching(/^h-\d+$/), course: expect.stringMatching(/Hilltop|Pine Ridge/), lie_before: 'fairway' });
    expect(one.from_ft! % 3).toBe(0);
  });

  it('the same cap shots come back on every read (date, then id)', () => {
    const rounds = new Map(ROUNDS.map((r) => [r.id, { round_date: r.round_date, course: r.course_name }]));
    const a = missShotsOf(SHOTS, rounds);
    const b = missShotsOf([...SHOTS].reverse(), rounds);
    expect(b).toEqual(a);
  });
});

describe('off: the read is exactly what it was', () => {
  it('no drawer: detail has no ui_only key at all, and nothing else differs from the drawer’s read but that key', async () => {
    const off = await read(false);
    const on = await read(true);
    expect(Object.keys(off.detail as object)).not.toContain(UI_ONLY_KEY);
    expect(Object.keys(on.detail as object)).toContain(UI_ONLY_KEY);
    expect(withoutUiOnly(on.detail)).toEqual(off.detail);
    expect({ ...on, detail: null }).toEqual({ ...off, detail: null });
  });

  it('the model’s words and the figures an answer is checked against are the same, on or off', async () => {
    const off = plain(await read(false));
    const on = plain(await read(true));
    expect(on.model_text).toBe(off.model_text);
    expect(supportedNumbers([on])).toEqual(supportedNumbers([off]));
  });
});

describe('whose shot: named on a team-wide read, from the roster, never on one player’s', () => {
  it('a team read names each round’s player by the roster; a player no longer on it is null, never an id', async () => {
    const env = await read(true);
    const kept = (env.detail as Record<string, { miss_shots: ReturnType<typeof missShotsOf> }>)[UI_ONLY_KEY]!.miss_shots;
    const playerOf = new Map(ROUNDS.map((r) => [r.id, r.player_id]));
    const names = new Map(ROSTER.map((p) => [p.id, p.name]));
    let named = 0;
    for (const d of MISS_DIRECTIONS)
      for (const s of kept.directions[d].shots) {
        expect(s).toHaveProperty('player');
        expect(s.player).toBe(names.get(playerOf.get(s.round_id)!) ?? null);
        if (s.player) named++;
      }
    expect(named).toBeGreaterThan(0);
    expect(JSON.stringify(kept)).not.toContain('p-gone');
  });

  it('a read of one player names no one: every row is theirs', async () => {
    const env = await getShotPattern(fakeSb(), ctx, { player_id: 'p-1', since_days: 90, mode: 'approach', drawer: true });
    const kept = (env.detail as Record<string, { miss_shots: ReturnType<typeof missShotsOf> }>)[UI_ONLY_KEY]!.miss_shots;
    for (const d of MISS_DIRECTIONS) for (const s of kept.directions[d].shots) expect(s).not.toHaveProperty('player');
  });

  it('the name rides through the compiler to the drawn block', async () => {
    const r = compileComposition({ title: 'Where the approach misses go', layout: 'stack', blocks: [{ type: 'miss_pattern', ref: 'e7' }] }, new Map([['e7', await read(true)]]), NOW);
    if (!r.ok) throw new Error(r.reason);
    const block = r.composition.blocks[0]!;
    if (block.type !== 'miss_pattern') throw new Error('not a miss pattern');
    expect(Object.values(block.shots!.directions).flatMap((x) => x.shots.map((s) => s.player))).toContain('Jonah Okafor');
  });
});

describe('a sentinel in ui_only reaches nothing the model or a generic table reads', () => {
  const SENTINEL = 'sentinel-shot-x9';
  const ODD = 987654;
  const env: ToolEnvelope = {
    summary: 'Finley University: 12 shots, last 90 days.',
    measurements: [],
    series: [],
    detail: { team_scope: true, kind: 'miss_pattern', pattern: { total: 12, no_direction: 0, inside_15: 4, inside_25: 7, penalties: 0, lies: {}, wedges: MISS_DIRECTIONS.map((direction) => ({ direction, count: direction === 'right' ? 12 : 0, avg_left_ft: null })) }, rounds: 3, [UI_ONLY_KEY]: { miss_shots: { cap: 40, directions: { right: { count: 12, shots: [{ id: SENTINEL, round_id: 'r-sentinel', hole_id: null, round_date: '2026-10-01', course: 'Sentinel Links', from_ft: ODD, left_ft: ODD, lie_before: 'fairway', player: 'Zebulon Quartermaine' }] } } } } },
    coverage: 'complete',
    coverage_note: null,
    as_of: NOW.toISOString(),
  };

  it('the model’s text, the supported numbers, summarise_data’s rows', () => {
    expect(plain(env).model_text).not.toMatch(/sentinel|987654|Sentinel Links|Quartermaine/i);
    expect(supportedNumbers([plain(env)]).all).not.toContain(ODD);
    expect(JSON.stringify(supportedNumbers([plain(env)]))).not.toMatch(/Quartermaine/);
    expect(JSON.stringify(rowsOfEnvelope(env))).not.toMatch(/sentinel|987654|Quartermaine/);
    expect(rowsOfEnvelope(env, UI_ONLY_KEY)).toBeNull();
  });

  it('a row reference never reaches into it; only a shots: selection does', () => {
    const reads = new Map([['e3', env]]);
    expect(aboutLine(reads, { evidence_ref: 'e3', key: `row:${SENTINEL}` })).toBeNull();
    expect(aboutLine(reads, { evidence_ref: 'e3', key: 'row:r-sentinel' })).toBeNull();
    for (const key of ['entity:team-1', 'metric:shots_logged']) expect(aboutLine(reads, { evidence_ref: 'e3', key })?.line ?? '').not.toMatch(/sentinel/i);
  });

  it('the player’s name stays with the app: not in the selection line the model is given either', () => {
    const got = aboutLine(new Map([['e3', env]]), { evidence_ref: 'e3', key: 'shots:right' })!;
    expect(got.line).toContain('the 12 shots that missed right');
    expect(got.line).not.toMatch(/Quartermaine|Zebulon/);
  });

  it('the thread’s generic evidence and tables draw none of it', () => {
    expect(JSON.stringify(evidenceBlocks(env))).not.toMatch(/sentinel|987654|Quartermaine/i);
    expect(detailTable(env.detail, 'x')).toBeNull();
  });

  it('whatever shape it takes: a list of records under ui_only is still nobody’s rows or table', () => {
    // The readers that take "the first list of records in detail" would take this one if the key were not passed over.
    const listed = { ...env, detail: { kind: 'miss_pattern', [UI_ONLY_KEY]: [{ id: SENTINEL, course: 'Sentinel Links', left_ft: ODD }, { id: 'sentinel-2', course: 'Sentinel Links', left_ft: ODD }] } } as ToolEnvelope;
    expect(JSON.stringify(rowsOfEnvelope(listed))).not.toMatch(/sentinel|987654/i);
    expect(JSON.stringify(detailTable(listed.detail, 'x'))).not.toMatch(/sentinel|987654/i);
    expect(JSON.stringify(evidenceBlocks(listed))).not.toMatch(/sentinel|987654/i);
    expect(plain(listed).model_text).not.toMatch(/sentinel|987654/i);
    expect(supportedNumbers([plain(listed)]).all).not.toContain(ODD);
  });
});

describe('“Ask about these shots”: a selection resolved against the stored read', () => {
  const stored = async () => new Map([['e4', plain(await read(true))]]);

  it('names the direction, its count and its rounds from the stored read, with no shot’s distance', async () => {
    const reads = await stored();
    const got = aboutLine(reads, { evidence_ref: 'e4', key: 'shots:short_right' })!;
    expect(got.about).toEqual({ evidence_ref: 'e4', key: 'shots:short_right' });
    expect(got.line).toContain('the 11 shots that missed short right, selected on the miss compass');
    expect(got.line).toMatch(/2026-11-04 at (Hilltop|Pine Ridge) \[r-\d\]/);
    // Distances were never shown to the model: the line points at the read for them instead of carrying them.
    expect(got.line).not.toMatch(/\bfeet\b|\bft\b|\byards?\b|from_ft|left_ft/);
  });

  it('refuses what the stored read does not hold, and takes nothing from the request but the direction', async () => {
    const reads = await stored();
    // A read this conversation never stored (another conversation's ref, or a made-up one).
    expect(aboutLine(reads, { evidence_ref: 'e99', key: 'shots:right' })).toBeNull();
    // Not one of the eight; a direction with no shots; ids smuggled into the key.
    expect(aboutLine(reads, { evidence_ref: 'e4', key: 'shots:sideways' })).toBeNull();
    expect(aboutLine(reads, { evidence_ref: 'e4', key: 'shots:long_right' })).toBeNull();
    expect(aboutLine(reads, { evidence_ref: 'e4', key: 'shots:right,s-001,s-002' })).toBeNull();
    // A read that is not a miss pattern, even with the same shape of key.
    const other = new Map([['e5', { ...plain(await read(true)), detail: { kind: 'putt_profile', [UI_ONLY_KEY]: (await read(true)).detail } } as ToolEnvelope]]);
    expect(aboutLine(other, { evidence_ref: 'e5', key: 'shots:right' })).toBeNull();
    // A read kept without the drawer (the flag off) has no selection to make.
    expect(aboutLine(new Map([['e6', plain(await read(false))]]), { evidence_ref: 'e6', key: 'shots:right' })).toBeNull();
  });

  it('with real round ids and long course names, the line still ends whole: every round id intact, the rest counted', async () => {
    // Production shapes: uuid round ids, 40-character course names, a summary and a window past their caps, a six-digit ref.
    const uuid = (i: number) => `0f6c2a4e-9b1d-4c3a-8e7f-${String(i).padStart(12, '0')}`;
    const course = (i: number) => `The Country Club of North Carolina ${String(i).padStart(2, '0')} Course`;
    const shots = Array.from({ length: 40 }, (_, i) => ({ id: `s-${i}`, round_id: uuid(i % 12), hole_id: null, round_date: `2026-10-${String(1 + (i % 12)).padStart(2, '0')}`, course: course(i % 12), from_ft: 400, left_ft: 22, lie_before: 'fairway' }));
    const base = plain(await read(true));
    const detail = base.detail as Record<string, unknown>;
    const long: ToolEnvelope = { ...base, summary: 'Approach misses for the team over the last ninety days, '.repeat(6), window_label: 'Since the start of the fall season, every completed round '.repeat(3), detail: { ...detail, [UI_ONLY_KEY]: { miss_shots: { cap: 40, directions: { short_right: { count: 1234, shots } } } } } };
    const got = aboutLine(new Map([['e123456', long]]), { evidence_ref: 'e123456', key: 'shots:short_right' })!;
    expect(got.line.length).toBeLessThanOrEqual(900);
    expect(got.line.endsWith('Answer about that thing; read again if the question needs more than is here.')).toBe(true);
    const ids = [...got.line.matchAll(/\[([^\]]*)\]/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    for (const id of ids) expect(id).toMatch(/^0f6c2a4e-9b1d-4c3a-8e7f-\d{12}$/);
    expect(got.line).toContain(`; and ${12 - ids.length} more rounds.`);
  });
});

describe('compile: the compiler copies the read’s shots, never the model', () => {
  const spec = (ref: string) => ({ title: 'Where the approach misses go', layout: 'stack' as const, blocks: [{ type: 'miss_pattern' as const, ref }] });

  it('a read with the drawer: the block carries the shots and the read they came from', async () => {
    const r = compileComposition(spec('e7'), new Map([['e7', await read(true)]]), NOW);
    if (!r.ok) throw new Error(r.reason);
    const block = r.composition.blocks[0]!;
    if (block.type !== 'miss_pattern') throw new Error('not a miss pattern');
    expect(block.shots?.ref).toBe('e7');
    for (const w of block.wedges) expect(block.shots!.directions[w.direction]!.count).toBe(w.count);
    expect(ValidatedComposition.safeParse(r.composition).success).toBe(true);
  });

  it('show_visual given the read as it was cited (read:e7) keeps the bare ref on the shots, the one an ask can name', async () => {
    const r = await showVisual.run({ reads: new Map([['e7', await read(true)]]) } as unknown as ToolContext, { kind: 'compose', title: 'Where the approach misses go', blocks: [{ type: 'miss_pattern', ref: 'read:e7' }] });
    const part = (r as { parts?: Array<{ type: string; data: { blocks: Array<{ type: string; shots?: { ref: string } }> } }> }).parts?.[0];
    expect(part?.type).toBe('data-visual-composition');
    expect(part!.data.blocks[0]!.shots?.ref).toBe('e7');
  });

  it('a read without it: the block is today’s, key for key, and so is its hash', async () => {
    const off = compileComposition(spec('e7'), new Map([['e7', await read(false)]]), NOW);
    const on = compileComposition(spec('e7'), new Map([['e7', await read(true)]]), NOW);
    if (!off.ok || !on.ok) throw new Error('not compiled');
    expect(Object.keys(off.composition.blocks[0]!)).toEqual(['type', 'total', 'no_direction', 'inside_15', 'inside_25', 'wedges']);
    const { shots: _s, ...same } = on.composition.blocks[0] as { shots?: unknown };
    expect(same).toEqual(off.composition.blocks[0]);
    expect(on.composition.dataHash).not.toBe(off.composition.dataHash);
  });

  it('shots whose counts disagree with the wedges are not drawn', async () => {
    const env = await read(true);
    const d = env.detail as Record<string, { miss_shots: { directions: Record<string, { count: number }> } }>;
    d[UI_ONLY_KEY]!.miss_shots.directions.right!.count = 49;
    const r = compileComposition(spec('e8'), new Map([['e8', env]]), NOW);
    if (!r.ok) throw new Error(r.reason);
    expect(Object.keys(r.composition.blocks[0]!)).not.toContain('shots');
  });
});

describe('replay: stored compositions parse unchanged, with or without shots', () => {
  const base = { artifactId: 'vc-1', kind: 'compose', title: 'Misses', lede: null, layout: 'stack', evidenceRefs: ['e1'], coverageNotes: [], dataHash: 'h', createdAt: NOW.toISOString() };
  const wedges = MISS_DIRECTIONS.map((direction) => ({ direction, count: direction === 'right' ? 2 : 0, avg_left_ft: direction === 'right' ? 21.5 : null }));
  const v1 = { ...base, schemaVersion: 1, blocks: [{ type: 'note', kind: 'measured', text: 'Misses lean right.' }, { type: 'headline', measurement: { metric_id: 'shots_logged', metric_label: 'Shots logged', unit: 'count', value: 2, entity: { kind: 'team', id: 't', label: 'T' }, window_start: null, window_end: null, as_of: 'now', sample_size: 2, sample_unit: 'shots', coverage: 'complete', coverage_note: null, source: 'shots', method: 'm', denominator: null, direction: null, benchmark: null }, label: null }] };
  const v2 = { ...base, schemaVersion: 2, blocks: [{ type: 'miss_pattern', total: 2, no_direction: 0, inside_15: 1, inside_25: 2, wedges }] };
  const v2shots = { ...v2, blocks: [{ ...v2.blocks[0], shots: { ref: 'e1', cap: 40, directions: { right: { count: 2, shots: [{ id: 's1', round_id: 'r1', hole_id: null, round_date: '2026-10-01', course: null, from_ft: 390, left_ft: 21.5, lie_before: 'fairway' }] } } } }] };

  it.each([['v1', v1], ['v2, as stored before the compass', v2], ['v2 with shots', v2shots]])('%s parses whole, and salvage keeps every block', (_n, stored) => {
    const parsed = ValidatedComposition.safeParse(JSON.parse(JSON.stringify(stored)));
    expect(parsed.success).toBe(true);
    expect(salvageComposition(stored).dropped).toEqual([]);
    // Nothing is added on the way through: a stored miss pattern without shots comes back without them, one with them as it was.
    const misses = (blocks: ReadonlyArray<{ type: string }>) => JSON.stringify(blocks.filter((b) => b.type === 'miss_pattern'));
    expect(misses(parsed.data!.blocks)).toBe(misses(stored.blocks as ReadonlyArray<{ type: string }>));
  });
});

describe('the flag: team scoped, off unless the team is listed and the flag is on', () => {
  it('fails closed', () => {
    expect(missCompassTeams(undefined).size).toBe(0);
    expect(missCompassTeams(' , ').size).toBe(0);
    expect([...missCompassTeams('team-1, team-2 team-3')]).toEqual(['team-1', 'team-2', 'team-3']);
    expect(missCompassEnabled(TEAM, { flagOn: () => true, teams: undefined })).toBe(false);
    expect(missCompassEnabled(TEAM, { flagOn: () => true, teams: '' })).toBe(false);
    expect(missCompassEnabled(TEAM, { flagOn: () => false, teams: TEAM })).toBe(false);
    expect(missCompassEnabled(null, { flagOn: () => true, teams: TEAM })).toBe(false);
    expect(missCompassEnabled('team-2', { flagOn: () => true, teams: TEAM })).toBe(false);
    expect(missCompassEnabled(TEAM, { flagOn: () => true, teams: TEAM })).toBe(true);
  });

  it('the registry has it off everywhere', async () => {
    const { FLAG_REGISTRY } = await import('@/lib/flags/registry.generated');
    const f = FLAG_REGISTRY.find((x) => x.feature_id === 'coachhelm_miss_compass_v1')!;
    expect(f.default).toBe(false);
    expect(f.environment).toEqual({ production: false, preview: false, development: false });
  });
});

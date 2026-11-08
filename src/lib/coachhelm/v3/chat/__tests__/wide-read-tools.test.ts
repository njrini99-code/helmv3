import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoachChatContext } from '../context';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => { throw new Error('the service client must not be used'); } }));
const flags = vi.hoisted(() => ({ on: new Set<string>() }));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: (id: string) => flags.on.has(id) }));

import { buildCoachTools } from '../agent-tools';
import { buildPlayerTools, PLAYER_INSTRUCTIONS } from '../player-tools';
import { buildInstructions } from '../instructions';
import { WIDE_READ_CHIPS, WIDE_READ_STEPS } from '../wide-read-names';
import { person, pgrst, type Tables } from './pgrst-double';

const ctx: CoachChatContext = { coach_id: 'c1', user_id: 'u1', team_id: 'team-1', team_name: 'Varsity', timezone: 'America/New_York', roster: [person('p1', 'Owen Carter'), person('p2', 'Cole Bennett')] };
const NEW_COACH_TOOLS = ['get_benchmarks', 'get_metric_definitions', 'get_golf_reference', 'get_attendance_summary', 'get_goals', 'get_focus_practice', 'get_round_stats', 'get_qualifier_entries', 'get_team_season_settings', 'query_team_data'];

const tables: Tables = {
  golf_teams: { rows: [{ id: 'team-1', gender: 'mens' }] },
  golf_pga_standards: { rows: [{ tour: 'pga', metric_id: 'gir_pct', season: '2024', display_label: 'GIR %', pga_tour_value: 66, div1_avg_value: 60, korn_ferry_value: null, div2_avg_value: null, div3_avg_value: null, hs_avg_value: null, pga_p25: 62, pga_p50: 66, pga_p75: 72, source: 'Tour ~65-67%' }] },
  golf_metrics: { rows: [{ metric_id: 'gir_pct', display_label: 'GIR %', unit: 'percent', direction: 'higher_better', category: 'approach', description: 'Greens in regulation rate.', active: true }] },
  golf_player_standing: { rows: [{ player_id: 'p1', metric_id: 'gir_pct', player_value: 58, level_avg: 61, level_n: 70, level_pct: 30, team_avg: 57, team_n: 9, team_pct: 55, basis: null, computed_at: '2026-11-07T02:00:00Z' }, { player_id: 'p2', metric_id: 'gir_pct', player_value: 83.4, level_avg: 61, level_n: 70, level_pct: 90, team_avg: 57, team_n: 9, team_pct: 99, basis: null, computed_at: '2026-11-07T02:00:00Z' }] },
  golf_events: { rows: [{ team_id: 'team-1', title: 'Range', start_time: '2026-11-03T20:00:00Z' }] },
  golf_team_seasons: { rows: [{ team_id: 'team-1', season: '2026-27', division: 'D1' }] },
};

function coach(askV2: boolean, db = pgrst(tables)) {
  const writer = { write: vi.fn() };
  const tools = buildCoachTools({ sb: db.sb, ctx, conversationId: 'conv-1', writer: writer as never, collect: vi.fn(), teamTools: true, askV2 });
  return { tools, writer, db };
}
const parts = (writer: { write: ReturnType<typeof vi.fn> }, type: string) => writer.write.mock.calls.map((c) => c[0] as { type: string; data?: Record<string, unknown> }).filter((p) => p.type === type);

describe('the coach’s wider reads', () => {
  beforeEach(() => flags.on.clear());

  it('are offered with Ask v2 and left out of the old Ask', () => {
    for (const t of NEW_COACH_TOOLS) expect(Object.keys(coach(false).tools)).not.toContain(t);
    for (const t of NEW_COACH_TOOLS) expect(Object.keys(coach(true).tools)).toContain(t);
  });

  it('offer tournament notes only while golf_tournaments_v1 is on', () => {
    expect(Object.keys(coach(true).tools)).not.toContain('get_tournament_notes');
    flags.on.add('golf_tournaments_v1');
    expect(Object.keys(coach(true).tools)).toContain('get_tournament_notes');
  });

  it('list every table the generic reader may read in its description, and no tournament table while the flag is off', () => {
    const d = (coach(true).tools.query_team_data as unknown as { description: string }).description;
    expect(d).toContain('golf_rounds');
    expect(d).toContain('golf_events');
    expect(d).not.toContain('golf_tournaments');
    flags.on.add('golf_tournaments_v1');
    expect((coach(true).tools.query_team_data as unknown as { description: string }).description).toContain('golf_tournaments');
  });

  it('each announce a step of their own and fold to a past-tense line', async () => {
    flags.on.add('golf_tournaments_v1');
    const inputs: Record<string, object> = {
      get_benchmarks: { metric_ids: ['gir_pct'] },
      get_metric_definitions: {},
      get_golf_reference: { topic: 'putting' },
      get_attendance_summary: {},
      get_goals: { state: 'active', limit: 5 },
      get_focus_practice: { since_days: 30 },
      get_qualifier_entries: { limit: 2 },
      get_tournament_notes: { limit: 2 },
      get_team_season_settings: {},
      query_team_data: { table: 'golf_events', columns: ['title'], filters: [], limit: 5 },
    };
    for (const [name, input] of Object.entries(inputs)) {
      const { tools, writer } = coach(true);
      await tools[name]!.execute!(input as never, {} as never);
      const p = parts(writer, 'data-progress');
      expect(p[0]?.data?.label, name).toBe(WIDE_READ_STEPS[name]![0]);
      expect(p.at(-1)?.data, name).toMatchObject({ state: expect.stringMatching(/done|failed/), done: WIDE_READ_STEPS[name]![1] });
    }
  });

  it('hand back an evidence_ref and publish the read, so a visual can draw from it', async () => {
    const { tools, writer } = coach(true);
    const out = (await tools.get_benchmarks!.execute!({ metric_ids: ['gir_pct'], player_id: 'p1' } as never, {} as never)) as { evidence_ref: string; coverage: string };
    expect(out.coverage).toBe('complete');
    expect(out.evidence_ref).toBe('e1');
    expect(parts(writer, 'data-evidence')[0]?.data).toMatchObject({ tool: 'get_benchmarks', ref: 'e1' });
  });

  it('turn a player off the roster into a refusal the coach can read, with no query made', async () => {
    const { tools, db } = coach(true);
    const out = (await tools.get_benchmarks!.execute!({ metric_ids: ['gir_pct'], player_id: '11111111-1111-4111-8111-111111111111' } as never, {} as never)) as { coverage: string };
    expect(out.coverage).toBe('unavailable');
    expect(db.of('golf_player_standing')).toEqual([]);
  });

  it('chips are named for every step', () => {
    expect(Object.keys(WIDE_READ_CHIPS).sort()).toEqual(Object.keys(WIDE_READ_STEPS).sort());
  });
});

describe('the player’s benchmark reads', () => {
  const me = { ...ctx, coach_id: '', roster: [person('p1', 'Owen Carter')] };
  function player(db = pgrst(tables)) {
    const written: unknown[] = [];
    const collected: unknown[] = [];
    const tools = buildPlayerTools({ sb: db.sb, ctx: me, playerId: 'p1', writer: { write: (p: unknown) => written.push(p) } as never, collect: (e) => collected.push(e) });
    return { tools, written, collected, db };
  }

  it('offers the benchmarks, definitions and the golf reference, and no generic reader or team read', () => {
    const names = Object.keys(player().tools);
    for (const t of ['get_benchmarks', 'get_metric_definitions', 'get_golf_reference']) expect(names).toContain(t);
    for (const t of ['query_team_data', 'get_attendance_summary', 'get_goals', 'get_focus_practice', 'get_round_stats', 'get_qualifier_entries', 'get_tournament_notes', 'get_team_season_settings']) expect(names).not.toContain(t);
  });

  it('takes no player_id: the schema has no such field to forge', () => {
    const schema = (player().tools.get_benchmarks as unknown as { inputSchema: { safeParse: (v: unknown) => { success: boolean; data?: Record<string, unknown> } } }).inputSchema;
    const parsed = schema.safeParse({ metric_ids: ['gir_pct'], player_id: 'p2' });
    expect(parsed.success).toBe(true);
    expect(parsed.data).not.toHaveProperty('player_id');
  });

  it('reads the player’s own standing and the team average, and nothing that names or shows a teammate, anywhere on the wire', async () => {
    const { tools, written, collected, db } = player();
    const out = await tools.get_benchmarks!.execute!({ metric_ids: ['gir_pct'] } as never, {} as never);
    const wire = JSON.stringify([out, written, collected]);
    expect(wire).toContain('"player":"You"');
    // All three references travel, level first, team second, Tour last; the team's place is a number, never a name.
    const detail = (out as { detail: { standing: { rows: Array<{ comparisons: Array<{ kind: string; value: number | null; place_of: number | null }> }> } } }).detail;
    const refs = detail.standing.rows[0]!.comparisons;
    expect(refs.map((c) => c.kind)).toEqual(['level', 'team', 'tour']);
    expect(refs[1]).toMatchObject({ value: 57, place_of: 9 });
    expect(wire).not.toContain('Cole');
    expect(wire).not.toContain('"player_id":"p2"');
    expect(wire).not.toMatch(/83\.4|\b99\b/);
    expect(db.of('golf_player_standing').filter((c) => c.method === 'eq')).toEqual([expect.objectContaining({ args: ['player_id', 'p1'] })]);
  });

  it('announces itself in the player’s words', async () => {
    const { tools, written } = player();
    await tools.get_benchmarks!.execute!({ metric_ids: ['gir_pct'] } as never, {} as never);
    const p = (written as Array<{ type: string; data?: { label?: string; done?: string } }>).filter((w) => w.type === 'data-progress');
    expect(p[0]?.data?.label).toBe('Looking up how you compare');
    expect(p.at(-1)?.data?.done).toBe('Looked up how you compare');
  });

  it('fills the team’s level on a measurement a player’s own read returns', async () => {
    const stats = { ...tables, golf_player_stats_cache: { rows: [{ player_id: 'p1', rounds_played: 12, gir_percentage: 58.3, greens_hit: 100, greens_total: 171, updated_at: '2026-11-07T00:00:00Z', calculation_period_start: null, calculation_period_end: null, is_stale: false }] } };
    const { tools, collected } = player(pgrst(stats));
    await tools.get_player_metrics!.execute!({ metric_ids: ['gir_pct'], window: 'cache' } as never, {} as never);
    const env = collected.at(-1) as { measurements: Array<{ metric_id: string; benchmark: { value: number; source: string } | null }> };
    const gir = env.measurements.find((m) => m.metric_id === 'gir_pct');
    expect(gir).toBeDefined();
    expect(gir!.benchmark).toMatchObject({ value: 60, source: 'Division I average 2024' });
  });
});

describe('the prompts', () => {
  const now = '2026-11-07T12:00:00.000Z';
  it('tell the coach’s Ask v2 where to look, in what order, and how to use a benchmark and the golf reference', () => {
    const p = buildInstructions(ctx, now, false, { askV2: true });
    expect(p).toContain('## Where to look');
    expect(p).toMatch(/typed reads/);
    expect(p).toMatch(/golf reference/);
    expect(p).toMatch(/Never blend a reference figure/);
    expect(p).toMatch(/every distance, count of reps or target comes from a read/i);
    expect(p).toMatch(/never obeyed/);
  });
  it('make the coach state the level, the team and the Tour, in that order, say what is missing, and read a team figure against the level and the Tour only', () => {
    const p = buildInstructions(ctx, now, false, { askV2: true });
    expect(p).toMatch(/three things, in this order/);
    expect(p.indexOf('(1) their level')).toBeGreaterThan(-1);
    expect(p.indexOf('(1) their level')).toBeLessThan(p.indexOf('(2) the team average'));
    expect(p.indexOf('(2) the team average')).toBeLessThan(p.indexOf('(3) the Tour'));
    expect(p).toMatch(/Level first, Tour last/);
    expect(p).toMatch(/If one is\s+missing, say so/);
    expect(p).toMatch(/team's own[^.]*level and the Tour only/);
  });
  it('make the player state the same three, with their place in the team and never a teammate', () => {
    const p = PLAYER_INSTRUCTIONS('Owen', 'Varsity', 'UTC');
    expect(p).toMatch(/three things, in this order/);
    expect(p.indexOf('(1) your level')).toBeLessThan(p.indexOf('(2) the team average'));
    expect(p.indexOf('(2) the team average')).toBeLessThan(p.indexOf('(3) the Tour'));
    expect(p).toMatch(/where you sit in your team/);
    expect(p).toMatch(/If one is missing, say so/);
    expect(p).toMatch(/never a teammate's name or figure/);
    expect(p).toMatch(/keep the level first/);
  });
  it('describe the benchmark tool as returning all three for both roles', () => {
    const c = coach(true).tools.get_benchmarks!.description!;
    expect(c).toMatch(/level/i);
    expect(c).toMatch(/team/i);
    expect(c).toMatch(/Tour/);
    const me = { ...ctx, coach_id: '', roster: [person('p1', 'Owen Carter')] };
    const pl = buildPlayerTools({ sb: pgrst(tables).sb, ctx: me, playerId: 'p1', writer: { write: () => {} } as never, collect: () => {} }).get_benchmarks!.description!;
    expect(pl).toMatch(/level/i);
    expect(pl).toMatch(/team/i);
    expect(pl).toMatch(/Tour/);
  });
  it('leave the old Ask exactly as it was', () => {
    expect(buildInstructions(ctx, now, false)).not.toContain('## Where to look');
  });
  it('tell the player to read the benchmarks and the golf reference, and keep the no-teammate rule', () => {
    const p = PLAYER_INSTRUCTIONS('Owen', 'Varsity', 'UTC');
    expect(p).toMatch(/read the benchmarks first/);
    expect(p).toMatch(/golf reference/);
    expect(p).toMatch(/Never name another player/);
    expect(p).toMatch(/never invent a distance/);
  });
});

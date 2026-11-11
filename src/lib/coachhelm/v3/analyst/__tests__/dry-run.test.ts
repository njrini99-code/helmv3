import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import type { Database } from '@/lib/types/database';
import { DRY_RUN_USAGE, PRODUCTION_PROJECT_REF, checkDryRunArgs, parseDryRunArgs, projectRefOfKey, refusal, reportTable, runAnalystDryRun, teamReport } from '../dry-run';
import { assembleFactSheets } from '../fact-sheet';
import { findNotable } from '../notability';
import { supabaseAnalystSources } from '../supabase-sources';
import { EVEN, NOW, TEAM_ID, TeamFixture, daysAgo, normal, seeded, tenRounds, type RoundSpec } from './fixtures';

/** A Supabase-style JWT for a project ref. The signature is not real and is never checked here. */
const jwtFor = (ref: string): string => `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ iss: 'supabase', ref, role: 'service_role' })).toString('base64url')}.sig`;

const STAGING_URL = 'https://abcdefghijklmnopqrst.supabase.co';
const STAGING_KEY = jwtFor('abcdefghijklmnopqrst');

describe('the flags', () => {
  it('reads the four flags and the day', () => {
    expect(parseDryRunArgs(['--url', STAGING_URL, '--service-key-env', 'STAGING_KEY', '--team', TEAM_ID, '--out', 'report.json', '--as-of', '2026-11-10'])).toEqual({
      url: STAGING_URL,
      serviceKeyEnv: 'STAGING_KEY',
      team: TEAM_ID,
      out: 'report.json',
      asOf: '2026-11-10',
      help: false,
    });
    expect(parseDryRunArgs(['--help']).help).toBe(true);
    expect(() => parseDryRunArgs(['--apply'])).toThrow('unknown argument: --apply');
  });

  it('needs the url, the name of the key variable and the team, all explicit', () => {
    expect(checkDryRunArgs(parseDryRunArgs(['--team', TEAM_ID]), { STAGING_KEY })).toEqual({ ok: false, why: '--url, --service-key-env and --team are all required' });
    expect(checkDryRunArgs(parseDryRunArgs(['--url', STAGING_URL, '--service-key-env', 'STAGING_KEY', '--team', 'my-team']), { STAGING_KEY })).toMatchObject({ ok: false, why: '--team must be a team id (uuid)' });
    expect(checkDryRunArgs(parseDryRunArgs(['--url', STAGING_URL, '--service-key-env', 'MISSING', '--team', TEAM_ID]), { STAGING_KEY })).toMatchObject({ ok: false, why: 'the environment variable named by --service-key-env is not set' });
    expect(checkDryRunArgs(parseDryRunArgs(['--url', STAGING_URL, '--service-key-env', 'STAGING_KEY', '--team', TEAM_ID, '--as-of', 'yesterday']), { STAGING_KEY })).toMatchObject({ ok: false });
  });

  it('accepts a target that is not production, and takes the day it is told', () => {
    const ok = checkDryRunArgs(parseDryRunArgs(['--url', STAGING_URL, '--service-key-env', 'STAGING_KEY', '--team', TEAM_ID, '--as-of', '2026-11-10']), { STAGING_KEY });
    expect(ok).toMatchObject({ ok: true, url: STAGING_URL, team: TEAM_ID, out: null });
    expect(ok.ok && ok.now.toISOString()).toBe('2026-11-10T12:00:00.000Z');
  });

  it('never prints the key', () => {
    const results = [
      checkDryRunArgs(parseDryRunArgs(['--url', `https://${PRODUCTION_PROJECT_REF}.supabase.co`, '--service-key-env', 'K', '--team', TEAM_ID]), { K: STAGING_KEY }),
      checkDryRunArgs(parseDryRunArgs(['--url', STAGING_URL, '--service-key-env', 'K', '--team', TEAM_ID]), { K: jwtFor(PRODUCTION_PROJECT_REF) }),
    ];
    for (const r of results) {
      expect(r.ok).toBe(false);
      expect(JSON.stringify(r)).not.toContain(STAGING_KEY);
      expect(JSON.stringify(r)).not.toContain(jwtFor(PRODUCTION_PROJECT_REF));
    }
    expect(DRY_RUN_USAGE).toContain('the key is never printed');
  });
});

describe('production is refused', () => {
  it('on the url', () => {
    expect(refusal(`https://${PRODUCTION_PROJECT_REF}.supabase.co`, STAGING_KEY)).toBe('the --url is the production project: the dry run never reads production');
    expect(refusal(`https://${PRODUCTION_PROJECT_REF.toUpperCase()}.supabase.co/rest/v1`, STAGING_KEY)).toContain('production');
    expect(refusal(`https://db.${PRODUCTION_PROJECT_REF}.supabase.co:5432`, STAGING_KEY)).toContain('production');
  });

  it('on a production key behind another host name', () => {
    expect(projectRefOfKey(jwtFor(PRODUCTION_PROJECT_REF))).toBe(PRODUCTION_PROJECT_REF);
    expect(refusal('https://api.example.test', jwtFor(PRODUCTION_PROJECT_REF))).toBe('the service key was issued for the production project: the dry run never reads production');
  });

  it('but a local or staging target is allowed', () => {
    expect(refusal(STAGING_URL, STAGING_KEY)).toBeNull();
    expect(refusal('http://127.0.0.1:54321', 'sb_secret_not_a_jwt')).toBeNull();
    expect(projectRefOfKey('sb_secret_not_a_jwt')).toBeNull();
    expect(projectRefOfKey('a.not-base64-json.c')).toBeNull();
    expect(refusal('db.internal', STAGING_KEY)).toBe('the --url must start with http:// or https://');
  });
});

describe('the team report', () => {
  // Two players lose most on approach, one on the tee, one is even.
  const fx = new TeamFixture();
  fx.player('p-approach-1', tenRounds(2, { tee: -0.5, approach: -3, around: -0.5, putting: -0.5 }));
  fx.player('p-approach-2', tenRounds(2, { tee: -0.4, approach: -3.5, around: -0.6, putting: -0.5 }));
  fx.player('p-even', tenRounds(2, EVEN));
  fx.player('p-tee', tenRounds(2, { tee: -3, approach: -0.5, around: -0.5, putting: -0.5 }));
  const reads = assembleFactSheets(fx.rows()).map((sheet) => ({ sheet, notability: findNotable(sheet) }));
  const report = teamReport(TEAM_ID, reads);

  it('says per player how many candidates and which rule fired', () => {
    expect(report.players).toBe(4);
    expect(report.per_player.map((p) => [p.player_id, p.candidates.map((c) => c.measure_id), p.candidates.flatMap((c) => c.rules)])).toEqual([
      ['p-approach-1', ['strokes_gained_approach'], ['biggest_cost']],
      ['p-approach-2', ['strokes_gained_approach'], ['biggest_cost']],
      ['p-even', [], []],
      ['p-tee', ['strokes_gained_off_the_tee'], ['biggest_cost']],
    ]);
    expect(report.per_player[0]).toMatchObject({ rounds_last10: 10, rounds_with_shots_logged: 10 });
    expect(report.per_player[0]!.candidates[0]!.strokes_per_round).toBe(2.5);
  });

  it('says how many players share each candidate', () => {
    expect(report.shared).toEqual([
      { measure_id: 'strokes_gained_approach', players: 2, player_ids: ['p-approach-1', 'p-approach-2'], rules: { changed: 0, stands_out_in_team: 0, biggest_cost: 2 } },
      { measure_id: 'strokes_gained_off_the_tee', players: 1, player_ids: ['p-tee'], rules: { changed: 0, stands_out_in_team: 0, biggest_cost: 1 } },
    ]);
  });

  it('gives the comparison: distinct kinds, and the share of players with the most common one', () => {
    expect(report.summary).toMatchObject({
      players_with_candidates: 3,
      players_without_candidates: 1,
      candidates: 3,
      distinct_candidate_kinds: 2,
      most_common: { measure_id: 'strokes_gained_approach', players: 2, share_of_players: 0.5 },
      rules_fired: { changed: 0, stands_out_in_team: 0, biggest_cost: 3 },
    });
  });

  it('gives every player with enough measured rounds one priority, with how sure it is', () => {
    expect(report.per_player.map((p) => [p.player_id, p.priority?.measure_id, p.priority?.certainty])).toEqual([
      ['p-approach-1', 'strokes_gained_approach', 'clear'],
      ['p-approach-2', 'strokes_gained_approach', 'clear'],
      // Every area the same: a loss, and no area worse than the others.
      ['p-even', 'strokes_gained_off_the_tee', 'likely'],
      ['p-tee', 'strokes_gained_off_the_tee', 'clear'],
    ]);
    expect(report.per_player[0]!.priority).toMatchObject({ strokes_per_round: 3, rounds: 10, same_as_team: false, vs_team: 'worse' });
    expect(report.shared_priority).toEqual([
      { measure_id: 'strokes_gained_approach', players: 2, certainty: { clear: 2, likely: 0, leaning: 0 }, vs_team: { better: 0, same: 0, worse: 2 } },
      { measure_id: 'strokes_gained_off_the_tee', players: 2, certainty: { clear: 1, likely: 1, leaning: 0 }, vs_team: { better: 0, same: 0, worse: 2 } },
    ]);
    expect(report.summary).toMatchObject({
      players_with_priority: 4,
      players_with_neither: 0,
      distinct_priority_kinds: 2,
      most_common_priority: { measure_id: 'strokes_gained_approach', players: 2, share_of_players: 0.5 },
      priority_certainty: { clear: 3, likely: 1, leaning: 0 },
    });
  });

  it('counts rule (c) over the last 10 rounds beside the same rule over the season', () => {
    // Here the season is the same ten rounds, so the two agree: three players pass, the even one does not.
    expect(report.biggest_cost).toEqual({
      last10: { tested: 4, passes_ranges: 3, supported: 3 },
      season: { tested: 4, passes_ranges: 3, would_survive_correction: 3 },
    });
  });

  it('says why rule (a) did not fire: the tests each player\'s run holds and their p-values before correction', () => {
    // Ten rounds each: nobody has a previous window, so rule (a) ran no test.
    expect(report.changed).toMatchObject({
      players_with_previous_window: 0,
      tests_per_player: { min: 0, median: 0, max: 0 },
      p_values: { tests: 0 },
      supported: 0,
      smallest_p: [],
    });
    expect(report.changed.proposed_family.measures).toEqual(['strokes_gained_off_the_tee', 'strokes_gained_approach', 'strokes_gained_around_the_green', 'strokes_gained_putting', 'scoring_average']);
    expect(report.changed.proposed_family.rule_a_alone).toEqual({ tests: 0, would_fire: [] });
    // With rule (c) in the proposed family, the three biggest costs are what it would support.
    expect(report.changed.proposed_family.all_rules.would_fire.map((w) => [w.player_id, w.rule])).toEqual([
      ['p-approach-1', 'biggest_cost'],
      ['p-approach-2', 'biggest_cost'],
      ['p-tee', 'biggest_cost'],
    ]);
  });

  it('prints a short table with ids only', () => {
    const table = reportTable(report);
    expect(table).toContain(`Team ${TEAM_ID}, as of 2026-11-10: 4 active players`);
    // Approach 3.0 lost a round; the teammates' median approach is 1.0 lost, so 2.00 worse.
    expect(table).toContain("p-approa                10/-/10            10/10        0/0/1  approach clear 3.00 (2.77 to 3.23, 10 rounds); not the team's worst area, worse than the team median by 2.00 | strokes_gained_approach [c biggest cost]");
    expect(table).toContain("p-even                  10/-/10            10/10        0/0/1  off_the_tee likely 1.00 (0.71 to 1.29, 10 rounds); not the team's worst area, worse than the team median by 0.50 | none");
    expect(table).toContain('2 players share priority strokes_gained_approach: 2 clear, 0 likely, 0 leaning; against the team median 2 worse, 0 same, 0 better');
    expect(table).toContain('Players with a priority: 4 of 4 (3 clear, 1 likely, 0 leaning). With neither a priority nor a signal: 0.');
    expect(table).toContain('2 players share candidate strokes_gained_approach');
    expect(table).toContain('1 player has candidate strokes_gained_off_the_tee');
    expect(table).toContain('Distinct candidate kinds across the team: 2.');
    expect(table).toContain('Most common: strokes_gained_approach, 2 of 4 players (50%).');
    expect(table).toContain('Rules fired: changed 0, stands out in the team 0, biggest cost 3.');
    expect(table).toContain("Good news (supported, in the player's favor, never a candidate): none.");
    expect(table).toContain('Last 10 rounds: tested for 4 players, both ranges pass for 3, supported after correction for 3.');
    expect(table).toContain('Season: tested for 4 players, both ranges pass for 3, would survive the same correction for 3.');
    expect(table).toContain('Players with a previous window: 0 of 4.');
    expect(table).toContain('PROPOSED, NOT APPLIED: correct over off_the_tee, approach, around_the_green, putting, scoring_average only.');
  });

  it('notes when a biggest cost is the team\'s shape as well as the player\'s', () => {
    // Six players who all lose most on approach: each one's cost is real, and it is one team item.
    const same = new TeamFixture();
    for (let k = 0; k < 6; k++) same.player(`p${k}`, tenRounds(2, { tee: -0.5, approach: -3 - k * 0.1, around: -0.5, putting: -0.5 }));
    const all = assembleFactSheets(same.rows()).map((sheet) => ({ sheet, notability: findNotable(sheet) }));
    for (const r of all) {
      const reason = r.notability.candidates[0]!.reasons.find((x) => x.rule === 'biggest_cost')!;
      expect(reason.team_shape).toEqual({ team_worst_area: 'strokes_gained_approach', same_as_team: true });
    }
    const shared = teamReport(TEAM_ID, all);
    expect(shared.summary.most_common).toEqual({ measure_id: 'strokes_gained_approach', players: 6, share_of_players: 1 });
    // And the player whose cost is NOT the team's is told apart.
    const mine = reads.find((r) => r.sheet.player_id === 'p-tee')!.notability.candidates[0]!.reasons[0]!;
    expect(mine.team_shape).toEqual({ team_worst_area: 'strokes_gained_approach', same_as_team: false });
  });

  it('handles a team with nobody on it', () => {
    const empty = teamReport(TEAM_ID, []);
    expect(empty.summary).toMatchObject({ players_with_candidates: 0, distinct_candidate_kinds: 0, most_common: null });
    expect(reportTable(empty)).toContain('No player has a candidate.');
  });
});

/** Twenty rounds of ordinary golf from one distribution: the round-to-round spread production measures, approach the weakest area. */
function ordinaryRounds(rng: () => number): RoundSpec[] {
  const leg = (mean: number, sd: number) => Math.round((mean + sd * normal(rng)) * 100) / 100;
  const made = (p: number) => rng() < p;
  const count = (n: number, p: number) => Array.from({ length: n }, () => made(p)).filter(Boolean).length;
  const feet = (mean: number, sd: number) => Math.max(2, Math.round(mean + sd * normal(rng)));
  return Array.from({ length: 20 }, (_, i) => {
    const greens = count(18, 0.55);
    return {
      date: daysAgo(2 + i * 5),
      score: Math.min(88, Math.max(68, 76 + Math.round(3 * normal(rng)))),
      // The within-player spread of each area (src/clubhouse/lib/stats-signal.ts POOLED_LEG_SD: 1.3, 2.5, 1.4, 2.0).
      sg: { tee: leg(-0.6, 1.3), approach: leg(-1.8, 2.5), around: leg(-0.6, 1.4), putting: leg(-0.8, 2.0) },
      putts: [[4, made(0.8)], [4, made(0.8)], [7, made(0.45)], [8, made(0.45)], [9, made(0.45)], [12, made(0.25)], [13, made(0.25)], [20, made(0.1)], [30, made(0.04)]] as const,
      approaches: [
        [100, feet(30, 12), made(0.65)],
        [100, feet(30, 12), made(0.65)],
        [150, feet(45, 18), made(0.5)],
        [150, feet(45, 18), made(0.5)],
        [190, feet(70, 25), made(0.3)],
        [190, feet(70, 25), made(0.3)],
      ] as const,
      cache: {
        greens_hit: greens,
        fairways_hit: count(14, 0.55),
        total_putts: 28 + count(8, 0.5),
        three_putts: count(4, 0.3),
        penalty_strokes: count(3, 0.3),
        scramble_attempts: 18 - greens,
        scrambles_converted: count(18 - greens, 0.45),
        sand_attempts: 2,
        sand_saves: count(2, 0.35),
      },
    };
  });
}

describe('ten ordinary players', () => {
  const fx = new TeamFixture();
  const rng = seeded(20261110);
  for (let k = 0; k < 10; k++) fx.player(`player-${k}`, ordinaryRounds(rng));

  it('do not all get the same candidate', async () => {
    const { report, players } = await runAnalystDryRun(fx.sources(), { teamId: TEAM_ID, now: NOW });
    expect(report.players).toBe(10);
    // Every one of them is below the Tour in every strokes-gained area, approach most of all.
    for (const p of players) {
      const approach = p.sheet.measures.find((m) => m.id === 'strokes_gained_approach')!;
      expect(approach.current.value).toBeLessThan(0);
      expect(p.notability.tests.run).toBeGreaterThan(40);
    }
    // Today's engine: one card shape on 91% of players. Here the same noise gives no shared card.
    expect(report.summary.most_common?.players ?? 0).toBeLessThan(10);
    expect(report.summary.most_common?.share_of_players ?? 0).toBeLessThan(0.5);
    // Ten players drawn from one distribution differ only by chance, and the false discovery rate holds chance reads down.
    expect(report.summary.players_with_candidates).toBeLessThanOrEqual(1);
    expect(reportTable(report)).toContain('active players');
  });
});

// ── The Supabase sources, over a client that can only read ──────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

/** Just enough of the PostgREST builder to answer the dry run's SELECTs from arrays, and to record what was asked. */
class FakeQuery implements PromiseLike<{ data: Row[]; error: null }> {
  constructor(private rows: Row[], private readonly log: string[], private readonly table: string) {}
  select(columns: string): this {
    this.log.push(`${this.table}.select`);
    const cols = columns.split(',').map((c) => c.trim());
    this.rows = this.rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])).valueOf() as Row).map((picked, i) => ({ ...picked, __all: this.rows[i] }));
    return this;
  }
  private where(test: (r: Row) => boolean): this {
    this.rows = this.rows.filter((r) => test(r.__all as Row));
    return this;
  }
  eq(col: string, value: unknown): this {
    return this.where((r) => r[col] === value);
  }
  in(col: string, values: unknown[]): this {
    this.log.push(`${this.table}.in(${values.length})`);
    return this.where((r) => values.includes(r[col]));
  }
  not(col: string, _op: string, value: unknown): this {
    return this.where((r) => r[col] !== value);
  }
  gte(col: string, value: string): this {
    return this.where((r) => (r[col] as string) >= value);
  }
  order(col: string, opts: { ascending: boolean }): this {
    const dir = opts.ascending ? 1 : -1;
    const prior = this.rows.map((r, i) => ({ r, i }));
    prior.sort((a, b) => {
      const x = (a.r.__all as Row)[col] as string;
      const y = (b.r.__all as Row)[col] as string;
      return x === y ? a.i - b.i : x < y ? -dir : dir;
    });
    // A later order() is a tie-break in PostgREST; applying the first key last would undo it, so only the first sort reorders freely.
    if (!this.sorted) this.rows = prior.map((p) => p.r);
    this.sorted = true;
    return this;
  }
  private sorted = false;
  range(from: number, to: number): this {
    this.log.push(`${this.table}.range(${from},${to})`);
    this.rows = this.rows.slice(from, to + 1);
    return this;
  }
  private strip(rows: Row[]): Row[] {
    return rows.map(({ __all: _all, ...rest }) => rest);
  }
  async maybeSingle(): Promise<{ data: Row | null; error: null }> {
    return { data: this.strip(this.rows)[0] ?? null, error: null };
  }
  then<A, B>(resolve: (v: { data: Row[]; error: null }) => A | PromiseLike<A>, reject?: (e: unknown) => B | PromiseLike<B>): PromiseLike<A | B> {
    // PostgREST never returns more than 1,000 rows, whatever the range asked for.
    return Promise.resolve({ data: this.strip(this.rows).slice(0, 1000), error: null as null }).then(resolve, reject);
  }
}

function fakeClient(fx: TeamFixture, log: string[]): SupabaseClient<Database> {
  const tables: Record<string, Row[]> = {
    golf_teams: [{ id: TEAM_ID, gender: 'mens' }],
    golf_team_settings: [{ team_id: TEAM_ID, timezone: 'America/New_York' }],
    golf_team_members: [
      ...fx.playerIds.map((id, i) => ({ id: `m${String(i).padStart(3, '0')}`, team_id: TEAM_ID, player_id: id, status: 'active' })),
      { id: 'm900', team_id: TEAM_ID, player_id: 'left-the-team', status: 'inactive' },
      { id: 'm901', team_id: 'another-team', player_id: 'someone-else', status: 'active' },
    ],
    golf_rounds: [
      ...fx.rounds.map((r) => ({ ...r, is_test: false, status: 'completed' })),
      // Rows the query must leave out: a test round, a round in progress, a round older than the read reaches.
      { ...fx.rounds[0]!, id: 'zz-test', is_test: true, status: 'completed', total_score: 59 },
      { ...fx.rounds[0]!, id: 'zz-live', is_test: false, status: 'in_progress', total_score: 40 },
      { ...fx.rounds[0]!, id: 'zz-old', is_test: false, status: 'completed', round_date: '2024-01-01', total_score: 60 },
    ],
    golf_round_stats_cache: fx.cache.map((c, i) => ({ ...c, id: `c${String(i).padStart(5, '0')}` })),
    golf_holes: fx.holes.map((h) => ({ ...h })),
    // Stored in another order than the fixture's, as a database may return them.
    golf_shots: fx.shots.map((s) => ({ ...s })).reverse(),
    golf_pga_standards: [
      ...fx.standards.map((s) => ({ metric_id: s.metric_id, season: '2024', tour: 'pga', pga_tour_value: s.value, source: s.source })),
      { metric_id: 'gir_pct', season: '2019', tour: 'pga', pga_tour_value: 1, source: 'an older season' },
      { metric_id: 'gir_pct', season: '2024', tour: 'lpga', pga_tour_value: 70, source: 'the other tour' },
    ],
  };
  const client = {
    from(table: string) {
      const rows = tables[table];
      if (!rows) throw new Error(`the dry run read a table it should not: ${table}`);
      log.push(`from(${table})`);
      return new FakeQuery(rows, log, table);
    },
  };
  // Anything but `from(...).select(...)` does not exist on this client: an insert, update, delete, upsert or rpc would throw.
  return client as unknown as SupabaseClient<Database>;
}

describe('the Supabase sources', () => {
  // Twelve players x 20 rounds = 240 rounds (two id chunks) and 2,640 shots (three pages).
  const fx = new TeamFixture();
  for (let k = 0; k < 12; k++) {
    fx.player(`player-${String(k).padStart(2, '0')}`, [
      ...tenRounds(2, { ...EVEN, putting: -1 - k * 0.1 }, () => ({ putts: Array.from({ length: 6 }, (_, j) => [4 + j * 3, j % 2 === 0] as const), approaches: [[150, 30, true], [150, 60, false], [100, 20, true], [190, 70, false]] })),
      ...tenRounds(60, EVEN, () => ({ putts: Array.from({ length: 6 }, (_, j) => [4 + j * 3, j % 2 === 0] as const), approaches: [[150, 30, true], [150, 60, false], [100, 20, true], [190, 70, false]] })),
    ]);
  }

  it('reads every row past the 1,000-row cap and the id-list limit, and gives the sheets the rows give', async () => {
    expect(fx.shots.length).toBe(2640);
    const log: string[] = [];
    const { report, players } = await runAnalystDryRun(supabaseAnalystSources(fakeClient(fx, log)), { teamId: TEAM_ID, now: NOW });
    // Exactly what the pure builder makes from the same rows: nothing truncated, nothing extra let in.
    expect(players.map((p) => p.sheet)).toEqual(assembleFactSheets(fx.rows()));
    expect(report.players).toBe(12);
    // Shots: 240 round ids in chunks of 200 and 40; the first chunk's shots take three pages.
    expect(log.filter((l) => l === 'golf_shots.in(200)').length).toBe(3);
    expect(log.filter((l) => l === 'golf_shots.in(40)').length).toBe(1);
    expect(log).toContain('golf_shots.range(2000,2999)');
  });

  it('only ever selects', async () => {
    const log: string[] = [];
    await runAnalystDryRun(supabaseAnalystSources(fakeClient(fx, log)), { teamId: TEAM_ID, now: NOW });
    const verbs = new Set(log.filter((l) => !l.startsWith('from(')).map((l) => l.split('.')[1]!.replace(/\(.*/, '')));
    expect(verbs).toEqual(new Set(['select', 'in', 'range']));
    expect(new Set(log.filter((l) => l.startsWith('from(')))).toEqual(
      new Set(['from(golf_teams)', 'from(golf_team_settings)', 'from(golf_team_members)', 'from(golf_rounds)', 'from(golf_round_stats_cache)', 'from(golf_holes)', 'from(golf_shots)', 'from(golf_pga_standards)']),
    );
  });

  it('takes the team\'s active members, its own tour and the newest season', async () => {
    const sources = supabaseAnalystSources(fakeClient(fx, []));
    expect(await sources.activePlayerIds(TEAM_ID)).toEqual(fx.playerIds);
    expect(await sources.team(TEAM_ID)).toEqual({ id: TEAM_ID, gender: 'mens', timezone: 'America/New_York' });
    expect(await sources.team('22222222-2222-4222-8222-222222222222')).toBeNull();
    const standards = await sources.tourStandards('pga');
    expect(standards.find((s) => s.metric_id === 'gir_pct')).toEqual({ metric_id: 'gir_pct', value: 66, source: 'PGA Tour 2024' });
  });

  it('leaves out test rounds, rounds in progress and rounds before the read starts', async () => {
    const sources = supabaseAnalystSources(fakeClient(fx, []));
    const rounds = await sources.rounds(fx.playerIds, '2025-11-10');
    expect(rounds).toHaveLength(240);
    expect(rounds.some((r) => r.id.startsWith('zz-'))).toBe(false);
  });

  it('throws on a failed read instead of returning what it has', async () => {
    const failing = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'permission denied for table golf_teams' } }) }) }),
      }),
    } as unknown as SupabaseClient<Database>;
    await expect(runAnalystDryRun(supabaseAnalystSources(failing), { teamId: TEAM_ID, now: NOW })).rejects.toThrow('reading golf_teams failed: permission denied');
  });
});

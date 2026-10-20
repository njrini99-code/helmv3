import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// The starvation telemetry (`[pattern-miner.thresholds] 0 patterns produced
// for player <id>…`) had no per-player dedup key. `logServerEvent` fell back
// to server-error-logger.ts's default `dbFingerprint`
// (buildIncidentSignature(severity, errorCode, route, message)), and that
// function's normalizeIncidentMessagePrefix strips every UUID from the
// message before hashing — exactly where this event's only per-player detail
// lives. Two different players' starvation therefore collapsed into ONE
// admin_events incident: 3,493 rows from 2 players over 3 months,
// indistinguishable from one player firing 3,493 times.
//
// These tests drive `minePatterns()` with homogeneous round data (same
// score, same round_type, no putts/fairways/GIR variance — nothing for any
// of the three sub-miners to key a condition off) so it reliably reaches the
// zero-patterns starvation branch, then assert the resulting `logServerEvent`
// call carries a fingerprint that is STABLE for one player and DIFFERENT
// across two different players.
// ---------------------------------------------------------------------------

const { logServerEventMock, roundsData } = vi.hoisted(() => ({
  logServerEventMock: vi.fn(async () => {}),
  roundsData: { rows: [] as unknown[], eqs: [] as Array<[string, unknown]> },
}));

function makeRoundsBuilder() {
  const builder: Record<string, unknown> = {};
  const ret = () => builder;
  builder.select = ret;
  builder.eq = (col: string, val: unknown) => {
    roundsData.eqs.push([col, val]);
    return builder;
  };
  builder.gte = ret;
  builder.order = ret;
  builder.limit = async () => ({ data: roundsData.rows, error: null });
  return builder;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'golf_rounds') return makeRoundsBuilder();
      // savePatterns() only ever reaches golf_patterns_v2 when there is at
      // least one pattern to save — these fixtures are built to produce
      // zero, so a call here means the fixture stopped being degenerate.
      throw new Error(`unexpected table ${table} — fixture should yield 0 patterns`);
    },
  }),
}));

// A zero-pattern mine now retires the player's stale mined patterns (audit
// row 16), which reaches golf_patterns_v2 through fromUntyped. Resolve that
// chain as a successful no-op; the starvation telemetry is what's under test.
vi.mock('@/lib/supabase/untyped', () => ({
  fromUntyped: () => {
    const chain: Record<string, unknown> = {};
    for (const m of ['update', 'in', 'eq', 'not']) chain[m] = () => chain;
    chain.or = async () => ({ error: null });
    return chain;
  },
}));

// pattern-miner.ts imports this as '../features' (relative to its own
// directory); mocked here by the module's resolved absolute path since
// vi.mock resolves relative specifiers against THIS file's location, not the
// importer's.
vi.mock('@/lib/coachhelm/v2/features', () => ({
  extractAllFeatures: vi.fn(async () => {}),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerEvent: logServerEventMock,
}));

// Import AFTER mocks are registered.
const { PatternMiner } = await import('@/lib/coachhelm/v2/mining/pattern-miner');

/** N identical, feature-flat rounds — nothing for any condition to key off:
 *  same score, same non-tournament/qualifier round_type, no days-since-last
 *  spread, no putts/fairways/GIR data. Reliably yields 0 patterns from all
 *  three sub-miners so `minePatterns()` reaches the starvation branch. */
function flatRounds(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `round-${i}`,
    score_to_par: 0,
    round_date: '2026-06-01',
    round_type: 'practice',
    total_putts: null,
    total_fairways: null,
    total_fairways_hit: null,
    total_gir: null,
    total_gir_possible: null,
    // Countable (round-countable.ts): the miner drops half-entered cards.
    holes_played: 18,
    total_score: 72,
    front_nine: 36,
    back_nine: 36,
  }));
}

function loggedFingerprints() {
  const calls = logServerEventMock.mock.calls as unknown as Array<
    [string, { dbFingerprint?: string; fingerprint?: string[] }, string]
  >;
  return calls.map(([, context]) => context);
}

describe('pattern-miner starvation telemetry — per-player fingerprint', () => {
  beforeEach(() => {
    logServerEventMock.mockClear();
    roundsData.rows = [];
  });

  it('gives two different players two different dbFingerprints', async () => {
    roundsData.rows = flatRounds(12);
    const patternsA = await new PatternMiner('player-aaaa').minePatterns();
    expect(patternsA).toEqual([]); // sanity: fixture actually starved

    roundsData.rows = flatRounds(12);
    const patternsB = await new PatternMiner('player-bbbb').minePatterns();
    expect(patternsB).toEqual([]);

    const [ctxA, ctxB] = loggedFingerprints();
    expect(ctxA?.dbFingerprint).toBe('pattern-miner-starvation:player-aaaa');
    expect(ctxB?.dbFingerprint).toBe('pattern-miner-starvation:player-bbbb');
    expect(ctxA?.dbFingerprint).not.toBe(ctxB?.dbFingerprint);
  });

  it('gives the same player the same dbFingerprint across repeated cron ticks', async () => {
    roundsData.rows = flatRounds(12);
    await new PatternMiner('player-cccc').minePatterns();
    roundsData.rows = flatRounds(12);
    await new PatternMiner('player-cccc').minePatterns();

    const [first, second] = loggedFingerprints();
    expect(first?.dbFingerprint).toBe('pattern-miner-starvation:player-cccc');
    expect(second?.dbFingerprint).toBe(first?.dbFingerprint);
  });

  it('also sets a per-player Sentry-side fingerprint (harmless today under skipSentry, correct if that ever changes)', async () => {
    roundsData.rows = flatRounds(12);
    await new PatternMiner('player-dddd').minePatterns();

    const [ctx] = loggedFingerprints();
    expect(ctx?.fingerprint).toEqual(['pattern-miner-starvation', 'player-dddd']);
  });

  it('stays telemetry at any round count: info severity, bursts folded (Bridge noise, 2026-10-01)', async () => {
    // Production 2026-10-01: ~200 starvation rows in 24h across 11 players, the
    // >=16-round ones at 'warning'. The classifier (incident-classification.ts
    // TELEMETRY_PHRASES '.starvation') and feature-registry both call this
    // telemetry, so a 'warning' row only joined the triage queue, got closed,
    // and re-fired minutes later (pattern-miner-starvation:e61da37b… resolved
    // 21:17Z, back 22:11Z as 4 rows in 3s).
    roundsData.rows = flatRounds(20);
    await new PatternMiner('player-eeee').minePatterns();
    const calls = logServerEventMock.mock.calls as unknown as Array<[string, { durableCollapse?: boolean }, string]>;
    const [, ctx, severity] = calls[0]!;
    expect(severity).toBe('info');
    expect(ctx.durableCollapse).toBe(true);
  });
});

// OD-03 leak (2026-09-28 audit): mined patterns and the insights built on them
// read QA and implausible rounds (91301a75: is_test, 37 over 18).
describe('pattern-miner — countable, non-test rounds only', () => {
  beforeEach(() => {
    logServerEventMock.mockClear();
    roundsData.rows = [];
    roundsData.eqs = [];
  });

  it('filters is_test = false in the rounds query', async () => {
    roundsData.rows = flatRounds(12);
    await new PatternMiner('player-eeee').minePatterns();
    expect(roundsData.eqs).toContainEqual(['is_test', false]);
  });

  it('drops non-countable rounds before mining: 12 hole-less cards are not enough rounds', async () => {
    roundsData.rows = flatRounds(12).map((r) => ({ ...r, front_nine: null, back_nine: null }));
    await expect(new PatternMiner('player-ffff').minePatterns()).resolves.toEqual([]);
    // It stopped at "not enough rounds", before the starvation branch.
    expect(loggedFingerprints()).toEqual([]);
  });
});

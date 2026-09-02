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
  roundsData: { rows: [] as unknown[] },
}));

function makeRoundsBuilder() {
  const builder: Record<string, unknown> = {};
  const ret = () => builder;
  builder.select = ret;
  builder.eq = ret;
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

vi.mock('@/lib/supabase/untyped', () => ({
  fromUntyped: () => {
    throw new Error('fromUntyped should not be reached — savePatterns short-circuits on 0 patterns');
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
});

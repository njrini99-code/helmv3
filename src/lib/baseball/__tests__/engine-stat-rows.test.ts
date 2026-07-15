// =============================================================================
// Unit tests for the shared engine stat-row read (#379 Phase 4b).
//
// loadEngineStatRows is the ONE place the CoachHelm engine (engine-run.ts,
// outcome-sweep.ts, action-baseline.ts) reads per-session stat rows. These pin
// the precedence rule the three callers now share:
//
//   1. A player with ANY canonical box-score row gets game-context rows
//      EXCLUSIVELY from baseball_box_score_batting/_pitching (normalized onto
//      the loader shape, source-table tagged); their legacy stat_type='game'
//      rows leave the pool — never blended, so a game seeded into BOTH layers
//      (the #827 demo seed does exactly that) is never counted twice.
//   2. Legacy PRACTICE/other rows always survive (practice carve-out — the
//      canonical layers have no practice-session concept yet).
//   3. A player with zero canonical rows keeps their full legacy history
//      (legacy fallback — never a regression to "engine sees nothing").
//   4. Canonical-side read failures degrade ALL-OR-NOTHING back to the legacy
//      pool; a legacy read failure surfaces as the callers' hard error.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { loadEngineStatRows } from '@/lib/baseball/coachhelm/engine-stat-rows';

const TEAM = 'team-1';

type Row = Record<string, unknown>;

/**
 * Minimal chainable Supabase fake (same shape as the outcome-sweep test's):
 * every .from(table) returns a thenable builder resolving that table's canned
 * rows; per-table errors can be injected to exercise the degrade paths. The
 * canned sets are far under the 1000-row page size, so fetchAllRowsResult's
 * pagination loop terminates after one page.
 */
function makeClient(tables: Record<string, Row[]>, errorTables: Set<string> = new Set()) {
  return {
    from(table: string) {
      const data = tables[table] ?? [];
      const fail = errorTables.has(table);
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        order: () => builder,
        range: () => builder,
        then(resolve: (v: { data: unknown; error: unknown }) => unknown) {
          return resolve(
            fail ? { data: null, error: { message: `${table} read failed` } } : { data, error: null },
          );
        },
      };
      return builder;
    },
  };
}

const legacyGame = (id: string, playerId: string, over: Row = {}): Row => ({
  id,
  player_id: playerId,
  stat_type: 'game',
  session_date: '2026-03-01',
  at_bats: 4,
  hits: 1,
  strikeouts: 2,
  walks: 0,
  ...over,
});

const legacyPractice = (id: string, playerId: string): Row => ({
  id,
  player_id: playerId,
  stat_type: 'practice',
  session_date: '2026-03-02',
  at_bats: 10,
  hits: 5,
  strikeouts: 1,
  walks: 0,
});

const boxBatting = (id: string, playerId: string, gameId: string): Row => ({
  id,
  game_id: gameId,
  player_id: playerId,
  ab: 5,
  h: 2,
  doubles: 1,
  triples: 0,
  hr: 0,
  bb: 1,
  k: 1,
  hbp: 0,
  sf: 0,
});

const boxPitching = (id: string, playerId: string, gameId: string): Row => ({
  id,
  game_id: gameId,
  player_id: playerId,
  ip: 5,
  er: 2,
  bb: 1,
  k: 6,
  pitch_count: 78,
  strikes: 50,
});

describe('loadEngineStatRows — #379 precedence rule', () => {
  it('replaces a box-score player\'s legacy GAME rows with normalized canonical rows (never blended)', async () => {
    const client = makeClient({
      baseball_player_stats: [legacyGame('lg-1', 'p1'), legacyGame('lg-2', 'p1')],
      baseball_games: [{ id: 'g1', game_date: '2026-04-01' }],
      baseball_box_score_batting: [boxBatting('bb-1', 'p1', 'g1')],
    });

    const { data, error } = await loadEngineStatRows(client, TEAM, ['p1']);
    expect(error).toBeNull();
    expect(data).not.toBeNull();

    // Only the canonical row survives for p1's game context.
    expect(data).toHaveLength(1);
    const row = data![0]!;
    expect(row.id).toBe('bb-1');
    expect(row.stat_type).toBe('game');
    // The joined game date became the row's session_date.
    expect(row.session_date).toBe('2026-04-01');
    // Source-table provenance is tagged so loader source_refs cite the REAL table.
    expect(row.hittingSourceTable).toBe('baseball_box_score_batting');
  });

  it('keeps legacy PRACTICE rows for a box-score player (practice carve-out)', async () => {
    const client = makeClient({
      baseball_player_stats: [legacyGame('lg-1', 'p1'), legacyPractice('lp-1', 'p1')],
      baseball_games: [{ id: 'g1', game_date: '2026-04-01' }],
      baseball_box_score_pitching: [boxPitching('bp-1', 'p1', 'g1')],
    });

    const { data } = await loadEngineStatRows(client, TEAM, ['p1']);
    const ids = data!.map((r) => r.id).sort();
    expect(ids).toEqual(['bp-1', 'lp-1']); // canonical game + legacy practice; legacy game dropped
    expect(data!.find((r) => r.id === 'bp-1')?.pitchingSourceTable).toBe('baseball_box_score_pitching');
  });

  it('keeps the FULL legacy history for a player with zero canonical rows (legacy fallback), alongside a canonical teammate', async () => {
    const client = makeClient({
      baseball_player_stats: [
        legacyGame('lg-p1', 'p1'),
        legacyGame('lg-p2', 'p2'),
        legacyPractice('lp-p2', 'p2'),
      ],
      baseball_games: [{ id: 'g1', game_date: '2026-04-01' }],
      baseball_box_score_batting: [boxBatting('bb-p1', 'p1', 'g1')],
    });

    const { data } = await loadEngineStatRows(client, TEAM, ['p1', 'p2']);
    const ids = data!.map((r) => r.id).sort();
    // p1: canonical only. p2: untouched legacy game + practice rows.
    expect(ids).toEqual(['bb-p1', 'lg-p2', 'lp-p2']);
  });

  it('resolves session_date null (excluded from date-scoped windows, still counted) when the game id is unknown', async () => {
    const client = makeClient({
      baseball_player_stats: [],
      baseball_games: [], // no game rows resolvable
      baseball_box_score_batting: [boxBatting('bb-1', 'p1', 'g-missing')],
    });

    const { data } = await loadEngineStatRows(client, TEAM, ['p1']);
    expect(data).toHaveLength(1);
    expect(data![0]!.session_date).toBeNull();
  });

  it('degrades ALL-OR-NOTHING to the legacy pool when any canonical-side read fails', async () => {
    const client = makeClient(
      {
        baseball_player_stats: [legacyGame('lg-1', 'p1')],
        baseball_games: [{ id: 'g1', game_date: '2026-04-01' }],
        baseball_box_score_batting: [boxBatting('bb-1', 'p1', 'g1')],
      },
      new Set(['baseball_box_score_pitching']), // one canonical read fails
    );

    const { data, error } = await loadEngineStatRows(client, TEAM, ['p1']);
    expect(error).toBeNull();
    // Pre-migration behavior exactly: the legacy row, no canonical rows — a
    // partial blend (batting ok, pitching failed) could double count.
    expect(data!.map((r) => r.id)).toEqual(['lg-1']);
  });

  it('surfaces a legacy read failure as the hard error (callers\' pre-existing failure path)', async () => {
    const client = makeClient(
      { baseball_box_score_batting: [boxBatting('bb-1', 'p1', 'g1')] },
      new Set(['baseball_player_stats']),
    );

    const { data, error } = await loadEngineStatRows(client, TEAM, ['p1']);
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it('returns an empty pool without querying when no player ids are given', async () => {
    let queried = false;
    const client = {
      from() {
        queried = true;
        throw new Error('should not query');
      },
    };
    const { data, error } = await loadEngineStatRows(client, TEAM, []);
    expect(data).toEqual([]);
    expect(error).toBeNull();
    expect(queried).toBe(false);
  });
});

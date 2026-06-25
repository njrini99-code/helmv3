// =============================================================================
// src/app/baseball/actions/__tests__/imports-registry.test.ts
//
// Asserts the import-source REGISTRY is load-bearing on commitImport (the gap):
//   1. required_review=true PREVENTS auto-commit — zero baseball_player_stats
//      writes; the run is HELD (status 'review', review_state 'pending_review').
//   2. trust_level + default_visibility PROPAGATE onto committed stat rows.
//   3. unregistered source falls back to adapter defaults (auto-commit, unreviewed).
//
// withBaseballAction is mocked to a passthrough that injects a known ctx so the
// test exercises the real commit body; createClient is a table-aware recorder.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- module mocks (must be declared before importing the action) -----------

// Passthrough capability wrapper: inject a fixed staff ctx, run the real body.
vi.mock('@/lib/baseball/with-baseball-action', () => ({
  withBaseballAction:
    (_name: string, _opts: unknown, fn: (ctx: unknown, ...a: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      fn(
        {
          user: { id: 'user-1' },
          activeCoachId: 'coach-1',
          targetTeamId: 'team-1',
          activeTeamId: 'team-1',
        },
        ...args,
      ),
}));

// No-op the engine + timeline side-effects (their own suites cover them).
vi.mock('@/app/baseball/actions/coachhelm', () => ({ runBaseballEngine: vi.fn(async () => {}) }));
vi.mock('@/lib/baseball/timeline-writer', () => ({
  appendImportTimelineEvent: vi.fn(async () => {}),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// ---- table-aware Supabase recorder -----------------------------------------

type Row = Record<string, unknown>;
const inserted: Record<string, Row[]> = {};
const updated: Record<string, Row[]> = {};

// What loadSourcePolicy + the per-row existing-lookup return, set per test.
let sourcePolicyRow: Row | null = null;
let existingStatRow: Row | null = null;

function tableHandle(table: string) {
  const result = (data: unknown) => ({ data, error: null });

  // A chainable object; terminal awaits resolve to { data, error }.
  const chain: Record<string, unknown> = {};
  const ret = () => chain;
  for (const m of ['select', 'eq', 'in', 'or', 'order', 'limit']) chain[m] = vi.fn(ret);

  chain.maybeSingle = vi.fn(async () => {
    if (table === 'baseball_player_stats') return result(existingStatRow);
    return result(null);
  });
  chain.single = vi.fn(async () => {
    if (table === 'baseball_import_runs') return result({ id: 'run-1' });
    if (table === 'baseball_player_stats') return result({ id: 'stat-new-1' });
    return result({ id: `${table}-1` });
  });

  // baseball_import_sources is read via .or(...).limit(1) and then awaited as an
  // array (no .single). Make the chain thenable so `await db.from(...).select().or().limit()`
  // resolves to the policy row array.
  chain.then = (resolve: (v: unknown) => unknown) => {
    if (table === 'baseball_import_sources') return resolve(result(sourcePolicyRow ? [sourcePolicyRow] : []));
    return resolve(result([]));
  };

  chain.insert = vi.fn((rows: Row | Row[]) => {
    (inserted[table] ??= []).push(...(Array.isArray(rows) ? rows : [rows]));
    return {
      select: vi.fn(() => ({
        single: vi.fn(async () =>
          table === 'baseball_import_runs'
            ? result({ id: 'run-1' })
            : result({ id: 'stat-new-1' }),
        ),
      })),
      // some inserts are awaited directly (no .select())
      then: (r: (v: unknown) => unknown) => r(result(null)),
    };
  });
  chain.update = vi.fn((row: Row) => {
    (updated[table] ??= []).push(row);
    return { eq: vi.fn(() => ({ then: (r: (v: unknown) => unknown) => r(result(null)) })) };
  });
  chain.upsert = vi.fn((rows: Row | Row[]) => {
    (inserted[table] ??= []).push(...(Array.isArray(rows) ? rows : [rows]));
    return { then: (r: (v: unknown) => unknown) => r(result(null)) };
  });

  return chain;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => tableHandle(table),
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
  })),
}));

// ---- import AFTER mocks -----------------------------------------------------

import { commitImport } from '@/app/baseball/actions/imports';

function baseArgs() {
  return {
    teamId: 'team-1',
    sourceId: 'gamechanger',
    fileName: 'box.csv',
    statType: 'game' as const,
    sessionDate: '2026-03-01',
    sessionName: 'vs State',
    headers: ['player', 'ab', 'h'],
    mapping: { player_name: 'player', at_bats: 'ab', hits: 'h' },
    rows: [{ player: 'Mike Trout', ab: '4', h: '2' }],
    matches: [
      {
        rowIndex: 0,
        sourceName: 'Mike Trout',
        playerId: 'p1',
        playerName: 'Mike Trout',
        confidence: 1,
        matchTier: 'exact_roster' as const,
        isManualMatch: false,
        action: 'create' as const,
      },
    ],
  };
}

beforeEach(() => {
  for (const k of Object.keys(inserted)) delete inserted[k];
  for (const k of Object.keys(updated)) delete updated[k];
  sourcePolicyRow = null;
  existingStatRow = null;
});

describe('commitImport — registry required_review gate', () => {
  it('required_review=true HOLDS the run and writes ZERO stat rows', async () => {
    sourcePolicyRow = {
      id: 'src-1',
      trust_level: 'official',
      default_visibility: 'player_visible',
      required_review: true,
      dedupe_strictness: 'standard',
      player_match_strategy: 'name_then_external_id',
      external_id_namespace: null,
      enabled: true,
    };

    const res = await commitImport(baseArgs());

    expect(res.heldForReview).toBe(true);
    expect(res.created).toBe(0);
    expect(res.updated).toBe(0);
    // No stat rows were written.
    expect(inserted['baseball_player_stats'] ?? []).toHaveLength(0);
    // The run header was created in the held state.
    const runHeader = (inserted['baseball_import_runs'] ?? [])[0];
    expect(runHeader?.status).toBe('review');
    expect(runHeader?.review_state).toBe('pending_review');
    expect(runHeader?.source_config_id).toBe('src-1');
  });
});

describe('commitImport — trust + visibility stamping', () => {
  it('required_review=false stamps trust_level + default_visibility on committed rows', async () => {
    sourcePolicyRow = {
      id: 'src-2',
      trust_level: 'device_export',
      default_visibility: 'restricted',
      required_review: false,
      dedupe_strictness: 'standard',
      player_match_strategy: 'name_then_external_id',
      external_id_namespace: null,
      enabled: true,
    };

    const res = await commitImport(baseArgs());

    expect(res.heldForReview).toBe(false);
    expect(res.created).toBe(1);
    const statRow = (inserted['baseball_player_stats'] ?? [])[0];
    expect(statRow).toBeTruthy();
    expect(statRow?.source_trust_level).toBe('device_export');
    expect(statRow?.source_visibility).toBe('restricted');
    expect(statRow?.source).toBe('import:gamechanger');
  });

  it('unregistered source falls back to adapter defaults (auto-commit, unreviewed/staff_only)', async () => {
    sourcePolicyRow = null; // not registered for the team

    const res = await commitImport(baseArgs());

    expect(res.heldForReview).toBe(false);
    expect(res.created).toBe(1);
    const statRow = (inserted['baseball_player_stats'] ?? [])[0];
    expect(statRow?.source_trust_level).toBe('unreviewed');
    expect(statRow?.source_visibility).toBe('staff_only');
    const runHeader = (inserted['baseball_import_runs'] ?? [])[0];
    expect(runHeader?.review_state).toBe('not_required');
    expect(runHeader?.source_config_id).toBeNull();
  });
});

// =============================================================================
// src/contracts/baseball/source-trust/import-stamping.test.ts
//
// PRODUCT TRUTH THIS FILE PINS:
//   Every stat row written by an import commit carries its full provenance:
//   `source`, `source_trust_level`, `source_visibility`,
//   `source_match_confidence`, `source_match_tier`. A Source-Trust surface (or
//   an auditor) must be able to answer "how trustworthy is this number, and
//   how was the player resolved" from the row alone — never from a guess.
//   And when the import source is NOT registered for the team, the fallback
//   is the documented `ADAPTER_DEFAULT_POLICY` (unreviewed/staff_only) — never
//   an inflated trust level the coach never configured.
//
// Reuses the exact mock pattern established in
// `src/app/baseball/actions/__tests__/imports-registry.test.ts` (passthrough
// withBaseballAction + a table-aware Supabase recorder) — no new test infra.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

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

vi.mock('@/app/baseball/actions/coachhelm', () => ({ runBaseballEngine: vi.fn(async () => {}) }));
vi.mock('@/lib/baseball/timeline-writer', () => ({
  appendImportTimelineEvent: vi.fn(async () => {}),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

type Row = Record<string, unknown>;
const inserted: Record<string, Row[]> = {};

let sourcePolicyRow: Row | null = null;

function tableHandle(table: string) {
  const result = (data: unknown) => ({ data, error: null });
  const chain: Record<string, unknown> = {};
  const ret = () => chain;
  for (const m of ['select', 'eq', 'in', 'or', 'order', 'limit']) chain[m] = vi.fn(ret);

  chain.maybeSingle = vi.fn(async () => result(null));
  chain.single = vi.fn(async () => {
    if (table === 'baseball_import_runs') return result({ id: 'run-1' });
    if (table === 'baseball_player_stats') return result({ id: 'stat-new-1' });
    return result({ id: `${table}-1` });
  });
  chain.then = (resolve: (v: unknown) => unknown) => {
    if (table === 'baseball_import_sources') return resolve(result(sourcePolicyRow ? [sourcePolicyRow] : []));
    return resolve(result([]));
  };
  chain.insert = vi.fn((rows: Row | Row[]) => {
    (inserted[table] ??= []).push(...(Array.isArray(rows) ? rows : [rows]));
    return {
      select: vi.fn(() => ({
        single: vi.fn(async () =>
          table === 'baseball_import_runs' ? result({ id: 'run-1' }) : result({ id: 'stat-new-1' }),
        ),
      })),
      then: (r: (v: unknown) => unknown) => r(result(null)),
    };
  });
  chain.update = vi.fn(() => ({ eq: vi.fn(() => ({ then: (r: (v: unknown) => unknown) => r(result(null)) })) }));
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

import { commitImport } from '@/app/baseball/actions/imports';

function baseArgs() {
  return {
    teamId: 'team-1',
    sourceId: 'trackman',
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
        confidence: 0.92,
        matchTier: 'fuzzy_name' as const,
        isManualMatch: false,
        action: 'create' as const,
      },
    ],
  };
}

beforeEach(() => {
  for (const k of Object.keys(inserted)) delete inserted[k];
  sourcePolicyRow = null;
});

describe('Import commit stamps full provenance on every written stat row (#377)', () => {
  it('a registered source stamps trust/visibility/match-confidence/match-tier', async () => {
    sourcePolicyRow = {
      id: 'src-1',
      trust_level: 'official',
      default_visibility: 'player_visible',
      required_review: false,
      dedupe_strictness: 'standard',
      player_match_strategy: 'name_then_external_id',
      external_id_namespace: null,
      enabled: true,
    };

    await commitImport(baseArgs());

    const statRow = (inserted['baseball_player_stats'] ?? [])[0];
    expect(statRow).toBeTruthy();
    expect(statRow?.source).toBe('import:trackman');
    expect(statRow?.source_trust_level).toBe('official');
    expect(statRow?.source_visibility).toBe('player_visible');
    // player_matching_v2.md: the chosen resolution + confidence are stamped
    // per row, not just stored on the import run.
    expect(statRow?.source_match_confidence).toBe(0.92);
    expect(statRow?.source_match_tier).toBe('fuzzy_name');
  });

  it('an UNREGISTERED source falls back to ADAPTER_DEFAULT_POLICY — never an inflated trust level', async () => {
    sourcePolicyRow = null; // not registered for the team

    await commitImport(baseArgs());

    const statRow = (inserted['baseball_player_stats'] ?? [])[0];
    expect(statRow?.source_trust_level).toBe('unreviewed');
    expect(statRow?.source_visibility).toBe('staff_only');
    // The fallback still stamps the match resolution — provenance is never
    // dropped just because the source registry entry is missing.
    expect(statRow?.source_match_confidence).toBe(0.92);
    expect(statRow?.source_match_tier).toBe('fuzzy_name');
  });
});

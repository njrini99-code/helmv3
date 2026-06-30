// =============================================================================
// src/contracts/baseball/source-trust/lineage-and-raw-file.test.ts
//
// PRODUCT TRUTH THIS FILE PINS:
//   1. The server NEVER trusts a client-supplied file hash. `fingerprintBody`
//      recomputes the SHA-256 over the exact bytes that will be stored, and
//      `CommitImportArgs` carries no hash field at all — the only client input
//      is the raw transport body, never a pre-computed digest.
//   2. A committed run writes a lineage row (`baseball_stat_uploads`) carrying
//      the mapping config + a before/after rollback snapshot, and upserts
//      `baseball_player_external_ids` so future re-imports resolve
//      deterministically.
//   3. A `required_review` source HOLDS the run: it stages the full plan on
//      the lineage row but writes ZERO stat rows — no premature trust.
//
// Reuses the established `vi.mock('@/lib/baseball/with-baseball-action', ...)`
// passthrough + table-aware recorder pattern (imports-registry.test.ts).
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fingerprintBody } from '@/lib/baseball/adapters/file-fingerprint';
import type { CommitImportArgs } from '@/app/baseball/actions/imports';

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
const upserted: Record<string, Row[]> = {};
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
  chain.update = vi.fn((row: Row) => {
    (inserted[`${table}:update`] ??= []).push(row);
    return { eq: vi.fn(() => ({ then: (r: (v: unknown) => unknown) => r(result(null)) })) };
  });
  chain.upsert = vi.fn((rows: Row | Row[]) => {
    (upserted[table] ??= []).push(...(Array.isArray(rows) ? rows : [rows]));
    return { then: (r: (v: unknown) => unknown) => r(result(null)) };
  });
  return chain;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => tableHandle(table),
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
    storage: { from: () => ({ upload: vi.fn(async () => ({ error: null })) }) },
  })),
}));

import { commitImport } from '@/app/baseball/actions/imports';

const RAW_CSV = 'player,ab,h,external_id\nMike Trout,4,2,EXT-1';

function baseArgs(): CommitImportArgs {
  return {
    teamId: 'team-1',
    sourceId: 'trackman',
    fileName: 'box.csv',
    statType: 'game',
    sessionDate: '2026-03-01',
    sessionName: 'vs State',
    headers: ['player', 'ab', 'h', 'external_id'],
    mapping: { player_name: 'player', at_bats: 'ab', hits: 'h' },
    rows: [{ player: 'Mike Trout', ab: '4', h: '2', external_id: 'EXT-1' }],
    matches: [
      {
        rowIndex: 0,
        sourceName: 'Mike Trout',
        playerId: 'p1',
        playerName: 'Mike Trout',
        confidence: 1,
        matchTier: 'exact_roster',
        isManualMatch: false,
        action: 'create',
      },
    ],
    rawFileBody: RAW_CSV,
  };
}

beforeEach(() => {
  for (const k of Object.keys(inserted)) delete inserted[k];
  for (const k of Object.keys(upserted)) delete upserted[k];
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
});

describe('File fingerprint — server never trusts a client-supplied hash (#377)', () => {
  it('CommitImportArgs carries no hash field; the only client input is the raw body', () => {
    const args = baseArgs();
    expect('fileHash' in args).toBe(false);
    expect('hash' in args).toBe(false);
    expect(args.rawFileBody).toBe(RAW_CSV);
  });

  it('the committed run header carries the SAME hash fingerprintBody computes over the raw body — independently verifiable', async () => {
    const expected = await fingerprintBody(RAW_CSV);

    await commitImport(baseArgs());

    const runHeader = (inserted['baseball_import_runs'] ?? [])[0];
    expect(runHeader?.file_hash).toBe(expected.fileHash);
    expect(runHeader?.file_bytes).toBe(expected.fileBytes);
  });

  it('a forged/extra hash-shaped field on the args object is never read or trusted', async () => {
    const tampered = { ...baseArgs(), fileHash: 'not-a-real-hash' } as CommitImportArgs & {
      fileHash: string;
    };
    const expected = await fingerprintBody(RAW_CSV);

    await commitImport(tampered);

    const runHeader = (inserted['baseball_import_runs'] ?? [])[0];
    expect(runHeader?.file_hash).toBe(expected.fileHash);
    expect(runHeader?.file_hash).not.toBe('not-a-real-hash');
  });
});

describe('Lineage row — mapping config + rollback snapshot + external-id upsert (#377)', () => {
  it('a committed run writes baseball_stat_uploads with the mapping config + before/after snapshot', async () => {
    await commitImport(baseArgs());

    const lineageRow = (upserted['baseball_stat_uploads'] ?? [])[0];
    expect(lineageRow).toBeTruthy();
    expect(lineageRow?.mapping_config).toEqual(baseArgs().mapping);
    expect(lineageRow?.status).toBe('completed');
    const data = lineageRow?.unmatched_data as { snapshot?: Array<Record<string, unknown>> };
    expect(Array.isArray(data?.snapshot)).toBe(true);
    expect(data?.snapshot?.[0]?.action).toBe('create');
    expect(data?.snapshot?.[0]?.before).toBeNull();
  });

  it('a committed run upserts baseball_player_external_ids for deterministic future matching', async () => {
    await commitImport(baseArgs());

    const extIdRow = (upserted['baseball_player_external_ids'] ?? [])[0];
    expect(extIdRow).toBeTruthy();
    expect(extIdRow?.team_id).toBe('team-1');
    expect(extIdRow?.player_id).toBe('p1');
    expect(extIdRow?.external_id).toBe('EXT-1');
  });
});

describe('required_review HOLDS the run — staged plan, zero stat rows (#377)', () => {
  beforeEach(() => {
    sourcePolicyRow = {
      id: 'src-2',
      trust_level: 'official',
      default_visibility: 'player_visible',
      required_review: true,
      dedupe_strictness: 'standard',
      player_match_strategy: 'name_then_external_id',
      external_id_namespace: null,
      enabled: true,
    };
  });

  it('stages the full plan on baseball_stat_uploads and writes ZERO baseball_player_stats rows', async () => {
    const res = await commitImport(baseArgs());

    expect(res.heldForReview).toBe(true);
    expect(inserted['baseball_player_stats'] ?? []).toHaveLength(0);
    expect(upserted['baseball_player_external_ids'] ?? []).toHaveLength(0);

    const staged = (inserted['baseball_stat_uploads'] ?? [])[0];
    expect(staged).toBeTruthy();
    expect(staged?.status).toBe('needs_review');
    expect(staged?.mapping_config).toEqual(baseArgs().mapping);
    const data = staged?.unmatched_data as { staged?: boolean; matches?: unknown[] };
    expect(data?.staged).toBe(true);
    expect(Array.isArray(data?.matches)).toBe(true);
  });
});

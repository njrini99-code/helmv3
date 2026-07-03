// =============================================================================
// src/app/baseball/actions/__tests__/upload-stats-csv.test.ts
//
// Regression coverage for two PR #664 follow-up fixes to uploadStatsCSV:
//
//   1. SECURITY — coach-supplied playerMatches[].playerId is now verified
//      against the target team's own roster (fetched server-side) before any
//      upload/stat row is written. A playerId that isn't on the roster is
//      rejected with a structured, listable error instead of being trusted
//      and inserted (which would let a coach fabricate baseball_player_stats
//      rows for a player on a different team).
//   2. HONESTY — when the bulk insert into baseball_player_stats fails, the
//      upload row is now stamped status:'failed' + error_message is
//      persisted, instead of being unconditionally stamped 'completed' with
//      a nonzero processed_count despite zero rows actually being persisted.
//
// withBaseballAction is mocked to a passthrough that injects a known ctx so
// the tests exercise the real uploadStatsCSV body; createClient is a
// table-aware recorder (same pattern as imports-registry.test.ts).
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

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
}));

// ---- table-aware Supabase recorder -----------------------------------------

type Row = Record<string, unknown>;

// Team roster for 'team-1' — the only playerIds that are legitimately
// assignable by a coachMatch for this team.
const ROSTER = [
  { player_id: 'p1', baseball_players: { id: 'p1', first_name: 'Mike', last_name: 'Trout' } },
  { player_id: 'p2', baseball_players: { id: 'p2', first_name: 'Shohei', last_name: 'Ohtani' } },
];

let insertStatsShouldFail = false;
const insertedStatRows: Row[] = [];
const uploadUpdates: Row[] = [];
let uploadInsertRow: Row | null = null;
let uploadInsertCount = 0;

function baseChain(defaultResult: { data: unknown; error: unknown }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {};
  for (const m of ['select', 'eq', 'order', 'limit', 'in', 'or']) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: unknown) => unknown) => resolve(defaultResult);
  chain.single = vi.fn(async () => defaultResult);
  chain.maybeSingle = vi.fn(async () => defaultResult);
  return chain;
}

function tableHandle(table: string) {
  if (table === 'baseball_team_members') {
    return baseChain({ data: ROSTER, error: null });
  }

  if (table === 'baseball_stat_uploads') {
    const chain = baseChain({ data: null, error: null });
    chain.insert = vi.fn((row: Row) => {
      uploadInsertRow = row;
      uploadInsertCount += 1;
      return {
        select: () => ({
          single: async () => ({ data: { id: 'upload-1', ...row }, error: null }),
        }),
      };
    });
    chain.update = vi.fn((row: Row) => {
      uploadUpdates.push(row);
      return { eq: vi.fn(async () => ({ data: null, error: null })) };
    });
    return chain;
  }

  if (table === 'baseball_player_stats') {
    // Used both for the bulk insert AND (on success) by
    // recalculatePlayerAggregates' select of the player's full stat history.
    const chain = baseChain({ data: [], error: null });
    chain.insert = vi.fn(async (rows: Row | Row[]) => {
      const asArray = Array.isArray(rows) ? rows : [rows];
      insertedStatRows.push(...asArray);
      return insertStatsShouldFail
        ? { error: { message: 'insert failed: constraint violation' } }
        : { error: null };
    });
    return chain;
  }

  if (table === 'baseball_player_aggregates') {
    const chain = baseChain({ data: null, error: null });
    chain.delete = vi.fn(() => chain);
    chain.upsert = vi.fn(async () => ({ error: null }));
    return chain;
  }

  return baseChain({ data: [], error: null });
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => tableHandle(table),
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
  })),
}));

// ---- import AFTER mocks -----------------------------------------------------

import { uploadStatsCSV } from '@/app/baseball/actions/stats';

const CSV_CONTENT = ['player,ab,h', 'Mike Trout,4,2', 'Shohei Ohtani,3,1'].join('\n');

beforeEach(() => {
  vi.clearAllMocks();
  insertStatsShouldFail = false;
  insertedStatRows.length = 0;
  uploadUpdates.length = 0;
  uploadInsertRow = null;
  uploadInsertCount = 0;
});

describe('uploadStatsCSV — coachMatch roster-membership enforcement', () => {
  it('rejects a playerMatches[].playerId that is not on the target team roster', async () => {
    const result = await uploadStatsCSV(
      'team-1',
      CSV_CONTENT,
      'game',
      '2026-06-01',
      undefined,
      undefined,
      [
        {
          csvName: 'Mike Trout',
          playerId: 'player-on-a-different-team',
          playerName: 'Mike Trout',
          confidence: 1,
          isManualMatch: true,
        },
      ],
    );

    expect(result.success).toBe(false);
    expect(result.invalidPlayerMatches).toEqual([
      { csvName: 'Mike Trout', playerId: 'player-on-a-different-team' },
    ]);
    expect(result.error).toContain('roster');

    // Fail-closed BEFORE any write: no upload row and no stat row were created.
    expect(uploadInsertCount).toBe(0);
    expect(insertedStatRows).toHaveLength(0);
  });

  it('accepts a manual playerMatches[].playerId that IS on the target team roster', async () => {
    const result = await uploadStatsCSV(
      'team-1',
      CSV_CONTENT,
      'game',
      '2026-06-01',
      undefined,
      undefined,
      [
        {
          csvName: 'Mike Trout',
          playerId: 'p2', // manual re-assignment to a different, but valid, roster player
          playerName: 'Shohei Ohtani',
          confidence: 1,
          isManualMatch: true,
        },
      ],
    );

    expect(result.success).toBe(true);
    expect(result.invalidPlayerMatches).toBeUndefined();
    expect(insertedStatRows.some((r) => r.player_id === 'p2')).toBe(true);
    // Confirms the upload record IS created once validation passes.
    expect(uploadInsertRow).toMatchObject({ team_id: 'team-1', coach_id: 'coach-1' });
  });

  it('rejects the whole upload when only SOME playerMatches entries are off-roster', async () => {
    const result = await uploadStatsCSV(
      'team-1',
      CSV_CONTENT,
      'game',
      '2026-06-01',
      undefined,
      undefined,
      [
        {
          csvName: 'Mike Trout',
          playerId: 'p1', // valid
          playerName: 'Mike Trout',
          confidence: 1,
          isManualMatch: false,
        },
        {
          csvName: 'Shohei Ohtani',
          playerId: 'not-on-roster',
          playerName: 'Shohei Ohtani',
          confidence: 1,
          isManualMatch: true,
        },
      ],
    );

    expect(result.success).toBe(false);
    expect(result.invalidPlayerMatches).toEqual([
      { csvName: 'Shohei Ohtani', playerId: 'not-on-roster' },
    ]);
    expect(insertedStatRows).toHaveLength(0);
  });
});

describe('uploadStatsCSV — honest status on bulk-insert failure', () => {
  it('stamps status "failed" + persists error_message instead of "completed" when the insert fails', async () => {
    insertStatsShouldFail = true;

    const result = await uploadStatsCSV('team-1', CSV_CONTENT, 'game', '2026-06-01');

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();

    // The upload record must never claim success when zero rows persisted.
    const lastUpdate = uploadUpdates[uploadUpdates.length - 1];
    expect(lastUpdate).toBeTruthy();
    expect(lastUpdate?.status).toBe('failed');
    expect(lastUpdate?.status).not.toBe('completed');
    expect(lastUpdate?.error_message).toBeTruthy();
    expect(lastUpdate?.processed_count).toBe(0);
  });

  it('stamps status "completed" with an accurate processed_count when the insert succeeds', async () => {
    insertStatsShouldFail = false;

    const result = await uploadStatsCSV('team-1', CSV_CONTENT, 'game', '2026-06-01');

    expect(result.success).toBe(true);
    const lastUpdate = uploadUpdates[uploadUpdates.length - 1];
    expect(lastUpdate?.status).toBe('completed');
    expect(lastUpdate?.error_message).toBeUndefined();
    expect(lastUpdate?.processed_count).toBe(2);
  });
});

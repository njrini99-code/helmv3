// @vitest-environment node
//
// stats-game-detail (#10) — the CSV box-score upload paths (`uploadBoxScoreCSV`
// and `resolveBoxScoreUpload`) previously saved via a bare
// `.delete().eq('game_id', ...)` followed by a separate `.insert()`, in
// violation of the no-destructive-writes rule. They now route through the
// same atomic `save_baseball_full_box_score` RPC as the manual entry flow.
//
// Because the RPC replaces BOTH batting and pitching in one call, these tests
// specifically prove the CSV paths preserve whichever side isn't present in
// the current upload (a batting-only CSV must not wipe previously saved
// pitching, and vice versa) and never call `.delete()` against the box-score
// tables directly.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const getUser = vi.fn();
const from = vi.fn();
const deleteCalls: string[] = [];

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser },
    from,
    rpc,
  })),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { uploadBoxScoreCSV, resolveBoxScoreUpload } from '@/app/baseball/actions/games';

/** A thenable chain mimicking the Supabase query builder — every method
 * returns the chain itself so any call order resolves to `finalResult`. */
function chain(table: string, finalResult: { data: unknown; error: unknown }) {
  const obj = {
    select: () => obj,
    eq: () => obj,
    order: () => obj,
    insert: () => obj,
    update: () => obj,
    delete: () => {
      deleteCalls.push(table);
      return obj;
    },
    single: async () => finalResult,
    maybeSingle: async () => finalResult,
    then: (resolve: (v: typeof finalResult) => void) => resolve(finalResult),
  };
  return obj;
}

const EXISTING_PITCHING_ROW = {
  id: 'bp-1',
  game_id: 'game-1',
  player_id: 'p2',
  team_id: 'team-1',
  ip: 5,
  h: 3,
  r: 1,
  er: 1,
  bb: 1,
  k: 4,
  hr: 0,
  pitch_count: 90,
  strikes: 60,
  result: 'W',
  era: 1.8,
  whip: 0.8,
  k9: 7.2,
  bb9: 1.8,
  created_at: '2026-06-01T00:00:00Z',
};

const EXISTING_BATTING_ROW = {
  id: 'bb-1',
  game_id: 'game-1',
  player_id: 'p1',
  team_id: 'team-1',
  batting_order: 1,
  ab: 4,
  r: 2,
  h: 3,
  doubles: 1,
  triples: 0,
  hr: 0,
  rbi: 2,
  bb: 0,
  k: 1,
  sb: 0,
  cs: 0,
  hbp: 0,
  sac: 0,
  sf: 0,
  lob: 1,
  avg: 0.75,
  obp: 0.75,
  slg: 1.0,
  ops: 1.75,
  created_at: '2026-06-01T00:00:00Z',
};

function mockSupabase(opts: {
  existingBatting?: unknown[];
  existingPitching?: unknown[];
  gameRow?: { team_id: string; our_score: number | null; opponent_score: number | null };
  uploadRow?: Record<string, unknown> | null;
} = {}) {
  deleteCalls.length = 0;
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

  const gameRow = opts.gameRow ?? { team_id: 'team-1', our_score: 2, opponent_score: 3 };
  const existingBatting = opts.existingBatting ?? [];
  const existingPitching = opts.existingPitching ?? [];

  from.mockImplementation((table: string) => {
    if (table === 'baseball_coaches') {
      return chain(table, { data: { id: 'coach-1', organization_id: 'org-1' }, error: null });
    }
    if (table === 'baseball_team_coach_staff') {
      return chain(table, { data: { id: 'staff-1', is_primary: true }, error: null });
    }
    if (table === 'baseball_team_members') {
      return chain(table, {
        data: [
          { player_id: 'p1', baseball_players: { id: 'p1', first_name: 'John', last_name: 'Smith' } },
          { player_id: 'p2', baseball_players: { id: 'p2', first_name: 'Alex', last_name: 'Jones' } },
        ],
        error: null,
      });
    }
    if (table === 'baseball_box_score_uploads') {
      return chain(table, {
        data: opts.uploadRow !== undefined ? opts.uploadRow : { id: 'upload-1' },
        error: null,
      });
    }
    if (table === 'baseball_games') {
      return chain(table, { data: gameRow, error: null });
    }
    if (table === 'baseball_box_score_batting') {
      return chain(table, { data: existingBatting, error: null });
    }
    if (table === 'baseball_box_score_pitching') {
      return chain(table, { data: existingPitching, error: null });
    }
    return chain(table, { data: null, error: null });
  });
}

const BATTING_CSV = `player_name,ab,r,h,2b,3b,hr,rbi,bb,k,sb,cs,hbp,sac,sf,lob
John Smith,4,1,2,0,0,1,2,0,1,1,0,0,0,0,1`;

const PITCHING_CSV = `player_name,ip,h,r,er,bb,k,hr,pitch_count,result
Alex Jones,6.0,5,3,2,1,7,0,95,W`;

describe('uploadBoxScoreCSV — atomic RPC save (no delete-then-insert)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('a batting-only CSV upload saves via the RPC once and preserves existing pitching', async () => {
    mockSupabase({ existingPitching: [EXISTING_PITCHING_ROW] });
    rpc.mockResolvedValue({ data: { success: true }, error: null });

    const result = await uploadBoxScoreCSV('team-1', 'game-1', BATTING_CSV, 'batting');

    expect(result.success).toBe(true);
    expect(result.allMatched).toBe(true);
    expect(result.completionError).toBeUndefined();

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      'save_baseball_full_box_score',
      expect.objectContaining({
        p_game_id: 'game-1',
        p_batting: expect.arrayContaining([expect.objectContaining({ player_id: 'p1' })]),
        // Pitching wasn't in this CSV — the preserved existing row must still
        // be present in the RPC call, or it would be silently wiped.
        p_pitching: expect.arrayContaining([expect.objectContaining({ player_id: 'p2' })]),
      }),
    );

    const rpcArgs = rpc.mock.calls[0]![1] as { p_batting: unknown[]; p_pitching: unknown[] };
    expect(rpcArgs.p_batting).toHaveLength(1);
    expect(rpcArgs.p_pitching).toHaveLength(1);

    // No direct delete() against the box-score tables anywhere in the path.
    expect(deleteCalls).toHaveLength(0);
  });

  it('a pitching-only CSV upload saves via the RPC once and preserves existing batting', async () => {
    mockSupabase({ existingBatting: [EXISTING_BATTING_ROW] });
    rpc.mockResolvedValue({ data: { success: true }, error: null });

    const result = await uploadBoxScoreCSV('team-1', 'game-1', PITCHING_CSV, 'pitching');

    expect(result.success).toBe(true);
    expect(result.allMatched).toBe(true);

    expect(rpc).toHaveBeenCalledTimes(1);
    const rpcArgs = rpc.mock.calls[0]![1] as { p_batting: unknown[]; p_pitching: unknown[] };
    expect(rpcArgs.p_batting).toHaveLength(1);
    expect(rpcArgs.p_batting[0]).toMatchObject({ player_id: 'p1' });
    expect(rpcArgs.p_pitching).toHaveLength(1);
    expect(rpcArgs.p_pitching[0]).toMatchObject({ player_id: 'p2' });

    expect(deleteCalls).toHaveLength(0);
  });

  it('surfaces an RPC failure as completionError without throwing', async () => {
    mockSupabase();
    rpc.mockResolvedValue({ data: { success: false, error: 'Box score save failed' }, error: null });

    const result = await uploadBoxScoreCSV('team-1', 'game-1', BATTING_CSV, 'batting');

    expect(result.success).toBe(true); // upload itself succeeded; save did not
    expect(result.completionError).toBe('Box score save failed');
  });
});

describe('resolveBoxScoreUpload — atomic RPC save (no delete-then-insert)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves unmatched players and saves via the RPC, preserving the other side', async () => {
    mockSupabase({
      existingPitching: [EXISTING_PITCHING_ROW],
      uploadRow: { id: 'upload-1', raw_content: BATTING_CSV, matched_players: [], team_id: 'team-1', game_id: 'game-1' },
    });
    rpc.mockResolvedValue({ data: { success: true }, error: null });

    const result = await resolveBoxScoreUpload(
      'upload-1',
      'game-1',
      [{ csvName: 'John Smith', playerId: 'p1' }],
      'batting',
    );

    expect(result.success).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
    const rpcArgs = rpc.mock.calls[0]![1] as { p_batting: unknown[]; p_pitching: unknown[] };
    expect(rpcArgs.p_batting).toHaveLength(1);
    expect(rpcArgs.p_pitching).toHaveLength(1);
    expect(rpcArgs.p_pitching[0]).toMatchObject({ player_id: 'p2' });

    expect(deleteCalls).toHaveLength(0);
  });
});

// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const getUser = vi.fn();
const from = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser },
    from,
    rpc,
  })),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { saveFullBoxScore } from '@/app/baseball/actions/games';

function mockSupabaseForSave() {
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  from.mockImplementation((table: string) => {
    if (table === 'baseball_coaches') {
      // capabilities.ts resolves the coach profile via .maybeSingle().
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { id: 'coach-1', organization_id: 'org-1' }, error: null }),
            maybeSingle: async () => ({ data: { id: 'coach-1', organization_id: 'org-1' }, error: null }),
          }),
        }),
      };
    }
    if (table === 'baseball_games') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { team_id: 'team-1' }, error: null }),
          }),
        }),
      };
    }
    if (table === 'baseball_team_coach_staff') {
      // capabilities.ts requests the full row via .select('*') and resolves
      // with .maybeSingle() — primary coach holds every capability.
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: async () => ({ data: { id: 'staff-1', is_primary: true }, error: null }),
              maybeSingle: async () => ({ data: { id: 'staff-1', is_primary: true }, error: null }),
            }),
          }),
        }),
      };
    }
    return {
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null, error: null }),
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    };
  });
}

const BATTING_LINE = {
  player_id: 'p1',
  ab: 4,
  r: 1,
  h: 2,
  doubles: 0,
  triples: 0,
  hr: 0,
  rbi: 1,
  bb: 0,
  k: 1,
  sb: 0,
  cs: 0,
  hbp: 0,
  sac: 0,
  sf: 0,
  lob: 0,
};

const PITCHING_LINE = {
  player_id: 'p2',
  ip: 5,
  h: 3,
  r: 1,
  er: 1,
  bb: 1,
  k: 4,
  hr: 0,
};

describe('saveFullBoxScore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseForSave();
  });

  it('uses one transactional RPC for batting + pitching + completion', async () => {
    rpc.mockResolvedValue({ data: { success: true }, error: null });

    const result = await saveFullBoxScore('game-1', [BATTING_LINE], [PITCHING_LINE], 5, 3);

    expect(result.success).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      'save_baseball_full_box_score',
      expect.objectContaining({
        p_game_id: 'game-1',
        p_our_score: 5,
        p_opponent_score: 3,
        p_batting: expect.arrayContaining([expect.objectContaining({ player_id: 'p1' })]),
        p_pitching: expect.arrayContaining([expect.objectContaining({ player_id: 'p2' })]),
      }),
    );
  });

  it('returns an error when the RPC reports failure (no partial commit)', async () => {
    rpc.mockResolvedValue({
      data: { success: false, error: 'Box score save failed' },
      error: null,
    });

    const result = await saveFullBoxScore('game-1', [BATTING_LINE], [PITCHING_LINE], 1, 0);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Box score save failed');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('surfaces transport errors from the RPC call', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'connection reset' } });

    const result = await saveFullBoxScore('game-1', [BATTING_LINE], [], 0, 0);

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  // #433 — the manual edit form previously opened blank on an existing box
  // score, so a re-save could silently drop rows. These cases prove that
  // re-supplying the full existing set (as the preloaded form now does) is
  // persisted without any reduction in row counts, including a row whose
  // only non-zero stats fall outside the old narrow ab/h/bb/r save filter.
  describe('regression — re-saving an existing box score preserves row counts', () => {
    it('persists the same batting + pitching row counts on a no-op re-save', async () => {
      let persistedBatting: Array<{ player_id: string }> = [];
      let persistedPitching: Array<{ player_id: string }> = [];
      rpc.mockImplementation(async (
        name: string,
        args: { p_batting: Array<{ player_id: string }>; p_pitching: Array<{ player_id: string }> },
      ) => {
        if (name === 'save_baseball_full_box_score') {
          persistedBatting = args.p_batting;
          persistedPitching = args.p_pitching;
          return { data: { success: true }, error: null };
        }
        return { data: null, error: { message: `unexpected rpc ${name}` } };
      });

      // A row whose only non-zero counting stats are outside the old narrow
      // ab/h/bb/r filter — e.g. a sac-fly/hit-by-pitch substitution with no
      // at-bat recorded. Directly covers the data-loss bug.
      const narrowFilterSurvivorRow = {
        player_id: 'p3',
        ab: 0, r: 0, h: 0, doubles: 0, triples: 0, hr: 0, rbi: 0, bb: 0, k: 0,
        sb: 0, cs: 1, hbp: 1, sac: 1, sf: 1, lob: 1,
      };
      const existingBatting = [BATTING_LINE, narrowFilterSurvivorRow];
      const existingPitching = [PITCHING_LINE];

      // First save — establishes the existing box score.
      const firstSave = await saveFullBoxScore('game-1', existingBatting, existingPitching, 5, 3);
      expect(firstSave.success).toBe(true);
      expect(persistedBatting).toHaveLength(2);
      expect(persistedPitching).toHaveLength(1);

      // Re-save without edits (the preloaded form resupplying the same set).
      const reSave = await saveFullBoxScore('game-1', existingBatting, existingPitching, 5, 3);
      expect(reSave.success).toBe(true);

      expect(persistedBatting).toHaveLength(2);
      expect(persistedPitching).toHaveLength(1);
      expect(persistedBatting.some((b) => b.player_id === 'p3')).toBe(true);
    });
  });
});

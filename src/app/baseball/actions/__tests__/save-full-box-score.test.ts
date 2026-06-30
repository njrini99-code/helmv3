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
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { id: 'coach-1', organization_id: 'org-1' }, error: null }),
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
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: async () => ({ data: { id: 'staff-1' }, error: null }),
            }),
          }),
        }),
      };
    }
    return {
      select: () => ({
        eq: () => ({ single: async () => ({ data: null, error: null }) }),
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
});

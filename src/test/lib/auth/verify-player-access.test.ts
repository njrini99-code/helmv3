import { describe, it, expect, vi, beforeEach } from 'vitest';

// logServerError is async and we don't want it to call admin tables in tests.
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));

// createClient should never be called when a supabase arg is passed.
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { verifyPlayerAccess, verifyTeamAccess } from '@/lib/auth/verify-player-access';

function makeSelfSupabase(ownPlayer: { id: string } | null, selfError: { message: string } | null = null) {
  return {
    from: vi.fn().mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: ownPlayer, error: selfError }),
          }),
        }),
      }),
    }),
    rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
  };
}

describe('verifyPlayerAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('grants when the user IS the player (self)', async () => {
    const sb = makeSelfSupabase({ id: 'player-1' });
    const result = await verifyPlayerAccess('player-1', 'user-1', sb as never);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('self');
    // RPC must not be called if self-check already matched.
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it('grants when the user is a coach staffing a team the player belongs to', async () => {
    const sb = {
      from: vi.fn().mockReturnValue({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      }),
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    };
    const result = await verifyPlayerAccess('player-1', 'user-1', sb as never);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('coach');
    expect(sb.rpc).toHaveBeenCalledWith('verify_coach_owns_player', {
      p_player_id: 'player-1',
      p_user_id: 'user-1',
    });
  });

  it('denies when neither self nor coach check passes', async () => {
    const sb = makeSelfSupabase(null);
    const result = await verifyPlayerAccess('player-1', 'user-1', sb as never);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('denied');
  });

  it('denies (fails closed) on self-check error', async () => {
    const sb = makeSelfSupabase(null, { message: 'network down' });
    const result = await verifyPlayerAccess('player-1', 'user-1', sb as never);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('denied');
  });

  it('denies (fails closed) on RPC error', async () => {
    const sb = {
      from: vi.fn().mockReturnValue({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      }),
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'rpc boom' } }),
    };
    const result = await verifyPlayerAccess('player-1', 'user-1', sb as never);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('denied');
  });
});

describe('verifyTeamAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('grants when the coach staffs the team', async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    };
    const result = await verifyTeamAccess('team-1', 'user-1', sb as never);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('coach');
    expect(sb.rpc).toHaveBeenCalledWith('verify_coach_owns_team', {
      p_team_id: 'team-1',
      p_user_id: 'user-1',
    });
  });

  it('denies when the coach does not staff the team', async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
    };
    const result = await verifyTeamAccess('team-1', 'user-1', sb as never);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('denied');
  });

  it('denies (fails closed) on RPC error', async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }),
    };
    const result = await verifyTeamAccess('team-1', 'user-1', sb as never);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('denied');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

// logServerError is async and we don't want it to call admin tables in tests.
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));

// createClient should never be called when a supabase arg is passed.
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import {
  verifyPlayerAccess,
  verifyTeamAccess,
  insightAccessDenialMessage,
} from '@/lib/auth/verify-player-access';

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

  it('denies (fails closed) on a deterministic self-check error', async () => {
    const sb = makeSelfSupabase(null, { message: 'column does not exist' });
    const result = await verifyPlayerAccess('player-1', 'user-1', sb as never);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('denied');
  });

  it('reports unavailable (not denied) when the self-check times out', async () => {
    const sb = makeSelfSupabase(null, {
      message: 'TimeoutError: The operation was aborted due to timeout',
    });
    const result = await verifyPlayerAccess('player-1', 'user-1', sb as never);
    // Still fails closed — the label changes, the permission does not.
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('unavailable');
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

  it('grants when the coach staffs the team and returns the matched coachId', async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({ data: 'coach-uuid-1', error: null }),
    };
    const result = await verifyTeamAccess('team-1', 'user-1', sb as never);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('coach');
    expect(result.coachId).toBe('coach-uuid-1');
    expect(sb.rpc).toHaveBeenCalledWith('coach_id_for_team', {
      p_team_id: 'team-1',
      p_user_id: 'user-1',
    });
  });

  it('denies when the coach does not staff the team', async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const result = await verifyTeamAccess('team-1', 'user-1', sb as never);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('denied');
    expect(result.coachId).toBeUndefined();
  });

  it('denies when RPC returns an empty string (defensive)', async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({ data: '', error: null }),
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

  it('does not retry a deterministic RPC error', async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }),
    };
    await verifyTeamAccess('team-1', 'user-1', sb as never);
    expect(sb.rpc).toHaveBeenCalledTimes(1);
  });
});

/**
 * The server Supabase client aborts any request over 10s
 * (src/lib/supabase/server.ts). Before 2026-07-28 that abort made
 * `verifyTeamAccess` answer `denied`, so a slow database logged a legitimate
 * coach out of their own team — `verifyTeamAccess failed: TimeoutError: The
 * operation was aborted due to timeout` was the largest server incident class
 * (n=9) in the 2026-07 Bridge export.
 */
describe('verifyTeamAccess under a transport abort', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Verbatim supabase-js shape after a failed fetch: not an Error, no `name`,
  // empty `code`.
  const abortError = {
    message: 'TimeoutError: The operation was aborted due to timeout',
    details: '',
    hint: '',
    code: '',
  };

  it('retries once and grants when the retry succeeds', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: abortError })
      .mockResolvedValueOnce({ data: 'coach-uuid-1', error: null });

    const result = await verifyTeamAccess('team-1', 'user-1', { rpc } as never);

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('coach');
    expect(result.coachId).toBe('coach-uuid-1');
  });

  it('reports unavailable, still fails closed, when both attempts abort', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: abortError });

    const result = await verifyTeamAccess('team-1', 'user-1', { rpc } as never);

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('unavailable');
    expect(result.coachId).toBeUndefined();
  });

  it('recovers when the abort is THROWN rather than returned', async () => {
    // The underlying fetch can reject before supabase-js converts the
    // rejection into a returned `{ error }` pair.
    const thrown = Object.assign(new Error('The operation was aborted due to timeout'), {
      name: 'TimeoutError',
    });
    const rpc = vi
      .fn()
      .mockRejectedValueOnce(thrown)
      .mockResolvedValueOnce({ data: 'coach-uuid-1', error: null });

    const result = await verifyTeamAccess('team-1', 'user-1', { rpc } as never);

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(result.allowed).toBe(true);
    expect(result.coachId).toBe('coach-uuid-1');
  });

  it('never turns a transport abort into a grant', async () => {
    // The retry must not be able to invent access: a null answer after a
    // transient first attempt is still a denial, not a grant.
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: abortError })
      .mockResolvedValueOnce({ data: null, error: null });

    const result = await verifyTeamAccess('team-1', 'user-1', { rpc } as never);

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('denied');
  });
});

describe('insightAccessDenialMessage', () => {
  it('keeps the 404 wording for a missing insight', () => {
    expect(insightAccessDenialMessage('not-found')).toBe('Insight not found');
  });

  it('says "not authorized" only for a real denial', () => {
    expect(insightAccessDenialMessage('denied')).toBe('Not authorized');
    expect(insightAccessDenialMessage(undefined)).toBe('Not authorized');
  });

  it('does NOT claim a permission problem when the check could not run', () => {
    const message = insightAccessDenialMessage('unavailable');
    expect(message).toBe('Temporarily unavailable. Please try again.');
    expect(message).not.toMatch(/authori[sz]/i);
  });
});

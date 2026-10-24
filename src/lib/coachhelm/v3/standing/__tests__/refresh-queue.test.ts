import { beforeEach, describe, expect, it, vi } from 'vitest';

/** The round save's Standing mark (Clubhouse A+ rows 105/121): one RPC, never a throw, quiet until its held migration is applied. */

const rpc = vi.hoisted(() => vi.fn());
const logServerError = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError }));

import { isStandingQueueMissing, isStandingRefreshBusy, markTeamStandingDirty } from '../refresh-queue';

beforeEach(() => {
  rpc.mockReset();
  logServerError.mockClear();
});

describe('markTeamStandingDirty', () => {
  it('marks the player’s teams through mark_team_standing_dirty and says how many', async () => {
    rpc.mockResolvedValue({ data: 2, error: null });
    await expect(markTeamStandingDirty('p1')).resolves.toEqual({ status: 'marked', teams: 2 });
    expect(rpc).toHaveBeenCalledWith('mark_team_standing_dirty', { p_player_id: 'p1' });
    expect(logServerError).not.toHaveBeenCalled();
  });

  it('before the migration is applied the missing function is quiet: not_applied, nothing logged', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.mark_team_standing_dirty' } });
    await expect(markTeamStandingDirty('p1')).resolves.toEqual({ status: 'not_applied' });
    expect(logServerError).not.toHaveBeenCalled();
  });

  it('any other error is a warning and a failed mark, never a throw', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '57014', message: 'canceling statement due to lock timeout' } });
    await expect(markTeamStandingDirty('p1')).resolves.toEqual({ status: 'failed' });
    expect(logServerError).toHaveBeenCalledWith(expect.stringMatching(/lock timeout/), expect.objectContaining({ action: 'standing.markDirty', playerId: 'p1' }), 'warning');
  });

  it('a client that throws (and a logger that throws too) still resolves', async () => {
    rpc.mockRejectedValue(new Error('fetch failed'));
    logServerError.mockRejectedValueOnce(new Error('logger down'));
    await expect(markTeamStandingDirty('p1')).resolves.toEqual({ status: 'failed' });
  });
});

describe('isStandingQueueMissing', () => {
  // Only PostgREST's "no such function" means the migration is not applied. 42883 / 42P01 come from inside a function that
  // exists (its body calls something missing): a real failure, which must surface.
  it.each([
    [{ code: 'PGRST202' }, true],
    [{ code: '42883' }, false],
    [{ code: '42P01' }, false],
    [{ code: 'PGRST205' }, false],
    [{ code: '57014' }, false],
    [null, false],
  ])('%j -> %s', (error, expected) => {
    expect(isStandingQueueMissing(error)).toBe(expected);
  });

  it('55P03 (the season lock is held past lock_timeout) is busy, nothing else is', () => {
    expect(isStandingRefreshBusy({ code: '55P03' })).toBe(true);
    expect(isStandingRefreshBusy({ code: '40P01' })).toBe(false);
    expect(isStandingRefreshBusy(null)).toBe(false);
  });
});

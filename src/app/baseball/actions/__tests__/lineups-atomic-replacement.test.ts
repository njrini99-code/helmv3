import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const from = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ from, rpc })),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn() }));
vi.mock('@/lib/baseball/capabilities', () => ({
  BaseballCapabilityError: class extends Error {},
  requireBaseballCapability: vi.fn(async () => {}),
}));
vi.mock('@/lib/baseball/with-baseball-action', () => ({
  BaseballUnauthorizedError: class extends Error {},
  BaseballNoActiveTeamError: class extends Error {},
  BaseballActionError: class extends Error {},
  withBaseballAction:
    (_name: string, _options: unknown, fn: (ctx: unknown, ...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      fn(
        {
          user: { id: 'coach-user-1' },
          activeCoachId: 'coach-1',
          activeTeamId: 'team-1',
        },
        ...args,
      ),
}));
vi.mock('@/lib/admin/observed-action', () => ({
  withAdminObserved: (_name: string, _options: unknown, fn: unknown) => fn,
}));

import { updateLineup } from '@/app/baseball/actions/lineups';

describe('updateLineup — atomic position replacement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    from.mockImplementation((table: string) => {
      // updateLineup now verifies the incoming positions against the lineup's
      // team before calling the RPC. That is a READ, so it does not weaken the
      // guard below — which exists to catch a direct position delete/insert
      // sneaking back in place of the transactional RPC.
      if (table === 'baseball_team_members') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(async () => ({
                data: [{ player_id: 'player-1' }, { player_id: 'player-2' }],
                error: null,
              })),
            })),
          })),
        };
      }
      if (table !== 'baseball_team_lineups') {
        throw new Error(`Unexpected direct table write: ${table}`);
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: { id: 'lineup-1', team_id: 'team-1' },
              error: null,
            })),
          })),
        })),
      };
    });
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
  });

  it('uses the transactional replacement RPC instead of direct delete/insert requests', async () => {
    const result = await updateLineup('lineup-1', {
      name: 'Opening Day',
      positions: [
        { order: 1, playerId: 'player-1' },
        { order: 2, playerId: 'player-2' },
      ],
    });

    expect(result).toEqual({ success: true });
    expect(rpc).toHaveBeenCalledWith('baseball_replace_lineup_positions', {
      p_lineup_id: 'lineup-1',
      p_name: 'Opening Day',
      p_positions: [
        { batting_order: 1, player_id: 'player-1' },
        { batting_order: 2, player_id: 'player-2' },
      ],
    });
    // Was `toHaveBeenCalledTimes(1)`. The intent is that positions are never
    // touched through a direct table call — the count was a proxy for that,
    // and it stopped being one when the roster READ was added. Assert the
    // intent directly instead, so the guard survives further reads while still
    // failing the moment a delete/insert on baseball_lineup_positions returns.
    const tablesTouched = from.mock.calls.map((c) => c[0]);
    expect(tablesTouched).toEqual(['baseball_team_lineups', 'baseball_team_members']);
    expect(tablesTouched).not.toContain('baseball_lineup_positions');
  });

  it('preserves a permission denial returned by the privileged RPC boundary', async () => {
    rpc.mockResolvedValueOnce({ data: { ok: false, reason: 'forbidden' }, error: null });

    const result = await updateLineup('lineup-1', {
      name: 'Opening Day',
      positions: [{ order: 1, playerId: 'player-1' }],
    });

    expect(result).toEqual({
      success: false,
      error: 'You do not have permission to manage lineups',
    });
  });
});

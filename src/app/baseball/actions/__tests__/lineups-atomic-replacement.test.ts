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
    expect(from).toHaveBeenCalledTimes(1);
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

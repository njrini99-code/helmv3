/**
 * The database SG RPC is lifecycle-authorized to update completed history.
 * invalidateOnRoundComplete must call that one writer and never follow it with
 * an application-side golf_rounds update, which the completed-round guard
 * correctly rejects.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  logServerError: vi.fn(async () => {}),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: mocks.rpc, from: mocks.from }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: mocks.logServerError,
}));

import { invalidateOnRoundComplete } from '../golf-stats-calculator';

function selectBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  builder.eq = () => builder;
  builder.maybeSingle = async () => result;
  builder.then = (
    onfulfilled?: (value: unknown) => unknown,
    onrejected?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(onfulfilled, onrejected);
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ error: null });
  mocks.from.mockImplementation((table: string) => {
    if (table === 'golf_player_stats_cache') {
      return {
        select: () => selectBuilder({
          data: {
            rounds_played: 0,
            scoring_average: null,
            putts_per_round: null,
            driving_accuracy_percentage: null,
            gir_percentage: null,
            is_stale: false,
            updated_at: '2026-08-25T00:00:00Z',
          },
          error: null,
        }),
      };
    }

    if (table === 'golf_rounds') {
      return {
        select: () => selectBuilder({ data: [], error: null }),
        update: () => {
          throw new Error('completed golf_rounds history must only be written by the SG RPC');
        },
      };
    }

    throw new Error(`unexpected table access: ${table}`);
  });
});

describe('invalidateOnRoundComplete', () => {
  it('uses the lifecycle-authorized SG RPC without a second completed-round write', async () => {
    const result = await invalidateOnRoundComplete('player-1', 'round-1');

    expect(result).toEqual({ warnings: [] });
    expect(mocks.rpc).toHaveBeenCalledWith('recalculate_round_strokes_gained', { p_round_id: 'round-1' });
    expect(mocks.from).not.toHaveBeenCalledWith('golf_round_stats_cache');
    expect(mocks.logServerError).not.toHaveBeenCalled();
  });
});

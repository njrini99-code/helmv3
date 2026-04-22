import { describe, it, expect, vi } from 'vitest';
import { ShotStateIntelligence } from '@/lib/coachhelm/v2/mining/shot-state-intelligence';

describe('ShotStateIntelligence.loadShotStates scope (LIVE-18)', () => {
  it('filters golf_rounds by player_id, not the entire platform', async () => {
    // Build a chain that records every `.eq(col, val)` call.
    const eqCalls: Array<[string, string]> = [];
    const orderSpy = vi.fn().mockReturnValue({
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
    const eqChain = (col: string, val: string) => {
      eqCalls.push([col, val]);
      return {
        eq: eqChain,
        order: orderSpy,
      };
    };
    const selectSpy = vi.fn().mockReturnValue({ eq: eqChain });
    const supabaseMock = { from: vi.fn().mockReturnValue({ select: selectSpy }) };

    const intel = new ShotStateIntelligence('player-42');
    (intel as unknown as { supabase: typeof supabaseMock }).supabase = supabaseMock;

    await (
      intel as unknown as { loadShotStates: () => Promise<unknown[]> }
    ).loadShotStates();

    const playerEqCalls = eqCalls.filter(([col]) => col === 'player_id');
    expect(playerEqCalls.length).toBeGreaterThan(0);
    expect(playerEqCalls[0]?.[1]).toBe('player-42');
  });
});

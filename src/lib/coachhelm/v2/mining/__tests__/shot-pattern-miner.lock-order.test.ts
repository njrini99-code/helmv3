import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Root-cause guard for `Failed to save CoachHelm shot patterns: deadlock
// detected` (admin_events n=3, 2026-06-29 → 2026-07-22, surfaced to coaches as
// `getPlayerCoachHelmDashboard failed: …`).
//
// `INSERT … ON CONFLICT DO UPDATE` locks rows in the order they appear in the
// statement. savePatterns used to pass them in pattern-DETECTION order, which
// differs per caller — the dashboard, the safety-net cron, the validation cron
// and the calibration cron each mine a different window of the same player's
// shots, so they emit an overlapping id set in different sequences. Two writers
// landing together locked shared rows in opposite orders, and Postgres broke
// the cycle by killing one with 40P01.
//
// Measured with two real Postgres writers over the same 40 ids: opposing orders
// deadlocked 7 of 16 statements; sorted, 0 of 16. So the invariant this file
// pins is not cosmetic — a total, shared lock order is what makes concurrent
// writers queue instead of cycle.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  upsertPayloads: [] as Array<Array<{ id: string }>>,
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      upsert: (rows: Array<{ id: string }>) => {
        mocks.upsertPayloads.push(rows);
        return Promise.resolve({ data: null, error: null });
      },
    }),
  }),
}));

const { ShotPatternMiner } = await import('@/lib/coachhelm/v2/mining/shot-pattern-miner');

interface MinerInternals {
  savePatterns: (patterns: unknown[]) => Promise<void>;
}

/**
 * A pattern whose derived |stroke_impact| clears the 0.1 persistence floor.
 * magnitude = (1 - distanceControlScore) * topMissFrequency * 1.5 * confidence
 *           = 0.6 * 0.7 * 1.5 * 0.8 = 0.504
 */
function pattern(id: string) {
  return {
    id,
    playerId: 'player-1',
    situation: {
      distanceRange: { min: 140, max: 160, label: '140-160y' },
      lie: 'fairway',
    },
    tendencies: [{ direction: 'right', frequency: 0.7 }],
    dispersionPattern: 'right-biased',
    avgProximity: 30,
    distanceControlScore: 0.4,
    confidence: 0.8,
    sampleSize: 12,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-20T00:00:00.000Z',
    insight: 'misses right',
    recommendation: 'aim left',
  };
}

/** Ids chosen so detection order and sorted order genuinely differ. */
const IDS = ['ddd', 'aaa', 'ccc', 'bbb'];

describe('ShotPatternMiner.savePatterns lock ordering', () => {
  beforeEach(() => {
    mocks.upsertPayloads.length = 0;
  });

  it('upserts rows sorted by the conflict key, not in detection order', async () => {
    const miner = new ShotPatternMiner('player-1');
    await (miner as unknown as MinerInternals).savePatterns(IDS.map(pattern));

    expect(mocks.upsertPayloads).toHaveLength(1);
    expect(mocks.upsertPayloads[0]!.map((r) => r.id)).toEqual(['aaa', 'bbb', 'ccc', 'ddd']);
  });

  it('gives two writers the SAME lock order from opposite detection orders', async () => {
    // This is the property that removes the deadlock: whatever order each
    // concurrent miner detected its patterns in, both statements lock the
    // shared rows in one shared sequence.
    const forward = new ShotPatternMiner('player-1');
    await (forward as unknown as MinerInternals).savePatterns(IDS.map(pattern));

    const reversed = new ShotPatternMiner('player-1');
    await (reversed as unknown as MinerInternals).savePatterns(
      [...IDS].reverse().map(pattern),
    );

    const [first, second] = mocks.upsertPayloads;
    expect(first!.map((r) => r.id)).toEqual(second!.map((r) => r.id));
  });

  it('sorts a copy — the caller\'s pattern array is not mutated', async () => {
    const patterns = IDS.map(pattern);
    const miner = new ShotPatternMiner('player-1');
    await (miner as unknown as MinerInternals).savePatterns(patterns);

    expect(patterns.map((p) => p.id)).toEqual(IDS);
  });

  it('still drops sub-threshold patterns before ordering', async () => {
    const weak = { ...pattern('zzz'), confidence: 0.01, distanceControlScore: 0.99 };
    const miner = new ShotPatternMiner('player-1');
    await (miner as unknown as MinerInternals).savePatterns([weak, pattern('aaa')]);

    expect(mocks.upsertPayloads[0]!.map((r) => r.id)).toEqual(['aaa']);
  });
});

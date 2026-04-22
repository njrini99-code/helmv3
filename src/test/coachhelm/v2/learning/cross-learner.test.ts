import { describe, it, expect, vi } from 'vitest';
import { CrossLearner } from '@/lib/coachhelm/v2/learning/cross-learner';

describe('CrossLearner.saveGlobalPatterns', () => {
  it('writes the canonical column set to golf_global_patterns', async () => {
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabaseMock = { from: vi.fn().mockReturnValue({ upsert: upsertSpy }) };

    const learner = new CrossLearner();
    const patterns = [
      {
        signature: 'sig-1',
        patternType: 'driving',
        conditions: [{ lie: 'tee' }],
        outcome: { score_delta: 0.5 },
        prevalence: 0.2,
        averageImpact: 0.3,
        confidence: 0.8,
        instanceCount: 10,
        playerCount: 5,
        variedByTier: { d1: 0.4 },
        variedByHandicap: { '0-5': 0.3 },
        contributingPlayers: ['p1', 'p2'],
      },
    ];

    await (
      learner as unknown as {
        saveGlobalPatterns: (p: typeof patterns, client: typeof supabaseMock) => Promise<void>;
      }
    ).saveGlobalPatterns(patterns, supabaseMock);

    expect(supabaseMock.from).toHaveBeenCalledWith('golf_global_patterns');
    const rows = upsertSpy.mock.calls[0][0] as Array<Record<string, unknown>>;
    const payload = rows[0];
    expect(payload.signature).toBe('sig-1');
    expect(payload).not.toHaveProperty('outcome');
    expect(payload).toHaveProperty('outcomes');
    expect(payload).toHaveProperty('contributing_players');
    expect((payload as { contributing_players: string[] }).contributing_players).toEqual(['p1', 'p2']);
  });

  it('uses bulk upsert (single call) instead of per-row loop', async () => {
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabaseMock = { from: vi.fn().mockReturnValue({ upsert: upsertSpy }) };
    const learner = new CrossLearner();
    const patterns = [
      {
        signature: 's1',
        patternType: 'd',
        conditions: [],
        outcome: {},
        prevalence: 0.1,
        averageImpact: 0.2,
        confidence: 0.5,
        instanceCount: 1,
        playerCount: 1,
        variedByTier: {},
        variedByHandicap: {},
        contributingPlayers: [],
      },
      {
        signature: 's2',
        patternType: 'd',
        conditions: [],
        outcome: {},
        prevalence: 0.1,
        averageImpact: 0.2,
        confidence: 0.5,
        instanceCount: 1,
        playerCount: 1,
        variedByTier: {},
        variedByHandicap: {},
        contributingPlayers: [],
      },
    ];

    await (
      learner as unknown as {
        saveGlobalPatterns: (p: typeof patterns, client: typeof supabaseMock) => Promise<void>;
      }
    ).saveGlobalPatterns(patterns, supabaseMock);

    expect(upsertSpy).toHaveBeenCalledTimes(1);
    const rows = upsertSpy.mock.calls[0][0] as unknown[];
    expect(rows).toHaveLength(2);
  });
});

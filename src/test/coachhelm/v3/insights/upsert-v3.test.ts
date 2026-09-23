/**
 * Tests for upsertInsightV3's engine_version stamp guard.
 *
 * Strategy: mock v2's upsertInsight so we control what row id comes back
 * without a real DB, then assert on the shape of the stamp UPDATE call
 * against a minimal fake Supabase client.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { v2UpsertInsightMock } = vi.hoisted(() => ({
  v2UpsertInsightMock: vi.fn(async () => 'insight-1'),
}));

vi.mock('@/lib/coachhelm/v2/insights/upsert', () => ({
  upsertInsight: v2UpsertInsightMock,
  GATED_OUT: '__gated_out__',
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => undefined),
}));

import { upsertInsightV3, GATED_OUT } from '@/lib/coachhelm/v3/insights/upsert-v3';
import type { InsightInput } from '@/lib/coachhelm/v2/insights/types';

function baseV3Input(overrides: Partial<InsightInput> = {}): InsightInput {
  return {
    player_id: 'player-1',
    category: 'putting',
    signature: 'v3:putt_make_rate:6_10ft',
    title: '6-10ft putts: 38%',
    content: 'Of your 47 putts from 6-10ft...',
    evidence: {
      metric: 'putt_make_rate_6_10ft',
      metric_label: 'Make rate from 6-10 feet',
      unit: 'percent',
      your_value: 0.38,
      your_value_display: '38%',
      comparison_value: 0.52,
      comparison_label: 'Team average',
      comparison_source: 'team_avg',
      sample_n: 47,
      window_days: 30,
      window_start: '2026-03-22',
      window_end: '2026-04-21',
      strokes_impact: 2.1,
      strokes_impact_method: 'peer_delta',
      confidence: 0,
      confidence_factors: { sample_adequacy: 1, recency: 1, variance: 1 },
    },
    ...overrides,
  };
}

/** Minimal fake client recording the stamp UPDATE's filter chain. */
function createFakeStampClient() {
  const calls: Array<{ payload: unknown; filters: string[] }> = [];
  const client = {
    from: vi.fn(() => {
      const filters: string[] = [];
      const chain = {
        update: (payload: unknown) => {
          const updateChain = {
            eq: (col: string, val: unknown) => {
              filters.push(`eq:${col}=${val}`);
              return updateChain;
            },
            or: (expr: string) => {
              filters.push(`or:${expr}`);
              calls.push({ payload, filters: [...filters] });
              return Promise.resolve({ error: null });
            },
          };
          return updateChain;
        },
      };
      return chain;
    }),
  };
  return { client, calls };
}

describe('upsertInsightV3 — engine_version stamp', () => {
  beforeEach(() => {
    v2UpsertInsightMock.mockClear();
  });

  it('rejects a signature without the v3: prefix', async () => {
    const { client } = createFakeStampClient();
    await expect(
      upsertInsightV3(client as never, baseV3Input({ signature: 'putt_make_rate:6_10ft' })),
    ).rejects.toThrow('must start with "v3:"');
    expect(v2UpsertInsightMock).not.toHaveBeenCalled();
  });

  it('returns GATED_OUT without attempting a stamp', async () => {
    v2UpsertInsightMock.mockResolvedValueOnce(GATED_OUT);
    const { client, calls } = createFakeStampClient();
    const result = await upsertInsightV3(client as never, baseV3Input());
    expect(result).toBe(GATED_OUT);
    expect(calls).toHaveLength(0);
  });

  it('guards the stamp UPDATE so a re-stamp of an already-v3 row is a no-op filter, not an unconditional write', async () => {
    // Row 10 (plan §5.1): an unconditional engine_version UPDATE bumps
    // updated_at on every v3 write, which can burn upsertInsight's one CAS
    // retry for a write that changes nothing. The stamp must only actually
    // match a row when engine_version isn't already 'v3'.
    v2UpsertInsightMock.mockResolvedValueOnce('insight-1');
    const { client, calls } = createFakeStampClient();

    const result = await upsertInsightV3(client as never, baseV3Input());

    expect(result).toBe('insight-1');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.payload).toEqual({ engine_version: 'v3' });
    expect(calls[0]!.filters).toEqual([
      'eq:id=insight-1',
      'or:engine_version.is.null,engine_version.neq.v3',
    ]);
  });
});

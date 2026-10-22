/**
 * CoachHelm Slice 3: a read the nightly lifecycle step retired as Cleared or
 * Contradicted is not resurrected by a generator re-emit while
 * `coachhelm_recheck_v1` is on. With the flag off, and for every other
 * archive (age rules, scope sweeps, Out of date), resurrection is unchanged.
 * Harness shape from `src/test/coachhelm/v2/insights/upsert-resurrection.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const flag = { on: false };
vi.mock('@/lib/coachhelm/v3/lifecycle/flag', () => ({ isRecheckEnabled: () => flag.on }));
vi.mock('@/lib/notifications/insight-notifier', () => ({ notifyInsightLanded: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
  logServerEvent: vi.fn().mockResolvedValue(undefined),
}));

import { upsertInsight } from '@/lib/coachhelm/v2/insights/upsert';
import type { InsightEvidence, InsightInput } from '@/lib/coachhelm/v2/insights/types';

function fake(existingRow: Record<string, unknown>) {
  const updates: Record<string, unknown>[] = [];
  const from = vi.fn(() => {
    const q = {
      select: vi.fn(() => q),
      eq: vi.fn(() => q),
      is: vi.fn(() => q),
      order: vi.fn(() => q),
      limit: vi.fn(() => Promise.resolve({ data: [existingRow], error: null })),
      update: vi.fn((payload: Record<string, unknown>) => {
        const chain = {
          eq: () => chain,
          is: () => chain,
          select: () => {
            updates.push(payload);
            return Promise.resolve({ data: [{ id: existingRow.id }], error: null });
          },
        };
        return chain;
      }),
    };
    return q;
  });
  return { client: { from } as unknown as Parameters<typeof upsertInsight>[0], updates };
}

const evidence: InsightEvidence = {
  metric: 'putts_made_3_5ft_pct',
  metric_label: 'Putts Made 3-5 ft',
  unit: 'percent',
  your_value: 62,
  your_value_display: '62%',
  comparison_value: 72,
  comparison_label: 'Team',
  comparison_source: 'team_avg',
  sample_n: 95,
  window_days: 120,
  window_start: '2026-06-01',
  window_end: '2026-10-15',
  strokes_impact: 0.4,
  strokes_impact_method: 'peer_delta',
  confidence: 0,
  confidence_factors: { sample_adequacy: 1, recency: 1, variance: 1 },
};

const input: InsightInput = {
  player_id: 'player-1',
  coach_id: 'coach-1',
  team_id: 'team-1',
  category: 'putting',
  signature: 'v3:putt_distance:3_5ft',
  title: '3-5 ft putts',
  content: 'synthetic',
  evidence,
};

function archived(metadata: Record<string, unknown>) {
  return { id: 'row-1', evidence, metadata, lifecycle_state: 'archived', updated_at: '2026-10-19T00:00:00Z' };
}

describe('upsertInsight and lifecycle-retired reads', () => {
  beforeEach(() => {
    flag.on = false;
  });

  for (const resolvedBy of ['engine-recheck', 'engine-contradiction']) {
    it(`flag on: a row retired by ${resolvedBy} stays archived; the evidence still refreshes`, async () => {
      flag.on = true;
      const { client, updates } = fake(archived({ resolved_by: resolvedBy, archived_by: 'coachhelm-lifecycle' }));
      await upsertInsight(client, input);
      const payload = updates.at(-1)!;
      expect(payload).not.toHaveProperty('lifecycle_state');
      expect(payload).not.toHaveProperty('archived_at');
      expect(payload.evidence).toBeTruthy();
      expect((payload.metadata as Record<string, unknown>).redetected_at).toBeUndefined();
    });
  }

  it('flag off: the same row resurrects exactly as before', async () => {
    const { client, updates } = fake(archived({ resolved_by: 'engine-recheck', archived_by: 'coachhelm-lifecycle' }));
    await upsertInsight(client, input);
    expect(updates.at(-1)!.lifecycle_state).toBe('detected');
  });

  it('flag on: an Out-of-date or age-rule archive still resurrects on a re-emit', async () => {
    flag.on = true;
    for (const metadata of [
      { archived_by: 'coachhelm-lifecycle', retired_reason: 'out_of_date_3_checkpoints' },
      { archived_by: 'insight-lifecycle-cron', archive_reason: 'rule3:hard-stale>90d' },
    ]) {
      const { client, updates } = fake(archived(metadata));
      await upsertInsight(client, input);
      expect(updates.at(-1)!.lifecycle_state).toBe('detected');
    }
  });
});

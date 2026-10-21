import { describe, expect, it, vi } from 'vitest';

const { v2Upsert } = vi.hoisted(() => ({ v2Upsert: vi.fn() }));
vi.mock('@/lib/coachhelm/v2/insights/upsert', () => ({
  upsertInsight: v2Upsert,
  GATED_OUT: Symbol.for('test.gated_out'),
  isEvidenceRefusal: (err: unknown) => (err as { code?: unknown })?.code === 'test_refusal',
}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(), logServerEvent: vi.fn() }));

import { upsertInsightV3, GATED_OUT } from '@/lib/coachhelm/v3/insights/upsert-v3';
import { createRunInsightCollector } from '../run-collector';

function stampClient() {
  const builder = {
    update: () => builder,
    eq: () => builder,
    or: () => Promise.resolve({ error: null }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: () => builder } as any;
}

const input = { player_id: 'p1', signature: 'v3:test:sig' } as Parameters<typeof upsertInsightV3>[1];

describe('upsertInsightV3 and the run collector', () => {
  it('records the written id inside a run, and nothing outside one', async () => {
    v2Upsert.mockResolvedValue('insight-1');
    const c = createRunInsightCollector();
    await c.run(() => upsertInsightV3(stampClient(), input));
    expect(c.ids()).toEqual(['insight-1']);

    v2Upsert.mockResolvedValue('insight-2');
    await upsertInsightV3(stampClient(), input);
    expect(c.ids()).toEqual(['insight-1']);
  });

  it('records no id for a philosophy-gated write, but keeps it as a gated hypothesis', async () => {
    v2Upsert.mockResolvedValue(GATED_OUT);
    const c = createRunInsightCollector();
    const gatedInput = { ...input, insight_type: 'putt_distance', evidence: { metric: 'm' } } as typeof input;
    await c.run(() => upsertInsightV3(stampClient(), gatedInput));
    expect(c.ids()).toEqual([]);
    expect(c.gated()).toEqual([{ signature: 'v3:test:sig', insight_type: 'putt_distance', evidence: { metric: 'm' } }]);
    expect(c.refused()).toBe(0);
  });

  it('counts a refused write and still throws it', async () => {
    v2Upsert.mockRejectedValue(Object.assign(new Error('sample_n < 5'), { code: 'test_refusal' }));
    const c = createRunInsightCollector();
    await expect(c.run(() => upsertInsightV3(stampClient(), input))).rejects.toThrow('sample_n < 5');
    expect(c.refused()).toBe(1);

    // Any other failure is not a refusal.
    v2Upsert.mockRejectedValue(new Error('network'));
    await expect(c.run(() => upsertInsightV3(stampClient(), { ...input, signature: 'v3:other' }))).rejects.toThrow('network');
    expect(c.refused()).toBe(1);
  });
});

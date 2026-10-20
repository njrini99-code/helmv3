import { describe, expect, it } from 'vitest';
import { createRunInsightCollector, recordRunInsightId } from '../run-collector';
import { runWithGate } from '@/lib/coachhelm/v2/insights/gate-context';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('run insight collector', () => {
  it('records ids written inside the run, across concurrent async work', async () => {
    const c = createRunInsightCollector();
    await c.run(async () => {
      await Promise.all(
        ['a', 'b', 'c'].map(async (id) => {
          await tick();
          recordRunInsightId(id);
        }),
      );
      recordRunInsightId('a');
    });
    expect(c.ids().sort()).toEqual(['a', 'b', 'c']);
  });

  it('is a no-op outside a run', () => {
    expect(() => recordRunInsightId('x')).not.toThrow();
  });

  it('keeps two overlapping runs apart (same player, seconds apart)', async () => {
    const first = createRunInsightCollector();
    const second = createRunInsightCollector();
    await Promise.all([
      first.run(async () => {
        recordRunInsightId('r1-a');
        await tick();
        recordRunInsightId('r1-b');
      }),
      second.run(async () => {
        await tick();
        recordRunInsightId('r2-a');
      }),
    ]);
    // A write after both runs ended belongs to neither (e.g. the pass's own evidence write).
    recordRunInsightId('later');
    expect(first.ids()).toEqual(['r1-a', 'r1-b']);
    expect(second.ids()).toEqual(['r2-a']);
  });

  it('nests inside the philosophy gate scope', async () => {
    const c = createRunInsightCollector();
    await c.run(() =>
      runWithGate({ confidenceThreshold: 0, isInsightTypeEnabled: () => true }, async () => {
        await tick();
        recordRunInsightId('gated-scope');
      }),
    );
    expect(c.ids()).toEqual(['gated-scope']);
  });
});

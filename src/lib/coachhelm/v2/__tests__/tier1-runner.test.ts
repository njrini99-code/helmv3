import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  TIER1_GENERATOR_CONCURRENCY,
  isTransientGeneratorReceipt,
  runTier1Generators,
  type Tier1Generator,
} from '../tier1-runner';
import { getActiveGate, runWithGate, type PhilosophyGate } from '../insights/gate-context';

const noSleep = async () => undefined;

function trackedGenerators(count: number) {
  let inFlight = 0;
  let peak = 0;
  const generators: Tier1Generator[] = Array.from({ length: count }, (_, i) => ({
    name: `g${i}`,
    fn: async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1 + (i % 3)));
      inFlight -= 1;
      return { status: 'generated', index: i };
    },
  }));
  return { generators, peak: () => peak };
}

describe('runTier1Generators (#2061 pool exhaustion)', () => {
  it('runs ~21 generators with at most 4 in flight, returning settled results in input order', async () => {
    const { generators, peak } = trackedGenerators(21);
    const settled = await runTier1Generators(generators, { retry: { sleep: noSleep } });

    expect(TIER1_GENERATOR_CONCURRENCY).toBe(4);
    expect(peak()).toBe(4);
    expect(settled).toHaveLength(21);
    expect(settled.map((r) => (r.status === 'fulfilled' ? (r.value as { index: number }).index : -1))).toEqual(
      Array.from({ length: 21 }, (_, i) => i),
    );
  });

  it('a rejecting generator is a rejected entry in place and never stops the rest', async () => {
    const settled = await runTier1Generators(
      [
        { name: 'ok1', fn: async () => 'a' },
        { name: 'bug', fn: async () => { throw new TypeError('bug'); } },
        { name: 'ok2', fn: async () => 'b' },
      ],
      { retry: { sleep: noSleep } },
    );
    expect(settled.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
  });

  it('retries a v3 receipt that failed on a statement timeout once, and keeps the retry', async () => {
    const fn = vi
      .fn<() => Promise<unknown>>()
      .mockResolvedValueOnce({ status: 'failed', error: { code: '57014', message: 'canceling statement due to statement timeout' } })
      .mockResolvedValueOnce({ status: 'generated' });
    const settled = await runTier1Generators([{ name: 'v3.puttDistance.3_5ft', fn }], { retry: { sleep: noSleep } });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(settled[0]).toEqual({ status: 'fulfilled', value: { status: 'generated' } });
  });

  it('retries a v2 generator that rejected with a pool timeout once', async () => {
    const fn = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce({ code: 'PGRST003', message: 'Timed out acquiring connection from connection pool.' })
      .mockResolvedValueOnce(undefined);
    const settled = await runTier1Generators([{ name: 'v2.worstHoles', fn }], { retry: { sleep: noSleep } });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(settled[0]!.status).toBe('fulfilled');
  });

  it('a generator still failing after its one retry reports that failure; no third run', async () => {
    const receipt = { status: 'failed', error: new Error('Could not query the database for the schema cache. Retrying.') };
    const fn = vi.fn(async () => receipt);
    const settled = await runTier1Generators([{ name: 'g', fn }], { retry: { sleep: noSleep } });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(settled[0]).toEqual({ status: 'fulfilled', value: receipt });
  });

  it('never retries a non-transient failure', async () => {
    const receipt = { status: 'failed', error: { code: '23505', message: 'duplicate key' } };
    const fn = vi.fn(async () => receipt);
    await runTier1Generators([{ name: 'g', fn }], { retry: { sleep: noSleep } });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('keeps the philosophy gate (AsyncLocalStorage) visible to every generator, including queued ones', async () => {
    const gate: PhilosophyGate = { confidenceThreshold: 0.5, isInsightTypeEnabled: () => true };
    const seen: Array<PhilosophyGate | undefined> = [];
    const generators: Tier1Generator[] = Array.from({ length: 9 }, () => ({
      name: 'g',
      fn: async () => {
        await new Promise((r) => setTimeout(r, 1));
        seen.push(getActiveGate());
      },
    }));
    await runWithGate(gate, () => runTier1Generators(generators, { retry: { sleep: noSleep } }));
    expect(seen).toHaveLength(9);
    expect(seen.every((g) => g === gate)).toBe(true);
  });
});

describe('isTransientGeneratorReceipt', () => {
  it('is true only for a failed receipt carrying a transient database error', () => {
    expect(isTransientGeneratorReceipt({ status: 'failed', error: { code: 'PGRST002' } })).toBe(true);
    expect(isTransientGeneratorReceipt({ status: 'failed', error: { code: '42501' } })).toBe(false);
    expect(isTransientGeneratorReceipt({ status: 'failed' })).toBe(false);
    expect(isTransientGeneratorReceipt({ status: 'generated', error: { code: '57014' } })).toBe(false);
    expect(isTransientGeneratorReceipt(undefined)).toBe(false);
  });
});

describe('analyzePlayer wiring', () => {
  it('runs the Tier-1 batch through runTier1Generators, not an unbounded Promise.allSettled', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/lib/coachhelm/v2/orchestrator.ts'), 'utf8');
    expect(source).toMatch(/const runTier1 = \(\) => runTier1Generators\(tier1Generators\);/);
    expect(source).not.toMatch(/Promise\.allSettled\(tier1Generators\.map/);
  });
});

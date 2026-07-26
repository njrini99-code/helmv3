import { describe, it, expect } from 'vitest';
import { estimateCachedCostUsd, estimateCostUsd } from '@/lib/coachhelm/v3/llm/types';

/**
 * Prompt caching changes what a token costs, and the ledger has to follow —
 * `golf_coachhelm_llm_calls` is what the daily budget gate spends against, so
 * an overcharge here locks a coach out of a product they have not used.
 *
 * The trap this guards: the SDK reports `inputTokens` as the TOTAL, with
 * `inputTokenDetails` as its breakdown. Cache reads are already inside that
 * total, so pricing the total at the full input rate bills a cached prefix at
 * ~10x what it cost.
 */

const SONNET = 'anthropic/claude-sonnet-5'; // $3/M in, $15/M out

describe('estimateCachedCostUsd', () => {
  it('matches the uncached price when nothing was cached', () => {
    expect(estimateCachedCostUsd(SONNET, 10_000, 1_000)).toBe(
      estimateCostUsd(SONNET, 10_000, 1_000),
    );
  });

  it('falls back to the uncached price when the provider reports no breakdown', () => {
    expect(estimateCachedCostUsd(SONNET, 10_000, 1_000, {})).toBe(
      estimateCostUsd(SONNET, 10_000, 1_000),
    );
  });

  it('charges a cache read at a tenth of the input rate', () => {
    // 10k total input: 2k fresh, 8k read from cache. Output 1k.
    const cost = estimateCachedCostUsd(SONNET, 10_000, 1_000, {
      noCacheTokens: 2_000,
      cacheReadTokens: 8_000,
      cacheWriteTokens: 0,
    });
    // 2000*3/1e6 + 8000*3*0.1/1e6 + 1000*15/1e6
    expect(cost).toBeCloseTo(0.006 + 0.0024 + 0.015, 10);
  });

  it('charges a cache write at a premium', () => {
    const cost = estimateCachedCostUsd(SONNET, 10_000, 0, {
      noCacheTokens: 6_000,
      cacheReadTokens: 0,
      cacheWriteTokens: 4_000,
    });
    // 6000*3/1e6 + 4000*3*1.25/1e6
    expect(cost).toBeCloseTo(0.018 + 0.015, 10);
  });

  /** The whole point: a cached turn must cost materially less. */
  it('prices a cached turn below the same turn billed as uncached', () => {
    const details = { noCacheTokens: 2_000, cacheReadTokens: 8_000, cacheWriteTokens: 0 };
    expect(estimateCachedCostUsd(SONNET, 10_000, 1_000, details)).toBeLessThan(
      estimateCostUsd(SONNET, 10_000, 1_000),
    );
  });

  /**
   * Defensive: if a provider's total and its breakdown disagree, the derived
   * fresh-token count must not go negative and hand back a credit.
   */
  it('never derives a negative fresh-token count', () => {
    const cost = estimateCachedCostUsd(SONNET, 1_000, 0, {
      cacheReadTokens: 5_000,
      cacheWriteTokens: 0,
    });
    expect(cost).toBeGreaterThan(0);
  });
});

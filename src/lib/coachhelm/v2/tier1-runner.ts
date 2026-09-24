/**
 * Runs `analyzePlayer`'s Tier-1 insight generators with a bound on how many
 * are in flight and one retry for a transient database fault.
 *
 * Why (#2061, 2026-09-24 01:00–01:23 UTC): the generators used to start all at
 * once through `Promise.allSettled`. Each of the ~21 reads raw shot and stats
 * cache rows and upserts `golf_coach_insights`, all through the service-role
 * client. A safety-net cron chunk analyses 5 players in parallel, so one tick
 * put ~105 generator pipelines on the database together; the PostgREST pool
 * ran out (PGRST003) and statements hit their timeout (57014). Every one of
 * those failures then stood, because nothing retried.
 *
 * Contract kept from the `Promise.allSettled` this replaces: one settled entry
 * per generator, in the SAME order as the input, and a failing generator
 * never stops the others. The caller's result inspection is unchanged.
 *
 * The retry covers both ways a generator fails: a v2 generator that rejects,
 * and a v3 `BaseGenerator` that catches its own throw and resolves
 * `{ status: 'failed', error }`. Generators are safe to run twice: their
 * writes are upserts on the insight dedup index.
 */
import {
  isTransientDbError,
  mapSettledWithConcurrency,
  retryTransientOnce,
  type RetryTransientOptions,
} from '@/lib/supabase/bounded-query';

/** Tier-1 generators in flight at once for ONE player. */
export const TIER1_GENERATOR_CONCURRENCY = 4;

export interface Tier1Generator {
  name: string;
  fn: () => Promise<unknown>;
}

/** A v3 generator receipt that failed on a transient database fault. */
export function isTransientGeneratorReceipt(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const receipt = value as { status?: unknown; error?: unknown };
  return receipt.status === 'failed' && isTransientDbError(receipt.error);
}

export interface RunTier1Options {
  concurrency?: number;
  /** Backoff overrides; `sleep` is injected by tests. */
  retry?: Pick<RetryTransientOptions<unknown>, 'sleep' | 'baseDelayMs' | 'jitterMs'>;
}

export function runTier1Generators(
  generators: readonly Tier1Generator[],
  options: RunTier1Options = {},
): Promise<PromiseSettledResult<unknown>[]> {
  const { concurrency = TIER1_GENERATOR_CONCURRENCY, retry } = options;
  return mapSettledWithConcurrency(generators, concurrency, (generator) =>
    retryTransientOnce(generator.fn, { ...retry, isTransientResult: isTransientGeneratorReceipt }),
  );
}

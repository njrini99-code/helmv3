import { describe, it, expect, vi } from 'vitest';
import { upsertWithDeadlockRetry } from '../shot-pattern-miner';

/**
 * Regression coverage for the retry-on-deadlock wrapper around
 * ShotPatternMiner.savePatterns()'s upsert into `golf_patterns_v2`.
 *
 * Live root cause this guards: analyzeShotPatterns() (via analyzePlayer, on
 * the player CoachHelm dashboard read path AND the coachhelm-* crons) races
 * concurrent writers on the same table and can hit a Postgres deadlock
 * (SQLSTATE 40P01). Deadlocks are retryable — Postgres aborts exactly one of
 * the two colliding transactions, and re-running the idempotent
 * (deterministic-id) upsert should succeed. This wrapper must retry ONLY
 * 40P01, and must give up and return the last error for anything else or
 * once retries are exhausted.
 */
describe('upsertWithDeadlockRetry', () => {
  it('returns immediately on success (no retry, no delay)', async () => {
    const attempt = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });

    const result = await upsertWithDeadlockRetry(attempt);

    expect(attempt).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ data: { ok: true }, error: null });
  });

  it('does NOT retry a non-deadlock error', async () => {
    const attempt = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });

    const result = await upsertWithDeadlockRetry(attempt);

    expect(attempt).toHaveBeenCalledTimes(1);
    expect(result.error?.code).toBe('23505');
  });

  it('retries on 40P01 and succeeds once the collision clears', async () => {
    const attempt = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { code: '40P01', message: 'deadlock detected' } })
      .mockResolvedValueOnce({ data: { ok: true }, error: null });

    const result = await upsertWithDeadlockRetry(attempt, 2);

    expect(attempt).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ data: { ok: true }, error: null });
  }, 10_000);

  it('gives up after exhausting retries and returns the last 40P01 error', async () => {
    const attempt = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '40P01', message: 'deadlock detected' },
    });

    const result = await upsertWithDeadlockRetry(attempt, 2);

    // 1 initial attempt + 2 retries = 3 calls total
    expect(attempt).toHaveBeenCalledTimes(3);
    expect(result.error?.code).toBe('40P01');
  }, 10_000);

  it('respects a custom retry count', async () => {
    const attempt = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '40P01', message: 'deadlock detected' },
    });

    await upsertWithDeadlockRetry(attempt, 0);

    expect(attempt).toHaveBeenCalledTimes(1);
  });
});

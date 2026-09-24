import { describe, expect, it, vi } from 'vitest';
import {
  chunk,
  isTransientDbError,
  isTransientSupabaseResult,
  mapSettledWithConcurrency,
  mapWithConcurrency,
  retryTransientOnce,
} from '../bounded-query';

/** A task whose completion the test controls, recording peak concurrency. */
function tracker() {
  let inFlight = 0;
  let peak = 0;
  const started: number[] = [];
  const run = async (item: number): Promise<number> => {
    started.push(item);
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 1 + (item % 3)));
    inFlight -= 1;
    return item * 10;
  };
  return { run, started, peak: () => peak };
}

describe('isTransientDbError', () => {
  it.each([
    ['57014'], ['PGRST003'], ['PGRST002'], ['PGRST000'], ['40P01'], ['55P03'], ['53300'], ['08006'],
  ])('treats code %s as transient', (code) => {
    expect(isTransientDbError({ code, message: 'x' })).toBe(true);
  });

  it.each([
    'canceling statement due to statement timeout',
    'Could not query the database for the schema cache. Retrying.',
    'Timed out acquiring connection from connection pool.',
    'deadlock detected',
    'sorry, too many clients already: too many connections',
  ])('treats the message "%s" as transient even without a code', (message) => {
    expect(isTransientDbError(new Error(`putt-distance aggregate query failed: ${message}`))).toBe(true);
  });

  it('finds a transient code on a wrapped cause', () => {
    const err = new Error('save failed', { cause: { code: '57014', message: 'canceling' } });
    expect(isTransientDbError(err)).toBe(true);
  });

  it.each([
    [{ code: '23505', message: 'duplicate key value violates unique constraint' }],
    [{ code: '42501', message: 'permission denied for table golf_rounds' }],
    [{ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }],
    [{ code: 'PGRST204', message: "Could not find the 'x' column of 'y' in the schema cache" }],
    [new TypeError('Cannot read properties of undefined')],
    [null],
    [undefined],
  ])('does not treat %o as transient', (err) => {
    expect(isTransientDbError(err)).toBe(false);
  });

  it('isTransientSupabaseResult reads the error of a { data, error } result', () => {
    expect(isTransientSupabaseResult({ error: { code: 'PGRST003', message: '' } })).toBe(true);
    expect(isTransientSupabaseResult({ error: { code: '23505', message: '' } })).toBe(false);
    expect(isTransientSupabaseResult({ error: null })).toBe(false);
    expect(isTransientSupabaseResult(null)).toBe(false);
  });
});

describe('chunk', () => {
  it('splits into slices of at most size, keeping order', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
    expect(chunk([], 3)).toEqual([]);
    expect(chunk([1], 5)).toEqual([[1]]);
  });

  it('rejects a non-positive or fractional size', () => {
    expect(() => chunk([1], 0)).toThrow(RangeError);
    expect(() => chunk([1], 1.5)).toThrow(RangeError);
  });
});

describe('mapSettledWithConcurrency', () => {
  it('never exceeds the limit and keeps input order', async () => {
    const t = tracker();
    const items = Array.from({ length: 21 }, (_, i) => i);
    const results = await mapSettledWithConcurrency(items, 4, t.run);
    expect(t.peak()).toBe(4);
    expect(t.started).toHaveLength(21);
    expect(results.map((r) => (r.status === 'fulfilled' ? r.value : null))).toEqual(items.map((i) => i * 10));
  });

  it('a rejection is recorded in place and never stops the other items', async () => {
    const results = await mapSettledWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      if (n === 2) throw new Error('boom');
      return n;
    });
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled', 'fulfilled', 'fulfilled']);
    expect((results[1] as PromiseRejectedResult).reason).toBeInstanceOf(Error);
  });

  it('handles an empty list and a limit larger than the list', async () => {
    expect(await mapSettledWithConcurrency([], 4, async () => 1)).toEqual([]);
    const t = tracker();
    await mapSettledWithConcurrency([1, 2], 10, t.run);
    expect(t.peak()).toBeLessThanOrEqual(2);
  });
});

describe('mapWithConcurrency', () => {
  it('never exceeds the limit and keeps input order', async () => {
    const t = tracker();
    const items = Array.from({ length: 12 }, (_, i) => i);
    expect(await mapWithConcurrency(items, 4, t.run)).toEqual(items.map((i) => i * 10));
    expect(t.peak()).toBe(4);
  });

  it('throws the first rejection and starts nothing new after it', async () => {
    const started: number[] = [];
    await expect(
      mapWithConcurrency([1, 2, 3, 4, 5, 6], 1, async (n) => {
        started.push(n);
        if (n === 2) throw new Error('first');
        if (n === 4) throw new Error('second');
        return n;
      }),
    ).rejects.toThrow('first');
    expect(started).toEqual([1, 2]);
  });
});

describe('retryTransientOnce', () => {
  const noSleep = vi.fn(async () => undefined);

  it('returns the first result when it succeeds, without sleeping', async () => {
    const op = vi.fn(async () => ({ data: 1, error: null }));
    const sleep = vi.fn(async () => undefined);
    await expect(retryTransientOnce(op, { isTransientResult: isTransientSupabaseResult, sleep })).resolves.toEqual({ data: 1, error: null });
    expect(op).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it.each(['57014', 'PGRST003', 'PGRST002'])('retries a %s result once, after a backoff, and returns the retry', async (code) => {
    const op = vi
      .fn<() => Promise<{ data: number | null; error: { code: string; message: string } | null }>>()
      .mockResolvedValueOnce({ data: null, error: { code, message: 'busy' } })
      .mockResolvedValueOnce({ data: 2, error: null });
    const sleep = vi.fn(async () => undefined);
    const result = await retryTransientOnce(op, { isTransientResult: isTransientSupabaseResult, sleep, baseDelayMs: 300, jitterMs: 200 });
    expect(result).toEqual({ data: 2, error: null });
    expect(op).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    const delay = (sleep.mock.calls[0] as unknown as [number])[0];
    expect(delay).toBeGreaterThanOrEqual(300);
    expect(delay).toBeLessThan(500);
  });

  it('never retries twice: a second transient failure is returned as is', async () => {
    const busy = { data: null, error: { code: 'PGRST003', message: 'pool' } };
    const op = vi.fn(async () => busy);
    await expect(retryTransientOnce(op, { isTransientResult: isTransientSupabaseResult, sleep: noSleep })).resolves.toBe(busy);
    expect(op).toHaveBeenCalledTimes(2);
  });

  it('does not retry a non-transient result (23505)', async () => {
    const dup = { data: null, error: { code: '23505', message: 'duplicate key' } };
    const op = vi.fn(async () => dup);
    await expect(retryTransientOnce(op, { isTransientResult: isTransientSupabaseResult, sleep: noSleep })).resolves.toBe(dup);
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('retries a transient THROW once and rethrows a non-transient one immediately', async () => {
    const flaky = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('canceling statement due to statement timeout'))
      .mockResolvedValueOnce('ok');
    await expect(retryTransientOnce(flaky, { sleep: noSleep })).resolves.toBe('ok');
    expect(flaky).toHaveBeenCalledTimes(2);

    const broken = vi.fn(async () => { throw new TypeError('bug'); });
    await expect(retryTransientOnce(broken, { sleep: noSleep })).rejects.toThrow('bug');
    expect(broken).toHaveBeenCalledTimes(1);
  });

  it('a second transient throw propagates; there is no third attempt', async () => {
    const op = vi.fn(async () => { throw Object.assign(new Error('pool'), { code: 'PGRST003' }); });
    await expect(retryTransientOnce(op, { sleep: noSleep })).rejects.toThrow('pool');
    expect(op).toHaveBeenCalledTimes(2);
  });

  it('reports the retry through onRetry', async () => {
    const onRetry = vi.fn();
    const op = vi
      .fn<() => Promise<{ error: { code: string } | null }>>()
      .mockResolvedValueOnce({ error: { code: '57014' } })
      .mockResolvedValueOnce({ error: null });
    await retryTransientOnce(op, { isTransientResult: isTransientSupabaseResult, sleep: noSleep, onRetry });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0]![0]).toMatchObject({ reason: { error: { code: '57014' } } });
  });
});

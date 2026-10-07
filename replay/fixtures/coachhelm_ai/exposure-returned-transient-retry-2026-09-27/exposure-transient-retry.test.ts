/**
 * Bridge fingerprint f34bc102 (2026-09-27): `recordInsightExposure insert
 * failed: TypeError: fetch failed`, logged at error severity.
 *
 * postgrest-js catches a fetch rejection and RESOLVES it as a typed error,
 * `{ message: 'TypeError: fetch failed', code: '' }` — see the "TWO SHAPES"
 * note in `src/lib/utils/transient-error.ts`. `recordInsightExposure` retried
 * only the THROWN shape, so this one skipped the bounded retry, dropped the
 * exposure row and opened a Bridge incident for a network blip.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));

const adminClientMock = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => adminClientMock(),
}));

vi.mock('@/lib/utils/transient-error', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/utils/transient-error')>();
  return { ...actual, delay: vi.fn().mockResolvedValue(undefined) };
});

vi.mock('@/lib/flags', () => ({ isFlagEnabled: () => false }));

import { logServerError } from '@/lib/server-error-logger';
import { recordInsightExposure } from './event-ledger';

const logServerErrorMock = vi.mocked(logServerError);
const sampleRows = [{ insight_id: 'insight-1', player_id: 'player-1' }];
const RETURNED_FETCH_FAILURE = { message: 'TypeError: fetch failed', code: '' };

function exposureTable(insertImpl: () => Promise<{ error: { message: string; code?: string } | null }>) {
  const insertSpy = vi.fn(insertImpl);
  return {
    table: {
      select: () => ({ in: () => ({ gte: async () => ({ data: [], error: null }) }) }),
      insert: insertSpy,
    },
    insertSpy,
  };
}

describe('recordInsightExposure — a RETURNED transient fetch error is retried like a thrown one', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('retry-then-succeed: recovers silently, nothing reaches the Bridge', async () => {
    let calls = 0;
    const { table, insertSpy } = exposureTable(async () => {
      calls += 1;
      return { error: calls === 1 ? RETURNED_FETCH_FAILURE : null };
    });
    adminClientMock.mockReturnValue({ from: () => table });

    await recordInsightExposure(sampleRows);

    expect(insertSpy).toHaveBeenCalledTimes(2);
    expect(logServerErrorMock).not.toHaveBeenCalled();
  });

  test('retry-then-fail: exactly one retry, then one warning (not an error incident)', async () => {
    const { table, insertSpy } = exposureTable(async () => ({ error: RETURNED_FETCH_FAILURE }));
    adminClientMock.mockReturnValue({ from: () => table });

    await recordInsightExposure(sampleRows);

    expect(insertSpy).toHaveBeenCalledTimes(2);
    expect(logServerErrorMock).toHaveBeenCalledTimes(1);
    const [message, context, severity] = logServerErrorMock.mock.calls[0]!;
    expect(message).toContain('recordInsightExposure threw (after 1 retry)');
    expect(message).toContain('fetch failed');
    expect(context).toMatchObject({ extra: { count: sampleRows.length } });
    expect(severity).toBe('warning');
  });

  test('a returned non-transient error (constraint violation) is still logged once and never retried', async () => {
    const { table, insertSpy } = exposureTable(async () => ({
      error: { message: 'duplicate key value violates unique constraint', code: '23505' },
    }));
    adminClientMock.mockReturnValue({ from: () => table });

    await recordInsightExposure(sampleRows);

    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(logServerErrorMock).toHaveBeenCalledTimes(1);
    expect(logServerErrorMock.mock.calls[0]![0]).toContain('recordInsightExposure insert failed');
  });
});

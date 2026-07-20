/**
 * getFailedEmailCounts — regression test.
 *
 * The "Failed" sub-tab's Bounces/Complaints summary used to be derived
 * client-side from a capped 150-row fetch, which silently understates the
 * true totals once bounced+complained volume exceeds the cap. This action
 * does a real exact-count query instead. Covers:
 *   - admin-gating: non-admin/unauthenticated callers get {0, 0}, no query
 *   - happy path: counts come straight from the two `count: 'exact'` queries
 *     regardless of how many actual rows exist (i.e. not capped at 150/200)
 *   - query error: fails safe to {0, 0} + logs, rather than throwing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  singleProfile: vi.fn(),
  bounced: vi.fn(),
  complained: vi.fn(),
  logServerError: vi.fn(async () => {}),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: (table: string) => {
      if (table === 'users') {
        return {
          select: () => ({
            eq: () => ({
              single: mocks.singleProfile,
            }),
          }),
        };
      }
      if (table === 'emails') {
        return {
          select: () => ({
            not: (column: string) => {
              if (column === 'bounced_at') return mocks.bounced();
              if (column === 'complained_at') return mocks.complained();
              throw new Error(`unexpected column ${column}`);
            },
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  })),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: (...args: unknown[]) => mocks.logServerError(...args),
}));

import { getFailedEmailCounts } from '../actions';

describe('getFailedEmailCounts', () => {
  beforeEach(() => {
    mocks.getUser.mockReset();
    mocks.singleProfile.mockReset();
    mocks.bounced.mockReset();
    mocks.complained.mockReset();
    mocks.logServerError.mockClear();
  });

  it('returns {0, 0} without querying counts when unauthenticated', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    const result = await getFailedEmailCounts();

    expect(result).toEqual({ bounced: 0, complained: 0 });
    expect(mocks.bounced).not.toHaveBeenCalled();
    expect(mocks.complained).not.toHaveBeenCalled();
  });

  it('returns {0, 0} without querying counts when the caller is not an admin', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mocks.singleProfile.mockResolvedValue({ data: { role: 'coach' } });

    const result = await getFailedEmailCounts();

    expect(result).toEqual({ bounced: 0, complained: 0 });
    expect(mocks.bounced).not.toHaveBeenCalled();
    expect(mocks.complained).not.toHaveBeenCalled();
  });

  it('returns the exact counts for an admin, independent of any row cap', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mocks.singleProfile.mockResolvedValue({ data: { role: 'admin' } });
    // Simulate volume well beyond the 150-row cap used by the list fetch.
    mocks.bounced.mockResolvedValue({ count: 412, error: null });
    mocks.complained.mockResolvedValue({ count: 7, error: null });

    const result = await getFailedEmailCounts();

    expect(result).toEqual({ bounced: 412, complained: 7 });
  });

  it('fails safe to {0, 0} and logs when a count query errors', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mocks.singleProfile.mockResolvedValue({ data: { role: 'admin' } });
    mocks.bounced.mockResolvedValue({ count: null, error: { message: 'boom' } });
    mocks.complained.mockResolvedValue({ count: 7, error: null });

    const result = await getFailedEmailCounts();

    expect(result).toEqual({ bounced: 0, complained: 0 });
    expect(mocks.logServerError).toHaveBeenCalledTimes(1);
  });
});

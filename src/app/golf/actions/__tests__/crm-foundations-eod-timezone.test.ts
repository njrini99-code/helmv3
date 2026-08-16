/**
 * "Due today" boundary must be ORG midnight (Eastern), not the runtime's
 * midnight.
 *
 * listMyDueTasks({ byEod: true }) feeds the "Tasks due today" panel
 * (InboxView.tsx, rendered on /golf/admin/crm). The pre-fix code computed
 * the boundary with `eod.setHours(23, 59, 59, 999)`, which resolves in the
 * RUNTIME's zone — UTC on Vercel — landing the cutoff around 8pm Eastern
 * instead of midnight. A task due later that evening in Eastern was
 * silently excluded from the `.lte('due_at', eod)` query, and the admin saw
 * "No tasks due today" (or a short list) while a same-day follow-up sat
 * unflagged.
 *
 * These tests assert the ABSOLUTE instant sent to Postgres, not a
 * runtime-zone-relative one, so they pass identically no matter what
 * timezone the test process itself runs in (see the TZ=... commands used
 * to verify this file).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const CHAIN_METHODS = [
  'select', 'eq', 'neq', 'in', 'is', 'gt', 'lt', 'gte', 'lte', 'not', 'or',
  'order', 'limit', 'range', 'single', 'maybeSingle',
] as const;

/** A chain whose every terminal resolves to one fixed result, and whose
 *  methods stay individually spy-able across however deep the chain runs. */
function createChainableMock(finalResult: Record<string, unknown> = { data: [], error: null }) {
  const chain: Record<string, unknown> = {};
  for (const method of CHAIN_METHODS) {
    chain[method] = vi.fn(() => ({ ...chain, ...finalResult }));
  }
  return chain;
}

let mockFromResult: ReturnType<typeof createChainableMock>;
const mockFrom = vi.fn(() => mockFromResult);
const mockGetUser = vi.fn(() => ({ data: { user: { id: 'coach-1' } } }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: mockFrom,
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerException: vi.fn(async () => {}),
}));

import { listMyDueTasks } from '../crm-foundations';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockFromResult = createChainableMock();
  mockGetUser.mockReturnValue({ data: { user: { id: 'coach-1' } } });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('listMyDueTasks({ byEod: true }) — end-of-day boundary', () => {
  it('EDT (summer): a task due at 9pm Eastern today is included as "due today"', async () => {
    // "Now" = noon EDT on 2026-08-16 (16:00 UTC).
    vi.setSystemTime(new Date('2026-08-16T16:00:00.000Z'));

    await listMyDueTasks({ byEod: true });

    const lteCalls = (mockFromResult.lte as ReturnType<typeof vi.fn>).mock.calls;
    expect(lteCalls).toHaveLength(1);
    expect(lteCalls[0]![0]).toBe('due_at');
    const eodIso = lteCalls[0]![1] as string;

    // Correct Eastern EOD (23:59:59.999 EDT, UTC-4) = 2026-08-17T03:59:59.999Z.
    expect(eodIso).toBe('2026-08-17T03:59:59.999Z');

    // A task due at 9pm Eastern (2026-08-17T01:00:00Z) must sit AT OR BEFORE
    // the boundary — this is the exact case the bug dropped.
    const nineEasternUtc = new Date('2026-08-17T01:00:00.000Z').getTime();
    expect(nineEasternUtc).toBeLessThanOrEqual(new Date(eodIso).getTime());
  });

  it('EST (winter): a task due at 11pm Eastern today is included as "due today"', async () => {
    // "Now" = noon EST on 2026-01-16 (17:00 UTC).
    vi.setSystemTime(new Date('2026-01-16T17:00:00.000Z'));

    await listMyDueTasks({ byEod: true });

    const eodIso = (mockFromResult.lte as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string;
    // Correct Eastern EOD (23:59:59.999 EST, UTC-5) = 2026-01-17T04:59:59.999Z.
    expect(eodIso).toBe('2026-01-17T04:59:59.999Z');

    const elevenEasternUtc = new Date('2026-01-17T04:00:00.000Z').getTime(); // 11pm EST
    expect(elevenEasternUtc).toBeLessThanOrEqual(new Date(eodIso).getTime());
  });
});

/**
 * The Gmail direct-send daily-cap window must reset at ORG midnight
 * (Eastern), not the runtime's midnight.
 *
 * countSentToday computed the window start with `start.setHours(0, 0, 0, 0)`,
 * which resolves in the RUNTIME's zone — UTC on Vercel — so the cap window
 * effectively reset around 8pm Eastern instead of midnight. This gates
 * sendCoachViaGmail / sendNextBatchViaGmail's daily cap on a
 * reputation-sensitive cold-outreach mailbox: the wrong boundary can let
 * evening sending exceed the intended per-day volume, or block sending
 * before the Eastern day has actually turned over.
 *
 * These tests assert the ABSOLUTE instant sent to Postgres, not a
 * runtime-zone-relative one, so they pass identically no matter what
 * timezone the test process itself runs in (see the TZ=... commands used
 * to verify this file).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const CHAIN_METHODS = ['select', 'eq', 'neq', 'in', 'gt', 'lt', 'gte', 'lte', 'single', 'maybeSingle'] as const;

function createChainableMock(finalResult: Record<string, unknown>) {
  const chain: Record<string, unknown> = {};
  for (const method of CHAIN_METHODS) {
    chain[method] = vi.fn(() => ({ ...chain, ...finalResult }));
  }
  return chain;
}

let mockUsersResult: ReturnType<typeof createChainableMock>;
let mockContactLogResult: ReturnType<typeof createChainableMock>;
const mockFrom = vi.fn((table: string) =>
  table === 'users' ? mockUsersResult : mockContactLogResult,
);
const mockGetUser = vi.fn(() => ({ data: { user: { id: 'admin-1' } } }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: mockFrom,
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock('@/lib/crm/gmail-send', () => ({
  isGmailSendConfigured: vi.fn(() => true),
  sendGmailEmail: vi.fn(),
}));

import { getGmailSendStatus } from '../crm-gmail-send';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockUsersResult = createChainableMock({ data: { role: 'admin' }, error: null });
  mockContactLogResult = createChainableMock({ count: 0, error: null });
  mockGetUser.mockReturnValue({ data: { user: { id: 'admin-1' } } });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('countSentToday (via getGmailSendStatus) — start-of-day boundary', () => {
  it('EDT (summer): the window starts at Eastern midnight, not UTC midnight', async () => {
    // "Now" = 11pm Eastern on 2026-08-16 (2026-08-17T03:00:00Z, EDT UTC-4).
    vi.setSystemTime(new Date('2026-08-17T03:00:00.000Z'));

    await getGmailSendStatus();

    const gteCalls = (mockContactLogResult.gte as ReturnType<typeof vi.fn>).mock.calls;
    expect(gteCalls).toHaveLength(1);
    expect(gteCalls[0]![0]).toBe('contact_date');
    const startIso = gteCalls[0]![1] as string;

    // Correct Eastern midnight for "today" (Aug 16, EDT UTC-4) = 2026-08-16T04:00:00.000Z.
    expect(startIso).toBe('2026-08-16T04:00:00.000Z');
  });

  it('EST (winter): the window starts at Eastern midnight, not UTC midnight', async () => {
    // "Now" = 11pm Eastern on 2026-01-16 (2026-01-17T04:00:00Z, EST UTC-5).
    vi.setSystemTime(new Date('2026-01-17T04:00:00.000Z'));

    await getGmailSendStatus();

    const startIso = (mockContactLogResult.gte as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string;
    // Correct Eastern midnight for "today" (Jan 16, EST UTC-5) = 2026-01-16T05:00:00.000Z.
    expect(startIso).toBe('2026-01-16T05:00:00.000Z');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  shouldPersist: true,
  rateAllowed: true,
  visitorHint: null as null | {
    id: string;
    name: string;
    email: string;
    school: string | null;
    entered_at: string;
  },
  lastEvent: null as unknown,
  checkRateLimit: vi.fn(),
  eventInsert: vi.fn(),
  logServerError: vi.fn(async (..._args: unknown[]) => undefined),
  logServerException: vi.fn(async (..._args: unknown[]) => undefined),
}));

vi.mock('@/lib/auth/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => mocks.checkRateLimit(...args),
}));

vi.mock('@/lib/telemetry-gate', () => ({
  getRuntimeEnv: () => 'test',
  shouldPersistAdminTables: () => mocks.shouldPersist,
}));

vi.mock('@/lib/crm/engagement-quality', () => ({
  classifyEngagement: () => ({
    verdict: 'unknown',
    reason: 'missing_reference_timestamp',
    confidence: 0,
    latencyMs: null,
  }),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: (...args: unknown[]) => mocks.logServerError(...args),
  logServerException: (...args: unknown[]) => mocks.logServerException(...args),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'golf_demo_sessions') {
        const chain = {
          select: vi.fn(),
          eq: vi.fn(),
          gte: vi.fn(),
          lte: vi.fn(),
          order: vi.fn(),
          limit: vi.fn(),
          maybeSingle: vi.fn(async () => ({ data: mocks.visitorHint, error: null })),
        };
        for (const method of ['select', 'eq', 'gte', 'lte', 'order', 'limit'] as const) {
          chain[method].mockReturnValue(chain);
        }
        return chain;
      }
      if (table === 'admin_events') {
        return { insert: mocks.eventInsert };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

import { GET } from '../route';

function request(
  url = 'https://helmsportslabs.com/api/crm/book-call?src=demo-pricing-nudge',
  method = 'GET',
) {
  return new Request(url, {
    method,
    headers: {
      'x-forwarded-for': '203.0.113.9, 70.41.3.18',
      'user-agent': 'TestBrowser/1.0',
      referer: 'https://helmsportslabs.com/golf/dashboard',
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.shouldPersist = true;
  mocks.rateAllowed = true;
  mocks.visitorHint = null;
  mocks.lastEvent = null;
  mocks.checkRateLimit.mockResolvedValue({
    allowed: true,
    remaining: 29,
    resetAt: Date.now() + 300_000,
  });
  mocks.eventInsert.mockImplementation(async (row: unknown) => {
    mocks.lastEvent = row;
    return { error: null };
  });
});

describe('GET /api/crm/book-call', () => {
  it('records a classified booking click and redirects to the fixed calendar URL', async () => {
    const response = await GET(request());

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'https://calendar.app.google/s9DBb3bKD2teLLBT7',
    );
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0');
    expect(mocks.lastEvent).toEqual(
      expect.objectContaining({
        event_type: 'feature_use',
        title: 'Demo pricing call link clicked',
        metadata: expect.objectContaining({
          srcToken: 'demo-pricing-nudge',
          ip: '203.0.113.9',
          trafficQuality: 'unknown',
        }),
      }),
    );
  });

  it('drops a malformed source token but records that it was rejected', async () => {
    await GET(request('https://helmsportslabs.com/api/crm/book-call?src=BAD%20TOKEN'));

    expect(mocks.lastEvent).toEqual(
      expect.objectContaining({
        metadata: expect.objectContaining({ srcToken: null, srcRejected: true }),
      }),
    );
  });

  it('never lets logging failure block the redirect', async () => {
    mocks.eventInsert.mockRejectedValue(new Error('database unavailable'));

    const response = await GET(request());

    expect(response.status).toBe(302);
    expect(mocks.logServerException).toHaveBeenCalledTimes(1);
  });

  it('does not persist probes, disabled environments, or rate-limited clicks', async () => {
    await GET(request(undefined, 'HEAD'));
    expect(mocks.eventInsert).not.toHaveBeenCalled();

    mocks.shouldPersist = false;
    await GET(request());
    expect(mocks.eventInsert).not.toHaveBeenCalled();

    mocks.shouldPersist = true;
    mocks.checkRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 300_000,
    });
    await GET(request());
    expect(mocks.eventInsert).not.toHaveBeenCalled();
  });
});

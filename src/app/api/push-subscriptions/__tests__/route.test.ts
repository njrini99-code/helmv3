// =============================================================================
// src/app/api/push-subscriptions/__tests__/route.test.ts
//
// Regression lock for the push-endpoint SSRF guard, on BOTH sides of the sink:
//   - the write side (`POST /api/push-subscriptions`), and
//   - the read side (`sendWebPush` in src/lib/coachhelm/v3/foundation/push.ts).
//
// The deepsec wave-2 guard tested `hostname.startsWith('fc') ||
// hostname.startsWith('fd')` against the FULL hostname to catch the IPv6
// unique-local range (fc00::/7). Applied to a DNS name that also matches:
// 'fcm.googleapis.com'.startsWith('fc') === true — so every Chrome / Chromium /
// Edge / Android subscription was rejected with 400 "Invalid push endpoint"
// while Mozilla and Apple endpoints passed. These tests pin both halves: real
// vendor hostnames are ACCEPTED, and genuine private/loopback/link-local
// literals stay REJECTED.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const USER_ID = 'user-1';

const getUser = vi.fn();
const logServerError = vi.hoisted(() => vi.fn(async () => {}));
const sendNotification = vi.hoisted(() =>
  vi.fn(async () => ({ statusCode: 201, body: '', headers: {} })),
);
const setVapidDetails = vi.hoisted(() => vi.fn());

vi.mock('@/lib/server-error-logger', () => ({ logServerError }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({})),
}));

/** Endpoints the route actually persisted, in call order. */
let upserted: string[] = [];

vi.mock('@/lib/supabase/untyped', () => ({
  fromUntyped: vi.fn(() => ({
    upsert: (row: { endpoint: string }) => {
      upserted.push(row.endpoint);
      return {
        select: () => ({
          single: async () => ({ data: { id: 'sub-1' }, error: null }),
        }),
      };
    },
  })),
}));

vi.mock('web-push', () => ({
  default: { sendNotification, setVapidDetails },
}));

import { POST } from '@/app/api/push-subscriptions/route';

function postRequest(endpoint: string): Request {
  return new Request('https://app.helmsportslabs.com/api/push-subscriptions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'vitest' },
    body: JSON.stringify({
      endpoint,
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
    }),
  });
}

/** Real-world push service endpoints — every one of these must be accepted. */
const VENDOR_ENDPOINTS = [
  // Chrome / Chromium / Edge / Android — the ones the fc-prefix bug rejected.
  'https://fcm.googleapis.com/fcm/send/dQw4w9WgXcQ:APA91bH',
  'https://fcm.googleapis.com/wp/abc123',
  // Firefox.
  'https://updates.push.services.mozilla.com/wpush/v2/gAAAAA',
  // Safari / iOS web push.
  'https://web.push.apple.com/QK1ZM9',
  // Legacy Edge.
  'https://par02p.notify.windows.com/w/?token=abc',
];

/** Hosts the guard must keep rejecting (SSRF sinks). */
const BLOCKED_ENDPOINTS: Array<[string, string]> = [
  ['IPv6 unique-local fc00::/7', 'https://[fc00::1]/push'],
  ['IPv6 unique-local fd00::/8', 'https://[fd12:3456:789a::1]/push'],
  ['IPv6 link-local fe80::/10', 'https://[fe80::1]/push'],
  ['IPv6 loopback ::1', 'https://[::1]/push'],
  ['IPv6 loopback long form', 'https://[0:0:0:0:0:0:0:1]/push'],
  ['IPv6 unspecified ::', 'https://[::]/push'],
  ['IPv4-mapped loopback', 'https://[::ffff:127.0.0.1]/push'],
  ['IPv6 multicast ff02::/8', 'https://[ff02::1]/push'],
  ['localhost', 'https://localhost/push'],
  ['localhost subdomain', 'https://push.localhost/push'],
  ['internal TLD', 'https://metadata.internal/push'],
  ['IPv4 loopback', 'https://127.0.0.1/push'],
  ['IPv4 loopback (decimal form)', 'https://2130706433/push'],
  ['IPv4 10/8', 'https://10.1.2.3/push'],
  ['IPv4 172.16/12', 'https://172.20.0.5/push'],
  ['IPv4 192.168/16', 'https://192.168.1.1/push'],
  ['IPv4 link-local (cloud metadata)', 'https://169.254.169.254/latest/meta-data'],
  ['IPv4 0.0.0.0', 'https://0.0.0.0/push'],
  ['IPv4 multicast', 'https://239.1.2.3/push'],
  ['non-https scheme', 'http://fcm.googleapis.com/fcm/send/abc'],
  ['not a URL', 'not-a-url'],
];

describe('POST /api/push-subscriptions — endpoint guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upserted = [];
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  });

  it.each(VENDOR_ENDPOINTS)('accepts the real push service endpoint %s', async (endpoint) => {
    const res = await POST(postRequest(endpoint));

    expect(res.status).toBe(201);
    expect(upserted).toEqual([endpoint]);
  });

  it.each(BLOCKED_ENDPOINTS)('rejects %s', async (_label, endpoint) => {
    const res = await POST(postRequest(endpoint));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid push endpoint' });
    expect(upserted).toEqual([]);
  });

  it('still requires authentication before looking at the endpoint', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await POST(postRequest(VENDOR_ENDPOINTS[0] ?? ''));

    expect(res.status).toBe(401);
    expect(upserted).toEqual([]);
  });
});

describe('sendWebPush — sink-side endpoint guard', () => {
  async function loadPush() {
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'test-public-key');
    vi.stubEnv('VAPID_PRIVATE_KEY', 'test-private-key');
    vi.resetModules();
    return import('@/lib/coachhelm/v3/foundation/push');
  }

  function storedSubscription(endpoint: string) {
    return {
      id: 'sub-1',
      user_id: USER_ID,
      endpoint,
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(VENDOR_ENDPOINTS)('sends to the real push service endpoint %s', async (endpoint) => {
    const { sendWebPush } = await loadPush();

    const result = await sendWebPush(storedSubscription(endpoint), {
      title: 'Task due',
      body: 'Wedge session at 4pm',
    });

    expect(result.delivered).toBe(true);
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it.each(BLOCKED_ENDPOINTS)('never opens a connection to %s', async (_label, endpoint) => {
    const { sendWebPush } = await loadPush();

    const result = await sendWebPush(storedSubscription(endpoint), {
      title: 'Task due',
      body: 'Wedge session at 4pm',
    });

    expect(result.delivered).toBe(false);
    expect(result.error).toContain('Unsafe push endpoint');
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('exposes the same verdicts through isSafePushEndpoint', async () => {
    const { isSafePushEndpoint } = await loadPush();

    expect(isSafePushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isSafePushEndpoint('https://[fc00::1]/push')).toBe(false);
    // `fc0::1` is 0fc0:: — outside fc00::/7, so the byte-level test must not
    // fire on a short hextet either.
    expect(isSafePushEndpoint('https://[fc0::1]/push')).toBe(true);
    // Hostnames that merely start with the hex bytes are DNS names, not IPv6.
    expect(isSafePushEndpoint('https://fd-cdn.example.com/push')).toBe(true);
    expect(isSafePushEndpoint('https://fe80.example.com/push')).toBe(true);
  });
});

/**
 * Regression test for src/lib/notifications/push.ts — `sendPushNotification`.
 *
 * Guards the production fix for:
 *   "insight-notifier: push send reported failure: `cookies` was called
 *    outside a request scope"
 *
 * sendPushNotification is invoked from BACKGROUND contexts (the post-write
 * insight-notifier, the event-reminders cron) where there is no active request,
 * so it must NOT use the cookie-backed request client. It now reads prefs +
 * device tokens through the service-role admin client (the same key the
 * send-apns-push Edge Function already uses), which also lets it read a
 * *recipient's* device tokens when the sender differs from the recipient.
 *
 * The cookie client (`@/lib/supabase/server`) is mocked to THROW so the test
 * fails loudly if any code path regresses back to it.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/lib/notifications/types';

// --- Controllable mock state ----------------------------------------------

let prefs: Record<string, unknown> = { ...DEFAULT_NOTIFICATION_PREFERENCES, push_events: true };
let deviceTokens: Array<{ token: string; platform: string }> = [];

// The cookie-backed request client MUST NOT be touched in a background context.
const serverCreateClient = vi.fn(async () => {
  throw new Error('`cookies` was called outside a request scope');
});
vi.mock('@/lib/supabase/server', () => ({
  createClient: serverCreateClient,
}));

// Service-role admin client — chainable fake for `users` + `device_tokens`.
const adminFrom = vi.fn((table: string) => {
  if (table === 'users') {
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { notification_preferences: prefs },
            error: null,
          }),
        }),
      }),
    };
  }
  // device_tokens
  return {
    select: () => ({
      eq: () => ({
        // .from().select().eq('user_id').eq('active') is awaited directly.
        eq: async () => ({ data: deviceTokens, error: null }),
      }),
    }),
    update: () => ({
      eq: async () => ({ data: null, error: null }),
    }),
  };
});
const createAdminClient = vi.fn(() => ({ from: adminFrom }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }));

// --- fetch mock -----------------------------------------------------------

const fetchSpy = vi.fn(async () => ({ ok: true, text: async () => '' }));

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  prefs = { ...DEFAULT_NOTIFICATION_PREFERENCES, push_events: true };
  deviceTokens = [{ token: 'devicetoken123', platform: 'ios' }];
  serverCreateClient.mockClear();
  adminFrom.mockClear();
  createAdminClient.mockClear();
  fetchSpy.mockClear();
  vi.stubGlobal('fetch', fetchSpy);
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  consoleErrorSpy.mockRestore();
});

describe('sendPushNotification (background-safe)', () => {
  it('delivers via the service-role admin client without touching the cookie request client', async () => {
    const { sendPushNotification } = await import('@/lib/notifications/push');
    const result = await sendPushNotification('coachhelm_insight', 'user-1', { insightTitle: 'x' });

    expect(result.success).toBe(true);
    expect(createAdminClient).toHaveBeenCalled();
    // The regression guard: the no-request-scope cookie client is never used.
    expect(serverCreateClient).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('honors the recipient opt-out (push_events=false) and sends nothing', async () => {
    prefs = { ...DEFAULT_NOTIFICATION_PREFERENCES, push_events: false };
    const { sendPushNotification } = await import('@/lib/notifications/push');
    const result = await sendPushNotification('coachhelm_insight', 'user-1', { insightTitle: 'x' });

    expect(result.success).toBe(true);
    expect(serverCreateClient).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns success when the recipient has no active device tokens', async () => {
    deviceTokens = [];
    const { sendPushNotification } = await import('@/lib/notifications/push');
    const result = await sendPushNotification('coachhelm_insight', 'user-1', { insightTitle: 'x' });

    expect(result.success).toBe(true);
    expect(serverCreateClient).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

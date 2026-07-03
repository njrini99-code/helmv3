/**
 * Tests for src/lib/notifications/push.ts — `sendPushNotification`.
 *
 * Covers parsing the APNs edge-function's JSON failure response: on 410
 * (Unregistered) / 400 (BadDeviceToken) it returns { shouldDeactivateToken:
 * true }. Before the fix that flag was silently discarded (the body was
 * only ever read via `.text()`), so a permanently-dead token accumulated
 * failed_count forever without ever being deactivated — retried on every
 * scheduled push sweep indefinitely.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/lib/notifications/types';

const getUserNotificationPreferencesMock = vi.fn(async (_userId: string) => DEFAULT_NOTIFICATION_PREFERENCES);
vi.mock('@/lib/notifications/email', () => ({
  getUserNotificationPreferences: (userId: string) => getUserNotificationPreferencesMock(userId),
}));

type TokenRow = { token: string; platform: string };

function makeDeviceTokensFromMock(opts: {
  tokens: TokenRow[];
  currentFailedCount?: number;
  updateSpy: (payload: Record<string, unknown>) => void;
}) {
  const { tokens, currentFailedCount = 0, updateSpy } = opts;
  return vi.fn((table: string) => {
    if (table !== 'device_tokens') throw new Error(`unexpected table ${table}`);
    let mode: 'select-list' | 'update' = 'select-list';
    const builder: {
      select: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      eq: ReturnType<typeof vi.fn>;
      single: ReturnType<typeof vi.fn>;
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise<unknown>;
    } = {
      select: vi.fn(() => {
        mode = 'select-list';
        return builder;
      }),
      update: vi.fn((payload: Record<string, unknown>) => {
        mode = 'update';
        updateSpy(payload);
        return builder;
      }),
      eq: vi.fn(() => builder),
      single: vi.fn(() => Promise.resolve({ data: { failed_count: currentFailedCount } })),
      then: (resolve, reject) => {
        const result = mode === 'update' ? { data: null, error: null } : { data: tokens, error: null };
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return builder;
  });
}

describe('sendPushNotification — APNs failure-response parsing', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    getUserNotificationPreferencesMock.mockClear();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://xyz.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('deactivates the device token when the edge function returns shouldDeactivateToken=true (410/BadDeviceToken)', async () => {
    const updateSpy = vi.fn();
    const fromMock = makeDeviceTokensFromMock({
      tokens: [{ token: 'dead-token-1234567890', platform: 'ios' }],
      currentFailedCount: 130,
      updateSpy,
    });
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: () => ({ from: fromMock }),
    }));

    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: false,
          error: 'APNs error 410: Unregistered',
          shouldDeactivateToken: true,
        }),
        { status: 410 },
      ),
    ) as unknown as typeof fetch;

    const { sendPushNotification } = await import('@/lib/notifications/push');
    const result = await sendPushNotification('task_reminder', 'user-1', { taskTitle: 'Log rounds' });

    expect(result.success).toBe(true);
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ active: false, failed_count: 131 }),
    );
  });

  it('does NOT deactivate the token on a generic/transient failure (no shouldDeactivateToken flag)', async () => {
    const updateSpy = vi.fn();
    const fromMock = makeDeviceTokensFromMock({
      tokens: [{ token: 'flaky-token-1234567890', platform: 'ios' }],
      currentFailedCount: 2,
      updateSpy,
    });
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: () => ({ from: fromMock }),
    }));

    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ success: false, error: 'APNs error 502: upstream timeout' }),
        { status: 502 },
      ),
    ) as unknown as typeof fetch;

    const { sendPushNotification } = await import('@/lib/notifications/push');
    const result = await sendPushNotification('task_reminder', 'user-1', { taskTitle: 'Log rounds' });

    expect(result.success).toBe(true);
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const payload = updateSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('active');
    expect(payload.failed_count).toBe(3);
  });

  it('does not throw and does not deactivate when the failure body is not JSON', async () => {
    const updateSpy = vi.fn();
    const fromMock = makeDeviceTokensFromMock({
      tokens: [{ token: 'plain-text-failure-token', platform: 'ios' }],
      currentFailedCount: 0,
      updateSpy,
    });
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: () => ({ from: fromMock }),
    }));

    global.fetch = vi.fn(async () => new Response('Internal Server Error', { status: 500 })) as unknown as typeof fetch;

    const { sendPushNotification } = await import('@/lib/notifications/push');
    const result = await sendPushNotification('task_reminder', 'user-1', { taskTitle: 'Log rounds' });

    expect(result.success).toBe(true);
    const payload = updateSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('active');
    expect(payload.failed_count).toBe(1);
  });
});

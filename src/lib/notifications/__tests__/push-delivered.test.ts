import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `delivered` is the one signal that a push really reached a device. The "Notified anyway" stamp keys on it, so it must be set by a real send
 * and by nothing else: opted out, no device and failure all leave it unset or zero.
 */

vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}), logServerEvent: vi.fn(async () => {}), logServerException: vi.fn(async () => {}) }));
const prefs = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock('./../email', () => ({ getUserNotificationPreferences: async () => prefs.current }));

let tokens: { token: string; platform: string }[] = [];
let invokeError: { message: string } | null = null;
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const node: Record<string, unknown> = {};
      const self = () => node;
      Object.assign(node, {
        select: self, eq: self, update: self,
        single: async () => ({ data: { failed_count: 0 }, error: null }),
        then: (r: (v: unknown) => unknown) => Promise.resolve(table === 'device_tokens' ? { data: tokens, error: null } : { data: null, error: null }).then(r),
      });
      return node;
    },
    functions: { invoke: async () => ({ error: invokeError }) },
  }),
}));

const send = async () => (await import('@/lib/notifications/push')).sendPushNotificationDirect('new_message', 'user-1', { senderName: 'Coach', preview: 'now', conversationId: 'c1' });

beforeEach(() => {
  prefs.current = { push_messages: true };
  tokens = [{ token: 'tok_aaaaaaaa', platform: 'ios' }, { token: 'tok_bbbbbbbb', platform: 'ios' }];
  invokeError = null;
});

describe('sendPushNotificationDirect: delivered', () => {
  it('counts the devices a push reached', async () => {
    expect(await send()).toEqual({ success: true, delivered: 2 });
  });

  it('is unset when the user opted out, and when they have no device', async () => {
    prefs.current = { push_messages: false };
    expect(await send()).toEqual({ success: true });
    prefs.current = { push_messages: true };
    tokens = [];
    expect(await send()).toEqual({ success: true });
  });

  it('is absent from a failed send', async () => {
    invokeError = { message: 'BadDeviceToken' };
    const r = await send();
    expect(r.success).toBe(false);
    expect(r.delivered).toBeUndefined();
  });
});

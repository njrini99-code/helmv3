import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Deliverable 6 (Sentry max-observability, Phase C) — `sendPushNotification`
 * emits `helm.push.*` (metrics.ts `recordPush`) + one `helmLog` line at each
 * of its existing outcome branches: opted-out, no-devices, token-read-
 * failure, all-devices-rejected, success, and a thrown exception.
 *
 * Reuses the exact same fake-Supabase/mock scaffold as the sibling
 * push-reports-delivery.test.ts (which already drives every one of these
 * branches for the RETURN VALUE), adding only the observability-module
 * mocks so the calls can be asserted on directly.
 */

const logServerError = vi.fn(async () => {});
const logServerEvent = vi.fn(async () => {});

vi.mock('@/lib/server-error-logger', () => ({
  logServerError,
  logServerEvent,
  logServerException: vi.fn(async () => {}),
}));

const { recordPush, helmLog } = vi.hoisted(() => ({
  recordPush: vi.fn(),
  helmLog: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/observability/metrics', () => ({ recordPush }));
vi.mock('@/lib/observability/structured-log', () => ({ helmLog }));

type TokenRow = { token: string; platform: string };

let tokenOutcome: { data: TokenRow[] | null; error: { message: string } | null } = {
  data: [{ token: 'tok_aaaaaaaa', platform: 'ios' }],
  error: null,
};
let invokeOutcome: { error: { message: string } | null } = { error: null };
let invokeThrows = false;

vi.mock('@/lib/notifications/email', () => ({
  getUserNotificationPreferences: vi.fn(async () => ({})),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const node: Record<string, unknown> = {};
      const self = () => node;
      Object.assign(node, {
        select: self,
        eq: self,
        update: self,
        single: async () => ({ data: { failed_count: 0 }, error: null }),
        then: (r: (v: unknown) => unknown) =>
          Promise.resolve(
            table === 'device_tokens' ? tokenOutcome : { data: null, error: null },
          ).then(r),
      });
      return node;
    },
    functions: {
      invoke: async () => {
        if (invokeThrows) throw new Error('network down');
        return invokeOutcome;
      },
    },
  }),
}));

async function send() {
  const mod = await import('@/lib/notifications/push');
  return mod.sendPushNotification('announcement' as never, 'user-1', { title: 'x' });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  tokenOutcome = { data: [{ token: 'tok_aaaaaaaa', platform: 'ios' }], error: null };
  invokeOutcome = { error: null };
  invokeThrows = false;
});

describe('sendPushNotification — helm.push.* + helmLog', () => {
  it('records outcome:"success" when the device accepts the push', async () => {
    await send();

    expect(recordPush).toHaveBeenCalledTimes(1);
    expect(recordPush).toHaveBeenCalledWith(
      expect.objectContaining({ feature: 'push_notifications', action: 'announcement', outcome: 'success' }),
    );
    expect(helmLog.info).toHaveBeenCalledWith(
      'push.send_finished',
      expect.objectContaining({ result: 'success' }),
    );
  });

  it('records outcome:"failure" (errorCode:"no_device_accepted") when every device rejects the push, without reporting success', async () => {
    invokeOutcome = { error: { message: 'BadDeviceToken' } };

    await send();

    expect(recordPush).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failure', errorCode: 'no_device_accepted' }),
    );
    expect(helmLog.warn).toHaveBeenCalledWith(
      'push.send_finished',
      expect.objectContaining({ result: 'failure' }),
    );
  });

  it('records outcome:"failure" (errorCode:"no_device_accepted") when the per-token invoke throws', async () => {
    // A per-token throw is caught INSIDE the token loop's own try/catch
    // (unchanged pre-existing behavior — see push.ts), so `delivered` stays
    // 0 and this lands in the same `delivered === 0` branch as an ordinary
    // rejection, not the function's outer catch.
    invokeThrows = true;

    await send();

    expect(recordPush).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failure', errorCode: 'no_device_accepted' }),
    );
  });

  it('records outcome:"failure" (errorCode:"exception") when something outside the token loop throws', async () => {
    const { getUserNotificationPreferences } = await import('@/lib/notifications/email');
    vi.mocked(getUserNotificationPreferences).mockRejectedValueOnce(new Error('preferences store down'));

    await send();

    expect(recordPush).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failure', errorCode: 'exception' }),
    );
  });

  it('records outcome:"failure" (errorCode:"token_read_failed") when the device-token read itself fails', async () => {
    tokenOutcome = { data: null, error: { message: 'permission denied' } };

    await send();

    expect(recordPush).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failure', errorCode: 'token_read_failed' }),
    );
  });

  it('does NOT call recordPush for a genuinely-no-devices return — logs opted_out/no_devices at info instead', async () => {
    tokenOutcome = { data: [], error: null };

    await send();

    expect(recordPush).not.toHaveBeenCalled();
    expect(helmLog.info).toHaveBeenCalledWith(
      'push.send_skipped',
      expect.objectContaining({ result: 'no_devices' }),
    );
  });
});

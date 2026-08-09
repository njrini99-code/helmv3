import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Push notifications reported success no matter what happened.
 *
 * `sendPushNotification` ran a per-token loop in which BOTH failure paths — an
 * Edge Function rejection and a thrown network error — were swallowed to
 * `console.error`, and then the function returned `{ success: true }`
 * unconditionally after the loop. Separately, the token read at the top bundled
 * `tokenError` in with "no tokens" and returned success for that too.
 *
 * So `sendBulkPushNotification` counted `sent++` for every user, including
 * users whose every device rejected the push and users whose token read never
 * ran. A coach assigning a task, publishing travel, or posting an announcement
 * got a confident "sent" for notifications nobody received — and because the
 * failures went to `console.error` rather than logServerError, none of it
 * reached admin_events either, so the Bridge dashboard agreed.
 *
 * The honest case is deliberately preserved and tested: a user with genuinely
 * NO active device tokens is not a failure. Nothing was owed to them, and
 * saying "sent" for a person who has never opened the app on a phone would be
 * the opposite mistake.
 */

const logServerError = vi.fn(async () => {});
const logServerEvent = vi.fn(async () => {});

vi.mock('@/lib/server-error-logger', () => ({
  logServerError,
  logServerEvent,
  logServerException: vi.fn(async () => {}),
}));

type TokenRow = { token: string; platform: string };

let tokenOutcome: { data: TokenRow[] | null; error: { message: string } | null } = {
  data: [{ token: 'tok_aaaaaaaa', platform: 'ios' }],
  error: null,
};
/** What the Edge Function invoke returns for each token. */
let invokeOutcome: { error: { message: string } | null } = { error: null };
let invokeThrows = false;

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
  tokenOutcome = { data: [{ token: 'tok_aaaaaaaa', platform: 'ios' }], error: null };
  invokeOutcome = { error: null };
  invokeThrows = false;
});

describe('push — must not report delivery it did not achieve', () => {
  it('does not report success when every device rejected the push', async () => {
    invokeOutcome = { error: { message: 'BadDeviceToken' } };

    expect((await send()).success).toBe(false);
  });

  it('does not report success when the send throws', async () => {
    invokeThrows = true;

    expect((await send()).success).toBe(false);
  });

  it('does not report success when the device-token read failed', async () => {
    tokenOutcome = { data: null, error: { message: 'permission denied' } };

    expect((await send()).success).toBe(false);
  });

  it('records a delivery failure where an operator can see it', async () => {
    invokeOutcome = { error: { message: 'BadDeviceToken' } };

    await send();

    const said = logServerError.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(said.some((m) => /push/i.test(m))).toBe(true);
  });
});

describe('push — the honest non-delivery is still a success', () => {
  it('reports success for a user with genuinely no active device tokens', async () => {
    // Nothing was owed to them: they have never registered a device.
    tokenOutcome = { data: [], error: null };

    expect((await send()).success).toBe(true);
  });

  it('reports success when the device accepts the push', async () => {
    expect((await send()).success).toBe(true);
  });
});

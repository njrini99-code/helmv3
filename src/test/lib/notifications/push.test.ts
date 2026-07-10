/**
 * Tests for src/lib/notifications/push.ts — `sendPushNotification`.
 *
 * Covers parsing the APNs edge-function's JSON failure response: on 410
 * (Unregistered) / 400 (BadDeviceToken) it returns { shouldDeactivateToken:
 * true }. Before the fix that flag was silently discarded (the body was
 * only ever read via `.text()`), so a permanently-dead token accumulated
 * failed_count forever without ever being deactivated — retried on every
 * scheduled push sweep indefinitely.
 *
 * Also covers the info-severity prune log emitted when a dead token is
 * deactivated (ROOT CAUSE 1 follow-up): the send path is generic, so every
 * caller (message pushes, the CoachHelm v3 dispatcher, the roster-sweep
 * cron's downstream insight notifications, etc.) gets the prune + the log
 * for free instead of each caller reimplementing it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_NOTIFICATION_PREFERENCES, type NotificationPreferences } from '@/lib/notifications/types';

const getUserNotificationPreferencesMock = vi.fn(async (_userId: string) => DEFAULT_NOTIFICATION_PREFERENCES);
vi.mock('@/lib/notifications/email', () => ({
  getUserNotificationPreferences: (userId: string) => getUserNotificationPreferencesMock(userId),
}));

const logServerEventMock = vi.fn(async (..._args: unknown[]) => {});
vi.mock('@/lib/server-error-logger', () => ({
  logServerEvent: (...args: unknown[]) => logServerEventMock(...args),
}));

type TokenRow = { token: string; platform: string };

/**
 * Mirror of `supabase.functions.invoke` failure semantics: non-2xx responses
 * surface as an error whose `context` is the raw Response (FunctionsHttpError
 * shape — push.ts duck-types `context.text()` rather than instanceof so the
 * mock only needs the shape).
 */
function makeFunctionsInvokeMock(failureResponse: Response | null) {
  return vi.fn(async () =>
    failureResponse
      ? {
          data: null,
          error: {
            message: 'Edge Function returned a non-2xx status code',
            context: failureResponse,
          },
        }
      : { data: { success: true }, error: null },
  );
}

function makeDeviceTokensFromMock(opts: {
  tokens: TokenRow[];
  currentFailedCount?: number;
  updateSpy: (payload: Record<string, unknown>) => void;
  /** Simulate the deactivate UPDATE itself failing (e.g. RLS/connection). */
  updateError?: { message: string };
}) {
  const { tokens, currentFailedCount = 0, updateSpy, updateError = null } = opts;
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
        const result =
          mode === 'update' ? { data: null, error: updateError } : { data: tokens, error: null };
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return builder;
  });
}

describe('sendPushNotification — APNs failure-response parsing', () => {
  beforeEach(() => {
    getUserNotificationPreferencesMock.mockClear();
    logServerEventMock.mockClear();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://xyz.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
  });

  afterEach(() => {
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
    const invokeMock = makeFunctionsInvokeMock(
      new Response(
        JSON.stringify({
          success: false,
          error: 'APNs error 410: Unregistered',
          shouldDeactivateToken: true,
        }),
        { status: 410 },
      ),
    );
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: () => ({ from: fromMock, functions: { invoke: invokeMock } }),
    }));

    const { sendPushNotification } = await import('@/lib/notifications/push');
    const result = await sendPushNotification('task_reminder', 'user-1', { taskTitle: 'Log rounds' });

    expect(result.success).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith(
      'send-apns-push',
      expect.objectContaining({
        body: expect.objectContaining({ deviceToken: 'dead-token-1234567890', platform: 'ios' }),
      }),
    );
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ active: false, failed_count: 131 }),
    );

    // Prune is logged exactly once, at info severity, and never hits Sentry
    // as an Error issue (message/context first, severity last).
    expect(logServerEventMock).toHaveBeenCalledTimes(1);
    const [message, context, severity] = logServerEventMock.mock.calls[0]!;
    expect(message).toContain('pruned');
    expect(message).toContain('user-1');
    expect(context).toMatchObject({
      action: 'push.sendPushNotification.pruneDeadToken',
      userId: 'user-1',
    });
    expect(severity).toBe('info');
  });

  it('does NOT deactivate the token on a generic/transient failure (no shouldDeactivateToken flag)', async () => {
    const updateSpy = vi.fn();
    const fromMock = makeDeviceTokensFromMock({
      tokens: [{ token: 'flaky-token-1234567890', platform: 'ios' }],
      currentFailedCount: 2,
      updateSpy,
    });
    const invokeMock = makeFunctionsInvokeMock(
      new Response(
        JSON.stringify({ success: false, error: 'APNs error 502: upstream timeout' }),
        { status: 502 },
      ),
    );
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: () => ({ from: fromMock, functions: { invoke: invokeMock } }),
    }));

    const { sendPushNotification } = await import('@/lib/notifications/push');
    const result = await sendPushNotification('task_reminder', 'user-1', { taskTitle: 'Log rounds' });

    expect(result.success).toBe(true);
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const payload = updateSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('active');
    expect(payload.failed_count).toBe(3);
    expect(logServerEventMock).not.toHaveBeenCalled();
  });

  it('does not throw and does not deactivate when the failure body is not JSON', async () => {
    const updateSpy = vi.fn();
    const fromMock = makeDeviceTokensFromMock({
      tokens: [{ token: 'plain-text-failure-token', platform: 'ios' }],
      currentFailedCount: 0,
      updateSpy,
    });
    const invokeMock = makeFunctionsInvokeMock(new Response('Internal Server Error', { status: 500 }));
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: () => ({ from: fromMock, functions: { invoke: invokeMock } }),
    }));

    const { sendPushNotification } = await import('@/lib/notifications/push');
    const result = await sendPushNotification('task_reminder', 'user-1', { taskTitle: 'Log rounds' });

    expect(result.success).toBe(true);
    const payload = updateSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('active');
    expect(payload.failed_count).toBe(1);
    expect(logServerEventMock).not.toHaveBeenCalled();
  });

  it('does not log the prune when the deactivating UPDATE itself errors', async () => {
    const updateSpy = vi.fn();
    const fromMock = makeDeviceTokensFromMock({
      tokens: [{ token: 'dead-token-but-update-fails', platform: 'ios' }],
      currentFailedCount: 5,
      updateSpy,
      updateError: { message: 'connection reset' },
    });
    const invokeMock = makeFunctionsInvokeMock(
      new Response(
        JSON.stringify({
          success: false,
          error: 'APNs error 410: Unregistered',
          shouldDeactivateToken: true,
        }),
        { status: 410 },
      ),
    );
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: () => ({ from: fromMock, functions: { invoke: invokeMock } }),
    }));

    const { sendPushNotification } = await import('@/lib/notifications/push');
    const result = await sendPushNotification('task_reminder', 'user-1', { taskTitle: 'Log rounds' });

    expect(result.success).toBe(true);
    // The row is still asked to deactivate (the caller-side intent is
    // correct) — only the confirmation log is gated on the write succeeding,
    // so a token that silently fails to deactivate doesn't falsely claim to
    // be pruned in the admin feed / Sentry.
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ active: false }));
    expect(logServerEventMock).not.toHaveBeenCalled();
  });
});

/**
 * Regression coverage for the preference-routing fix: `coachhelm_insight`
 * used to be gated on `push_events` instead of the dedicated
 * `push_coachhelm` toggle (copy/paste drift vs. email.ts's shouldSendEmail,
 * which was already split correctly). Also covers `quiet_mode`, which
 * `gatedDelivery` — now wired into `shouldSendPush` — is the only code that
 * ever applied.
 *
 * These exercise `sendPushNotification` end-to-end and assert on whether the
 * device-token lookup ran at all: `shouldSendPush` returning false short-
 * circuits before `device_tokens` is ever queried, so "was the table
 * queried" is an observable proxy for "did the gate let it through".
 */
describe('sendPushNotification — preference routing (coachhelm_insight / quiet_mode)', () => {
  beforeEach(() => {
    getUserNotificationPreferencesMock.mockClear();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://xyz.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('sends a coachhelm_insight push when push_coachhelm is on, even with push_events off', async () => {
    // `quiet_mode` is persisted on the same users.notification_preferences
    // row as everything else but isn't part of NotificationPreferences —
    // assigned via a typed intermediate so it isn't a fresh-literal excess
    // property against the mock's inferred (NotificationPreferences) return type.
    const prefs: NotificationPreferences & { quiet_mode?: boolean } = {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      push_events: false,
      push_coachhelm: true,
    };
    getUserNotificationPreferencesMock.mockResolvedValueOnce(prefs);
    const fromMock = makeDeviceTokensFromMock({ tokens: [], updateSpy: vi.fn() });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: fromMock }) }));

    const { sendPushNotification } = await import('@/lib/notifications/push');
    await sendPushNotification('coachhelm_insight', 'user-1', { insightTitle: 'New pattern found' });

    expect(fromMock).toHaveBeenCalledWith('device_tokens');
  });

  it('does NOT send a coachhelm_insight push when push_coachhelm is off, even with push_events on', async () => {
    const prefs: NotificationPreferences & { quiet_mode?: boolean } = {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      push_events: true,
      push_coachhelm: false,
    };
    getUserNotificationPreferencesMock.mockResolvedValueOnce(prefs);
    const fromMock = makeDeviceTokensFromMock({ tokens: [], updateSpy: vi.fn() });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: fromMock }) }));

    const { sendPushNotification } = await import('@/lib/notifications/push');
    const result = await sendPushNotification('coachhelm_insight', 'user-1', { insightTitle: 'New pattern found' });

    expect(result.success).toBe(true);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('quiet_mode suppresses a non-exempt push type (coachhelm_insight)', async () => {
    const prefs: NotificationPreferences & { quiet_mode?: boolean } = {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      push_coachhelm: true,
      quiet_mode: true,
    };
    getUserNotificationPreferencesMock.mockResolvedValueOnce(prefs);
    const fromMock = makeDeviceTokensFromMock({ tokens: [], updateSpy: vi.fn() });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: fromMock }) }));

    const { sendPushNotification } = await import('@/lib/notifications/push');
    await sendPushNotification('coachhelm_insight', 'user-1', { insightTitle: 'New pattern found' });

    expect(fromMock).not.toHaveBeenCalled();
  });

  it('quiet_mode does NOT suppress a quiet-exempt push type (new_message)', async () => {
    const prefs: NotificationPreferences & { quiet_mode?: boolean } = {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      push_messages: true,
      quiet_mode: true,
    };
    getUserNotificationPreferencesMock.mockResolvedValueOnce(prefs);
    const fromMock = makeDeviceTokensFromMock({ tokens: [], updateSpy: vi.fn() });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: fromMock }) }));

    const { sendPushNotification } = await import('@/lib/notifications/push');
    await sendPushNotification('new_message', 'user-1', { senderName: 'Coach', preview: 'Hey' });

    expect(fromMock).toHaveBeenCalledWith('device_tokens');
  });
});

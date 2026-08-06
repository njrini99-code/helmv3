/**
 * Device-token registration must survive arriving before the user logs in.
 *
 * APNs delivers the token exactly ONCE per launch, and on a cold start it
 * arrives while the app is still on the login screen — no session, so
 * registerDeviceToken answers UNAUTHORIZED_RETRYABLE. The old code read that as
 * a cookie-propagation race and retried for ~15s, which cannot succeed when the
 * truth is "nobody has signed in yet": the token was then dropped for the rest
 * of the launch and the device received no push at all.
 *
 * Measured on production for the week to 2026-08-06: 6 of 7 registration
 * warnings were never followed by a device_tokens row.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const registerDeviceToken = vi.fn();

vi.mock('@/app/golf/actions/push-notifications', () => ({ registerDeviceToken }));
// isNativeApp() gates initPushListeners; these tests exercise the flush path
// directly, which has no native dependency.
vi.mock('@/lib/utils/capacitor', () => ({ isNativeApp: () => false }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'ios', isPluginAvailable: () => false } }));
vi.mock('@capacitor/push-notifications', () => ({ PushNotifications: {} }));

const UNAUTHORIZED = {
  success: false as const,
  error: 'Unauthorized',
  code: 'UNAUTHORIZED_RETRYABLE' as const,
  retryable: true,
};

/** Fresh module per test — the parked token is module-level state. */
async function loadModule() {
  vi.resetModules();
  return import('@/lib/utils/push-registration');
}

describe('pending device token survives until a session exists', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('flushing with nothing parked is a no-op — safe on every auth event', async () => {
    const mod = await loadModule();

    await mod.flushPendingDeviceToken();

    expect(registerDeviceToken).not.toHaveBeenCalled();
  });

  it('registers on the first attempt when a session is already present', async () => {
    const mod = await loadModule();
    registerDeviceToken.mockResolvedValue({ success: true });

    await mod.__setPendingDeviceTokenForTest({ value: 'apns-tok', platform: 'ios' });
    await mod.flushPendingDeviceToken();

    expect(registerDeviceToken).toHaveBeenCalledWith('apns-tok', 'ios');
    // Parked token cleared — a later auth event must not re-submit it.
    registerDeviceToken.mockClear();
    await mod.flushPendingDeviceToken();
    expect(registerDeviceToken).not.toHaveBeenCalled();
  });

  it('KEEPS the token parked when every attempt is unauthorized', async () => {
    const mod = await loadModule();
    registerDeviceToken.mockResolvedValue(UNAUTHORIZED);

    await mod.__setPendingDeviceTokenForTest({ value: 'apns-tok', platform: 'ios' });
    const flushed = mod.flushPendingDeviceToken();
    await vi.runAllTimersAsync();
    await flushed;

    // This is the whole fix: the old code gave up here and lost the token.
    expect(mod.__getPendingDeviceTokenForTest()).toEqual({ value: 'apns-tok', platform: 'ios' });
  });

  it('registers the parked token when the user finally signs in', async () => {
    const mod = await loadModule();
    registerDeviceToken.mockResolvedValue(UNAUTHORIZED);

    await mod.__setPendingDeviceTokenForTest({ value: 'apns-tok', platform: 'android' });
    const first = mod.flushPendingDeviceToken();
    await vi.runAllTimersAsync();
    await first;

    // …user logs in; CapacitorProvider's onAuthStateChange fires the flush.
    registerDeviceToken.mockResolvedValue({ success: true });
    await mod.flushPendingDeviceToken();

    expect(registerDeviceToken).toHaveBeenLastCalledWith('apns-tok', 'android');
    expect(mod.__getPendingDeviceTokenForTest()).toBeNull();
  });

  it('drops a token the server rejects non-retryably, instead of retrying forever', async () => {
    const mod = await loadModule();
    registerDeviceToken.mockResolvedValue({ success: false, error: 'Invalid device token payload' });

    await mod.__setPendingDeviceTokenForTest({ value: 'bad', platform: 'ios' });
    await mod.flushPendingDeviceToken();

    expect(mod.__getPendingDeviceTokenForTest()).toBeNull();
    expect(registerDeviceToken).toHaveBeenCalledTimes(1);
  });
});

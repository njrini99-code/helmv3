/**
 * Sign-out device-token teardown (M2-1, 2026-08-19).
 *
 * `unregisterDeviceToken` existed with ZERO callers: sign-out cleared the
 * session and left the device_tokens row active, so a logged-out (possibly
 * shared) device kept receiving the old user's message/announcement pushes
 * indefinitely. The fix wires `teardownDeviceTokenOnSignOut` into both
 * shells' sign-out hooks, under two hard constraints:
 *
 *   1. Sign-out must NEVER hang or fail on token cleanup (fire-and-forget,
 *      never throws).
 *   2. Push must not die for the launch: APNs delivers the token once per
 *      launch, so teardown RE-PARKS it and the existing flush-on-auth
 *      machinery re-registers it for the next sign-in on this device.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const registerDeviceToken = vi.fn();
const unregisterDeviceToken = vi.fn();

vi.mock('@/app/golf/actions/push-notifications', () => ({
  registerDeviceToken,
  unregisterDeviceToken,
}));
vi.mock('@/lib/utils/capacitor', () => ({ isNativeApp: () => false }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'ios', isPluginAvailable: () => false } }));
vi.mock('@capacitor/push-notifications', () => ({ PushNotifications: {} }));

/** Fresh module per test — the token handles are module-level state. */
async function loadModule() {
  vi.resetModules();
  return import('@/lib/utils/push-registration');
}

/** Let the teardown's dynamic-import promise chain settle. */
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('teardownDeviceTokenOnSignOut', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is a no-op when no token was ever registered this launch (web session)', async () => {
    const mod = await loadModule();

    mod.teardownDeviceTokenOnSignOut();
    await settle();

    expect(unregisterDeviceToken).not.toHaveBeenCalled();
    expect(mod.__getPendingDeviceTokenForTest()).toBeNull();
  });

  it('deactivates the registered token server-side AND re-parks it for the next sign-in', async () => {
    const mod = await loadModule();
    unregisterDeviceToken.mockResolvedValue({ success: true });
    mod.__setLastRegisteredDeviceTokenForTest({ value: 'apns-tok', platform: 'ios' });

    mod.teardownDeviceTokenOnSignOut();

    // Re-parked SYNCHRONOUSLY — the next SIGNED_IN flush must find it even if
    // the network call below never lands.
    expect(mod.__getPendingDeviceTokenForTest()).toEqual({ value: 'apns-tok', platform: 'ios' });

    await settle();
    expect(unregisterDeviceToken).toHaveBeenCalledWith('apns-tok');
  });

  it('the next same-launch sign-in re-registers the torn-down token (no push outage)', async () => {
    const mod = await loadModule();
    unregisterDeviceToken.mockResolvedValue({ success: true });
    registerDeviceToken.mockResolvedValue({ success: true });
    mod.__setLastRegisteredDeviceTokenForTest({ value: 'apns-tok', platform: 'android' });

    mod.teardownDeviceTokenOnSignOut();
    await settle();

    // …user B signs in; CapacitorProvider's onAuthStateChange fires the flush.
    await mod.flushPendingDeviceToken();

    expect(registerDeviceToken).toHaveBeenLastCalledWith('apns-tok', 'android');
    expect(mod.__getPendingDeviceTokenForTest()).toBeNull();
  });

  it('never throws and keeps the token parked when the server call fails — sign-out is unblockable', async () => {
    const mod = await loadModule();
    unregisterDeviceToken.mockRejectedValue(new Error('network down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mod.__setLastRegisteredDeviceTokenForTest({ value: 'apns-tok', platform: 'ios' });

    expect(() => mod.teardownDeviceTokenOnSignOut()).not.toThrow();
    await settle();

    // Failure tolerated (pre-fix status quo for this one sign-out), token
    // still parked so the next sign-in self-heals.
    expect(mod.__getPendingDeviceTokenForTest()).toEqual({ value: 'apns-tok', platform: 'ios' });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('falls back to a parked-but-never-registered token so an interrupted launch still tears down', async () => {
    const mod = await loadModule();
    unregisterDeviceToken.mockResolvedValue({ success: true });
    await mod.__setPendingDeviceTokenForTest({ value: 'parked-tok', platform: 'ios' });

    mod.teardownDeviceTokenOnSignOut();
    await settle();

    expect(unregisterDeviceToken).toHaveBeenCalledWith('parked-tok');
    expect(mod.__getPendingDeviceTokenForTest()).toEqual({ value: 'parked-tok', platform: 'ios' });
  });
});

// @vitest-environment jsdom
/**
 * usePushSubscription — the mount check must not ask the engine for a subscription nobody can have.
 *
 * WHY THIS EXISTS. Clubhouse Settings froze the page's main thread in WebKit (Playwright's build, with the service
 * worker registered; production only, because the hook is gated on NODE_ENV). Bisected 2026-11-18: with the service
 * worker blocked the page was fine, with `PushManager.prototype.getSubscription` stubbed it was fine, and a bare page
 * with only a service worker and one `pushManager.getSubscription()` call froze too. The hook ran that call on every
 * open of Settings. A subscription cannot exist before the permission is granted, so the answer is known without it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { usePushSubscription } from '../use-push-subscription';

const getSubscription = vi.fn();

function setPermission(permission: NotificationPermission) {
  vi.stubGlobal('Notification', { permission });
}

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production');
  getSubscription.mockReset();
  vi.stubGlobal('PushManager', class {});
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: Promise.resolve({ pushManager: { getSubscription } }) },
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('usePushSubscription mount check', () => {
  it('does not call getSubscription before the permission is granted', async () => {
    setPermission('default');
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.status).toBe('unsubscribed'));
    expect(getSubscription).not.toHaveBeenCalled();
  });

  it('reads the existing subscription once the permission is granted', async () => {
    setPermission('granted');
    getSubscription.mockResolvedValue({ endpoint: 'https://push.example/1' });
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.status).toBe('subscribed'));
    expect(getSubscription).toHaveBeenCalledTimes(1);
  });

  it('reports denied without asking the engine', async () => {
    setPermission('denied');
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.status).toBe('denied'));
    expect(getSubscription).not.toHaveBeenCalled();
  });
});

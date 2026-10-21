import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * useNativePush: Settings › Notifications in the iOS app (CH-8902, CH-8903; docs/clubhouse/phone/push-opt-in.md). It
 * reads iOS, asks through the shared requestPushPermission, reads again on return from iOS Settings, and registers
 * with Apple when push was turned on there.
 */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../../../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const toastSpy = vi.hoisted(() => vi.fn());
vi.mock('../../../ui/Toast', () => ({ useToast: () => toastSpy }));
const push = vi.hoisted(() => ({
  nativePushPermission: vi.fn(async (): Promise<'prompt' | 'granted' | 'denied' | 'unsupported'> => 'prompt'),
  requestPushPermission: vi.fn(async (): Promise<'granted' | 'denied'> => 'granted'),
}));
vi.mock('@/lib/utils/push-registration', () => push);
const cap = vi.hoisted(() => ({ canOpen: true, open: vi.fn(() => true) }));
vi.mock('@/lib/utils/capacitor', () => ({ canOpenNativeAppSettings: () => cap.canOpen, openNativeAppSettings: cap.open }));

import { useNativePush } from '../native-push';

beforeEach(() => {
  hapticSpy.mockClear();
  toastSpy.mockClear();
  push.nativePushPermission.mockReset().mockResolvedValue('prompt');
  push.requestPushPermission.mockReset().mockResolvedValue('granted');
  cap.canOpen = true;
  cap.open.mockClear();
});

function visible() {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('useNativePush', () => {
  it('on the web: nothing, and iOS is never read', async () => {
    const { result } = renderHook(() => useNativePush(false));
    expect(result.current).toBeUndefined();
    await act(async () => {});
    expect(push.nativePushPermission).not.toHaveBeenCalled();
  });

  it('where the plugin cannot answer: nothing', async () => {
    push.nativePushPermission.mockResolvedValue('unsupported');
    const { result } = renderHook(() => useNativePush(true));
    await waitFor(() => expect(result.current).toBeUndefined());
  });

  it('CH-8902 reads iOS (checking first), then Turn on asks, reads again, and a yes is the success tap and a toast', async () => {
    const { result } = renderHook(() => useNativePush(true));
    expect(result.current?.status).toBe('checking');
    await waitFor(() => expect(result.current?.status).toBe('prompt'));
    push.nativePushPermission.mockResolvedValue('granted');
    await act(async () => {
      await result.current!.turnOn();
    });
    expect(push.requestPushPermission).toHaveBeenCalledTimes(1);
    expect(result.current?.status).toBe('granted');
    expect(result.current?.pending).toBe(false);
    expect(hapticSpy).toHaveBeenCalledWith('success');
    expect(toastSpy).toHaveBeenCalledWith({ title: 'Push is on for this device' });
  });

  it('CH-8903 a no: the row follows iOS, with no success tap or toast', async () => {
    const { result } = renderHook(() => useNativePush(true));
    await waitFor(() => expect(result.current?.status).toBe('prompt'));
    push.requestPushPermission.mockResolvedValue('denied');
    push.nativePushPermission.mockResolvedValue('denied');
    await act(async () => {
      await result.current!.turnOn();
    });
    expect(result.current?.status).toBe('denied');
    expect(hapticSpy).not.toHaveBeenCalled();
    expect(toastSpy).not.toHaveBeenCalled();
  });

  it('two taps while iOS prompt is up ask once', async () => {
    let answer!: (v: 'granted' | 'denied') => void;
    push.requestPushPermission.mockImplementation(() => new Promise((r) => (answer = r)));
    const { result } = renderHook(() => useNativePush(true));
    await waitFor(() => expect(result.current?.status).toBe('prompt'));
    let first!: Promise<void>;
    act(() => {
      first = result.current!.turnOn();
    });
    await waitFor(() => expect(result.current?.pending).toBe(true));
    await act(async () => {
      await result.current!.turnOn();
    });
    expect(push.requestPushPermission).toHaveBeenCalledTimes(1);
    await act(async () => {
      answer('granted');
      await first;
    });
  });

  it('CH-8903 back from iOS Settings: reads again; turned on there, it registers with Apple now', async () => {
    push.nativePushPermission.mockResolvedValue('denied');
    const { result } = renderHook(() => useNativePush(true));
    await waitFor(() => expect(result.current?.status).toBe('denied'));
    push.nativePushPermission.mockResolvedValue('granted');
    await act(async () => visible());
    await waitFor(() => expect(result.current?.status).toBe('granted'));
    // requestPushPermission with iOS already saying yes shows no prompt and registers.
    expect(push.requestPushPermission).toHaveBeenCalledTimes(1);
    // Coming back again while on does not register again.
    await act(async () => visible());
    expect(push.requestPushPermission).toHaveBeenCalledTimes(1);
  });

  it('Open iOS Settings only where it can open', async () => {
    const { result, rerender } = renderHook(() => useNativePush(true));
    await waitFor(() => expect(result.current?.status).toBe('prompt'));
    result.current!.openSettings!();
    expect(cap.open).toHaveBeenCalledTimes(1);
    cap.canOpen = false;
    rerender();
    expect(result.current?.openSettings).toBeUndefined();
  });
});

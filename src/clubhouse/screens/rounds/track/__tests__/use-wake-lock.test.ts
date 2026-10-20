/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWakeLock } from '../use-wake-lock';

/** A sentinel the test can release the way the browser does when the page is hidden. */
function sentinel() {
  const listeners: Array<() => void> = [];
  const s = {
    released: false,
    release: vi.fn(async () => {
      s.released = true;
      listeners.forEach((l) => l());
    }),
    addEventListener: (_type: 'release', l: () => void) => listeners.push(l),
  };
  return s;
}

let visibility: DocumentVisibilityState = 'visible';
const setVisibility = (v: DocumentVisibilityState) => {
  visibility = v;
  document.dispatchEvent(new Event('visibilitychange'));
};
const flush = () => act(async () => {});

describe('useWakeLock (wave 9, owner decision A)', () => {
  beforeEach(() => {
    visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  });
  afterEach(() => {
    delete (navigator as { wakeLock?: unknown }).wakeLock;
    delete (document as { visibilityState?: unknown }).visibilityState;
  });
  const mock = (request: (type: 'screen') => Promise<unknown>) => {
    const api = { request: vi.fn(request) };
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: api });
    return api;
  };

  it('holds the screen on while mounted and lets it go on unmount', async () => {
    const s = sentinel();
    const api = mock(async () => s);
    const { unmount } = renderHook(() => useWakeLock());
    await flush();
    expect(api.request).toHaveBeenCalledTimes(1);
    expect(api.request).toHaveBeenCalledWith('screen');
    unmount();
    await flush();
    expect(s.release).toHaveBeenCalledTimes(1);
  });

  it('asks again when the page comes back, once', async () => {
    const first = sentinel();
    const second = sentinel();
    const api = mock(vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second));
    renderHook(() => useWakeLock());
    await flush();
    // Hidden: the browser drops the lock on its own.
    setVisibility('hidden');
    await act(async () => {
      await first.release();
    });
    expect(api.request).toHaveBeenCalledTimes(1);
    setVisibility('visible');
    setVisibility('visible');
    await flush();
    expect(api.request).toHaveBeenCalledTimes(2);
  });

  it('does not ask while the page is hidden', async () => {
    visibility = 'hidden';
    const api = mock(async () => sentinel());
    renderHook(() => useWakeLock());
    await flush();
    expect(api.request).not.toHaveBeenCalled();
  });

  it('lets a lock go that lands after unmount', async () => {
    const s = sentinel();
    let resolve: (v: unknown) => void = () => {};
    mock(() => new Promise((r) => (resolve = r)));
    const { unmount } = renderHook(() => useWakeLock());
    unmount();
    await act(async () => resolve(s));
    await flush();
    expect(s.release).toHaveBeenCalledTimes(1);
  });

  it('is a silent no-op where the browser refuses or has no wake lock', async () => {
    mock(async () => {
      throw new DOMException('Not allowed', 'NotAllowedError');
    });
    const refused = renderHook(() => useWakeLock());
    await flush();
    refused.unmount();
    delete (navigator as { wakeLock?: unknown }).wakeLock;
    expect(() => renderHook(() => useWakeLock()).unmount()).not.toThrow();
  });
});

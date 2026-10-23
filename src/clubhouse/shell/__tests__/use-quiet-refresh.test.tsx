import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** A17: back after a minute away, or back online, the page fetches again; never under someone typing or scoring. */

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn(), prefetch: vi.fn() }) }));
vi.mock('@/lib/utils/capacitor', () => ({ isNativeApp: () => false }));

import { useQuietRefresh } from '../use-quiet-refresh';

let state: DocumentVisibilityState = 'visible';
const setVisibility = (next: DocumentVisibilityState) => {
  state = next;
  act(() => void document.dispatchEvent(new Event('visibilitychange')));
};
const awayFor = (ms: number) => {
  setVisibility('hidden');
  act(() => void vi.advanceTimersByTime(ms));
  setVisibility('visible');
};

beforeEach(() => {
  vi.useFakeTimers();
  refresh.mockClear();
  state = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('Shell · quiet refresh (A17)', () => {
  it('hidden for 30s then shown: no refresh', () => {
    renderHook(() => useQuietRefresh('/golf/dashboard'));
    awayFor(30_000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('hidden for 90s then shown: one refresh', () => {
    renderHook(() => useQuietRefresh('/golf/dashboard'));
    awayFor(90_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('back online: one refresh, after the connection has held 2s', () => {
    renderHook(() => useQuietRefresh('/golf/dashboard'));
    act(() => void window.dispatchEvent(new Event('online')));
    act(() => void window.dispatchEvent(new Event('online')));
    act(() => void vi.advanceTimersByTime(1_999));
    expect(refresh).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('a field with focus or an open dialog: no refresh', () => {
    renderHook(() => useQuietRefresh('/golf/dashboard'));
    const field = document.createElement('textarea');
    document.body.append(field);
    field.focus();
    awayFor(90_000);
    expect(refresh).not.toHaveBeenCalled();
    field.blur();
    const sheet = document.createElement('div');
    sheet.setAttribute('role', 'dialog');
    document.body.append(sheet);
    awayFor(90_000);
    expect(refresh).not.toHaveBeenCalled();
    sheet.remove();
    awayFor(90_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('a round being scored: no refresh', () => {
    renderHook(() => useQuietRefresh('/golf/dashboard/rounds/continue/7f1c2a9e-0000-4000-8000-000000000001'));
    awayFor(90_000);
    act(() => void window.dispatchEvent(new Event('online')));
    act(() => void vi.advanceTimersByTime(2_000));
    expect(refresh).not.toHaveBeenCalled();
  });
});

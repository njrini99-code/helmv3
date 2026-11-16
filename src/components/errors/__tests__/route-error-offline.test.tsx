import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * GAP-S-05, GAP-S-35: the route error offline and its Try again.
 * - Inside Clubhouse, a read that failed while the browser says it has no network is the offline page (CH-1290). It
 *   never retries into the same failure on its own, and it tries again once when the `online` event arrives.
 * - Try again starts at once (it used to wait a second first) and shows progress only while the refresh is out.
 * - Outside Clubhouse (Fairway, BaseballHelm) the boundary still auto-retries as it did.
 */

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }), usePathname: () => '/golf/dashboard/rounds' }));
vi.mock('@/lib/recovery/client', async (orig) => ({ ...(await orig<object>()), requestRecovery: vi.fn(() => 'scheduled') }));
vi.mock('@/lib/error-logging', async (orig) => ({ ...(await orig<object>()), logError: vi.fn(), logErrorToServer: vi.fn() }));

import { CompactRouteErrorBoundary, RouteErrorBoundary } from '../RouteErrorBoundary';
import { ClubhouseMarker } from '@/clubhouse/shell/context';

const setOnline = (v: boolean) => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => v });
const failedFetch = () => new TypeError('Failed to fetch');
const code = () => document.querySelector('[data-ch-code^="CH-12"]')?.getAttribute('data-ch-code');

function inClubhouse(error: Error, reset = vi.fn()) {
  return render(
    <div className="ch-root" data-ui="clubhouse">
      {/* eslint-disable-next-line jsx-a11y/aria-role -- role is a component prop, not an ARIA role */}
      <ClubhouseMarker role="player">
        <RouteErrorBoundary error={error} reset={reset} route="/golf/dashboard/rounds" homePath="/golf/dashboard" />
      </ClubhouseMarker>
    </div>,
  );
}

beforeEach(() => {
  refresh.mockClear();
  try {
    sessionStorage.clear();
  } catch {
    // jsdom always has it; the boundary itself tolerates its absence
  }
  vi.useFakeTimers();
});
afterEach(() => {
  setOnline(true);
  vi.useRealTimers();
});

describe('Route error offline (GAP-S-05)', () => {
  it('CH-1290 a failed read while offline is the offline page, and it does not retry on its own', () => {
    setOnline(false);
    const reset = vi.fn();
    inClubhouse(failedFetch(), reset);
    expect(code()).toBe('CH-1290');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('You’re offline');
    expect(screen.getByText('This page needs a connection. It loads by itself when you’re back online.')).toBeTruthy();
    // The transient auto-retry fires after 2s online; offline it never does.
    act(() => void vi.advanceTimersByTime(10_000));
    expect(refresh).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
  });

  it('the connection coming back tries again, once, and the page keeps saying offline while it does', () => {
    setOnline(false);
    const reset = vi.fn();
    inClubhouse(new Error('network error'), reset);
    expect(code()).toBe('CH-1290');
    setOnline(true);
    act(() => void window.dispatchEvent(new Event('online')));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(code()).toBe('CH-1290');
    // Back online, the transient auto-retry does not add a second try on top.
    act(() => void vi.advanceTimersByTime(10_000));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('a page that went offline after it failed stops its pending auto-retry and waits for the connection', () => {
    const reset = vi.fn();
    inClubhouse(failedFetch(), reset);
    // "Failed to fetch" online reads as the server being slow (transient), with its auto-retry pending.
    expect(code()).toBe('CH-1204');
    setOnline(false);
    act(() => void window.dispatchEvent(new Event('offline')));
    expect(code()).toBe('CH-1290');
    act(() => void vi.advanceTimersByTime(10_000));
    expect(refresh).not.toHaveBeenCalled();
    setOnline(true);
    act(() => void window.dispatchEvent(new Event('online')));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('Try again while offline says so (CH-1905) instead of retrying into the same failure', () => {
    setOnline(false);
    const reset = vi.fn();
    // A crash that is not a network failure keeps its own page, but its Try again still waits for the connection.
    inClubhouse(new Error('Cannot read properties of undefined'), reset);
    expect(code()).toBe('CH-1206');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refresh).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
    expect(document.querySelector('[data-ch-code="CH-1905"]')?.textContent).toBe('You’re offline. Reconnect, then try again.');
  });

  it('the offline page adds no second offline line when Try again is pressed', () => {
    setOnline(false);
    inClubhouse(failedFetch());
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refresh).not.toHaveBeenCalled();
    expect(document.querySelector('[data-ch-code="CH-1905"]')).toBeNull();
  });
});

describe('Route error Try again (GAP-S-35)', () => {
  it('starts the refresh at once, with no wait before it', () => {
    const reset = vi.fn();
    inClubhouse(new Error('Cannot read properties of undefined'), reset);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    // No timer advanced: the old boundary waited 1000ms here before it refreshed.
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('outside Clubhouse the boundary still auto-retries a transient failure, and its retry starts at once', () => {
    setOnline(false);
    const reset = vi.fn();
    render(<RouteErrorBoundary error={failedFetch()} reset={reset} route="/baseball/dashboard" homePath="/baseball/dashboard" />);
    expect(code()).toBeUndefined();
    act(() => void vi.advanceTimersByTime(2000));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('the compact boundary’s Try Again still refreshes and resets (it shares the module, outside Clubhouse)', () => {
    const reset = vi.fn();
    render(<CompactRouteErrorBoundary error={new Error('boom')} reset={reset} route="/baseball/dashboard" />);
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

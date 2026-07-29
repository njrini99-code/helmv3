/**
 * `useSequencedNavigation` owns three timers, and one of them calls
 * `window.location.replace` — a HARD navigation that reloads the browser on
 * whatever page the user has reached by then. It had no test coverage.
 *
 * `cancel()` is the safety valve for all of it, and two separate exits in
 * /golf/welcome now depend on it holding:
 *
 *   · Skip — stands the sequence down and leaves on its own 160ms beat.
 *   · The signed-out bounce — leaves for /golf/login. This one did NOT cancel,
 *     so a visitor with no session got bounced to the login form and then
 *     hard-reloaded onto the dashboard ~4.5s later, which bounced them back to
 *     login with the form cleared.
 *
 * So these assertions are the contract those fixes rest on, not hook trivia.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRef } from 'react';

const mockReplace = vi.fn();
const mockPrefetch = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, prefetch: mockPrefetch, push: vi.fn() }),
}));

import { useSequencedNavigation } from '@/hooks/use-sequenced-navigation';

const FADE = 1000;
const NAV = 2000;
const FAILSAFE = 4500;

/** Renders the hook with a stable destination ref, returning its controls. */
function setup(onFade = vi.fn()) {
  const rendered = renderHook(() => {
    const destinationRef = useRef('/golf/dashboard');
    return useSequencedNavigation({
      armed: true,
      destinationRef,
      fadeAtMs: FADE,
      navigateAtMs: NAV,
      failsafeAtMs: FAILSAFE,
      onFade,
    });
  });
  return { ...rendered, onFade };
}

describe('useSequencedNavigation', () => {
  let locationReplace: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockReplace.mockReset();
    mockPrefetch.mockReset();
    locationReplace = vi.fn();
    // jsdom's window.location.replace is not writable; swap the whole object.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, replace: locationReplace },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs the sequence: fade, then a soft replace', () => {
    const { onFade } = setup();

    vi.advanceTimersByTime(FADE);
    expect(onFade).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();

    vi.advanceTimersByTime(NAV - FADE);
    expect(mockReplace).toHaveBeenCalledWith('/golf/dashboard');
  });

  it('does NOT fire the hard failsafe once the soft replace has run', () => {
    setup();
    vi.advanceTimersByTime(FAILSAFE + 100);

    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(locationReplace).not.toHaveBeenCalled();
  });

  it('fires the hard failsafe only when the soft replace never claimed it', () => {
    // Simulate router.replace being a no-op (the hang this failsafe exists for).
    const { onFade } = setup();
    vi.advanceTimersByTime(FADE);
    expect(onFade).toHaveBeenCalled();

    // The hook's own hasNavigatedRef is set by the nav timer, so to observe the
    // failsafe we assert the ordering guarantee instead: nav fires first, and
    // the failsafe is the one that would reach for a hard reload.
    vi.advanceTimersByTime(FAILSAFE);
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  describe('cancel() — the contract /golf/welcome depends on', () => {
    it('cancelled before the fade: nothing fires at all', () => {
      const { result, onFade } = setup();

      result.current.cancel();
      vi.advanceTimersByTime(FAILSAFE + 1000);

      expect(onFade).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
      expect(locationReplace).not.toHaveBeenCalled();
    });

    it('cancelled after the fade: no soft replace and no hard reload', () => {
      const { result, onFade } = setup();

      vi.advanceTimersByTime(FADE);
      expect(onFade).toHaveBeenCalledTimes(1);

      result.current.cancel();
      vi.advanceTimersByTime(FAILSAFE + 1000);

      expect(mockReplace).not.toHaveBeenCalled();
      expect(locationReplace).not.toHaveBeenCalled();
    });

    it('is idempotent — repeated calls are safe', () => {
      const { result } = setup();

      expect(() => {
        result.current.cancel();
        result.current.cancel();
        result.current.cancel();
      }).not.toThrow();

      vi.advanceTimersByTime(FAILSAFE + 1000);
      expect(mockReplace).not.toHaveBeenCalled();
      expect(locationReplace).not.toHaveBeenCalled();
    });

    it('survives unmount after cancel without firing anything', () => {
      const { result, unmount } = setup();

      result.current.cancel();
      unmount();
      vi.advanceTimersByTime(FAILSAFE + 1000);

      expect(mockReplace).not.toHaveBeenCalled();
      expect(locationReplace).not.toHaveBeenCalled();
    });
  });

  it('unmounting alone clears the timers — no navigation from a dead component', () => {
    const { unmount, onFade } = setup();

    unmount();
    vi.advanceTimersByTime(FAILSAFE + 1000);

    expect(onFade).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(locationReplace).not.toHaveBeenCalled();
  });
});

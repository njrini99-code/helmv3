/**
 * `replaceStageUrl` must not write history for a URL that is already current.
 *
 * Safari throttles `history.replaceState` to 100 calls per 10 seconds and
 * throws `SecurityError` past that. Observed once in production 2026-08-27
 * (iOS 18.7 WKWebView on /golf/dashboard, a deep recursive render loop in the
 * stack ending at `replaceState`). These tests do not claim to cover that
 * loop — they cover the narrower, provable thing: a call that would change
 * nothing consumes no budget.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { replaceStageUrl } from '@/components/fairway/modules/StageRouter';

const replaceStateSpy = vi.fn();

function setUrl(href: string) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: new URL(href),
  });
}

beforeEach(() => {
  replaceStateSpy.mockReset();
  vi.spyOn(window.history, 'replaceState').mockImplementation(replaceStateSpy);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('replaceStageUrl', () => {
  it('writes history when the stage actually changes', () => {
    setUrl('https://helmsportslabs.com/golf/dashboard');
    expect(replaceStageUrl('view', 'stats', 'home')).toBe(true);
    expect(replaceStateSpy).toHaveBeenCalledTimes(1);
    expect(replaceStateSpy.mock.calls[0]?.[2]).toBe('/golf/dashboard?view=stats');
  });

  it('does NOT write history when the resulting URL is identical', () => {
    setUrl('https://helmsportslabs.com/golf/dashboard?view=stats');
    expect(replaceStageUrl('view', 'stats', 'home')).toBe(true);
    expect(replaceStateSpy).not.toHaveBeenCalled();
  });

  it('does NOT write history when returning home from an already-clean URL', () => {
    setUrl('https://helmsportslabs.com/golf/dashboard');
    expect(replaceStageUrl('view', 'home', 'home')).toBe(true);
    expect(replaceStateSpy).not.toHaveBeenCalled();
  });

  it('a hundred repeats of the same stage cost one write, not a hundred', () => {
    // This is the shape that trips Safari's throttle. One render storm landing
    // on the same stage should not exhaust a per-10s budget.
    setUrl('https://helmsportslabs.com/golf/dashboard');
    for (let i = 0; i < 100; i++) {
      replaceStageUrl('view', 'stats', 'home');
      setUrl('https://helmsportslabs.com/golf/dashboard?view=stats');
    }
    expect(replaceStateSpy).toHaveBeenCalledTimes(1);
  });

  it('still dispatches the navigation event even when it skips the history write', () => {
    // Listeners care that a stage was selected, not that the address bar
    // changed — skipping the event would make re-selecting the current stage
    // silently do nothing.
    setUrl('https://helmsportslabs.com/golf/dashboard?view=stats');
    const onNav = vi.fn();
    window.addEventListener('helm:stage-navigation', onNav);
    replaceStageUrl('view', 'stats', 'home');
    window.removeEventListener('helm:stage-navigation', onNav);
    expect(onNav).toHaveBeenCalledTimes(1);
    expect(replaceStateSpy).not.toHaveBeenCalled();
  });
});

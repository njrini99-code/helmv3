import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * CH-R1 (W7 P0): CoachHelm's loaders record what they return as shown, so it is never fetched ahead of the tap: not as
 * a tab, not as a recent section, not on press. Every other tab still is.
 */

const router = vi.hoisted(() => ({ prefetch: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

import { fullPrefetchAllowed } from '../../lib/prefetch-guard';
import { CH_PHONE_TABS } from '../nav';
import { prefetchOnPress, resetPrefetchTabsForTests, usePrefetchTabs } from '../use-prefetch-tabs';

const HOME = '/golf/dashboard';
const CAL = '/golf/dashboard/calendar';
const HELM = '/golf/dashboard/coachhelm';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
  resetPrefetchTabsForTests();
  router.prefetch.mockClear();
  Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
});
afterEach(() => vi.useRealTimers());

const fetched = () => router.prefetch.mock.calls.map(([href]) => String(href));

describe('CH-R1 · CoachHelm is never fetched ahead', () => {
  it('is a phone tab for both roles, so the guard is what keeps it out', () => {
    expect(CH_PHONE_TABS.coach).toContain('coachhelm');
    expect(CH_PHONE_TABS.player).toContain('coachhelm');
  });

  it('as a tab and as a section, every other tab is fetched and CoachHelm is not', () => {
    renderHook(() => usePrefetchTabs([HOME, CAL, HELM], HOME, [HOME, CAL, HELM]));
    act(() => void vi.advanceTimersByTime(5_000));
    expect(fetched()).toContain(CAL);
    expect(fetched().some((href) => href.startsWith(HELM))).toBe(false);
  });

  it('on press, with a view or a player in the address, it is not fetched either', () => {
    for (const href of [HELM, `${HELM}?view=ask`, `${HELM}/track-record`]) prefetchOnPress(router as never, href, Date.now());
    expect(router.prefetch).not.toHaveBeenCalled();
    prefetchOnPress(router as never, CAL, Date.now());
    expect(fetched()).toEqual([CAL]);
  });

  it('the guard names CoachHelm only', () => {
    expect([HELM, `${HELM}?view=ask`, `${HELM}/brief`].map(fullPrefetchAllowed)).toEqual([false, false, false]);
    expect([HOME, CAL, '/golf/dashboard/coachhelmish', '/golf/dashboard/stats?tab=coachhelm'].map(fullPrefetchAllowed)).toEqual([true, true, true, true]);
  });
});

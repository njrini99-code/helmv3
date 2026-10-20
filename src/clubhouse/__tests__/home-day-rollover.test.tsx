import { LazyMotion, domAnimation } from 'motion/react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * P002 Home: "today" on the team's clock, and a page left open past midnight reading itself again
 * (screens/home/use-day-rollover.ts). Every case names its zones, so the result does not depend on the machine's own
 * zone (run it under TZ=Pacific/Auckland and TZ=America/Los_Angeles as well as the default).
 */

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard' }));
vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));

import type { ChHomeClock } from '../data/home';
import { CoachHome } from '../screens/home/CoachHome';
import { PlayerHome } from '../screens/home/PlayerHome';
import { dayIn, deviceZone, msToNextMidnight, useHomeDayRollover } from '../screens/home/use-day-rollover';
import { whenLabel } from '../screens/home/event-links';
import { PREVIEW_HOME } from '../preview/fixtures';
import { PREVIEW_PLAYER_HOME } from '../preview/fixtures-player-home';
import { ToastProvider } from '../ui/Toast';

function Probe({ clock, frozen = false }: { clock?: ChHomeClock; frozen?: boolean }) {
  useHomeDayRollover(clock, frozen);
  return null;
}
const LA = 'America/Los_Angeles';
const refreshes = () => router.refresh.mock.calls.length;
const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  act(() => void document.dispatchEvent(new Event('visibilitychange')));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  router.refresh.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Home · the team clock', () => {
  it('dayIn and msToNextMidnight read the given zone, not the device’s', () => {
    // 03:00 UTC on the 18th is 20:00 on the 17th in Los Angeles and 16:00 on the 18th in Auckland.
    const t = new Date('2026-10-18T03:00:00Z');
    expect(dayIn(t, LA)).toBe('2026-10-17');
    expect(dayIn(t, 'Pacific/Auckland')).toBe('2026-10-18');
    expect(msToNextMidnight(new Date('2026-10-18T06:59:00Z'), LA)).toBe(60_000);
    expect(msToNextMidnight(new Date('2026-10-18T07:00:00Z'), LA)).toBe(86_400_000);
  });

  it('20301 "Tomorrow" and "Today" compare both dates on the team’s clock, whatever the device’s zone', () => {
    // 22:30 on the 17th in Los Angeles; already the 18th in UTC and in Auckland.
    const now = new Date('2026-10-18T05:30:00Z');
    const base = { id: 'e', title: 'Qualifier', type: 'qualifier' as const, timezone: LA, endIso: null, location: null, invitees: null, going: null, conflict: false, rangeLabel: '8:00 AM', startLabel: '8:00 AM' };
    expect(whenLabel({ ...base, date: '2026-10-18', startIso: '2026-10-18T15:00:00Z', allDay: false }, now).text).toBe('Tomorrow · 8:00 AM');
    expect(whenLabel({ ...base, date: '2026-10-17', startIso: '2026-10-17T07:00:00Z', allDay: true }, now).text).toBe('Today · all day');
  });
});

describe('Home · a page left open past midnight', () => {
  it('reads the page again just after the team’s midnight, once', () => {
    vi.setSystemTime(new Date('2026-10-18T06:59:50Z')); // 23:59:50 on the 17th in Los Angeles
    render(<Probe clock={{ tz: LA, day: '2026-10-17' }} />);
    expect(refreshes()).toBe(0);
    advance(10_000); // midnight, not yet past the check's few seconds of margin
    expect(refreshes()).toBe(0);
    advance(6_000);
    expect(refreshes()).toBe(1);
  });

  it('the device’s date turning is not the team’s: no refresh while the team’s day is the same', () => {
    // 03:00 UTC on the 18th: a device in UTC or further east is on the 18th, the team in Los Angeles still on the 17th.
    vi.setSystemTime(new Date('2026-10-18T03:00:00Z'));
    render(<Probe clock={{ tz: LA, day: '2026-10-17' }} />);
    setVisibility('visible');
    act(() => void window.dispatchEvent(new Event('focus')));
    expect(refreshes()).toBe(0);
  });

  it('a phone that slept through midnight reads the page again when it comes back into view', () => {
    vi.setSystemTime(new Date('2026-10-18T05:00:00Z')); // 22:00 in Los Angeles
    render(<Probe clock={{ tz: LA, day: '2026-10-17' }} />);
    setVisibility('hidden');
    // Background timers are suspended: the clock moves on without them firing.
    vi.setSystemTime(new Date('2026-10-18T15:00:00Z')); // 08:00 on the 18th
    expect(refreshes()).toBe(0);
    setVisibility('visible');
    expect(refreshes()).toBe(1);
  });

  it('a refresh that lands with the new day starts again from it; one that still carries the old day asks again a few times, then stops', () => {
    vi.setSystemTime(new Date('2026-10-18T15:00:00Z')); // the 18th in Los Angeles
    const view = render(<Probe clock={{ tz: LA, day: '2026-10-17' }} />);
    // Already a day behind on arrival (a page restored from the back-forward cache).
    expect(refreshes()).toBe(1);
    // A second look while that read is out does not ask twice.
    act(() => void window.dispatchEvent(new Event('focus')));
    expect(refreshes()).toBe(1);
    // The server's clock was a little behind: the same day came back. It asks again, at most three times in all.
    advance(60_000);
    expect(refreshes()).toBe(2);
    advance(60_000 * 5);
    expect(refreshes()).toBe(3);
    // The new day arrives: nothing more until the next midnight.
    view.rerender(<Probe clock={{ tz: LA, day: '2026-10-18' }} />);
    advance(60_000 * 5);
    expect(refreshes()).toBe(3);
  });

  it('without a team clock it follows the device’s zone, and trusts the refresh', () => {
    const zone = deviceZone();
    const start = new Date('2026-10-17T12:00:00Z');
    vi.setSystemTime(start);
    render(<Probe />);
    advance(msToNextMidnight(start, zone) + 6_000);
    expect(refreshes()).toBe(1);
    advance(60_000 * 5);
    expect(refreshes()).toBe(1);
  });

  it('a frozen clock (preview, tests) never rolls', () => {
    vi.setSystemTime(new Date('2026-10-18T15:00:00Z'));
    render(<Probe clock={{ tz: LA, day: '2026-10-17' }} frozen />);
    setVisibility('visible');
    advance(86_400_000);
    expect(refreshes()).toBe(0);
  });

  it('Coach Home and Player Home both carry it', () => {
    vi.setSystemTime(new Date('2026-10-18T15:00:00Z'));
    const shell = (node: React.ReactNode) => (
      <LazyMotion features={domAnimation}>
        <ToastProvider>
          <div className="ch-root" data-ui="clubhouse">
            {node}
          </div>
        </ToastProvider>
      </LazyMotion>
    );
    render(shell(<CoachHome data={{ ...PREVIEW_HOME, clock: { tz: LA, day: '2026-10-17' } }} />));
    expect(refreshes()).toBe(1);
    cleanup();
    render(shell(<PlayerHome data={{ ...PREVIEW_PLAYER_HOME, clock: { tz: LA, day: '2026-10-17' } }} />));
    expect(refreshes()).toBe(2);
    cleanup();
    // The preview's frozen clock: no refresh.
    render(shell(<CoachHome data={{ ...PREVIEW_HOME, clock: { tz: LA, day: '2026-10-17' } }} now="2026-10-17T20:00:00Z" />));
    expect(refreshes()).toBe(2);
  });
});

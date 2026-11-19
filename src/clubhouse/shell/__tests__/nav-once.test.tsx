import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chNavOnceReset, useNavOnce } from '../../lib/nav-once';

/**
 * F-0026 (audit 2026-10-29): a quick double tap pushed the same page twice. Audit 2026-11-18 (P1) found the second tap
 * still got through: on a prefetched page the address changed about 80 ms after the first tap, the guard let go, and the
 * second tap landed on the page the first had opened (a rounds row's second tap opened the course page; Home's Message
 * team pushed two entries). Now, while a navigation is on its way, every other link and button is held, until the page
 * has changed and the double-tap window from the first tap has passed; a navigation that never lands lets go after a second.
 *
 * The earlier case "another link is not held back" encoded the old per-address guard and is replaced on purpose by
 * "another link or a button is held back while the first is on its way".
 */
let clock = 0;
beforeEach(() => {
  clock = 10_000;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  chNavOnceReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Host({ path, onButton = () => {} }: { path: string; onButton?: () => void }) {
  useNavOnce(path, '');
  return (
    <div data-ui="clubhouse">
      <a href="/golf/dashboard/stats">Stats</a>
      <a href="/golf/dashboard/roster">Roster</a>
      <a href="#ch-content">Skip</a>
      <button type="button" onClick={onButton}>
        Save
      </button>
      <div className="ch-pbar__back">
        <button type="button" onClick={onButton}>
          Back
        </button>
      </div>
    </div>
  );
}

/** Clicks `el` `n` times and counts the clicks that reached it un-prevented (a link's stand-in for Next's Link). */
function clicks(el: HTMLElement, n: number): number {
  let through = 0;
  const count = (e: Event) => {
    if (!e.defaultPrevented) through++;
    e.preventDefault();
  };
  el.addEventListener('click', count);
  for (let i = 0; i < n; i++) el.click();
  el.removeEventListener('click', count);
  return through;
}

describe('nav-once (F-0026; audit 2026-11-18)', () => {
  it('two taps on the same link navigate once', () => {
    const { getByText } = render(<Host path="/golf/dashboard" />);
    expect(clicks(getByText('Stats'), 2)).toBe(1);
  });

  it('another link or a button is held back while the first is on its way', () => {
    const onButton = vi.fn();
    const { getByText } = render(<Host path="/golf/dashboard" onButton={onButton} />);
    expect(clicks(getByText('Stats'), 1)).toBe(1);
    clock += 120;
    expect(clicks(getByText('Roster'), 1)).toBe(0);
    getByText('Save').click();
    expect(onButton).not.toHaveBeenCalled();
  });

  it('a second tap just after a fast commit, inside the double-tap window, is still dropped', () => {
    const { getByText, rerender } = render(<Host path="/golf/dashboard" />);
    expect(clicks(getByText('Stats'), 1)).toBe(1);
    clock += 80;
    act(() => rerender(<Host path="/golf/dashboard/stats" />));
    clock += 120;
    expect(clicks(getByText('Roster'), 1)).toBe(0);
    clock += 200;
    expect(clicks(getByText('Roster'), 1)).toBe(1);
  });

  it('once the page has changed and the window passed, taps go again', () => {
    const { getByText, rerender } = render(<Host path="/golf/dashboard" />);
    expect(clicks(getByText('Stats'), 1)).toBe(1);
    clock += 400;
    act(() => rerender(<Host path="/golf/dashboard/stats" />));
    clock += 16;
    expect(clicks(getByText('Roster'), 1)).toBe(1);
  });

  it('a navigation that never lands lets go after a second', () => {
    const { getByText } = render(<Host path="/golf/dashboard" />);
    expect(clicks(getByText('Stats'), 1)).toBe(1);
    clock += 1000;
    expect(clicks(getByText('Roster'), 1)).toBe(1);
  });

  it('a hash on this page holds nothing', () => {
    const { getByText } = render(<Host path="/golf/dashboard" />);
    expect(clicks(getByText('Skip'), 1)).toBe(1);
    expect(clicks(getByText('Roster'), 1)).toBe(1);
  });

  it('a link click something below swallowed (a peek hold, a swipe) holds nothing', () => {
    const { getByText } = render(<Host path="/golf/dashboard" />);
    const stats = getByText('Stats');
    const swallow = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    stats.addEventListener('click', swallow);
    stats.click();
    stats.removeEventListener('click', swallow);
    expect(clicks(getByText('Roster'), 1)).toBe(1);
  });

  it('a pushed page’s Back still answers during the hold (a Back reverses a push in flight)', () => {
    const onButton = vi.fn();
    const { getByText } = render(<Host path="/golf/dashboard" onButton={onButton} />);
    clicks(getByText('Stats'), 1);
    clock += 100;
    getByText('Back').click();
    expect(onButton).toHaveBeenCalledTimes(1);
  });

  it('a button tap with no navigation under way is never held', () => {
    const onButton = vi.fn();
    const { getByText } = render(<Host path="/golf/dashboard" onButton={onButton} />);
    getByText('Save').click();
    getByText('Save').click();
    expect(onButton).toHaveBeenCalledTimes(2);
  });
});

/** One tap on `el` at a point on screen; whether it reached the link un-prevented. */
function tapAt(el: HTMLElement, x: number, y: number): boolean {
  let through = false;
  const count = (e: Event) => {
    through = !e.defaultPrevented;
    e.preventDefault();
  };
  el.addEventListener('click', count);
  fireEvent.click(el, { clientX: x, clientY: y });
  el.removeEventListener('click', count);
  return through;
}

// Audit 2026-11-19 re-check: holding every tap also dropped a person changing their mind (Stats, then Calendar 200 ms later,
// measured in WebKit on the desk: it stayed on Stats). A double tap's twin lands where the first tap did; a tap well away
// from it is a new choice and goes through, as a tab bar's does on iOS.
describe('nav-once: a twin, or a new choice', () => {
  it('a second tap where the first landed is held; one well away from it goes', () => {
    const { getByText } = render(<Host path="/golf/dashboard" />);
    expect(tapAt(getByText('Stats'), 100, 40)).toBe(true);
    clock += 120;
    expect(tapAt(getByText('Roster'), 110, 50)).toBe(false);
    clock += 80;
    expect(tapAt(getByText('Roster'), 100, 300)).toBe(true);
  });
});

describe('usePushOnce (F-0026, a segment’s router.push)', () => {
  it('a second identical push in the same moment is dropped; a different one goes', async () => {
    const { renderHook } = await import('@testing-library/react');
    const { usePushOnce } = await import('../../lib/nav-once');
    const router = { push: vi.fn() };
    const { result } = renderHook(() => usePushOnce(router));
    result.current('/golf/dashboard/stats?window=season');
    result.current('/golf/dashboard/stats?window=season');
    result.current('/golf/dashboard/stats?window=qualifiers');
    expect(router.push.mock.calls.map((c) => c[0])).toEqual(['/golf/dashboard/stats?window=season', '/golf/dashboard/stats?window=qualifiers']);
  });

  it('a push in code holds the taps that follow it, as a link does', async () => {
    const { renderHook } = await import('@testing-library/react');
    const { usePushOnce } = await import('../../lib/nav-once');
    const onButton = vi.fn();
    const { getByText } = render(<Host path="/golf/dashboard" onButton={onButton} />);
    const { result } = renderHook(() => usePushOnce({ push: vi.fn() }));
    result.current('/golf/dashboard/stats?window=season');
    clock += 50;
    getByText('Save').click();
    expect(onButton).not.toHaveBeenCalled();
  });
});

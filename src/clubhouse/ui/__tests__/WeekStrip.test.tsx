import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WeekStrip, type WeekStripDay } from '../WeekStrip';

const hapticSpy = vi.fn();
vi.mock('../../lib/haptics', () => ({ haptic: (k: string) => hapticSpy(k) }));
afterEach(() => {
  cleanup();
  hapticSpy.mockClear();
});

const week = (from: number): WeekStripDay[] =>
  Array.from({ length: 7 }, (_, i) => {
    const n = from + i;
    return { date: `2026-10-${String(n).padStart(2, '0')}`, top: 'SMTWTFS'[i]!, num: n, isToday: n === 14, dots: i % 3, label: `Day ${n}` };
  });

describe('WeekStrip (B18)', () => {
  it('marks the chosen day and today, and puts the plate under the chosen day', () => {
    render(<WeekStrip label="This week" days={week(11)} selected="2026-10-15" onSelect={() => {}} />);
    const strip = screen.getByRole('list', { name: 'This week' });
    const on = within(strip).getByRole('button', { name: 'Day 15' });
    expect(on.className).toMatch(/\bis-on\b/);
    expect(on.getAttribute('aria-pressed')).toBe('true');
    const today = within(strip).getByRole('button', { name: 'Day 14' });
    expect(today.className).toMatch(/\bis-today\b/);
    expect(today.closest('li')!.getAttribute('aria-current')).toBe('date');
    expect(strip.style.getPropertyValue('--ch-wks-at')).toBe('4');
    // One Tab stop: the chosen day.
    expect(within(strip).getAllByRole('button').filter((b) => b.tabIndex === 0)).toEqual([on]);
  });

  it('steps a day with the arrow keys and turns the page past either end when it pages', () => {
    const onSelect = vi.fn();
    const onPage = vi.fn();
    const { rerender } = render(<WeekStrip label="This week" days={week(11)} selected="2026-10-15" onSelect={onSelect} onPage={onPage} around={{ prev: week(4), next: week(18) }} />);
    const strip = screen.getByRole('list', { name: 'This week' });
    fireEvent.keyDown(within(strip).getByRole('button', { name: 'Day 15' }), { key: 'ArrowRight' });
    expect(onSelect).toHaveBeenLastCalledWith('2026-10-16');
    expect(document.activeElement).toBe(within(strip).getByRole('button', { name: 'Day 16' }));
    fireEvent.keyDown(within(strip).getByRole('button', { name: 'Day 15' }), { key: 'Home' });
    expect(onSelect).toHaveBeenLastCalledWith('2026-10-11');
    rerender(<WeekStrip label="This week" days={week(11)} selected="2026-10-17" onSelect={onSelect} onPage={onPage} around={{ prev: week(4), next: week(18) }} />);
    fireEvent.keyDown(within(strip).getByRole('button', { name: 'Day 17' }), { key: 'ArrowRight' });
    expect(onPage).toHaveBeenCalledWith(1);
  });

  it('calls onPage once a swipe settles on the next week, with one tick, and the weeks around are hidden', () => {
    const onPage = vi.fn();
    render(<WeekStrip label="This week" days={week(11)} selected="2026-10-14" onSelect={() => {}} onPage={onPage} around={{ prev: week(4), next: week(18) }} />);
    expect(screen.getAllByRole('list')).toHaveLength(1);
    const pager = document.querySelector('.ch-wks-pager') as HTMLElement;
    Object.defineProperty(pager, 'clientWidth', { configurable: true, value: 350 });
    act(() => {
      pager.scrollLeft = 520; // short of the threshold: still between pages, nothing turns
      pager.dispatchEvent(new Event('scrollend'));
    });
    expect(onPage).not.toHaveBeenCalled();
    act(() => {
      pager.scrollLeft = 700;
      pager.dispatchEvent(new Event('scroll'));
      pager.dispatchEvent(new Event('scrollend'));
    });
    expect(onPage).toHaveBeenCalledWith(1);
    expect(hapticSpy.mock.calls).toEqual([['select']]);
  });

  it('as links, each day goes to its day and reads as words; with neither, it is read only', () => {
    const days = week(11).map((d) => ({ ...d, href: `/cal?date=${d.date}` }));
    const { unmount } = render(<WeekStrip label="Days this week" days={days} />);
    const link = screen.getByRole('link', { name: /Day 14/ });
    expect(link.getAttribute('href')).toBe('/cal?date=2026-10-14');
    expect(screen.queryByRole('button')).toBeNull();
    unmount();
    render(<WeekStrip label="Days this week" days={week(11)} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByRole('list', { name: 'Days this week' }).querySelector('[aria-current="date"]')!.textContent).toMatch(/Day 14/);
  });
});

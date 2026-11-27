import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { placeOverlay, watchOverlayView } from '../overlay-place';
import { Menu } from '../../ui/Menu';

/**
 * The one overlay placement (lib/overlay-place.ts) and the blind spots the research report added (BS-21: open, then rotate or
 * resize to 320 while open; a menu by the bottom edge; the keyboard coming up under a menu).
 */
const phone = { width: 390, bottom: 844 };
const rect = (top: number, left: number, w = 44, h = 44) => ({ top, bottom: top + h, left, right: left + w });

describe('placeOverlay', () => {
  it('opens below its anchor, aligned to its start', () => {
    const p = placeOverlay(rect(100, 20), { width: 232, height: 200 }, phone);
    expect(p).toMatchObject({ left: 20, top: 150, up: false, origin: 'top left' });
  });

  it('flips above only when it does not fit below and there is more room above', () => {
    const p = placeOverlay(rect(700, 20), { width: 232, height: 300 }, phone);
    expect(p.up).toBe(true);
    expect(p.top + Math.min(300, p.maxHeight)).toBe(694);
    expect(p.origin).toBe('bottom left');
  });

  it('shifts along the edge to stay 8 px inside the window', () => {
    const p = placeOverlay(rect(100, 360), { width: 232, height: 200 }, phone, { align: 'start' });
    expect(p.left).toBe(390 - 232 - 8);
    expect(placeOverlay(rect(100, 0, 20), { width: 232, height: 200 }, phone, { align: 'end' }).left).toBe(8);
  });

  it('caps its height at the room on its side, so a long list scrolls inside the panel', () => {
    const p = placeOverlay(rect(380, 20), { width: 232, height: 2000 }, phone);
    expect(p.maxHeight).toBe(Math.max(380 - 14, 844 - 424 - 14));
    expect(p.top).toBeGreaterThanOrEqual(8);
    expect(p.top + Math.min(2000, p.maxHeight)).toBeLessThanOrEqual(844 - 8);
  });

  it('never runs under the keyboard: a raised keyboard is the window’s bottom', () => {
    const p = placeOverlay(rect(400, 20), { width: 232, height: 200 }, { width: 390, bottom: 844 - 336 });
    expect(p.top + Math.min(200, p.maxHeight)).toBeLessThanOrEqual(508 - 8);
  });

  it('fits a 320 px window (BS-21, BS-26 zoom) without passing either edge', () => {
    const p = placeOverlay(rect(200, 290, 24), { width: 232, height: 200 }, { width: 320, bottom: 568 }, { align: 'end' });
    expect(p.left).toBeGreaterThanOrEqual(8);
    expect(p.left + 232).toBeLessThanOrEqual(320 - 8);
  });
});

describe('watchOverlayView (BS-21)', () => {
  it('places again on a resize, a rotation and the keyboard', async () => {
    let n = 0;
    const stop = watchOverlayView(() => n++);
    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('orientationchange'));
    document.body.classList.add('keyboard-open');
    await new Promise((r) => setTimeout(r, 0));
    expect(n).toBe(3);
    stop();
    document.body.classList.remove('keyboard-open');
    window.dispatchEvent(new Event('resize'));
    expect(n).toBe(3);
  });
});

describe('Menu while open (BS-21)', () => {
  it('moves with the window when it is resized to 320 px while open, and stays inside it', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    render(
      <Menu
        label="Round actions"
        items={[{ label: 'Edit', onSelect: () => {} }]}
        trigger={(p) => (
          <button type="button" {...p}>
            More
          </button>
        )}
      />,
    );
    const btn = screen.getByRole('button', { name: 'More' });
    btn.getBoundingClientRect = () => ({ top: 100, bottom: 140, left: 900, right: 940, width: 40, height: 40, x: 900, y: 100, toJSON() {} }) as DOMRect;
    act(() => btn.click());
    const menu = screen.getByRole('menu');
    expect(parseFloat(menu.style.left)).toBe(940 - 232);
    act(() => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 });
      window.dispatchEvent(new Event('resize'));
    });
    expect(parseFloat(menu.style.left)).toBe(320 - 232 - 8);
  });
});

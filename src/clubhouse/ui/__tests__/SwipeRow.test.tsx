import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { Mail, Trash2 } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const haptic = vi.fn();
vi.mock('../../lib/haptics', () => ({ haptic: (...a: unknown[]) => haptic(...a) }));

import { SwipeRow } from '../SwipeRow';

/**
 * The swipe row component (C8, owner decision 14), against what its doc promises: the revealed buttons are inert while
 * the row is shut; a sideways drag claims the row (onClaim, and the tap it ends in never lands); a vertical drag is the
 * list's; letting go past the full mark runs the side's action (a danger one warns); a half-action throw rests open on
 * its button; iOS taking the pan springs it shut; and a tap on an open row shuts it instead of opening the row. The
 * rules themselves are lib/__tests__/swipe-row.test.ts. jsdom has no layout, so the row is the 390px fallback wide
 * (full mark 234px).
 */
const touch = { pointerId: 1, pointerType: 'touch', isPrimary: true };

function mount(overrides: { leading?: () => void; trailing?: () => void } = {}) {
  const read = vi.fn(overrides.leading);
  const del = vi.fn(overrides.trailing);
  const claim = vi.fn();
  const open = vi.fn();
  render(
    <SwipeRow
      onClaim={claim}
      leading={{ label: 'Unread', icon: Mail, tone: 'accent', run: read }}
      trailing={{ label: 'Delete', icon: Trash2, tone: 'danger', run: del }}
    >
      <button type="button" onClick={open}>
        Ava Thompson
      </button>
    </SwipeRow>,
  );
  const row = screen.getByText('Ava Thompson');
  const root = row.closest('.ch-swipe') as HTMLElement;
  // A slow drag, 200ms a step, held before letting go: no throw, so the row lands where the finger left it.
  const at = (el: Element, kind: 'pointerDown' | 'pointerMove' | 'pointerUp', t: number, x: number, y: number) => {
    const ev = createEvent[kind](el, { ...touch, clientX: x, clientY: y });
    Object.defineProperty(ev, 'timeStamp', { value: t });
    fireEvent(el, ev);
  };
  const drag = (dx: number, dy = 0) => {
    at(row, 'pointerDown', 1000, 200, 20);
    at(root, 'pointerMove', 1200, 200 + dx / 2, 20 + dy / 2);
    at(root, 'pointerMove', 1400, 200 + dx, 20 + dy);
    at(root, 'pointerUp', 1600, 200 + dx, 20 + dy);
  };
  const acts = (side: 'leading' | 'trailing') => root.querySelector<HTMLElement>(`.ch-swipe__acts.is-${side}`)!;
  return { read, del, claim, open, row, root, drag, acts };
}

beforeEach(() => haptic.mockClear());
afterEach(cleanup);

describe('SwipeRow (C8, owner decision 14)', () => {
  it('keeps both actions inert and hidden from assistive tech while shut', () => {
    const { acts } = mount();
    for (const side of ['leading', 'trailing'] as const) {
      expect(acts(side).hasAttribute('inert')).toBe(true);
      expect(acts(side).getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('a sideways drag claims the row: onClaim runs and the tap it ends in never reaches the row', () => {
    const { claim, open, row, drag } = mount();
    drag(-20);
    expect(claim).toHaveBeenCalledTimes(1);
    fireEvent.click(row);
    expect(open).not.toHaveBeenCalled();
  });

  it('a vertical drag stays the list scroll: no claim, and the row still opens on a tap', () => {
    const { claim, open, row, drag } = mount();
    drag(4, 40);
    expect(claim).not.toHaveBeenCalled();
    fireEvent.click(row);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('past the full mark, letting go runs the side: Delete warns first, Unread does not', () => {
    const a = mount();
    a.drag(-300);
    expect(a.del).toHaveBeenCalledTimes(1);
    expect(haptic).toHaveBeenCalledWith('warning');
    cleanup();
    haptic.mockClear();
    const b = mount();
    b.drag(300);
    expect(b.read).toHaveBeenCalledTimes(1);
    expect(haptic).not.toHaveBeenCalledWith('warning');
  });

  it('crossing the full mark ticks once on the way out', () => {
    const { drag } = mount();
    drag(-300);
    expect(haptic.mock.calls.filter((c) => c[0] === 'select')).toHaveLength(1);
  });

  // A touch that moved fires no click, so nothing consumes the drag's swallow: the first tap on the revealed button
  // must still run it (it was eaten until the second tap).
  it('a half-action drag rests open on its button, and the first tap on it runs the action', () => {
    const { del, drag, acts } = mount();
    drag(-60);
    expect(del).not.toHaveBeenCalled();
    expect(acts('trailing').hasAttribute('inert')).toBe(false);
    expect(acts('leading').hasAttribute('inert')).toBe(true);
    const button = screen.getByRole('button', { name: 'Delete' });
    fireEvent.pointerDown(button, { ...touch, clientX: 360, clientY: 20 });
    fireEvent.pointerUp(button, { ...touch, clientX: 360, clientY: 20 });
    fireEvent.click(button);
    expect(del).toHaveBeenCalledTimes(1);
  });

  it('a tap on an open row shuts it rather than opening the row', () => {
    const { open, row, root, drag, acts } = mount();
    drag(-60);
    fireEvent.pointerDown(row, { ...touch, clientX: 120, clientY: 20 });
    fireEvent.pointerUp(root, { ...touch, clientX: 120, clientY: 20 });
    fireEvent.click(row);
    expect(open).not.toHaveBeenCalled();
    expect(acts('trailing').hasAttribute('inert')).toBe(true);
  });

  it('iOS taking the pan (pointercancel) springs the row shut and runs nothing', () => {
    const { del, row, root, acts } = mount();
    fireEvent.pointerDown(row, { ...touch, clientX: 200, clientY: 20 });
    fireEvent.pointerMove(root, { ...touch, clientX: 100, clientY: 20 });
    fireEvent.pointerCancel(root, { ...touch });
    expect(del).not.toHaveBeenCalled();
    expect(acts('trailing').hasAttribute('inert')).toBe(true);
    expect((root.querySelector('.ch-swipe__c') as HTMLElement).style.translate).toBe('');
  });
});

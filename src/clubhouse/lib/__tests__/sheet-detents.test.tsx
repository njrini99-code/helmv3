import { act, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

/**
 * Design lab pilot P4 (dsx-05): a sheet with a medium and a large stop. It opens on medium, a drag or a flick settles it on the
 * nearest stop its throw carries to, a drag below medium closes it, its actions stay on screen, and a field taking focus grows it.
 */
vi.mock('../haptics', () => ({ haptic: vi.fn(), hapticScrub: vi.fn() }));
import { haptic } from '../haptics';
import { detentRests, detentTarget, useSheetDrag } from '../sheet-drag';

describe('detentRests and detentTarget', () => {
  // A 920 px sheet (92% of a 1000 px window) with stops at 55% and 92%: medium rests 370 px down, large at 0.
  const rests = detentRests([0.55, 0.92], 920, 1000);
  it('places each stop as an offset from fully open', () => {
    expect(rests).toEqual([370, 0]);
  });
  it('a slow let-go settles on the nearest stop', () => {
    expect(detentTarget(300, 0, rests, 920)).toBe(0);
    expect(detentTarget(120, 0, rests, 920)).toBe(1);
  });
  it('a flick carries to the next stop: up from medium goes large, down from large goes medium', () => {
    expect(detentTarget(330, -1.2, rests, 920)).toBe(1);
    expect(detentTarget(40, 1.2, rests, 920)).toBe(0);
  });
  it('below medium it closes past a quarter of what medium shows, or on a flick past it', () => {
    // Medium shows 550 px: a quarter is 137.5, so past 507.5 closes.
    expect(detentTarget(520, 0, rests, 920)).toBe('close');
    expect(detentTarget(450, 0, rests, 920)).toBe(0);
    expect(detentTarget(400, 0.8, rests, 920)).toBe('close');
  });
});

function pointer(type: string, y: number, time: number) {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 0, clientY: y, button: 0 });
  Object.defineProperties(e, { pointerId: { value: 1 }, timeStamp: { value: time }, isPrimary: { value: true } });
  return e;
}

function Sheet({ onClose = () => {} }: { onClose?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useSheetDrag(ref, onClose, { reduced: true, detents: [0.55, 0.92], pin: 'footer' });
  return (
    <dialog open>
      <div ref={ref} data-testid="sheet">
        <header data-testid="head" onPointerDown={drag.onPointerDown} />
        <input data-testid="field" />
        <footer data-testid="foot" />
      </div>
    </dialog>
  );
}

function sized() {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 920 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });
}

describe('a sheet with stops (P4)', () => {
  it('opens on medium, with its actions lifted to the foot of the screen', () => {
    sized();
    render(<Sheet />);
    expect(screen.getByTestId('sheet').style.translate).toBe('0 370px');
    expect(screen.getByTestId('foot').style.translate).toBe('0 -370px');
  });

  it('dragged up past half way it settles large, with one selection tick', () => {
    sized();
    vi.mocked(haptic).mockClear();
    render(<Sheet />);
    act(() => {
      screen.getByTestId('head').dispatchEvent(pointer('pointerdown', 500, 1000));
      window.dispatchEvent(pointer('pointermove', 250, 1400));
      window.dispatchEvent(pointer('pointerup', 250, 1600));
    });
    expect(screen.getByTestId('sheet').style.translate).toBe('');
    expect(screen.getByTestId('foot').style.translate).toBe('');
    expect(haptic).toHaveBeenCalledWith('select');
  });

  it('dragged well below medium it closes with the settle haptic', () => {
    sized();
    vi.mocked(haptic).mockClear();
    const onClose = vi.fn();
    render(<Sheet onClose={onClose} />);
    act(() => {
      screen.getByTestId('head').dispatchEvent(pointer('pointerdown', 500, 1000));
      window.dispatchEvent(pointer('pointermove', 700, 1400));
      window.dispatchEvent(pointer('pointerup', 700, 1600));
    });
    expect(onClose).toHaveBeenCalled();
    expect(haptic).toHaveBeenCalledWith('commit');
  });

  it('a field taking focus grows the sheet to large, so the keyboard covers nothing being typed', () => {
    sized();
    render(<Sheet />);
    act(() => screen.getByTestId('field').focus());
    expect(screen.getByTestId('sheet').style.translate).toBe('');
    expect(screen.getByTestId('foot').style.translate).toBe('');
  });
});

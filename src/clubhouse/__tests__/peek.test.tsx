import { act, fireEvent, render, screen } from '@testing-library/react';
import { LazyMotion, domAnimation } from 'motion/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import './dialog-polyfill';

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));

import { PEEK_HOLD_MS, PEEK_HOVER_MS, PeekTarget } from '../ui/Peek';
import { PlayerPeek, PlayerPeekCard, playerPeekActions } from '../ui/PlayerPeek';

// jsdom has no PointerEvent: a MouseEvent carrying pointerType stands in, so the handlers can tell touch from mouse.
beforeAll(() => {
  if (typeof window.PointerEvent === 'undefined') {
    class FakePointer extends MouseEvent {
      pointerType: string;
      isPrimary: boolean;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerType = init.pointerType ?? 'mouse';
        this.isPrimary = init.isPrimary ?? true;
      }
    }
    (window as unknown as { PointerEvent: typeof FakePointer }).PointerEvent = FakePointer;
  }
});
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  hapticSpy.mockReset();
});

const PLAYER = { id: 'p-theo', name: 'Theo Marchetti', sub: 'Senior', lastRound: { score: 70, toPar: -2, label: 'Oakmont CC · Sun 12 Oct' }, avg: 70.9, trend: [72, 71, 70], reason: 'No round in 9 days' };

function Harness({ onRow = () => {} }: { onRow?: () => void }) {
  return (
    <LazyMotion features={domAnimation}>
      <PlayerPeek player={PLAYER}>
        <button type="button" onClick={onRow}>
          Theo Marchetti
        </button>
      </PlayerPeek>
    </LazyMotion>
  );
}

const row = () => screen.getByRole('button', { name: 'Theo Marchetti' });

describe('press-and-hold peek (P003-C1 primitive)', () => {
  it('CH-1830: a hold opens the card and its actions, ticks once, and swallows the tap it ends with', () => {
    const onRow = vi.fn();
    render(<Harness onRow={onRow} />);
    fireEvent.pointerDown(row(), { pointerType: 'touch', isPrimary: true, clientX: 10, clientY: 10 });
    act(() => vi.advanceTimersByTime(PEEK_HOLD_MS + 10));
    expect(hapticSpy).toHaveBeenCalledWith('select');
    const dialog = document.querySelector('dialog.ch-peek')!;
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(screen.getByRole('menu', { name: 'Theo Marchetti actions' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Message' }).getAttribute('href')).toBe('/golf/dashboard/messages?player=p-theo');
    fireEvent.pointerUp(row(), { pointerType: 'touch' });
    fireEvent.click(row());
    expect(onRow).not.toHaveBeenCalled();
    // The next tap is the row's again.
    fireEvent.click(row());
    expect(onRow).toHaveBeenCalledTimes(1);
  });

  it('CH-1830: the lift that ends the hold neither closes the peek nor fires an action; the next tap is the row’s again', () => {
    const onRow = vi.fn();
    render(<Harness onRow={onRow} />);
    fireEvent.pointerDown(row(), { pointerType: 'touch', isPrimary: true, clientX: 10, clientY: 10 });
    act(() => vi.advanceTimersByTime(PEEK_HOLD_MS + 10));
    const dialog = document.querySelector('dialog.ch-peek')!;
    // The finger comes up over the peek: its click lands on the backdrop, or on an action under it.
    fireEvent.click(dialog);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Message' }));
    expect(dialog.hasAttribute('open')).toBe(true);
    act(() => {
      window.dispatchEvent(new Event('pointerup'));
      vi.advanceTimersByTime(1);
    });
    // Now a tap outside closes it.
    fireEvent.click(dialog);
    act(() => vi.advanceTimersByTime(500));
    expect(dialog.hasAttribute('open')).toBe(false);
    // The hold's swallow was never used (the lift ended on the peek): the next tap on the row is the row's.
    fireEvent.pointerDown(row(), { pointerType: 'touch', isPrimary: true, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(row(), { pointerType: 'touch' });
    fireEvent.click(row());
    expect(onRow).toHaveBeenCalledTimes(1);
  });

  it('CH-1830: a drag past the slop or an early lift is a scroll or a tap, not a hold', () => {
    render(<Harness />);
    fireEvent.pointerDown(row(), { pointerType: 'touch', isPrimary: true, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(row(), { pointerType: 'touch', clientX: 10, clientY: 30 });
    act(() => vi.advanceTimersByTime(PEEK_HOLD_MS + 10));
    expect(document.querySelector('dialog.ch-peek')!.hasAttribute('open')).toBe(false);
    fireEvent.pointerDown(row(), { pointerType: 'touch', isPrimary: true, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(row(), { pointerType: 'touch' });
    act(() => vi.advanceTimersByTime(PEEK_HOLD_MS + 10));
    expect(document.querySelector('dialog.ch-peek')!.hasAttribute('open')).toBe(false);
    expect(hapticSpy).not.toHaveBeenCalled();
  });

  it('CH-1831: resting the mouse opens the hover card after its delay; Esc puts it away', () => {
    render(<Harness />);
    fireEvent.pointerOver(row(), { pointerType: 'mouse' });
    fireEvent.pointerEnter(row(), { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(PEEK_HOVER_MS - 50));
    expect(document.querySelector('.ch-hovercard')).toBeNull();
    act(() => vi.advanceTimersByTime(100));
    expect(screen.getByRole('dialog', { name: 'Theo Marchetti' }).className).toContain('ch-hovercard');
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(document.querySelector('.ch-hovercard')).toBeNull();
  });

  it('a disabled target is only its child', () => {
    render(
      <PeekTarget label="x" card={() => 'card'} disabled>
        <button type="button">Theo Marchetti</button>
      </PeekTarget>,
    );
    fireEvent.pointerDown(row(), { pointerType: 'touch', isPrimary: true });
    act(() => vi.advanceTimersByTime(PEEK_HOLD_MS + 10));
    expect(document.querySelector('dialog.ch-peek')!.hasAttribute('open')).toBe(false);
  });
});

describe('the player peek card (CH-1832)', () => {
  it('shows the reason, the last round and the average, and its actions only prefill or open pages', () => {
    render(<PlayerPeekCard p={PLAYER} />);
    expect(screen.getByText('No round in 9 days')).toBeTruthy();
    expect(screen.getByText('Oakmont CC · Sun 12 Oct')).toBeTruthy();
    expect(screen.getByText('70.9')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Last 3 scores, coming down' })).toBeTruthy();
    expect(playerPeekActions(PLAYER).map((a) => a.href)).toEqual([
      '/golf/dashboard/messages?player=p-theo',
      '/golf/dashboard/stats?player=p-theo',
      '/golf/dashboard/calendar?new=1&with=p-theo',
    ]);
  });
});

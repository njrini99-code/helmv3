import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LazyMotion, domAnimation } from 'motion/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import '../../__tests__/dialog-polyfill';

vi.mock('../../lib/haptics', () => ({ haptic: vi.fn() }));

import { PEEK_HOVER_MS, PeekTarget } from '../Peek';

/**
 * The desktop hover card leaves on a fade (OVL-10; motion spec 15 Nov 3.4: 110ms to .98 and clear), not at once.
 * Real timers throughout: Motion's frames read the real clock, so a fake one would hold the exit still.
 */

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

describe('the hover card (OVL-10)', () => {
  it('fades out after Esc, inert on the way, then is gone', async () => {
    render(
      <LazyMotion features={domAnimation}>
        <PeekTarget label="Theo Marchetti" card={() => 'Senior'}>
          <button type="button">Theo Marchetti</button>
        </PeekTarget>
      </LazyMotion>,
    );
    const row = screen.getByRole('button', { name: 'Theo Marchetti' });
    fireEvent.pointerOver(row, { pointerType: 'mouse' });
    fireEvent.pointerEnter(row, { pointerType: 'mouse' });
    const card = await waitFor(() => screen.getByRole('dialog', { name: 'Theo Marchetti' }), { timeout: PEEK_HOVER_MS + 1000 });
    expect(card.className).toContain('ch-hovercard');
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(document.querySelector('.ch-hovercard')!.hasAttribute('inert')).toBe(true);
    await waitFor(() => expect(document.querySelector('.ch-hovercard')).toBeNull());
  });
});

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const phone = vi.hoisted(() => ({ on: true }));
vi.mock('../../lib/use-phone', () => ({ useChPhone: () => phone.on }));
vi.mock('../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: true, updatePreferences: vi.fn() }) }));

import '../../__tests__/dialog-polyfill';
import { Modal } from '../Modal';

afterEach(() => {
  cleanup();
  phone.on = true;
});

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <div className="ch-root" data-ui="clubhouse">
      <button type="button" onClick={() => setOpen(true)}>
        Set this term’s dates
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Fall 2026 term">
        <p>Dates</p>
      </Modal>
    </div>
  );
}

/** Safari (and the iOS app's WKWebView) focuses no button it clicks: the opener of a tapped sheet never had focus. */
const tap = (el: HTMLElement) =>
  act(() => {
    fireEvent.pointerDown(el);
    fireEvent.pointerUp(el);
    fireEvent.click(el);
  });

/**
 * F-0012 (AX-03): on the phone, closing a sheet left focus on the page instead of the control that opened it (Home's
 * term sheet and player peek, CoachHelm's This week cards, the Stats Filter, Calendar's More, Settings' account sheet).
 * The desktop dialogs returned it only because Chromium focuses a clicked button.
 */
describe('a sheet hands focus back to what opened it, even when the tap never focused it', () => {
  it.each([true, false])('phone %s: focus goes into the sheet as it opens, and back to the opener as it closes', (onPhone) => {
    phone.on = onPhone;
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Set this term’s dates' });
    tap(opener);
    // As in Safari: the tap did not focus the opener.
    const dialog = screen.getByRole('dialog', { name: 'Fall 2026 term' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    act(() => void dialog.dispatchEvent(new Event('cancel', { cancelable: true })));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('a second sheet in a row hands focus back to its own opener, not the first one’s', () => {
    function Two() {
      const [open, setOpen] = useState<'a' | 'b' | null>(null);
      return (
        <div className="ch-root" data-ui="clubhouse">
          <button type="button" onClick={() => setOpen('a')}>
            Term dates
          </button>
          <button type="button" onClick={() => setOpen('b')}>
            Filter
          </button>
          <Modal open={open != null} onClose={() => setOpen(null)} title={open === 'b' ? 'Filter rounds' : 'Fall 2026 term'} />
        </div>
      );
    }
    render(<Two />);
    const a = screen.getByRole('button', { name: 'Term dates' });
    const b = screen.getByRole('button', { name: 'Filter' });
    tap(a);
    act(() => void screen.getByRole('dialog').dispatchEvent(new Event('cancel', { cancelable: true })));
    expect(document.activeElement).toBe(a);
    // A focused A does not lose focus to a tap on B (Safari focuses no button it clicks): B is still what opened the sheet.
    tap(b);
    act(() => void screen.getByRole('dialog', { name: 'Filter rounds' }).dispatchEvent(new Event('cancel', { cancelable: true })));
    expect(document.activeElement).toBe(b);
  });

  it('a press long gone is not taken for the opener of a sheet that opened by itself', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      let openIt = () => {};
      function Remote() {
        const [open, setOpen] = useState(false);
        openIt = () => setOpen(true);
        return (
          <div className="ch-root" data-ui="clubhouse">
            <button type="button">Elsewhere</button>
            <Modal open={open} onClose={() => setOpen(false)} title="Arrived" />
          </div>
        );
      }
      render(<Remote />);
      const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });
      tap(elsewhere);
      vi.setSystemTime(Date.now() + 60_000);
      act(() => openIt());
      const dialog = screen.getByRole('dialog', { name: 'Arrived' });
      act(() => void dialog.dispatchEvent(new Event('cancel', { cancelable: true })));
      expect(document.activeElement).not.toBe(elsewhere);
    } finally {
      vi.useRealTimers();
    }
  });
});

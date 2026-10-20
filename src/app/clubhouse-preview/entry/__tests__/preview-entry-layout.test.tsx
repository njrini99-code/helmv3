import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/clubhouse/ui/Toast';
import '@/clubhouse/__tests__/dialog-polyfill';
import { PreviewEntry } from '../PreviewEntry';

// jsdom has no layout: the state machine scrolls the distance box into view.
Element.prototype.scrollIntoView ??= function () {};

vi.mock('@/app/golf/actions/shot-actions', () => ({ deleteShot: vi.fn(), updateShot: vi.fn() }));

afterEach(() => {
  cleanup();
  localStorage.removeItem('golf_distance_unit_pref');
});

const follows = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

/*
 * The round-entry preview draws its banners where the round screen does (RoundRuntime's statusSlot): inside the shot
 * screen, above the hole strip, with the preview's own switches after the shot screen. Drawn above the shot screen,
 * they pushed its full-height phone layout (min-height 100dvh) past the fold, and the sticky action bar sat over the
 * entry card's first row of choices (axe target-size at 390x844, 2026-10-20). jsdom has no layout, so this pins the
 * order the layout depends on; the overlap itself is measured by `clubhouse:a11y -- rounds`.
 */
describe('round-entry preview: banners sit in the shot screen, as on a real round', () => {
  it.each([
    ['reload', 'CH-11902'],
    ['error', 'CH-11013'],
  ])('?state=%s draws its banner (%s) in the shot screen, above the hole strip and the choices', (state, code) => {
    const { container } = render(
      <ToastProvider>
        <PreviewEntry state={state} />
      </ToastProvider>,
    );
    const banner = container.querySelector(`[data-ch-code="${code}"]`);
    expect(banner).not.toBeNull();
    const shotScreen = banner!.closest('main.ch-rt');
    expect(shotScreen).not.toBeNull();

    const holeStrip = shotScreen!.querySelector('.ch-rt-strip');
    expect(holeStrip).not.toBeNull();
    const choices = screen.getByRole('radiogroup', { name: 'Shot result' });
    expect(shotScreen!.contains(choices)).toBe(true);
    expect(follows(banner!, holeStrip!)).toBe(true);
    expect(follows(banner!, choices)).toBe(true);
  });

  it('puts the shot screen first and the preview switches after it', () => {
    const { container } = render(
      <ToastProvider>
        <PreviewEntry state="reload" />
      </ToastProvider>,
    );
    const shotScreen = container.querySelector('.ch-rt-q');
    expect(shotScreen).not.toBeNull();
    const switches = screen.getByRole('button', { name: 'Reload banner' });
    expect(shotScreen!.contains(switches)).toBe(false);
    expect(follows(shotScreen!, switches)).toBe(true);
    // Nothing of the preview's own is drawn ahead of the shot screen.
    expect(container.firstElementChild).toBe(shotScreen);
  });
});

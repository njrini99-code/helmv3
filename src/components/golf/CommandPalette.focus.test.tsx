/**
 * ⌘K palette on ModalShell (audit W3, SHEET-07): the search field takes
 * focus on open for every pointer type (ModalShell alone parks it on the
 * panel on touch, so a hardware keyboard would type nowhere), Escape closes,
 * and focus returns to whatever opened it.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';
import { CommandPalette } from './CommandPalette';

vi.mock('@/app/golf/actions/command-palette', () => ({
  getCommandPaletteData: vi.fn().mockResolvedValue({ players: [], recentRounds: [], recentInsights: [] }),
}));

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

const realMatchMedia = window.matchMedia;
afterEach(() => {
  Object.defineProperty(window, 'matchMedia', { writable: true, value: realMatchMedia });
});

function mockCoarsePointer() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(pointer: coarse)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('CommandPalette — focus on ModalShell', () => {
  it('on a coarse pointer, the search field has focus when the palette opens', async () => {
    mockCoarsePointer();
    render(<CommandPalette isCoach={false} />);

    act(() => {
      window.dispatchEvent(new Event('helm:open-command-palette'));
    });

    const dialog = await screen.findByRole('dialog', { name: 'Command palette' });
    const input = dialog.querySelector('input') as HTMLInputElement;
    await waitFor(() => expect(input).toHaveFocus());
  });

  it('Escape closes it and focus returns to the opener', async () => {
    render(
      <>
        <Button
          type="button"
          onClick={() => window.dispatchEvent(new Event('helm:open-command-palette'))}
        >
          Search
        </Button>
        <CommandPalette isCoach={false} />
      </>,
    );
    const opener = screen.getByRole('button', { name: 'Search' });
    opener.focus();
    fireEvent.click(opener);
    await screen.findByRole('dialog', { name: 'Command palette' });

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(opener).toHaveFocus());
  });
});

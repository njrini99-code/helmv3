// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommandPalette } from './CommandPalette';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/app/golf/actions/command-palette', () => ({
  getCommandPaletteData: vi.fn().mockResolvedValue({
    players: [],
    recentRounds: [],
    recentInsights: [],
  }),
}));

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

afterEach(() => {
  // Unmount first: the palette's Radix portal is a body child React still
  // owns, and wiping the body under a mounted portal throws on unmount.
  cleanup();
  document.body.innerHTML = '';
});

async function openPalette() {
  window.dispatchEvent(new Event('helm:open-command-palette'));
  return screen.findByRole('dialog', { name: 'Command palette' });
}

describe('CommandPalette', () => {
  it('closes with its visible close control', async () => {
    const user = userEvent.setup();
    render(<CommandPalette isCoach />);

    const dialog = await openPalette();
    await user.click(within(dialog).getByRole('button', { name: 'Close command palette' }));

    // ModalShell (audit W3) plays its exit before unmounting.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('centers within dashboard content using the rail CSS variable', async () => {
    render(<CommandPalette isCoach />);

    // On ModalShell (audit W3) the panel centres with `inset-x-0 m-auto`, so
    // pulling its left edge in by the rail width from md up moves the centre
    // by half the rail — the old `calc(50% + rail/2)` frame.
    const dialog = await openPalette();
    expect(dialog).toHaveClass('md:left-[var(--fw-rail-width,0px)]');
    expect(dialog).toHaveClass('m-auto');
  });

  it('keeps Escape dismissal available', async () => {
    const user = userEvent.setup();
    render(<CommandPalette isCoach />);

    await openPalette();
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

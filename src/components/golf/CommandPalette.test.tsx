// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react';
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

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('centers within dashboard content using the rail CSS variable', async () => {
    render(<CommandPalette isCoach />);

    expect(await openPalette()).toHaveClass('left-[calc(50%+var(--fw-rail-width,0px)/2)]');
  });

  it('keeps Escape dismissal available', async () => {
    const user = userEvent.setup();
    render(<CommandPalette isCoach />);

    await openPalette();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

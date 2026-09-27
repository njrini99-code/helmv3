/**
 * FocusAreaModal presentation (audit W3, SHEET-04): a bottom Sheet with a
 * grabber and the HIG header (Cancel · title · primary), not a floating card
 * with the disabled primary stacked above Cancel. Escape on a dirty form asks
 * before discarding instead of closing.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FocusAreaModal } from './FocusAreaModal';

function renderPlayer(onOpenChange = vi.fn()) {
  render(
    <FocusAreaModal
      open
      onOpenChange={onOpenChange}
      mode="player"
      playerId="p1"
      playerStats={{
        p1: {
          rounds_played: 6, rounds_in_calculation: 6, avg_score: 76, avg_putts: 30, fairway_pct: 60, gir_pct: 55,
          sg_tee_per_round: -0.8, sg_approach_per_round: 0.2, sg_around_green_per_round: 0, sg_putting_per_round: -0.1,
        },
      }}
      onSubmit={vi.fn().mockResolvedValue({ success: true })}
    />,
  );
  return onOpenChange;
}

describe('FocusAreaModal — bottom sheet presentation', () => {
  it('is a bottom sheet with a grabber and the Cancel · title · primary header', async () => {
    renderPlayer();
    const dialog = await screen.findByRole('dialog', { name: 'New focus area' });
    expect(dialog).toHaveAttribute('data-slot', 'sheet');
    expect(dialog.querySelector('[data-slot="sheet-grabber"]')).not.toBeNull();

    const header = dialog.querySelector('[data-slot="sheet-header"]') as HTMLElement;
    const buttons = Array.from(header.querySelectorAll('button'));
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Cancel', 'Add']);
    // Short visible verb, full accessible name.
    expect(screen.getByRole('button', { name: 'Add focus area' })).toBe(buttons[1]);
    // No corner close button: Cancel is the close affordance.
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });

  it('keeps the primary disabled until the form can save', async () => {
    renderPlayer();
    const add = await screen.findByRole('button', { name: 'Add focus area' });
    expect(add).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('e.g. Tighten driving dispersion'), {
      target: { value: 'Find more fairways' },
    });
    expect(add).toBeEnabled();
  });

  it('Escape on a dirty form asks before discarding and keeps the sheet open', async () => {
    const onOpenChange = renderPlayer();
    const user = userEvent.setup();
    await screen.findByRole('dialog', { name: 'New focus area' });
    fireEvent.change(screen.getByPlaceholderText('e.g. Tighten driving dispersion'), {
      target: { value: 'Find more fairways' },
    });

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.getByText('Discard your unsaved changes?')).toBeInTheDocument());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole('dialog', { name: 'New focus area' })).toBeInTheDocument();
  });

  it('Escape on a clean form closes', async () => {
    const onOpenChange = renderPlayer();
    const user = userEvent.setup();
    await screen.findByRole('dialog', { name: 'New focus area' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(screen.queryByText('Discard your unsaved changes?')).not.toBeInTheDocument();
  });
});

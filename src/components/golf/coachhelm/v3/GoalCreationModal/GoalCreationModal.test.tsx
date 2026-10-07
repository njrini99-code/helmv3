/**
 * GoalCreationModal ("Set a target" sheet) — UI audit 2026-09-23.
 *
 * The hand-rolled glass panel it replaced ignored Escape, never moved focus
 * into the dialog, let the page read through the form, and had no grabber.
 * It now rides the Fairway Sheet; these tests pin the user-visible contract.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/golf/actions/v3/goals', () => ({
  createGoal: vi.fn(async () => ({ ok: true })),
  suggestGoalTarget: vi.fn(async () => ({
    hasStanding: false,
    suggested_target: null,
    baseline: null,
    pga_value: null,
    unit: 'strokes',
    no_target_reason: null,
  })),
}));

import { GoalCreationModal } from './index';

function Harness() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Set a goal
      </Button>
      <GoalCreationModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

async function openSheet() {
  const user = userEvent.setup();
  render(<Harness />);
  const opener = screen.getByRole('button', { name: 'Set a goal' });
  await user.click(opener);
  const dialog = await screen.findByRole('dialog', { name: 'Set a target' });
  return { user, opener, dialog };
}

describe('GoalCreationModal — Set a target sheet', () => {
  it('moves focus into the sheet on open', async () => {
    const { dialog } = await openSheet();
    await waitFor(() => {
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    });
  });

  it('closes on Escape and returns focus to "Set a goal"', async () => {
    const { user, opener } = await openSheet();
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Set a target' })).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(opener).toHaveFocus();
    });
  });

  it('Cancel in the header closes it', async () => {
    await openSheet();
    // fireEvent, not user.click: a pointer sequence inside vaul's Content
    // calls setPointerCapture, which jsdom does not implement.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Set a target' })).not.toBeInTheDocument();
    });
  });

  it('is an opaque sheet with a grabber and the HIG header (Cancel · title · Start focus area)', async () => {
    const { dialog } = await openSheet();
    expect(dialog.className).toContain('bg-surface');
    expect(dialog.className).not.toMatch(/surface-lift|glass|backdrop-blur/);
    expect(dialog.querySelector('[data-slot="sheet-grabber"]')).not.toBeNull();

    const header = dialog.querySelector('[data-slot="sheet-header"]') as HTMLElement;
    expect(header).not.toBeNull();
    expect(header).toContainElement(screen.getByRole('button', { name: 'Cancel' }));
    expect(header).toContainElement(screen.getByRole('button', { name: 'Start focus area' }));
  });
});

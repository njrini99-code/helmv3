/**
 * Escape inside the date picker must close the PICKER, not the event editor.
 *
 * The event editor is a ModalShell (Radix Dialog). Its Start/End date fields
 * are `DatePicker`, whose popover portals INTO the dialog. A coach who opens
 * the picker, changes their mind, and presses Escape must get their form back —
 * not lose a half-filled event.
 *
 * ModalShell already guards this, but the guard is written for BASE UI popups:
 * it looks for `[data-popup-open]`, which `@base-ui-components/react` stamps on
 * a Select trigger / Combobox input. `DatePicker` is RADIX, and Radix does not
 * stamp that attribute — it registers in Radix's own DismissableLayer stack
 * instead, which is supposed to make the topmost layer win.
 *
 * So the two libraries reach the same outcome by different means, and nothing
 * in the codebase asserted that the Radix path actually holds. These tests do.
 * If a future change swaps the picker's popover library, or Radix alters its
 * layer stack, this fails here rather than in front of a coach.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ModalShell } from '@/components/fairway/overlays/ModalShell';
import { DatePicker } from '@/components/fairway/calendar/date-picker';

function Harness({ onOpenChange }: { onOpenChange: (o: boolean) => void }) {
  return (
    <ModalShell open title="New event" onOpenChange={onOpenChange}>
      <DatePicker
        mode="single"
        value={new Date(2026, 7, 19)}
        aria-label="Start date"
        placeholder="Pick a date"
      />
    </ModalShell>
  );
}

const trigger = () => screen.getByRole('button', { name: /start date/i });
const grid = () => screen.queryByRole('grid');

describe('DatePicker inside ModalShell — Escape layering', () => {
  it('opens the picker from inside the dialog', async () => {
    render(<Harness onOpenChange={vi.fn()} />);
    expect(grid()).toBeNull();

    fireEvent.click(trigger());

    await waitFor(() => expect(grid()).not.toBeNull());
  });

  it('the FIRST Escape closes the picker and LEAVES THE DIALOG OPEN', async () => {
    // This is the one that protects the coach's half-filled form.
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);

    fireEvent.click(trigger());
    await waitFor(() => expect(grid()).not.toBeNull());

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(grid()).toBeNull());
    // The dialog must NOT have been asked to close on this same keystroke.
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('the SECOND Escape then closes the dialog', async () => {
    // The guard must not permanently swallow Escape — once no popup is open,
    // the next press has to reach the dialog normally.
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);

    fireEvent.click(trigger());
    await waitFor(() => expect(grid()).not.toBeNull());

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(grid()).toBeNull());

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('Escape closes the dialog directly when no picker is open', async () => {
    // Baseline: the guard must not change behaviour for the ordinary case.
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});

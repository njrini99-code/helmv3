/**
 * ConfirmAlert (audit W3, MOT-06 / DS-03): the golf confirm on ModalShell /
 * Sheet. Pins the contract the hand-rolled ui/confirm-dialog lacked or
 * half-had: an alertdialog role, focus in on open and back on close, Escape
 * cancels, dismissal blocked while loading, one Escape level per press when
 * the alert sits over an open Sheet, and the native danger action sheet.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { afterEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ value: false }));
vi.mock('@/lib/utils/capacitor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/utils/capacitor')>()),
  isNativeApp: () => native.value,
  triggerHaptic: vi.fn(async () => {}),
}));

import { ConfirmAlert } from './ConfirmAlert';
import { Sheet } from './Sheet';

afterEach(() => {
  native.value = false;
});

function Harness(props: { variant?: 'danger' | 'warning' | 'default'; isLoading?: boolean; onConfirm?: () => void }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Delete class
      </Button>
      <ConfirmAlert
        open={open}
        title="Delete this class?"
        message="It will be removed from your schedule."
        confirmLabel="Delete"
        variant={props.variant ?? 'danger'}
        isLoading={props.isLoading}
        onConfirm={props.onConfirm ?? (() => setOpen(false))}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}

function Stacked() {
  const [sheetOpen, setSheetOpen] = React.useState(true);
  const [alertOpen, setAlertOpen] = React.useState(false);
  return (
    <>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen} title="Course">
        <Sheet.Body>
          <Button type="button" onClick={() => setAlertOpen(true)}>
            Remove course
          </Button>
        </Sheet.Body>
      </Sheet>
      <ConfirmAlert
        open={alertOpen}
        title="Remove course?"
        message="This cannot be undone."
        variant="danger"
        onConfirm={() => setAlertOpen(false)}
        onCancel={() => setAlertOpen(false)}
      />
    </>
  );
}

describe('ConfirmAlert — centred alert (web)', () => {
  it('opens as a labelled alertdialog with its message and moves focus to Cancel', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Delete class' }));

    const alert = await screen.findByRole('alertdialog', { name: 'Delete this class?' });
    expect(alert).toHaveAccessibleDescription('It will be removed from your schedule.');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus());
    // No corner close: Cancel is the way out.
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });

  it('Escape cancels and returns focus to the opener', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Delete class' });
    await user.click(opener);
    await screen.findByRole('alertdialog');

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('confirm calls onConfirm', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<Harness onConfirm={onConfirm} />);
    await user.click(screen.getByRole('button', { name: 'Delete class' }));
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('ignores Escape while an action is in flight', async () => {
    const user = userEvent.setup();
    render(<Harness isLoading />);
    await user.click(screen.getByRole('button', { name: 'Delete class' }));
    await screen.findByRole('alertdialog');

    await user.keyboard('{Escape}');

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('over an open Sheet, the first Escape closes only the alert', async () => {
    const user = userEvent.setup();
    render(<Stacked />);
    // fireEvent: vaul's pointer-drag handlers need setPointerCapture, which
    // jsdom lacks; the click itself is what opens the alert.
    fireEvent.click(await screen.findByRole('button', { name: 'Remove course' }));
    await screen.findByRole('alertdialog', { name: 'Remove course?' });

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: 'Course' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Course' })).not.toBeInTheDocument());
  });
});

describe('ConfirmAlert — native danger action sheet', () => {
  it('over an open Sheet, the first Escape closes only the action sheet', async () => {
    native.value = true;
    const user = userEvent.setup();
    render(<Stacked />);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove course' }));
    await screen.findByRole('dialog', { name: 'Remove course?' });

    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Remove course?' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('dialog', { name: 'Course' })).toBeInTheDocument();
  });

  it('renders on the Sheet with Cancel first in the DOM and the destructive action labelled', async () => {
    native.value = true;
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Delete class' }));

    const sheet = await screen.findByRole('dialog', { name: 'Delete this class?' });
    expect(sheet).toHaveAttribute('data-slot', 'confirm-alert-sheet');
    const buttons = Array.from(sheet.querySelectorAll('button'));
    expect(buttons[0]).toHaveTextContent('Cancel');
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(sheet.querySelectorAll('[data-slot="sheet-title"]')).toHaveLength(1);
  });
});

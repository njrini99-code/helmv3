import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '@/components/fairway/controls/button';
import { SettingSheet } from './setting-sheet';

/**
 * A stand-in for an explicit-save panel with SaveRow's exact Button contract:
 * primary + enabled only while dirty (and valid), busy while saving. The
 * `invalid` predicate reproduces EventRemindersPanel, which disables Save for
 * an edit that breaks the early/late ordering.
 */
function FakeSavePanel({ invalid }: { invalid?: (value: string) => boolean }) {
  const [saved, setSaved] = useState('24');
  const [value, setValue] = useState('24');
  const [busy, setBusy] = useState(false);
  const disabled = value === saved || Boolean(invalid?.(value));
  return (
    <section>
      <input aria-label="First reminder" value={value} onChange={(e) => setValue(e.target.value)} />
      <Button
        variant={disabled ? 'secondary' : 'primary'}
        size="sm"
        busy={busy}
        disabled={disabled}
        onClick={async () => {
          setBusy(true);
          await Promise.resolve();
          setSaved(value);
          setBusy(false);
        }}
      >
        Save changes
      </Button>
    </section>
  );
}

function Harness({
  guarded = true,
  invalid,
  onClose,
}: {
  guarded?: boolean;
  invalid?: (value: string) => boolean;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <SettingSheet
      open={open}
      title="Event reminders"
      guarded={guarded}
      onRequestClose={() => {
        onClose();
        setOpen(false);
      }}
    >
      <FakeSavePanel invalid={invalid} />
    </SettingSheet>
  );
}

/*
 * Clicks go through fireEvent and typing through the keyboard only: vaul's
 * drag handler runs on pointerdown inside the drawer and needs
 * setPointerCapture and a computed transform, which jsdom doesn't implement.
 */
const discardPrompt = () => screen.queryByRole('alertdialog', { name: 'Discard unsaved changes?' });

describe('SettingSheet closing', () => {
  it('closes a clean sheet on Done', async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(discardPrompt()).toBeNull();
  });

  it('asks before discarding an unsaved edit, and Keep editing keeps it', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Harness onClose={onClose} />);
    const field = await screen.findByRole('textbox', { name: 'First reminder' });
    field.focus();
    await user.keyboard('{Backspace}{Backspace}48');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(await screen.findByRole('alertdialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(discardPrompt()).toBeNull());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'First reminder' })).toHaveValue('48');
  });

  it('closes after Discard', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Harness onClose={onClose} />);
    const field = await screen.findByRole('textbox', { name: 'First reminder' });
    field.focus();
    await user.keyboard('8');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    // The sheet was non-dismissible at that moment; the parent-driven close
    // must still take it down rather than strand it open.
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Event reminders' })).toBeNull(), {
      timeout: 1500,
    });
  });

  it('asks on Escape instead of closing', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Harness onClose={onClose} />);
    const field = await screen.findByRole('textbox', { name: 'First reminder' });
    field.focus();
    await user.keyboard('8');
    await user.keyboard('{Escape}');
    expect(await screen.findByRole('alertdialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes without asking once the edit is saved', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Harness onClose={onClose} />);
    const field = await screen.findByRole('textbox', { name: 'First reminder' });
    field.focus();
    await user.keyboard('8');
    const save = screen.getByRole('button', { name: 'Save changes' });
    fireEvent.click(save);
    // Busy also disables Save, so wait for the save itself to finish.
    await waitFor(() => {
      expect(save).not.toHaveAttribute('aria-busy');
      expect(save).toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(discardPrompt()).toBeNull();
  });

  it('still asks when the edit has disabled Save (invalid reminder ordering)', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Harness onClose={onClose} invalid={(value) => value === '2'} />);
    const field = await screen.findByRole('textbox', { name: 'First reminder' });
    field.focus();
    await user.keyboard('{Backspace}{Backspace}2');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(await screen.findByRole('alertdialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('never asks for an autosave panel', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Harness guarded={false} onClose={onClose} />);
    const field = await screen.findByRole('textbox', { name: 'First reminder' });
    field.focus();
    await user.keyboard('8');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(discardPrompt()).toBeNull();
  });
});

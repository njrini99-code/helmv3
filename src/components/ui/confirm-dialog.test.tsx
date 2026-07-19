import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils';
import { ConfirmDialog } from './confirm-dialog';
import { isNativeApp } from '@/lib/utils/capacitor';

// ─────────────────────────────────────────────────────────────────────────────
// Regression guard for the W4 destructive-emphasis audit: a destructive
// ("can't be undone") confirm must not let the eye land on the wrong action.
// Cancel has to read as the quiet/ghost secondary (not a bordered/shadowed
// `secondary` button competing with the destructive fill), and the initial
// focus-trap auto-focus must never land on the destructive Confirm button.
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('@/lib/utils/capacitor', () => ({
  triggerHaptic: vi.fn(async () => undefined),
  isNativeApp: vi.fn(() => false),
}));

afterEach(() => {
  vi.mocked(isNativeApp).mockReturnValue(false);
});

describe('ConfirmDialog', () => {
  it('renders Cancel as the quiet ghost variant (not the bordered secondary) for a danger confirm', () => {
    render(
      <ConfirmDialog
        open
        title="Delete task?"
        message="This can't be undone."
        variant="danger"
        confirmLabel="Delete task"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    expect(cancelButton).toHaveAttribute('data-variant', 'ghost');
  });

  it('keeps Cancel as secondary for a non-destructive (default) confirm', () => {
    render(
      <ConfirmDialog
        open
        title="Save changes?"
        message="Apply these settings."
        variant="default"
        confirmLabel="Save"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    expect(cancelButton).toHaveAttribute('data-variant', 'secondary');
  });

  it('does not auto-focus the destructive Confirm button on the native action-sheet layout', async () => {
    vi.mocked(isNativeApp).mockReturnValue(true);

    render(
      <ConfirmDialog
        open
        title="Delete task?"
        message="This can't be undone."
        variant="danger"
        confirmLabel="Delete task"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    const confirmButton = screen.getByRole('button', { name: 'Delete task' });

    // useFocusTrap auto-focuses the first tabbable element on a deferred
    // (setTimeout 0) tick — wait for it, then assert it landed on the safe
    // action, never the destructive one.
    await waitFor(() => {
      expect(document.activeElement).toBe(cancelButton);
    });
    expect(document.activeElement).not.toBe(confirmButton);
  });
});

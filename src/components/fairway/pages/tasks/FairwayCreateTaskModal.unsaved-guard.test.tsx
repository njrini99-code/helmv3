/**
 * W4 audit fix — regression test for the silent-discard bug.
 *
 * Root cause: FairwayCreateTaskModal wired ModalShell's `onOpenChange` (which
 * fires on Escape, backdrop-click, AND the top-right X — all three funnel
 * through the same Radix Dialog callback) straight to `handleClose`, which
 * reset the form and called `onClose()` with no warning. A coach who typed a
 * title/description/due date and brushed Escape, or fat-fingered a
 * backdrop-click, lost everything silently.
 *
 * ModalShell is mocked the same way FairwayCreateTaskModal.layout.test.tsx
 * mocks it (real Radix/framer-motion overlay behavior isn't under test here),
 * but this mock ALSO exposes a "simulate-close" button that invokes the real
 * `onOpenChange(false)` callback — the same code path Escape/backdrop/X all
 * take in production — so the guard logic can be exercised without a real
 * Radix Dialog. Because `DiscardChangesModal` is built on the identical
 * `ModalShell` module, the same mock renders it too; each dialog is
 * distinguished by its accessible name (the `title` prop).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import * as React from 'react';

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

vi.mock('@/components/fairway/overlays/ModalShell', () => {
  interface ShellProps {
    open: boolean;
    onOpenChange?: (open: boolean) => void;
    title?: React.ReactNode;
    children?: React.ReactNode;
  }
  function ModalShellRoot({ open, onOpenChange, title, children }: ShellProps) {
    if (!open) return null;
    const label = typeof title === 'string' ? title : 'dialog';
    return (
      <div role="dialog" aria-label={label}>
        {/* Stands in for Escape / backdrop-click / the X — all three fire
            ModalShell's real onOpenChange(false) in production. */}
        {/* eslint-disable-next-line helm/no-raw-button -- test-only ModalShell mock, not real UI */}
        <button
          type="button"
          data-testid={`mock-close-${slugify(label)}`}
          onClick={() => onOpenChange?.(false)}
        >
          simulate-close
        </button>
        {children}
      </div>
    );
  }
  ModalShellRoot.Body = function Body({ children }: { children?: React.ReactNode }) {
    return <div data-testid="mock-modal-body">{children}</div>;
  };
  ModalShellRoot.Footer = function Footer({ children }: { children?: React.ReactNode }) {
    return <div data-testid="mock-modal-footer">{children}</div>;
  };
  return { ModalShell: ModalShellRoot };
});

const createTaskMock = vi.fn(async (..._args: unknown[]) => ({ success: true, data: { taskId: 'task-1' } }));
const setTaskReminderMock = vi.fn(async (..._args: unknown[]) => ({ success: true }));
vi.mock('@/app/golf/actions/tasks', () => ({
  createTask: (...args: unknown[]) => createTaskMock(...args),
  setTaskReminder: (...args: unknown[]) => setTaskReminderMock(...args),
}));

import { FairwayCreateTaskModal, isTaskFormDirty } from './FairwayCreateTaskModal';

function renderModal() {
  const onClose = vi.fn();
  const onTaskCreated = vi.fn(async () => {});
  render(
    <FairwayCreateTaskModal
      open
      onClose={onClose}
      onTaskCreated={onTaskCreated}
      teamId="team-1"
      players={[{ id: 'p1', first_name: 'Jordan', last_name: 'Spieth' }]}
    />,
  );
  return { onClose, onTaskCreated };
}

function mainDialog() {
  return screen.getByRole('dialog', { name: 'Create a task' });
}

function simulateCloseAttempt() {
  fireEvent.click(within(mainDialog()).getByTestId('mock-close-create-a-task'));
}

describe('FairwayCreateTaskModal — unsaved-changes guard (W4)', () => {
  it('a clean (untouched) form closes immediately on a close attempt — no confirm', () => {
    const { onClose } = renderModal();

    simulateCloseAttempt();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Discard this task?')).not.toBeInTheDocument();
  });

  it('a dirty form shows "Discard this task?" instead of silently closing, and Discard confirms the close', () => {
    const { onClose } = renderModal();

    fireEvent.change(screen.getByLabelText(/Task title/i), {
      target: { value: 'Review swing video' },
    });

    simulateCloseAttempt();

    // The close was intercepted — onClose must NOT have fired yet.
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Discard this task?')).toBeInTheDocument();
    expect(screen.getByText("Your changes won't be saved.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('choosing "Keep editing" dismisses the confirm without closing and preserves the typed input', () => {
    const { onClose } = renderModal();

    const titleInput = screen.getByLabelText(/Task title/i) as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'Review swing video' } });

    simulateCloseAttempt();
    expect(screen.getByText('Discard this task?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText('Discard this task?')).not.toBeInTheDocument();
    // The form still holds what the coach typed — nothing was reset.
    expect(screen.getByLabelText(/Task title/i)).toHaveValue('Review swing video');
  });

  it('the footer Cancel button is gated the same way as Escape/backdrop/X', () => {
    const { onClose } = renderModal();

    fireEvent.change(screen.getByLabelText(/Task title/i), {
      target: { value: 'Review swing video' },
    });

    fireEvent.click(within(screen.getByTestId('mock-modal-footer')).getByText('Cancel'));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Discard this task?')).toBeInTheDocument();
  });
});

describe('isTaskFormDirty (W4) — pure dirty check backing the guard', () => {
  const clean = {
    title: '',
    description: '',
    dueDate: '',
    reminderAt: '',
    assignMode: 'all' as const,
    selectedPlayers: [] as string[],
  };

  it('is false for an untouched form', () => {
    expect(isTaskFormDirty(clean)).toBe(false);
  });

  it('is false for whitespace-only title/description (nothing meaningful typed)', () => {
    expect(isTaskFormDirty({ ...clean, title: '   ', description: '  \n ' })).toBe(false);
  });

  it('is true once any field diverges from its default', () => {
    expect(isTaskFormDirty({ ...clean, title: 'Review swing video' })).toBe(true);
    expect(isTaskFormDirty({ ...clean, description: 'Some notes' })).toBe(true);
    expect(isTaskFormDirty({ ...clean, dueDate: '2026-08-01' })).toBe(true);
    expect(isTaskFormDirty({ ...clean, reminderAt: '2026-08-01T09:00' })).toBe(true);
    // Switching to "Specific players" is a change even before anyone is picked.
    expect(isTaskFormDirty({ ...clean, assignMode: 'specific' })).toBe(true);
    expect(isTaskFormDirty({ ...clean, selectedPlayers: ['p1'] })).toBe(true);
  });
});

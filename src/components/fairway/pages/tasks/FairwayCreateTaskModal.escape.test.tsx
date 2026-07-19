/**
 * ============================================================================
 * FairwayCreateTaskModal — single-Escape close (#51, round-2 verification)
 * ----------------------------------------------------------------------------
 * The adversarial re-review flagged: "the first Escape keypress does not
 * close the create-task modal; a second one does," hypothesizing a duplicate
 * keydown listener interacting with the unsaved-changes guard (commit
 * 048de261).
 *
 * The existing unsaved-guard suite (FairwayCreateTaskModal.unsaved-guard.
 * test.tsx) fully MOCKS ModalShell, so it can prove the internal dirty-check
 * logic but can't exercise the real Escape keydown path at all — mustFix item
 * 6 called this out directly. This suite renders the REAL (unmocked)
 * ModalShell — real Radix Dialog, real Base UI Form, real framer-motion — and
 * dispatches genuine `keydown` Escape events on `document`, the same event
 * Radix's DismissableLayer listens for in production.
 *
 * Findings from this verification pass: a single Escape keypress DOES close
 * a clean form immediately, and DOES correctly surface "Discard this task?"
 * on the first press for a dirty form (never requiring a second press to take
 * effect) — Radix's DismissableLayer + our `requestClose()` guard behave
 * correctly together in this environment. No duplicate keydown listener was
 * found in FairwayCreateTaskModal.tsx or its rendered subtree. These tests
 * lock that contract in as a permanent regression guard. (If a real
 * double-Escape defect exists, it would have to be a browser-only timing
 * artifact in Radix's layer-registration effect — see round-2 report.)
 * ========================================================================== */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import * as React from 'react';

vi.mock('@/app/golf/actions/tasks', () => ({
  createTask: vi.fn(async () => ({ success: true, data: { taskId: 'task-1' } })),
  setTaskReminder: vi.fn(async () => ({ success: true })),
}));

import { FairwayCreateTaskModal } from './FairwayCreateTaskModal';

/** A thin real-state wrapper — `open` must actually flip to unmount the
 * dialog on close, the same as the real Tasks page wiring
 * (`open={createOpen}` / `onClose={() => setCreateOpen(false)}`). */
function Wrapper({ onCloseSpy }: { onCloseSpy: () => void }) {
  const [open, setOpen] = React.useState(true);
  return open ? (
    <FairwayCreateTaskModal
      open
      onClose={() => {
        onCloseSpy();
        setOpen(false);
      }}
      onTaskCreated={vi.fn()}
      teamId="team-1"
      players={[]}
    />
  ) : (
    <div data-testid="modal-closed" />
  );
}

function pressEscape() {
  fireEvent.keyDown(document, { key: 'Escape' });
}

describe('FairwayCreateTaskModal — single Escape (#51, real unmocked ModalShell)', () => {
  it('a clean form closes on the FIRST Escape keypress — no second press needed', async () => {
    const onCloseSpy = vi.fn();
    render(<Wrapper onCloseSpy={onCloseSpy} />);
    await screen.findByRole('dialog', { name: 'Create a task' });

    pressEscape();

    expect(await screen.findByTestId('modal-closed')).toBeInTheDocument();
    expect(onCloseSpy).toHaveBeenCalledTimes(1);
  });

  it('a dirty form surfaces "Discard this task?" on the FIRST Escape — the guard fires immediately, not on a second press', async () => {
    const onCloseSpy = vi.fn();
    render(<Wrapper onCloseSpy={onCloseSpy} />);
    await screen.findByRole('dialog', { name: 'Create a task' });

    fireEvent.change(screen.getByLabelText(/Task title/i), {
      target: { value: 'Review swing video' },
    });

    pressEscape();

    // The confirm must appear from the FIRST press — never a silent no-op.
    // (DiscardChangesModal renders its title TWICE — a visually-hidden
    // Dialog.Title for a11y plus its own visible <h2> — so two elements
    // share this accessible name; assert on the unique subtext instead of
    // the ambiguous heading role.)
    expect(await screen.findByText("Your changes won't be saved.")).toBeInTheDocument();
    // The create-task modal itself must still be open (not silently closed).
    expect(onCloseSpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId('modal-closed')).not.toBeInTheDocument();
  });

  it('confirming Discard from the guard actually closes the create-task modal', async () => {
    const onCloseSpy = vi.fn();
    render(<Wrapper onCloseSpy={onCloseSpy} />);
    await screen.findByRole('dialog', { name: 'Create a task' });

    fireEvent.change(screen.getByLabelText(/Task title/i), {
      target: { value: 'Review swing video' },
    });
    pressEscape();
    await screen.findByText("Your changes won't be saved.");

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect(await screen.findByTestId('modal-closed')).toBeInTheDocument();
    expect(onCloseSpy).toHaveBeenCalledTimes(1);
  });
});

/**
 * ============================================================================
 * FairwayCreateTaskModal — empty-title validation (#48, round-2 gap closure)
 * ----------------------------------------------------------------------------
 * Root cause: the Title Input carried a native HTML `required` attribute.
 * Base UI's <Form> registers every FormField and, on ANY submit — including
 * the real native 'submit' event an Enter keypress inside a text field fires
 * — validates each field's underlying native constraint validity BEFORE ever
 * calling our own `onSubmit`. With `required` present and the title empty,
 * that native-validity gate tripped first: `event.preventDefault()` fired,
 * the field was refocused, and our own `handleSubmit` (with its authored
 * "Give the task a title." message) never ran — the coach saw either nothing
 * or the browser's own generic/unstyled validation state instead of the
 * app's inline error.
 *
 * Fix: the title Input carries no native `required` any more. The plain
 * `!title.trim()` check inside `handleSubmit` is the single source of truth,
 * and it now sets a field-anchored `titleError` that FormField renders with
 * the app's own inline error styling (`role="alert"`, the shared error row) —
 * on EVERY submit path: the footer button click AND an Enter-key submit.
 *
 * The Enter-key case is exercised against the REAL (unmocked) ModalShell so
 * the actual Base UI <Form> submit-gating logic is genuinely exercised, not
 * papered over by a mock.
 * ========================================================================== */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';

const createTaskMock = vi.fn(async (..._args: unknown[]) => ({
  success: true,
  data: { taskId: 'task-1' },
}));
const setTaskReminderMock = vi.fn(async (..._args: unknown[]) => ({ success: true }));
vi.mock('@/app/golf/actions/tasks', () => ({
  createTask: (...args: unknown[]) => createTaskMock(...args),
  setTaskReminder: (...args: unknown[]) => setTaskReminderMock(...args),
}));

import { FairwayCreateTaskModal } from './FairwayCreateTaskModal';

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

describe('FairwayCreateTaskModal — empty-title inline error (#48)', () => {
  it('the Title Input carries no native `required` (Base UI Form would otherwise silently swallow our own onSubmit)', () => {
    renderModal();
    const titleInput = screen.getByLabelText(/Task title/i);
    expect(titleInput).not.toHaveAttribute('required');
  });

  it('clicking "Create task" with an empty title shows the app-styled inline error and does not call createTask', async () => {
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Give the task a title.')).toBeInTheDocument();
    expect(createTaskMock).not.toHaveBeenCalled();
  });

  it('typing into the title clears the inline error immediately (fix-as-you-type)', async () => {
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));
    await screen.findByRole('alert');

    fireEvent.change(screen.getByLabelText(/Task title/i), {
      target: { value: 'Review swing video' },
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('a real Enter-key submit (native form submit event, unmocked ModalShell/Base UI Form) with an empty title still runs our own validation and shows the app error — never a silent no-op', async () => {
    renderModal();

    const titleInput = screen.getByLabelText(/Task title/i);
    titleInput.focus();
    // A real <form> 'submit' event, exactly what pressing Enter in a text
    // field dispatches — this is the path the native `required` attribute
    // used to intercept ahead of our own onSubmit.
    fireEvent.submit(titleInput.closest('form')!);

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Give the task a title.')).toBeInTheDocument();
    expect(createTaskMock).not.toHaveBeenCalled();
  });

  it('a real Enter-key submit with a filled title creates the task (the field-level fix does not block a valid submit)', async () => {
    renderModal();

    fireEvent.change(screen.getByLabelText(/Task title/i), {
      target: { value: 'Review swing video' },
    });
    fireEvent.submit(screen.getByLabelText(/Task title/i).closest('form')!);

    await waitFor(() => {
      expect(createTaskMock).toHaveBeenCalledWith(
        'team-1',
        'Review swing video',
        undefined,
        undefined,
        undefined,
        ['p1'],
        // category — absent here because no categories were passed in, so the
        // picker never rendered and nothing could be chosen.
        undefined,
      );
    });
  });
});

/**
 * W1 audit fix — regression test for the clipped footer.
 *
 * The Create-Task dialog used to render its Cancel/Create task actions as the
 * last two elements inside one flat <Form>, with no ModalShell.Body scroll
 * region and no ModalShell.Footer. At short viewports the panel's own
 * `max-h-[...] overflow-hidden` clipped whatever didn't fit — and since the
 * actions were the LAST thing in that unbounded block, they were the first
 * casualty, leaving Cancel/Create task unreachable.
 *
 * ModalShell is mocked the same way FairwayEventEditor.scope.test.tsx mocks
 * it — real Radix/framer-motion overlay behavior isn't under test here, only
 * the call-site composition: Body must own the scroll, Footer must be a
 * pinned sibling OUTSIDE it (not swept inside the same scrolling block).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import * as React from 'react';

vi.mock('@/components/fairway/overlays/ModalShell', () => {
  interface ShellProps {
    open: boolean;
    title?: React.ReactNode;
    children?: React.ReactNode;
  }
  function ModalShellRoot({ open, children }: ShellProps) {
    return open ? <div role="dialog">{children}</div> : null;
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

describe('FairwayCreateTaskModal — footer composition (W1)', () => {
  it('renders Cancel and Create task inside the pinned Footer slot, not the scrolling Body', () => {
    renderModal();

    const body = screen.getByTestId('mock-modal-body');
    const footer = screen.getByTestId('mock-modal-footer');

    // The regression: both actions used to live in the same block as the
    // fields (i.e. inside Body). They must now be Footer-only.
    expect(within(footer).getByText('Cancel')).toBeInTheDocument();
    expect(within(footer).getByText('Create task')).toBeInTheDocument();
    expect(within(body).queryByText('Cancel')).not.toBeInTheDocument();
    expect(within(body).queryByText('Create task')).not.toBeInTheDocument();

    // And the field content is where it belongs — inside the scrolling Body.
    expect(within(body).getByLabelText(/Task title/i)).toBeInTheDocument();
  });

  it('clicking Create task from the (now outside-the-form) footer still submits', async () => {
    renderModal();

    fireEvent.change(screen.getByLabelText(/Task title/i), {
      target: { value: 'Review swing video' },
    });
    fireEvent.click(within(screen.getByTestId('mock-modal-footer')).getByText('Create task'));

    await waitFor(() => {
      expect(createTaskMock).toHaveBeenCalledWith(
        'team-1',
        'Review swing video',
        undefined,
        undefined,
        undefined,
        ['p1'],
      );
    });
  });
});

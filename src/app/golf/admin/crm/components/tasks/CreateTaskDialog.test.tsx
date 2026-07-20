import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils';
import { CreateTaskDialog } from './CreateTaskDialog';
import { createCrmTask } from '@/app/golf/actions/crm-foundations';

// ─────────────────────────────────────────────────────────────────────────────
// Regression guard: a task created through this dialog used to hardcode
// assignee_id: null, which meant it could never match listMyDueTasks()'s
// `.eq('assignee_id', user.id)` filter and would silently never appear in
// the creator's Inbox "Due today" list. New tasks must self-assign to the
// signed-in admin by default.
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('@/app/golf/actions/crm-foundations', () => ({
  createCrmTask: vi.fn(async (input: Record<string, unknown>) => ({
    id: 'task-1',
    created_by: 'user-123',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: null,
    reminder_sent: false,
    ...input,
  })),
}));

const mockGetUser = vi.fn(async () => ({ data: { user: { id: 'user-123' } } }));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
  }),
}));

afterEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });
});

describe('CreateTaskDialog', () => {
  it('self-assigns a new task to the signed-in admin instead of leaving assignee_id null', async () => {
    const { user } = render(
      <CreateTaskDialog open onOpenChange={vi.fn()} coachId="coach-1" />,
    );

    await waitFor(() => expect(mockGetUser).toHaveBeenCalled());

    await user.type(screen.getByLabelText(/title/i), 'Follow up next week');
    await user.click(screen.getByRole('button', { name: /create task/i }));

    await waitFor(() => expect(createCrmTask).toHaveBeenCalledTimes(1));
    expect(createCrmTask).toHaveBeenCalledWith(
      expect.objectContaining({ assignee_id: 'user-123' }),
    );
  });

  it('falls back to null assignee_id if the current user cannot be resolved', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });

    const { user } = render(
      <CreateTaskDialog open onOpenChange={vi.fn()} coachId="coach-1" />,
    );

    await waitFor(() => expect(mockGetUser).toHaveBeenCalled());

    await user.type(screen.getByLabelText(/title/i), 'Untethered task');
    await user.click(screen.getByRole('button', { name: /create task/i }));

    await waitFor(() => expect(createCrmTask).toHaveBeenCalledTimes(1));
    expect(createCrmTask).toHaveBeenCalledWith(
      expect.objectContaining({ assignee_id: null }),
    );
  });
});

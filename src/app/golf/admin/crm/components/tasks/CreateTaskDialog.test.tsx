import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils';
import { CreateTaskDialog } from './CreateTaskDialog';
import { createCrmTask, updateCrmTask } from '@/app/golf/actions/crm-foundations';
import type { CrmTask } from '@/app/golf/admin/crm/types/foundations';

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
  updateCrmTask: vi.fn(async (id: string, patch: Record<string, unknown>) => ({
    id,
    coach_id: 'coach-1',
    created_by: 'user-123',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: null,
    reminder_sent: false,
    status: 'pending',
    ...patch,
  })),
}));

const mockGetUser = vi.fn(
  async (): Promise<{ data: { user: { id: string } | null } }> => ({
    data: { user: { id: 'user-123' } },
  }),
);

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

// ─────────────────────────────────────────────────────────────────────────────
// Edit mode (2026-07-29).
//
// `updateCrmTask` existed, was tested, and revalidated its path — with ZERO
// callers. A task was therefore immutable once saved: the only verb the UI
// offered was "complete", so a wrong title, a due date on the wrong day, or a
// priority that turned out to be urgent were all permanent. Passing `task` puts
// this same dialog into edit mode rather than adding a second one.
// ─────────────────────────────────────────────────────────────────────────────

// Seconds are :00 deliberately. A datetime-local input has MINUTE precision, so
// a fixture with seconds could not round-trip exactly and the assertion below
// would be testing the input's precision rather than the timezone conversion.
const DUE_AT = new Date(2026, 7, 14, 9, 0, 0, 0).toISOString();

const EXISTING: CrmTask = {
  id: 'task-42',
  coach_id: 'coach-1',
  assignee_id: 'user-123',
  created_by: 'user-123',
  title: 'Call about roster spots',
  description: 'Ask about the 2027 class',
  status: 'pending',
  priority: 'high',
  kind: 'call',
  source: 'manual',
  due_at: DUE_AT,
  reminder_at: null,
  completed_at: null,
  created_at: new Date(2026, 6, 1).toISOString(),
  updated_at: new Date(2026, 6, 1).toISOString(),
  metadata: {},
} as unknown as CrmTask;

describe('CreateTaskDialog — edit mode', () => {
  it('prefills every editable field from the task', async () => {
    render(
      <CreateTaskDialog open onOpenChange={vi.fn()} coachId="coach-1" task={EXISTING} />,
    );

    expect(await screen.findByRole('heading', { name: /edit task/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/title/i)).toHaveValue(EXISTING.title);
    expect(screen.getByLabelText(/description/i)).toHaveValue(EXISTING.description);
    // Not "Create task" — the primary action has to say what it will do.
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create task/i })).not.toBeInTheDocument();
  });

  it('updates instead of creating', async () => {
    const { user } = render(
      <CreateTaskDialog open onOpenChange={vi.fn()} coachId="coach-1" task={EXISTING} />,
    );

    const title = await screen.findByLabelText(/title/i);
    await user.clear(title);
    await user.type(title, 'Call about pitching depth');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(updateCrmTask).toHaveBeenCalledTimes(1));
    expect(updateCrmTask).toHaveBeenCalledWith(
      EXISTING.id,
      expect.objectContaining({ title: 'Call about pitching depth' }),
    );
    expect(createCrmTask).not.toHaveBeenCalled();
  });

  /**
   * The bug this dialog would most plausibly have shipped with. Prefilling a
   * datetime-local input from an ISO string via `slice(0, 16)` or
   * `toISOString().slice(0, 16)` yields UTC, so merely OPENING the editor and
   * pressing Save — without touching the due field — would shift the due date by
   * the local offset. Round-tripping must be a no-op.
   */
  it('does not move the due date when the field is left untouched', async () => {
    const { user } = render(
      <CreateTaskDialog open onOpenChange={vi.fn()} coachId="coach-1" task={EXISTING} />,
    );

    await user.click(await screen.findByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(updateCrmTask).toHaveBeenCalledTimes(1));
    const patch = vi.mocked(updateCrmTask).mock.calls[0]![1] as { due_at: string };
    expect(new Date(patch.due_at).getTime()).toBe(new Date(DUE_AT).getTime());
  });

  /**
   * Completion is completeCrmTask's job. If an edit could also write status or
   * completed_at, the two paths would fight over the same columns and saving an
   * edit could silently reopen a completed task.
   */
  it('never writes completion columns', async () => {
    const { user } = render(
      <CreateTaskDialog open onOpenChange={vi.fn()} coachId="coach-1" task={EXISTING} />,
    );

    await user.click(await screen.findByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(updateCrmTask).toHaveBeenCalledTimes(1));
    const patch = vi.mocked(updateCrmTask).mock.calls[0]![1] as Record<string, unknown>;
    expect(Object.keys(patch).sort()).toEqual(
      ['description', 'due_at', 'kind', 'priority', 'title'],
    );
  });

  it('reports the failure without closing, so the edit is not lost', async () => {
    vi.mocked(updateCrmTask).mockRejectedValueOnce(new Error('Failed to update task: 42501'));
    const onOpenChange = vi.fn();

    const { user } = render(
      <CreateTaskDialog open onOpenChange={onOpenChange} coachId="coach-1" task={EXISTING} />,
    );

    await user.click(await screen.findByRole('button', { name: /save changes/i }));

    expect(await screen.findByText(/failed to update task/i)).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

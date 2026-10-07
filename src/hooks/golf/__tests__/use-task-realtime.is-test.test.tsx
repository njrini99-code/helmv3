/**
 * OD-03 follow-up (2026-09-27): the coach Tasks page lists the team's tasks
 * through useTaskRealtime's fetchTasks (coach view), so a QA task flagged
 * `golf_tasks.is_test = true` must not appear there. The realtime handlers
 * only trigger a refetch, so the filter lives on the list read itself.
 *
 * The task that omits the column reads the NOT NULL default (false) through
 * fake-supabase's COLUMN_DEFAULTS.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';

let client: Record<string, unknown> = {};

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => client,
}));

import { useTaskRealtime } from '../use-task-realtime';

function clientWith(tables: Record<string, Array<Record<string, unknown>>>) {
  const channelStub = {
    on: () => channelStub,
    subscribe: () => channelStub,
  };
  return {
    ...createFakeSupabase({ user: { id: 'coach-user' }, tables }),
    channel: () => channelStub,
    removeChannel: () => undefined,
  };
}

describe('useTaskRealtime coach view — is_test tasks (OD-03)', () => {
  it('leaves a flagged task off the team task list and its stats', async () => {
    client = clientWith({
      golf_tasks: [
        { id: 'task-real', team_id: 'team-1', title: 'Upload transcript', status: 'pending', due_date: null, priority: 'normal' },
        { id: 'task-qa', team_id: 'team-1', title: 'QA task', status: 'pending', due_date: null, priority: 'normal', is_test: true },
      ],
      golf_task_assignments: [],
    });

    const { result } = renderHook(() => useTaskRealtime('team-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.tasks.map((t) => t.id)).toEqual(['task-real']);
    expect(result.current.stats.total_tasks).toBe(1);
  });
});

/**
 * @vitest-environment node
 *
 * P010. completeTask / uncompleteTask roll golf_tasks.status up from the
 * task's assignments (syncTaskStatusFromAssignments). The caller is a PLAYER,
 * and golf_tasks_update_coach is is_golf_team_coach(team_id), so under the
 * player's session the UPDATE matched zero rows with no error and the task
 * status never moved. The roll-up now runs with the service-role client after
 * the player's own assignment write succeeds. Its assignments READ is admin
 * too: the player's session sees only their own assignment, and rolling up
 * from that alone would close the task for the whole team.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';

type Row = Record<string, unknown>;

let sessionFake: unknown;
let adminFake: unknown;
let adminWrites: Array<{ table: string; payload: unknown }> = [];

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => sessionFake) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => adminFake) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('@/lib/notifications', () => ({
  notifyTaskAssigned: vi.fn(async () => {}),
  notifyTeamAnnouncement: vi.fn(async () => {}),
}));

import { completeTask, uncompleteTask } from '@/app/golf/actions/tasks';

function nothingMatched() {
  const n: Record<string, unknown> = {};
  Object.assign(n, {
    eq: () => n,
    in: () => n,
    select: () => n,
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
  });
  return n;
}

function world(assignments: Row[], opts: { ownAssignmentWriteFiltered?: boolean } = {}) {
  adminWrites = [];
  const tables: Record<string, Row[]> = {
    golf_players: [{ id: 'player-1', user_id: 'user-1' }],
    golf_tasks: [{ id: 'task-1', team_id: 'team-1', status: 'pending', completed_at: null }],
    golf_task_assignments: assignments,
  };
  const sessionReal = createFakeSupabase({ user: { id: 'user-1' }, tables });
  sessionFake = {
    ...sessionReal,
    from: (table: string) => {
      const b = sessionReal.from(table);
      // golf_tasks_update_coach: a player's UPDATE on the task matches nothing.
      if (table === 'golf_tasks') return { ...b, update: () => nothingMatched() };
      if (table === 'golf_task_assignments') {
        return {
          ...b,
          // A player's session sees only their own assignment rows.
          select: (cols?: string) => b.select(cols).eq('player_id', 'player-1'),
          ...(opts.ownAssignmentWriteFiltered ? { update: () => nothingMatched() } : {}),
        };
      }
      return b;
    },
  };
  const adminReal = createFakeSupabase({ tables });
  adminFake = {
    ...adminReal,
    from: (table: string) => {
      const b = adminReal.from(table);
      return {
        ...b,
        update: (payload: unknown) => {
          adminWrites.push({ table, payload });
          return b.update(payload);
        },
      };
    },
  };
  return tables;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('task status roll-up runs with the admin client (P010)', () => {
  it('marks the task completed when the last assigned player completes it', async () => {
    const tables = world([
      { id: 'a1', task_id: 'task-1', player_id: 'player-1', status: 'pending' },
      { id: 'a2', task_id: 'task-1', player_id: 'player-2', status: 'completed' },
    ]);

    expect(await completeTask('task-1')).toEqual({ success: true });

    expect(tables.golf_tasks![0]!.status).toBe('completed');
    expect(typeof tables.golf_tasks![0]!.completed_at).toBe('string');
    // Only status and completed_at are written to the task.
    const taskWrites = adminWrites.filter((w) => w.table === 'golf_tasks');
    expect(taskWrites).toHaveLength(1);
    expect(Object.keys(taskWrites[0]!.payload as Row).sort()).toEqual(['completed_at', 'status']);
  });

  it('keeps the task pending while a teammate the player cannot see is still pending', async () => {
    const tables = world([
      { id: 'a1', task_id: 'task-1', player_id: 'player-1', status: 'pending' },
      { id: 'a2', task_id: 'task-1', player_id: 'player-2', status: 'pending' },
    ]);

    expect(await completeTask('task-1')).toEqual({ success: true });
    expect(tables.golf_tasks![0]!.status).toBe('pending');
  });

  it('reopens the task when a player undoes their completion', async () => {
    const tables = world([
      { id: 'a1', task_id: 'task-1', player_id: 'player-1', status: 'completed' },
      { id: 'a2', task_id: 'task-1', player_id: 'player-2', status: 'completed' },
    ]);
    tables.golf_tasks![0]!.status = 'completed';
    tables.golf_tasks![0]!.completed_at = '2026-10-01T00:00:00Z';

    expect(await uncompleteTask('task-1')).toEqual({ success: true });
    expect(tables.golf_tasks![0]).toMatchObject({ status: 'pending', completed_at: null });
  });

  it('does not touch the task when the player’s own assignment write matched nothing', async () => {
    const tables = world(
      [
        { id: 'a1', task_id: 'task-1', player_id: 'player-1', status: 'pending' },
        { id: 'a2', task_id: 'task-1', player_id: 'player-2', status: 'completed' },
      ],
      { ownAssignmentWriteFiltered: true },
    );

    const result = await completeTask('task-1');

    expect(result.success).toBe(false);
    expect(adminWrites).toEqual([]);
    expect(tables.golf_tasks![0]!.status).toBe('pending');
  });
});

// @vitest-environment node
// =============================================================================
// src/lib/baseball/tasks/__tests__/reminder-sweep.test.ts
//
// Locks the task-reminder DISPATCH invariants. setTaskReminder/createTask arm a
// reminder (reminder_at + reminder_sent=false) but nothing delivered it; this is
// the dispatcher. The sweep must:
//   - deliver a player_only timeline reminder to EVERY assignee of a due task
//   - flip reminder_sent false -> true exactly once (idempotent re-run = no-op)
//   - skip (but still flag) closed tasks (completed/cancelled) — no nagging
//   - leave reminder_sent=false when there were assignees and ALL deliveries
//     failed, so a transient outage is retried next run
//   - be non-destructive (only reminder_sent + updated_at change)
// =============================================================================

import { describe, it, expect, vi } from 'vitest';

import {
  isDeliverableReminder,
  reminderTimelineCopy,
  sweepTaskReminders,
  type ReminderSweepClient,
} from '@/lib/baseball/tasks/reminder-sweep';

const NOW = '2026-06-24T12:00:00.000Z';
const PAST = '2026-06-24T09:00:00.000Z';
const FUTURE = '2026-06-25T09:00:00.000Z';

// -----------------------------------------------------------------------------
// isDeliverableReminder — pure predicate
// -----------------------------------------------------------------------------

describe('isDeliverableReminder', () => {
  it('delivers for pending / in_progress / overdue tasks', () => {
    expect(isDeliverableReminder({ status: 'pending' })).toBe(true);
    expect(isDeliverableReminder({ status: 'in_progress' })).toBe(true);
    expect(isDeliverableReminder({ status: 'overdue' })).toBe(true);
    expect(isDeliverableReminder({ status: null })).toBe(true);
  });

  it('never delivers for completed / cancelled tasks', () => {
    expect(isDeliverableReminder({ status: 'completed' })).toBe(false);
    expect(isDeliverableReminder({ status: 'cancelled' })).toBe(false);
    expect(isDeliverableReminder({ status: 'CANCELLED' })).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// reminderTimelineCopy — honest, due-date-aware copy
// -----------------------------------------------------------------------------

describe('reminderTimelineCopy', () => {
  const base = {
    id: 't1',
    team_id: 'team1',
    title: 'Film review',
    status: 'pending',
    reminder_at: PAST,
  };

  it('titles with the task title', () => {
    expect(reminderTimelineCopy({ ...base, due_date: null }, NOW).title).toBe(
      'Reminder: Film review',
    );
  });

  it('says "due today" when due same day', () => {
    expect(
      reminderTimelineCopy({ ...base, due_date: '2026-06-24T20:00:00Z' }, NOW).body,
    ).toContain('due today');
  });

  it('says "due tomorrow"', () => {
    expect(
      reminderTimelineCopy({ ...base, due_date: '2026-06-25T12:00:00Z' }, NOW).body,
    ).toContain('due tomorrow');
  });

  it('reports overdue honestly', () => {
    expect(
      reminderTimelineCopy({ ...base, due_date: '2026-06-22T12:00:00Z' }, NOW).body,
    ).toContain('overdue by 2 days');
  });

  it('has a generic body when no due date', () => {
    const { body } = reminderTimelineCopy({ ...base, due_date: null }, NOW);
    expect(body).toContain('Open your tasks');
  });
});

// -----------------------------------------------------------------------------
// sweepTaskReminders — per-team driver over a fake client
// -----------------------------------------------------------------------------

interface TaskRow {
  id: string;
  team_id: string;
  title: string;
  due_date: string | null;
  status: string;
  reminder_at: string | null;
  reminder_sent: boolean;
  updated_at?: string | null;
}
interface AssignRow {
  task_id: string;
  player_id: string;
}

/**
 * In-memory fake of the supabase query-builder surface the sweep uses:
 *   tasks read:   .from('baseball_tasks').select().eq().eq().not().lte().order().limit()
 *   assign read:  .from('baseball_task_assignments').select().eq()  (thenable)
 *   tasks write:  .from('baseball_tasks').update().eq().eq().eq()    (thenable)
 * Filters apply to internal stores so the test exercises the real predicate +
 * write path (including the re-asserted reminder_sent=false guard).
 */
function makeClient(tasks: TaskRow[], assigns: AssignRow[]): {
  client: ReminderSweepClient;
  tasks: TaskRow[];
} {
  function builder(table: string) {
    let mode: 'select' | 'update' = 'select';
    let patch: Record<string, unknown> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filters: Array<(r: any) => boolean> = [];

    const store: Array<Record<string, unknown>> =
      table === 'baseball_tasks'
        ? (tasks as unknown as Array<Record<string, unknown>>)
        : (assigns as unknown as Array<Record<string, unknown>>);

    function resolveRead() {
      const data = store.filter((r) => filters.every((f) => f(r)));
      return { data, error: null };
    }

    const b: Record<string, unknown> = {
      select() {
        mode = 'select';
        return b;
      },
      update(p: Record<string, unknown>) {
        mode = 'update';
        patch = p;
        return b;
      },
      eq(col: string, val: unknown) {
        filters.push((r) => r[col] === val);
        return b;
      },
      not(col: string, _op: string, val: unknown) {
        // only `.not('reminder_at', 'is', null)` is used → keep rows where set
        filters.push((r) => (val === null ? r[col] != null : true));
        return b;
      },
      lte(col: string, val: string) {
        filters.push((r) => String(r[col]) <= val);
        return b;
      },
      order() {
        return b;
      },
      limit() {
        // tasks SELECT resolves here
        return Promise.resolve(resolveRead());
      },
      // assignment SELECT (ends on .eq) and tasks UPDATE (ends on .eq) are both
      // thenable.
      then(resolve: (v: unknown) => void) {
        if (mode === 'update') {
          for (const r of store) {
            if (filters.every((f) => f(r))) Object.assign(r, patch);
          }
          resolve({ data: null, error: null });
          return;
        }
        resolve(resolveRead());
      },
    };
    return b;
  }

  return { client: { from: builder }, tasks };
}

describe('sweepTaskReminders', () => {
  it('delivers to every assignee and flips reminder_sent once', async () => {
    const { client, tasks } = makeClient(
      [
        {
          id: 't1',
          team_id: 'team1',
          title: 'Lift',
          due_date: null,
          status: 'pending',
          reminder_at: PAST,
          reminder_sent: false,
        },
      ],
      [
        { task_id: 't1', player_id: 'p1' },
        { task_id: 't1', player_id: 'p2' },
      ],
    );
    const write = vi.fn().mockResolvedValue({ ok: true });

    const res = await sweepTaskReminders(client, 'team1', NOW, write);

    expect(res.reminded).toBe(1);
    expect(res.delivered).toBe(2);
    expect(write).toHaveBeenCalledTimes(2);
    expect(tasks[0]!.reminder_sent).toBe(true);
    expect(tasks[0]!.updated_at).toBe(NOW);
  });

  it('is idempotent: a re-run delivers nothing (already sent)', async () => {
    const { client } = makeClient(
      [
        {
          id: 't1',
          team_id: 'team1',
          title: 'Lift',
          due_date: null,
          status: 'pending',
          reminder_at: PAST,
          reminder_sent: true,
        },
      ],
      [{ task_id: 't1', player_id: 'p1' }],
    );
    const write = vi.fn().mockResolvedValue({ ok: true });

    const res = await sweepTaskReminders(client, 'team1', NOW, write);
    expect(res.reminded).toBe(0);
    expect(write).not.toHaveBeenCalled();
  });

  it('never delivers a future reminder', async () => {
    const { client } = makeClient(
      [
        {
          id: 't1',
          team_id: 'team1',
          title: 'Lift',
          due_date: null,
          status: 'pending',
          reminder_at: FUTURE,
          reminder_sent: false,
        },
      ],
      [{ task_id: 't1', player_id: 'p1' }],
    );
    const write = vi.fn().mockResolvedValue({ ok: true });

    const res = await sweepTaskReminders(client, 'team1', NOW, write);
    expect(res.reminded).toBe(0);
    expect(write).not.toHaveBeenCalled();
  });

  it('flags a closed (completed) task without nagging', async () => {
    const { client, tasks } = makeClient(
      [
        {
          id: 't1',
          team_id: 'team1',
          title: 'Lift',
          due_date: null,
          status: 'completed',
          reminder_at: PAST,
          reminder_sent: false,
        },
      ],
      [{ task_id: 't1', player_id: 'p1' }],
    );
    const write = vi.fn().mockResolvedValue({ ok: true });

    const res = await sweepTaskReminders(client, 'team1', NOW, write);
    expect(res.skippedClosed).toBe(1);
    expect(res.reminded).toBe(0);
    expect(write).not.toHaveBeenCalled();
    expect(tasks[0]!.reminder_sent).toBe(true); // flagged so it drops out
  });

  it('retries next run when every delivery failed (leaves reminder_sent=false)', async () => {
    const { client, tasks } = makeClient(
      [
        {
          id: 't1',
          team_id: 'team1',
          title: 'Lift',
          due_date: null,
          status: 'pending',
          reminder_at: PAST,
          reminder_sent: false,
        },
      ],
      [{ task_id: 't1', player_id: 'p1' }],
    );
    const write = vi.fn().mockResolvedValue({ ok: false });

    const res = await sweepTaskReminders(client, 'team1', NOW, write);
    expect(res.delivered).toBe(0);
    expect(res.reminded).toBe(0);
    expect(tasks[0]!.reminder_sent).toBe(false); // NOT flagged → retried
  });

  it('flips the flag for a due task with zero assignees (no dangling loop)', async () => {
    const { client, tasks } = makeClient(
      [
        {
          id: 't1',
          team_id: 'team1',
          title: 'Lift',
          due_date: null,
          status: 'pending',
          reminder_at: PAST,
          reminder_sent: false,
        },
      ],
      [],
    );
    const write = vi.fn().mockResolvedValue({ ok: true });

    const res = await sweepTaskReminders(client, 'team1', NOW, write);
    expect(res.delivered).toBe(0);
    expect(res.reminded).toBe(1);
    expect(tasks[0]!.reminder_sent).toBe(true);
  });
});

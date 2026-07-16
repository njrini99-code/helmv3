// =============================================================================
// src/lib/baseball/tasks/reminder-sweep.ts
//
// TASK REMINDER DISPATCH — the delivery half of the task-reminder loop.
//
// THE GAP THIS CLOSES
//   setTaskReminder (src/app/baseball/actions/tasks.ts) and createTask both write
//   reminder_at + reminder_sent=false to baseball_tasks. Nothing ever read those
//   columns back: no job flipped reminder_sent, and the armed reminder was never
//   DELIVERED to the players the task was assigned to. A coach who set a reminder
//   got silence — the exact GolfHelm "reminder auto-send missing" gap, carried
//   into baseball. (The reminder_sent column itself was also missing from the
//   schema until migration 20260624001700; this core is its only reader/writer.)
//
// WHAT THE SWEEP DOES (idempotent, non-destructive)
//   For each team, find tasks whose reminder_at is at/before the cutover instant
//   and whose reminder_sent is still false AND that are still actionable (status
//   not 'completed'/'cancelled' — never nag about a closed task). For each such
//   task, append a player_only timeline event to EVERY assignee (the in-app
//   delivery surface — the same channel the daily-contract miss sweep uses), then
//   flip reminder_sent=true under a re-asserted WHERE guard so a re-run is a
//   no-op.
//
//   The transition is the SOURCE -> SIGNAL -> ACTION -> TIMELINE loop:
//     source : a task's reminder_at instant passed with reminder_sent=false
//     signal : a player_only timeline reminder lands on each assignee's feed
//     action : the player completes the task (the existing completeTask path)
//     outcome: reminder_sent flips to true; the reminder never fires twice
//
// SAFETY / HONESTY
//   - reminder_sent flip is gated by a re-asserted WHERE (reminder_sent = false)
//     so a concurrent setTaskReminder re-arm or a parallel run never double-sends.
//   - Idempotent: a row already reminder_sent=true is filtered by the query, so a
//     re-run is a no-op.
//   - Non-destructive: a single UPDATE of reminder_sent + updated_at. Title,
//     reminder_at, assignments, etc. are untouched.
//   - Closed tasks (completed/cancelled) are skipped — a reminder for a done task
//     is noise. The flag is still set so the row drops out of future sweeps.
//   - Each timeline echo is player_only system-provenance (honest: the system
//     dispatched the reminder; it is never widened past player_only and never
//     authored as coach prose).
//   - Best-effort timeline writes: a per-assignee failure NEVER blocks the flip
//     of OTHER assignees; the flag is only flipped after at least one delivery
//     attempt so a totally-failed dispatch is retried next run.
//
// Pure async function over a minimally-typed client (mirrors missed-sweep.ts), so
// it is unit-testable with an in-memory fake and runs identically under the cron.
// =============================================================================

import { logServerError } from '@/lib/server-error-logger';

// A minimally-typed client so the sweep runs against the service-role admin
// client (the trusted Inngest cron) the same way missed-sweep.ts does. Every
// query is scoped by team_id; the admin client is the only RLS-bypass path,
// reserved here for a system-provenance dispatch.
export type ReminderSweepClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

/**
 * The timeline echo is best-effort and decoupled from the reminder_sent flip. We
 * inject the writer so the core can be unit-tested without the service-role
 * client.
 */
export type ReminderTimelineWriter = (input: {
  teamId: string;
  playerId: string;
  title: string;
  body: string | null;
  sourceId: string;
  occurredAt: string;
}) => Promise<{ ok: boolean }>;

export interface ReminderSweepResult {
  /** Tasks whose reminder fired this pass (reminder_sent flipped false -> true). */
  reminded: number;
  /** Per-assignee timeline reminders successfully delivered (best-effort). */
  delivered: number;
  /** Tasks that were due+unsent but closed (completed/cancelled) — flagged, not delivered. */
  skippedClosed: number;
}

/** Statuses that are terminal — a reminder for one of these is noise. */
const CLOSED_STATUSES = new Set(['completed', 'cancelled']);

/** The minimal task-row shape the sweep needs (loose — reminder_sent not yet in db types). */
interface SweepTaskRow {
  id: string;
  team_id: string;
  title: string;
  due_date: string | null;
  status: string | null;
  reminder_at: string | null;
}

/** A task is deliverable when it is due, unsent, and still actionable. */
export function isDeliverableReminder(
  row: Pick<SweepTaskRow, 'status'>,
): boolean {
  return !CLOSED_STATUSES.has((row.status ?? '').toLowerCase());
}

/**
 * Build the honest reminder title/body for an assignee. Surfaces the due date
 * when present so the nudge is actionable ("due in 2 days") rather than a flat
 * "you have a task".
 */
export function reminderTimelineCopy(
  row: SweepTaskRow,
  nowIso: string,
): { title: string; body: string | null } {
  const title = `Reminder: ${row.title}`;
  if (!row.due_date) {
    return {
      title,
      body: 'Your coach set a reminder for this task. Open your tasks to complete it.',
    };
  }
  const due = new Date(row.due_date).getTime();
  const now = new Date(nowIso).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((due - now) / dayMs);
  let when: string;
  if (Number.isNaN(diffDays)) {
    when = 'soon';
  } else if (diffDays < 0) {
    when = `overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'}`;
  } else if (diffDays === 0) {
    when = 'due today';
  } else if (diffDays === 1) {
    when = 'due tomorrow';
  } else {
    when = `due in ${diffDays} days`;
  }
  return {
    title,
    body: `This task is ${when}. Open your tasks to complete it.`,
  };
}

/**
 * Run the task-reminder dispatch sweep for a SINGLE team.
 *
 * @param client        Service-role admin client (or a test fake) with `.from`.
 * @param teamId        Team scope — every query is scoped by it.
 * @param cutoverIso    The ISO instant treated as "now"; tasks with
 *                      reminder_at <= it and reminder_sent=false are dispatched.
 * @param writeTimeline Best-effort per-assignee timeline writer (injected for testing).
 *
 * Idempotent: a re-run finds no due+unsent rows and is a no-op. Never throws on a
 * per-assignee timeline failure (best-effort); a flag-update DB error does throw
 * so the cron's per-team step.run() retries that team in isolation.
 */
export async function sweepTaskReminders(
  client: ReminderSweepClient,
  teamId: string,
  cutoverIso: string,
  writeTimeline: ReminderTimelineWriter,
): Promise<ReminderSweepResult> {
  // Pull only candidate rows: this team, reminder armed, reminder_at due, not yet
  // sent. Bounded so a huge backlog can't blow the payload; a backlog simply
  // drains over consecutive runs.
  const { data, error } = await client
    .from('baseball_tasks')
    .select('id, team_id, title, due_date, status, reminder_at')
    .eq('team_id', teamId)
    .eq('reminder_sent', false)
    .not('reminder_at', 'is', null)
    .lte('reminder_at', cutoverIso)
    .order('reminder_at', { ascending: true })
    .limit(5000);

  if (error) {
    throw new Error(
      `reminder-sweep: could not load tasks for team ${teamId}: ${
        (error as { message?: string }).message ?? 'unknown error'
      }`,
    );
  }

  const rows = (data ?? []) as SweepTaskRow[];

  let reminded = 0;
  let delivered = 0;
  let skippedClosed = 0;
  // Best-effort per-assignee delivery failures — never rethrown (the flag flip
  // proceeds independently), accumulated and reported as ONE roll-up trace after
  // the loop instead of silently dropped.
  let deliveryFailed = 0;
  const failureSamples: string[] = [];

  for (const row of rows) {
    // Closed tasks: flag (so they drop out of future sweeps) but never nag.
    if (!isDeliverableReminder(row)) {
      const { error: flagErr } = await client
        .from('baseball_tasks')
        .update({ reminder_sent: true, updated_at: cutoverIso })
        .eq('id', row.id)
        .eq('team_id', teamId)
        .eq('reminder_sent', false);
      if (flagErr) {
        throw new Error(
          `reminder-sweep: flag update failed for task ${row.id}: ${
            (flagErr as { message?: string }).message ?? 'unknown error'
          }`,
        );
      }
      skippedClosed += 1;
      continue;
    }

    // Resolve assignees for this task. No assignees => still flip the flag so a
    // dangling armed reminder doesn't loop forever, but deliver nothing.
    const { data: assignRows, error: assignErr } = await client
      .from('baseball_task_assignments')
      .select('player_id')
      .eq('task_id', row.id);
    if (assignErr) {
      throw new Error(
        `reminder-sweep: assignment load failed for task ${row.id}: ${
          (assignErr as { message?: string }).message ?? 'unknown error'
        }`,
      );
    }
    const playerIds = Array.from(
      new Set(
        ((assignRows ?? []) as Array<{ player_id: string | null }>)
          .map((a) => a.player_id)
          .filter((p): p is string => Boolean(p)),
      ),
    );

    // Best-effort per-assignee delivery. A single failure never blocks the rest.
    const { title, body } = reminderTimelineCopy(row, cutoverIso);
    let deliveredThisTask = 0;
    for (const playerId of playerIds) {
      try {
        const res = await writeTimeline({
          teamId,
          playerId,
          title,
          body,
          sourceId: row.id,
          occurredAt: row.reminder_at ?? cutoverIso,
        });
        if (res.ok) {
          delivered += 1;
          deliveredThisTask += 1;
        }
      } catch (err) {
        // Swallowed by design (best-effort). The flag flip below still proceeds.
        deliveryFailed += 1;
        if (failureSamples.length < 5) {
          failureSamples.push(`${row.id}/${playerId}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    // Flip reminder_sent only AFTER attempting delivery, under a re-asserted
    // WHERE guard so a concurrent re-arm (setTaskReminder) is never clobbered —
    // the update simply affects zero rows in that race. We flip even when there
    // were zero assignees (nothing to deliver) so a dangling reminder doesn't
    // loop, but we leave the flag UNSET when there were assignees and NONE were
    // delivered, so a transient writer outage is retried on the next run.
    const allDeliveriesFailed =
      playerIds.length > 0 && deliveredThisTask === 0;
    if (allDeliveriesFailed) {
      // Leave reminder_sent=false: retry the whole task next run.
      continue;
    }

    const { error: updErr } = await client
      .from('baseball_tasks')
      .update({ reminder_sent: true, updated_at: cutoverIso })
      .eq('id', row.id)
      .eq('team_id', teamId)
      .eq('reminder_sent', false);
    if (updErr) {
      throw new Error(
        `reminder-sweep: flag update failed for task ${row.id}: ${
          (updErr as { message?: string }).message ?? 'unknown error'
        }`,
      );
    }
    reminded += 1;
  }

  if (deliveryFailed > 0) {
    await logServerError(
      `reminder-sweep: ${deliveryFailed} per-assignee timeline delivery failure(s) for team ${teamId}`,
      {
        action: 'sweepTaskReminders',
        sport: 'baseball',
        source: 'background_job',
        skipSentry: true,
        teamId,
        metadata: { failed: deliveryFailed, sample: failureSamples },
      },
      'warning',
    );
  }

  return { reminded, delivered, skippedClosed };
}

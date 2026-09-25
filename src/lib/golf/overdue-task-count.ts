import { isGolfTaskOverdueInZone } from '@/lib/golf/task-overdue';

/**
 * Overdue-task counts for the Calendar agenda's pinned "N overdue tasks" row.
 *
 * "Overdue" here means: incomplete, and due strictly BEFORE today on the
 * team's wall clock (`isGolfTaskOverdueInZone`). A task due today is not
 * overdue yet. The server has no viewer clock (Vercel runs UTC), so the zone is
 * always passed in.
 *
 * "Incomplete" mirrors the Tasks page (`useTaskRealtime`) so the two surfaces
 * agree on which tasks count:
 *   - player: their OWN assignment status, null read as pending;
 *   - coach: a task is complete only when it has assignees and every one has
 *     completed; with no assignees the task's own status decides.
 */

/** Upper bound for the SQL pre-filter: any zone's "today" is at most one day
 *  past UTC's, so `due_date <= UTC today + 1` is a safe superset. The exact
 *  zone-aware cut happens in JS. */
export function overdueQueryUpperBound(now: Date = new Date()): string {
  const next = new Date(now.getTime() + 86_400_000);
  return next.toISOString().slice(0, 10);
}

export interface PlayerAssignmentOverdueRow {
  status: string | null;
  task: { due_date: string | null; team_id: string | null } | null;
}

/** Player view: this player's own incomplete assignments on this team, past due. */
export function countPlayerOverdueTasks(
  rows: readonly PlayerAssignmentOverdueRow[],
  teamId: string,
  timeZone: string,
  now: Date = new Date(),
): number {
  let count = 0;
  for (const row of rows) {
    if (!row.task || row.task.team_id !== teamId) continue;
    if ((row.status || 'pending') === 'completed') continue;
    if (isGolfTaskOverdueInZone(row.task.due_date, timeZone, now)) count += 1;
  }
  return count;
}

export interface CoachTaskOverdueRow {
  status: string | null;
  due_date: string | null;
  assignments: ReadonlyArray<{ status: string | null }> | null;
}

/** Coach view: the team's tasks that are not rolled up to completed, past due.
 *  Counts TASKS, not assignments. */
export function countCoachOverdueTasks(
  tasks: readonly CoachTaskOverdueRow[],
  timeZone: string,
  now: Date = new Date(),
): number {
  let count = 0;
  for (const task of tasks) {
    const assignments = task.assignments ?? [];
    const allDone =
      assignments.length > 0 && assignments.every((a) => (a.status || 'pending') === 'completed');
    const status = allDone ? 'completed' : task.status || 'pending';
    if (status === 'completed') continue;
    if (isGolfTaskOverdueInZone(task.due_date, timeZone, now)) count += 1;
  }
  return count;
}

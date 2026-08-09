'use server';

/**
 * Server Actions for Task Management
 *
 * Handles:
 * - Task completion by players
 * - Getting player tasks
 * - Task assignment status
 */

import { createClient } from '@/lib/supabase/server';
import { revalidatePath, updateTag } from 'next/cache';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { formatSafeErrorResponse } from '@/lib/validation/server-action-validator';
import { notifyTaskAssigned } from '@/lib/notifications';
import { logServerError } from '@/lib/server-error-logger';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { describeError } from '@/lib/utils/describe-error';
import { validateCoachTeamAccess } from '@/lib/golf/resolve-team';
import {
  generateOccurrences,
  serializeRecurrenceRule,
  type RecurrenceRule,
} from '@/lib/golf/recurrence';

// ============================================================================
// TYPES
// ============================================================================

interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================================================
// COMPLETE TASK
// ============================================================================

/**
 * Complete a task as a player
 * Updates the golf_task_assignments record with status='completed'
 */
async function completeTaskImpl(
  taskId: string,
  _uploadUrl?: string,
  notes?: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get player_id
    const { data: player, error: playerError } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (playerError || !player) {
      return { success: false, error: 'Player not found' };
    }

    // Verify task exists
    const { data: task, error: taskError } = await supabase
      .from('golf_tasks')
      .select('id, team_id')
      .eq('id', taskId)
      .single();

    if (taskError || !task) {
      return { success: false, error: 'Task not found' };
    }

    // Check if player has an assignment for this task
    // Note: golf_task_assignments may not be in generated types
    interface ExistingAssignment {
      id: string;
      status: string | null;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingAssignment, error: assignmentError } = await (supabase as any)
      .from('golf_task_assignments')
      .select('id, status')
      .eq('task_id', taskId)
      .eq('player_id', player.id)
      .maybeSingle() as { data: ExistingAssignment | null; error: Error | null };

    if (assignmentError) {
      await logServerError(`[completeTask Error]: ${describeError(assignmentError)}`, { action: 'tasks.completeTask' });
      return { success: false, error: 'Failed to check task assignment' };
    }

    const now = new Date().toISOString();

    if (existingAssignment) {
      // Update existing assignment
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await (supabase as any)
        .from('golf_task_assignments')
        .update({
          status: 'completed',
          completed_at: now,
          notes: notes || null,
        })
        .eq('id', existingAssignment.id);

      if (updateError) {
        await logServerError(`[completeTask Update Error]: ${describeError(updateError)}`, { action: 'tasks.completeTask' });
        return { success: false, error: updateError.message };
      }
    } else {
      // If no assignment exists but player is on the team, create one and mark complete
      // Verify player is an active member on the same team
      // .single() reports "no such row" as PGRST116 rather than null data, so
      // the two cases have to be told apart explicitly here. Discarding the
      // error meant any read failure — an RLS denial, a timeout — told a player
      // who IS on the team that they are not assigned to this task, and their
      // completion was thrown away.
      const { data: membership, error: membershipError } = await supabase
        .from('golf_team_members')
        .select('id')
        .eq('player_id', player.id)
        .eq('team_id', task.team_id)
        .eq('status', 'active')
        .single();

      if (membershipError && (membershipError as { code?: string }).code !== 'PGRST116') {
        await logServerError(
          `[completeTask] membership read failed — would have told a rostered player they are not assigned: ${describeError(membershipError)}`,
          { action: 'tasks.completeTask', playerId: player.id },
        );
        return { success: false, error: "Couldn't check your team membership just now. Please try again." };
      }

      if (!membership) {
        return { success: false, error: 'You are not assigned to this task' };
      }

      // Create new assignment as completed
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insertError } = await (supabase as any)
        .from('golf_task_assignments')
        .insert({
          task_id: taskId,
          player_id: player.id,
          status: 'completed',
          completed_at: now,
          notes: notes || null,
        });

      if (insertError) {
        await logServerError(`[completeTask Insert Error]: ${describeError(insertError)}`, { action: 'tasks.completeTask' });
        return { success: false, error: insertError.message };
      }
    }

    await syncTaskStatusFromAssignments(supabase, taskId);

    revalidatePath('/golf/dashboard/tasks');
    updateTag(CACHE_TAGS.DASHBOARD);
    return { success: true };
  } catch (error) {
    await logServerError(`[completeTask Error]: ${describeError(error)}`, { action: 'tasks.completeTask' });
    return formatSafeErrorResponse(error);
  }
}

/**
 * Roll the parent `golf_tasks.status` up from its assignments.
 *
 * The task list derives its badge from assignment progress, so nothing in the
 * UI ever noticed that `golf_tasks.status` stayed 'pending' forever — but the
 * reminder path reads the task, not the assignments, and had no way to tell a
 * finished task from an open one. A player who completed a task early still
 * got its reminder. Keeping the parent honest is what lets
 * `getDueReminders` filter on it.
 *
 * Best-effort: a failure here must not fail the completion the player just
 * made, so it logs and returns.
 */
async function syncTaskStatusFromAssignments(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  taskId: string,
): Promise<void> {
  try {
    const { data: assignments, error } = await supabase
      .from('golf_task_assignments')
      .select('status')
      .eq('task_id', taskId);

    if (error || !assignments || assignments.length === 0) return;

    const allDone = (assignments as Array<{ status: string | null }>).every(
      (a) => a.status === 'completed',
    );

    const { error: updateError } = await supabase
      .from('golf_tasks')
      .update(
        allDone
          ? { status: 'completed', completed_at: new Date().toISOString() }
          : { status: 'pending', completed_at: null },
      )
      .eq('id', taskId);

    if (updateError) {
      await logServerError(
        `[syncTaskStatusFromAssignments]: ${describeError(updateError)}`,
        { action: 'tasks.syncTaskStatusFromAssignments', extra: { taskId } },
        'warning',
      );
    }
  } catch (err) {
    await logServerError(
      `[syncTaskStatusFromAssignments]: ${describeError(err)}`,
      { action: 'tasks.syncTaskStatusFromAssignments', extra: { taskId } },
      'warning',
    );
  }
}

const observedCompleteTask = withAdminObserved(
  'completeTask',
  { demoSafe: true, sport: 'golf', feature: 'task_management' },
  completeTaskImpl,
);

export async function completeTask(
  taskId: string,
  _uploadUrl?: string,
  notes?: string
): Promise<ActionResult> {
  return observedCompleteTask(taskId, _uploadUrl, notes);
}

// ============================================================================
// CREATE TASK (Coach only)
// ============================================================================

/**
 * Create a new task and assign to players (coach only)
 */
async function createTaskImpl(
  teamId: string,
  title: string,
  description?: string,
  dueDate?: string,
  priority?: string,
  assignToPlayerIds?: string[],
  /**
   * Optional category. Previously only tasks instantiated from a TEMPLATE ever
   * carried one, so every hand-created task landed with category = NULL and
   * was invisible under all six category filters — with no "Uncategorized"
   * chip and no change to the count chips to signal that rows were dropped.
   */
  category?: string
): Promise<ActionResult<{ taskId: string }>> {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Verify user is a coach
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id, full_name')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Only coaches can create tasks' };
    }

    // STAFF-STRICT, NOT ORGANIZATION-SCOPED.
    //
    // This asked only whether the team belonged to the coach's ORGANIZATION.
    // Shenandoah runs a men's and a women's team in one org, so that question
    // answers yes for both — the men's/women's wall simply did not exist for
    // task writes. A coach staffed only on the men's team could create, edit
    // and delete the women's team's tasks and templates.
    //
    // validateCoachTeamAccess is the canonical gate (golf_team_coach_staff,
    // with the documented legacy escape hatch for a coach who predates the
    // staff table), and it is what the cookie already goes through. Tasks now
    // use the same rule as everything else.
    if (!coach.organization_id) {
      return { success: false, error: 'Coach profile is not associated with an organization' };
    }
    if (!(await validateCoachTeamAccess(supabase, coach.id, teamId, coach.organization_id))) {
      return { success: false, error: 'Not authorized for this team' };
    }

    // Create the task
    const { data: task, error: taskError } = await supabase
      .from('golf_tasks')
      .insert({
        team_id: teamId,
        title,
        description: description || null,
        due_date: dueDate || null,
        priority: priority || 'normal',
        category: category || null,
        status: 'pending',
        assigned_by: coach.id,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (taskError || !task) {
      await logServerError(`[createTask Error]: ${describeError(taskError)}`, { action: 'tasks.createTask' });
      return { success: false, error: 'Failed to create task' };
    }

    // Assign to players if provided
    if (assignToPlayerIds && assignToPlayerIds.length > 0) {
      const assignments = assignToPlayerIds.map(playerId => ({
        task_id: task.id,
        player_id: playerId,
        status: 'pending',
        created_at: new Date().toISOString(),
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: assignError } = await (supabase as any)
        .from('golf_task_assignments')
        .insert(assignments);

      if (assignError) {
        await logServerError(`[createTask Assignment Error]: ${describeError(assignError)}`, { action: 'tasks.createTask' });
        // Task was created but assignments failed - still return success with warning
      }

      // Notify assigned players (fire-and-forget)
      try {
        const coachName = coach.full_name?.trim() || 'Your Coach';
        const formattedDue = dueDate
          ? new Date(dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
          : null;

        // Both reads are CHECKED. Discarded, a failure left the list null, the
        // guards below fell through, and NO notification went to anyone — while
        // the task itself was created, so the coach saw success and reasonably
        // believed their players had been told. The surrounding try/catch never
        // fired for it either: supabase-js RESOLVES failures rather than
        // throwing, so only a real exception ever reached it.
        //
        // Still fire-and-forget: the task is real and visible in-app either
        // way, so this logs rather than failing the action. Only the silence
        // changes.
        const { data: playerRows, error: playerRowsError } = await supabase
          .from('golf_players')
          .select('user_id')
          .in('id', assignToPlayerIds);

        if (playerRowsError) {
          await logServerError(
            `[createTask] notification recipient lookup failed for task ${task.id}; ${assignToPlayerIds.length} assignee(s) were NOT notified: ${describeError(playerRowsError)}`,
            { action: 'tasks.createTask', featureArea: 'tasks' },
          );
        }

        if (playerRows?.length) {
          const { data: userRows, error: userRowsError } = await supabase
            .from('users')
            .select('id, email')
            .in('id', playerRows.map(p => p.user_id));

          if (userRowsError) {
            await logServerError(
              `[createTask] notification email lookup failed for task ${task.id}; ${playerRows.length} assignee(s) were NOT notified: ${describeError(userRowsError)}`,
              { action: 'tasks.createTask', featureArea: 'tasks' },
            );
          }

          if (userRows) {
            await Promise.allSettled(
              userRows.map(u =>
                u.email
                  ? notifyTaskAssigned(u.id, u.email, title, description || null, formattedDue, coachName, task.id)
                  : Promise.resolve()
              )
            );
          }
        }
      } catch (notifErr) {
        await logServerError(`[createTask] Notification error (non-fatal): ${describeError(notifErr)}`, { action: 'tasks.createTask' });
      }
    }

    revalidatePath('/golf/dashboard/tasks');
    updateTag(CACHE_TAGS.DASHBOARD);
    return { success: true, data: { taskId: task.id } };
  } catch (error) {
    await logServerError(`[createTask Error]: ${describeError(error)}`, { action: 'tasks.createTask' });
    return formatSafeErrorResponse(error);
  }
}

const observedCreateTask = withAdminObserved(
  'createTask',
  { demoSafe: true, sport: 'golf', feature: 'task_management' },
  createTaskImpl,
);

export async function createTask(
  teamId: string,
  title: string,
  description?: string,
  dueDate?: string,
  priority?: string,
  assignToPlayerIds?: string[],
  category?: string
): Promise<ActionResult<{ taskId: string }>> {
  return observedCreateTask(teamId, title, description, dueDate, priority, assignToPlayerIds, category);
}

// ============================================================================
// CREATE RECURRING TASK (Coach only) — issue #1238
// ============================================================================

export interface CreateRecurringTaskInput {
  teamId: string;
  title: string;
  description?: string;
  /** First occurrence's due date, ISO `YYYY-MM-DD`. Anchors the series. */
  startDate: string;
  recurrence: RecurrenceRule;
  priority?: string;
  category?: string;
  assignToPlayerIds?: string[];
  /**
   * Local time of day for each occurrence's reminder, `HH:mm`. Applied to that
   * occurrence's own due date, so every instance gets its own reminder rather
   * than the series sharing one.
   */
  reminderTime?: string;
  /** Minutes from UTC (Date.getTimezoneOffset()), so reminders land at the coach's local time. */
  timezoneOffset?: number;
}

/**
 * Create a recurring task series.
 *
 * SERIES MODEL — deliberately identical to golf_events (see
 * recurring-events.ts): the root row carries `recurrence_rule` and no parent;
 * each occurrence carries `parent_task_id = root.id` and a NULL rule.
 *
 * Occurrences are MATERIALIZED rather than expanded at read time because each
 * one needs state a virtual row cannot hold: its own golf_task_assignments
 * (per-player completion), its own status rollup, and its own reminder row.
 * That is also why every existing read path keeps working untouched — an
 * occurrence is an ordinary task in every respect.
 */
async function createRecurringTaskImpl(
  input: CreateRecurringTaskInput
): Promise<ActionResult<{ rootTaskId: string; occurrenceCount: number }>> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Only coaches can create tasks' };
    }

    if (!coach.organization_id) {
      return { success: false, error: 'Coach profile is not associated with an organization' };
    }

    // STAFF-STRICT, NOT ORGANIZATION-SCOPED.
    //
    // This asked only whether the team belonged to the coach's ORGANIZATION.
    // Shenandoah runs a men's and a women's team in one org, so that question
    // answers yes for both — the men's/women's wall simply did not exist for
    // task writes. A coach staffed only on the men's team could create, edit
    // and delete the women's team's tasks and templates.
    //
    // validateCoachTeamAccess is the canonical gate (golf_team_coach_staff,
    // with the documented legacy escape hatch for a coach who predates the
    // staff table), and it is what the cookie already goes through. Tasks now
    // use the same rule as everything else.
    if (!(await validateCoachTeamAccess(supabase, coach.id, input.teamId, coach.organization_id))) {
      return { success: false, error: 'Not authorized for this team' };
    }

    // generateOccurrences enforces MAX_SERIES_OCCURRENCES itself, so a runaway
    // rule (daily with a far-future UNTIL) cannot fan out unbounded here.
    const occurrenceDates = generateOccurrences(input.startDate, input.recurrence);
    if (occurrenceDates.length === 0) {
      return { success: false, error: 'That repeat pattern produces no dates. Check the end date.' };
    }

    const recurrenceRule = serializeRecurrenceRule(input.recurrence);
    const now = new Date().toISOString();

    // The FIRST occurrence is the series root: it carries the rule, so the
    // series is discoverable from any occurrence via parent_task_id, and the
    // root is itself a real, completable task rather than a hidden template.
    const { data: rootTask, error: rootError } = await supabase
      .from('golf_tasks')
      .insert({
        team_id: input.teamId,
        title: input.title,
        description: input.description || null,
        due_date: occurrenceDates[0],
        priority: input.priority || 'normal',
        category: input.category || null,
        status: 'pending',
        assigned_by: coach.id,
        recurrence_rule: recurrenceRule,
        created_at: now,
      })
      .select('id')
      .single();

    if (rootError || !rootTask) {
      await logServerError(`[createRecurringTask root]: ${describeError(rootError)}`, {
        action: 'tasks.createRecurringTask',
      });
      return { success: false, error: 'Failed to create the recurring task' };
    }

    // Remaining occurrences reference the root and carry no rule of their own.
    const childRows = occurrenceDates.slice(1).map((date) => ({
      team_id: input.teamId,
      title: input.title,
      description: input.description || null,
      due_date: date,
      priority: input.priority || 'normal',
      category: input.category || null,
      status: 'pending',
      assigned_by: coach.id,
      parent_task_id: rootTask.id,
      created_at: now,
    }));

    let createdIds: string[] = [rootTask.id];

    if (childRows.length > 0) {
      const { data: children, error: childError } = await supabase
        .from('golf_tasks')
        .insert(childRows)
        .select('id');

      if (childError) {
        // Roll the root back rather than leaving a one-occurrence "series" that
        // silently isn't one. The FK cascades, so this cleans up any partial
        // child insert too.
        await supabase.from('golf_tasks').delete().eq('id', rootTask.id);
        await logServerError(`[createRecurringTask occurrences]: ${describeError(childError)}`, {
          action: 'tasks.createRecurringTask',
        });
        return { success: false, error: 'Failed to create the recurring task' };
      }

      createdIds = createdIds.concat((children ?? []).map((c) => c.id));
    }

    // Assignments: every occurrence gets its own rows, so completing week 3
    // says nothing about week 4.
    if (input.assignToPlayerIds && input.assignToPlayerIds.length > 0) {
      const assignments = createdIds.flatMap((taskId) =>
        input.assignToPlayerIds!.map((playerId) => ({
          task_id: taskId,
          player_id: playerId,
          status: 'pending',
          created_at: now,
        })),
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: assignError } = await (supabase as any)
        .from('golf_task_assignments')
        .insert(assignments);

      if (assignError) {
        // Non-fatal, but a series nobody is assigned to is close to useless —
        // surface it rather than reporting a clean success.
        await logServerError(`[createRecurringTask assignments]: ${describeError(assignError)}`, {
          action: 'tasks.createRecurringTask',
        });
        return {
          success: false,
          error: 'The tasks were created but could not be assigned. Please check the roster and try again.',
        };
      }
    }

    // Per-occurrence reminders. Each instance gets its own row keyed to its own
    // due date — the alternative (one reminder for the series) would fire once
    // and never again. Best-effort: a reminder failure must not undo the tasks.
    if (input.reminderTime) {
      const reminderRows = createdIds.map((taskId, i) => ({
        task_id: taskId,
        scheduled_for: buildReminderTimestamp(
          occurrenceDates[i]!,
          input.reminderTime!,
          input.timezoneOffset,
        ),
        reminder_type: 'in_app',
        sent: false,
        created_at: now,
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: reminderError } = await (supabase as any)
        .from('golf_task_reminders')
        .insert(reminderRows);

      if (reminderError) {
        await logServerError(`[createRecurringTask reminders]: ${describeError(reminderError)}`, {
          action: 'tasks.createRecurringTask',
        }, 'warning');
      }
    }

    revalidatePath('/golf/dashboard/tasks');
    updateTag(CACHE_TAGS.DASHBOARD);
    return {
      success: true,
      data: { rootTaskId: rootTask.id, occurrenceCount: createdIds.length },
    };
  } catch (error) {
    await logServerError(`[createRecurringTask Error]: ${describeError(error)}`, {
      action: 'tasks.createRecurringTask',
    });
    return formatSafeErrorResponse(error);
  }
}

/**
 * Combine an occurrence's local date with the coach's chosen local time into a
 * UTC instant. `timezoneOffset` is `Date.getTimezoneOffset()` — minutes to ADD
 * to local time to reach UTC — so a coach in EDT (offset 240) asking for 09:00
 * gets 13:00Z, matching the one-off reminder path.
 */
function buildReminderTimestamp(
  isoDate: string,
  time: string,
  timezoneOffset?: number,
): string {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  const base = new Date(`${isoDate}T00:00:00Z`);
  base.setUTCHours(hours, minutes, 0, 0);
  if (typeof timezoneOffset === 'number' && Number.isFinite(timezoneOffset)) {
    base.setUTCMinutes(base.getUTCMinutes() + timezoneOffset);
  }
  return base.toISOString();
}

const observedCreateRecurringTask = withAdminObserved(
  'createRecurringTask',
  { demoSafe: true, sport: 'golf', feature: 'task_management' },
  createRecurringTaskImpl,
);

export async function createRecurringTask(
  input: CreateRecurringTaskInput
): Promise<ActionResult<{ rootTaskId: string; occurrenceCount: number }>> {
  return observedCreateRecurringTask(input);
}

// ============================================================================
// DELETE TASK (Coach only)
// ============================================================================

/**
 * Coach authorization for a single task — one resolver, three call sites.
 *
 * delete / setReminder / clearReminder each carried their own copy of this
 * three-read block, and all three copies discarded every error. supabase-js
 * resolves a failure as `{ data: null, error }`, so a dropped connection was
 * indistinguishable from a finding, and each read had its own wrong answer
 * ready: "Only coaches can delete tasks" to a coach, "Task not found" for a
 * task the coach is looking at, "Not authorized for this team" for their own
 * team.
 *
 * Refusing when a check cannot run is correct and is kept — an authorization
 * check that did not complete has not passed. Only the sentence changes.
 *
 * `.single()` reports no-row as PGRST116, so that code is the genuine answer
 * ("really not a coach", "task really is gone") and anything else is a failed
 * read. `notACoachError` is the caller's own verb; everything else is shared.
 */
const TASK_AUTHZ_UNREADABLE = "Couldn't verify your access to this task. Please try again.";

type TaskAuthzResult =
  | { ok: true; coach: { id: string; organization_id: string | null }; task: { id: string; team_id: string } }
  | { ok: false; error: string };

async function authorizeCoachForTask(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  taskId: string,
  notACoachError: string,
): Promise<TaskAuthzResult> {
  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', userId)
    .single();

  if (coachError && coachError.code !== 'PGRST116') {
    await logServerError(
      `task authz coach read failed: ${describeError(coachError)}`,
      { action: 'tasks.authorizeCoachForTask', featureArea: 'tasks' },
      'warning',
    );
    return { ok: false, error: TASK_AUTHZ_UNREADABLE };
  }
  if (!coach) return { ok: false, error: notACoachError };

  const { data: task, error: taskError } = await supabase
    .from('golf_tasks')
    .select('id, team_id')
    .eq('id', taskId)
    .single();

  if (taskError && taskError.code !== 'PGRST116') {
    await logServerError(
      `task authz task read failed for ${taskId}: ${describeError(taskError)}`,
      { action: 'tasks.authorizeCoachForTask', featureArea: 'tasks' },
      'warning',
    );
    return { ok: false, error: TASK_AUTHZ_UNREADABLE };
  }
  if (!task) return { ok: false, error: 'Task not found' };

  if (!coach.organization_id) {
    return { ok: false, error: 'Coach profile is not associated with an organization' };
  }

  // STAFF-STRICT (see the note in createTask). This asked only whether the
  // task's team shared an ORGANIZATION with the coach, which is true of both
  // Shenandoah squads — so delete/setReminder/clearReminder reached across the
  // men's/women's line.
  //
  // Read inline rather than via validateCoachTeamAccess, deliberately: that
  // helper returns a bare boolean, so a failed read and a genuine refusal come
  // back identical. This resolver exists to tell those apart — a coach whose
  // check merely failed must not be told they are not a coach of their own
  // team — so it needs the error, not just the verdict. Same staff-strict rule,
  // one extra query's worth of honesty.
  const { data: staffRow, error: staffError } = await supabase
    .from('golf_team_coach_staff')
    .select('id')
    .eq('coach_id', coach.id)
    .eq('team_id', task.team_id)
    .maybeSingle();

  if (staffError) {
    await logServerError(
      `task authz staff read failed for team ${task.team_id}: ${describeError(staffError)}`,
      { action: 'tasks.authorizeCoachForTask', featureArea: 'tasks' },
      'warning',
    );
    return { ok: false, error: TASK_AUTHZ_UNREADABLE };
  }

  if (!staffRow) return { ok: false, error: 'Not authorized for this team' };

  return { ok: true, coach, task };
}

/**
 * Delete a task (coach only)
 */
async function deleteTaskImpl(taskId: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    const authz = await authorizeCoachForTask(supabase, user.id, taskId, 'Only coaches can delete tasks');
    if (!authz.ok) {
      return { success: false, error: authz.error };
    }

    // Delete task (assignments should cascade delete via FK)
    const { error: deleteError } = await supabase
      .from('golf_tasks')
      .delete()
      .eq('id', taskId);

    if (deleteError) {
      await logServerError(`[deleteTask Error]: ${describeError(deleteError)}`, { action: 'tasks.deleteTask' });
      return { success: false, error: deleteError.message };
    }

    revalidatePath('/golf/dashboard/tasks');
    updateTag(CACHE_TAGS.DASHBOARD);
    return { success: true };
  } catch (error) {
    await logServerError(`[deleteTask Error]: ${describeError(error)}`, { action: 'tasks.deleteTask' });
    return formatSafeErrorResponse(error);
  }
}

const observedDeleteTask = withAdminObserved(
  'deleteTask',
  { demoSafe: true, sport: 'golf', feature: 'task_management' },
  deleteTaskImpl,
);

export async function deleteTask(taskId: string): Promise<ActionResult> {
  return observedDeleteTask(taskId);
}

// ============================================================================
// TASK REMINDERS
// ============================================================================

/**
 * Set a reminder for a task
 */
async function setTaskReminderImpl(
  taskId: string,
  reminderAt: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    const authz = await authorizeCoachForTask(supabase, user.id, taskId, 'Only coaches can set reminders');
    if (!authz.ok) {
      return { success: false, error: authz.error };
    }

    // Arm the dispatch queue BEFORE touching golf_tasks' display columns, so a
    // failure here surfaces as an error toast instead of a false "Reminder
    // set." — the hourly cron (task-reminders.ts getDueReminders/
    // processReminders) reads EXCLUSIVELY from golf_task_reminders; a task
    // whose reminder_at is set but has no golf_task_reminders row is never
    // dispatched. Update-or-insert (never delete-then-insert — the
    // no-destructive-writes rule): re-arm any existing unsent row in place so
    // a transient failure can never leave the task with NO armed reminder.
    const { data: existingQueueRow, error: queueLookupError } = await supabase
      .from('golf_task_reminders')
      .select('id')
      .eq('task_id', taskId)
      .eq('sent', false)
      .limit(1)
      .maybeSingle();

    if (queueLookupError) {
      await logServerError(`[setTaskReminder Error]: ${describeError(queueLookupError)}`, { action: 'tasks.setTaskReminder' });
      return { success: false, error: queueLookupError.message };
    }

    const { error: queueError } = existingQueueRow
      ? await supabase
          .from('golf_task_reminders')
          .update({ scheduled_for: reminderAt, reminder_type: 'in_app' })
          .eq('id', existingQueueRow.id)
      : await supabase
          .from('golf_task_reminders')
          .insert({
            task_id: taskId,
            scheduled_for: reminderAt,
            reminder_type: 'in_app',
            sent: false,
          });

    if (queueError) {
      await logServerError(`[setTaskReminder Error]: ${describeError(queueError)}`, { action: 'tasks.setTaskReminder' });
      return { success: false, error: queueError.message };
    }

    // Update task with reminder (drives the Bell badge / "Reminder · ..."
    // label — display-only; the queue row above is what actually dispatches).
    const { error: updateError } = await supabase
      .from('golf_tasks')
      .update({
        reminder_at: reminderAt,
        reminder_sent: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId);

    if (updateError) {
      await logServerError(`[setTaskReminder Error]: ${describeError(updateError)}`, { action: 'tasks.setTaskReminder' });
      return { success: false, error: updateError.message };
    }

    revalidatePath('/golf/dashboard/tasks');
    return { success: true };
  } catch (error) {
    await logServerError(`[setTaskReminder Error]: ${describeError(error)}`, { action: 'tasks.setTaskReminder' });
    return formatSafeErrorResponse(error);
  }
}

const observedSetTaskReminder = withAdminObserved(
  'setTaskReminder',
  { demoSafe: true, sport: 'golf', feature: 'task_management' },
  setTaskReminderImpl,
);

export async function setTaskReminder(
  taskId: string,
  reminderAt: string
): Promise<ActionResult> {
  return observedSetTaskReminder(taskId, reminderAt);
}

/**
 * Clear a task reminder
 */
async function clearTaskReminderImpl(taskId: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    const authz = await authorizeCoachForTask(supabase, user.id, taskId, 'Only coaches can clear reminders');
    if (!authz.ok) {
      return { success: false, error: authz.error };
    }

    // Disarm the dispatch queue FIRST — if this fails we must not report
    // "Reminder cleared." while a not-yet-sent golf_task_reminders row is
    // still live, since the cron would fire it anyway.
    const { error: queueError } = await supabase
      .from('golf_task_reminders')
      .delete()
      .eq('task_id', taskId)
      .eq('sent', false);

    if (queueError) {
      await logServerError(`[clearTaskReminder Error]: ${describeError(queueError)}`, { action: 'tasks.clearTaskReminder' });
      return { success: false, error: queueError.message };
    }

    // Update task to clear reminder (display-only columns).
    const { error: updateError } = await supabase
      .from('golf_tasks')
      .update({
        reminder_at: null,
        reminder_sent: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId);

    if (updateError) {
      await logServerError(`[clearTaskReminder Error]: ${describeError(updateError)}`, { action: 'tasks.clearTaskReminder' });
      return { success: false, error: updateError.message };
    }

    revalidatePath('/golf/dashboard/tasks');
    return { success: true };
  } catch (error) {
    await logServerError(`[clearTaskReminder Error]: ${describeError(error)}`, { action: 'tasks.clearTaskReminder' });
    return formatSafeErrorResponse(error);
  }
}

const observedClearTaskReminder = withAdminObserved(
  'clearTaskReminder',
  { demoSafe: true, sport: 'golf', feature: 'task_management' },
  clearTaskReminderImpl,
);

export async function clearTaskReminder(taskId: string): Promise<ActionResult> {
  return observedClearTaskReminder(taskId);
}

// ============================================================================
// TASK TEMPLATES
// ============================================================================

export interface TaskTemplate {
  id: string;
  team_id: string;
  title: string;
  description: string | null;
  default_assignee_type: string;
  category: string | null;
  default_priority: string | null;
  default_due_days: number | null;
  created_at: string | null;
}

/**
 * Get all task templates for a team
 */
async function getTaskTemplatesImpl(
  teamId: string
): Promise<ActionResult<TaskTemplate[]>> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: templates, error: templatesError } = await (supabase as any)
      .from('golf_task_templates')
      .select('*')
      .eq('team_id', teamId)
      .order('category', { ascending: true })
      .order('title', { ascending: true }) as { data: TaskTemplate[] | null; error: Error | null };

    if (templatesError) {
      await logServerError(`[getTaskTemplates Error]: ${describeError(templatesError)}`, { action: 'tasks.getTaskTemplates' });
      return { success: false, error: 'Failed to fetch templates' };
    }

    return { success: true, data: templates || [] };
  } catch (error) {
    await logServerError(`[getTaskTemplates Error]: ${describeError(error)}`, { action: 'tasks.getTaskTemplates' });
    return formatSafeErrorResponse(error);
  }
}

const observedGetTaskTemplates = withAdminObserved(
  'getTaskTemplates',
  { sport: 'golf', feature: 'task_management' },
  getTaskTemplatesImpl,
);

export async function getTaskTemplates(
  teamId: string
): Promise<ActionResult<TaskTemplate[]>> {
  return observedGetTaskTemplates(teamId);
}

/**
 * Create a new task template
 */
async function createTaskTemplateImpl(
  teamId: string,
  title: string,
  description?: string,
  defaultAssigneeType?: string,
  category?: string,
  defaultPriority?: string,
  defaultDueDays?: number
): Promise<ActionResult<{ templateId: string }>> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Verify user is a coach
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Only coaches can create templates' };
    }

    // STAFF-STRICT, NOT ORGANIZATION-SCOPED.
    //
    // This asked only whether the team belonged to the coach's ORGANIZATION.
    // Shenandoah runs a men's and a women's team in one org, so that question
    // answers yes for both — the men's/women's wall simply did not exist for
    // task writes. A coach staffed only on the men's team could create, edit
    // and delete the women's team's tasks and templates.
    //
    // validateCoachTeamAccess is the canonical gate (golf_team_coach_staff,
    // with the documented legacy escape hatch for a coach who predates the
    // staff table), and it is what the cookie already goes through. Tasks now
    // use the same rule as everything else.
    if (!coach.organization_id) {
      return { success: false, error: 'Coach profile is not associated with an organization' };
    }
    if (!(await validateCoachTeamAccess(supabase, coach.id, teamId, coach.organization_id))) {
      return { success: false, error: 'Not authorized for this team' };
    }

    // Create template
    interface TemplateInsertResult {
      id: string;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: template, error: templateError } = await (supabase as any)
      .from('golf_task_templates')
      .insert({
        team_id: teamId,
        title,
        description: description || null,
        default_assignee_type: defaultAssigneeType || 'all_players',
        category: category || null,
        default_priority: defaultPriority || 'normal',
        default_due_days: defaultDueDays || null,
        created_by: user.id,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single() as { data: TemplateInsertResult | null; error: Error | null };

    if (templateError || !template) {
      await logServerError(`[createTaskTemplate Error]: ${describeError(templateError)}`, { action: 'tasks.createTaskTemplate' });
      return { success: false, error: 'Failed to create template' };
    }

    return { success: true, data: { templateId: template.id } };
  } catch (error) {
    await logServerError(`[createTaskTemplate Error]: ${describeError(error)}`, { action: 'tasks.createTaskTemplate' });
    return formatSafeErrorResponse(error);
  }
}

const observedCreateTaskTemplate = withAdminObserved(
  'createTaskTemplate',
  { demoSafe: true, sport: 'golf', feature: 'task_management' },
  createTaskTemplateImpl,
);

export async function createTaskTemplate(
  teamId: string,
  title: string,
  description?: string,
  defaultAssigneeType?: string,
  category?: string,
  defaultPriority?: string,
  defaultDueDays?: number
): Promise<ActionResult<{ templateId: string }>> {
  return observedCreateTaskTemplate(teamId, title, description, defaultAssigneeType, category, defaultPriority, defaultDueDays);
}

/**
 * Update a task template
 */
async function updateTaskTemplateImpl(
  templateId: string,
  updates: {
    title?: string;
    description?: string;
    defaultAssigneeType?: string;
    category?: string;
    defaultPriority?: string;
    defaultDueDays?: number | null;
  }
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Verify user is a coach
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Only coaches can update templates' };
    }

    // Verify template belongs to coach's team
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: template } = await (supabase as any)
      .from('golf_task_templates')
      .select('id, team_id')
      .eq('id', templateId)
      .single() as { data: { id: string; team_id: string } | null; error: Error | null };

    if (!template) {
      return { success: false, error: 'Template not found' };
    }

    // STAFF-STRICT (see the note in createTask): an organization check
    // answers "yes" for both Shenandoah squads, so it was no wall at all.
    if (!coach.organization_id) {
      return { success: false, error: 'Coach profile is not associated with an organization' };
    }
    if (!(await validateCoachTeamAccess(supabase, coach.id, template.team_id, coach.organization_id))) {
      return { success: false, error: 'Not authorized for this team' };
    }

    // Build update object
    const updateObj: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.title !== undefined) updateObj.title = updates.title;
    if (updates.description !== undefined) updateObj.description = updates.description || null;
    if (updates.defaultAssigneeType !== undefined) updateObj.default_assignee_type = updates.defaultAssigneeType;
    if (updates.category !== undefined) updateObj.category = updates.category || null;
    if (updates.defaultPriority !== undefined) updateObj.default_priority = updates.defaultPriority;
    if (updates.defaultDueDays !== undefined) updateObj.default_due_days = updates.defaultDueDays;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase as any)
      .from('golf_task_templates')
      .update(updateObj)
      .eq('id', templateId);

    if (updateError) {
      await logServerError(`[updateTaskTemplate Error]: ${describeError(updateError)}`, { action: 'tasks.updateTaskTemplate' });
      return { success: false, error: updateError.message };
    }

    return { success: true };
  } catch (error) {
    await logServerError(`[updateTaskTemplate Error]: ${describeError(error)}`, { action: 'tasks.updateTaskTemplate' });
    return formatSafeErrorResponse(error);
  }
}

const observedUpdateTaskTemplate = withAdminObserved(
  'updateTaskTemplate',
  { sport: 'golf', feature: 'task_management' },
  updateTaskTemplateImpl,
);

export async function updateTaskTemplate(
  templateId: string,
  updates: {
    title?: string;
    description?: string;
    defaultAssigneeType?: string;
    category?: string;
    defaultPriority?: string;
    defaultDueDays?: number | null;
  }
): Promise<ActionResult> {
  return observedUpdateTaskTemplate(templateId, updates);
}

/**
 * Delete a task template
 */
async function deleteTaskTemplateImpl(templateId: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Verify user is a coach
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Only coaches can delete templates' };
    }

    // Verify template belongs to coach's team
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: template } = await (supabase as any)
      .from('golf_task_templates')
      .select('id, team_id')
      .eq('id', templateId)
      .single() as { data: { id: string; team_id: string } | null; error: Error | null };

    if (!template) {
      return { success: false, error: 'Template not found' };
    }

    // STAFF-STRICT (see the note in createTask): an organization check
    // answers "yes" for both Shenandoah squads, so it was no wall at all.
    if (!coach.organization_id) {
      return { success: false, error: 'Coach profile is not associated with an organization' };
    }
    if (!(await validateCoachTeamAccess(supabase, coach.id, template.team_id, coach.organization_id))) {
      return { success: false, error: 'Not authorized for this team' };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: deleteError } = await (supabase as any)
      .from('golf_task_templates')
      .delete()
      .eq('id', templateId);

    if (deleteError) {
      await logServerError(`[deleteTaskTemplate Error]: ${describeError(deleteError)}`, { action: 'tasks.deleteTaskTemplate' });
      return { success: false, error: deleteError.message };
    }

    return { success: true };
  } catch (error) {
    await logServerError(`[deleteTaskTemplate Error]: ${describeError(error)}`, { action: 'tasks.deleteTaskTemplate' });
    return formatSafeErrorResponse(error);
  }
}

const observedDeleteTaskTemplate = withAdminObserved(
  'deleteTaskTemplate',
  { sport: 'golf', feature: 'task_management' },
  deleteTaskTemplateImpl,
);

export async function deleteTaskTemplate(templateId: string): Promise<ActionResult> {
  return observedDeleteTaskTemplate(templateId);
}

/**
 * Create a task from a template
 */
async function createTaskFromTemplateImpl(
  templateId: string,
  teamId: string,
  assignToPlayerIds?: string[],
  customTitle?: string,
  customDueDate?: string
): Promise<ActionResult<{ taskId: string }>> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Verify user is a coach
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Only coaches can create tasks from templates' };
    }

    // Fetch the template
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: template, error: templateError } = await (supabase as any)
      .from('golf_task_templates')
      .select('*')
      .eq('id', templateId)
      .single() as { data: TaskTemplate | null; error: Error | null };

    if (templateError || !template) {
      await logServerError(`[createTaskFromTemplate Error]: ${describeError(templateError)}`, { action: 'tasks.createTaskFromTemplate' });
      return { success: false, error: 'Template not found' };
    }

    // Calculate due date if not provided
    let dueDate: string | null = customDueDate ?? null;
    if (!dueDate && template.default_due_days) {
      const date = new Date();
      date.setDate(date.getDate() + template.default_due_days);
      dueDate = date.toISOString().split('T')[0] ?? null;
    }

    // Resolve WHO this task is for BEFORE creating it.
    //
    // This used to run AFTER the insert, and it discarded the roster read's
    // error. supabase-js resolves failures as { data: null, error }, so a
    // failed roster read produced an empty playerIds, the `playerIds.length > 0`
    // guard skipped every assignment, and the function returned success —
    // leaving a task that exists and is assigned to nobody. A coach applies a
    // template to the whole team, sees it succeed, and no player ever sees it.
    // Same defect, and the same shape, as the announcements roster read.
    //
    // Resolved up front, a failure costs nothing: we return before any write.
    let playerIds = assignToPlayerIds || [];

    if (playerIds.length === 0 && template.default_assignee_type === 'all_players') {
      const { data: teamMembers, error: teamMembersError } = await supabase
        .from('golf_team_members')
        .select('player_id')
        .eq('team_id', teamId)
        .eq('status', 'active');

      if (teamMembersError) {
        await logServerError(
          `[createTaskFromTemplate] roster read failed — refusing to create a task assigned to nobody: ${describeError(teamMembersError)}`,
          { action: 'tasks.createTaskFromTemplate' },
        );
        return { success: false, error: "Couldn't load your roster, so nothing was created. Please try again." };
      }

      playerIds = (teamMembers || []).map(tm => tm.player_id);
    }

    // Create the task
    const { data: task, error: taskError } = await supabase
      .from('golf_tasks')
      .insert({
        team_id: teamId,
        title: customTitle || template.title,
        description: template.description,
        due_date: dueDate,
        priority: template.default_priority || 'normal',
        category: template.category,
        status: 'pending',
        assigned_by: coach.id,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (taskError || !task) {
      await logServerError(`[createTaskFromTemplate Task Error]: ${describeError(taskError)}`, { action: 'tasks.createTaskFromTemplate' });
      return { success: false, error: 'Failed to create task' };
    }


    // Create assignments
    if (playerIds.length > 0) {
      const assignments = playerIds.map(playerId => ({
        task_id: task.id,
        player_id: playerId,
        status: 'pending',
        created_at: new Date().toISOString(),
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: assignError } = await (supabase as any)
        .from('golf_task_assignments')
        .insert(assignments);

      if (assignError) {
        await logServerError(`[createTaskFromTemplate Assignment Error]: ${describeError(assignError)}`, { action: 'tasks.createTaskFromTemplate' });
        // Task was created but assignments failed - still return success with the task
      }
    }

    revalidatePath('/golf/dashboard/tasks');
    updateTag(CACHE_TAGS.DASHBOARD);
    return { success: true, data: { taskId: task.id } };
  } catch (error) {
    await logServerError(`[createTaskFromTemplate Error]: ${describeError(error)}`, { action: 'tasks.createTaskFromTemplate' });
    return formatSafeErrorResponse(error);
  }
}

const observedCreateTaskFromTemplate = withAdminObserved(
  'createTaskFromTemplate',
  { sport: 'golf', feature: 'task_management' },
  createTaskFromTemplateImpl,
);

export async function createTaskFromTemplate(
  templateId: string,
  teamId: string,
  assignToPlayerIds?: string[],
  customTitle?: string,
  customDueDate?: string
): Promise<ActionResult<{ taskId: string }>> {
  return observedCreateTaskFromTemplate(templateId, teamId, assignToPlayerIds, customTitle, customDueDate);
}

/**
 * Seed default templates for a team (called once when feature is first used)
 */
async function seedDefaultTemplatesImpl(teamId: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Verify user is a coach
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Only coaches can seed templates' };
    }

    // Check if templates already exist
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingTemplates } = await (supabase as any)
      .from('golf_task_templates')
      .select('id')
      .eq('team_id', teamId)
      .limit(1) as { data: { id: string }[] | null; error: Error | null };

    if (existingTemplates && existingTemplates.length > 0) {
      return { success: true }; // Templates already exist
    }

    // Default templates
    const defaultTemplates = [
      {
        team_id: teamId,
        title: 'Weekly Equipment Check',
        description: 'Inspect all clubs, clean grips, check ball supply, and verify golf bag organization.',
        default_assignee_type: 'all_players',
        category: 'Equipment',
        default_priority: 'normal',
        default_due_days: 7,
        created_by: user.id,
      },
      {
        team_id: teamId,
        title: 'Pre-Tournament Checklist',
        description: 'Pack tournament bag, check weather forecast, review course strategy, confirm tee times.',
        default_assignee_type: 'all_players',
        category: 'Tournament',
        default_priority: 'high',
        default_due_days: 1,
        created_by: user.id,
      },
      {
        team_id: teamId,
        title: 'Practice Round Setup',
        description: 'Walk the course, note pin positions, identify landing areas, and create a course strategy.',
        default_assignee_type: 'all_players',
        category: 'Practice',
        default_priority: 'normal',
        default_due_days: 2,
        created_by: user.id,
      },
      {
        team_id: teamId,
        title: 'Travel Document Reminder',
        description: 'Confirm travel itinerary, pack necessary documents, and verify accommodation details.',
        default_assignee_type: 'all_players',
        category: 'Travel',
        default_priority: 'high',
        default_due_days: 3,
        created_by: user.id,
      },
      {
        team_id: teamId,
        title: 'Physical Conditioning Log',
        description: 'Complete weekly fitness routine and log exercises in the training app.',
        default_assignee_type: 'all_players',
        category: 'Fitness',
        default_priority: 'normal',
        default_due_days: 7,
        created_by: user.id,
      },
      {
        team_id: teamId,
        title: 'Video Analysis Submission',
        description: 'Record and upload a swing video for coach review and feedback.',
        default_assignee_type: 'individual',
        category: 'Training',
        default_priority: 'normal',
        default_due_days: 5,
        created_by: user.id,
      },
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertError } = await (supabase as any)
      .from('golf_task_templates')
      .insert(defaultTemplates);

    if (insertError) {
      await logServerError(`[seedDefaultTemplates Error]: ${describeError(insertError)}`, { action: 'tasks.seedDefaultTemplates' });
      return { success: false, error: 'Failed to seed templates' };
    }

    revalidatePath('/golf/dashboard/tasks');
    revalidatePath('/golf/dashboard/tasks/templates');
    return { success: true };
  } catch (error) {
    await logServerError(`[seedDefaultTemplates Error]: ${describeError(error)}`, { action: 'tasks.seedDefaultTemplates' });
    return formatSafeErrorResponse(error);
  }
}

const observedSeedDefaultTemplates = withAdminObserved(
  'seedDefaultTemplates',
  { sport: 'golf', feature: 'task_management' },
  seedDefaultTemplatesImpl,
);

export async function seedDefaultTemplates(teamId: string): Promise<ActionResult> {
  return observedSeedDefaultTemplates(teamId);
}

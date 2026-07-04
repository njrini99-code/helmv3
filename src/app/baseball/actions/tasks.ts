'use server';

import { withAdminObserved } from '@/lib/admin/observed-action';
/**
 * Server Actions for Baseball Task Management
 *
 * Handles:
 * - Task CRUD (coach creates/deletes, players complete)
 * - Task assignments
 * - Task templates CRUD
 * - Reminders
 *
 * Tables: baseball_tasks, baseball_task_assignments, baseball_task_templates
 */

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { formatSafeErrorResponse } from '@/lib/validation/server-action-validator';
import { logServerError } from '@/lib/server-error-logger';
import { BaseballCapabilityError, requireBaseballCapability } from '@/lib/baseball/capabilities';
import {
  withBaseballAction,
  BaseballUnauthorizedError,
  BaseballNoActiveTeamError,
  BaseballActionError,
} from '@/lib/baseball/with-baseball-action';

const TASKS_PATH = '/baseball/dashboard/tasks';
const TASK_TEMPLATES_PATH = '/baseball/dashboard/tasks/templates';

// ============================================================================
// TYPES
// ============================================================================

interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

function mapTaskActionError<T = void>(error: unknown): ActionResult<T> {
  if (error instanceof BaseballUnauthorizedError) {
    return { success: false, error: 'Not authenticated' };
  }
  if (error instanceof BaseballNoActiveTeamError) {
    return { success: false, error: 'Coach or team not found' };
  }
  if (error instanceof BaseballCapabilityError) {
    return { success: false, error: 'You do not have permission to manage tasks' };
  }
  if (error instanceof BaseballActionError) {
    return { success: false, error: 'Could not complete the task action. Please try again.' };
  }
  if (error instanceof Error) {
    return { success: false, error: error.message };
  }
  return { success: false, error: 'An unexpected error occurred' };
}

export interface BaseballTask {
  id: string;
  team_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: string | null;
  category: string | null;
  status: string | null;
  reminder_at: string | null;
  reminder_sent: boolean | null;
  assigned_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface BaseballTaskAssignment {
  id: string;
  task_id: string;
  player_id: string;
  status: string | null;
  completed_at: string | null;
  notes: string | null;
}

export interface BaseballTaskTemplate {
  id: string;
  team_id: string;
  title: string;
  description: string | null;
  default_assignee_type: string;
  category: string | null;
  default_priority: string | null;
  default_due_days: number | null;
  created_by: string | null;
  created_at: string | null;
}

interface TaskWithAssignment {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: string | null;
  category: string | null;
  created_at: string | null;
  assignment_id: string;
  assignment_status: string;
  completed_at: string | null;
  notes?: string | null;
}

// ============================================================================
// CREATE TASK (Coach only)
// ============================================================================

const createTaskAction = withBaseballAction(
  'createTask',
  {
    featureArea: 'baseball-tasks',
    requiredCapability: 'can_manage_settings',
    teamFrom: (
      teamId: string,
      _data: {
        title: string;
        description?: string;
        due_date?: string;
        category?: string;
        priority?: string;
        reminder_at?: string;
        player_ids: string[];
      },
    ) => teamId,
  },
  async (
    ctx,
    teamId: string,
    data: {
      title: string;
      description?: string;
      due_date?: string;
      category?: string;
      priority?: string;
      reminder_at?: string;
      player_ids: string[];
    },
  ): Promise<ActionResult<{ taskId: string }>> => {
    const supabase = await createClient();
    const coachId = ctx.activeCoachId;
    if (!coachId) return { success: false, error: 'Coach profile not found' };

    if (teamId !== ctx.activeTeamId) {
      await requireBaseballCapability(teamId, 'can_manage_settings');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: task, error: taskError } = await (supabase as any)
      .from('baseball_tasks')
      .insert({
        team_id: teamId,
        title: data.title,
        description: data.description || null,
        due_date: data.due_date || null,
        priority: data.priority || 'normal',
        category: data.category || 'general',
        status: 'active',
        reminder_at: data.reminder_at || null,
        reminder_sent: false,
        assigned_by: coachId,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single() as { data: { id: string } | null; error: Error | null };

    if (taskError || !task) {
      return { success: false, error: 'Failed to create task' };
    }

    if (data.player_ids.length > 0) {
      const assignments = data.player_ids.map((playerId) => ({
        task_id: task.id,
        player_id: playerId,
        status: 'pending',
        created_at: new Date().toISOString(),
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: assignError } = await (supabase as any)
        .from('baseball_task_assignments')
        .insert(assignments);

      if (assignError) {
        await logServerError(
          `[createTask Assignment Error]: ${assignError instanceof Error ? assignError.message : String(assignError)}`,
          { action: 'tasks.createTask' },
        );
      }
    }

    revalidatePath(TASKS_PATH);
    return { success: true, data: { taskId: task.id } };
  },
);

export async function createTask(
  teamId: string,
  data: {
    title: string;
    description?: string;
    due_date?: string;
    category?: string;
    priority?: string;
    reminder_at?: string;
    player_ids: string[];
  }
): Promise<ActionResult<{ taskId: string }>> {
  try {
    return await createTaskAction(teamId, data);
  } catch (error) {
    await logServerError(
      `[createTask Error]: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'tasks.createTask' },
    );
    return mapTaskActionError(error);
  }
}

// ============================================================================
// GET TEAM TASKS (Coach view)
// ============================================================================

async function getTeamTasksImpl(
  teamId: string
): Promise<ActionResult<BaseballTask[]>> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tasks, error: tasksError } = await (supabase as any)
      .from('baseball_tasks')
      .select('*')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false }) as { data: BaseballTask[] | null; error: Error | null };

    if (tasksError) {
      await logServerError(`[getTeamTasks Error]: ${tasksError instanceof Error ? tasksError.message : String(tasksError)}`, { action: 'tasks.getTeamTasks' });
      return { success: false, error: 'Failed to fetch tasks' };
    }

    return { success: true, data: tasks || [] };
  } catch (error) {
    await logServerError(`[getTeamTasks Error]: ${error instanceof Error ? error.message : String(error)}`, { action: 'tasks.getTeamTasks' });
    return formatSafeErrorResponse(error);
  }
}

// ============================================================================
// GET PLAYER TASKS (Player view)
// ============================================================================

async function getPlayerTasksImpl(
  playerId: string
): Promise<ActionResult<TaskWithAssignment[]>> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Fetch player's task assignments
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: assignments, error: assignmentsError } = await (supabase as any)
      .from('baseball_task_assignments')
      // NB: baseball_task_assignments has no created_at column (only id, task_id,
      // player_id, status, completed_at, notes) — selecting/ordering by it 42703'd
      // and broke every player Tasks fetch. Order the final list by the joined
      // task's created_at (a real column) after the merge below instead.
      .select('id, task_id, status, completed_at, notes')
      .eq('player_id', playerId) as { data: BaseballTaskAssignment[] | null; error: Error | null };

    if (assignmentsError) {
      await logServerError(`[getPlayerTasks Error]: ${assignmentsError instanceof Error ? assignmentsError.message : String(assignmentsError)}`, { action: 'tasks.getPlayerTasks' });
      return { success: false, error: 'Failed to fetch task assignments' };
    }

    if (!assignments || assignments.length === 0) {
      return { success: true, data: [] };
    }

    // Fetch task details
    const taskIds = [...new Set(assignments.map(a => a.task_id))];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tasks, error: tasksError } = await (supabase as any)
      .from('baseball_tasks')
      .select('id, title, description, due_date, priority, category, created_at')
      .in('id', taskIds) as { data: BaseballTask[] | null; error: Error | null };

    if (tasksError) {
      await logServerError(`[getPlayerTasks Tasks Error]: ${tasksError instanceof Error ? tasksError.message : String(tasksError)}`, { action: 'tasks.getPlayerTasks' });
      return { success: false, error: 'Failed to fetch task details' };
    }

    // Build task map
    const tasksMap = (tasks || []).reduce((acc, t) => {
      acc[t.id] = t;
      return acc;
    }, {} as Record<string, BaseballTask>);

    // Combine assignments with task info
    const playerTasks: TaskWithAssignment[] = assignments
      .filter(assignment => tasksMap[assignment.task_id])
      .map(assignment => {
        const task = tasksMap[assignment.task_id]!;
        return {
          id: task.id,
          title: task.title,
          description: task.description,
          due_date: task.due_date,
          priority: task.priority,
          category: task.category,
          created_at: task.created_at,
          assignment_id: assignment.id,
          assignment_status: assignment.status || 'pending',
          completed_at: assignment.completed_at,
          notes: assignment.notes,
        };
      })
      // Newest-first by the task's own created_at (the assignment row has no
      // created_at column to sort on).
      .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));

    return { success: true, data: playerTasks };
  } catch (error) {
    await logServerError(`[getPlayerTasks Error]: ${error instanceof Error ? error.message : String(error)}`, { action: 'tasks.getPlayerTasks' });
    return formatSafeErrorResponse(error);
  }
}

// ============================================================================
// COMPLETE TASK (Player)
// ============================================================================

async function completeTaskImpl(
  taskId: string,
  playerId: string,
  notes?: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    const now = new Date().toISOString();

    // Check if assignment exists
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingAssignment } = await (supabase as any)
      .from('baseball_task_assignments')
      .select('id, status')
      .eq('task_id', taskId)
      .eq('player_id', playerId)
      .maybeSingle() as { data: { id: string; status: string | null } | null; error: Error | null };

    if (existingAssignment) {
      // Update existing assignment
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await (supabase as any)
        .from('baseball_task_assignments')
        .update({
          status: 'completed',
          completed_at: now,
          notes: notes || null,
          updated_at: now,
        })
        .eq('id', existingAssignment.id);

      if (updateError) {
        await logServerError(`[completeTask Update Error]: ${updateError instanceof Error ? updateError.message : String(updateError)}`, { action: 'tasks.completeTask' });
        return { success: false, error: updateError.message };
      }
    } else {
      return { success: false, error: 'Task assignment not found' };
    }

    revalidatePath('/baseball/dashboard/tasks');
    return { success: true };
  } catch (error) {
    await logServerError(`[completeTask Error]: ${error instanceof Error ? error.message : String(error)}`, { action: 'tasks.completeTask' });
    return formatSafeErrorResponse(error);
  }
}

// ============================================================================
// UNCOMPLETE TASK (Mark as Pending)
// ============================================================================

async function uncompleteTaskImpl(
  taskId: string,
  playerId: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase as any)
      .from('baseball_task_assignments')
      .update({
        status: 'pending',
        completed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('task_id', taskId)
      .eq('player_id', playerId);

    if (updateError) {
      await logServerError(`[uncompleteTask Error]: ${updateError instanceof Error ? updateError.message : String(updateError)}`, { action: 'tasks.uncompleteTask' });
      return { success: false, error: updateError.message };
    }

    revalidatePath('/baseball/dashboard/tasks');
    return { success: true };
  } catch (error) {
    await logServerError(`[uncompleteTask Error]: ${error instanceof Error ? error.message : String(error)}`, { action: 'tasks.uncompleteTask' });
    return formatSafeErrorResponse(error);
  }
}

// ============================================================================
// DELETE TASK (Coach only)
// ============================================================================

const deleteTaskAction = withBaseballAction(
  'deleteTask',
  { featureArea: 'baseball-tasks' },
  async (_ctx, taskId: string): Promise<ActionResult> => {
    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: task } = await (supabase as any)
      .from('baseball_tasks')
      .select('team_id')
      .eq('id', taskId)
      .single() as { data: { team_id: string } | null };

    if (!task) return { success: false, error: 'Task not found' };

    await requireBaseballCapability(task.team_id, 'can_manage_settings');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('baseball_task_assignments')
      .delete()
      .eq('task_id', taskId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: deleteError } = await (supabase as any)
      .from('baseball_tasks')
      .delete()
      .eq('id', taskId);

    if (deleteError) {
      return { success: false, error: deleteError.message };
    }

    revalidatePath(TASKS_PATH);
    return { success: true };
  },
);

export async function deleteTask(taskId: string): Promise<ActionResult> {
  try {
    return await deleteTaskAction(taskId);
  } catch (error) {
    await logServerError(
      `[deleteTask Error]: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'tasks.deleteTask' },
    );
    return mapTaskActionError(error);
  }
}

// ============================================================================
// GET TASK ASSIGNMENTS (for a specific task)
// ============================================================================

async function getTaskAssignmentsImpl(
  taskId: string
): Promise<ActionResult<Array<{
  id: string;
  player_id: string;
  status: string;
  completed_at: string | null;
  player_first_name: string;
  player_last_name: string;
}>>> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: assignments, error: assignmentsError } = await (supabase as any)
      .from('baseball_task_assignments')
      .select('id, player_id, status, completed_at')
      .eq('task_id', taskId) as { data: BaseballTaskAssignment[] | null; error: Error | null };

    if (assignmentsError) {
      await logServerError(`[getTaskAssignments Error]: ${assignmentsError instanceof Error ? assignmentsError.message : String(assignmentsError)}`, { action: 'tasks.getTaskAssignments' });
      return { success: false, error: 'Failed to fetch assignments' };
    }

    if (!assignments || assignments.length === 0) {
      return { success: true, data: [] };
    }

    // Get player names
    const playerIds = assignments.map(a => a.player_id);
    const { data: players } = await supabase
      .from('baseball_players')
      .select('id, first_name, last_name')
      .in('id', playerIds);

    const playerMap = (players || []).reduce((acc, p) => {
      acc[p.id] = p;
      return acc;
    }, {} as Record<string, { id: string; first_name: string | null; last_name: string | null }>);

    const result = assignments.map(a => ({
      id: a.id,
      player_id: a.player_id,
      status: a.status || 'pending',
      completed_at: a.completed_at,
      player_first_name: playerMap[a.player_id]?.first_name || '',
      player_last_name: playerMap[a.player_id]?.last_name || '',
    }));

    return { success: true, data: result };
  } catch (error) {
    await logServerError(`[getTaskAssignments Error]: ${error instanceof Error ? error.message : String(error)}`, { action: 'tasks.getTaskAssignments' });
    return formatSafeErrorResponse(error);
  }
}

// ============================================================================
// TASK REMINDERS
// ============================================================================

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase as any)
      .from('baseball_tasks')
      .update({
        reminder_at: reminderAt,
        reminder_sent: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId);

    if (updateError) {
      await logServerError(`[setTaskReminder Error]: ${updateError instanceof Error ? updateError.message : String(updateError)}`, { action: 'tasks.setTaskReminder' });
      return { success: false, error: updateError.message };
    }

    revalidatePath('/baseball/dashboard/tasks');
    return { success: true };
  } catch (error) {
    await logServerError(`[setTaskReminder Error]: ${error instanceof Error ? error.message : String(error)}`, { action: 'tasks.setTaskReminder' });
    return formatSafeErrorResponse(error);
  }
}

// ============================================================================
// TASK TEMPLATES
// ============================================================================

async function getTaskTemplatesImpl(
  teamId: string
): Promise<ActionResult<BaseballTaskTemplate[]>> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: templates, error: templatesError } = await (supabase as any)
      .from('baseball_task_templates')
      .select('*')
      .eq('team_id', teamId)
      .order('category', { ascending: true })
      .order('title', { ascending: true }) as { data: BaseballTaskTemplate[] | null; error: Error | null };

    if (templatesError) {
      await logServerError(`[getTaskTemplates Error]: ${templatesError instanceof Error ? templatesError.message : String(templatesError)}`, { action: 'tasks.getTaskTemplates' });
      return { success: false, error: 'Failed to fetch templates' };
    }

    return { success: true, data: templates || [] };
  } catch (error) {
    await logServerError(`[getTaskTemplates Error]: ${error instanceof Error ? error.message : String(error)}`, { action: 'tasks.getTaskTemplates' });
    return formatSafeErrorResponse(error);
  }
}

const createTaskTemplateAction = withBaseballAction(
  'createTaskTemplate',
  {
    featureArea: 'baseball-tasks',
    requiredCapability: 'can_manage_settings',
    teamFrom: (
      teamId: string,
      _data: {
        title: string;
        description?: string;
        default_assignee_type?: string;
        category?: string;
        default_priority?: string;
        default_due_days?: number;
      },
    ) => teamId,
  },
  async (
    ctx,
    teamId: string,
    data: {
      title: string;
      description?: string;
      default_assignee_type?: string;
      category?: string;
      default_priority?: string;
      default_due_days?: number;
    },
  ): Promise<ActionResult<{ templateId: string }>> => {
    const supabase = await createClient();

    if (teamId !== ctx.activeTeamId) {
      await requireBaseballCapability(teamId, 'can_manage_settings');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: template, error: templateError } = await (supabase as any)
      .from('baseball_task_templates')
      .insert({
        team_id: teamId,
        title: data.title,
        description: data.description || null,
        default_assignee_type: data.default_assignee_type || 'all_players',
        category: data.category || null,
        default_priority: data.default_priority || 'normal',
        default_due_days: data.default_due_days || null,
        created_by: ctx.user.id,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single() as { data: { id: string } | null; error: Error | null };

    if (templateError || !template) {
      return { success: false, error: 'Failed to create template' };
    }

    return { success: true, data: { templateId: template.id } };
  },
);

export async function createTaskTemplate(
  teamId: string,
  data: {
    title: string;
    description?: string;
    default_assignee_type?: string;
    category?: string;
    default_priority?: string;
    default_due_days?: number;
  }
): Promise<ActionResult<{ templateId: string }>> {
  try {
    return await createTaskTemplateAction(teamId, data);
  } catch (error) {
    await logServerError(
      `[createTaskTemplate Error]: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'tasks.createTaskTemplate' },
    );
    return mapTaskActionError(error);
  }
}

const deleteTaskTemplateAction = withBaseballAction(
  'deleteTaskTemplate',
  { featureArea: 'baseball-tasks' },
  async (_ctx, templateId: string): Promise<ActionResult> => {
    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: template } = await (supabase as any)
      .from('baseball_task_templates')
      .select('team_id')
      .eq('id', templateId)
      .single() as { data: { team_id: string } | null };

    if (!template) return { success: false, error: 'Template not found' };

    await requireBaseballCapability(template.team_id, 'can_manage_settings');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: deleteError } = await (supabase as any)
      .from('baseball_task_templates')
      .delete()
      .eq('id', templateId);

    if (deleteError) {
      return { success: false, error: deleteError.message };
    }

    return { success: true };
  },
);

export async function deleteTaskTemplate(
  templateId: string
): Promise<ActionResult> {
  try {
    return await deleteTaskTemplateAction(templateId);
  } catch (error) {
    await logServerError(
      `[deleteTaskTemplate Error]: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'tasks.deleteTaskTemplate' },
    );
    return mapTaskActionError(error);
  }
}

const updateTaskTemplateAction = withBaseballAction(
  'updateTaskTemplate',
  { featureArea: 'baseball-tasks' },
  async (
    _ctx,
    templateId: string,
    updates: {
      title?: string;
      description?: string;
      defaultAssigneeType?: string;
      category?: string;
      defaultPriority?: string;
      defaultDueDays?: number | null;
    },
  ): Promise<ActionResult> => {
    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: template } = await (supabase as any)
      .from('baseball_task_templates')
      .select('team_id')
      .eq('id', templateId)
      .single() as { data: { team_id: string } | null };

    if (!template) return { success: false, error: 'Template not found' };

    await requireBaseballCapability(template.team_id, 'can_manage_settings');

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
      .from('baseball_task_templates')
      .update(updateObj)
      .eq('id', templateId);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    return { success: true };
  },
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
  try {
    return await updateTaskTemplateAction(templateId, updates);
  } catch (error) {
    await logServerError(
      `[updateTaskTemplate Error]: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'tasks.updateTaskTemplate' },
    );
    return mapTaskActionError(error);
  }
}

const createTaskFromTemplateAction = withBaseballAction(
  'createTaskFromTemplate',
  {
    featureArea: 'baseball-tasks',
    requiredCapability: 'can_manage_settings',
    teamFrom: (
      _templateId: string,
      teamId: string,
      _playerIds?: string[],
      _customTitle?: string,
      _customDueDate?: string,
    ) => teamId,
  },
  async (
    ctx,
    templateId: string,
    teamId: string,
    playerIds?: string[],
    customTitle?: string,
    customDueDate?: string,
  ): Promise<ActionResult<{ taskId: string }>> => {
    const supabase = await createClient();
    const coachId = ctx.activeCoachId;
    if (!coachId) return { success: false, error: 'Coach profile not found' };

    if (teamId !== ctx.activeTeamId) {
      await requireBaseballCapability(teamId, 'can_manage_settings');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: template, error: templateError } = await (supabase as any)
      .from('baseball_task_templates')
      .select('*')
      .eq('id', templateId)
      .single() as { data: BaseballTaskTemplate | null; error: Error | null };

    if (templateError || !template) {
      return { success: false, error: 'Template not found' };
    }

    if (template.team_id !== teamId) {
      return { success: false, error: 'Template does not belong to this team' };
    }

    let dueDate: string | null = customDueDate ?? null;
    if (!dueDate && template.default_due_days) {
      const date = new Date();
      date.setDate(date.getDate() + template.default_due_days);
      dueDate = date.toISOString().split('T')[0] ?? null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: task, error: taskError } = await (supabase as any)
      .from('baseball_tasks')
      .insert({
        team_id: teamId,
        title: customTitle || template.title,
        description: template.description,
        due_date: dueDate,
        priority: template.default_priority || 'normal',
        category: template.category || 'general',
        status: 'active',
        assigned_by: coachId,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single() as { data: { id: string } | null; error: Error | null };

    if (taskError || !task) {
      return { success: false, error: 'Failed to create task' };
    }

    let resolvedPlayerIds = playerIds || [];

    if (resolvedPlayerIds.length === 0 && template.default_assignee_type === 'all_players') {
      const { data: teamMembers } = await supabase
        .from('baseball_team_members')
        .select('player_id')
        .eq('team_id', teamId);

      resolvedPlayerIds = (teamMembers || []).map((tm) => tm.player_id);
    }

    if (resolvedPlayerIds.length > 0) {
      const assignments = resolvedPlayerIds.map((pId) => ({
        task_id: task.id,
        player_id: pId,
        status: 'pending',
        created_at: new Date().toISOString(),
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: assignError } = await (supabase as any)
        .from('baseball_task_assignments')
        .insert(assignments);

      if (assignError) {
        await logServerError(
          `[createTaskFromTemplate Assignment Error]: ${assignError instanceof Error ? assignError.message : String(assignError)}`,
          { action: 'tasks.createTaskFromTemplate' },
        );
      }
    }

    revalidatePath(TASKS_PATH);
    return { success: true, data: { taskId: task.id } };
  },
);

export async function createTaskFromTemplate(
  templateId: string,
  teamId: string,
  playerIds?: string[],
  customTitle?: string,
  customDueDate?: string
): Promise<ActionResult<{ taskId: string }>> {
  try {
    return await createTaskFromTemplateAction(templateId, teamId, playerIds, customTitle, customDueDate);
  } catch (error) {
    await logServerError(
      `[createTaskFromTemplate Error]: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'tasks.createTaskFromTemplate' },
    );
    return mapTaskActionError(error);
  }
}

// ============================================================================
// SEED DEFAULT TEMPLATES
// ============================================================================

const seedDefaultTemplatesAction = withBaseballAction(
  'seedDefaultTemplates',
  {
    featureArea: 'baseball-tasks',
    requiredCapability: 'can_manage_settings',
    teamFrom: (teamId: string) => teamId,
  },
  async (ctx, teamId: string): Promise<ActionResult> => {
    const supabase = await createClient();

    if (teamId !== ctx.activeTeamId) {
      await requireBaseballCapability(teamId, 'can_manage_settings');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (supabase as any)
      .from('baseball_task_templates')
      .select('id')
      .eq('team_id', teamId)
      .limit(1) as { data: { id: string }[] | null; error: Error | null };

    if (existing && existing.length > 0) {
      return { success: true };
    }

    const defaultTemplates = [
      {
        team_id: teamId,
        title: 'Pre-Game Stretching & Warmup',
        description: 'Complete the team stretching routine and position-specific warmup drills before game time.',
        default_assignee_type: 'all_players',
        category: 'game_prep',
        default_priority: 'high',
        default_due_days: 1,
        created_by: ctx.user.id,
      },
      {
        team_id: teamId,
        title: 'Film Review Session',
        description: 'Watch and analyze game film. Focus on at-bats, defensive positioning, and base running decisions.',
        default_assignee_type: 'all_players',
        category: 'practice',
        default_priority: 'normal',
        default_due_days: 3,
        created_by: ctx.user.id,
      },
      {
        team_id: teamId,
        title: 'Weekly Conditioning Log',
        description: 'Complete and submit your weekly conditioning exercises, including arm care, cardio, and lifting.',
        default_assignee_type: 'all_players',
        category: 'conditioning',
        default_priority: 'normal',
        default_due_days: 7,
        created_by: ctx.user.id,
      },
      {
        team_id: teamId,
        title: 'Academic Progress Check-In',
        description: 'Submit a screenshot or update of current grades and class standing. Note any upcoming exams or conflicts.',
        default_assignee_type: 'all_players',
        category: 'academic',
        default_priority: 'normal',
        default_due_days: 14,
        created_by: ctx.user.id,
      },
      {
        team_id: teamId,
        title: 'Equipment Check',
        description: 'Inspect glove, cleats, batting gloves, and bat. Report any equipment that needs replacement.',
        default_assignee_type: 'all_players',
        category: 'administrative',
        default_priority: 'low',
        default_due_days: 7,
        created_by: ctx.user.id,
      },
      {
        team_id: teamId,
        title: 'Travel Document Submission',
        description: 'Submit required travel forms, emergency contacts, and confirm transportation details for the upcoming trip.',
        default_assignee_type: 'all_players',
        category: 'administrative',
        default_priority: 'high',
        default_due_days: 3,
        created_by: ctx.user.id,
      },
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertError } = await (supabase as any)
      .from('baseball_task_templates')
      .insert(defaultTemplates);

    if (insertError) {
      return { success: false, error: 'Failed to seed templates' };
    }

    revalidatePath(TASKS_PATH);
    revalidatePath(TASK_TEMPLATES_PATH);
    return { success: true };
  },
);

export async function seedDefaultTemplates(
  teamId: string
): Promise<ActionResult> {
  try {
    return await seedDefaultTemplatesAction(teamId);
  } catch (error) {
    await logServerError(
      `[seedDefaultTemplates Error]: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'tasks.seedDefaultTemplates' },
    );
    return mapTaskActionError(error);
  }
}

export const getTeamTasks = withAdminObserved(
  'getTeamTasks',
  { sport: 'baseball', feature: 'baseball_tasks', featureArea: 'baseball-tasks' },
  getTeamTasksImpl,
);

export const getPlayerTasks = withAdminObserved(
  'getPlayerTasks',
  { sport: 'baseball', feature: 'baseball_tasks', featureArea: 'baseball-tasks' },
  getPlayerTasksImpl,
);

export const completeTask = withAdminObserved(
  'completeTask',
  { sport: 'baseball', feature: 'baseball_tasks', featureArea: 'baseball-tasks' },
  completeTaskImpl,
);

export const uncompleteTask = withAdminObserved(
  'uncompleteTask',
  { sport: 'baseball', feature: 'baseball_tasks', featureArea: 'baseball-tasks' },
  uncompleteTaskImpl,
);

export const getTaskAssignments = withAdminObserved(
  'getTaskAssignments',
  { sport: 'baseball', feature: 'baseball_tasks', featureArea: 'baseball-tasks' },
  getTaskAssignmentsImpl,
);

export const setTaskReminder = withAdminObserved(
  'setTaskReminder',
  { sport: 'baseball', feature: 'baseball_tasks', featureArea: 'baseball-tasks' },
  setTaskReminderImpl,
);

export const getTaskTemplates = withAdminObserved(
  'getTaskTemplates',
  { sport: 'baseball', feature: 'baseball_tasks', featureArea: 'baseball-tasks' },
  getTaskTemplatesImpl,
);

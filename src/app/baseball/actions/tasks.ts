'use server';

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

// ============================================================================
// TYPES
// ============================================================================

interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
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
  created_at: string | null;
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
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Verify user is a coach
    const { data: coach } = await supabase
      .from('baseball_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Only coaches can create tasks' };
    }

    // Create the task
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
        assigned_by: coach.id,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single() as { data: { id: string } | null; error: Error | null };

    if (taskError || !task) {
      await logServerError(`[createTask Error]: ${taskError instanceof Error ? taskError.message : String(taskError)}`, { action: 'tasks.createTask' });
      return { success: false, error: 'Failed to create task' };
    }

    // Assign to players
    if (data.player_ids.length > 0) {
      const assignments = data.player_ids.map(playerId => ({
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
        await logServerError(`[createTask Assignment Error]: ${assignError instanceof Error ? assignError.message : String(assignError)}`, { action: 'tasks.createTask' });
      }
    }

    revalidatePath('/baseball/dashboard/tasks');
    return { success: true, data: { taskId: task.id } };
  } catch (error) {
    await logServerError(`[createTask Error]: ${error instanceof Error ? error.message : String(error)}`, { action: 'tasks.createTask' });
    return formatSafeErrorResponse(error);
  }
}

// ============================================================================
// GET TEAM TASKS (Coach view)
// ============================================================================

export async function getTeamTasks(
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

export async function getPlayerTasks(
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
      .select('id, task_id, status, completed_at, notes, created_at')
      .eq('player_id', playerId)
      .order('created_at', { ascending: false }) as { data: BaseballTaskAssignment[] | null; error: Error | null };

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
      });

    return { success: true, data: playerTasks };
  } catch (error) {
    await logServerError(`[getPlayerTasks Error]: ${error instanceof Error ? error.message : String(error)}`, { action: 'tasks.getPlayerTasks' });
    return formatSafeErrorResponse(error);
  }
}

// ============================================================================
// COMPLETE TASK (Player)
// ============================================================================

export async function completeTask(
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

export async function uncompleteTask(
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

export async function deleteTask(taskId: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Verify user is a coach
    const { data: coach } = await supabase
      .from('baseball_coaches')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Only coaches can delete tasks' };
    }

    // Delete assignments first
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('baseball_task_assignments')
      .delete()
      .eq('task_id', taskId);

    // Delete the task
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: deleteError } = await (supabase as any)
      .from('baseball_tasks')
      .delete()
      .eq('id', taskId);

    if (deleteError) {
      await logServerError(`[deleteTask Error]: ${deleteError instanceof Error ? deleteError.message : String(deleteError)}`, { action: 'tasks.deleteTask' });
      return { success: false, error: deleteError.message };
    }

    revalidatePath('/baseball/dashboard/tasks');
    return { success: true };
  } catch (error) {
    await logServerError(`[deleteTask Error]: ${error instanceof Error ? error.message : String(error)}`, { action: 'tasks.deleteTask' });
    return formatSafeErrorResponse(error);
  }
}

// ============================================================================
// GET TASK ASSIGNMENTS (for a specific task)
// ============================================================================

export async function getTaskAssignments(
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

export async function setTaskReminder(
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

export async function getTaskTemplates(
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
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data: coach } = await supabase
      .from('baseball_coaches')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Only coaches can create templates' };
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
        created_by: user.id,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single() as { data: { id: string } | null; error: Error | null };

    if (templateError || !template) {
      await logServerError(`[createTaskTemplate Error]: ${templateError instanceof Error ? templateError.message : String(templateError)}`, { action: 'tasks.createTaskTemplate' });
      return { success: false, error: 'Failed to create template' };
    }

    return { success: true, data: { templateId: template.id } };
  } catch (error) {
    await logServerError(`[createTaskTemplate Error]: ${error instanceof Error ? error.message : String(error)}`, { action: 'tasks.createTaskTemplate' });
    return formatSafeErrorResponse(error);
  }
}

export async function deleteTaskTemplate(
  templateId: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data: coach } = await supabase
      .from('baseball_coaches')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Only coaches can delete templates' };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: deleteError } = await (supabase as any)
      .from('baseball_task_templates')
      .delete()
      .eq('id', templateId);

    if (deleteError) {
      await logServerError(`[deleteTaskTemplate Error]: ${deleteError instanceof Error ? deleteError.message : String(deleteError)}`, { action: 'tasks.deleteTaskTemplate' });
      return { success: false, error: deleteError.message };
    }

    return { success: true };
  } catch (error) {
    await logServerError(`[deleteTaskTemplate Error]: ${error instanceof Error ? error.message : String(error)}`, { action: 'tasks.deleteTaskTemplate' });
    return formatSafeErrorResponse(error);
  }
}

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
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data: coach } = await supabase
      .from('baseball_coaches')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Only coaches can update templates' };
    }

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
      await logServerError(`[updateTaskTemplate Error]: ${updateError instanceof Error ? updateError.message : String(updateError)}`, { action: 'tasks.updateTaskTemplate' });
      return { success: false, error: updateError.message };
    }

    return { success: true };
  } catch (error) {
    await logServerError(`[updateTaskTemplate Error]: ${error instanceof Error ? error.message : String(error)}`, { action: 'tasks.updateTaskTemplate' });
    return formatSafeErrorResponse(error);
  }
}

export async function createTaskFromTemplate(
  templateId: string,
  teamId: string,
  playerIds?: string[],
  customTitle?: string,
  customDueDate?: string
): Promise<ActionResult<{ taskId: string }>> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data: coach } = await supabase
      .from('baseball_coaches')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Only coaches can create tasks from templates' };
    }

    // Fetch template
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: template, error: templateError } = await (supabase as any)
      .from('baseball_task_templates')
      .select('*')
      .eq('id', templateId)
      .single() as { data: BaseballTaskTemplate | null; error: Error | null };

    if (templateError || !template) {
      return { success: false, error: 'Template not found' };
    }

    // Calculate due date
    let dueDate: string | null = customDueDate ?? null;
    if (!dueDate && template.default_due_days) {
      const date = new Date();
      date.setDate(date.getDate() + template.default_due_days);
      dueDate = date.toISOString().split('T')[0] ?? null;
    }

    // Create the task
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
        assigned_by: coach.id,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single() as { data: { id: string } | null; error: Error | null };

    if (taskError || !task) {
      return { success: false, error: 'Failed to create task' };
    }

    // Resolve player IDs
    let resolvedPlayerIds = playerIds || [];

    if (resolvedPlayerIds.length === 0 && template.default_assignee_type === 'all_players') {
      const { data: teamMembers } = await supabase
        .from('baseball_team_members')
        .select('player_id')
        .eq('team_id', teamId);

      resolvedPlayerIds = (teamMembers || []).map(tm => tm.player_id);
    }

    // Create assignments
    if (resolvedPlayerIds.length > 0) {
      const assignments = resolvedPlayerIds.map(pId => ({
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
        await logServerError(`[createTaskFromTemplate Assignment Error]: ${assignError instanceof Error ? assignError.message : String(assignError)}`, { action: 'tasks.createTaskFromTemplate' });
      }
    }

    revalidatePath('/baseball/dashboard/tasks');
    return { success: true, data: { taskId: task.id } };
  } catch (error) {
    await logServerError(`[createTaskFromTemplate Error]: ${error instanceof Error ? error.message : String(error)}`, { action: 'tasks.createTaskFromTemplate' });
    return formatSafeErrorResponse(error);
  }
}

// ============================================================================
// SEED DEFAULT TEMPLATES
// ============================================================================

export async function seedDefaultTemplates(
  teamId: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Check if templates already exist
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
        created_by: user.id,
      },
      {
        team_id: teamId,
        title: 'Film Review Session',
        description: 'Watch and analyze game film. Focus on at-bats, defensive positioning, and base running decisions.',
        default_assignee_type: 'all_players',
        category: 'practice',
        default_priority: 'normal',
        default_due_days: 3,
        created_by: user.id,
      },
      {
        team_id: teamId,
        title: 'Weekly Conditioning Log',
        description: 'Complete and submit your weekly conditioning exercises, including arm care, cardio, and lifting.',
        default_assignee_type: 'all_players',
        category: 'conditioning',
        default_priority: 'normal',
        default_due_days: 7,
        created_by: user.id,
      },
      {
        team_id: teamId,
        title: 'Academic Progress Check-In',
        description: 'Submit a screenshot or update of current grades and class standing. Note any upcoming exams or conflicts.',
        default_assignee_type: 'all_players',
        category: 'academic',
        default_priority: 'normal',
        default_due_days: 14,
        created_by: user.id,
      },
      {
        team_id: teamId,
        title: 'Equipment Check',
        description: 'Inspect glove, cleats, batting gloves, and bat. Report any equipment that needs replacement.',
        default_assignee_type: 'all_players',
        category: 'administrative',
        default_priority: 'low',
        default_due_days: 7,
        created_by: user.id,
      },
      {
        team_id: teamId,
        title: 'Travel Document Submission',
        description: 'Submit required travel forms, emergency contacts, and confirm transportation details for the upcoming trip.',
        default_assignee_type: 'all_players',
        category: 'administrative',
        default_priority: 'high',
        default_due_days: 3,
        created_by: user.id,
      },
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertError } = await (supabase as any)
      .from('baseball_task_templates')
      .insert(defaultTemplates);

    if (insertError) {
      await logServerError(`[seedDefaultTemplates Error]: ${insertError instanceof Error ? insertError.message : String(insertError)}`, { action: 'tasks.seedDefaultTemplates' });
      return { success: false, error: 'Failed to seed templates' };
    }

    revalidatePath('/baseball/dashboard/tasks');
    revalidatePath('/baseball/dashboard/tasks/templates');
    return { success: true };
  } catch (error) {
    await logServerError(`[seedDefaultTemplates Error]: ${error instanceof Error ? error.message : String(error)}`, { action: 'tasks.seedDefaultTemplates' });
    return formatSafeErrorResponse(error);
  }
}

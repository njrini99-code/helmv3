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
import { revalidatePath } from 'next/cache';
import { formatSafeErrorResponse } from '@/lib/validation/server-action-validator';

// ============================================================================
// TYPES
// ============================================================================

interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

interface TaskWithAssignment {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: string | null;
  task_type: string | null;
  created_at: string | null;
  assignment_id: string;
  assignment_status: string;
  completed_at: string | null;
  upload_url?: string | null;
  notes?: string | null;
}

interface TaskAssignment {
  id: string;
  task_id: string;
  player_id: string;
  status: string | null;
  completed_at: string | null;
  upload_url: string | null;
  notes: string | null;
  created_at: string | null;
}

// ============================================================================
// COMPLETE TASK
// ============================================================================

/**
 * Complete a task as a player
 * Updates the golf_task_assignments record with status='completed'
 */
export async function completeTask(
  taskId: string,
  uploadUrl?: string,
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
      console.error('[completeTask Error]', assignmentError);
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
          upload_url: uploadUrl || null,
          notes: notes || null,
          updated_at: now,
        })
        .eq('id', existingAssignment.id);

      if (updateError) {
        console.error('[completeTask Update Error]', updateError);
        return { success: false, error: updateError.message };
      }
    } else {
      // If no assignment exists but player is on the team, create one and mark complete
      // Verify player is on the same team
      const { data: membership } = await supabase
        .from('golf_team_members')
        .select('id')
        .eq('player_id', player.id)
        .eq('team_id', task.team_id)
        .single();

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
          upload_url: uploadUrl || null,
          notes: notes || null,
          created_at: now,
        });

      if (insertError) {
        console.error('[completeTask Insert Error]', insertError);
        return { success: false, error: insertError.message };
      }
    }

    revalidatePath('/golf/dashboard/tasks');
    return { success: true };
  } catch (error) {
    console.error('[completeTask Error]', error);
    return formatSafeErrorResponse(error);
  }
}

// ============================================================================
// UNCOMPLETE TASK (Mark as Pending)
// ============================================================================

/**
 * Mark a completed task as pending again
 */
export async function uncompleteTask(taskId: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get player_id
    const { data: player } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!player) {
      return { success: false, error: 'Player not found' };
    }

    // Update assignment to pending
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase as any)
      .from('golf_task_assignments')
      .update({
        status: 'pending',
        completed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('task_id', taskId)
      .eq('player_id', player.id);

    if (updateError) {
      console.error('[uncompleteTask Error]', updateError);
      return { success: false, error: updateError.message };
    }

    revalidatePath('/golf/dashboard/tasks');
    return { success: true };
  } catch (error) {
    console.error('[uncompleteTask Error]', error);
    return formatSafeErrorResponse(error);
  }
}

// ============================================================================
// GET PLAYER TASKS
// ============================================================================

/**
 * Get all tasks assigned to the current player with completion status
 */
export async function getPlayerTasks(): Promise<ActionResult<TaskWithAssignment[]>> {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get player_id
    const { data: player } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!player) {
      return { success: true, data: [] };
    }

    // Fetch player's task assignments
    // Note: golf_task_assignments may not be in generated types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: assignments, error: assignmentsError } = await (supabase as any)
      .from('golf_task_assignments')
      .select('id, task_id, status, completed_at, upload_url, notes, created_at')
      .eq('player_id', player.id)
      .order('created_at', { ascending: false }) as { data: TaskAssignment[] | null; error: Error | null };

    if (assignmentsError) {
      console.error('[getPlayerTasks Error]', assignmentsError);
      return { success: false, error: 'Failed to fetch task assignments' };
    }

    if (!assignments || assignments.length === 0) {
      return { success: true, data: [] };
    }

    // Fetch task details
    const taskIds = [...new Set(assignments.map(a => a.task_id))];
    const { data: tasks, error: tasksError } = await supabase
      .from('golf_tasks')
      .select('id, title, description, due_date, priority, task_type, created_at')
      .in('id', taskIds);

    if (tasksError) {
      console.error('[getPlayerTasks Tasks Error]', tasksError);
      return { success: false, error: 'Failed to fetch task details' };
    }

    // Build task map
    const tasksMap = (tasks || []).reduce((acc, t) => {
      acc[t.id] = t;
      return acc;
    }, {} as Record<string, typeof tasks[0]>);

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
          task_type: task.task_type,
          created_at: task.created_at,
          assignment_id: assignment.id,
          assignment_status: assignment.status || 'pending',
          completed_at: assignment.completed_at,
          upload_url: assignment.upload_url,
          notes: assignment.notes,
        };
      });

    return { success: true, data: playerTasks };
  } catch (error) {
    console.error('[getPlayerTasks Error]', error);
    return formatSafeErrorResponse(error);
  }
}

// ============================================================================
// GET TASK COMPLETION STATUS
// ============================================================================

/**
 * Get the completion status for a specific task for the current player
 */
export async function getTaskCompletionStatus(
  taskId: string
): Promise<ActionResult<{ isCompleted: boolean; completedAt: string | null; notes: string | null }>> {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get player_id
    const { data: player } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!player) {
      return { success: true, data: { isCompleted: false, completedAt: null, notes: null } };
    }

    // Check assignment status
    interface AssignmentStatus {
      status: string | null;
      completed_at: string | null;
      notes: string | null;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: assignment } = await (supabase as any)
      .from('golf_task_assignments')
      .select('status, completed_at, notes')
      .eq('task_id', taskId)
      .eq('player_id', player.id)
      .maybeSingle() as { data: AssignmentStatus | null; error: Error | null };

    return {
      success: true,
      data: {
        isCompleted: assignment?.status === 'completed',
        completedAt: assignment?.completed_at || null,
        notes: assignment?.notes || null,
      },
    };
  } catch (error) {
    console.error('[getTaskCompletionStatus Error]', error);
    return formatSafeErrorResponse(error);
  }
}

// ============================================================================
// CREATE TASK (Coach only)
// ============================================================================

/**
 * Create a new task and assign to players (coach only)
 */
export async function createTask(
  teamId: string,
  title: string,
  description?: string,
  dueDate?: string,
  priority?: string,
  assignToPlayerIds?: string[]
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
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Only coaches can create tasks' };
    }

    // Verify coach has access to this team
    if (coach.organization_id) {
      const { data: team } = await supabase
        .from('golf_teams')
        .select('id')
        .eq('id', teamId)
        .eq('organization_id', coach.organization_id)
        .single();

      if (!team) {
        return { success: false, error: 'Not authorized to create tasks for this team' };
      }
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
        status: 'pending',
        assigned_by: coach.id,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (taskError || !task) {
      console.error('[createTask Error]', taskError);
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
        console.error('[createTask Assignment Error]', assignError);
        // Task was created but assignments failed - still return success with warning
      }
    }

    revalidatePath('/golf/dashboard/tasks');
    return { success: true, data: { taskId: task.id } };
  } catch (error) {
    console.error('[createTask Error]', error);
    return formatSafeErrorResponse(error);
  }
}

// ============================================================================
// DELETE TASK (Coach only)
// ============================================================================

/**
 * Delete a task (coach only)
 */
export async function deleteTask(taskId: string): Promise<ActionResult> {
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
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Only coaches can delete tasks' };
    }

    // Get task to verify ownership
    const { data: task } = await supabase
      .from('golf_tasks')
      .select('id, team_id')
      .eq('id', taskId)
      .single();

    if (!task) {
      return { success: false, error: 'Task not found' };
    }

    // Verify coach has access to this team
    if (coach.organization_id) {
      const { data: team } = await supabase
        .from('golf_teams')
        .select('id')
        .eq('id', task.team_id)
        .eq('organization_id', coach.organization_id)
        .single();

      if (!team) {
        return { success: false, error: 'Not authorized to delete this task' };
      }
    }

    // Delete task (assignments should cascade delete via FK)
    const { error: deleteError } = await supabase
      .from('golf_tasks')
      .delete()
      .eq('id', taskId);

    if (deleteError) {
      console.error('[deleteTask Error]', deleteError);
      return { success: false, error: deleteError.message };
    }

    revalidatePath('/golf/dashboard/tasks');
    return { success: true };
  } catch (error) {
    console.error('[deleteTask Error]', error);
    return formatSafeErrorResponse(error);
  }
}

// ============================================================================
// TASK REMINDERS
// ============================================================================

/**
 * Set a reminder for a task
 */
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

    // Verify user is a coach
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Only coaches can set reminders' };
    }

    // Verify task exists and belongs to coach's team
    const { data: task } = await supabase
      .from('golf_tasks')
      .select('id, team_id')
      .eq('id', taskId)
      .single();

    if (!task) {
      return { success: false, error: 'Task not found' };
    }

    if (coach.organization_id) {
      const { data: team } = await supabase
        .from('golf_teams')
        .select('id')
        .eq('id', task.team_id)
        .eq('organization_id', coach.organization_id)
        .single();

      if (!team) {
        return { success: false, error: 'Not authorized to modify this task' };
      }
    }

    // Update task with reminder
    const { error: updateError } = await supabase
      .from('golf_tasks')
      .update({
        reminder_at: reminderAt,
        reminder_sent: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId);

    if (updateError) {
      console.error('[setTaskReminder Error]', updateError);
      return { success: false, error: updateError.message };
    }

    revalidatePath('/golf/dashboard/tasks');
    return { success: true };
  } catch (error) {
    console.error('[setTaskReminder Error]', error);
    return formatSafeErrorResponse(error);
  }
}

/**
 * Clear a task reminder
 */
export async function clearTaskReminder(taskId: string): Promise<ActionResult> {
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
      return { success: false, error: 'Only coaches can clear reminders' };
    }

    // Update task to clear reminder
    const { error: updateError } = await supabase
      .from('golf_tasks')
      .update({
        reminder_at: null,
        reminder_sent: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId);

    if (updateError) {
      console.error('[clearTaskReminder Error]', updateError);
      return { success: false, error: updateError.message };
    }

    revalidatePath('/golf/dashboard/tasks');
    return { success: true };
  } catch (error) {
    console.error('[clearTaskReminder Error]', error);
    return formatSafeErrorResponse(error);
  }
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
export async function getTaskTemplates(
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
      console.error('[getTaskTemplates Error]', templatesError);
      return { success: false, error: 'Failed to fetch templates' };
    }

    return { success: true, data: templates || [] };
  } catch (error) {
    console.error('[getTaskTemplates Error]', error);
    return formatSafeErrorResponse(error);
  }
}

/**
 * Create a new task template
 */
export async function createTaskTemplate(
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

    // Verify coach has access to this team
    if (coach.organization_id) {
      const { data: team } = await supabase
        .from('golf_teams')
        .select('id')
        .eq('id', teamId)
        .eq('organization_id', coach.organization_id)
        .single();

      if (!team) {
        return { success: false, error: 'Not authorized to create templates for this team' };
      }
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
      console.error('[createTaskTemplate Error]', templateError);
      return { success: false, error: 'Failed to create template' };
    }

    return { success: true, data: { templateId: template.id } };
  } catch (error) {
    console.error('[createTaskTemplate Error]', error);
    return formatSafeErrorResponse(error);
  }
}

/**
 * Update a task template
 */
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

    // Verify user is a coach
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Only coaches can update templates' };
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
      console.error('[updateTaskTemplate Error]', updateError);
      return { success: false, error: updateError.message };
    }

    return { success: true };
  } catch (error) {
    console.error('[updateTaskTemplate Error]', error);
    return formatSafeErrorResponse(error);
  }
}

/**
 * Delete a task template
 */
export async function deleteTaskTemplate(templateId: string): Promise<ActionResult> {
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
      return { success: false, error: 'Only coaches can delete templates' };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: deleteError } = await (supabase as any)
      .from('golf_task_templates')
      .delete()
      .eq('id', templateId);

    if (deleteError) {
      console.error('[deleteTaskTemplate Error]', deleteError);
      return { success: false, error: deleteError.message };
    }

    return { success: true };
  } catch (error) {
    console.error('[deleteTaskTemplate Error]', error);
    return formatSafeErrorResponse(error);
  }
}

/**
 * Create a task from a template
 */
export async function createTaskFromTemplate(
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
      console.error('[createTaskFromTemplate Error]', templateError);
      return { success: false, error: 'Template not found' };
    }

    // Calculate due date if not provided
    let dueDate: string | null = customDueDate ?? null;
    if (!dueDate && template.default_due_days) {
      const date = new Date();
      date.setDate(date.getDate() + template.default_due_days);
      dueDate = date.toISOString().split('T')[0] ?? null;
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
      console.error('[createTaskFromTemplate Task Error]', taskError);
      return { success: false, error: 'Failed to create task' };
    }

    // Handle assignments based on assignee type
    let playerIds = assignToPlayerIds || [];

    if (playerIds.length === 0 && template.default_assignee_type === 'all_players') {
      // Get all team players
      const { data: teamMembers } = await supabase
        .from('golf_team_members')
        .select('player_id')
        .eq('team_id', teamId);

      playerIds = (teamMembers || []).map(tm => tm.player_id);
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
        console.error('[createTaskFromTemplate Assignment Error]', assignError);
        // Task was created but assignments failed - still return success with the task
      }
    }

    revalidatePath('/golf/dashboard/tasks');
    return { success: true, data: { taskId: task.id } };
  } catch (error) {
    console.error('[createTaskFromTemplate Error]', error);
    return formatSafeErrorResponse(error);
  }
}

/**
 * Seed default templates for a team (called once when feature is first used)
 */
export async function seedDefaultTemplates(teamId: string): Promise<ActionResult> {
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
      console.error('[seedDefaultTemplates Error]', insertError);
      return { success: false, error: 'Failed to seed templates' };
    }

    return { success: true };
  } catch (error) {
    console.error('[seedDefaultTemplates Error]', error);
    return formatSafeErrorResponse(error);
  }
}

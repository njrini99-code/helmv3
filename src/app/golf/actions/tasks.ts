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
export async function completeTask(
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
      await logServerError(`[completeTask Error]: ${assignmentError instanceof Error ? assignmentError.message : String(assignmentError)}`, { action: 'tasks.completeTask' });
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
        await logServerError(`[completeTask Update Error]: ${updateError instanceof Error ? updateError.message : String(updateError)}`, { action: 'tasks.completeTask' });
        return { success: false, error: updateError.message };
      }
    } else {
      // If no assignment exists but player is on the team, create one and mark complete
      // Verify player is an active member on the same team
      const { data: membership } = await supabase
        .from('golf_team_members')
        .select('id')
        .eq('player_id', player.id)
        .eq('team_id', task.team_id)
        .eq('status', 'active')
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
          notes: notes || null,
        });

      if (insertError) {
        await logServerError(`[completeTask Insert Error]: ${insertError instanceof Error ? insertError.message : String(insertError)}`, { action: 'tasks.completeTask' });
        return { success: false, error: insertError.message };
      }
    }

    revalidatePath('/golf/dashboard/tasks');
    updateTag(CACHE_TAGS.DASHBOARD);
    return { success: true };
  } catch (error) {
    await logServerError(`[completeTask Error]: ${error instanceof Error ? error.message : String(error)}`, { action: 'tasks.completeTask' });
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
      .select('id, organization_id, full_name')
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
        return { success: false, error: 'Not authorized for this team' };
      }
    } else {
      return { success: false, error: 'Coach profile is not associated with an organization' };
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
      await logServerError(`[createTask Error]: ${taskError instanceof Error ? taskError.message : String(taskError)}`, { action: 'tasks.createTask' });
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
        await logServerError(`[createTask Assignment Error]: ${assignError instanceof Error ? assignError.message : String(assignError)}`, { action: 'tasks.createTask' });
        // Task was created but assignments failed - still return success with warning
      }

      // Notify assigned players (fire-and-forget)
      try {
        const coachName = coach.full_name?.trim() || 'Your Coach';
        const formattedDue = dueDate
          ? new Date(dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
          : null;

        const { data: playerRows } = await supabase
          .from('golf_players')
          .select('user_id')
          .in('id', assignToPlayerIds);

        if (playerRows?.length) {
          const { data: userRows } = await supabase
            .from('users')
            .select('id, email')
            .in('id', playerRows.map(p => p.user_id));

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
        await logServerError(`[createTask] Notification error (non-fatal): ${notifErr instanceof Error ? notifErr.message : String(notifErr)}`, { action: 'tasks.createTask' });
      }
    }

    revalidatePath('/golf/dashboard/tasks');
    updateTag(CACHE_TAGS.DASHBOARD);
    return { success: true, data: { taskId: task.id } };
  } catch (error) {
    await logServerError(`[createTask Error]: ${error instanceof Error ? error.message : String(error)}`, { action: 'tasks.createTask' });
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
        return { success: false, error: 'Not authorized for this team' };
      }
    } else {
      return { success: false, error: 'Coach profile is not associated with an organization' };
    }

    // Delete task (assignments should cascade delete via FK)
    const { error: deleteError } = await supabase
      .from('golf_tasks')
      .delete()
      .eq('id', taskId);

    if (deleteError) {
      await logServerError(`[deleteTask Error]: ${deleteError instanceof Error ? deleteError.message : String(deleteError)}`, { action: 'tasks.deleteTask' });
      return { success: false, error: deleteError.message };
    }

    revalidatePath('/golf/dashboard/tasks');
    updateTag(CACHE_TAGS.DASHBOARD);
    return { success: true };
  } catch (error) {
    await logServerError(`[deleteTask Error]: ${error instanceof Error ? error.message : String(error)}`, { action: 'tasks.deleteTask' });
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
        return { success: false, error: 'Not authorized for this team' };
      }
    } else {
      return { success: false, error: 'Coach profile is not associated with an organization' };
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
      await logServerError(`[setTaskReminder Error]: ${updateError instanceof Error ? updateError.message : String(updateError)}`, { action: 'tasks.setTaskReminder' });
      return { success: false, error: updateError.message };
    }

    revalidatePath('/golf/dashboard/tasks');
    return { success: true };
  } catch (error) {
    await logServerError(`[setTaskReminder Error]: ${error instanceof Error ? error.message : String(error)}`, { action: 'tasks.setTaskReminder' });
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
        return { success: false, error: 'Not authorized for this team' };
      }
    } else {
      return { success: false, error: 'Coach profile is not associated with an organization' };
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
      await logServerError(`[clearTaskReminder Error]: ${updateError instanceof Error ? updateError.message : String(updateError)}`, { action: 'tasks.clearTaskReminder' });
      return { success: false, error: updateError.message };
    }

    revalidatePath('/golf/dashboard/tasks');
    return { success: true };
  } catch (error) {
    await logServerError(`[clearTaskReminder Error]: ${error instanceof Error ? error.message : String(error)}`, { action: 'tasks.clearTaskReminder' });
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
      await logServerError(`[getTaskTemplates Error]: ${templatesError instanceof Error ? templatesError.message : String(templatesError)}`, { action: 'tasks.getTaskTemplates' });
      return { success: false, error: 'Failed to fetch templates' };
    }

    return { success: true, data: templates || [] };
  } catch (error) {
    await logServerError(`[getTaskTemplates Error]: ${error instanceof Error ? error.message : String(error)}`, { action: 'tasks.getTaskTemplates' });
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
        return { success: false, error: 'Not authorized for this team' };
      }
    } else {
      return { success: false, error: 'Coach profile is not associated with an organization' };
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
      await logServerError(`[createTaskTemplate Error]: ${templateError instanceof Error ? templateError.message : String(templateError)}`, { action: 'tasks.createTaskTemplate' });
      return { success: false, error: 'Failed to create template' };
    }

    return { success: true, data: { templateId: template.id } };
  } catch (error) {
    await logServerError(`[createTaskTemplate Error]: ${error instanceof Error ? error.message : String(error)}`, { action: 'tasks.createTaskTemplate' });
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

    if (coach.organization_id) {
      const { data: team } = await supabase
        .from('golf_teams')
        .select('id')
        .eq('id', template.team_id)
        .eq('organization_id', coach.organization_id)
        .single();

      if (!team) {
        return { success: false, error: 'Not authorized for this team' };
      }
    } else {
      return { success: false, error: 'Coach profile is not associated with an organization' };
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
      await logServerError(`[updateTaskTemplate Error]: ${updateError instanceof Error ? updateError.message : String(updateError)}`, { action: 'tasks.updateTaskTemplate' });
      return { success: false, error: updateError.message };
    }

    return { success: true };
  } catch (error) {
    await logServerError(`[updateTaskTemplate Error]: ${error instanceof Error ? error.message : String(error)}`, { action: 'tasks.updateTaskTemplate' });
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

    if (coach.organization_id) {
      const { data: team } = await supabase
        .from('golf_teams')
        .select('id')
        .eq('id', template.team_id)
        .eq('organization_id', coach.organization_id)
        .single();

      if (!team) {
        return { success: false, error: 'Not authorized for this team' };
      }
    } else {
      return { success: false, error: 'Coach profile is not associated with an organization' };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: deleteError } = await (supabase as any)
      .from('golf_task_templates')
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
      await logServerError(`[createTaskFromTemplate Error]: ${templateError instanceof Error ? templateError.message : String(templateError)}`, { action: 'tasks.createTaskFromTemplate' });
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
      await logServerError(`[createTaskFromTemplate Task Error]: ${taskError instanceof Error ? taskError.message : String(taskError)}`, { action: 'tasks.createTaskFromTemplate' });
      return { success: false, error: 'Failed to create task' };
    }

    // Handle assignments based on assignee type
    let playerIds = assignToPlayerIds || [];

    if (playerIds.length === 0 && template.default_assignee_type === 'all_players') {
      // Get all active team players
      const { data: teamMembers } = await supabase
        .from('golf_team_members')
        .select('player_id')
        .eq('team_id', teamId)
        .eq('status', 'active');

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
        await logServerError(`[createTaskFromTemplate Assignment Error]: ${assignError instanceof Error ? assignError.message : String(assignError)}`, { action: 'tasks.createTaskFromTemplate' });
        // Task was created but assignments failed - still return success with the task
      }
    }

    revalidatePath('/golf/dashboard/tasks');
    updateTag(CACHE_TAGS.DASHBOARD);
    return { success: true, data: { taskId: task.id } };
  } catch (error) {
    await logServerError(`[createTaskFromTemplate Error]: ${error instanceof Error ? error.message : String(error)}`, { action: 'tasks.createTaskFromTemplate' });
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
      await logServerError(`[seedDefaultTemplates Error]: ${insertError instanceof Error ? insertError.message : String(insertError)}`, { action: 'tasks.seedDefaultTemplates' });
      return { success: false, error: 'Failed to seed templates' };
    }

    revalidatePath('/golf/dashboard/tasks');
    revalidatePath('/golf/dashboard/tasks/templates');
    return { success: true };
  } catch (error) {
    await logServerError(`[seedDefaultTemplates Error]: ${error instanceof Error ? error.message : String(error)}`, { action: 'tasks.seedDefaultTemplates' });
    return formatSafeErrorResponse(error);
  }
}

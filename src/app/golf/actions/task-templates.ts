'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type {
  TaskTemplate,
  CreateTemplateData,
  UpdateTemplateData,
  CreateTaskFromTemplate,
  GolfTask,
  DEFAULT_TEMPLATES,
} from '@/lib/types/golf';
import { calculateReminderTime } from './task-reminders';

/**
 * Create a new task template
 */
export async function createTemplate(
  data: CreateTemplateData
): Promise<{ data: TaskTemplate | null; error?: string }> {
  try {
    const supabase = await createClient();

    // Verify user has access to the team
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { data: null, error: 'Not authenticated' };
    }

    const { data: membership } = await supabase
      .from('golf_team_members')
      .select('role')
      .eq('team_id', data.team_id)
      .eq('user_id', user.id)
      .single();

    if (!membership || !['coach', 'admin'].includes(membership.role)) {
      return { data: null, error: 'Unauthorized to create templates' };
    }

    // Create the template
    const { data: template, error } = await supabase
      .from('golf_task_templates')
      .insert({
        team_id: data.team_id,
        name: data.name,
        description: data.description,
        title: data.title,
        task_description: data.task_description,
        default_assignee_type: data.default_assignee_type || 'all',
        default_priority: data.default_priority || 'medium',
        default_due_offset_days: data.default_due_offset_days,
        default_reminder_offset_hours: data.default_reminder_offset_hours,
        is_recurring: data.is_recurring || false,
        recurrence_pattern: data.recurrence_pattern,
        recurrence_day_of_week: data.recurrence_day_of_week,
        recurrence_day_of_month: data.recurrence_day_of_month,
        category: data.category,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating template:', error);
      return { data: null, error: 'Failed to create template' };
    }

    revalidatePath('/golf/dashboard/tasks');
    return { data: template as TaskTemplate };
  } catch (error) {
    console.error('Error in createTemplate:', error);
    return { data: null, error: 'An unexpected error occurred' };
  }
}

/**
 * Update an existing task template
 */
export async function updateTemplate(
  id: string,
  data: UpdateTemplateData
): Promise<{ data: TaskTemplate | null; error?: string }> {
  try {
    const supabase = await createClient();

    // Verify the template exists and user has access
    const { data: existingTemplate, error: fetchError } = await supabase
      .from('golf_task_templates')
      .select('*, team:golf_teams(id)')
      .eq('id', id)
      .single();

    if (fetchError || !existingTemplate) {
      return { data: null, error: 'Template not found' };
    }

    // Update the template
    const { data: template, error } = await supabase
      .from('golf_task_templates')
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating template:', error);
      return { data: null, error: 'Failed to update template' };
    }

    revalidatePath('/golf/dashboard/tasks');
    return { data: template as TaskTemplate };
  } catch (error) {
    console.error('Error in updateTemplate:', error);
    return { data: null, error: 'An unexpected error occurred' };
  }
}

/**
 * Delete a task template (soft delete by setting is_active to false)
 */
export async function deleteTemplate(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    const { error } = await supabase
      .from('golf_task_templates')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      console.error('Error deleting template:', error);
      return { success: false, error: 'Failed to delete template' };
    }

    revalidatePath('/golf/dashboard/tasks');
    return { success: true };
  } catch (error) {
    console.error('Error in deleteTemplate:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Hard delete a task template (permanent)
 */
export async function permanentlyDeleteTemplate(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    const { error } = await supabase
      .from('golf_task_templates')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error permanently deleting template:', error);
      return { success: false, error: 'Failed to delete template' };
    }

    revalidatePath('/golf/dashboard/tasks');
    return { success: true };
  } catch (error) {
    console.error('Error in permanentlyDeleteTemplate:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Get all templates for a team
 */
export async function getTeamTemplates(
  teamId: string,
  includeInactive: boolean = false
): Promise<{ data: TaskTemplate[] | null; error?: string }> {
  try {
    const supabase = await createClient();

    let query = supabase
      .from('golf_task_templates')
      .select('*')
      .eq('team_id', teamId)
      .order('name', { ascending: true });

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data: templates, error } = await query;

    if (error) {
      console.error('Error fetching templates:', error);
      return { data: null, error: 'Failed to fetch templates' };
    }

    return { data: templates as TaskTemplate[] };
  } catch (error) {
    console.error('Error in getTeamTemplates:', error);
    return { data: null, error: 'An unexpected error occurred' };
  }
}

/**
 * Get a single template by ID
 */
export async function getTemplate(
  id: string
): Promise<{ data: TaskTemplate | null; error?: string }> {
  try {
    const supabase = await createClient();

    const { data: template, error } = await supabase
      .from('golf_task_templates')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching template:', error);
      return { data: null, error: 'Template not found' };
    }

    return { data: template as TaskTemplate };
  } catch (error) {
    console.error('Error in getTemplate:', error);
    return { data: null, error: 'An unexpected error occurred' };
  }
}

/**
 * Create a task from a template
 */
export async function createTaskFromTemplate(
  data: CreateTaskFromTemplate
): Promise<{ data: GolfTask[] | null; error?: string }> {
  try {
    const supabase = await createClient();

    // Get the template
    const { data: template, error: templateError } = await supabase
      .from('golf_task_templates')
      .select('*')
      .eq('id', data.template_id)
      .single();

    if (templateError || !template) {
      return { data: null, error: 'Template not found' };
    }

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { data: null, error: 'Not authenticated' };
    }

    // Calculate due date based on template offset
    let dueDate = data.due_date;
    if (!dueDate && template.default_due_offset_days) {
      const due = new Date();
      due.setDate(due.getDate() + template.default_due_offset_days);
      dueDate = due.toISOString();
    }

    // Calculate reminder time based on template offset
    let reminderAt: string | null = null;
    if (dueDate && template.default_reminder_offset_hours) {
      reminderAt = calculateReminderTime(
        dueDate,
        template.default_reminder_offset_hours
      );
    }

    // Determine assignees
    let assigneeIds: string[] = [];
    if (data.assignee_ids && data.assignee_ids.length > 0) {
      assigneeIds = data.assignee_ids;
    } else if (template.default_assignee_type === 'all') {
      // Get all players in the team
      const { data: members } = await supabase
        .from('golf_team_members')
        .select('user_id')
        .eq('team_id', template.team_id)
        .eq('role', 'player');

      assigneeIds = members?.map((m) => m.user_id) || [];
    }

    // If no specific assignees, create one unassigned task
    if (assigneeIds.length === 0) {
      assigneeIds = ['']; // Empty string will create one task with no assignee
    }

    // Create tasks for each assignee
    const tasksToCreate = assigneeIds.map((assigneeId) => ({
      team_id: template.team_id,
      title: data.custom_title || template.title,
      description: data.custom_description || template.task_description,
      priority: template.default_priority,
      status: 'pending' as const,
      due_date: dueDate,
      assigned_to: assigneeId || null,
      created_by: user.id,
      reminder_at: reminderAt,
      reminder_type: reminderAt ? 'in_app' : null,
      reminder_sent: false,
    }));

    const { data: tasks, error: createError } = await supabase
      .from('golf_tasks')
      .insert(tasksToCreate)
      .select();

    if (createError) {
      console.error('Error creating tasks from template:', createError);
      return { data: null, error: 'Failed to create tasks' };
    }

    revalidatePath('/golf/dashboard/tasks');
    return { data: tasks as GolfTask[] };
  } catch (error) {
    console.error('Error in createTaskFromTemplate:', error);
    return { data: null, error: 'An unexpected error occurred' };
  }
}

/**
 * Duplicate a template
 */
export async function duplicateTemplate(
  id: string
): Promise<{ data: TaskTemplate | null; error?: string }> {
  try {
    const supabase = await createClient();

    // Get the original template
    const { data: original, error: fetchError } = await supabase
      .from('golf_task_templates')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !original) {
      return { data: null, error: 'Template not found' };
    }

    // Create a copy with updated name
    const { data: duplicate, error: createError } = await supabase
      .from('golf_task_templates')
      .insert({
        team_id: original.team_id,
        name: `${original.name} (Copy)`,
        description: original.description,
        title: original.title,
        task_description: original.task_description,
        default_assignee_type: original.default_assignee_type,
        default_priority: original.default_priority,
        default_due_offset_days: original.default_due_offset_days,
        default_reminder_offset_hours: original.default_reminder_offset_hours,
        is_recurring: original.is_recurring,
        recurrence_pattern: original.recurrence_pattern,
        recurrence_day_of_week: original.recurrence_day_of_week,
        recurrence_day_of_month: original.recurrence_day_of_month,
        category: original.category,
        is_active: true,
      })
      .select()
      .single();

    if (createError) {
      console.error('Error duplicating template:', createError);
      return { data: null, error: 'Failed to duplicate template' };
    }

    revalidatePath('/golf/dashboard/tasks');
    return { data: duplicate as TaskTemplate };
  } catch (error) {
    console.error('Error in duplicateTemplate:', error);
    return { data: null, error: 'An unexpected error occurred' };
  }
}

/**
 * Seed default templates for a team
 * Call this when a team first accesses templates
 */
export async function seedDefaultTemplates(
  teamId: string,
  templates: Omit<CreateTemplateData, 'team_id'>[]
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const supabase = await createClient();

    // Check if team already has templates
    const { count: existingCount } = await supabase
      .from('golf_task_templates')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', teamId);

    if (existingCount && existingCount > 0) {
      return { success: true, count: 0 }; // Already has templates
    }

    // Create default templates
    const templatesToCreate = templates.map((t) => ({
      team_id: teamId,
      ...t,
      is_active: true,
    }));

    const { data, error } = await supabase
      .from('golf_task_templates')
      .insert(templatesToCreate)
      .select();

    if (error) {
      console.error('Error seeding templates:', error);
      return { success: false, count: 0, error: 'Failed to seed templates' };
    }

    revalidatePath('/golf/dashboard/tasks');
    return { success: true, count: data?.length || 0 };
  } catch (error) {
    console.error('Error in seedDefaultTemplates:', error);
    return { success: false, count: 0, error: 'An unexpected error occurred' };
  }
}

/**
 * Get templates by category
 */
export async function getTemplatesByCategory(
  teamId: string,
  category: string
): Promise<{ data: TaskTemplate[] | null; error?: string }> {
  try {
    const supabase = await createClient();

    const { data: templates, error } = await supabase
      .from('golf_task_templates')
      .select('*')
      .eq('team_id', teamId)
      .eq('category', category)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching templates by category:', error);
      return { data: null, error: 'Failed to fetch templates' };
    }

    return { data: templates as TaskTemplate[] };
  } catch (error) {
    console.error('Error in getTemplatesByCategory:', error);
    return { data: null, error: 'An unexpected error occurred' };
  }
}

/**
 * Search templates
 */
export async function searchTemplates(
  teamId: string,
  query: string
): Promise<{ data: TaskTemplate[] | null; error?: string }> {
  try {
    const supabase = await createClient();

    const { data: templates, error } = await supabase
      .from('golf_task_templates')
      .select('*')
      .eq('team_id', teamId)
      .eq('is_active', true)
      .or(`name.ilike.%${query}%,title.ilike.%${query}%,description.ilike.%${query}%`)
      .order('name', { ascending: true })
      .limit(10);

    if (error) {
      console.error('Error searching templates:', error);
      return { data: null, error: 'Failed to search templates' };
    }

    return { data: templates as TaskTemplate[] };
  } catch (error) {
    console.error('Error in searchTemplates:', error);
    return { data: null, error: 'An unexpected error occurred' };
  }
}

/**
 * Get recurring templates that are due to be processed
 */
export async function getRecurringTemplatesDue(): Promise<{
  data: TaskTemplate[] | null;
  error?: string;
}> {
  try {
    const supabase = await createClient();

    const now = new Date();
    const dayOfWeek = now.getDay();
    const dayOfMonth = now.getDate();

    // Get templates that match today's recurrence pattern
    const { data: templates, error } = await supabase
      .from('golf_task_templates')
      .select('*')
      .eq('is_active', true)
      .eq('is_recurring', true)
      .or(
        `recurrence_pattern.eq.daily,` +
          `and(recurrence_pattern.eq.weekly,recurrence_day_of_week.eq.${dayOfWeek}),` +
          `and(recurrence_pattern.eq.monthly,recurrence_day_of_month.eq.${dayOfMonth})`
      );

    if (error) {
      console.error('Error fetching recurring templates:', error);
      return { data: null, error: 'Failed to fetch recurring templates' };
    }

    return { data: templates as TaskTemplate[] };
  } catch (error) {
    console.error('Error in getRecurringTemplatesDue:', error);
    return { data: null, error: 'An unexpected error occurred' };
  }
}

/**
 * Process recurring templates and create tasks
 * Called by cron/edge function
 */
export async function processRecurringTemplates(): Promise<{
  created: number;
  failed: number;
  errors: string[];
}> {
  const results = {
    created: 0,
    failed: 0,
    errors: [] as string[],
  };

  try {
    const { data: templates, error } = await getRecurringTemplatesDue();

    if (error || !templates) {
      results.errors.push(error || 'Failed to fetch recurring templates');
      return results;
    }

    for (const template of templates) {
      try {
        const { data: tasks, error: createError } = await createTaskFromTemplate({
          template_id: template.id,
        });

        if (createError) {
          results.failed++;
          results.errors.push(`Template ${template.id}: ${createError}`);
        } else {
          results.created += tasks?.length || 0;
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        results.failed++;
        results.errors.push(`Template ${template.id}: ${errorMessage}`);
      }
    }

    return results;
  } catch (error) {
    console.error('Error in processRecurringTemplates:', error);
    results.errors.push('Failed to process recurring templates');
    return results;
  }
}

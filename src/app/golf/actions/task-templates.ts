'use server';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { revalidatePath } from 'next/cache';
import type {
  TaskTemplate,
  CreateTemplateData,
  UpdateTemplateData,
  CreateTaskFromTemplate,
  GolfTask,
} from '@/lib/types/golf';
import { logServerError } from '@/lib/server-error-logger';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { describeError } from '@/lib/utils/describe-error';

// Database record type for golf_task_templates (not in generated types)
interface DbTaskTemplate {
  id: string;
  team_id: string;
  title: string;
  description: string | null;
  category: string | null;
  default_priority: string | null;
  default_due_days: number | null;
  default_assignee_type: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

// Helper to map database record to TaskTemplate interface
function mapDbToTaskTemplate(record: DbTaskTemplate): TaskTemplate {
  return {
    id: record.id,
    team_id: record.team_id,
    name: record.title,
    description: record.description ?? undefined,
    category: record.category as TaskTemplate['category'],
    default_priority: (record.default_priority ?? 'normal') as TaskTemplate['default_priority'],
    default_due_days: record.default_due_days ?? undefined,
    is_active: true,
    created_by: record.created_by ?? '',
    created_at: record.created_at ?? undefined,
    updated_at: record.updated_at ?? undefined,
  };
}

/**
 * Create a new task template
 */
async function createTemplateImpl(
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

    // Verify user is a coach with access to this team
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { data: null, error: 'Unauthorized to create templates' };
    }

    // Verify coach has access to this team via organization
    if (coach.organization_id) {
      const { data: team } = await supabase
        .from('golf_teams')
        .select('id')
        .eq('id', data.team_id)
        .eq('organization_id', coach.organization_id)
        .single();

      if (!team) {
        return { data: null, error: 'Not authorized to create templates for this team' };
      }
    }

    // Create the template - using only columns that exist in database
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: template, error } = await (supabase as any)
      .from('golf_task_templates')
      .insert({
        team_id: data.team_id,
        title: data.name,
        description: data.description,
        default_assignee_type: 'all_players',
        default_priority: data.default_priority || 'normal',
        default_due_days: data.default_due_days,
        category: data.category,
        created_by: data.created_by,
      })
      .select()
      .single() as { data: DbTaskTemplate | null; error: Error | null };

    if (error || !template) {
      await logServerError(`Error creating template: ${describeError(error)}`, { action: 'task_templates.createTemplate' });
      return { data: null, error: 'Failed to create template' };
    }

    revalidatePath('/golf/dashboard/tasks');
    return { data: mapDbToTaskTemplate(template) };
  } catch (error) {
    await logServerError(`Error in createTemplate: ${describeError(error)}`, { action: 'task_templates.createTemplate' });
    return { data: null, error: 'An unexpected error occurred' };
  }
}

const observedCreateTemplate = withAdminObserved(
  'createTemplate',
  { sport: 'golf', feature: 'task_management' },
  createTemplateImpl,
);

export async function createTemplate(
  data: CreateTemplateData
): Promise<{ data: TaskTemplate | null; error?: string }> {
  return observedCreateTemplate(data);
}

/**
 * Update an existing task template
 */
async function updateTemplateImpl(
  id: string,
  data: UpdateTemplateData
): Promise<{ data: TaskTemplate | null; error?: string }> {
  try {
    const supabase = await createClient();

    // Verify the template exists
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingTemplate, error: fetchError } = await (supabase as any)
      .from('golf_task_templates')
      .select('*')
      .eq('id', id)
      .single() as { data: DbTaskTemplate | null; error: Error | null };

    if (fetchError || !existingTemplate) {
      return { data: null, error: 'Template not found' };
    }

    // Build update object with only valid database columns
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (data.name !== undefined) updateData.title = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.default_priority !== undefined) updateData.default_priority = data.default_priority;
    if (data.default_due_days !== undefined) updateData.default_due_days = data.default_due_days;

    // Update the template
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: template, error } = await (supabase as any)
      .from('golf_task_templates')
      .update(updateData)
      .eq('id', id)
      .select()
      .single() as { data: DbTaskTemplate | null; error: Error | null };

    if (error || !template) {
      await logServerError(`Error updating template: ${describeError(error)}`, { action: 'task_templates.updateTemplate' });
      return { data: null, error: 'Failed to update template' };
    }

    revalidatePath('/golf/dashboard/tasks');
    return { data: mapDbToTaskTemplate(template) };
  } catch (error) {
    await logServerError(`Error in updateTemplate: ${describeError(error)}`, { action: 'task_templates.updateTemplate' });
    return { data: null, error: 'An unexpected error occurred' };
  }
}

const observedUpdateTemplate = withAdminObserved(
  'updateTemplate',
  { sport: 'golf', feature: 'task_management' },
  updateTemplateImpl,
);

export async function updateTemplate(
  id: string,
  data: UpdateTemplateData
): Promise<{ data: TaskTemplate | null; error?: string }> {
  return observedUpdateTemplate(id, data);
}

/**
 * Delete a task template (hard delete since is_active doesn't exist in DB)
 */
async function deleteTemplateImpl(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    // Hard delete since soft-delete column doesn't exist
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('golf_task_templates')
      .delete()
      .eq('id', id);

    if (error) {
      await logServerError(`Error deleting template: ${describeError(error)}`, { action: 'task_templates.deleteTemplate' });
      return { success: false, error: 'Failed to delete template' };
    }

    revalidatePath('/golf/dashboard/tasks');
    return { success: true };
  } catch (error) {
    await logServerError(`Error in deleteTemplate: ${describeError(error)}`, { action: 'task_templates.deleteTemplate' });
    return { success: false, error: 'An unexpected error occurred' };
  }
}

const observedDeleteTemplate = withAdminObserved(
  'deleteTemplate',
  { sport: 'golf', feature: 'task_management' },
  deleteTemplateImpl,
);

export async function deleteTemplate(
  id: string
): Promise<{ success: boolean; error?: string }> {
  return observedDeleteTemplate(id);
}

/**
 * Hard delete a task template (permanent)
 * Note: This is the same as deleteTemplate since soft-delete doesn't exist
 */
async function permanentlyDeleteTemplateImpl(
  id: string
): Promise<{ success: boolean; error?: string }> {
  return deleteTemplate(id);
}

const observedPermanentlyDeleteTemplate = withAdminObserved(
  'permanentlyDeleteTemplate',
  { sport: 'golf', feature: 'task_management' },
  permanentlyDeleteTemplateImpl,
);

export async function permanentlyDeleteTemplate(
  id: string
): Promise<{ success: boolean; error?: string }> {
  return observedPermanentlyDeleteTemplate(id);
}

/**
 * Get all templates for a team
 */
async function getTeamTemplatesImpl(
  teamId: string,
   
  _includeInactive: boolean = false // param kept for API compat but unused (no is_active column)
): Promise<{ data: TaskTemplate[] | null; error?: string }> {
  try {
    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: templates, error } = await (supabase as any)
      .from('golf_task_templates')
      .select('*')
      .eq('team_id', teamId)
      .order('title', { ascending: true }) as { data: DbTaskTemplate[] | null; error: Error | null };

    if (error) {
      await logServerError(`Error fetching templates: ${describeError(error)}`, { action: 'task_templates.getTeamTemplates' });
      return { data: null, error: 'Failed to fetch templates' };
    }

    return { data: templates?.map(mapDbToTaskTemplate) ?? [] };
  } catch (error) {
    await logServerError(`Error in getTeamTemplates: ${describeError(error)}`, { action: 'task_templates.getTeamTemplates' });
    return { data: null, error: 'An unexpected error occurred' };
  }
}

const observedGetTeamTemplates = withAdminObserved(
  'getTeamTemplates',
  { sport: 'golf', feature: 'task_management' },
  getTeamTemplatesImpl,
);

export async function getTeamTemplates(
  teamId: string,
   
  _includeInactive: boolean = false // param kept for API compat but unused (no is_active column)
): Promise<{ data: TaskTemplate[] | null; error?: string }> {
  return observedGetTeamTemplates(teamId, _includeInactive);
}

/**
 * Get a single template by ID
 */
async function getTemplateImpl(
  id: string
): Promise<{ data: TaskTemplate | null; error?: string }> {
  try {
    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: template, error } = await (supabase as any)
      .from('golf_task_templates')
      .select('*')
      .eq('id', id)
      .single() as { data: DbTaskTemplate | null; error: Error | null };

    if (error || !template) {
      await logServerError(`Error fetching template: ${describeError(error)}`, { action: 'task_templates.getTemplate' });
      return { data: null, error: 'Template not found' };
    }

    return { data: mapDbToTaskTemplate(template) };
  } catch (error) {
    await logServerError(`Error in getTemplate: ${describeError(error)}`, { action: 'task_templates.getTemplate' });
    return { data: null, error: 'An unexpected error occurred' };
  }
}

const observedGetTemplate = withAdminObserved(
  'getTemplate',
  { sport: 'golf', feature: 'task_management' },
  getTemplateImpl,
);

export async function getTemplate(
  id: string
): Promise<{ data: TaskTemplate | null; error?: string }> {
  return observedGetTemplate(id);
}

/**
 * Create a task from a template
 */
async function createTaskFromTemplateImpl(
  data: CreateTaskFromTemplate
): Promise<{ data: GolfTask[] | null; error?: string }> {
  try {
    const supabase = await createClient();

    // Get the template
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: template, error: templateError } = await (supabase as any)
      .from('golf_task_templates')
      .select('*')
      .eq('id', data.template_id)
      .single() as { data: DbTaskTemplate | null; error: Error | null };

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

    // Calculate due date based on template's default_due_days
    let dueDate = data.due_date;
    if (!dueDate && template.default_due_days) {
      const due = new Date();
      due.setDate(due.getDate() + template.default_due_days);
      dueDate = due.toISOString();
    }

    // Determine assignees from data.assigned_to array
    let assigneeIds: string[] = [];
    if (data.assigned_to && data.assigned_to.length > 0) {
      assigneeIds = data.assigned_to;
    } else if (template.default_assignee_type === 'all_players') {
      // Get all players in the team - use player_id not user_id
      const { data: members } = await supabase
        .from('golf_team_members')
        .select('player_id')
        .eq('team_id', data.team_id);

      assigneeIds = members?.map((m) => m.player_id) || [];
    }

    // If no specific assignees, create one unassigned task
    if (assigneeIds.length === 0) {
      assigneeIds = ['']; // Empty string will create one task with no assignee
    }

    // Create tasks for each assignee
    const tasksToCreate = assigneeIds.map((assigneeId) => ({
      team_id: data.team_id,
      title: data.custom_title || template.title,
      description: data.custom_description || template.description,
      priority: template.default_priority || 'normal',
      status: 'pending' as const,
      due_date: dueDate,
      assigned_to: assigneeId || null,
      created_by: user.id,
    }));

    const { data: tasks, error: createError } = await fromUntyped(supabase, 'golf_tasks')
      .insert(tasksToCreate)
      .select();

    if (createError) {
      await logServerError(`Error creating tasks from template: ${describeError(createError)}`, { action: 'task_templates.createTaskFromTemplate' });
      return { data: null, error: 'Failed to create tasks' };
    }

    revalidatePath('/golf/dashboard/tasks');
    return { data: tasks as GolfTask[] };
  } catch (error) {
    await logServerError(`Error in createTaskFromTemplate: ${describeError(error)}`, { action: 'task_templates.createTaskFromTemplate' });
    return { data: null, error: 'An unexpected error occurred' };
  }
}

const observedCreateTaskFromTemplate = withAdminObserved(
  'createTaskFromTemplate',
  { sport: 'golf', feature: 'task_management' },
  createTaskFromTemplateImpl,
);

export async function createTaskFromTemplate(
  data: CreateTaskFromTemplate
): Promise<{ data: GolfTask[] | null; error?: string }> {
  return observedCreateTaskFromTemplate(data);
}

/**
 * Duplicate a template
 */
async function duplicateTemplateImpl(
  id: string
): Promise<{ data: TaskTemplate | null; error?: string }> {
  try {
    const supabase = await createClient();

    // Get the original template
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: original, error: fetchError } = await (supabase as any)
      .from('golf_task_templates')
      .select('*')
      .eq('id', id)
      .single() as { data: DbTaskTemplate | null; error: Error | null };

    if (fetchError || !original) {
      return { data: null, error: 'Template not found' };
    }

    // Create a copy with updated title - only using valid database columns
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: duplicate, error: createError } = await (supabase as any)
      .from('golf_task_templates')
      .insert({
        team_id: original.team_id,
        title: `${original.title} (Copy)`,
        description: original.description,
        default_assignee_type: original.default_assignee_type,
        default_priority: original.default_priority,
        default_due_days: original.default_due_days,
        category: original.category,
        created_by: original.created_by,
      })
      .select()
      .single() as { data: DbTaskTemplate | null; error: Error | null };

    if (createError || !duplicate) {
      await logServerError(`Error duplicating template: ${describeError(createError)}`, { action: 'task_templates.duplicateTemplate' });
      return { data: null, error: 'Failed to duplicate template' };
    }

    revalidatePath('/golf/dashboard/tasks');
    return { data: mapDbToTaskTemplate(duplicate) };
  } catch (error) {
    await logServerError(`Error in duplicateTemplate: ${describeError(error)}`, { action: 'task_templates.duplicateTemplate' });
    return { data: null, error: 'An unexpected error occurred' };
  }
}

const observedDuplicateTemplate = withAdminObserved(
  'duplicateTemplate',
  { sport: 'golf', feature: 'task_management' },
  duplicateTemplateImpl,
);

export async function duplicateTemplate(
  id: string
): Promise<{ data: TaskTemplate | null; error?: string }> {
  return observedDuplicateTemplate(id);
}

/**
 * Seed default templates for a team
 * Call this when a team first accesses templates
 */
async function seedDefaultTemplatesImpl(
  teamId: string,
  templates: Omit<CreateTemplateData, 'team_id'>[]
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const supabase = await createClient();

    // Check if team already has templates
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: existingCount } = await (supabase as any)
      .from('golf_task_templates')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', teamId);

    if (existingCount && existingCount > 0) {
      return { success: true, count: 0 }; // Already has templates
    }

    // Create default templates - map to valid database columns
    const templatesToCreate = templates.map((t) => ({
      team_id: teamId,
      title: t.name,
      description: t.description,
      category: t.category,
      default_priority: t.default_priority || 'normal',
      default_due_days: t.default_due_days,
      created_by: t.created_by,
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('golf_task_templates')
      .insert(templatesToCreate)
      .select() as { data: DbTaskTemplate[] | null; error: Error | null };

    if (error) {
      await logServerError(`Error seeding templates: ${describeError(error)}`, { action: 'task_templates.seedDefaultTemplates' });
      return { success: false, count: 0, error: 'Failed to seed templates' };
    }

    revalidatePath('/golf/dashboard/tasks');
    return { success: true, count: data?.length || 0 };
  } catch (error) {
    await logServerError(`Error in seedDefaultTemplates: ${describeError(error)}`, { action: 'task_templates.seedDefaultTemplates' });
    return { success: false, count: 0, error: 'An unexpected error occurred' };
  }
}

const observedSeedDefaultTemplates = withAdminObserved(
  'seedDefaultTemplates',
  { sport: 'golf', feature: 'task_management' },
  seedDefaultTemplatesImpl,
);

export async function seedDefaultTemplates(
  teamId: string,
  templates: Omit<CreateTemplateData, 'team_id'>[]
): Promise<{ success: boolean; count: number; error?: string }> {
  return observedSeedDefaultTemplates(teamId, templates);
}

/**
 * Get templates by category
 */
async function getTemplatesByCategoryImpl(
  teamId: string,
  category: string
): Promise<{ data: TaskTemplate[] | null; error?: string }> {
  try {
    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: templates, error } = await (supabase as any)
      .from('golf_task_templates')
      .select('*')
      .eq('team_id', teamId)
      .eq('category', category)
      .order('title', { ascending: true }) as { data: DbTaskTemplate[] | null; error: Error | null };

    if (error) {
      await logServerError(`Error fetching templates by category: ${describeError(error)}`, { action: 'task_templates.getTemplatesByCategory' });
      return { data: null, error: 'Failed to fetch templates' };
    }

    return { data: templates?.map(mapDbToTaskTemplate) ?? [] };
  } catch (error) {
    await logServerError(`Error in getTemplatesByCategory: ${describeError(error)}`, { action: 'task_templates.getTemplatesByCategory' });
    return { data: null, error: 'An unexpected error occurred' };
  }
}

const observedGetTemplatesByCategory = withAdminObserved(
  'getTemplatesByCategory',
  { sport: 'golf', feature: 'task_management' },
  getTemplatesByCategoryImpl,
);

export async function getTemplatesByCategory(
  teamId: string,
  category: string
): Promise<{ data: TaskTemplate[] | null; error?: string }> {
  return observedGetTemplatesByCategory(teamId, category);
}

/**
 * Search templates
 */
async function searchTemplatesImpl(
  teamId: string,
  query: string
): Promise<{ data: TaskTemplate[] | null; error?: string }> {
  try {
    const supabase = await createClient();

    // DS: query was interpolated into the PostgREST .or() filter unsanitized —
    // commas/parens/colons/braces are or() metacharacters and could restructure
    // the OR-group's logic tree. Strip them before interpolating (same
    // sanitizer as insight-management.ts searchInsights).
    const q = query.trim().replace(/[,()\\:{}%]/g, '');
    if (!q) {
      return { data: [] };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: templates, error } = await (supabase as any)
      .from('golf_task_templates')
      .select('*')
      .eq('team_id', teamId)
      .or(`title.ilike.%${q}%,description.ilike.%${q}%`)
      .order('title', { ascending: true })
      .limit(10) as { data: DbTaskTemplate[] | null; error: Error | null };

    if (error) {
      await logServerError(`Error searching templates: ${describeError(error)}`, { action: 'task_templates.searchTemplates' });
      return { data: null, error: 'Failed to search templates' };
    }

    return { data: templates?.map(mapDbToTaskTemplate) ?? [] };
  } catch (error) {
    await logServerError(`Error in searchTemplates: ${describeError(error)}`, { action: 'task_templates.searchTemplates' });
    return { data: null, error: 'An unexpected error occurred' };
  }
}

const observedSearchTemplates = withAdminObserved(
  'searchTemplates',
  { sport: 'golf', feature: 'task_management' },
  searchTemplatesImpl,
);

export async function searchTemplates(
  teamId: string,
  query: string
): Promise<{ data: TaskTemplate[] | null; error?: string }> {
  return observedSearchTemplates(teamId, query);
}

/**
 * Get recurring templates that are due to be processed
 * Note: Recurring functionality is not implemented in current DB schema.
 * This is a placeholder that returns empty array.
 */
async function getRecurringTemplatesDueImpl(): Promise<{
  data: TaskTemplate[] | null;
  error?: string;
}> {
  // The database schema doesn't have is_recurring, recurrence_pattern, etc. columns
  // Return empty array since recurring templates aren't supported yet
  return { data: [] };
}

const observedGetRecurringTemplatesDue = withAdminObserved(
  'getRecurringTemplatesDue',
  { sport: 'golf', feature: 'task_management' },
  getRecurringTemplatesDueImpl,
);

export async function getRecurringTemplatesDue(): Promise<{
  data: TaskTemplate[] | null;
  error?: string;
}> {
  return observedGetRecurringTemplatesDue();
}

/**
 * Process recurring templates and create tasks
 * Called by cron/edge function
 * Note: Recurring functionality is not implemented in current DB schema.
 */
async function processRecurringTemplatesImpl(): Promise<{
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
          team_id: template.team_id, // Required field
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
    await logServerError(`Error in processRecurringTemplates: ${describeError(error)}`, { action: 'task_templates.processRecurringTemplates' });
    results.errors.push('Failed to process recurring templates');
    return results;
  }
}

const observedProcessRecurringTemplates = withAdminObserved(
  'processRecurringTemplates',
  { sport: 'golf', feature: 'task_management' },
  processRecurringTemplatesImpl,
);

export async function processRecurringTemplates(): Promise<{
  created: number;
  failed: number;
  errors: string[];
}> {
  return observedProcessRecurringTemplates();
}

'use server';

// ============================================================================
// CRM FOUNDATIONS — SERVER ACTIONS (Phase 1, Stream A)
// ============================================================================
//
// CRUD for the four Phase 1 foundation tables:
//   - crm_email_suppressions  (T1)
//   - crm_notes               (T2)
//   - crm_tasks               (T3)
//   - crm_segments            (T4)
//
// All actions are admin-gated by RLS — every Phase 1 table policy checks
// `users.role = 'admin'`. We still call `auth.getUser()` here to fail fast on
// unauthenticated requests with a clean error message rather than letting RLS
// silently drop rows.
//
// ============================================================================

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { logServerException } from '@/lib/server-error-logger';
import type {
  CrmNote,
  CrmSegment,
  CrmTask,
  EmailSuppression,
  NoteKind,
  SegmentDefinition,
  SuppressionReason,
} from '../admin/crm/types/foundations';

// ============================================================================
// Internal helpers
// ============================================================================
async function getAuthedClient() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }
  return { supabase, user };
}

const CRM_REVALIDATE_PATH = '/golf/admin/crm';

// Supabase typed client doesn't know about the Phase 1 tables yet (DB types
// regen happens after migrations land). Cast through `as never` so TS doesn't
// complain about the `from('crm_*')` calls returning `unknown`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

// ============================================================================
// SUPPRESSIONS
// ============================================================================
export async function getSuppressions(emails?: string[]): Promise<EmailSuppression[]> {
  try {
    const { supabase } = await getAuthedClient();
    const client = supabase as AnySupabase;
    let query = client
      .from('crm_email_suppressions')
      .select('*')
      .order('suppressed_at', { ascending: false });

    if (emails && emails.length > 0) {
      query = query.in('email', emails);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to load suppressions: ${error.message}`);
    }
    return (data ?? []) as EmailSuppression[];
  } catch (error) {
    void logServerException(error, {
      action: 'crm_foundations.getSuppressions',
      source: 'server_action',
      sport: 'golf',
      featureArea: 'crm',
    });
    throw error;
  }
}

export async function addSuppression(input: {
  email: string;
  reason: SuppressionReason;
  metadata?: Record<string, unknown>;
}): Promise<EmailSuppression> {
  try {
    const { supabase, user } = await getAuthedClient();
    const client = supabase as AnySupabase;

    const { data, error } = await client
      .from('crm_email_suppressions')
      .insert({
        email: input.email,
        reason: input.reason,
        source: 'admin',
        metadata: input.metadata ?? {},
        suppressed_by: user.id,
      })
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to add suppression: ${error.message}`);
    }

    revalidatePath(CRM_REVALIDATE_PATH);
    return data as EmailSuppression;
  } catch (error) {
    void logServerException(error, {
      action: 'crm_foundations.addSuppression',
      source: 'server_action',
      sport: 'golf',
      featureArea: 'crm',
    });
    throw error;
  }
}

export async function removeSuppression(id: string): Promise<{ ok: true }> {
  try {
    const { supabase } = await getAuthedClient();
    const client = supabase as AnySupabase;

    const { error } = await client
      .from('crm_email_suppressions')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to remove suppression: ${error.message}`);
    }

    revalidatePath(CRM_REVALIDATE_PATH);
    return { ok: true };
  } catch (error) {
    void logServerException(error, {
      action: 'crm_foundations.removeSuppression',
      source: 'server_action',
      sport: 'golf',
      featureArea: 'crm',
    });
    throw error;
  }
}

// ============================================================================
// NOTES
// ============================================================================
export async function listCoachNotes(coachId: string): Promise<CrmNote[]> {
  try {
    const { supabase } = await getAuthedClient();
    const client = supabase as AnySupabase;

    const { data, error } = await client
      .from('crm_notes')
      .select('*')
      .eq('coach_id', coachId)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to load notes: ${error.message}`);
    }
    return (data ?? []) as CrmNote[];
  } catch (error) {
    void logServerException(error, {
      action: 'crm_foundations.listCoachNotes',
      source: 'server_action',
      sport: 'golf',
      featureArea: 'crm',
    });
    throw error;
  }
}

export async function createCoachNote(input: {
  coach_id: string;
  body: string;
  kind?: NoteKind;
  is_pinned?: boolean;
}): Promise<CrmNote> {
  try {
    const { supabase, user } = await getAuthedClient();
    const client = supabase as AnySupabase;

    const { data, error } = await client
      .from('crm_notes')
      .insert({
        coach_id: input.coach_id,
        author_id: user.id,
        body: input.body,
        kind: input.kind ?? 'note',
        is_pinned: input.is_pinned ?? false,
      })
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to create note: ${error.message}`);
    }

    revalidatePath(CRM_REVALIDATE_PATH);
    return data as CrmNote;
  } catch (error) {
    void logServerException(error, {
      action: 'crm_foundations.createCoachNote',
      source: 'server_action',
      sport: 'golf',
      featureArea: 'crm',
    });
    throw error;
  }
}

export async function updateCoachNote(
  id: string,
  patch: Partial<Pick<CrmNote, 'body' | 'kind' | 'is_pinned'>>,
): Promise<CrmNote> {
  try {
    const { supabase } = await getAuthedClient();
    const client = supabase as AnySupabase;

    const { data, error } = await client
      .from('crm_notes')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to update note: ${error.message}`);
    }

    revalidatePath(CRM_REVALIDATE_PATH);
    return data as CrmNote;
  } catch (error) {
    void logServerException(error, {
      action: 'crm_foundations.updateCoachNote',
      source: 'server_action',
      sport: 'golf',
      featureArea: 'crm',
    });
    throw error;
  }
}

export async function deleteCoachNote(id: string): Promise<{ ok: true }> {
  try {
    const { supabase } = await getAuthedClient();
    const client = supabase as AnySupabase;

    const { error } = await client
      .from('crm_notes')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete note: ${error.message}`);
    }

    revalidatePath(CRM_REVALIDATE_PATH);
    return { ok: true };
  } catch (error) {
    void logServerException(error, {
      action: 'crm_foundations.deleteCoachNote',
      source: 'server_action',
      sport: 'golf',
      featureArea: 'crm',
    });
    throw error;
  }
}

// ============================================================================
// TASKS
// ============================================================================
export async function listCoachTasks(
  coachId: string,
  opts?: { includeCompleted?: boolean },
): Promise<CrmTask[]> {
  try {
    const { supabase } = await getAuthedClient();
    const client = supabase as AnySupabase;

    let query = client
      .from('crm_tasks')
      .select('*')
      .eq('coach_id', coachId);

    if (!opts?.includeCompleted) {
      query = query.in('status', ['pending', 'in_progress']);
    }

    const { data, error } = await query
      .order('due_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to load tasks: ${error.message}`);
    }
    return (data ?? []) as CrmTask[];
  } catch (error) {
    void logServerException(error, {
      action: 'crm_foundations.listCoachTasks',
      source: 'server_action',
      sport: 'golf',
      featureArea: 'crm',
    });
    throw error;
  }
}

export async function listMyDueTasks(
  opts?: { byEod?: boolean; limit?: number },
): Promise<CrmTask[]> {
  try {
    const { supabase, user } = await getAuthedClient();
    const client = supabase as AnySupabase;

    let query = client
      .from('crm_tasks')
      .select('*')
      .eq('assignee_id', user.id)
      .in('status', ['pending', 'in_progress']);

    if (opts?.byEod) {
      const eod = new Date();
      eod.setHours(23, 59, 59, 999);
      query = query.lte('due_at', eod.toISOString());
    }

    query = query.order('due_at', { ascending: true, nullsFirst: false });
    if (opts?.limit && opts.limit > 0) {
      query = query.limit(opts.limit);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to load due tasks: ${error.message}`);
    }
    return (data ?? []) as CrmTask[];
  } catch (error) {
    void logServerException(error, {
      action: 'crm_foundations.listMyDueTasks',
      source: 'server_action',
      sport: 'golf',
      featureArea: 'crm',
    });
    throw error;
  }
}

export async function createCrmTask(
  input: Omit<
    CrmTask,
    'id' | 'created_by' | 'created_at' | 'updated_at' | 'completed_at' | 'reminder_sent'
  >,
): Promise<CrmTask> {
  try {
    const { supabase, user } = await getAuthedClient();
    const client = supabase as AnySupabase;

    const { data, error } = await client
      .from('crm_tasks')
      .insert({
        coach_id: input.coach_id,
        assignee_id: input.assignee_id,
        created_by: user.id,
        title: input.title,
        description: input.description,
        due_at: input.due_at,
        status: input.status,
        priority: input.priority,
        kind: input.kind,
        source: input.source,
        reminder_at: input.reminder_at,
        metadata: input.metadata ?? {},
      })
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to create task: ${error.message}`);
    }

    revalidatePath(CRM_REVALIDATE_PATH);
    return data as CrmTask;
  } catch (error) {
    void logServerException(error, {
      action: 'crm_foundations.createCrmTask',
      source: 'server_action',
      sport: 'golf',
      featureArea: 'crm',
    });
    throw error;
  }
}

export async function updateCrmTask(
  id: string,
  patch: Partial<CrmTask>,
): Promise<CrmTask> {
  try {
    const { supabase } = await getAuthedClient();
    const client = supabase as AnySupabase;

    // Strip server-managed columns from any patch attempt
    const {
      id: _id,
      created_by: _createdBy,
      created_at: _createdAt,
      updated_at: _updatedAt,
      ...safePatch
    } = patch;
    void _id; void _createdBy; void _createdAt; void _updatedAt;

    const { data, error } = await client
      .from('crm_tasks')
      .update(safePatch)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to update task: ${error.message}`);
    }

    revalidatePath(CRM_REVALIDATE_PATH);
    return data as CrmTask;
  } catch (error) {
    void logServerException(error, {
      action: 'crm_foundations.updateCrmTask',
      source: 'server_action',
      sport: 'golf',
      featureArea: 'crm',
    });
    throw error;
  }
}

export async function completeCrmTask(id: string): Promise<CrmTask> {
  try {
    const { supabase } = await getAuthedClient();
    const client = supabase as AnySupabase;

    const { data, error } = await client
      .from('crm_tasks')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to complete task: ${error.message}`);
    }

    revalidatePath(CRM_REVALIDATE_PATH);
    return data as CrmTask;
  } catch (error) {
    void logServerException(error, {
      action: 'crm_foundations.completeCrmTask',
      source: 'server_action',
      sport: 'golf',
      featureArea: 'crm',
    });
    throw error;
  }
}

// ============================================================================
// SEGMENTS
// ============================================================================
export async function listSegments(): Promise<CrmSegment[]> {
  try {
    const { supabase } = await getAuthedClient();
    const client = supabase as AnySupabase;

    const { data, error } = await client
      .from('crm_segments')
      .select('*')
      .order('pin_order', { ascending: true, nullsFirst: false })
      .order('updated_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to load segments: ${error.message}`);
    }
    return (data ?? []) as CrmSegment[];
  } catch (error) {
    void logServerException(error, {
      action: 'crm_foundations.listSegments',
      source: 'server_action',
      sport: 'golf',
      featureArea: 'crm',
    });
    throw error;
  }
}

export async function createSegment(input: {
  name: string;
  description?: string;
  definition: SegmentDefinition;
  is_shared?: boolean;
  pin_order?: number;
}): Promise<CrmSegment> {
  try {
    const { supabase, user } = await getAuthedClient();
    const client = supabase as AnySupabase;

    const { data, error } = await client
      .from('crm_segments')
      .insert({
        name: input.name,
        description: input.description ?? null,
        definition: input.definition,
        created_by: user.id,
        is_shared: input.is_shared ?? true,
        pin_order: input.pin_order ?? null,
      })
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to create segment: ${error.message}`);
    }

    revalidatePath(CRM_REVALIDATE_PATH);
    return data as CrmSegment;
  } catch (error) {
    void logServerException(error, {
      action: 'crm_foundations.createSegment',
      source: 'server_action',
      sport: 'golf',
      featureArea: 'crm',
    });
    throw error;
  }
}

export async function updateSegment(
  id: string,
  patch: Partial<Omit<CrmSegment, 'id' | 'created_by' | 'created_at'>>,
): Promise<CrmSegment> {
  try {
    const { supabase } = await getAuthedClient();
    const client = supabase as AnySupabase;

    const { data, error } = await client
      .from('crm_segments')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to update segment: ${error.message}`);
    }

    revalidatePath(CRM_REVALIDATE_PATH);
    return data as CrmSegment;
  } catch (error) {
    void logServerException(error, {
      action: 'crm_foundations.updateSegment',
      source: 'server_action',
      sport: 'golf',
      featureArea: 'crm',
    });
    throw error;
  }
}

export async function deleteSegment(id: string): Promise<{ ok: true }> {
  try {
    const { supabase } = await getAuthedClient();
    const client = supabase as AnySupabase;

    const { error } = await client
      .from('crm_segments')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete segment: ${error.message}`);
    }

    revalidatePath(CRM_REVALIDATE_PATH);
    return { ok: true };
  } catch (error) {
    void logServerException(error, {
      action: 'crm_foundations.deleteSegment',
      source: 'server_action',
      sport: 'golf',
      featureArea: 'crm',
    });
    throw error;
  }
}

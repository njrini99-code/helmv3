'use server';

// ============================================================================
// CRM AUTOMATIONS — SERVER ACTIONS (Phase 4 / Wave A2)
// ============================================================================
//
// Admin CRUD for the crm_automations table. The pure evaluator
// (evaluateAutomationsForEvent) lives in src/lib/crm/automations-engine.ts so
// the Resend webhook (server-only context) can import it without dragging in
// 'use server' boundary semantics — server actions exported from this file
// MUST all be async per Next.js rules.
//
// All actions are admin-gated by RLS on crm_automations (admin-only policies,
// see 20260429T2_crm_automations.sql). We still call auth.getUser() to fail
// fast on unauthenticated requests.
// ============================================================================

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { logServerException } from '@/lib/server-error-logger';
import type {
  CrmAutomation,
  CrmAutomationAction,
  CrmAutomationCondition,
  CrmAutomationTrigger,
} from '@/lib/crm/automations-engine';

// ----------------------------------------------------------------------------
// Internal helpers
// ----------------------------------------------------------------------------
async function getAuthedClient() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }
  return { supabase, user };
}

const CRM_AUTOMATIONS_PATH = '/golf/admin/crm/settings/automations';

// Supabase typed client doesn't know about crm_automations yet (DB types
// regen happens after migrations land). Cast to bypass type errors on the
// `from('crm_automations')` calls.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

// ----------------------------------------------------------------------------
// Normalization — Postgres returns conditions/actions as JSON values which
// may not exactly match our TS union types. Coerce defensively so consumers
// don't have to defend against malformed rows.
// ----------------------------------------------------------------------------
function normalizeRow(row: Record<string, unknown>): CrmAutomation {
  const conditions = Array.isArray(row.conditions)
    ? (row.conditions as CrmAutomationCondition[])
    : [];
  const actions = Array.isArray(row.actions)
    ? (row.actions as CrmAutomationAction[])
    : [];

  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    trigger_event: row.trigger_event as CrmAutomationTrigger,
    conditions,
    actions,
    is_active: Boolean(row.is_active),
    priority: typeof row.priority === 'number' ? row.priority : 100,
    created_by: row.created_by as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

// ============================================================================
// CRUD
// ============================================================================

export async function listAutomations(opts?: {
  trigger?: CrmAutomationTrigger;
  activeOnly?: boolean;
}): Promise<CrmAutomation[]> {
  const { supabase } = await getAuthedClient();
  try {
    const client = supabase as AnySupabase;

    let query = client
      .from('crm_automations')
      .select('*')
      .order('trigger_event', { ascending: true })
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false });

    if (opts?.trigger) {
      query = query.eq('trigger_event', opts.trigger);
    }
    if (opts?.activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to load automations: ${error.message}`);
    }
    return (data ?? []).map((row: Record<string, unknown>) => normalizeRow(row));
  } catch (error) {
    void logServerException(error, {
      action: 'crm_automations.listAutomations',
      source: 'server_action',
      sport: 'golf',
      featureArea: 'crm',
    });
    throw error;
  }
}

export async function getAutomation(id: string): Promise<CrmAutomation> {
  const { supabase } = await getAuthedClient();
  try {
    const client = supabase as AnySupabase;

    const { data, error } = await client
      .from('crm_automations')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      throw new Error(`Failed to load automation: ${error.message}`);
    }
    return normalizeRow(data as Record<string, unknown>);
  } catch (error) {
    void logServerException(error, {
      action: 'crm_automations.getAutomation',
      source: 'server_action',
      sport: 'golf',
      featureArea: 'crm',
    });
    throw error;
  }
}

export async function createAutomation(input: {
  name: string;
  description?: string | null;
  trigger_event: CrmAutomationTrigger;
  conditions?: CrmAutomationCondition[];
  actions: CrmAutomationAction[];
  is_active?: boolean;
  priority?: number;
}): Promise<CrmAutomation> {
  const { supabase, user } = await getAuthedClient();
  try {
    const client = supabase as AnySupabase;

    if (!input.name || !input.name.trim()) {
      throw new Error('Automation name is required');
    }
    if (!Array.isArray(input.actions) || input.actions.length === 0) {
      throw new Error('At least one action is required');
    }

    const { data, error } = await client
      .from('crm_automations')
      .insert({
        name: input.name.trim(),
        description: input.description ?? null,
        trigger_event: input.trigger_event,
        conditions: input.conditions ?? [],
        actions: input.actions,
        is_active: input.is_active ?? true,
        priority: input.priority ?? 100,
        created_by: user.id,
      })
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to create automation: ${error.message}`);
    }

    revalidatePath(CRM_AUTOMATIONS_PATH);
    return normalizeRow(data as Record<string, unknown>);
  } catch (error) {
    void logServerException(error, {
      action: 'crm_automations.createAutomation',
      source: 'server_action',
      sport: 'golf',
      featureArea: 'crm',
    });
    throw error;
  }
}

export async function updateAutomation(
  id: string,
  patch: Partial<{
    name: string;
    description: string | null;
    trigger_event: CrmAutomationTrigger;
    conditions: CrmAutomationCondition[];
    actions: CrmAutomationAction[];
    is_active: boolean;
    priority: number;
  }>,
): Promise<CrmAutomation> {
  const { supabase } = await getAuthedClient();
  try {
    const client = supabase as AnySupabase;

    // Strip server-managed columns from any patch attempt.
    const safePatch: Record<string, unknown> = {};
    if (patch.name !== undefined) safePatch.name = patch.name.trim();
    if (patch.description !== undefined) safePatch.description = patch.description;
    if (patch.trigger_event !== undefined) safePatch.trigger_event = patch.trigger_event;
    if (patch.conditions !== undefined) safePatch.conditions = patch.conditions;
    if (patch.actions !== undefined) safePatch.actions = patch.actions;
    if (patch.is_active !== undefined) safePatch.is_active = patch.is_active;
    if (patch.priority !== undefined) safePatch.priority = patch.priority;

    const { data, error } = await client
      .from('crm_automations')
      .update(safePatch)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to update automation: ${error.message}`);
    }

    revalidatePath(CRM_AUTOMATIONS_PATH);
    return normalizeRow(data as Record<string, unknown>);
  } catch (error) {
    void logServerException(error, {
      action: 'crm_automations.updateAutomation',
      source: 'server_action',
      sport: 'golf',
      featureArea: 'crm',
    });
    throw error;
  }
}

export async function deleteAutomation(id: string): Promise<{ ok: true }> {
  const { supabase } = await getAuthedClient();
  try {
    const client = supabase as AnySupabase;

    const { error } = await client
      .from('crm_automations')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete automation: ${error.message}`);
    }

    revalidatePath(CRM_AUTOMATIONS_PATH);
    return { ok: true };
  } catch (error) {
    void logServerException(error, {
      action: 'crm_automations.deleteAutomation',
      source: 'server_action',
      sport: 'golf',
      featureArea: 'crm',
    });
    throw error;
  }
}

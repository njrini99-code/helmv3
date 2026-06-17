'use server';

// ============================================================================
// CRM SEQUENCES — SERVER ACTIONS (Phase 2)
// ============================================================================
//
// CRUD + enrollment helpers for the three sequence tables introduced in
// migration 20260429T1_crm_sequences.sql:
//
//   - crm_sequences
//   - crm_sequence_steps
//   - crm_sequence_enrollments
//
// All actions are admin-gated by RLS — every Phase 2 table policy checks
// `users.role = 'admin'`. We still call `auth.getUser()` here to fail fast on
// unauthenticated requests with a clean error message rather than letting RLS
// silently drop rows. Same pattern as crm-foundations.ts.
//
// ============================================================================

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

// ============================================================================
// Types — exported for consumers (UI components, cron route)
// ============================================================================
export type SequenceTriggerKind = 'manual' | 'status_change' | 'segment_match';

export interface CrmSequence {
  id: string;
  name: string;
  description: string | null;
  trigger_kind: SequenceTriggerKind;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CrmSequenceStep {
  id: string;
  sequence_id: string;
  step_order: number;
  delay_hours: number;
  template_id: string | null;
  subject_override: string | null;
  body_override: string | null;
  condition: Record<string, unknown>;
  created_at: string;
}

export type SequenceEnrollmentStatus =
  | 'active'
  | 'paused'
  | 'completed'
  | 'stopped';

export type SequenceEnrollmentStopReason =
  | 'replied'
  | 'unsubscribed'
  | 'bounced'
  | 'manual'
  | 'sequence_completed';

export interface CrmSequenceEnrollment {
  id: string;
  sequence_id: string;
  coach_id: string;
  status: SequenceEnrollmentStatus;
  current_step: number;
  next_send_at: string | null;
  enrolled_at: string;
  completed_at: string | null;
  stopped_at: string | null;
  stop_reason: SequenceEnrollmentStopReason | null;
  enrolled_by: string;
  metadata: Record<string, unknown>;
}

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

const CRM_SEQUENCES_REVALIDATE_PATH = '/golf/admin/crm/sequences';

// Supabase typed client doesn't know about the Phase 2 tables yet (DB types
// regen happens after migrations land). Cast through `as never` so TS doesn't
// complain about the `from('crm_*')` calls returning `unknown`. Same approach
// as crm-foundations.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

// ============================================================================
// SEQUENCES
// ============================================================================
export async function listSequences(): Promise<CrmSequence[]> {
  const { supabase } = await getAuthedClient();
  const client = supabase as AnySupabase;

  const { data, error } = await client
    .from('crm_sequences')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to load sequences: ${error.message}`);
  }
  return (data ?? []) as CrmSequence[];
}

export async function getSequence(id: string): Promise<{
  sequence: CrmSequence;
  steps: CrmSequenceStep[];
}> {
  const { supabase } = await getAuthedClient();
  const client = supabase as AnySupabase;

  const { data: sequence, error: seqError } = await client
    .from('crm_sequences')
    .select('*')
    .eq('id', id)
    .single();

  if (seqError) {
    throw new Error(`Failed to load sequence: ${seqError.message}`);
  }

  const { data: steps, error: stepsError } = await client
    .from('crm_sequence_steps')
    .select('*')
    .eq('sequence_id', id)
    .order('step_order', { ascending: true });

  if (stepsError) {
    throw new Error(`Failed to load sequence steps: ${stepsError.message}`);
  }

  return {
    sequence: sequence as CrmSequence,
    steps: (steps ?? []) as CrmSequenceStep[],
  };
}

export async function createSequence(input: {
  name: string;
  description?: string;
  trigger_kind?: SequenceTriggerKind;
}): Promise<CrmSequence> {
  const { supabase, user } = await getAuthedClient();
  const client = supabase as AnySupabase;

  const { data, error } = await client
    .from('crm_sequences')
    .insert({
      name: input.name,
      description: input.description ?? null,
      trigger_kind: input.trigger_kind ?? 'manual',
      is_active: true,
      created_by: user.id,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to create sequence: ${error.message}`);
  }

  revalidatePath(CRM_SEQUENCES_REVALIDATE_PATH);
  return data as CrmSequence;
}

export async function updateSequence(
  id: string,
  patch: Partial<Pick<CrmSequence, 'name' | 'description' | 'is_active' | 'trigger_kind'>>,
): Promise<CrmSequence> {
  const { supabase } = await getAuthedClient();
  const client = supabase as AnySupabase;

  const { data, error } = await client
    .from('crm_sequences')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to update sequence: ${error.message}`);
  }

  revalidatePath(CRM_SEQUENCES_REVALIDATE_PATH);
  return data as CrmSequence;
}

export async function deleteSequence(id: string): Promise<{ ok: true }> {
  const { supabase } = await getAuthedClient();
  const client = supabase as AnySupabase;

  const { error } = await client
    .from('crm_sequences')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to delete sequence: ${error.message}`);
  }

  revalidatePath(CRM_SEQUENCES_REVALIDATE_PATH);
  return { ok: true };
}

// ============================================================================
// SEQUENCE STEPS
// ============================================================================
export async function upsertSequenceStep(input: {
  sequence_id: string;
  step_order: number;
  delay_hours: number;
  template_id?: string;
  subject_override?: string;
  body_override?: string;
  condition?: Record<string, unknown>;
}): Promise<CrmSequenceStep> {
  const { supabase } = await getAuthedClient();
  const client = supabase as AnySupabase;

  // Upsert on (sequence_id, step_order) — the unique constraint handles
  // collisions cleanly so re-saving a step at the same position updates
  // rather than erroring.
  const { data, error } = await client
    .from('crm_sequence_steps')
    .upsert(
      {
        sequence_id: input.sequence_id,
        step_order: input.step_order,
        delay_hours: input.delay_hours,
        template_id: input.template_id ?? null,
        subject_override: input.subject_override ?? null,
        body_override: input.body_override ?? null,
        condition: input.condition ?? {},
      },
      { onConflict: 'sequence_id,step_order' },
    )
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to save sequence step: ${error.message}`);
  }

  revalidatePath(CRM_SEQUENCES_REVALIDATE_PATH);
  return data as CrmSequenceStep;
}

export async function deleteSequenceStep(id: string): Promise<{ ok: true }> {
  const { supabase } = await getAuthedClient();
  const client = supabase as AnySupabase;

  const { error } = await client
    .from('crm_sequence_steps')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to delete sequence step: ${error.message}`);
  }

  revalidatePath(CRM_SEQUENCES_REVALIDATE_PATH);
  return { ok: true };
}

// ============================================================================
// ENROLLMENTS
// ============================================================================
//
// Enrollment sets next_send_at = now() so the cron picks it up on the next
// tick (step 1 fires immediately). If you want to delay the first send, set
// step 1's delay_hours > 0 — the cron honors per-step delays.
//
async function buildEnrollmentRows(input: {
  sequence_id: string;
  coach_ids: string[];
  enrolled_by: string;
}) {
  const now = new Date().toISOString();
  return input.coach_ids.map((coach_id) => ({
    sequence_id: input.sequence_id,
    coach_id,
    status: 'active' as const,
    current_step: 0,
    next_send_at: now,
    enrolled_by: input.enrolled_by,
    metadata: {},
  }));
}

export async function enrollCoachesInSequence(input: {
  sequence_id: string;
  coach_ids: string[];
}): Promise<{ enrolled: number; skipped: number }> {
  const { supabase, user } = await getAuthedClient();
  const client = supabase as AnySupabase;

  if (input.coach_ids.length === 0) {
    return { enrolled: 0, skipped: 0 };
  }

  // De-duplicate against existing (sequence, coach) pairs so we report skipped
  // accurately. The DB UNIQUE constraint would also catch this but on-conflict
  // ignore returns less helpful counts.
  const { data: existing, error: existingErr } = await client
    .from('crm_sequence_enrollments')
    .select('coach_id')
    .eq('sequence_id', input.sequence_id)
    .in('coach_id', input.coach_ids);

  if (existingErr) {
    throw new Error(`Failed to check existing enrollments: ${existingErr.message}`);
  }

  const existingSet = new Set<string>(
    ((existing ?? []) as Array<{ coach_id: string }>).map((r) => r.coach_id),
  );
  const newCoachIds = input.coach_ids.filter((id) => !existingSet.has(id));

  if (newCoachIds.length === 0) {
    return { enrolled: 0, skipped: input.coach_ids.length };
  }

  const rows = await buildEnrollmentRows({
    sequence_id: input.sequence_id,
    coach_ids: newCoachIds,
    enrolled_by: user.id,
  });

  const { error: insertErr } = await client
    .from('crm_sequence_enrollments')
    .insert(rows);

  if (insertErr) {
    throw new Error(`Failed to enroll coaches: ${insertErr.message}`);
  }

  revalidatePath(CRM_SEQUENCES_REVALIDATE_PATH);
  return {
    enrolled: newCoachIds.length,
    skipped: input.coach_ids.length - newCoachIds.length,
  };
}

export async function enrollSegmentInSequence(input: {
  sequence_id: string;
  segment_id: string;
}): Promise<{ enrolled: number; skipped: number }> {
  const { supabase } = await getAuthedClient();
  const client = supabase as AnySupabase;

  // Pull the segment definition (Filters JSONB) and translate to a
  // crm_coaches query. The set of fields on SegmentDefinition mirrors the
  // Filters interface in CoachFilters.tsx (frozen contract — see
  // src/app/golf/admin/crm/types/foundations.ts).
  const { data: segment, error: segErr } = await client
    .from('crm_segments')
    .select('definition')
    .eq('id', input.segment_id)
    .single();

  if (segErr || !segment) {
    throw new Error(`Failed to load segment: ${segErr?.message ?? 'not found'}`);
  }

  const def = (segment as { definition: Record<string, unknown> }).definition ?? {};
  let query = client
    .from('crm_coaches')
    .select('id')
    // NULL-safe archived filter: legacy rows with is_archived = NULL must still
    // enroll, so match NULL OR false. A bare .eq('is_archived', false) would drop
    // NULL rows via Postgres three-valued logic. Mirrors admin/crm/page.tsx.
    .or('is_archived.is.null,is_archived.eq.false');

  if (def.status && def.status !== 'all') {
    query = query.eq('status', def.status);
  }
  if (def.division && def.division !== 'all') {
    query = query.eq('division', def.division);
  }
  if (def.conference && def.conference !== 'all') {
    query = query.eq('conference', def.conference);
  }
  if (def.program && def.program !== 'all') {
    query = query.eq('program', def.program);
  }
  if (def.priority && def.priority !== 'all') {
    const priorityNum = Number.parseInt(String(def.priority), 10);
    if (!Number.isNaN(priorityNum)) {
      query = query.eq('priority', priorityNum);
    }
  }
  if (def.starred === true) {
    query = query.eq('is_starred', true);
  }
  if (def.primaryOnly === true) {
    query = query.eq('is_primary_contact', true);
  }

  const { data: coaches, error: coachErr } = await query;
  if (coachErr) {
    throw new Error(`Failed to resolve segment coaches: ${coachErr.message}`);
  }

  const coachIds = ((coaches ?? []) as Array<{ id: string }>).map((c) => c.id);
  if (coachIds.length === 0) {
    return { enrolled: 0, skipped: 0 };
  }

  return enrollCoachesInSequence({
    sequence_id: input.sequence_id,
    coach_ids: coachIds,
  });
}

export async function listEnrollments(
  sequence_id: string,
  opts?: { status?: SequenceEnrollmentStatus; limit?: number },
): Promise<CrmSequenceEnrollment[]> {
  const { supabase } = await getAuthedClient();
  const client = supabase as AnySupabase;

  let query = client
    .from('crm_sequence_enrollments')
    .select('*')
    .eq('sequence_id', sequence_id);

  if (opts?.status) {
    query = query.eq('status', opts.status);
  }

  query = query.order('enrolled_at', { ascending: false });
  if (opts?.limit && opts.limit > 0) {
    query = query.limit(opts.limit);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load enrollments: ${error.message}`);
  }
  return (data ?? []) as CrmSequenceEnrollment[];
}

// Per-coach enrollment summary for list/badge views (Coaches + Conferences tabs).
export interface CoachEnrollmentSummary {
  status: SequenceEnrollmentStatus;
  current_step: number;
  next_send_at: string | null;
}

// Returns coach_id -> most relevant enrollment (active preferred, else most
// recent). Powers the "Queued / Step N / Done" badge on the coaches list +
// conference view so teammates working the list by hand don't double-touch.
export async function getCoachSequenceEnrollmentStatuses(
  coachIds: string[],
): Promise<Record<string, CoachEnrollmentSummary>> {
  if (!coachIds.length) return {};
  const { supabase } = await getAuthedClient();
  const client = supabase as AnySupabase;
  const out: Record<string, CoachEnrollmentSummary> = {};
  for (let i = 0; i < coachIds.length; i += 500) {
    const chunk = coachIds.slice(i, i + 500);
    const { data, error } = await client
      .from('crm_sequence_enrollments')
      .select('coach_id, status, current_step, next_send_at, enrolled_at')
      .in('coach_id', chunk)
      .order('enrolled_at', { ascending: false });
    if (error) {
      throw new Error(`Failed to load coach enrollment statuses: ${error.message}`);
    }
    for (const row of (data ?? []) as Array<{
      coach_id: string; status: SequenceEnrollmentStatus; current_step: number; next_send_at: string | null;
    }>) {
      const summary: CoachEnrollmentSummary = {
        status: row.status, current_step: row.current_step, next_send_at: row.next_send_at,
      };
      const existing = out[row.coach_id];
      // first row per coach is the most recent (ordered desc); prefer an active one
      if (!existing) out[row.coach_id] = summary;
      else if (existing.status !== 'active' && summary.status === 'active') out[row.coach_id] = summary;
    }
  }
  return out;
}

export async function pauseEnrollment(id: string): Promise<CrmSequenceEnrollment> {
  const { supabase } = await getAuthedClient();
  const client = supabase as AnySupabase;

  const { data, error } = await client
    .from('crm_sequence_enrollments')
    .update({ status: 'paused' })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to pause enrollment: ${error.message}`);
  }

  revalidatePath(CRM_SEQUENCES_REVALIDATE_PATH);
  return data as CrmSequenceEnrollment;
}

export async function stopEnrollment(
  id: string,
  reason: SequenceEnrollmentStopReason,
): Promise<CrmSequenceEnrollment> {
  const { supabase } = await getAuthedClient();
  const client = supabase as AnySupabase;

  const { data, error } = await client
    .from('crm_sequence_enrollments')
    .update({
      status: 'stopped',
      stopped_at: new Date().toISOString(),
      stop_reason: reason,
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to stop enrollment: ${error.message}`);
  }

  revalidatePath(CRM_SEQUENCES_REVALIDATE_PATH);
  return data as CrmSequenceEnrollment;
}

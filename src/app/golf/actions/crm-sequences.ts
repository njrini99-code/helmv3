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
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows';

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

// True enrollment counts by status (exact COUNT, not a row-limited slice) — the
// Sequences-tab StatCards must use this so totals stay correct past the list's
// page size (the enrollment LIST is capped at 200 newest; counts are not).
export interface SequenceEnrollmentCounts {
  active: number;
  completed: number;
  stopped: number;
  paused: number;
  total: number;
}

export async function getSequenceEnrollmentCounts(
  sequence_id: string,
): Promise<SequenceEnrollmentCounts> {
  const { supabase } = await getAuthedClient();
  const client = supabase as AnySupabase;
  const countFor = async (status?: SequenceEnrollmentStatus) => {
    let q = client
      .from('crm_sequence_enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('sequence_id', sequence_id);
    if (status) q = q.eq('status', status);
    const { count, error } = await q;
    if (error) throw new Error(`Failed to count enrollments: ${error.message}`);
    return count ?? 0;
  };
  const [active, completed, stopped, paused, total] = await Promise.all([
    countFor('active'), countFor('completed'), countFor('stopped'), countFor('paused'), countFor(),
  ]);
  return { active, completed, stopped, paused, total };
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
  // Mirror the remaining crm_coaches-column filters from CoachFilters/filteredCoaches
  // so the segment we ENROLL matches the segment the operator SEES. Previously these
  // were applied only client-side, so enrolling a saved "cold, has-notes" view could
  // email the entire cold cohort. (queueStatus + temperature depend on joins to the
  // enrollment state / engagement view and are intentionally not mirrored here — they
  // are rare in enrollment segments and the dialog's resolved-count surfaces any gap.)
  if (typeof def.search === 'string' && def.search.trim()) {
    const s = def.search.trim().replace(/[%,()]/g, ''); // sanitize for the or-filter grammar
    if (s) query = query.or(`name.ilike.%${s}%,school.ilike.%${s}%,email.ilike.%${s}%,conference.ilike.%${s}%`);
  }
  if (def.followUpDue === true) {
    query = query.not('next_follow_up_at', 'is', null).lte('next_follow_up_at', new Date().toISOString());
  }
  if (def.hasNotes === true) {
    query = query.not('notes', 'is', null).neq('notes', '');
  }
  if (def.noContact30Days === true) {
    const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString();
    query = query.or(`last_contacted_at.is.null,last_contacted_at.lt.${cutoff}`);
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

// ============================================================================
// PERFORMANCE — reply-focused drip metrics
// ============================================================================
//
// Reply rate is the north-star. We deliberately do NOT surface open or click
// rate: on .edu domains those are dominated by security-gateway link/pixel
// pre-fetching (bots), so an "open" is noise, not intent. We report DELIVERED,
// BOUNCED, and REPLIED only.
//
// Attribution (matches the live cold-sender contract):
//   crm_contact_log.notes looks like  Sequence "<name>" step <N> (...)
//   so the sequence is matched by  notes ILIKE %<sequence name>%  and the step
//   number is parsed from the notes via /step\s+(\d+)/i. (crm_contact_log has
//   no metadata column — attribution can only go through notes + the FK joins.)
//
//   delivered / bounced come from email_events joined on contact_log_id; we
//   count DISTINCT contact_log_ids per outcome so a message that emits several
//   delivery webhooks is still one delivered send. replied = a crm_replies row
//   whose contact_log_id points at the step's send (the precise signal), with
//   a fallback to coach_id when a reply lacks a resolved contact_log_id.
//
export interface SequencePerformanceStep {
  step_order: number;
  sent: number;
  delivered: number;
  bounced: number;
  replied: number;
  /** replied / delivered, as a 0–100 percentage. 0 when delivered = 0. */
  reply_rate: number;
}

export interface SequencePerformance {
  steps: SequencePerformanceStep[];
  totals: {
    sent: number;
    delivered: number;
    bounced: number;
    replied: number;
    reply_rate: number;
  };
}

// PostgREST `.in(...)` gets unwieldy past a few hundred ids (URL length); chunk
// the id lists conservatively so delivery/reply lookups stay within limits.
const PERF_IN_CHUNK = 300;

function parseStepOrder(notes: string | null): number | null {
  if (!notes) return null;
  const match = /step\s+(\d+)/i.exec(notes);
  const digits = match?.[1];
  if (!digits) return null;
  const n = Number.parseInt(digits, 10);
  return Number.isNaN(n) ? null : n;
}

function replyRate(replied: number, delivered: number): number {
  if (delivered <= 0) return 0;
  return Math.round((replied / delivered) * 1000) / 10; // one decimal place
}

export async function getSequencePerformance(
  sequence_id: string,
): Promise<SequencePerformance> {
  const { supabase } = await getAuthedClient();
  const client = supabase as AnySupabase;

  // 1) Sequence name (for notes matching) + its declared steps (so a step with
  //    zero sends still renders an honest "No sends yet" row).
  const { data: seq, error: seqErr } = await client
    .from('crm_sequences')
    .select('name')
    .eq('id', sequence_id)
    .single();
  if (seqErr) {
    throw new Error(`Failed to load sequence: ${seqErr.message}`);
  }
  const sequenceName: string = (seq as { name: string }).name;

  const { data: stepRows, error: stepErr } = await client
    .from('crm_sequence_steps')
    .select('step_order')
    .eq('sequence_id', sequence_id)
    .order('step_order', { ascending: true });
  if (stepErr) {
    throw new Error(`Failed to load sequence steps: ${stepErr.message}`);
  }
  const declaredOrders = ((stepRows ?? []) as Array<{ step_order: number }>).map(
    (s) => s.step_order,
  );

  // 2) Every send logged for this sequence. Match notes by the sequence name
  //    substring; sanitize the ILIKE pattern so %/_ in a sequence name are
  //    treated literally. Paginate past the 1000-row cap.
  const ilikePattern = `%${sequenceName.replace(/[\\%_]/g, '\\$&')}%`;
  const sends = await fetchAllRows<{ id: string; coach_id: string; notes: string | null }>(
    (from, to) =>
      client
        .from('crm_contact_log')
        .select('id, coach_id, notes')
        .eq('contact_type', 'email')
        .ilike('notes', ilikePattern)
        .order('id', { ascending: true })
        .range(from, to),
  );

  // Bucket sends by parsed step order. logId -> step_order powers per-step
  // attribution of delivery/reply events back to the originating step.
  const stepByLogId = new Map<string, number>();
  const coachIdsByStep = new Map<number, Set<string>>();
  const sentByStep = new Map<number, number>();
  const allLogIds: string[] = [];
  for (const row of sends) {
    const order = parseStepOrder(row.notes);
    if (order == null) continue;
    allLogIds.push(row.id);
    stepByLogId.set(row.id, order);
    sentByStep.set(order, (sentByStep.get(order) ?? 0) + 1);
    if (row.coach_id) {
      const set = coachIdsByStep.get(order) ?? new Set<string>();
      set.add(row.coach_id);
      coachIdsByStep.set(order, set);
    }
  }

  // 3) Delivery / bounce events for those sends. Count DISTINCT contact_log_ids
  //    per outcome (a single message can emit several webhooks).
  const deliveredByStep = new Map<number, Set<string>>();
  const bouncedByStep = new Map<number, Set<string>>();
  for (let i = 0; i < allLogIds.length; i += PERF_IN_CHUNK) {
    const chunk = allLogIds.slice(i, i + PERF_IN_CHUNK);
    const events = await fetchAllRows<{ contact_log_id: string | null; event_type: string }>(
      (from, to) =>
        client
          .from('email_events')
          .select('contact_log_id, event_type')
          .in('contact_log_id', chunk)
          .order('id', { ascending: true })
          .range(from, to),
    );
    for (const ev of events) {
      const logId = ev.contact_log_id;
      if (!logId) continue;
      const order = stepByLogId.get(logId);
      if (order == null) continue;
      if (ev.event_type === 'email.delivered') {
        const set = deliveredByStep.get(order) ?? new Set<string>();
        set.add(logId);
        deliveredByStep.set(order, set);
      } else if (ev.event_type === 'email.bounced') {
        const set = bouncedByStep.get(order) ?? new Set<string>();
        set.add(logId);
        bouncedByStep.set(order, set);
      }
    }
  }

  // 4) Human replies. Prefer the precise contact_log_id link; fall back to
  //    coach_id for replies that arrived before the inbound parser resolved the
  //    originating send. Track which replies are already counted by log id so
  //    the coach-id fallback can't double-count the same reply row.
  const repliedByStep = new Map<number, number>();
  const countedReplyIds = new Set<string>();
  for (let i = 0; i < allLogIds.length; i += PERF_IN_CHUNK) {
    const chunk = allLogIds.slice(i, i + PERF_IN_CHUNK);
    const replies = await fetchAllRows<{ id: string; contact_log_id: string | null }>(
      (from, to) =>
        client
          .from('crm_replies')
          .select('id, contact_log_id')
          .in('contact_log_id', chunk)
          .order('id', { ascending: true })
          .range(from, to),
    );
    for (const r of replies) {
      const logId = r.contact_log_id;
      if (!logId) continue;
      const order = stepByLogId.get(logId);
      if (order == null || countedReplyIds.has(r.id)) continue;
      countedReplyIds.add(r.id);
      repliedByStep.set(order, (repliedByStep.get(order) ?? 0) + 1);
    }
  }
  // Fallback: replies attributable only by enrolled coach (no resolved log id).
  for (const [order, coachSet] of coachIdsByStep) {
    const coachIds = [...coachSet];
    for (let i = 0; i < coachIds.length; i += PERF_IN_CHUNK) {
      const chunk = coachIds.slice(i, i + PERF_IN_CHUNK);
      const replies = await fetchAllRows<{ id: string; contact_log_id: string | null }>(
        (from, to) =>
          client
            .from('crm_replies')
            .select('id, contact_log_id')
            .is('contact_log_id', null)
            .in('coach_id', chunk)
            .order('id', { ascending: true })
            .range(from, to),
      );
      for (const r of replies) {
        if (countedReplyIds.has(r.id)) continue;
        countedReplyIds.add(r.id);
        repliedByStep.set(order, (repliedByStep.get(order) ?? 0) + 1);
      }
    }
  }

  // 5) Assemble per-step rows. Union of declared steps + any step order that
  //    actually appears in the sends (defends against renamed/deleted steps).
  const orders = new Set<number>(declaredOrders);
  for (const order of sentByStep.keys()) orders.add(order);

  const steps: SequencePerformanceStep[] = [...orders]
    .sort((a, b) => a - b)
    .map((order) => {
      const sent = sentByStep.get(order) ?? 0;
      const delivered = deliveredByStep.get(order)?.size ?? 0;
      const bounced = bouncedByStep.get(order)?.size ?? 0;
      const replied = repliedByStep.get(order) ?? 0;
      return {
        step_order: order,
        sent,
        delivered,
        bounced,
        replied,
        reply_rate: replyRate(replied, delivered),
      };
    });

  const totals = steps.reduce(
    (acc, s) => ({
      sent: acc.sent + s.sent,
      delivered: acc.delivered + s.delivered,
      bounced: acc.bounced + s.bounced,
      replied: acc.replied + s.replied,
    }),
    { sent: 0, delivered: 0, bounced: 0, replied: 0 },
  );

  return {
    steps,
    totals: {
      ...totals,
      reply_rate: replyRate(totals.replied, totals.delivered),
    },
  };
}

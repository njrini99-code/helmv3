'use server';

// =============================================================================
// src/app/lifting/actions/weight-checkins.ts
//
// Helm Lifting Lab — Weight Check-In scheduling + compliance actions.
//
// Server actions (each wrapped in withLiftingAction):
//
//   Coach schedule management:
//     createWeightCheckInSchedule       — create a published/draft schedule
//     updateWeightCheckInSchedule       — mutate title/frequency/window/etc.
//     archiveWeightCheckInSchedule      — soft-delete (status = 'archived')
//
//   Materialization:
//     materializeWeightCheckInRequests  — expand schedule → per-athlete request rows
//
//   Player / coach entry:
//     submitBodyweightEntry             — player self-submit: writes
//                                         helm_lifting_bodyweight_entries + links request
//     coachEnterBodyweightEntry         — coach manual override, marks completed
//     excuseWeightCheckInRequest        — coach marks a pending/missed request 'excused'
//
//   Dashboard reads:
//     getCoachWeightDashboard           — completed / pending / missed count + rows
//     getPlayerBodyweightHistory        — rolling bodyweight chart data for one athlete
//
// Pattern: fromUntyped() for all 6 new tables; domain types from
// '@/lib/types/helm-lifting-checkins'; scheduling from
// '@/lib/lifting/checkin-scheduling'; overuse rules from
// '@/lib/lifting/overuse-rules'. NEVER import database.ts for these tables.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { withLiftingAction, LiftingActionError } from '@/lib/lifting/with-lifting-action';
import { materializeWindow } from '@/lib/lifting/checkin-scheduling';
import { missedCheckins } from '@/lib/lifting/overuse-rules';
import type {
  WeightCheckinSchedule,
  WeightCheckinScheduleInsert,
  WeightCheckinRequestInsert,
  WeightCheckinStatus,
  FrequencyType,
  AssignmentType,
  ScheduleStatus,
} from '@/lib/types/helm-lifting-checkins';
import type {
  HelmLiftingBodyweightEntryRow,
  HelmLiftingBodyweightEntryInsert,
} from '@/lib/types/helm-lifting-data';
import type { HelmLiftingAthleteRow } from '@/lib/types/helm-lifting';
import type { OveruseFlag, MissedCheckinEntry } from '@/lib/lifting/overuse-rules';

// -----------------------------------------------------------------------------
// Paths invalidated after mutations
// -----------------------------------------------------------------------------

const WEIGHT_COACH_PATH = '/lifting/dashboard/weight';
const WEIGHT_PLAYER_PATH = '/lifting/player/weight';
const BASEBALL_COACH_PATH = '/baseball/lifting/coach';
const BASEBALL_PLAYER_PATH = '/baseball/lifting/player';

function revalidateAll(): void {
  revalidatePath(WEIGHT_COACH_PATH);
  revalidatePath(WEIGHT_PLAYER_PATH);
  revalidatePath(BASEBALL_COACH_PATH);
  revalidatePath(BASEBALL_PLAYER_PATH);
}

// -----------------------------------------------------------------------------
// Validation primitives
// -----------------------------------------------------------------------------

const uuid = z.string().uuid();
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

// -----------------------------------------------------------------------------
// Shared schedule fields schema (used by create + update)
// -----------------------------------------------------------------------------

const scheduleFieldsSchema = z.object({
  title: z.string().trim().min(1).max(140),
  assignmentType: z.enum(['team', 'group', 'athlete'] as const satisfies readonly AssignmentType[]),
  groupId: uuid.optional().nullable(),
  athleteId: uuid.optional().nullable(),
  teamId: uuid.optional().nullable(),
  frequencyType: z.enum(['once', 'daily', 'weekly', 'custom'] as const satisfies readonly FrequencyType[]),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional().nullable(),
  startDate: ymd,
  endDate: ymd.optional().nullable(),
  dueTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Expected HH:MM or HH:MM:SS').optional().nullable(),
  dueWindowStart: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().nullable(),
  dueWindowEnd: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().nullable(),
  instructions: z.string().trim().max(1000).optional().nullable(),
  visibility: z.enum(['staff', 'performance_staff', 'head_coach_only']).optional(),
  status: z.enum(['draft', 'published', 'archived'] as const satisfies readonly ScheduleStatus[]).optional(),
});

// -----------------------------------------------------------------------------
// 1. createWeightCheckInSchedule
// -----------------------------------------------------------------------------

const createScheduleSchema = z.object({
  orgId: uuid,
  sport: z.enum(['baseball', 'golf']),
}).merge(scheduleFieldsSchema);

export interface CreateWeightScheduleResult {
  success: boolean;
  scheduleId?: string;
  error?: string;
}

export const createWeightCheckInSchedule = withLiftingAction(
  'createWeightCheckInSchedule',
  {
    featureArea: 'lifting-weight-checkins',
    requireEdit: true,
    orgFrom: (...args) => (args[0] as { orgId?: string | null })?.orgId ?? null,
  },
  async (ctx, raw: z.input<typeof createScheduleSchema>): Promise<CreateWeightScheduleResult> => {
    const input = createScheduleSchema.parse(raw);
    const supabase = await createClient();

    const { data: coach } = await fromUntyped(supabase, 'helm_lifting_coaches')
      .select('id')
      .eq('user_id', ctx.user.id)
      .eq('organization_id', ctx.orgId)
      .eq('status', 'active')
      .maybeSingle() as { data: { id: string } | null };

    const payload: WeightCheckinScheduleInsert = {
      organization_id: ctx.orgId,
      sport: input.sport,
      team_id: input.teamId ?? null,
      created_by_coach_id: coach?.id ?? null,
      title: input.title,
      assignment_type: input.assignmentType,
      group_id: input.groupId ?? null,
      athlete_id: input.athleteId ?? null,
      frequency_type: input.frequencyType,
      days_of_week: input.daysOfWeek ?? null,
      start_date: input.startDate,
      end_date: input.endDate ?? null,
      due_time: input.dueTime ?? null,
      due_window_start: input.dueWindowStart ?? null,
      due_window_end: input.dueWindowEnd ?? null,
      instructions: input.instructions ?? null,
      visibility: input.visibility ?? 'performance_staff',
      status: input.status ?? 'published',
    };

    const { data: row, error } = await fromUntyped(supabase, 'helm_lifting_weight_checkin_schedules')
      .insert(payload)
      .select('id')
      .single() as { data: { id: string } | null; error: unknown };

    if (error) throw error;
    if (!row) throw new LiftingActionError('Schedule not created.');

    revalidateAll();
    return { success: true, scheduleId: row.id };
  },
);

// -----------------------------------------------------------------------------
// 2. updateWeightCheckInSchedule
// -----------------------------------------------------------------------------

const updateScheduleSchema = z.object({
  scheduleId: uuid,
  orgId: uuid,
}).merge(scheduleFieldsSchema.partial());

export interface UpdateWeightScheduleResult {
  success: boolean;
  error?: string;
}

export const updateWeightCheckInSchedule = withLiftingAction(
  'updateWeightCheckInSchedule',
  {
    featureArea: 'lifting-weight-checkins',
    requireEdit: true,
    orgFrom: (...args) => (args[0] as { orgId?: string | null })?.orgId ?? null,
  },
  async (ctx, raw: z.input<typeof updateScheduleSchema>): Promise<UpdateWeightScheduleResult> => {
    const input = updateScheduleSchema.parse(raw);
    const supabase = await createClient();

    // Verify the schedule belongs to this org.
    const { data: existing } = await fromUntyped(supabase, 'helm_lifting_weight_checkin_schedules')
      .select('id, status')
      .eq('id', input.scheduleId)
      .eq('organization_id', ctx.orgId)
      .maybeSingle() as { data: { id: string; status: string } | null };

    if (!existing) throw new LiftingActionError('Schedule not found in this org.');
    if (existing.status === 'archived') {
      throw new LiftingActionError('Cannot update an archived schedule.');
    }

    // Build update payload — only include fields that were provided.
    // WeightCheckinSchedule has readonly fields so we use a plain mutable record
    // that fromUntyped() (typed as any) accepts without complaint.
    type SchedulePatch = {
      title?: string;
      assignment_type?: AssignmentType;
      group_id?: string | null;
      athlete_id?: string | null;
      team_id?: string | null;
      frequency_type?: FrequencyType;
      days_of_week?: number[] | null;
      start_date?: string;
      end_date?: string | null;
      due_time?: string | null;
      due_window_start?: string | null;
      due_window_end?: string | null;
      instructions?: string | null;
      visibility?: WeightCheckinSchedule['visibility'];
      status?: ScheduleStatus;
    };
    const patch: SchedulePatch = {};
    if (input.title != null) patch.title = input.title;
    if (input.assignmentType != null) patch.assignment_type = input.assignmentType;
    if (input.groupId !== undefined) patch.group_id = input.groupId ?? null;
    if (input.athleteId !== undefined) patch.athlete_id = input.athleteId ?? null;
    if (input.teamId !== undefined) patch.team_id = input.teamId ?? null;
    if (input.frequencyType != null) patch.frequency_type = input.frequencyType;
    if (input.daysOfWeek !== undefined) patch.days_of_week = input.daysOfWeek ?? null;
    if (input.startDate != null) patch.start_date = input.startDate;
    if (input.endDate !== undefined) patch.end_date = input.endDate ?? null;
    if (input.dueTime !== undefined) patch.due_time = input.dueTime ?? null;
    if (input.dueWindowStart !== undefined) patch.due_window_start = input.dueWindowStart ?? null;
    if (input.dueWindowEnd !== undefined) patch.due_window_end = input.dueWindowEnd ?? null;
    if (input.instructions !== undefined) patch.instructions = input.instructions ?? null;
    if (input.visibility != null) patch.visibility = input.visibility;
    if (input.status != null) patch.status = input.status;

    const { error } = await fromUntyped(supabase, 'helm_lifting_weight_checkin_schedules')
      .update(patch)
      .eq('id', input.scheduleId)
      .eq('organization_id', ctx.orgId);

    if (error) throw error;

    revalidateAll();
    return { success: true };
  },
);

// -----------------------------------------------------------------------------
// 3. archiveWeightCheckInSchedule
// -----------------------------------------------------------------------------

const archiveScheduleSchema = z.object({
  scheduleId: uuid,
  orgId: uuid,
});

export interface ArchiveWeightScheduleResult {
  success: boolean;
  error?: string;
}

export const archiveWeightCheckInSchedule = withLiftingAction(
  'archiveWeightCheckInSchedule',
  {
    featureArea: 'lifting-weight-checkins',
    requireEdit: true,
    orgFrom: (...args) => (args[0] as { orgId?: string | null })?.orgId ?? null,
  },
  async (ctx, raw: z.input<typeof archiveScheduleSchema>): Promise<ArchiveWeightScheduleResult> => {
    const input = archiveScheduleSchema.parse(raw);
    const supabase = await createClient();

    const { data: existing } = await fromUntyped(supabase, 'helm_lifting_weight_checkin_schedules')
      .select('id')
      .eq('id', input.scheduleId)
      .eq('organization_id', ctx.orgId)
      .maybeSingle() as { data: { id: string } | null };

    if (!existing) throw new LiftingActionError('Schedule not found in this org.');

    const { error } = await fromUntyped(supabase, 'helm_lifting_weight_checkin_schedules')
      .update({ status: 'archived' })
      .eq('id', input.scheduleId)
      .eq('organization_id', ctx.orgId);

    if (error) throw error;

    revalidateAll();
    return { success: true };
  },
);

// -----------------------------------------------------------------------------
// 4. materializeWeightCheckInRequests
//
// Expands a published schedule into per-athlete request rows for a date window.
// Safe to call repeatedly — uses ON CONFLICT DO NOTHING on the unique constraint
// (schedule_id, athlete_id, due_date).
// -----------------------------------------------------------------------------

const materializeSchema = z.object({
  scheduleId: uuid,
  orgId: uuid,
  fromDate: ymd,
  toDate: ymd,
});

export interface MaterializeWeightRequestsResult {
  success: boolean;
  inserted: number;
  error?: string;
}

export const materializeWeightCheckInRequests = withLiftingAction(
  'materializeWeightCheckInRequests',
  {
    featureArea: 'lifting-weight-checkins',
    requireEdit: true,
    orgFrom: (...args) => (args[0] as { orgId?: string | null })?.orgId ?? null,
  },
  async (ctx, raw: z.input<typeof materializeSchema>): Promise<MaterializeWeightRequestsResult> => {
    const input = materializeSchema.parse(raw);
    const supabase = await createClient();

    // Load the schedule.
    const { data: schedule } = await fromUntyped(supabase, 'helm_lifting_weight_checkin_schedules')
      .select('*')
      .eq('id', input.scheduleId)
      .eq('organization_id', ctx.orgId)
      .maybeSingle() as { data: WeightCheckinSchedule | null };

    if (!schedule) throw new LiftingActionError('Schedule not found in this org.');
    if (schedule.status !== 'published') {
      throw new LiftingActionError('Only published schedules can be materialized.');
    }

    // Resolve the athlete list for this schedule's assignment scope.
    let athleteIds: string[] = [];

    if (schedule.assignment_type === 'athlete' && schedule.athlete_id) {
      athleteIds = [schedule.athlete_id];
    } else if (schedule.assignment_type === 'group' && schedule.group_id) {
      const { data: members } = await fromUntyped(supabase, 'helm_lifting_group_members')
        .select('athlete_id')
        .eq('group_id', schedule.group_id) as { data: Array<{ athlete_id: string }> | null };
      athleteIds = (members ?? []).map((m) => m.athlete_id);
    } else {
      // team assignment — all active athletes in this org (optionally scoped to team_id)
      let q = fromUntyped(supabase, 'helm_lifting_athletes')
        .select('id')
        .eq('organization_id', ctx.orgId)
        .eq('is_active', true);
      if (schedule.team_id) q = q.eq('team_id', schedule.team_id);
      const { data: athletes } = await q as { data: Array<{ id: string }> | null };
      athleteIds = (athletes ?? []).map((a) => a.id);
    }

    if (athleteIds.length === 0) return { success: true, inserted: 0 };

    // Expand recurrence into due dates.
    const dueDates = materializeWindow(schedule, input.fromDate, input.toDate);
    if (dueDates.length === 0) return { success: true, inserted: 0 };

    // Build request rows, one per (athlete, due_date).
    const rows: WeightCheckinRequestInsert[] = [];
    for (const athleteId of athleteIds) {
      for (const dueDate of dueDates) {
        rows.push({
          schedule_id: schedule.id,
          organization_id: ctx.orgId,
          sport: schedule.sport,
          team_id: schedule.team_id ?? null,
          athlete_id: athleteId,
          due_date: dueDate,
          due_at: null,
          status: 'pending',
          bodyweight_entry_id: null,
          completed_at: null,
          reminder_sent_at: null,
        });
      }
    }

    // Batch insert in chunks of 500 (PostgREST limit safety).
    let totalInserted = 0;
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error, count } = await fromUntyped(supabase, 'helm_lifting_weight_checkin_requests')
        .insert(chunk, { count: 'exact', ignoreDuplicates: true }) as {
          error: unknown;
          count: number | null;
        };
      if (error) throw error;
      totalInserted += count ?? 0;
    }

    revalidateAll();
    return { success: true, inserted: totalInserted };
  },
);

// -----------------------------------------------------------------------------
// 5. submitBodyweightEntry
//
// Athlete self-submit: writes helm_lifting_bodyweight_entries (upsert on
// athlete_id+entry_date) and links the pending weight request, marking it
// completed.
// -----------------------------------------------------------------------------

const submitBodyweightSchema = z.object({
  athleteId: uuid,
  orgId: uuid,
  entryDate: ymd,
  weightLbs: z.number().positive().max(999),
  /** Optional link to a pending weight check-in request. */
  requestId: uuid.optional().nullable(),
});

export interface SubmitBodyweightResult {
  success: boolean;
  entryId?: string;
  error?: string;
}

export const submitBodyweightEntry = withLiftingAction(
  'submitBodyweightEntry',
  {
    featureArea: 'lifting-weight-checkins',
    requireEdit: false, // RLS athlete-self policy enforces ownership
    orgFrom: (...args) => (args[0] as { orgId?: string | null })?.orgId ?? null,
  },
  async (ctx, raw: z.input<typeof submitBodyweightSchema>): Promise<SubmitBodyweightResult> => {
    const input = submitBodyweightSchema.parse(raw);
    const supabase = await createClient();

    // Verify athlete belongs to this org.
    const { data: athlete } = await fromUntyped(supabase, 'helm_lifting_athletes')
      .select('id, sport, organization_id')
      .eq('id', input.athleteId)
      .eq('organization_id', ctx.orgId)
      .maybeSingle() as {
        data: Pick<HelmLiftingAthleteRow, 'id' | 'sport' | 'organization_id'> | null
      };

    if (!athlete) throw new LiftingActionError('Athlete not found in this org.');

    const entryPayload: HelmLiftingBodyweightEntryInsert = {
      organization_id: ctx.orgId,
      sport: athlete.sport as 'baseball' | 'golf',
      athlete_id: input.athleteId,
      entry_date: input.entryDate,
      weight_lbs: input.weightLbs,
      source: 'player',
    };

    const { data: entry, error: entryErr } = await fromUntyped(supabase, 'helm_lifting_bodyweight_entries')
      .upsert(entryPayload, { onConflict: 'athlete_id,entry_date' })
      .select('id')
      .single() as { data: HelmLiftingBodyweightEntryRow | null; error: unknown };

    if (entryErr) throw entryErr;
    if (!entry) throw new LiftingActionError('Bodyweight entry not saved.');

    const entryId = entry.id;

    // Link to the pending request and mark completed.
    if (input.requestId) {
      const { error: reqErr } = await fromUntyped(supabase, 'helm_lifting_weight_checkin_requests')
        .update({
          bodyweight_entry_id: entryId,
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', input.requestId)
        .eq('athlete_id', input.athleteId)
        .eq('organization_id', ctx.orgId)
        .in('status', ['pending', 'missed']); // only update if still open

      if (reqErr) throw reqErr;
    } else {
      // No explicit request ID — auto-link to today's pending request for this athlete if present.
      await fromUntyped(supabase, 'helm_lifting_weight_checkin_requests')
        .update({
          bodyweight_entry_id: entryId,
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('athlete_id', input.athleteId)
        .eq('organization_id', ctx.orgId)
        .eq('due_date', input.entryDate)
        .in('status', ['pending']);
    }

    revalidateAll();
    return { success: true, entryId };
  },
);

// -----------------------------------------------------------------------------
// 6. coachEnterBodyweightEntry
//
// Coach manual override: writes helm_lifting_bodyweight_entries (source='coach')
// and links the request, marking it completed.
// -----------------------------------------------------------------------------

const coachEnterBodyweightSchema = z.object({
  athleteId: uuid,
  orgId: uuid,
  entryDate: ymd,
  weightLbs: z.number().positive().max(999),
  requestId: uuid.optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
});

export interface CoachEnterBodyweightResult {
  success: boolean;
  entryId?: string;
  error?: string;
}

export const coachEnterBodyweightEntry = withLiftingAction(
  'coachEnterBodyweightEntry',
  {
    featureArea: 'lifting-weight-checkins',
    requireEdit: true,
    orgFrom: (...args) => (args[0] as { orgId?: string | null })?.orgId ?? null,
  },
  async (ctx, raw: z.input<typeof coachEnterBodyweightSchema>): Promise<CoachEnterBodyweightResult> => {
    const input = coachEnterBodyweightSchema.parse(raw);
    const supabase = await createClient();

    const { data: athlete } = await fromUntyped(supabase, 'helm_lifting_athletes')
      .select('id, sport, organization_id')
      .eq('id', input.athleteId)
      .eq('organization_id', ctx.orgId)
      .maybeSingle() as {
        data: Pick<HelmLiftingAthleteRow, 'id' | 'sport' | 'organization_id'> | null
      };

    if (!athlete) throw new LiftingActionError('Athlete not found in this org.');

    const entryPayload: HelmLiftingBodyweightEntryInsert = {
      organization_id: ctx.orgId,
      sport: athlete.sport as 'baseball' | 'golf',
      athlete_id: input.athleteId,
      entry_date: input.entryDate,
      weight_lbs: input.weightLbs,
      source: 'coach',
    };

    const { data: entry, error: entryErr } = await fromUntyped(supabase, 'helm_lifting_bodyweight_entries')
      .upsert(entryPayload, { onConflict: 'athlete_id,entry_date' })
      .select('id')
      .single() as { data: HelmLiftingBodyweightEntryRow | null; error: unknown };

    if (entryErr) throw entryErr;
    if (!entry) throw new LiftingActionError('Bodyweight entry not saved.');

    const entryId = entry.id;

    // Link request if given; also accept the specific requestId or today's open request.
    if (input.requestId) {
      await fromUntyped(supabase, 'helm_lifting_weight_checkin_requests')
        .update({
          bodyweight_entry_id: entryId,
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', input.requestId)
        .eq('organization_id', ctx.orgId)
        .in('status', ['pending', 'missed']);
    } else {
      await fromUntyped(supabase, 'helm_lifting_weight_checkin_requests')
        .update({
          bodyweight_entry_id: entryId,
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('athlete_id', input.athleteId)
        .eq('organization_id', ctx.orgId)
        .eq('due_date', input.entryDate)
        .in('status', ['pending', 'missed']);
    }

    revalidateAll();
    return { success: true, entryId };
  },
);

// -----------------------------------------------------------------------------
// 7. excuseWeightCheckInRequest
// -----------------------------------------------------------------------------

const excuseRequestSchema = z.object({
  requestId: uuid,
  orgId: uuid,
});

export interface ExcuseWeightRequestResult {
  success: boolean;
  error?: string;
}

export const excuseWeightCheckInRequest = withLiftingAction(
  'excuseWeightCheckInRequest',
  {
    featureArea: 'lifting-weight-checkins',
    requireEdit: true,
    orgFrom: (...args) => (args[0] as { orgId?: string | null })?.orgId ?? null,
  },
  async (ctx, raw: z.input<typeof excuseRequestSchema>): Promise<ExcuseWeightRequestResult> => {
    const input = excuseRequestSchema.parse(raw);
    const supabase = await createClient();

    const { data: req } = await fromUntyped(supabase, 'helm_lifting_weight_checkin_requests')
      .select('id, status')
      .eq('id', input.requestId)
      .eq('organization_id', ctx.orgId)
      .maybeSingle() as { data: { id: string; status: WeightCheckinStatus } | null };

    if (!req) throw new LiftingActionError('Request not found in this org.');
    if (req.status === 'completed') {
      throw new LiftingActionError('Cannot excuse a completed check-in.');
    }
    if (req.status === 'excused') {
      // Already excused — idempotent no-op.
      return { success: true };
    }

    const { error } = await fromUntyped(supabase, 'helm_lifting_weight_checkin_requests')
      .update({ status: 'excused' })
      .eq('id', input.requestId)
      .eq('organization_id', ctx.orgId);

    if (error) throw error;

    revalidateAll();
    return { success: true };
  },
);

// -----------------------------------------------------------------------------
// 8. getCoachWeightDashboard
//
// Returns per-athlete compliance summary for a date window plus overuse flags
// for missed check-ins (Rule 6 from overuse-rules.ts).
// -----------------------------------------------------------------------------

const dashboardSchema = z.object({
  orgId: uuid,
  sport: z.enum(['baseball', 'golf']).optional().nullable(),
  /** ISO date YYYY-MM-DD — defaults to today */
  date: ymd.optional().nullable(),
  /** How many days back to scan for missed flagging (default 7). */
  lookBackDays: z.number().int().min(1).max(30).optional(),
});

export interface WeightRequestRow {
  id: string;
  athleteId: string;
  athleteFirstName: string | null;
  athleteLastName: string | null;
  dueDate: string;
  status: WeightCheckinStatus;
  weightLbs: number | null;
  completedAt: string | null;
  scheduleTitle: string | null;
}

export interface CoachWeightDashboard {
  date: string;
  totals: {
    completed: number;
    pending: number;
    missed: number;
    excused: number;
  };
  completed: WeightRequestRow[];
  pending: WeightRequestRow[];
  missed: WeightRequestRow[];
  flags: OveruseFlag[];
}

export const getCoachWeightDashboard = withLiftingAction(
  'getCoachWeightDashboard',
  {
    featureArea: 'lifting-weight-checkins',
    requireEdit: false,
    orgFrom: (...args) => (args[0] as { orgId?: string | null })?.orgId ?? null,
  },
  async (ctx, raw: z.input<typeof dashboardSchema>): Promise<CoachWeightDashboard> => {
    const input = dashboardSchema.parse(raw);
    const date = input.date ?? new Date().toISOString().slice(0, 10);
    const lookBack = input.lookBackDays ?? 7;
    const supabase = await createClient();

    // Compute the lookback window start date.
    const windowStart = new Date(date);
    windowStart.setDate(windowStart.getDate() - lookBack + 1);
    const windowStartIso = windowStart.toISOString().slice(0, 10);

    // 1. Load today's requests with joined bodyweight entry amounts.
    const requestQuery = fromUntyped(supabase, 'helm_lifting_weight_checkin_requests')
      .select('id, athlete_id, due_date, status, bodyweight_entry_id, completed_at, schedule_id, organization_id')
      .eq('organization_id', ctx.orgId)
      .eq('due_date', date)
      .limit(1000);

    const { data: requests } = await requestQuery as {
      data: Array<{
        id: string;
        athlete_id: string;
        due_date: string;
        status: WeightCheckinStatus;
        bodyweight_entry_id: string | null;
        completed_at: string | null;
        schedule_id: string | null;
      }> | null
    };

    if (!requests || requests.length === 0) {
      return {
        date,
        totals: { completed: 0, pending: 0, missed: 0, excused: 0 },
        completed: [],
        pending: [],
        missed: [],
        flags: [],
      };
    }

    // 2. Batch-load athlete name data.
    const athleteIds = [...new Set(requests.map((r) => r.athlete_id))];
    let athleteQuery = fromUntyped(supabase, 'helm_lifting_athletes')
      .select('id, first_name, last_name, sport')
      .in('id', athleteIds);
    if (input.sport) athleteQuery = athleteQuery.eq('sport', input.sport);
    const { data: athletes } = await athleteQuery as {
      data: Array<Pick<HelmLiftingAthleteRow, 'id' | 'first_name' | 'last_name' | 'sport'>> | null
    };

    const athleteMap = new Map((athletes ?? []).map((a) => [a.id, a]));

    // 3. Batch-load bodyweight entries for completed requests.
    const entryIds = requests
      .map((r) => r.bodyweight_entry_id)
      .filter((id): id is string => id != null);

    const weightByEntry = new Map<string, number>();
    if (entryIds.length > 0) {
      const { data: entries } = await fromUntyped(supabase, 'helm_lifting_bodyweight_entries')
        .select('id, weight_lbs')
        .in('id', entryIds) as { data: Array<{ id: string; weight_lbs: number }> | null };
      for (const e of entries ?? []) {
        weightByEntry.set(e.id, e.weight_lbs);
      }
    }

    // 4. Batch-load schedule titles.
    const scheduleIds = [...new Set(requests.map((r) => r.schedule_id).filter((id): id is string => id != null))];
    const scheduleTitleMap = new Map<string, string>();
    if (scheduleIds.length > 0) {
      const { data: schedules } = await fromUntyped(supabase, 'helm_lifting_weight_checkin_schedules')
        .select('id, title')
        .in('id', scheduleIds) as { data: Array<{ id: string; title: string }> | null };
      for (const s of schedules ?? []) {
        scheduleTitleMap.set(s.id, s.title);
      }
    }

    // 5. Build typed rows.
    const toWeightRow = (r: typeof requests[number]): WeightRequestRow | null => {
      const athlete = athleteMap.get(r.athlete_id);
      if (!athlete) return null;
      return {
        id: r.id,
        athleteId: r.athlete_id,
        athleteFirstName: athlete.first_name,
        athleteLastName: athlete.last_name,
        dueDate: r.due_date,
        status: r.status,
        weightLbs: r.bodyweight_entry_id ? (weightByEntry.get(r.bodyweight_entry_id) ?? null) : null,
        completedAt: r.completed_at,
        scheduleTitle: r.schedule_id ? (scheduleTitleMap.get(r.schedule_id) ?? null) : null,
      };
    };

    const completed: WeightRequestRow[] = [];
    const pending: WeightRequestRow[] = [];
    const missed: WeightRequestRow[] = [];

    for (const req of requests) {
      const row = toWeightRow(req);
      if (!row) continue;
      if (req.status === 'completed') completed.push(row);
      else if (req.status === 'pending') pending.push(row);
      else if (req.status === 'missed') missed.push(row);
    }

    // 6. Overuse flags — missed check-ins over the lookback window.
    const { data: missedInWindow } = await fromUntyped(supabase, 'helm_lifting_weight_checkin_requests')
      .select('athlete_id, due_date')
      .eq('organization_id', ctx.orgId)
      .eq('status', 'missed')
      .gte('due_date', windowStartIso)
      .lte('due_date', date) as { data: Array<{ athlete_id: string; due_date: string }> | null };

    const missedEntries: MissedCheckinEntry[] = (missedInWindow ?? []).map((m) => ({
      athlete_id: m.athlete_id,
      due_date: m.due_date,
    }));

    const flags = missedCheckins(missedEntries, date);

    return {
      date,
      totals: {
        completed: completed.length,
        pending: pending.length,
        missed: missed.length,
        excused: requests.filter((r) => r.status === 'excused').length,
      },
      completed,
      pending,
      missed,
      flags,
    };
  },
);

// -----------------------------------------------------------------------------
// 9. getPlayerBodyweightHistory
//
// Rolling bodyweight chart data for one athlete. Returns up to 90 days of
// entries plus the most recent pending weight check-in request (if any) so
// the player UI can prompt them to submit today.
// -----------------------------------------------------------------------------

const historySchema = z.object({
  athleteId: uuid,
  orgId: uuid,
  /** ISO date — window end (defaults to today). */
  toDate: ymd.optional().nullable(),
  /** Number of days to look back (default 90). */
  days: z.number().int().min(7).max(365).optional(),
});

export interface BodyweightDataPoint {
  entryDate: string;
  weightLbs: number;
  source: 'player' | 'coach' | 'import';
}

export interface PlayerBodyweightHistory {
  athleteId: string;
  entries: BodyweightDataPoint[];
  /** The open (pending) request for today, if any — prompts the player to submit. */
  pendingRequestId: string | null;
  pendingDueDate: string | null;
}

export const getPlayerBodyweightHistory = withLiftingAction(
  'getPlayerBodyweightHistory',
  {
    featureArea: 'lifting-weight-checkins',
    requireEdit: false,
    orgFrom: (...args) => (args[0] as { orgId?: string | null })?.orgId ?? null,
  },
  async (ctx, raw: z.input<typeof historySchema>): Promise<PlayerBodyweightHistory> => {
    const input = historySchema.parse(raw);
    const supabase = await createClient();

    const toDate = input.toDate ?? new Date().toISOString().slice(0, 10);
    const lookBackDays = input.days ?? 90;
    const fromDate = new Date(toDate);
    fromDate.setDate(fromDate.getDate() - lookBackDays + 1);
    const fromDateIso = fromDate.toISOString().slice(0, 10);

    // Verify athlete is in this org.
    const { data: athlete } = await fromUntyped(supabase, 'helm_lifting_athletes')
      .select('id, organization_id')
      .eq('id', input.athleteId)
      .eq('organization_id', ctx.orgId)
      .maybeSingle() as { data: { id: string; organization_id: string } | null };

    if (!athlete) throw new LiftingActionError('Athlete not found in this org.');

    // Load bodyweight entries in the window.
    const { data: entries } = await fromUntyped(supabase, 'helm_lifting_bodyweight_entries')
      .select('entry_date, weight_lbs, source')
      .eq('athlete_id', input.athleteId)
      .eq('organization_id', ctx.orgId)
      .gte('entry_date', fromDateIso)
      .lte('entry_date', toDate)
      .order('entry_date', { ascending: true })
      .limit(366) as {
        data: Array<{
          entry_date: string;
          weight_lbs: number;
          source: 'player' | 'coach' | 'import';
        }> | null
      };

    // Load today's pending weight check-in request (if any).
    const { data: pendingReq } = await fromUntyped(supabase, 'helm_lifting_weight_checkin_requests')
      .select('id, due_date')
      .eq('athlete_id', input.athleteId)
      .eq('organization_id', ctx.orgId)
      .eq('due_date', toDate)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle() as { data: { id: string; due_date: string } | null };

    const dataPoints: BodyweightDataPoint[] = (entries ?? []).map((e) => ({
      entryDate: e.entry_date,
      weightLbs: e.weight_lbs,
      source: e.source,
    }));

    return {
      athleteId: input.athleteId,
      entries: dataPoints,
      pendingRequestId: pendingReq?.id ?? null,
      pendingDueDate: pendingReq?.due_date ?? null,
    };
  },
);

'use server';

// =============================================================================
// src/app/lifting/actions/soreness.ts
//
// Helm Lifting Lab — Soreness Check Scheduling + Submission (spec §4–§5, §13).
//
// Exported actions:
//   createSorenessCheckSchedule       — coach creates a draft schedule
//   updateSorenessCheckSchedule       — coach edits title/freq/assignment/etc
//   archiveSorenessCheckSchedule      — soft-delete (status → 'archived')
//   materializeSorenessCheckRequests  — fan a published schedule to athletes
//   submitReadyToGo                   — player one-tap ready (soreness_status='ready_to_go')
//   submitSorenessMap                 — player reports body regions + severity
//   excuseSorenessCheckRequest        — coach excuses a pending/missed request
//   getPlayerSorenessToday            — player self: pending request + last checkin
//   getCoachSorenessDashboard         — compliance counts + overuse flags
//   getPlayerSorenessHistory          — rolling history for player profile
//
// All writes use withLiftingAction (auth + org + edit-gate).
// New tables accessed via fromUntyped only — NEVER added to database.ts.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { withLiftingAction, LiftingActionError } from '@/lib/lifting/with-lifting-action';
import { materializeWindow } from '@/lib/lifting/checkin-scheduling';
import { runAllOveruseRules } from '@/lib/lifting/overuse-rules';
import type { SorenessMapEntry, MissedCheckinEntry, OveruseFlag } from '@/lib/lifting/overuse-rules';
import type { SorenessRegionId } from '@/lib/lifting/soreness-regions';
import { SORENESS_REGIONS, isSorenessRegionId } from '@/lib/lifting/soreness-regions';
import type {
  SorenessCheckSchedule,
  SorenessCheckScheduleInsert,
  SorenessCheckRequest,
  SorenessCheckRequestInsert,
  AssignmentType,
  FrequencyType,
  BodyFocus,
  SorenessVisibility,
  SorenessCheckinStatus,
  SorenessStatus,
  SubmittedFrom,
} from '@/lib/types/helm-lifting-checkins';
import type {
  HelmLiftingReadinessCheckinInsert,
  HelmLiftingSorenessMapInsert,
  HelmLiftingReadinessBand,
} from '@/lib/types/helm-lifting-data';
import type { HelmLiftingAthleteRow } from '@/lib/types/helm-lifting';

// -----------------------------------------------------------------------------
// Revalidation paths
// -----------------------------------------------------------------------------

const LIFTING_PATHS = [
  '/lifting/dashboard',
  '/lifting/dashboard/soreness',
  '/baseball/performance',
  '/baseball/player/today',
] as const;

function revalidateAll() {
  for (const p of LIFTING_PATHS) revalidatePath(p);
}

// -----------------------------------------------------------------------------
// Module-private: compute readiness band + score from soreness-path inputs.
//
// The full readiness check-in (readiness.ts) supplies sleep/energy/stress data.
// Here we only have soreness map data, so we derive a band from:
//   - sorenessOverall (0-10 scale: 0 = none, 10 = severe)
//   - hasUpperSoreness / hasLowerSoreness derived from submitted region groups
//
// Thresholds are intentionally conservative — sparse inputs default to yellow.
// -----------------------------------------------------------------------------

function computeSorenessReadiness(
  sorenessOverall: number,
  hasUpperSoreness: boolean,
  hasLowerSoreness: boolean,
): { score: number; band: HelmLiftingReadinessBand } {
  // Remap 0-10 severity to the 1-5 internal scale (1=no soreness, 5=severe).
  const sore1to5 = Math.max(1, Math.min(5, 1 + Math.round((sorenessOverall / 10) * 4)));
  // Inverted: low soreness → high score (mirrors readiness.ts computeReadinessScore).
  const score = Math.round((6 - sore1to5) * 10) / 10;

  let band: HelmLiftingReadinessBand;
  if (sorenessOverall >= 8) {
    // Severe soreness → hold and review regardless of region.
    band = 'red';
  } else if (sorenessOverall >= 6 && hasUpperSoreness && hasLowerSoreness) {
    // Significant multi-region soreness → red.
    band = 'red';
  } else if (sorenessOverall >= 5 && hasUpperSoreness) {
    band = 'orange_upper';
  } else if (sorenessOverall >= 5 && hasLowerSoreness) {
    band = 'orange_lower';
  } else if (score >= 4.5) {
    band = 'green';
  } else if (score >= 3.5) {
    band = 'yellow';
  } else if (score >= 2.5) {
    band = hasUpperSoreness ? 'orange_upper' : 'orange_lower';
  } else if (score >= 1.5) {
    band = hasUpperSoreness ? 'orange_upper' : 'orange_lower';
  } else {
    band = 'red';
  }

  return { score, band };
}

// -----------------------------------------------------------------------------
// Shared validators
// -----------------------------------------------------------------------------

const uuid = z.string().uuid();
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

// =============================================================================
// 1. createSorenessCheckSchedule
// =============================================================================

const createScheduleSchema = z.object({
  orgId: uuid,
  sport: z.enum(['baseball', 'golf']),
  teamId: uuid.optional().nullable(),
  title: z.string().trim().min(1).max(200),
  assignmentType: z.enum(['team', 'group', 'athlete'] satisfies [AssignmentType, ...AssignmentType[]]),
  groupId: uuid.optional().nullable(),
  athleteId: uuid.optional().nullable(),
  frequencyType: z.enum(['once', 'daily', 'weekly', 'custom'] satisfies [FrequencyType, ...FrequencyType[]]),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional().nullable(),
  startDate: ymd,
  endDate: ymd.optional().nullable(),
  dueTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().nullable(),
  dueWindowStart: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().nullable(),
  dueWindowEnd: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().nullable(),
  bodyFocus: z.enum(['full_body', 'throwing_arm', 'lower_body', 'custom'] satisfies [BodyFocus, ...BodyFocus[]]).optional(),
  customRegions: z.array(z.string().trim().max(80)).max(30).optional().nullable(),
  instructions: z.string().trim().max(1000).optional().nullable(),
  visibility: z.enum(['staff', 'performance_staff', 'head_coach_only'] satisfies [SorenessVisibility, ...SorenessVisibility[]]).optional(),
  publishImmediately: z.boolean().optional(),
});

export interface CreateSorenessCheckScheduleResult {
  success: boolean;
  scheduleId?: string;
  error?: string;
}

export const createSorenessCheckSchedule = withLiftingAction(
  'createSorenessCheckSchedule',
  {
    featureArea: 'lifting-soreness',
    requireEdit: true,
    orgFrom: (...args) => (args[0] as { orgId?: string })?.orgId,
  },
  async (ctx, raw: z.input<typeof createScheduleSchema>): Promise<CreateSorenessCheckScheduleResult> => {
    const input = createScheduleSchema.parse(raw);
    const supabase = await createClient();

    const payload: SorenessCheckScheduleInsert = {
      organization_id: ctx.orgId,
      sport: input.sport,
      team_id: input.teamId ?? null,
      created_by_coach_id: ctx.user.id,
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
      body_focus: input.bodyFocus ?? 'full_body',
      custom_regions: input.customRegions ?? null,
      instructions: input.instructions ?? null,
      visibility: input.visibility ?? 'performance_staff',
      status: input.publishImmediately ? 'published' : 'draft',
    };

    const { data: row, error } = await fromUntyped(supabase, 'helm_lifting_soreness_check_schedules')
      .insert(payload)
      .select('id')
      .single() as { data: { id: string } | null; error: unknown };

    if (error) throw error;
    if (!row) throw new LiftingActionError('Failed to create schedule.');

    revalidateAll();
    return { success: true, scheduleId: row.id };
  },
);

// =============================================================================
// 2. updateSorenessCheckSchedule
// =============================================================================

const updateScheduleSchema = z.object({
  orgId: uuid,
  scheduleId: uuid,
  title: z.string().trim().min(1).max(200).optional(),
  assignmentType: z.enum(['team', 'group', 'athlete'] satisfies [AssignmentType, ...AssignmentType[]]).optional(),
  groupId: uuid.optional().nullable(),
  athleteId: uuid.optional().nullable(),
  frequencyType: z.enum(['once', 'daily', 'weekly', 'custom'] satisfies [FrequencyType, ...FrequencyType[]]).optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional().nullable(),
  startDate: ymd.optional(),
  endDate: ymd.optional().nullable(),
  dueTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().nullable(),
  dueWindowStart: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().nullable(),
  dueWindowEnd: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().nullable(),
  bodyFocus: z.enum(['full_body', 'throwing_arm', 'lower_body', 'custom'] satisfies [BodyFocus, ...BodyFocus[]]).optional(),
  customRegions: z.array(z.string().trim().max(80)).max(30).optional().nullable(),
  instructions: z.string().trim().max(1000).optional().nullable(),
  visibility: z.enum(['staff', 'performance_staff', 'head_coach_only'] satisfies [SorenessVisibility, ...SorenessVisibility[]]).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
});

export interface UpdateSorenessCheckScheduleResult {
  success: boolean;
  error?: string;
}

export const updateSorenessCheckSchedule = withLiftingAction(
  'updateSorenessCheckSchedule',
  {
    featureArea: 'lifting-soreness',
    requireEdit: true,
    orgFrom: (...args) => (args[0] as { orgId?: string })?.orgId,
  },
  async (ctx, raw: z.input<typeof updateScheduleSchema>): Promise<UpdateSorenessCheckScheduleResult> => {
    const input = updateScheduleSchema.parse(raw);
    const supabase = await createClient();

    // Build a partial update payload — only include keys the caller supplied.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    if (input.title !== undefined) patch.title = input.title;
    if (input.assignmentType !== undefined) patch.assignment_type = input.assignmentType;
    if (input.groupId !== undefined) patch.group_id = input.groupId;
    if (input.athleteId !== undefined) patch.athlete_id = input.athleteId;
    if (input.frequencyType !== undefined) patch.frequency_type = input.frequencyType;
    if (input.daysOfWeek !== undefined) patch.days_of_week = input.daysOfWeek;
    if (input.startDate !== undefined) patch.start_date = input.startDate;
    if (input.endDate !== undefined) patch.end_date = input.endDate;
    if (input.dueTime !== undefined) patch.due_time = input.dueTime;
    if (input.dueWindowStart !== undefined) patch.due_window_start = input.dueWindowStart;
    if (input.dueWindowEnd !== undefined) patch.due_window_end = input.dueWindowEnd;
    if (input.bodyFocus !== undefined) patch.body_focus = input.bodyFocus;
    if (input.customRegions !== undefined) patch.custom_regions = input.customRegions;
    if (input.instructions !== undefined) patch.instructions = input.instructions;
    if (input.visibility !== undefined) patch.visibility = input.visibility;
    if (input.status !== undefined) patch.status = input.status;

    const { error } = await fromUntyped(supabase, 'helm_lifting_soreness_check_schedules')
      .update(patch)
      .eq('id', input.scheduleId)
      .eq('organization_id', ctx.orgId) as { error: unknown };

    if (error) throw error;

    revalidateAll();
    return { success: true };
  },
);

// =============================================================================
// 3. archiveSorenessCheckSchedule
// =============================================================================

const archiveScheduleSchema = z.object({
  orgId: uuid,
  scheduleId: uuid,
});

export interface ArchiveSorenessCheckScheduleResult {
  success: boolean;
  error?: string;
}

export const archiveSorenessCheckSchedule = withLiftingAction(
  'archiveSorenessCheckSchedule',
  {
    featureArea: 'lifting-soreness',
    requireEdit: true,
    orgFrom: (...args) => (args[0] as { orgId?: string })?.orgId,
  },
  async (ctx, raw: z.input<typeof archiveScheduleSchema>): Promise<ArchiveSorenessCheckScheduleResult> => {
    const input = archiveScheduleSchema.parse(raw);
    const supabase = await createClient();

    const { error } = await fromUntyped(supabase, 'helm_lifting_soreness_check_schedules')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('id', input.scheduleId)
      .eq('organization_id', ctx.orgId) as { error: unknown };

    if (error) throw error;

    revalidateAll();
    return { success: true };
  },
);

// =============================================================================
// 4. materializeSorenessCheckRequests
//    Fan a published schedule into helm_lifting_soreness_check_requests rows for
//    every athlete in scope, for each due date in the window.
// =============================================================================

const materializeSchema = z.object({
  orgId: uuid,
  scheduleId: uuid,
  /** Window start, inclusive (YYYY-MM-DD). Defaults to schedule.start_date. */
  fromDate: ymd.optional().nullable(),
  /** Window end, inclusive (YYYY-MM-DD). Defaults to 30 days from today. */
  toDate: ymd.optional().nullable(),
});

export interface MaterializeSorenessCheckRequestsResult {
  success: boolean;
  inserted: number;
  skipped: number;
  error?: string;
}

export const materializeSorenessCheckRequests = withLiftingAction(
  'materializeSorenessCheckRequests',
  {
    featureArea: 'lifting-soreness',
    requireEdit: true,
    orgFrom: (...args) => (args[0] as { orgId?: string })?.orgId,
  },
  async (ctx, raw: z.input<typeof materializeSchema>): Promise<MaterializeSorenessCheckRequestsResult> => {
    const input = materializeSchema.parse(raw);
    const supabase = await createClient();

    // 1. Load schedule and verify it belongs to this org + is published.
    const { data: schedule } = await fromUntyped(supabase, 'helm_lifting_soreness_check_schedules')
      .select('*')
      .eq('id', input.scheduleId)
      .eq('organization_id', ctx.orgId)
      .maybeSingle() as { data: SorenessCheckSchedule | null };

    if (!schedule) throw new LiftingActionError('Schedule not found.');
    if (schedule.status !== 'published') {
      throw new LiftingActionError('Schedule must be published before materializing requests.');
    }

    // 2. Expand due dates via checkin-scheduling.
    const today = new Date().toISOString().slice(0, 10);
    const defaultTo = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    const fromDate = input.fromDate ?? schedule.start_date;
    const toDate = input.toDate ?? defaultTo;

    const dueDates = materializeWindow(
      {
        frequency_type: schedule.frequency_type,
        days_of_week: schedule.days_of_week,
        start_date: schedule.start_date,
        end_date: schedule.end_date,
      },
      fromDate,
      toDate,
    );

    if (dueDates.length === 0) {
      return { success: true, inserted: 0, skipped: 0 };
    }

    // 3. Resolve target athlete IDs based on assignment_type.
    let athleteIds: string[] = [];

    if (schedule.assignment_type === 'athlete' && schedule.athlete_id) {
      athleteIds = [schedule.athlete_id];
    } else if (schedule.assignment_type === 'group' && schedule.group_id) {
      const { data: members } = await fromUntyped(supabase, 'helm_lifting_group_members')
        .select('athlete_id')
        .eq('group_id', schedule.group_id)
        .eq('organization_id', ctx.orgId) as { data: Array<{ athlete_id: string }> | null };
      athleteIds = (members ?? []).map((m) => m.athlete_id);
    } else {
      // 'team' assignment — all active athletes for this org (filtered by team if set).
      let q = fromUntyped(supabase, 'helm_lifting_athletes')
        .select('id')
        .eq('organization_id', ctx.orgId)
        .eq('is_active', true);
      if (schedule.sport) q = q.eq('sport', schedule.sport);
      const { data: athletes } = await q as { data: Array<{ id: string }> | null };
      athleteIds = (athletes ?? []).map((a) => a.id);
    }

    if (athleteIds.length === 0) {
      return { success: true, inserted: 0, skipped: 0 };
    }

    // 4. Build request rows — one per (athlete, due_date).
    const rows: SorenessCheckRequestInsert[] = [];
    for (const dueDate of dueDates) {
      for (const athleteId of athleteIds) {
        rows.push({
          schedule_id: schedule.id,
          organization_id: ctx.orgId,
          sport: schedule.sport,
          team_id: schedule.team_id ?? null,
          athlete_id: athleteId,
          due_date: dueDate,
          due_at: null, // callers may backfill from due_window_start if needed
          status: dueDate < today ? 'missed' : 'pending',
          readiness_checkin_id: null,
          completed_at: null,
          reminder_sent_at: null,
        });
      }
    }

    // 5. Batch upsert (unique constraint uq_helm_lifting_soreness_request handles idempotency).
    const BATCH = 200;
    let inserted = 0;
    let skipped = 0;

    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const { data: upserted, error: upsertErr } = await fromUntyped(
        supabase,
        'helm_lifting_soreness_check_requests',
      )
        .upsert(chunk, { onConflict: 'schedule_id,athlete_id,due_date', ignoreDuplicates: true })
        .select('id') as { data: Array<{ id: string }> | null; error: unknown };

      if (upsertErr) throw upsertErr;
      inserted += upserted?.length ?? 0;
      skipped += chunk.length - (upserted?.length ?? 0);
    }

    revalidateAll();
    return { success: true, inserted, skipped };
  },
);

// =============================================================================
// 5. submitReadyToGo
//    Player one-tap fast path: soreness_status='ready_to_go', soreness_overall=0.
// =============================================================================

const submitReadyToGoSchema = z.object({
  orgId: uuid,
  athleteId: uuid,
  checkinDate: ymd,
  requestId: uuid.optional().nullable(),
  submittedFrom: z.enum(['player_today', 'lift_session', 'coach_entry'] satisfies [SubmittedFrom, ...SubmittedFrom[]]).optional(),
});

export interface SubmitReadyToGoResult {
  success: boolean;
  checkinId?: string;
  error?: string;
}

export const submitReadyToGo = withLiftingAction(
  'submitReadyToGo',
  {
    featureArea: 'lifting-soreness',
    requireEdit: false,
    orgFrom: (...args) => (args[0] as { orgId?: string })?.orgId,
  },
  async (ctx, raw: z.input<typeof submitReadyToGoSchema>): Promise<SubmitReadyToGoResult> => {
    const input = submitReadyToGoSchema.parse(raw);
    const supabase = await createClient();

    // Verify athlete belongs to this org.
    const { data: athlete } = await fromUntyped(supabase, 'helm_lifting_athletes')
      .select('id, organization_id, sport')
      .eq('id', input.athleteId)
      .eq('organization_id', ctx.orgId)
      .maybeSingle() as { data: Pick<HelmLiftingAthleteRow, 'id' | 'organization_id' | 'sport'> | null };

    if (!athlete) throw new LiftingActionError('Athlete not found in this org.');

    // Upsert a readiness checkin with soreness_status='ready_to_go'.
    const sorenessStatus: SorenessStatus = 'ready_to_go';
    const submittedFrom: SubmittedFrom = input.submittedFrom ?? 'player_today';

    // "Ready to go" means no soreness at all — compute band upfront so the coach
    // readiness board shows a color instead of a blank cell.
    const { score: readinessScore, band: readinessBand } = computeSorenessReadiness(0, false, false);

    const checkinPayload: HelmLiftingReadinessCheckinInsert & {
      soreness_status: SorenessStatus;
      submitted_from: SubmittedFrom;
    } = {
      organization_id: ctx.orgId,
      sport: athlete.sport as 'baseball' | 'golf',
      athlete_id: input.athleteId,
      checkin_date: input.checkinDate,
      soreness_overall: 0,
      readiness_score: readinessScore,
      readiness_band: readinessBand,
      visibility: 'performance_staff',
      soreness_status: sorenessStatus,
      submitted_from: submittedFrom,
    };

    const { data: checkin, error: checkinErr } = await fromUntyped(
      supabase,
      'helm_lifting_readiness_checkins',
    )
      .upsert(checkinPayload, { onConflict: 'athlete_id,checkin_date' })
      .select('id')
      .single() as { data: { id: string } | null; error: unknown };

    if (checkinErr) throw checkinErr;
    if (!checkin) throw new LiftingActionError('Failed to save check-in.');

    const checkinId = checkin.id;

    // Mark the soreness request completed if one was supplied.
    if (input.requestId) {
      await fromUntyped(supabase, 'helm_lifting_soreness_check_requests')
        .update({
          status: 'ready_to_go' satisfies SorenessCheckinStatus,
          readiness_checkin_id: checkinId,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.requestId)
        .eq('organization_id', ctx.orgId);
    }

    revalidateAll();
    return { success: true, checkinId };
  },
);

// =============================================================================
// 6. submitSorenessMap
//    Player reports specific body regions. Writes soreness_maps rows +
//    readiness checkin with soreness_status='reported_soreness'.
// =============================================================================

const sorenessRegionItemSchema = z.object({
  regionId: z.string().trim().max(80),
  severity: z.number().int().min(0).max(10),
  tags: z.array(z.string().trim().max(50)).max(10).optional(),
  note: z.string().trim().max(400).optional().nullable(),
});

const submitSorenessMapSchema = z.object({
  orgId: uuid,
  athleteId: uuid,
  checkinDate: ymd,
  requestId: uuid.optional().nullable(),
  regions: z.array(sorenessRegionItemSchema).min(1).max(30),
  sorenessOverall: z.number().int().min(0).max(10).optional().nullable(),
  submittedFrom: z.enum(['player_today', 'lift_session', 'coach_entry'] satisfies [SubmittedFrom, ...SubmittedFrom[]]).optional(),
});

export interface SubmitSorenessMapResult {
  success: boolean;
  checkinId?: string;
  regionCount?: number;
  error?: string;
}

export const submitSorenessMap = withLiftingAction(
  'submitSorenessMap',
  {
    featureArea: 'lifting-soreness',
    requireEdit: false,
    orgFrom: (...args) => (args[0] as { orgId?: string })?.orgId,
  },
  async (ctx, raw: z.input<typeof submitSorenessMapSchema>): Promise<SubmitSorenessMapResult> => {
    const input = submitSorenessMapSchema.parse(raw);
    const supabase = await createClient();

    // Verify athlete.
    const { data: athlete } = await fromUntyped(supabase, 'helm_lifting_athletes')
      .select('id, organization_id, sport')
      .eq('id', input.athleteId)
      .eq('organization_id', ctx.orgId)
      .maybeSingle() as { data: Pick<HelmLiftingAthleteRow, 'id' | 'organization_id' | 'sport'> | null };

    if (!athlete) throw new LiftingActionError('Athlete not found in this org.');

    // Validate all regionIds are known.
    const unknownRegions = input.regions
      .map((r) => r.regionId)
      .filter((id) => !isSorenessRegionId(id));
    if (unknownRegions.length > 0) {
      throw new LiftingActionError(`Unknown soreness region(s): ${unknownRegions.join(', ')}`);
    }

    // Derive overall soreness: max severity among reported regions (if not supplied).
    const maxSeverity = Math.max(...input.regions.map((r) => r.severity));
    const sorenessOverall = input.sorenessOverall ?? maxSeverity;

    // Upsert readiness checkin with soreness_status='reported_soreness'.
    const sorenessStatus: SorenessStatus = 'reported_soreness';
    const submittedFrom: SubmittedFrom = input.submittedFrom ?? 'player_today';

    // Derive region-type flags for band computation. All regionIds are validated above.
    const hasUpperSoreness = input.regions.some(
      (r) => SORENESS_REGIONS[r.regionId as SorenessRegionId].group === 'upper_body',
    );
    const hasLowerSoreness = input.regions.some(
      (r) => SORENESS_REGIONS[r.regionId as SorenessRegionId].group === 'lower_body',
    );
    const { score: readinessScore, band: readinessBand } = computeSorenessReadiness(
      sorenessOverall,
      hasUpperSoreness,
      hasLowerSoreness,
    );

    const checkinPayload: HelmLiftingReadinessCheckinInsert & {
      soreness_status: SorenessStatus;
      submitted_from: SubmittedFrom;
    } = {
      organization_id: ctx.orgId,
      sport: athlete.sport as 'baseball' | 'golf',
      athlete_id: input.athleteId,
      checkin_date: input.checkinDate,
      soreness_overall: sorenessOverall,
      readiness_score: readinessScore,
      readiness_band: readinessBand,
      visibility: 'performance_staff',
      soreness_status: sorenessStatus,
      submitted_from: submittedFrom,
    };

    const { data: checkin, error: checkinErr } = await fromUntyped(
      supabase,
      'helm_lifting_readiness_checkins',
    )
      .upsert(checkinPayload, { onConflict: 'athlete_id,checkin_date' })
      .select('id')
      .single() as { data: { id: string } | null; error: unknown };

    if (checkinErr) throw checkinErr;
    if (!checkin) throw new LiftingActionError('Failed to save check-in.');

    const checkinId = checkin.id;

    // Replace this checkin's soreness rows with a NON-DESTRUCTIVE stage-and-swap:
    // capture the prior row ids, write the new rows, and only THEN retire the
    // prior set. If the insert fails we never wiped anything; if the delete
    // fails we hold a recoverable superset — never a data-loss window.
    // (Hard rule: no delete-then-reinsert in a save/submit/sync path.)
    const { data: priorMapRows } = (await fromUntyped(supabase, 'helm_lifting_soreness_maps')
      .select('id')
      .eq('checkin_id', checkinId)) as { data: { id: string }[] | null };
    const priorMapIds = (priorMapRows ?? []).map((row) => row.id);

    const sorenessPayloads: HelmLiftingSorenessMapInsert[] = input.regions.map((item) => {
      // We already validated regionId is a known key above.
      const regionId = item.regionId as SorenessRegionId;
      return {
        checkin_id: checkinId,
        organization_id: ctx.orgId,
        sport: athlete.sport as 'baseball' | 'golf',
        athlete_id: input.athleteId,
        body_region: regionId,
        side: 'center', // side resolved from SORENESS_REGIONS by the UI; stored here as fallback
        severity: item.severity,
        note: item.note ?? null,
      };
    });

    if (sorenessPayloads.length > 0) {
      const { error: mapErr } = (await fromUntyped(supabase, 'helm_lifting_soreness_maps')
        .insert(sorenessPayloads)) as { error: unknown };

      if (mapErr) throw mapErr;
    }

    // New rows are safely persisted (or there were none) — now retire the prior set.
    if (priorMapIds.length > 0) {
      await fromUntyped(supabase, 'helm_lifting_soreness_maps')
        .delete()
        .in('id', priorMapIds);
    }

    // Mark the soreness request completed.
    if (input.requestId) {
      await fromUntyped(supabase, 'helm_lifting_soreness_check_requests')
        .update({
          status: 'completed' satisfies SorenessCheckinStatus,
          readiness_checkin_id: checkinId,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.requestId)
        .eq('organization_id', ctx.orgId);
    }

    revalidateAll();
    return { success: true, checkinId, regionCount: input.regions.length };
  },
);

// =============================================================================
// 7. excuseSorenessCheckRequest
// =============================================================================

const excuseSchema = z.object({
  orgId: uuid,
  requestId: uuid,
  reason: z.string().trim().max(500).optional().nullable(),
});

export interface ExcuseSorenessCheckRequestResult {
  success: boolean;
  error?: string;
}

export const excuseSorenessCheckRequest = withLiftingAction(
  'excuseSorenessCheckRequest',
  {
    featureArea: 'lifting-soreness',
    requireEdit: true,
    orgFrom: (...args) => (args[0] as { orgId?: string })?.orgId,
  },
  async (ctx, raw: z.input<typeof excuseSchema>): Promise<ExcuseSorenessCheckRequestResult> => {
    const input = excuseSchema.parse(raw);
    const supabase = await createClient();

    const { error } = await fromUntyped(supabase, 'helm_lifting_soreness_check_requests')
      .update({
        status: 'excused' satisfies SorenessCheckinStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.requestId)
      .eq('organization_id', ctx.orgId) as { error: unknown };

    if (error) throw error;

    revalidateAll();
    return { success: true };
  },
);

// =============================================================================
// 8. getPlayerSorenessToday
//    Player self: returns today's pending soreness request (if any) + last checkin.
// =============================================================================

const playerTodaySchema = z.object({
  orgId: uuid,
  athleteId: uuid,
  date: ymd.optional().nullable(),
});

export interface PlayerSoreness {
  request: SorenessCheckRequest | null;
  checkin: {
    id: string;
    checkin_date: string;
    soreness_overall: number | null;
    soreness_status: string | null;
    submitted_from: string | null;
  } | null;
  sorenessMapRegions: Array<{
    body_region: string;
    severity: number;
    note: string | null;
  }>;
}

export const getPlayerSorenessToday = withLiftingAction(
  'getPlayerSorenessToday',
  {
    featureArea: 'lifting-soreness',
    requireEdit: false,
    orgFrom: (...args) => (args[0] as { orgId?: string })?.orgId,
  },
  async (ctx, raw: z.input<typeof playerTodaySchema>): Promise<PlayerSoreness> => {
    const input = playerTodaySchema.parse(raw);
    const supabase = await createClient();
    const date = input.date ?? new Date().toISOString().slice(0, 10);

    // Load today's pending soreness check request.
    const { data: request } = await fromUntyped(supabase, 'helm_lifting_soreness_check_requests')
      .select('*')
      .eq('athlete_id', input.athleteId)
      .eq('organization_id', ctx.orgId)
      .eq('due_date', date)
      .in('status', ['pending', 'ready_to_go', 'completed'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle() as { data: SorenessCheckRequest | null };

    // Load today's readiness checkin.
    const { data: checkin } = await fromUntyped(supabase, 'helm_lifting_readiness_checkins')
      .select('id, checkin_date, soreness_overall, soreness_status, submitted_from')
      .eq('athlete_id', input.athleteId)
      .eq('organization_id', ctx.orgId)
      .eq('checkin_date', date)
      .maybeSingle() as {
        data: {
          id: string;
          checkin_date: string;
          soreness_overall: number | null;
          soreness_status: string | null;
          submitted_from: string | null;
        } | null;
      };

    // Load soreness map regions if there's a checkin.
    let sorenessMapRegions: Array<{ body_region: string; severity: number; note: string | null }> = [];
    if (checkin) {
      const { data: mapRows } = await fromUntyped(supabase, 'helm_lifting_soreness_maps')
        .select('body_region, severity, note')
        .eq('checkin_id', checkin.id) as {
          data: Array<{ body_region: string; severity: number; note: string | null }> | null;
        };
      sorenessMapRegions = mapRows ?? [];
    }

    return { request, checkin, sorenessMapRegions };
  },
);

// =============================================================================
// 9. getCoachSorenessDashboard
//    Compliance counts for today + overuse flags for the org.
// =============================================================================

const coachDashboardSchema = z.object({
  orgId: uuid,
  sport: z.enum(['baseball', 'golf']).optional().nullable(),
  date: ymd.optional().nullable(),
  pitcherPositionCodes: z.array(z.string()).optional(),
});

export interface SorenessComplianceCounts {
  total: number;
  readyToGo: number;
  reportedSoreness: number;
  pending: number;
  missed: number;
  excused: number;
}

export interface AthleteRequestSummary {
  athleteId: string;
  firstName: string;
  lastName: string;
  position: string | null;
  request: SorenessCheckRequest;
  sorenessStatus: string | null;
  maxSeverity: number | null;
  regions: Array<{ body_region: string; severity: number }>;
  flags: OveruseFlag[];
}

export interface CoachSorenessDashboard {
  date: string;
  compliance: SorenessComplianceCounts;
  highPriority: AthleteRequestSummary[];
  allRequests: AthleteRequestSummary[];
}

export const getCoachSorenessDashboard = withLiftingAction(
  'getCoachSorenessDashboard',
  {
    featureArea: 'lifting-soreness',
    requireEdit: false,
    orgFrom: (...args) => (args[0] as { orgId?: string })?.orgId,
  },
  async (ctx, raw: z.input<typeof coachDashboardSchema>): Promise<CoachSorenessDashboard> => {
    const input = coachDashboardSchema.parse(raw);
    const supabase = await createClient();
    const date = input.date ?? new Date().toISOString().slice(0, 10);

    // ── Load today's soreness check requests ─────────────────────────────────
    let requestQuery = fromUntyped(supabase, 'helm_lifting_soreness_check_requests')
      .select('*')
      .eq('organization_id', ctx.orgId)
      .eq('due_date', date)
      .limit(500);

    if (input.sport) requestQuery = requestQuery.eq('sport', input.sport);

    const { data: requests } = await requestQuery as { data: SorenessCheckRequest[] | null };
    const todayRequests = requests ?? [];

    // ── Load athletes for name/position ──────────────────────────────────────
    const athleteIds = [...new Set(todayRequests.map((r) => r.athlete_id))];
    const athleteMap = new Map<string, Pick<HelmLiftingAthleteRow, 'id' | 'first_name' | 'last_name' | 'position' | 'sport'>>();

    if (athleteIds.length > 0) {
      const { data: athletes } = await fromUntyped(supabase, 'helm_lifting_athletes')
        .select('id, first_name, last_name, position, sport')
        .in('id', athleteIds) as {
          data: Array<Pick<HelmLiftingAthleteRow, 'id' | 'first_name' | 'last_name' | 'position' | 'sport'>> | null;
        };
      for (const a of athletes ?? []) athleteMap.set(a.id, a);
    }

    // ── Load today's readiness checkins + soreness maps ──────────────────────
    const checkinIds: string[] = [];
    const checkinByAthlete = new Map<string, { id: string; soreness_status: string | null }>();

    if (athleteIds.length > 0) {
      const { data: checkins } = await fromUntyped(supabase, 'helm_lifting_readiness_checkins')
        .select('id, athlete_id, soreness_status')
        .in('athlete_id', athleteIds)
        .eq('checkin_date', date) as {
          data: Array<{ id: string; athlete_id: string; soreness_status: string | null }> | null;
        };
      for (const c of checkins ?? []) {
        checkinByAthlete.set(c.athlete_id, { id: c.id, soreness_status: c.soreness_status });
        checkinIds.push(c.id);
      }
    }

    const mapsByCheckin = new Map<string, Array<{ body_region: string; severity: number }>>();
    if (checkinIds.length > 0) {
      const { data: mapRows } = await fromUntyped(supabase, 'helm_lifting_soreness_maps')
        .select('checkin_id, body_region, severity')
        .in('checkin_id', checkinIds) as {
          data: Array<{ checkin_id: string; body_region: string; severity: number }> | null;
        };
      for (const row of mapRows ?? []) {
        const arr = mapsByCheckin.get(row.checkin_id) ?? [];
        arr.push({ body_region: row.body_region, severity: row.severity });
        mapsByCheckin.set(row.checkin_id, arr);
      }
    }

    // ── 7-day window for overuse rules ────────────────────────────────────────
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    const windowSorenessEntries: SorenessMapEntry[] = [];
    let missedWindowEntries: MissedCheckinEntry[] = [];

    if (athleteIds.length > 0) {
      // Recent soreness maps for overuse rules
      const { data: recentCheckins } = await fromUntyped(supabase, 'helm_lifting_readiness_checkins')
        .select('id, athlete_id, checkin_date')
        .in('athlete_id', athleteIds)
        .gte('checkin_date', sevenDaysAgo) as {
          data: Array<{ id: string; athlete_id: string; checkin_date: string }> | null;
        };

      const recentCheckinIds = (recentCheckins ?? []).map((c) => c.id);
      const checkinDateById = new Map((recentCheckins ?? []).map((c) => [c.id, c]));

      if (recentCheckinIds.length > 0) {
        const { data: recentMaps } = await fromUntyped(supabase, 'helm_lifting_soreness_maps')
          .select('checkin_id, athlete_id, body_region, severity')
          .in('checkin_id', recentCheckinIds) as {
            data: Array<{ checkin_id: string; athlete_id: string; body_region: string; severity: number }> | null;
          };

        for (const row of recentMaps ?? []) {
          if (!isSorenessRegionId(row.body_region)) continue;
          const parentCheckin = checkinDateById.get(row.checkin_id);
          if (!parentCheckin) continue;
          windowSorenessEntries.push({
            checkin_date: parentCheckin.checkin_date,
            region_id: row.body_region,
            severity: row.severity,
            athlete_id: row.athlete_id,
          });
        }
      }

      // Missed requests in 7-day window
      const { data: missedRows } = await fromUntyped(supabase, 'helm_lifting_soreness_check_requests')
        .select('athlete_id, due_date')
        .in('athlete_id', athleteIds)
        .eq('organization_id', ctx.orgId)
        .eq('status', 'missed')
        .gte('due_date', sevenDaysAgo) as {
          data: Array<{ athlete_id: string; due_date: string }> | null;
        };
      missedWindowEntries = (missedRows ?? []).map((r) => ({
        due_date: r.due_date,
        athlete_id: r.athlete_id,
      }));
    }

    // Determine pitcher athlete IDs (baseball position codes that indicate pitchers).
    const pitcherCodes = new Set(input.pitcherPositionCodes ?? ['P', 'SP', 'RP', 'LHP', 'RHP', 'CP']);
    const pitcherAthleteIds = new Set<string>();
    for (const [id, a] of athleteMap) {
      if (a.sport === 'baseball' && a.position && pitcherCodes.has(a.position)) {
        pitcherAthleteIds.add(id);
      }
    }

    // Build lowerBodyLiftAthleteIds: athletes who have a lower-body-day session
    // scheduled today. This enables Rule 5 (lower-body soreness >= 6 on lift day).
    const lowerBodyLiftAthleteIds = new Set<string>();
    if (athleteIds.length > 0) {
      const { data: lowerBodySessions } = await fromUntyped(supabase, 'helm_lifting_sessions')
        .select('athlete_id')
        .eq('organization_id', ctx.orgId)
        .eq('scheduled_date', date)
        .eq('day_type', 'lower')
        .in('athlete_id', athleteIds) as { data: Array<{ athlete_id: string }> | null };
      for (const s of lowerBodySessions ?? []) {
        lowerBodyLiftAthleteIds.add(s.athlete_id);
      }
    }

    // Run overuse rules.
    const todaySorenessEntries = windowSorenessEntries.filter((e) => e.checkin_date === date);
    const allFlags = runAllOveruseRules({
      sorenessWindow: windowSorenessEntries,
      today: todaySorenessEntries,
      pitcherAthleteIds,
      lowerBodyLiftAthleteIds,
      missedWindow: missedWindowEntries,
      referenceDate: date,
    });

    const flagsByAthlete = new Map<string, OveruseFlag[]>();
    for (const flag of allFlags) {
      const arr = flagsByAthlete.get(flag.athleteId) ?? [];
      arr.push(flag);
      flagsByAthlete.set(flag.athleteId, arr);
    }

    // ── Build compliance counts ───────────────────────────────────────────────
    const compliance: SorenessComplianceCounts = {
      total: todayRequests.length,
      readyToGo: 0,
      reportedSoreness: 0,
      pending: 0,
      missed: 0,
      excused: 0,
    };

    for (const req of todayRequests) {
      if (req.status === 'ready_to_go') compliance.readyToGo++;
      else if (req.status === 'completed') compliance.reportedSoreness++;
      else if (req.status === 'pending') compliance.pending++;
      else if (req.status === 'missed') compliance.missed++;
      else if (req.status === 'excused') compliance.excused++;
    }

    // ── Build per-athlete request summaries ───────────────────────────────────
    const summaries: AthleteRequestSummary[] = todayRequests.map((req) => {
      const athlete = athleteMap.get(req.athlete_id);
      const checkin = checkinByAthlete.get(req.athlete_id) ?? null;
      const regions = checkin ? (mapsByCheckin.get(checkin.id) ?? []) : [];
      const maxSeverity = regions.length > 0 ? Math.max(...regions.map((r) => r.severity)) : null;

      return {
        athleteId: req.athlete_id,
        firstName: athlete?.first_name ?? '',
        lastName: athlete?.last_name ?? '',
        position: athlete?.position ?? null,
        request: req,
        sorenessStatus: checkin?.soreness_status ?? null,
        maxSeverity,
        regions,
        flags: flagsByAthlete.get(req.athlete_id) ?? [],
      };
    });

    // High-priority: any athlete with at least one flag.
    const highPriority = summaries
      .filter((s) => s.flags.length > 0)
      .sort((a, b) => (b.maxSeverity ?? 0) - (a.maxSeverity ?? 0));

    return {
      date,
      compliance,
      highPriority,
      allRequests: summaries,
    };
  },
);

// =============================================================================
// 10. getPlayerSorenessHistory
//     Rolling soreness history for the player profile Performance tab.
// =============================================================================

const playerHistorySchema = z.object({
  orgId: uuid,
  athleteId: uuid,
  days: z.number().int().min(1).max(365).optional(),
});

export interface SorenessHistoryDay {
  date: string;
  sorenessStatus: string | null;
  sorenessOverall: number | null;
  regions: Array<{ body_region: string; severity: number; note: string | null }>;
  requestStatus: string | null;
}

export interface PlayerSorenessHistory {
  athleteId: string;
  days: SorenessHistoryDay[];
  requestCompliance: {
    total: number;
    completed: number;
    missed: number;
    excused: number;
    compliancePct: number;
  };
}

export const getPlayerSorenessHistory = withLiftingAction(
  'getPlayerSorenessHistory',
  {
    featureArea: 'lifting-soreness',
    requireEdit: false,
    orgFrom: (...args) => (args[0] as { orgId?: string })?.orgId,
  },
  async (ctx, raw: z.input<typeof playerHistorySchema>): Promise<PlayerSorenessHistory> => {
    const input = playerHistorySchema.parse(raw);
    const supabase = await createClient();
    const lookbackDays = input.days ?? 30;
    const since = new Date(Date.now() - lookbackDays * 86_400_000).toISOString().slice(0, 10);

    // Load readiness checkins in the window.
    const { data: checkins } = await fromUntyped(supabase, 'helm_lifting_readiness_checkins')
      .select('id, checkin_date, soreness_overall, soreness_status')
      .eq('athlete_id', input.athleteId)
      .eq('organization_id', ctx.orgId)
      .gte('checkin_date', since)
      .order('checkin_date', { ascending: false })
      .limit(400) as {
        data: Array<{
          id: string;
          checkin_date: string;
          soreness_overall: number | null;
          soreness_status: string | null;
        }> | null;
      };

    const checkinList = checkins ?? [];
    const checkinIds = checkinList.map((c) => c.id);

    // Batch load soreness maps.
    const mapsByCheckin = new Map<string, Array<{ body_region: string; severity: number; note: string | null }>>();
    if (checkinIds.length > 0) {
      const { data: mapRows } = await fromUntyped(supabase, 'helm_lifting_soreness_maps')
        .select('checkin_id, body_region, severity, note')
        .in('checkin_id', checkinIds) as {
          data: Array<{ checkin_id: string; body_region: string; severity: number; note: string | null }> | null;
        };
      for (const row of mapRows ?? []) {
        const arr = mapsByCheckin.get(row.checkin_id) ?? [];
        arr.push({ body_region: row.body_region, severity: row.severity, note: row.note });
        mapsByCheckin.set(row.checkin_id, arr);
      }
    }

    // Load soreness check requests for compliance stats.
    const { data: requestRows } = await fromUntyped(supabase, 'helm_lifting_soreness_check_requests')
      .select('due_date, status')
      .eq('athlete_id', input.athleteId)
      .eq('organization_id', ctx.orgId)
      .gte('due_date', since) as {
        data: Array<{ due_date: string; status: string }> | null;
      };

    const requestByDate = new Map((requestRows ?? []).map((r) => [r.due_date, r.status]));

    // Merge checkins + request statuses into day-by-day history.
    const days: SorenessHistoryDay[] = checkinList.map((c) => ({
      date: c.checkin_date,
      sorenessStatus: c.soreness_status,
      sorenessOverall: c.soreness_overall,
      regions: mapsByCheckin.get(c.id) ?? [],
      requestStatus: requestByDate.get(c.checkin_date) ?? null,
    }));

    // Compliance counts.
    const allRequests = requestRows ?? [];
    const completedStatuses = new Set<string>(['ready_to_go', 'completed']);
    const complianceTotal = allRequests.length;
    const complianceCompleted = allRequests.filter((r) => completedStatuses.has(r.status)).length;
    const complianceMissed = allRequests.filter((r) => r.status === 'missed').length;
    const complianceExcused = allRequests.filter((r) => r.status === 'excused').length;
    const compliancePct =
      complianceTotal > 0 ? Math.round((complianceCompleted / complianceTotal) * 100) : 0;

    return {
      athleteId: input.athleteId,
      days,
      requestCompliance: {
        total: complianceTotal,
        completed: complianceCompleted,
        missed: complianceMissed,
        excused: complianceExcused,
        compliancePct,
      },
    };
  },
);

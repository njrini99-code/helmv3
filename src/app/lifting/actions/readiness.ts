'use server';

// =============================================================================
// src/app/lifting/actions/readiness.ts
//
// Helm Lifting Lab — readiness check-in + board view.
//
//   getReadinessSummary    — staff-facing board: latest checkin per active athlete
//   submitReadinessCheckin — player-self submit (idempotent upsert on checkin_date)
//
// The readiness model mirrors baseball's V11 readiness family but reads from
// helm_lifting_readiness_checkins + helm_lifting_soreness_maps. No destructive
// writes: upsert on (athlete_id, checkin_date) for the checkin row; soreness
// maps are deleted+reinserted in the same transaction (not destructive because
// the player controls their own rows and the upsert on the checkin produces the
// same id on re-submit).
// =============================================================================

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { withLiftingAction, LiftingActionError } from '@/lib/lifting/with-lifting-action';
import type {
  HelmLiftingReadinessCheckinInsert,
  HelmLiftingSorenessMapInsert,
  HelmLiftingReadinessCheckinRow,
  HelmLiftingSorenessMapRow,
  HelmLiftingReadinessBand,
  HelmLiftingAvailabilityStatus,
  HelmLiftingAvailabilityStatusRow,
  HelmLiftingAvailabilityStatusInsert,
  HelmLiftingBodyweightEntryInsert,
  HelmLiftingBodyweightEntryRow,
  HelmLiftingAvailabilityReason,
} from '@/lib/types/helm-lifting-data';
import type { HelmLiftingAthleteRow } from '@/lib/types/helm-lifting';

const READINESS_PATH = '/lifting/dashboard/readiness';

// -----------------------------------------------------------------------------
// Readiness score → band mapping (mirrors baseball V11 logic)
// -----------------------------------------------------------------------------

function computeReadinessScore(input: {
  sleepQuality?: number | null;
  energyLevel?: number | null;
  sorenessOverall?: number | null;
  stressLevel?: number | null;
  lowerBodyStatus?: number | null;
  illnessFlag?: boolean;
}): { score: number; band: HelmLiftingReadinessBand } {
  const vals: number[] = [];
  if (input.sleepQuality != null) vals.push(input.sleepQuality);
  if (input.energyLevel != null) vals.push(input.energyLevel);
  // Soreness is inverted (1=max soreness, 5=no soreness → flip so 5=best)
  if (input.sorenessOverall != null) vals.push(6 - input.sorenessOverall);
  if (input.stressLevel != null) vals.push(6 - input.stressLevel); // low stress=good
  if (input.lowerBodyStatus != null) vals.push(input.lowerBodyStatus);

  const score = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 3;
  const illness = input.illnessFlag ?? false;

  let band: HelmLiftingReadinessBand;
  if (illness) {
    band = 'blue'; // sick — special status
  } else if (score >= 4.5) {
    band = 'green';
  } else if (score >= 3.5) {
    band = 'yellow';
  } else if (score >= 2.5) {
    band = 'orange_lower';
  } else if (score >= 1.5) {
    band = 'orange_upper';
  } else {
    band = 'red';
  }

  return { score: Math.round(score * 10) / 10, band };
}

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface AthleteReadinessSummary {
  athlete: Pick<HelmLiftingAthleteRow, 'id' | 'first_name' | 'last_name' | 'position' | 'sport'>;
  checkin: HelmLiftingReadinessCheckinRow | null;
  soreness: HelmLiftingSorenessMapRow[];
  availabilityStatus: HelmLiftingAvailabilityStatus | null;
  session_today: { id: string; status: string; title: string | null } | null;
}

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------

const uuid = z.string().uuid();
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

const sorenessItemSchema = z.object({
  bodyRegion: z.string().trim().max(80),
  side: z.enum(['left', 'right', 'both', 'center']).optional(),
  severity: z.number().int().min(1).max(5).optional(),
  note: z.string().trim().max(400).optional().nullable(),
});

const readinessSummarySchema = z.object({
  orgId: uuid.optional().nullable(),
  sport: z.enum(['baseball', 'golf']).optional().nullable(),
  date: ymd.optional().nullable(),
});

const submitReadinessSchema = z.object({
  athleteId: uuid,
  checkinDate: ymd,
  sleepQuality: z.number().int().min(1).max(5).optional().nullable(),
  energyLevel: z.number().int().min(1).max(5).optional().nullable(),
  sorenessOverall: z.number().int().min(1).max(5).optional().nullable(),
  stressLevel: z.number().int().min(1).max(5).optional().nullable(),
  lowerBodyStatus: z.number().int().min(1).max(5).optional().nullable(),
  illnessFlag: z.boolean().optional(),
  mood: z.number().int().min(1).max(5).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  sorenessMap: z.array(sorenessItemSchema).max(20).optional(),
  // Optional link to a specific session
  liftSessionId: uuid.optional().nullable(),
});

// -----------------------------------------------------------------------------
// 1. getReadinessSummary — staff board view
// -----------------------------------------------------------------------------

export const getReadinessSummary = withLiftingAction(
  'getReadinessSummary',
  {
    featureArea: 'lifting-readiness',
    requireEdit: false,
    orgFrom: (...args) => (args[0] as { orgId?: string | null })?.orgId ?? null,
  },
  async (ctx, raw: z.input<typeof readinessSummarySchema>): Promise<AthleteReadinessSummary[]> => {
    const input = readinessSummarySchema.parse(raw);
    const date = input.date ?? new Date().toISOString().slice(0, 10);
    const supabase = await createClient();

    // Load active athletes for this org.
    let athleteQuery = fromUntyped(supabase, 'helm_lifting_athletes')
      .select('id, first_name, last_name, position, sport, is_active')
      .eq('organization_id', ctx.orgId)
      .eq('is_active', true)
      .order('last_name', { ascending: true })
      .limit(500);

    if (input.sport) athleteQuery = athleteQuery.eq('sport', input.sport);

    const { data: athletes } = await athleteQuery as {
      data: Array<Pick<HelmLiftingAthleteRow, 'id' | 'first_name' | 'last_name' | 'position' | 'sport'>> | null
    };

    if (!athletes || athletes.length === 0) return [];

    const athleteIds = athletes.map((a) => a.id);

    // Batch load today's checkins.
    const { data: checkins } = await fromUntyped(supabase, 'helm_lifting_readiness_checkins')
      .select('*')
      .in('athlete_id', athleteIds)
      .eq('checkin_date', date) as { data: HelmLiftingReadinessCheckinRow[] | null };

    const checkinByAthlete = new Map((checkins ?? []).map((c) => [c.athlete_id, c]));

    // Batch load soreness maps for these checkins.
    const checkinIds = (checkins ?? []).map((c) => c.id);
    const soreness: HelmLiftingSorenessMapRow[] = [];
    if (checkinIds.length > 0) {
      const { data: sorenessRows } = await fromUntyped(supabase, 'helm_lifting_soreness_maps')
        .select('*')
        .in('checkin_id', checkinIds) as { data: HelmLiftingSorenessMapRow[] | null };
      soreness.push(...(sorenessRows ?? []));
    }
    const sorenesByCheckin = new Map<string, HelmLiftingSorenessMapRow[]>();
    for (const s of soreness) {
      const arr = sorenesByCheckin.get(s.checkin_id) ?? [];
      arr.push(s);
      sorenesByCheckin.set(s.checkin_id, arr);
    }

    // Batch load current availability statuses.
    const { data: availabilities } = await fromUntyped(supabase, 'helm_lifting_availability_statuses')
      .select('athlete_id, status, ends_at')
      .in('athlete_id', athleteIds)
      .lte('starts_at', date)
      .or(`ends_at.is.null,ends_at.gte.${date}`) as {
        data: Array<{ athlete_id: string; status: string; ends_at: string | null }> | null
      };

    const availByAthlete = new Map<string, HelmLiftingAvailabilityStatus>();
    for (const a of availabilities ?? []) {
      availByAthlete.set(a.athlete_id, a.status as HelmLiftingAvailabilityStatus);
    }

    // Batch load today's sessions.
    const { data: sessions } = await fromUntyped(supabase, 'helm_lifting_sessions')
      .select('athlete_id, id, status, title')
      .in('athlete_id', athleteIds)
      .eq('scheduled_date', date) as {
        data: Array<{ athlete_id: string; id: string; status: string; title: string | null }> | null
      };
    const sessionByAthlete = new Map((sessions ?? []).map((s) => [s.athlete_id, s]));

    return athletes.map((athlete) => {
      const checkin = checkinByAthlete.get(athlete.id) ?? null;
      const sorenessItems = checkin ? (sorenesByCheckin.get(checkin.id) ?? []) : [];

      return {
        athlete,
        checkin,
        soreness: sorenessItems,
        availabilityStatus: availByAthlete.get(athlete.id) ?? null,
        session_today: sessionByAthlete.get(athlete.id) ?? null,
      };
    });
  },
);

// -----------------------------------------------------------------------------
// 2. submitReadinessCheckin — idempotent upsert (athlete-self or staff)
// -----------------------------------------------------------------------------

export interface ReadinessSubmitResult {
  success: boolean;
  checkinId?: string;
  band?: HelmLiftingReadinessBand;
  score?: number;
  error?: string;
}

export const submitReadinessCheckin = withLiftingAction(
  'submitReadinessCheckin',
  {
    featureArea: 'lifting-readiness',
    requireEdit: false, // RLS athlete-self policy enforces ownership
    orgFrom: (...args) => (args[0] as { orgId?: string })?.orgId,
  },
  async (ctx, raw: z.input<typeof submitReadinessSchema>): Promise<ReadinessSubmitResult> => {
    const input = submitReadinessSchema.parse(raw);
    const supabase = await createClient();

    // Resolve sport for the athlete.
    const { data: athlete } = await fromUntyped(supabase, 'helm_lifting_athletes')
      .select('id, organization_id, sport')
      .eq('id', input.athleteId)
      .eq('organization_id', ctx.orgId)
      .maybeSingle() as { data: { id: string; organization_id: string; sport: string } | null };

    if (!athlete) throw new LiftingActionError('Athlete not found in this org.');

    const { score, band } = computeReadinessScore({
      sleepQuality: input.sleepQuality,
      energyLevel: input.energyLevel,
      sorenessOverall: input.sorenessOverall,
      stressLevel: input.stressLevel,
      lowerBodyStatus: input.lowerBodyStatus,
      illnessFlag: input.illnessFlag,
    });

    const payload: HelmLiftingReadinessCheckinInsert = {
      organization_id: ctx.orgId,
      sport: athlete.sport as 'baseball' | 'golf',
      athlete_id: input.athleteId,
      checkin_date: input.checkinDate,
      sleep_quality: input.sleepQuality ?? null,
      energy_level: input.energyLevel ?? null,
      soreness_overall: input.sorenessOverall ?? null,
      stress_level: input.stressLevel ?? null,
      lower_body_status: input.lowerBodyStatus ?? null,
      illness_flag: input.illnessFlag ?? false,
      mood: input.mood ?? null,
      notes: input.notes ?? null,
      readiness_score: score,
      readiness_band: band,
      lift_session_id: input.liftSessionId ?? null,
      visibility: 'performance_staff',
    };

    const { data: checkin, error: checkinErr } = await fromUntyped(supabase, 'helm_lifting_readiness_checkins')
      .upsert(payload, { onConflict: 'athlete_id,checkin_date' })
      .select('id')
      .single();

    if (checkinErr) throw checkinErr;
    const checkinId = (checkin as { id: string }).id;

    // Replace soreness map for today's checkin (player controls their own rows).
    if (input.sorenessMap && input.sorenessMap.length > 0) {
      // Safe to delete+insert the player's own soreness rows — these are ephemeral
      // within-checkin data the player authored (same checkin_id).
      await fromUntyped(supabase, 'helm_lifting_soreness_maps')
        .delete()
        .eq('checkin_id', checkinId);

      const sorenessPayloads: HelmLiftingSorenessMapInsert[] = input.sorenessMap.map((item) => ({
        checkin_id: checkinId,
        organization_id: ctx.orgId,
        sport: athlete.sport as 'baseball' | 'golf',
        athlete_id: input.athleteId,
        body_region: item.bodyRegion,
        side: item.side ?? 'center',
        severity: item.severity ?? 1,
        note: item.note ?? null,
      }));

      await fromUntyped(supabase, 'helm_lifting_soreness_maps').insert(sorenessPayloads);
    }

    revalidatePath(READINESS_PATH);
    return { success: true, checkinId, band, score };
  },
);

// -----------------------------------------------------------------------------
// 3. setAvailabilityStatus — coach-facing upsert on helm_lifting_availability_statuses
// -----------------------------------------------------------------------------

const setAvailabilitySchema = z.object({
  athleteId: uuid,
  status: z.enum(['available', 'limited', 'hold', 'return_to_play', 'unavailable']),
  startsAt: ymd,
  endsAt: ymd.optional().nullable(),
  reasonCategory: z
    .enum(['soreness', 'illness', 'injury_note', 'academic', 'travel', 'coach_decision', 'other'])
    .optional()
    .nullable(),
  note: z.string().trim().max(500).optional().nullable(),
});

export interface SetAvailabilityResult {
  success: boolean;
  rowId?: string;
  error?: string;
}

export const setAvailabilityStatus = withLiftingAction(
  'setAvailabilityStatus',
  {
    featureArea: 'lifting-readiness',
    requireEdit: true,
    orgFrom: (...args) => (args[0] as { orgId?: string })?.orgId,
  },
  async (ctx, raw: z.input<typeof setAvailabilitySchema>): Promise<SetAvailabilityResult> => {
    const input = setAvailabilitySchema.parse(raw);
    const supabase = await createClient();

    const { data: athlete } = await fromUntyped(supabase, 'helm_lifting_athletes')
      .select('id, organization_id, sport')
      .eq('id', input.athleteId)
      .eq('organization_id', ctx.orgId)
      .maybeSingle() as { data: { id: string; organization_id: string; sport: string } | null };

    if (!athlete) throw new LiftingActionError('Athlete not found in this org.');

    const { data: user } = await supabase.auth.getUser();

    const payload: HelmLiftingAvailabilityStatusInsert = {
      organization_id: ctx.orgId,
      sport: athlete.sport as 'baseball' | 'golf',
      athlete_id: input.athleteId,
      status: input.status as HelmLiftingAvailabilityStatus,
      starts_at: input.startsAt,
      ends_at: input.endsAt ?? null,
      reason_category: (input.reasonCategory ?? null) as HelmLiftingAvailabilityReason | null,
      note: input.note ?? null,
      visibility: 'performance_staff',
      created_by_coach_id: user.user?.id ?? null,
    };

    const { data: row, error } = await fromUntyped(supabase, 'helm_lifting_availability_statuses')
      .upsert(payload, { onConflict: 'athlete_id,starts_at' })
      .select('id')
      .single() as { data: HelmLiftingAvailabilityStatusRow | null; error: unknown };

    if (error) throw error;

    revalidatePath(READINESS_PATH);
    return { success: true, rowId: (row as { id: string }).id };
  },
);

// -----------------------------------------------------------------------------
// 4. logBodyweight — athlete-self (or staff) insert into helm_lifting_bodyweight_entries
// -----------------------------------------------------------------------------

const logBodyweightSchema = z.object({
  athleteId: uuid,
  entryDate: ymd,
  weightLbs: z.number().positive().max(999),
  source: z.enum(['player', 'coach', 'import']).optional(),
});

export interface LogBodyweightResult {
  success: boolean;
  rowId?: string;
  error?: string;
}

export const logBodyweight = withLiftingAction(
  'logBodyweight',
  {
    featureArea: 'lifting-readiness',
    requireEdit: false,
    orgFrom: (...args) => (args[0] as { orgId?: string })?.orgId,
  },
  async (ctx, raw: z.input<typeof logBodyweightSchema>): Promise<LogBodyweightResult> => {
    const input = logBodyweightSchema.parse(raw);
    const supabase = await createClient();

    const { data: athlete } = await fromUntyped(supabase, 'helm_lifting_athletes')
      .select('id, organization_id, sport')
      .eq('id', input.athleteId)
      .eq('organization_id', ctx.orgId)
      .maybeSingle() as { data: { id: string; organization_id: string; sport: string } | null };

    if (!athlete) throw new LiftingActionError('Athlete not found in this org.');

    const payload: HelmLiftingBodyweightEntryInsert = {
      organization_id: ctx.orgId,
      sport: athlete.sport as 'baseball' | 'golf',
      athlete_id: input.athleteId,
      entry_date: input.entryDate,
      weight_lbs: input.weightLbs,
      source: input.source ?? 'player',
    };

    const { data: row, error } = await fromUntyped(supabase, 'helm_lifting_bodyweight_entries')
      .upsert(payload, { onConflict: 'athlete_id,entry_date' })
      .select('id')
      .single() as { data: HelmLiftingBodyweightEntryRow | null; error: unknown };

    if (error) throw error;

    revalidatePath(READINESS_PATH);
    return { success: true, rowId: (row as { id: string }).id };
  },
);

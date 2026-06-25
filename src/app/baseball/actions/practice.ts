'use server';
import { fromUntyped } from '@/lib/supabase/untyped';

// =============================================================================
// src/app/baseball/actions/practice.ts
//
// Wave 8 / packet: practice-planner
//
// Server actions for the Practice Planner Lite: create/update/publish practice
// headers, manage timed blocks (stations + staff assignment), and record
// per-player attendance — with an optional calendar attach.
//
// SECURITY / CONTRACT
//   * Every write runs inside withBaseballAction with
//     { featureArea: 'baseball-practice', requiredCapability: 'can_manage_practice' }.
//     Auth + active team + capability are resolved + enforced SERVER-SIDE; the
//     wrapper sanitizes thrown errors so raw DB internals never reach the client.
//   * Reads are RLS-governed: staff see all team practices; players see only
//     published ones (handled by the 0050 policy set), so getTeamPractices is a
//     plain authed read that returns whatever the caller is entitled to.
//   * NO destructive writes in any save path. Attendance is UPSERT on the
//     UNIQUE(practice_id, player_id) key. Block replacement uses stage-then-swap
//     (insert new rows, then delete the previously-known ids) so a transient
//     failure can never leave a practice with zero blocks.
//   * RLS already constrains every write to the active team; we additionally
//     stamp team_id = ctx.targetTeamId on inserts so rows can never be written
//     against another team.
// =============================================================================

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { sanitizeDbError } from '@/lib/db-error';
import { withBaseballAction } from '@/lib/baseball/with-baseball-action';
import { validatePracticeForPublish } from '@/lib/baseball/practice-validation';
import { attachPracticeToCalendar } from '@/app/baseball/actions/calendar';
import type {
  BaseballPracticeRow,
  BaseballPracticeStatus,
  BaseballPracticeWithDetail,
  BaseballPracticeAttendanceStatus,
} from '@/lib/types/baseball-practice';

const PRACTICE_PATH = '/baseball/dashboard/practice';
const CALENDAR_PATH = '/baseball/dashboard/calendar';

type ActionResult<T = unknown> = { success: boolean; error?: string; data?: T };

const FEATURE = { featureArea: 'baseball-practice', requiredCapability: 'can_manage_practice' } as const;

// -----------------------------------------------------------------------------
// Input shapes
// -----------------------------------------------------------------------------

export interface PracticeBlockInput {
  startOffsetMin: number;
  durationMin: number;
  activity: string;
  location?: string | null;
  coachOwnerId?: string | null;
  // --- Deepened fields (migration 0200). All optional + back-compatible. ---
  /** Optional description that expands under the headline (V7 main row content). */
  description?: string | null;
  /** Controlled baseball station label (V7) — never a golf label. */
  stationType?: string | null;
  /** Player group / squad the block is assigned to (V5 outline "group"). */
  groupLabel?: string | null;
  /** Equipment needed (V7). */
  equipment?: string | null;
  /** Measurement target + measured flag (V7 measured/unmeasured station). */
  measurementTarget?: string | null;
  isMeasured?: boolean;
  /** Human-readable WHY (V5 outline "source reason"), set on signal-generated blocks. */
  sourceReason?: string | null;
  /** The insight this block was converted from (V5 "convert signal to block"). */
  sourceInsightId?: string | null;
  /** V2 visibility — staff_only hides the block from players. Defaults player_visible. */
  visibility?: 'staff_only' | 'player_visible' | 'restricted';
}

/** The deepened block-row visibility vocabulary (mirror of the CHECK). */
const BLOCK_VISIBILITIES = new Set(['staff_only', 'player_visible', 'restricted']);

/** Snap a minute offset onto the 5-minute time rail (V7 5-min rail builder). */
function snapToRail(min: number): number {
  if (!Number.isFinite(min) || min < 0) return 0;
  return Math.round(min / 5) * 5;
}

export interface SavePracticeInput {
  /** When set, updates an existing practice; otherwise creates one. */
  practiceId?: string;
  title: string;
  focus?: string | null;
  /** Ordered blocks. The full set is replaced on save (stage-then-swap). */
  blocks: PracticeBlockInput[];
  /** Optional calendar attach. When provided AND publishing, an event is made. */
  calendar?: {
    date: string;
    startTime?: string | null;
    endTime?: string | null;
    location?: string | null;
  } | null;
}

export interface AttendanceEntryInput {
  playerId: string;
  status: BaseballPracticeAttendanceStatus;
  reason?: string | null;
}

// -----------------------------------------------------------------------------
// Reads (RLS-governed; staff see all, players see published only)
// -----------------------------------------------------------------------------

/**
 * List practices for the active team with their ordered blocks + attendance.
 * RLS decides visibility (staff: all; player: published only), so this is a
 * plain authed read — no capability gate (players legitimately read published).
 */
export async function getTeamPractices(): Promise<ActionResult<BaseballPracticeWithDetail[]>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { data, error } = await fromUntyped(supabase, 'baseball_practices')
    .select(
      `
      *,
      blocks:baseball_practice_blocks(
        *,
        coach_owner:baseball_coaches(id, first_name, last_name)
      ),
      attendance:baseball_practice_attendance(*)
    `,
    )
    .order('created_at', { ascending: false });

  if (error) return { success: false, error: sanitizeDbError(error, 'practice') };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []).map((p: any): BaseballPracticeWithDetail => ({
    ...(p as BaseballPracticeRow),
    blocks: (p.blocks ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((b: any) => ({
        ...b,
        coach_owner_name: b.coach_owner
          ? `${b.coach_owner.first_name ?? ''} ${b.coach_owner.last_name ?? ''}`.trim() || null
          : null,
      }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .sort((a: any, z: any) => a.start_offset_min - z.start_offset_min),
    attendance: p.attendance ?? [],
  }));

  return { success: true, data: rows };
}

// -----------------------------------------------------------------------------
// Helper: stage-then-swap the block set for a practice (no destructive window).
// -----------------------------------------------------------------------------

async function replacePracticeBlocks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamId: string,
  practiceId: string,
  blocks: PracticeBlockInput[],
): Promise<{ error?: string }> {
  // Snapshot the existing block ids BEFORE writing new ones.
  const { data: existing, error: readErr } = await fromUntyped(supabase, 'baseball_practice_blocks')
    .select('id')
    .eq('practice_id', practiceId);
  if (readErr) return { error: sanitizeDbError(readErr, 'practice') };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const oldIds: string[] = (existing ?? []).map((r: any) => r.id);

  // Insert the new set first (stage). If this fails, the old blocks survive.
  if (blocks.length > 0) {
    const payload = blocks.map((b) => {
      const visibility =
        b.visibility && BLOCK_VISIBILITIES.has(b.visibility) ? b.visibility : 'player_visible';
      return {
        team_id: teamId,
        practice_id: practiceId,
        // Server-side rail snapping is the floor — the UI snaps too, but we never
        // trust the client to honor the 5-min rail.
        start_offset_min: snapToRail(b.startOffsetMin),
        duration_min: Math.max(5, snapToRail(b.durationMin) || 5),
        activity: b.activity,
        location: b.location ?? null,
        coach_owner_id: b.coachOwnerId ?? null,
        // --- deepened fields (0200) ---
        description: b.description ?? null,
        station_type: b.stationType ?? null,
        group_label: b.groupLabel ?? null,
        equipment: b.equipment ?? null,
        measurement_target: b.measurementTarget ?? null,
        is_measured: b.isMeasured ?? false,
        source_reason: b.sourceReason ?? null,
        source_insight_id: b.sourceInsightId ?? null,
        visibility,
      };
    });
    const { error: insErr } = await fromUntyped(supabase, 'baseball_practice_blocks').insert(payload);
    if (insErr) return { error: sanitizeDbError(insErr, 'practice') };
  }

  // Swap: remove only the previously-known rows now that the new ones landed.
  if (oldIds.length > 0) {
    const { error: delErr } = await fromUntyped(supabase, 'baseball_practice_blocks')
      .delete()
      .in('id', oldIds);
    if (delErr) return { error: sanitizeDbError(delErr, 'practice') };
  }

  return {};
}

// -----------------------------------------------------------------------------
// Materialize a practice block FROM a converted candidate. Two callers feed it:
//   * convertSignalToAction  (V9 "signal -> practice block"), and
//   * convertPostgameItemToPractice (Postgame "Recommended practice focus" ->
//     planner) — the box-score loop that previously dead-ended at a read-only
//     recommendation.
// Lands the block in the team's single "Signal backlog" draft practice
// (find-or-create, is_backlog=true) so a converted block becomes a REAL planner
// block a coach can drag into a scheduled practice — not an orphan ledger row.
//
// This is an internal materializer, NOT a withBaseballAction export: it is
// called from inside an action that has already resolved auth + active team +
// staff context. The CALLER is responsible for the per-action capability
// precheck (can_manage_practice) so a stats-only coach can never reach an
// RLS-denied insert. The block carries source_reason + source_insight_id +
// source_signal_id + source_postgame_item_id so the WHY + provenance show on the
// block and round-trip back to whichever candidate (signal OR postgame item) it
// came from.
// -----------------------------------------------------------------------------

/** Title of the per-team backlog practice that holds converted candidate blocks. */
const SIGNAL_BACKLOG_PRACTICE_TITLE = 'Signal backlog';

export interface MaterializeBlockFromSignalInput {
  teamId: string;
  title: string;
  detail?: string | null;
  /** Human WHY shown on the block (defaults to the signal's "why it matters"). */
  sourceReason?: string | null;
  /**
   * Originating signal id. Optional: a block can also be materialized from a
   * POSTGAME REVIEW ITEM (sourcePostgameItemId) that has no signal. At least one
   * provenance id is expected so the block is never born sourceless.
   */
  sourceSignalId?: string | null;
  sourceInsightId?: string | null;
  /**
   * Originating postgame review item id (the Postgame -> practice-focus loop).
   * Round-trips the block back to the recommended-practice-focus item it came
   * from (column added by migration 20260624001800).
   */
  sourcePostgameItemId?: string | null;
  coachOwnerId?: string | null;
  durationMin?: number | null;
}

/**
 * Find-or-create the team's backlog practice, then append one block to it.
 * Returns the created block id + the practice id it landed in. NON-destructive:
 * only inserts; never deletes/replaces existing backlog blocks.
 */
export async function materializePracticeBlockFromSignal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: MaterializeBlockFromSignalInput,
): Promise<{ ok: true; blockId: string; practiceId: string } | { ok: false; error: string }> {
  const teamId = input.teamId;

  // 1. Find the team's backlog practice (one per team, is_backlog=true).
  const { data: existing, error: findErr } = await fromUntyped(supabase, 'baseball_practices')
    .select('id')
    .eq('team_id', teamId)
    .eq('is_backlog', true)
    .maybeSingle();
  if (findErr) return { ok: false, error: sanitizeDbError(findErr, 'practice') };

  let practiceId = (existing as { id: string } | null)?.id ?? null;

  // 2. Create it on first use.
  if (!practiceId) {
    const { data: created, error: insErr } = await fromUntyped(supabase, 'baseball_practices')
      .insert({
        team_id: teamId,
        title: SIGNAL_BACKLOG_PRACTICE_TITLE,
        focus: 'Converted from signals — drag these into a scheduled practice.',
        status: 'draft' as BaseballPracticeStatus,
        is_backlog: true,
      })
      .select('id')
      .single();
    if (insErr || !created) {
      return { ok: false, error: sanitizeDbError(insErr, 'practice') };
    }
    practiceId = (created as { id: string }).id;
  }

  // 3. Append the block at the end of the backlog rail (next free 5-min slot).
  const { data: tail } = await fromUntyped(supabase, 'baseball_practice_blocks')
    .select('start_offset_min, duration_min')
    .eq('practice_id', practiceId)
    .order('start_offset_min', { ascending: false })
    .limit(1)
    .maybeSingle();
  const tailRow = tail as { start_offset_min: number; duration_min: number } | null;
  const nextOffset = tailRow ? snapToRail(tailRow.start_offset_min + tailRow.duration_min) : 0;
  const duration = Math.max(5, snapToRail(input.durationMin ?? 15) || 15);

  const { data: block, error: blkErr } = await fromUntyped(supabase, 'baseball_practice_blocks')
    .insert({
      team_id: teamId,
      practice_id: practiceId,
      start_offset_min: nextOffset,
      duration_min: duration,
      activity: input.title,
      description: input.detail ?? null,
      coach_owner_id: input.coachOwnerId ?? null,
      source_reason: input.sourceReason ?? null,
      source_insight_id: input.sourceInsightId ?? null,
      source_signal_id: input.sourceSignalId ?? null,
      source_postgame_item_id: input.sourcePostgameItemId ?? null,
      // A converted block is a staff draft until the coach schedules it.
      visibility: 'staff_only',
    })
    .select('id')
    .single();
  if (blkErr || !block) return { ok: false, error: sanitizeDbError(blkErr, 'practice') };

  return { ok: true, blockId: (block as { id: string }).id, practiceId };
}

// -----------------------------------------------------------------------------
// Save (create or update) a practice + its blocks (draft).
// -----------------------------------------------------------------------------

export const savePractice = withBaseballAction(
  'savePractice',
  FEATURE,
  async (ctx, input: SavePracticeInput): Promise<ActionResult<{ practiceId: string }>> => {
    const supabase = await createClient();
    const teamId = ctx.targetTeamId;

    let practiceId = input.practiceId ?? null;

    if (practiceId) {
      const { error } = await fromUntyped(supabase, 'baseball_practices')
        .update({
          title: input.title,
          focus: input.focus ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', practiceId)
        .eq('team_id', teamId);
      if (error) return { success: false, error: sanitizeDbError(error, 'practice') };
    } else {
      const { data, error } = await fromUntyped(supabase, 'baseball_practices')
        .insert({
          team_id: teamId,
          title: input.title,
          focus: input.focus ?? null,
          status: 'draft' as BaseballPracticeStatus,
        })
        .select('id')
        .single();
      if (error) return { success: false, error: sanitizeDbError(error, 'practice') };
      practiceId = (data as { id: string }).id;
    }

    const blockResult = await replacePracticeBlocks(supabase, teamId, practiceId, input.blocks);
    if (blockResult.error) return { success: false, error: blockResult.error };

    revalidatePath(PRACTICE_PATH);
    return { success: true, data: { practiceId } };
  },
);

// -----------------------------------------------------------------------------
// Publish / unpublish a practice (controls player visibility) + optional
// calendar attach. Players only ever see published practices (enforced by RLS).
// -----------------------------------------------------------------------------

export const publishPractice = withBaseballAction(
  'publishPractice',
  FEATURE,
  async (
    ctx,
    input: {
      practiceId: string;
      publish: boolean;
      calendar?: SavePracticeInput['calendar'];
    },
  ): Promise<ActionResult<{ eventId?: string }>> => {
    const supabase = await createClient();
    const teamId = ctx.targetTeamId;

    // SERVER-SIDE publish validation (V7). A malformed plan can never be
    // published even if the client UI is bypassed.
    if (input.publish) {
      const { data: blockRows } = await fromUntyped(supabase, 'baseball_practice_blocks')
        .select('start_offset_min, duration_min, activity, coach_owner_id, is_measured, measurement_target')
        .eq('practice_id', input.practiceId)
        .eq('team_id', teamId);
      const validation = validatePracticeForPublish(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (blockRows ?? []).map((b: any) => ({
          startOffsetMin: b.start_offset_min,
          durationMin: b.duration_min,
          activity: b.activity ?? '',
          coachOwnerId: b.coach_owner_id,
          isMeasured: b.is_measured,
          measurementTarget: b.measurement_target,
        })),
      );
      if (!validation.ok) {
        return {
          success: false,
          error: validation.errors[0]?.message ?? 'This practice cannot be published yet.',
        };
      }
    }

    const status: BaseballPracticeStatus = input.publish ? 'published' : 'draft';
    const { data: practice, error } = await fromUntyped(supabase, 'baseball_practices')
      .update({
        status,
        published_at: input.publish ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.practiceId)
      .eq('team_id', teamId)
      .select('id, title, event_id')
      .single();
    if (error) return { success: false, error: sanitizeDbError(error, 'practice') };

    let eventId: string | undefined;

    // Optional calendar attach — only when publishing, only when calendar info
    // is supplied, and only when not already attached. A failed attach must NOT
    // roll back the publish, so we swallow its error into a soft warning path.
    const row = practice as { id: string; title: string; event_id: string | null };
    if (input.publish && input.calendar && !row.event_id) {
      const attach = await attachPracticeToCalendar({
        title: row.title,
        date: input.calendar.date,
        startTime: input.calendar.startTime ?? null,
        endTime: input.calendar.endTime ?? null,
        location: input.calendar.location ?? null,
      });
      if (attach.success && attach.data?.eventId) {
        eventId = attach.data.eventId;
        await fromUntyped(supabase, 'baseball_practices')
          .update({ event_id: eventId, updated_at: new Date().toISOString() })
          .eq('id', row.id)
          .eq('team_id', teamId);
        revalidatePath(CALENDAR_PATH);
      }
    }

    revalidatePath(PRACTICE_PATH);
    return { success: true, data: { eventId } };
  },
);

// -----------------------------------------------------------------------------
// Record attendance (idempotent UPSERT — never delete-then-reinsert).
// -----------------------------------------------------------------------------

export const recordPracticeAttendance = withBaseballAction(
  'recordPracticeAttendance',
  FEATURE,
  async (
    ctx,
    input: { practiceId: string; entries: AttendanceEntryInput[] },
  ): Promise<ActionResult> => {
    const supabase = await createClient();
    const teamId = ctx.targetTeamId;

    if (input.entries.length === 0) {
      return { success: true };
    }

    const payload = input.entries.map((e) => ({
      team_id: teamId,
      practice_id: input.practiceId,
      player_id: e.playerId,
      status: e.status,
      reason: e.reason ?? null,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await fromUntyped(supabase, 'baseball_practice_attendance').upsert(payload, {
      onConflict: 'practice_id,player_id',
    });
    if (error) return { success: false, error: sanitizeDbError(error, 'practice') };

    revalidatePath(PRACTICE_PATH);
    return { success: true };
  },
);

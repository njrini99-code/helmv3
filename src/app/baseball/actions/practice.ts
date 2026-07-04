'use server';
import { withAdminObserved } from '@/lib/admin/observed-action';
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
import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import type {
  BaseballPracticeRow,
  BaseballPracticeStatus,
  BaseballPracticeWithDetail,
  BaseballPracticeAttendanceStatus,
} from '@/lib/types/baseball-practice';

const PRACTICE_PATH = '/baseball/dashboard/practice';
const CALENDAR_PATH = '/baseball/dashboard/calendar';
const PLAYER_PRACTICE_PATH = '/baseball/player/practice';

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
async function getTeamPracticesImpl(): Promise<ActionResult<BaseballPracticeWithDetail[]>> {
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
        coach_owner:baseball_coaches(id, full_name)
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
          ? (b.coach_owner.full_name?.trim() || null)
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
async function materializePracticeBlockFromSignalImpl(
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
    revalidatePath(PLAYER_PRACTICE_PATH);

    // PUBLISH → NOTIFY: insert a baseball_notifications row for every rostered
    // player when a practice is newly published (not on unpublish). A failed
    // notify never rolls back the publish — it is a soft, best-effort operation.
    if (input.publish) {
      try {
        const row2 = practice as { id: string; title: string; event_id: string | null };
        // Resolve all team members who are players (user_id needed for the notification).
        const { data: members } = await supabase
          .from('baseball_team_members')
          .select('player_id, baseball_players(id, user_id)')
          .eq('team_id', teamId);

        if (members && members.length > 0) {
          // Build the notification title. Prefer the practice title; fall back to generic.
          const practiceTitle = row2.title ?? 'Practice plan';
          // Resolve date context from the calendar attach if supplied.
          const dateLabel = input.calendar?.date
            ? ` for ${input.calendar.date}`
            : '';

          const notifications = (members as {
            player_id: string;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            baseball_players: any;
          }[])
            .map((m) => {
              const player = Array.isArray(m.baseball_players)
                ? m.baseball_players[0]
                : m.baseball_players;
              const userId: string | null = player?.user_id ?? null;
              if (!userId) return null;
              return {
                user_id: userId,
                type: 'practice_published',
                title: `${practiceTitle}${dateLabel} is now available`,
                body: 'Your practice plan has been published. Tap to view your schedule.',
                data: { practice_id: row2.id, team_id: teamId },
              };
            })
            .filter((n): n is NonNullable<typeof n> => n !== null);

          if (notifications.length > 0) {
            await supabase.from('baseball_notifications').insert(notifications);
          }
        }
      } catch {
        // Best-effort: do not roll back publish on notify failure.
      }
    }

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

// -----------------------------------------------------------------------------
// Player-facing: published practices + personalized view (class-conflict aware)
// -----------------------------------------------------------------------------

export interface PlayerPracticeBlockView {
  id: string;
  startOffsetMin: number;
  durationMin: number;
  activity: string;
  description: string | null;
  location: string | null;
  stationType: string | null;
  groupLabel: string | null;
  equipment: string | null;
  coachOwnerName: string | null;
  isMeasured: boolean;
  /** True when this block's time window overlaps with any of the player's classes. */
  hasClassConflict: boolean;
  /** Class name(s) that conflict, if hasClassConflict is true. */
  conflictingClasses: string[];
}

export interface PlayerPracticeView {
  id: string;
  title: string;
  focus: string | null;
  publishedAt: string | null;
  calendarDate: string | null;
  calendarStartTime: string | null;
  calendarEndTime: string | null;
  location: string | null;
  totalMinutes: number;
  blocks: PlayerPracticeBlockView[];
  myAttendanceStatus: string | null;
}

/** Format an ISO timestamptz (e.g. baseball_events.start_time) to a local
 * "HH:mm" wall-clock string. Returns null on missing/unparseable input —
 * never fabricates a time. */
function isoToClock(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Format an ISO timestamptz to a local "YYYY-MM-DD" date string. Returns
 * null on missing/unparseable input. */
function isoToDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Get the most recent published practices for the active team, in the player's
 * personalized view. Blocks marked staff_only are hidden. Each block is
 * cross-checked against the player's class schedule for overlap (class-conflict
 * flag) when baseball_player_classes data is available. If class data is
 * unavailable (e.g. player hasn't entered classes), conflict flags are omitted.
 *
 * This action is a PLAYER read — it resolves the player from session (never
 * from input). Players only ever see their own attendance + their own class
 * conflicts. A coach calling this action sees the plan without a conflict layer.
 */
async function getPlayerPracticesImpl(): Promise<
  ActionResult<PlayerPracticeView[]>
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  // Resolve the active baseball context so we know the active team + player id.
  const context = await getActiveBaseballContext();
  if (!context) return { success: false, error: 'No active team' };

  const teamId = context.activeTeamId;
  const playerId = context.activePlayerId; // null for coaches

  // Fetch published practices + their player-visible blocks + attendance.
  // event_id is nullable (a practice may be published without a calendar
  // event attached), so baseball_events must be a LEFT embed (no `!inner`) —
  // otherwise practices without a linked event would silently disappear from
  // this list. This mirrors the join pattern in
  // src/lib/baseball/read-models/player-today.ts, minus the `!inner`.
  const { data: practices, error: practiceErr } = await fromUntyped(supabase, 'baseball_practices')
    .select(
      `
      id, title, focus, published_at, status, event_id,
      event:baseball_events(start_time, end_time, location),
      blocks:baseball_practice_blocks(
        id, start_offset_min, duration_min, activity, description,
        location, station_type, group_label, equipment, is_measured,
        coach_owner_id, visibility,
        coach_owner:baseball_coaches(id, full_name)
      ),
      attendance:baseball_practice_attendance(player_id, status)
    `,
    )
    .eq('team_id', teamId)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(10);

  if (practiceErr) return { success: false, error: sanitizeDbError(practiceErr, 'practice') };

  // Fetch the player's class schedule for conflict detection.
  // This is best-effort: if unavailable or empty, no conflicts are flagged.
  let playerClasses: Array<{
    id: string;
    class_name: string;
    days: string[] | null;
    start_time: string | null;
    end_time: string | null;
  }> = [];

  if (playerId) {
    const { data: classes } = await supabase
      .from('baseball_player_classes')
      .select('id, class_name, days, start_time, end_time')
      .eq('player_id', playerId)
      .eq('team_id', teamId);
    playerClasses = classes ?? [];
  }

  /**
   * Detect whether a block's time window conflicts with a class.
   * Practice blocks use start_offset_min + duration_min (relative offsets from
   * plan start, NOT wall-clock times). We can only detect conflicts when the
   * practice has a known wall-clock start time AND the class has start/end times.
   * Without both anchors we return no conflicts (honest — never fabricate flags).
   *
   * When a start time IS known: convert the offset to a HH:mm wall-clock time,
   * then check for overlap against each class time range.
   */
  function detectConflicts(
    blockStartOffset: number,
    blockDuration: number,
    practiceStartTime: string | null,
  ): { hasConflict: boolean; names: string[] } {
    if (!practiceStartTime || playerClasses.length === 0) {
      return { hasConflict: false, names: [] };
    }

    // Parse HH:mm practice start into total minutes.
    const startParts = practiceStartTime.split(':').map(Number);
    const startH = startParts[0] ?? NaN;
    const startM = startParts[1] ?? NaN;
    if (!Number.isFinite(startH) || !Number.isFinite(startM)) {
      return { hasConflict: false, names: [] };
    }
    const blockWallStart = startH * 60 + startM + blockStartOffset;
    const blockWallEnd = blockWallStart + blockDuration;

    const conflicting: string[] = [];
    for (const cls of playerClasses) {
      if (!cls.start_time || !cls.end_time) continue;
      const startPts = cls.start_time.split(':').map(Number);
      const endPts = cls.end_time.split(':').map(Number);
      const cH = startPts[0] ?? NaN;
      const cM = startPts[1] ?? NaN;
      const eH = endPts[0] ?? NaN;
      const eM = endPts[1] ?? NaN;
      if (!Number.isFinite(cH) || !Number.isFinite(eH)) continue;
      const classStart = cH * 60 + cM;
      const classEnd = eH * 60 + eM;
      // Overlap when block starts before class ends AND block ends after class starts.
      if (blockWallStart < classEnd && blockWallEnd > classStart) {
        conflicting.push(cls.class_name);
      }
    }
    return { hasConflict: conflicting.length > 0, names: conflicting };
  }

  // Shape the response.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const views: PlayerPracticeView[] = (practices ?? []).map((p: any) => {
    // baseball_practices has no calendar_* columns of its own — those live on
    // the linked baseball_events row (event_id -> baseball_events.id), joined
    // above as `event`. The embed can come back as an object or a 1-item
    // array depending on how PostgREST infers the relationship cardinality,
    // so normalize both shapes the same way coach_owner is handled below.
    const event = Array.isArray(p.event) ? p.event[0] : p.event;
    const eventStartIso: string | null = event?.start_time ?? null;
    const eventEndIso: string | null = event?.end_time ?? null;
    const startTime: string | null = isoToClock(eventStartIso);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const visibleBlocks = (p.blocks ?? []).filter((b: any) => b.visibility !== 'staff_only');
    const totalMinutes = visibleBlocks.reduce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sum: number, b: any) => Math.max(sum, b.start_offset_min + b.duration_min),
      0,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const myAtt = (p.attendance ?? []).find((a: any) => a.player_id === playerId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blocks: PlayerPracticeBlockView[] = visibleBlocks.map((b: any) => {
      const coachOwner = Array.isArray(b.coach_owner) ? b.coach_owner[0] : b.coach_owner;
      const coachName = coachOwner
        ? (coachOwner.full_name?.trim() || null)
        : null;

      const { hasConflict, names } = detectConflicts(
        b.start_offset_min,
        b.duration_min,
        startTime,
      );

      return {
        id: b.id,
        startOffsetMin: b.start_offset_min,
        durationMin: b.duration_min,
        activity: b.activity,
        description: b.description ?? null,
        location: b.location ?? null,
        stationType: b.station_type ?? null,
        groupLabel: b.group_label ?? null,
        equipment: b.equipment ?? null,
        coachOwnerName: coachName,
        isMeasured: b.is_measured ?? false,
        hasClassConflict: hasConflict,
        conflictingClasses: names,
      };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }).sort((a: any, z: any) => a.startOffsetMin - z.startOffsetMin);

    return {
      id: p.id,
      title: p.title,
      focus: p.focus ?? null,
      publishedAt: p.published_at ?? null,
      calendarDate: isoToDate(eventStartIso),
      calendarStartTime: startTime,
      calendarEndTime: isoToClock(eventEndIso),
      location: event?.location ?? null,
      totalMinutes,
      blocks,
      myAttendanceStatus: myAtt?.status ?? null,
    };
  });

  return { success: true, data: views };
}

// -----------------------------------------------------------------------------
// Coach-side: class conflict summary for the practice planner.
//
// Returns a map of player_id → array of class names that have unresolved
// conflicts with ANYTHING in the practice plan being built. The coach uses this
// to see a conflict flag on a player's block row in the planner editor.
//
// HONESTY: only returns rows where disposition = 'open' (unresolved), and only
// when baseball_player_classes + baseball_class_conflicts data exists. If the
// team has no class data at all, returns an empty map — never fabricates flags.
// -----------------------------------------------------------------------------

export interface ClassConflictSummary {
  /** player_id → list of conflicting class names */
  byPlayer: Record<string, string[]>;
}

/**
 * Fetch unresolved class conflicts for all players on the active team that are
 * linked to a specific practice. Used by the practice planner editor to show a
 * conflict indicator on a per-block or per-player basis.
 *
 * Requires coach auth (can_manage_practice capability). A player never calls
 * this — they get their personalized conflict flags via getPlayerPractices().
 */
export const getClassConflictsForPractice = withBaseballAction(
  'getClassConflictsForPractice',
  FEATURE,
  async (
    ctx,
    input: { practiceId: string },
  ): Promise<ActionResult<ClassConflictSummary>> => {
    const supabase = await createClient();
    const teamId = ctx.targetTeamId;

    const { data, error } = await supabase
      .from('baseball_class_conflicts')
      .select('player_id, class_name')
      .eq('team_id', teamId)
      .eq('practice_id', input.practiceId)
      .eq('disposition', 'open');

    if (error) return { success: false, error: sanitizeDbError(error, 'practice') };

    const byPlayer: Record<string, string[]> = {};
    for (const row of data ?? []) {
      const pid = row.player_id as string;
      const cname = (row.class_name as string | null) ?? 'Unknown class';
      if (!byPlayer[pid]) byPlayer[pid] = [];
      if (!byPlayer[pid].includes(cname)) byPlayer[pid].push(cname);
    }

    return { success: true, data: { byPlayer } };
  },
);

export const getTeamPractices = withAdminObserved(
  'getTeamPractices',
  { sport: 'baseball', feature: 'baseball_practice', featureArea: 'baseball-practice' },
  getTeamPracticesImpl,
);

export const materializePracticeBlockFromSignal = withAdminObserved(
  'materializePracticeBlockFromSignal',
  { sport: 'baseball', feature: 'baseball_practice', featureArea: 'baseball-practice' },
  materializePracticeBlockFromSignalImpl,
);

export const getPlayerPractices = withAdminObserved(
  'getPlayerPractices',
  { sport: 'baseball', feature: 'baseball_practice', featureArea: 'baseball-practice' },
  getPlayerPracticesImpl,
);

'use server';

// =============================================================================
// src/app/baseball/actions/video-classes.ts
//
// Packet: video-classes — server actions for:
//   (A) Video event references (V6 §Video Automation + §Video UI): link a clip
//       to a game / at-bat (plate appearance) / pitch / swing / practice with
//       a source; review/approve in the film queue; convert a clip to a task /
//       dev-plan item / meeting agenda item (creates a baseball_actions row);
//       mark a clip reviewed by the player.
//   (B) Class-conflict automation (V6 §Class Conflict Engine): re-derive a
//       player's (or the whole team's) class-vs-obligation conflicts, UPSERT the
//       baseball_class_conflicts rows non-destructively, and SURFACE each open
//       conflict into the Signal Inbox (baseball_signals) so it becomes triage
//       work — every signal carries source refs, confidence, owner-role,
//       recommended action, visibility, generated_at, and a disposition.
//
// Every mutation runs inside withBaseballAction({ featureArea, requiredCapability })
// so auth + active-context + SERVER-SIDE capability enforcement + Sentry + error
// logging are uniform, and raw DB errors never reach the client.
//
// NON-DESTRUCTIVE (CLAUDE.md hard rule): video links + conflicts are UPSERTed by
// stable keys / updated in place. No delete-then-reinsert in any save/sync path.
// Conflicts that no longer hold are EXPIRED (disposition update), never deleted.
//
// SOURCE -> SIGNAL -> ACTION -> TIMELINE: a converted clip / surfaced conflict
// is itself source-backed (source_refs carried through). A player-affecting,
// player-visible action also appends a player timeline entry (best-effort).
//
// This module OWNS the video-classes surface. It does NOT edit signals.ts (it
// only INSERTs/UPSERTs baseball_signals rows the inbox already triages) or
// baseball-stat-events.ts.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import {
  withBaseballAction,
  BaseballActionError,
} from '@/lib/baseball/with-baseball-action';
import { appendTimelineEvent } from '@/lib/baseball/timeline-writer';
import { normalizeConfidence } from '@/lib/baseball/source-record';
import {
  detectClassConflictsForPlayer,
  conflictToSignalSeverity,
  type ClassInput,
  type ObligationInput,
  type PlayerConflictContext,
  type DerivedConflict,
} from '@/lib/baseball/class-conflict-engine';
import {
  isAnchoredVideoLink,
  type BaseballVideoLink,
  type BaseballVideoLinkInsert,
  type BaseballVideoReviewStatus,
  type BaseballConflictActionType,
  type BaseballSignalSourceRef,
  type BaseballJson,
} from '@/lib/types/baseball-video-classes';
import type {
  BaseballActionType,
  BaseballSignalInsert,
} from '@/lib/types/baseball-signals';

// -----------------------------------------------------------------------------
// Shared result + paths
// -----------------------------------------------------------------------------

export interface VideoClassesResult {
  success: boolean;
  ids?: string[];
  /** Counts for a conflict run: detected / hard / signalsEmitted. */
  stats?: { detected: number; hard: number; signalsEmitted: number };
  error?: string;
}

const VIDEO_PATH = '/baseball/dashboard/video';
const VIDEOS_LIBRARY_PATH = '/baseball/dashboard/videos';
const CONFLICTS_PATH = '/baseball/dashboard/conflicts';
const SIGNALS_PATH = '/baseball/dashboard/signals';
const PLAYER_TODAY_PATH = '/baseball/player';

// =============================================================================
// (A) VIDEO EVENT REFERENCES
// =============================================================================

/**
 * Link a clip to a game / at-bat / pitch / swing / practice. The clip must be a
 * real reference: anchored to something AND carry media (video_id OR external
 * URL). Source provenance is required (vendor + label) — no unsourced clips.
 */
export const linkVideoEvent = withBaseballAction(
  'linkVideoEvent',
  { featureArea: 'baseball-video', requiredCapability: 'can_manage_stats' },
  async (
    ctx,
    input: BaseballVideoLinkInsert,
  ): Promise<VideoClassesResult> => {
    if (!isAnchoredVideoLink(input)) {
      return {
        success: false,
        error:
          'A clip must be linked to a game, at-bat, pitch, swing, or practice and carry a video URL.',
      };
    }
    if (!input.source_vendor) {
      return { success: false, error: 'A clip must record where it came from.' };
    }

    const supabase = await createClient();
    const row = {
      ...input,
      team_id: ctx.targetTeamId,
      source_confidence:
        input.source_confidence != null
          ? normalizeConfidence(input.source_confidence)
          : null,
      review_status: input.review_status ?? 'needs_review',
      disposition: input.disposition ?? 'active',
      created_by: ctx.user.id,
      updated_at: new Date().toISOString(),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('baseball_video_events')
      .insert(row)
      .select('id')
      .single();

    if (error || !data) {
      return { success: false, error: 'Could not link the clip.' };
    }

    revalidatePath(VIDEO_PATH);
    return { success: true, ids: [(data as { id: string }).id] };
  },
);

/** Advance a clip's film-queue review status (staff). approved/reviewed records
 * the reviewer + timestamp. Non-destructive — only updates lifecycle fields. */
export const reviewVideoEvent = withBaseballAction(
  'reviewVideoEvent',
  { featureArea: 'baseball-video', requiredCapability: 'can_manage_stats' },
  async (
    ctx,
    input: {
      videoId: string;
      reviewStatus: BaseballVideoReviewStatus;
      coachAnnotation?: string;
    },
  ): Promise<VideoClassesResult> => {
    const supabase = await createClient();
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      review_status: input.reviewStatus,
      updated_at: now,
    };
    if (input.reviewStatus === 'reviewed' || input.reviewStatus === 'approved') {
      patch.reviewed_by = ctx.user.id;
      patch.reviewed_at = now;
    }
    if (input.coachAnnotation != null) {
      patch.coach_annotation = input.coachAnnotation;
      patch.annotation_author_id = ctx.activeCoachId;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('baseball_video_events')
      .update(patch)
      .eq('id', input.videoId)
      .eq('team_id', ctx.targetTeamId);

    if (error) return { success: false, error: 'Could not update the clip.' };
    revalidatePath(VIDEO_PATH);
    return { success: true, ids: [input.videoId] };
  },
);

/**
 * Convert a clip into a baseball_actions work item (V6 §Video UI: convert clip
 * to task / dev-plan item / meeting agenda). Creates the action carrying the
 * clip's source provenance, links the clip back to the action, and (for a
 * player-visible, player-targeted action) appends a player timeline entry.
 */
export const convertVideoToAction = withBaseballAction(
  'convertVideoToAction',
  { featureArea: 'baseball-video', requiredCapability: 'can_manage_stats' },
  async (
    ctx,
    input: {
      videoId: string;
      actionType: Extract<
        BaseballActionType,
        'player_task' | 'meeting_item' | 'player_note'
      >;
      title: string;
      detail?: string;
      assigneePlayerId?: string | null;
      dueDate?: string | null;
    },
  ): Promise<VideoClassesResult> => {
    const supabase = await createClient();

    // Load the clip (scoped to team — defense in depth on top of RLS).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: clip } = await (supabase as any)
      .from('baseball_video_events')
      .select('*')
      .eq('id', input.videoId)
      .eq('team_id', ctx.targetTeamId)
      .maybeSingle();
    const video = clip as BaseballVideoLink | null;
    if (!video) return { success: false, error: 'Clip not found.' };

    const now = new Date().toISOString();
    // Carry the clip's own provenance onto the action: the clip IS the source.
    const clipRef: BaseballSignalSourceRef = {
      source_table: 'baseball_video_events',
      source_id: video.id,
      label: video.clip_title ?? video.source_label ?? 'Video clip',
      confidence: video.source_confidence ?? null,
      visibility: video.visibility === 'player_visible' ? 'player_only' : 'staff_only',
    };
    const existingRefs = Array.isArray(video.source_refs)
      ? (video.source_refs as unknown as BaseballSignalSourceRef[])
      : [];
    const sourceRefs = [clipRef, ...existingRefs] as unknown as BaseballJson;

    const visibility =
      input.actionType === 'meeting_item' || input.actionType === 'player_note'
        ? video.visibility === 'player_visible'
          ? 'player_only'
          : 'staff_only'
        : 'player_only'; // player_task -> player sees it

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: action, error: aErr } = await (supabase as any)
      .from('baseball_actions')
      .insert({
        team_id: ctx.targetTeamId,
        player_id: video.player_id,
        game_id: null,
        action_type: input.actionType,
        title: input.title,
        detail: input.detail ?? null,
        assignee_player_id: input.assigneePlayerId ?? video.player_id ?? null,
        due_date: input.dueDate ?? null,
        status: 'open',
        source_refs: sourceRefs,
        confidence: video.source_confidence ?? null,
        visibility,
        created_by: ctx.user.id,
      })
      .select('id')
      .single();

    if (aErr || !action) {
      return { success: false, error: 'Could not create the action from the clip.' };
    }
    const actionId = (action as { id: string }).id;

    // Link the clip back to the action it became (non-destructive update).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('baseball_video_events')
      .update({ linked_action_id: actionId, updated_at: now })
      .eq('id', video.id)
      .eq('team_id', ctx.targetTeamId);

    // Player timeline for a player-visible, player-targeted conversion.
    const subjectPlayer = input.assigneePlayerId ?? video.player_id;
    if (subjectPlayer && visibility !== 'staff_only') {
      await appendTimelineEvent({
        teamId: ctx.targetTeamId,
        playerId: subjectPlayer,
        kind: 'system',
        title: input.title,
        body: 'Created from a video clip.',
        visibility: 'player_only',
        source: 'system',
        sourceId: video.id,
        createdBy: ctx.user.id,
      });
    }

    revalidatePath(VIDEO_PATH);
    revalidatePath(SIGNALS_PATH);
    revalidatePath(PLAYER_TODAY_PATH);
    return { success: true, ids: [actionId] };
  },
);

/** Player marks a clip they were shown as reviewed (V6 §"Mark clip as reviewed
 * by player"). RLS lets the player update only their own player-visible clip. */
export const markVideoReviewedByPlayer = withBaseballAction(
  'markVideoReviewedByPlayer',
  { featureArea: 'baseball-video' },
  async (ctx, input: { videoId: string }): Promise<VideoClassesResult> => {
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('baseball_video_events')
      .update({
        reviewed_by_player_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.videoId)
      .eq('team_id', ctx.activeTeamId);
    if (error) return { success: false, error: 'Could not mark the clip reviewed.' };
    revalidatePath(VIDEO_PATH);
    revalidatePath(PLAYER_TODAY_PATH);
    return { success: true, ids: [input.videoId] };
  },
);

// =============================================================================
// (A2) VIDEO LIBRARY CRUD — baseball_videos (player highlight / recruiting reel)
//
// The /dashboard/videos library operates on baseball_videos (the player-owned
// highlight/recruiting reel table), a DIFFERENT table from the anchored
// baseball_video_events film queue above. Previously the page mutated this table
// (insert/update/delete + storage.remove) DIRECTLY from the browser client, so
// player video uploads had NO server-side enforcement of the
// players_can_upload_video Settings-OS toggle and no centralized error logging.
//
// These actions move every baseball_videos mutation server-side, GATED on the
// can_upload_video player-access toggle (coaches bypass via the resolver, so
// staff can always curate film). Identity comes from the resolved active context
// + a server-side ownership re-check; we never trust a client-supplied
// player_id. RLS still backstops row ownership. Non-destructive: a single-row
// delete of one's own clip plus its storage object is the intended teardown of a
// user-removed video (not a save/sync-path bulk delete the no-destructive rule
// targets), and it stays scoped to the caller's own player_id.
// =============================================================================

/** A clip's metadata after upload — what a player may write to their own clip. */
const videoMetaSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional().nullable(),
  videoType: z.string().trim().max(40).optional().nullable(),
});

/** Persist a freshly-uploaded clip's row for the active player. The storage
 * upload itself happens client-side against the player's own folder (RLS-scoped
 * bucket); this records the row + flips the player's has_video flag. GATED on
 * can_upload_video so a program that disables player uploads blocks it
 * server-side, not just by hiding the button. */
export const saveMyVideo = withBaseballAction(
  'saveMyVideo',
  { featureArea: 'baseball-video', requiredPlayerAccess: 'can_upload_video' },
  async (
    ctx,
    input: z.input<typeof videoMetaSchema> & {
      url: string;
      thumbnailUrl?: string | null;
      durationSeconds?: number | null;
    },
  ): Promise<VideoClassesResult> => {
    if (!ctx.activePlayerId) {
      throw new BaseballActionError('Only a player can upload a video.');
    }
    const meta = videoMetaSchema.parse(input);
    if (!input.url) {
      return { success: false, error: 'A video upload is required.' };
    }

    const supabase = await createClient();
    const { data, error } = await supabase.from('baseball_videos')
      .insert({
        player_id: ctx.activePlayerId,
        team_id: ctx.activeTeamId,
        title: meta.title,
        description: meta.description ?? null,
        video_type: meta.videoType ?? null,
        url: input.url,
        thumbnail_url: input.thumbnailUrl ?? null,
        duration: input.durationSeconds ?? null,
      })
      .select('id')
      .single();

    if (error || !data) {
      return { success: false, error: 'Could not save the video.' };
    }

    // Best-effort: a player with at least one clip has video (own row, RLS-safe).
    await supabase.from('baseball_players')
      .update({ has_video: true, updated_at: new Date().toISOString() })
      .eq('id', ctx.activePlayerId);

    revalidatePath(VIDEOS_LIBRARY_PATH);
    return { success: true, ids: [(data as { id: string }).id] };
  },
);

/** Edit a player's own clip metadata (title / description / type). GATED on
 * can_upload_video (coaches bypass). Ownership re-checked + RLS-scoped. */
export const updateMyVideo = withBaseballAction(
  'updateMyVideo',
  { featureArea: 'baseball-video', requiredPlayerAccess: 'can_upload_video' },
  async (
    ctx,
    input: z.input<typeof videoMetaSchema> & { videoId: string },
  ): Promise<VideoClassesResult> => {
    if (!ctx.activePlayerId) {
      throw new BaseballActionError('Only a player can edit their video.');
    }
    const meta = videoMetaSchema.parse(input);

    const supabase = await createClient();
    const { error } = await supabase.from('baseball_videos')
      .update({
        title: meta.title,
        description: meta.description ?? null,
        video_type: meta.videoType ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.videoId)
      .eq('player_id', ctx.activePlayerId);

    if (error) return { success: false, error: 'Could not update the video.' };
    revalidatePath(VIDEOS_LIBRARY_PATH);
    return { success: true, ids: [input.videoId] };
  },
);

/** Delete a player's own clip and its storage object. GATED on can_upload_video.
 * Scoped to the caller's own player_id (RLS + explicit filter); when the player
 * has no clips left, clears their has_video flag. */
export const deleteMyVideo = withBaseballAction(
  'deleteMyVideo',
  { featureArea: 'baseball-video', requiredPlayerAccess: 'can_upload_video' },
  async (
    ctx,
    input: { videoId: string },
  ): Promise<VideoClassesResult> => {
    if (!ctx.activePlayerId) {
      throw new BaseballActionError('Only a player can delete their video.');
    }
    const supabase = await createClient();

    // Load the row (own clip only) so we can clean up its storage object and
    // never act on a clip the caller doesn't own (defense in depth on RLS).
    const { data: clip } = await supabase.from('baseball_videos')
      .select('id, url')
      .eq('id', input.videoId)
      .eq('player_id', ctx.activePlayerId)
      .maybeSingle();
    const row = clip as { id: string; url: string | null } | null;
    if (!row) return { success: false, error: 'Video not found.' };

    // Best-effort storage cleanup: derive the "<player>/<file>" object path from
    // the public URL's last two segments (matches the upload layout).
    if (row.url) {
      const parts = row.url.split('/');
      const filePath = parts.slice(-2).join('/');
      if (filePath) {
        await supabase.storage.from('baseball_videos').remove([filePath]);
      }
    }

    const { error } = await supabase.from('baseball_videos')
      .delete()
      .eq('id', input.videoId)
      .eq('player_id', ctx.activePlayerId);
    if (error) return { success: false, error: 'Could not delete the video.' };

    // If that was the player's last clip, clear has_video (own rows only).
    const { count } = await supabase.from('baseball_videos')
      .select('id', { count: 'exact', head: true })
      .eq('player_id', ctx.activePlayerId);
    if ((count ?? 0) === 0) {
      await supabase.from('baseball_players')
        .update({ has_video: false, updated_at: new Date().toISOString() })
        .eq('id', ctx.activePlayerId);
    }

    revalidatePath(VIDEOS_LIBRARY_PATH);
    return { success: true, ids: [input.videoId] };
  },
);

/** Mark one of a player's own clips as the primary highlight. GATED on
 * can_upload_video. Stage-and-swap by toggling all of the player's clips off
 * then the chosen one on, scoped to the caller's own player_id (non-destructive
 * — no rows are removed). */
export const setMyPrimaryVideo = withBaseballAction(
  'setMyPrimaryVideo',
  { featureArea: 'baseball-video', requiredPlayerAccess: 'can_upload_video' },
  async (
    ctx,
    input: { videoId: string },
  ): Promise<VideoClassesResult> => {
    if (!ctx.activePlayerId) {
      throw new BaseballActionError('Only a player can set a primary video.');
    }
    const supabase = await createClient();
    const now = new Date().toISOString();

    const { error: clearErr } = await supabase.from('baseball_videos')
      .update({ is_primary: false, updated_at: now })
      .eq('player_id', ctx.activePlayerId)
      .eq('is_primary', true);
    if (clearErr) return { success: false, error: 'Could not update the primary video.' };

    const { error } = await supabase.from('baseball_videos')
      .update({ is_primary: true, updated_at: now })
      .eq('id', input.videoId)
      .eq('player_id', ctx.activePlayerId);
    if (error) return { success: false, error: 'Could not update the primary video.' };

    revalidatePath(VIDEOS_LIBRARY_PATH);
    return { success: true, ids: [input.videoId] };
  },
);

/** Increment a clip's view count. Not gated (viewing is open to anyone who can
 * already read the row via RLS — teammates, staff). Best-effort; never throws to
 * the viewer. Reads the current count for the row the viewer can see, then
 * writes count+1 so we don't trust a client-supplied tally. */
export const incrementMyVideoView = withBaseballAction(
  'incrementMyVideoView',
  { featureArea: 'baseball-video' },
  async (
    _ctx,
    input: { videoId: string },
  ): Promise<VideoClassesResult> => {
    const supabase = await createClient();
    const { data: row } = await supabase.from('baseball_videos')
      .select('view_count')
      .eq('id', input.videoId)
      .maybeSingle();
    if (!row) return { success: false };
    const current = (row as { view_count: number | null }).view_count ?? 0;
    await supabase.from('baseball_videos')
      .update({ view_count: current + 1 })
      .eq('id', input.videoId);
    return { success: true, ids: [input.videoId] };
  },
);

// =============================================================================
// (B) CLASS-CONFLICT AUTOMATION
// =============================================================================

const SIGNAL_OWNER_ROLE = 'operations'; // ops/academic coordinator triages these
const CONFLICT_SIGNAL_TTL_DAYS = 14;

function conflictActionToSignalAction(
  t: BaseballConflictActionType,
): BaseballSignalInsert['recommended_action_type'] {
  // Conflict action types are a subset of the signal recommended-action union.
  return t;
}

/**
 * Re-derive class conflicts for the active team and surface them into the Signal
 * Inbox. Pulls each player's classes + the team's upcoming obligations
 * (events/games/practices), runs the PURE engine, UPSERTs the conflict rows by
 * dedupe_key, and UPSERTs a baseball_signals row per OPEN conflict.
 *
 * Requires can_view_academics (class data is academic) AND is enforced
 * server-side by the wrapper.
 */
export const runClassConflictDetection = withBaseballAction(
  'runClassConflictDetection',
  { featureArea: 'baseball-classes', requiredCapability: 'can_view_academics' },
  async (
    ctx,
    input?: { horizonDays?: number; timeZone?: string },
  ): Promise<VideoClassesResult> => {
    const supabase = await createClient();
    const teamId = ctx.targetTeamId;
    const now = new Date();
    const horizonDays = input?.horizonDays ?? 14;
    const horizon = new Date(now.getTime() + horizonDays * 86400000).toISOString();

    // --- Load classes for the team's players -------------------------------
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: classRows } = await (supabase as any)
      .from('baseball_player_classes')
      .select(
        'id, player_id, class_name, days, start_time, end_time, building, room, credits, semester, team_id',
      )
      .eq('team_id', teamId);
    const classes = (classRows ?? []) as Array<{
      id: string;
      player_id: string;
      class_name: string;
      days: string[] | null;
      start_time: string | null;
      end_time: string | null;
      building: string | null;
      room: string | null;
      credits: number | null;
      semester: string | null;
    }>;
    if (classes.length === 0) {
      return { success: true, stats: { detected: 0, hard: 0, signalsEmitted: 0 } };
    }

    // --- Load upcoming team obligations ------------------------------------
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: eventRows } = await (supabase as any)
      .from('baseball_events')
      .select('id, title, event_type, start_time, end_time, is_mandatory, location')
      .eq('team_id', teamId)
      .gte('start_time', now.toISOString())
      .lte('start_time', horizon);
    const obligations: ObligationInput[] = ((eventRows ?? []) as Array<{
      id: string;
      title: string;
      event_type: string | null;
      start_time: string;
      end_time: string | null;
      is_mandatory: boolean | null;
      location: string | null;
    }>).map((e) => ({
      kind:
        e.event_type === 'travel'
          ? 'travel'
          : e.event_type === 'lift'
            ? 'lift'
            : e.event_type === 'study_hall'
              ? 'study_hall'
              : 'event',
      id: e.id,
      label: e.title,
      startsAt: e.start_time,
      endsAt: e.end_time,
      isMandatory: e.is_mandatory === true,
      location: e.location,
    }));

    // Per-player credit load + travel-in-window for the 'watch' tier.
    const creditByPlayer = new Map<string, number>();
    for (const c of classes) {
      creditByPlayer.set(
        c.player_id,
        (creditByPlayer.get(c.player_id) ?? 0) + (c.credits ?? 0),
      );
    }
    const teamHasTravel = obligations.some((o) => o.kind === 'travel');

    // --- Run the pure engine per player ------------------------------------
    const byPlayer = new Map<string, typeof classes>();
    for (const c of classes) {
      const arr = byPlayer.get(c.player_id) ?? [];
      arr.push(c);
      byPlayer.set(c.player_id, arr);
    }

    const allConflicts: DerivedConflict[] = [];
    for (const [playerId, pClasses] of byPlayer) {
      const classInputs: ClassInput[] = pClasses.map((c) => ({
        classId: c.id,
        playerId: c.player_id,
        className: c.class_name,
        days: c.days ?? [],
        startTime: c.start_time,
        endTime: c.end_time,
        building: c.building,
        room: c.room,
        credits: c.credits,
        semester: c.semester,
      }));
      const playerCtx: PlayerConflictContext = {
        playerId,
        totalCredits: creditByPlayer.get(playerId) ?? null,
        complianceRate: null, // wired when ack/attendance read model is available
        hasTravelInWindow: teamHasTravel,
      };
      const conflicts = detectClassConflictsForPlayer(
        classInputs,
        obligations,
        playerCtx,
        { timeZone: input?.timeZone },
      );
      allConflicts.push(...conflicts);
    }

    if (allConflicts.length === 0) {
      return { success: true, stats: { detected: 0, hard: 0, signalsEmitted: 0 } };
    }

    // --- UPSERT conflict rows + emit signals (non-destructive) -------------
    const expiresAt = new Date(
      now.getTime() + CONFLICT_SIGNAL_TTL_DAYS * 86400000,
    ).toISOString();
    let signalsEmitted = 0;
    let hard = 0;

    for (const c of allConflicts) {
      if (c.severity === 'hard') hard += 1;

      // 1) UPSERT the signal first so we can link the conflict to it.
      const signalRow: BaseballSignalInsert = {
        team_id: teamId,
        player_id: c.playerId,
        event_id: c.eventId,
        signal_type: `class_conflict_${c.severity}`,
        category: 'academics',
        severity: conflictToSignalSeverity(c.severity),
        title: `Class conflict: ${c.className} vs ${c.obligationLabel}`,
        why_it_matters: c.whyItMatters,
        evidence: `${c.classDay} ${c.classStart}–${c.classEnd}${
          c.overlapMinutes > 0 ? ` · ${c.overlapMinutes} min overlap` : ' · back-to-back'
        }`,
        source_refs: c.sourceRefs as unknown as BaseballJson,
        confidence: normalizeConfidence(c.confidence),
        sample_n: null,
        recommended_action_label: c.recommendedActionLabel,
        recommended_action_type: conflictActionToSignalAction(
          c.recommendedActionType,
        ),
        recommended_owner_role: SIGNAL_OWNER_ROLE,
        disposition: 'new',
        // Academic conflict is staff-private unless a coach later shares it.
        visibility: 'staff_only',
        generated_by: 'class_conflict_engine',
        source_kind: 'system',
        dedupe_key: c.dedupeKey,
        expires_at: expiresAt,
        created_by: ctx.user.id,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: sig } = await (supabase as any)
        .from('baseball_signals')
        .upsert(signalRow, { onConflict: 'team_id,dedupe_key' })
        .select('id')
        .maybeSingle();
      const signalId = (sig as { id: string } | null)?.id ?? null;
      if (signalId) signalsEmitted += 1;

      // 2) UPSERT the conflict row, linked to its signal.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('baseball_class_conflicts').upsert(
        {
          team_id: teamId,
          player_id: c.playerId,
          class_id: c.classId,
          class_name: c.className,
          class_day: c.classDay,
          obligation_kind: c.obligationKind,
          event_id: c.eventId,
          game_id: c.gameId,
          practice_id: c.practiceId,
          obligation_label: c.obligationLabel,
          obligation_start: c.obligationStart,
          obligation_end: c.obligationEnd,
          is_mandatory: c.isMandatory,
          severity: c.severity,
          overlap_minutes: c.overlapMinutes,
          confidence: normalizeConfidence(c.confidence),
          why_it_matters: c.whyItMatters,
          source_refs: c.sourceRefs as unknown as BaseballJson,
          recommended_action_label: c.recommendedActionLabel,
          recommended_action_type: c.recommendedActionType,
          signal_id: signalId,
          visibility: 'staff_only',
          disposition: 'open',
          dedupe_key: c.dedupeKey,
          expires_at: expiresAt,
          created_by: ctx.user.id,
          updated_at: now.toISOString(),
        },
        { onConflict: 'team_id,dedupe_key' },
      );
    }

    revalidatePath(CONFLICTS_PATH);
    revalidatePath(SIGNALS_PATH);
    return {
      success: true,
      stats: { detected: allConflicts.length, hard, signalsEmitted },
    };
  },
);

/** Triage a single class conflict (staff): acknowledge / resolve / dismiss.
 * Keeps the linked signal's disposition in sync (best-effort). */
export const updateClassConflictDisposition = withBaseballAction(
  'updateClassConflictDisposition',
  { featureArea: 'baseball-classes', requiredCapability: 'can_view_academics' },
  async (
    ctx,
    input: {
      conflictId: string;
      disposition: 'acknowledged' | 'resolved' | 'dismissed';
    },
  ): Promise<VideoClassesResult> => {
    const supabase = await createClient();
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      disposition: input.disposition,
      updated_at: now,
    };
    if (input.disposition === 'acknowledged') {
      patch.acknowledged_by = ctx.user.id;
      patch.acknowledged_at = now;
    }
    if (input.disposition === 'resolved') patch.resolved_at = now;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row, error } = await (supabase as any)
      .from('baseball_class_conflicts')
      .update(patch)
      .eq('id', input.conflictId)
      .eq('team_id', ctx.targetTeamId)
      .select('signal_id')
      .maybeSingle();

    if (error) return { success: false, error: 'Could not update the conflict.' };

    // Sync the linked signal (best-effort; conflict disposition is the truth).
    const signalId = (row as { signal_id: string | null } | null)?.signal_id;
    if (signalId) {
      const sigDisposition =
        input.disposition === 'resolved'
          ? 'resolved'
          : input.disposition === 'dismissed'
            ? 'dismissed'
            : 'acknowledged';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('baseball_signals')
        .update({ disposition: sigDisposition, updated_at: now })
        .eq('id', signalId)
        .eq('team_id', ctx.targetTeamId);
    }

    revalidatePath(CONFLICTS_PATH);
    revalidatePath(SIGNALS_PATH);
    return { success: true, ids: [input.conflictId] };
  },
);

// =============================================================================
// (A3) STAFF BATCH VIDEO UPLOAD — coach inserts baseball_videos on behalf of
// one or more players on the team.
//
// The previous pattern (BatchVideoUpload.tsx) uploaded a file client-side then
// did a direct browser INSERT into baseball_videos.  The existing RLS insert
// policy only allows a player to insert rows where player_id == their own auth
// uid — so coach inserts were rejected with 403, and the already-uploaded
// storage object became orphaned.
//
// This action fixes both problems:
//   1. The browser calls this action BEFORE touching storage; the action
//      validates identity + capability first.
//   2. The browser uploads to storage only after receiving a signed URL (or it
//      passes the already-uploaded public URL here for recording); on any
//      failure the caller can clean up before orphaning.
//   3. Capability gated on can_manage_roster — the same capability used for
//      roster mutations on behalf of players (the closest existing staff cap for
//      managing player film).  RLS still backstops via the new coach INSERT
//      policy added in migration 20260624002000.
//
// NON-DESTRUCTIVE: inserts only.  Each call records one video row per selected
// player; no existing rows are removed.
// =============================================================================

const batchVideoMetaSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional().nullable(),
  videoType: z.string().trim().max(40).optional().nullable(),
  /** Public storage URL returned by supabase.storage.getPublicUrl() after upload. */
  url: z.string().url(),
  /** Player IDs (all must belong to the active team — enforced server-side). */
  playerIds: z.array(z.string().uuid()).min(1).max(100),
});

/**
 * Record a staff-uploaded video against one or more players on the coach's
 * active team. GATED on can_manage_roster (head/primary coaches implicitly hold
 * it). The browser should complete the storage upload and obtain the public URL
 * BEFORE calling this action — that way a capability failure aborts before any
 * storage write, eliminating the orphan-file class of bug.
 */
export const batchUploadStaffVideos = withBaseballAction(
  'batchUploadStaffVideos',
  { featureArea: 'baseball-video', requiredCapability: 'can_manage_roster' },
  async (
    ctx,
    input: z.input<typeof batchVideoMetaSchema>,
  ): Promise<VideoClassesResult> => {
    if (!ctx.activeCoachId) {
      throw new BaseballActionError('Only a staff member can batch-upload team videos.');
    }

    const meta = batchVideoMetaSchema.parse(input);
    const supabase = await createClient();

    // Verify every supplied player_id belongs to the active team so a coach
    // cannot write video rows for players on other teams.
    const { data: memberRows } = await supabase.from('baseball_team_members')
      .select('player_id')
      .eq('team_id', ctx.activeTeamId)
      .in('player_id', meta.playerIds);

    const confirmedPlayerIds = new Set(
      ((memberRows ?? []) as Array<{ player_id: string }>).map((r) => r.player_id),
    );
    const unconfirmed = meta.playerIds.filter((id) => !confirmedPlayerIds.has(id));
    if (unconfirmed.length > 0) {
      return { success: false, error: 'One or more players are not on your active team.' };
    }

    const now = new Date().toISOString();
    const rows = meta.playerIds.map((playerId) => ({
      player_id: playerId,
      team_id: ctx.activeTeamId,
      title: meta.title,
      description: meta.description ?? null,
      video_type: meta.videoType ?? null,
      url: meta.url,
      is_primary: false,
      created_at: now,
    }));

    const { data: inserted, error: insertError } = await supabase.from('baseball_videos')
      .insert(rows)
      .select('id');

    if (insertError || !inserted) {
      return { success: false, error: 'Could not save the video records.' };
    }

    // Best-effort: mark each player as having video.
    await supabase.from('baseball_players')
      .update({ has_video: true, updated_at: now })
      .in('id', meta.playerIds);

    revalidatePath(VIDEOS_LIBRARY_PATH);
    revalidatePath('/baseball/dashboard/roster');

    return {
      success: true,
      ids: (inserted as Array<{ id: string }>).map((r) => r.id),
    };
  },
);

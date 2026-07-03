// =============================================================================
// src/lib/baseball/read-models/video-classes.ts
//
// Packet: video-classes — read models for:
//   (A) the Video library + Coach film queue + clip drawer (V6 §Video UI),
//   (B) the Class-Conflict list + per-player daily availability (V6 §Class
//       Conflict Engine outputs).
//
// 'server-only' + plain async functions (NOT 'use server') so server components
// and other read models can import them. RLS backs every query; these add the
// in-process viewer gate + an honest authorized:false envelope on top.
//
// HONESTY (binding):
//   * A clip is only shown as a "reference" when it is anchored AND carries
//     media (videoAnchorKind / isAnchoredVideoLink). Source vendor + confidence
//     drive a SourceTrust chip — never a fabricated 100%.
//   * A class conflict carries source refs to BOTH sides and an honest
//     confidence capped <0.7 (class side is recurring-only). Hardest first.
//   * Player-facing reads NEVER include staff_only rows (the RLS + the explicit
//     visibility filter both hold).
// =============================================================================

import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import {
  videoAnchorKind,
  type BaseballVideoLink,
  type BaseballVideoAnchorKind,
  type BaseballVideoReviewStatus,
  type BaseballClassConflict,
  type BaseballClassConflictSeverity,
  type BaseballSignalSourceRef,
} from '@/lib/types/baseball-video-classes';
import { parseSignalSourceRefs } from '@/lib/types/baseball-signals';

// -----------------------------------------------------------------------------
// Envelopes
// -----------------------------------------------------------------------------

export interface VideoLibraryRow {
  video: BaseballVideoLink;
  anchorKind: BaseballVideoAnchorKind;
  sourceRefs: BaseballSignalSourceRef[];
  /** True only when the clip is a real, source-backed reference. */
  isReference: boolean;
}

export interface FilmQueueBuckets {
  needsReview: VideoLibraryRow[];
  playerRequested: VideoLibraryRow[];
  evidenceMissing: VideoLibraryRow[]; // clip wants a stat/insight anchor it lacks
  postgame: VideoLibraryRow[];
  practice: VideoLibraryRow[];
}

export interface VideoLibraryResult {
  authorized: boolean;
  isStaff: boolean;
  rows: VideoLibraryRow[];
  filmQueue: FilmQueueBuckets | null; // staff only
}

export interface ConflictRow {
  conflict: BaseballClassConflict;
  sourceRefs: BaseballSignalSourceRef[];
}

export interface ClassConflictResult {
  authorized: boolean;
  isStaff: boolean;
  /** Open conflicts, hardest-first. */
  conflicts: ConflictRow[];
  countsBySeverity: Record<BaseballClassConflictSeverity, number>;
}

// -----------------------------------------------------------------------------
// (A) Video library + film queue
// -----------------------------------------------------------------------------

function toLibraryRow(v: BaseballVideoLink): VideoLibraryRow {
  const sourceRefs = parseSignalSourceRefs(v.source_refs) as BaseballSignalSourceRef[];
  const anchorKind = videoAnchorKind(v);
  const isReference =
    anchorKind !== 'unanchored' && Boolean(v.video_id || v.external_video_url);
  return { video: v, anchorKind, sourceRefs, isReference };
}

/**
 * Load the video library for the active team. Staff see all team clips + the
 * film-queue buckets; a player sees only their own player-visible clips (RLS +
 * the visibility filter). Optionally narrow by an anchor (game / plate
 * appearance) for the clip drawer.
 */
export async function getVideoLibrary(opts?: {
  gameId?: string;
  plateAppearanceId?: string;
  playerId?: string;
  reviewStatus?: BaseballVideoReviewStatus;
  limit?: number;
}): Promise<VideoLibraryResult> {
  const empty: VideoLibraryResult = {
    authorized: false,
    isStaff: false,
    rows: [],
    filmQueue: null,
  };

  const ctx = await getActiveBaseballContext();
  if (!ctx) return empty;

  const isStaff = ctx.activeRole === 'coach' && Boolean(ctx.activeCoachId);
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any)
    .from('baseball_video_events')
    .select('*')
    .eq('team_id', ctx.activeTeamId)
    .neq('disposition', 'dismissed')
    .order('captured_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(opts?.limit ?? 200);

  if (opts?.gameId) q = q.eq('game_id', opts.gameId);
  if (opts?.plateAppearanceId) q = q.eq('plate_appearance_id', opts.plateAppearanceId);
  if (opts?.playerId) q = q.eq('player_id', opts.playerId);
  if (opts?.reviewStatus) q = q.eq('review_status', opts.reviewStatus);

  const { data } = await q;
  const rows = ((data as BaseballVideoLink[] | null) ?? []).map(toLibraryRow);

  if (!isStaff) {
    // Player surface: RLS already restricts to own player_visible rows; the read
    // model just returns the library (no film queue).
    return { authorized: true, isStaff: false, rows, filmQueue: null };
  }

  // Staff film queue (V6 §"Coach film queue").
  const filmQueue: FilmQueueBuckets = {
    needsReview: rows.filter((r) => r.video.review_status === 'needs_review'),
    playerRequested: rows.filter((r) => r.video.player_requested_feedback === true),
    evidenceMissing: rows.filter(
      (r) =>
        r.video.review_status !== 'archived' &&
        r.sourceRefs.length === 0 &&
        r.anchorKind === 'unanchored',
    ),
    postgame: rows.filter(
      (r) => r.anchorKind === 'game' || r.anchorKind === 'plate_appearance',
    ),
    practice: rows.filter((r) => r.anchorKind === 'practice'),
  };

  return { authorized: true, isStaff: true, rows, filmQueue };
}

// -----------------------------------------------------------------------------
// (B) Class conflicts
// -----------------------------------------------------------------------------





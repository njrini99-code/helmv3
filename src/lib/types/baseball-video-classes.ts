// =============================================================================
// src/lib/types/baseball-video-classes.ts
//
// Hand-written TypeScript types for the video-classes packet:
//   supabase/migrations/20260624000221_baseball_video_links_and_class_conflicts.sql
//
// WHY THIS FILE EXISTS
//   The generated src/lib/types/database.ts is regenerated from the live DB and
//   does NOT reflect this freshly-written-but-not-yet-applied migration (we
//   cannot db:types regen — prod GolfHelm shares the DB). This file hand-mirrors
//   the EXACT column names/types the migration adds, so the video link layer +
//   the class-conflict engine read model + server actions compile today.
//
//   SQL -> TS:
//     text          -> string
//     numeric       -> number
//     integer       -> number
//     boolean       -> boolean
//     uuid          -> string
//     uuid[]        -> string[]
//     jsonb         -> BaseballJson
//     timestamptz   -> string (ISO timestamp)
//     time          -> string (HH:MM[:SS])
//     date          -> string (YYYY-MM-DD)
//     NOT NULL DFLT -> required in Row, optional in Insert
//     NULLable      -> `| null`
//
// OWNERSHIP: this file belongs to the video-classes packet. It does NOT edit
//   baseball-stat-events.ts (which owns the BASE BaseballVideoEvent type for the
//   columns the elite-stat model created) or baseball-signals.ts. It defines:
//     - the NEW video-event columns this migration adds (as an extension type),
//     - a combined BaseballVideoLink row the read model returns,
//     - the baseball_class_conflicts row/insert/update + enums + helpers.
//   The single re-export from src/lib/types/index.ts is wired by the
//   integration agent, not here.
// =============================================================================

import type { BaseballJson } from '@/lib/types/baseball-coachhelm';
import type {
  BaseballVideoEvent,
  BaseballEventVisibility,
} from '@/lib/types/baseball-stat-events';
import type { BaseballSignalSourceRef } from '@/lib/types/baseball-signals';

export type { BaseballJson, BaseballSignalSourceRef };

// =============================================================================
// VIDEO EVENT REFERENCES — V6 §Video Object (the columns 0220 ADDS to the
// existing baseball_video_events table)
// =============================================================================

/** Source vendor of a clip (V6: uploaded / phone / Synergy / AWRE / OnForm /
 * external URL). NO direct integration — this only records provenance. */
export type BaseballVideoSourceVendor =
  | 'uploaded'
  | 'phone'
  | 'synergy'
  | 'awre'
  | 'onform'
  | 'external_url'
  | 'manual';

/** Who owns a clip (V6: team / staff member / player). */
export type BaseballVideoOwnerKind = 'team' | 'staff' | 'player';

/** Film-queue review lifecycle (V6 §"Coach film queue"). */
export type BaseballVideoReviewStatus =
  | 'needs_review'
  | 'reviewed'
  | 'approved'
  | 'archived';

/** Automation lifecycle on a (possibly auto-requested) clip — every automation
 * output is dismissible/resolvable per the zip non-negotiables. */
export type BaseballVideoDisposition =
  | 'requested'
  | 'active'
  | 'dismissed'
  | 'resolved';

/**
 * The columns migration 0220 ADDS to baseball_video_events. These extend the
 * base {@link BaseballVideoEvent} (owned by baseball-stat-events.ts). We model
 * them separately so we never edit the other packet's type; the combined row is
 * {@link BaseballVideoLink}.
 */
export interface BaseballVideoEventLinkColumns {
  source_vendor: BaseballVideoSourceVendor | null;
  source_label: string | null;
  source_external_id: string | null;
  source_confidence: number | null;
  owner_kind: BaseballVideoOwnerKind | null;
  owner_coach_id: string | null;
  owner_player_id: string | null;
  /** Every tagged player (player_id stays the PRIMARY subject for RLS). */
  players_tagged: string[];
  clip_title: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  captured_at: string | null;
  transcript: string | null;
  annotation_author_id: string | null;
  /** jsonb — at the app layer a BaseballSignalSourceRef[]. */
  source_refs: BaseballJson;
  linked_dev_plan_item_id: string | null;
  linked_meeting_item_id: string | null;
  linked_signal_id: string | null;
  linked_action_id: string | null;
  review_status: BaseballVideoReviewStatus | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  player_requested_feedback: boolean | null;
  /** V6: "Mark clip as reviewed by player." */
  reviewed_by_player_at: string | null;
  disposition: BaseballVideoDisposition | null;
  created_by: string | null;
  updated_at: string | null;
}

/**
 * A full baseball_video_events row AFTER migration 0220: the base elite-stat
 * columns plus the V6 video-object extension columns. This is the row the video
 * read model + clip drawer use.
 */
export type BaseballVideoLink = BaseballVideoEvent & BaseballVideoEventLinkColumns;

/**
 * Insert shape for linking a clip to a game / at-bat (plate appearance) / event.
 * Only the fields a caller sets when CREATING a link; required minimum is
 * team_id + at least one anchor (game/practice/plate_appearance/pitch/swing) and
 * a source. The server action enforces "at least one anchor".
 */
export interface BaseballVideoLinkInsert {
  id?: string;
  team_id: string;
  player_id?: string | null;
  video_id?: string | null;
  external_video_url?: string | null;
  game_id?: string | null;
  practice_id?: string | null;
  plate_appearance_id?: string | null;
  pitch_event_id?: string | null;
  swing_event_id?: string | null;
  data_context?: string;
  clip_start_time?: number | null;
  clip_end_time?: number | null;
  tag_family?: string | null;
  tags?: BaseballJson | null;
  coach_annotation?: string | null;
  player_response?: string | null;
  linked_task_id?: string | null;
  linked_insight_id?: string | null;
  import_run_id?: string | null;
  source_id?: string | null;
  trust_tier?: string;
  visibility?: BaseballEventVisibility;
  // 0220 columns:
  source_vendor?: BaseballVideoSourceVendor | null;
  source_label?: string | null;
  source_external_id?: string | null;
  source_confidence?: number | null;
  owner_kind?: BaseballVideoOwnerKind | null;
  owner_coach_id?: string | null;
  owner_player_id?: string | null;
  players_tagged?: string[];
  clip_title?: string | null;
  thumbnail_url?: string | null;
  duration_seconds?: number | null;
  captured_at?: string | null;
  transcript?: string | null;
  annotation_author_id?: string | null;
  source_refs?: BaseballJson;
  linked_dev_plan_item_id?: string | null;
  linked_meeting_item_id?: string | null;
  linked_signal_id?: string | null;
  linked_action_id?: string | null;
  review_status?: BaseballVideoReviewStatus | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  player_requested_feedback?: boolean | null;
  reviewed_by_player_at?: string | null;
  disposition?: BaseballVideoDisposition | null;
  created_by?: string | null;
}

export type BaseballVideoLinkUpdate = Partial<
  Omit<BaseballVideoLinkInsert, 'team_id'>
>;

/** What a clip is anchored to — for the clip drawer header + library grouping. */
export type BaseballVideoAnchorKind =
  | 'game'
  | 'plate_appearance'
  | 'pitch'
  | 'swing'
  | 'practice'
  | 'unanchored';

/** Resolve the strongest anchor a clip carries (most-specific wins). */
export function videoAnchorKind(
  v: Pick<
    BaseballVideoLink,
    'plate_appearance_id' | 'pitch_event_id' | 'swing_event_id' | 'game_id' | 'practice_id'
  >,
): BaseballVideoAnchorKind {
  if (v.plate_appearance_id) return 'plate_appearance';
  if (v.pitch_event_id) return 'pitch';
  if (v.swing_event_id) return 'swing';
  if (v.game_id) return 'game';
  if (v.practice_id) return 'practice';
  return 'unanchored';
}

/** A clip is a valid source-backed reference only if it points at SOMETHING and
 * names where it came from (zip: "NO AI without source refs" — and a bare clip
 * with no anchor/source is not a reference). */
export function isAnchoredVideoLink(
  v: Pick<
    BaseballVideoLinkInsert,
    | 'plate_appearance_id'
    | 'pitch_event_id'
    | 'swing_event_id'
    | 'game_id'
    | 'practice_id'
    | 'video_id'
    | 'external_video_url'
  >,
): boolean {
  const hasAnchor = Boolean(
    v.plate_appearance_id ||
      v.pitch_event_id ||
      v.swing_event_id ||
      v.game_id ||
      v.practice_id,
  );
  const hasMedia = Boolean(v.video_id || v.external_video_url);
  return hasAnchor && hasMedia;
}

// =============================================================================
// CLASS CONFLICTS — V6 §Class Conflict Engine
// =============================================================================

/** Severity ladder (V6 §Severity), recalibrated for baseball ops. */
export type BaseballClassConflictSeverity =
  | 'hard' // class overlaps a mandatory event/lift/practice/game/travel departure
  | 'soft' // back-to-back location/travel proximity issue
  | 'watch' // high credit load + travel + low compliance
  | 'informational'; // player unavailable for an OPTIONAL station

/** What team obligation the class collides with. */
export type BaseballConflictObligationKind =
  | 'event'
  | 'game'
  | 'practice'
  | 'lift'
  | 'travel'
  | 'study_hall';

/** Triage lifecycle of a conflict. */
export type BaseballClassConflictDisposition =
  | 'open'
  | 'acknowledged'
  | 'resolved'
  | 'dismissed'
  | 'expired';

/** Visibility ladder (mirrors signals/timeline — strictest wins). */
export type BaseballClassConflictVisibility = 'team' | 'player_only' | 'staff_only';

/** Recommended ops-action type a conflict can convert into. */
export type BaseballConflictActionType =
  | 'player_task'
  | 'meeting_item'
  | 'message'
  | 'player_note'
  | 'practice_block'
  | 'none';

export interface BaseballClassConflict {
  id: string;
  team_id: string;
  player_id: string;
  class_id: string | null;
  class_name: string | null;
  class_day: string | null;
  class_start: string | null;
  class_end: string | null;
  obligation_kind: BaseballConflictObligationKind;
  event_id: string | null;
  game_id: string | null;
  practice_id: string | null;
  obligation_label: string | null;
  obligation_start: string | null;
  obligation_end: string | null;
  is_mandatory: boolean | null;
  severity: BaseballClassConflictSeverity;
  overlap_minutes: number | null;
  confidence: number | null;
  why_it_matters: string | null;
  /** jsonb — at the app layer a BaseballSignalSourceRef[] (BOTH sides cited). */
  source_refs: BaseballJson;
  recommended_action_label: string | null;
  recommended_action_type: BaseballConflictActionType | null;
  signal_id: string | null;
  visibility: BaseballClassConflictVisibility;
  disposition: BaseballClassConflictDisposition;
  dedupe_key: string | null;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BaseballClassConflictInsert {
  id?: string;
  team_id: string;
  player_id: string;
  class_id?: string | null;
  class_name?: string | null;
  class_day?: string | null;
  class_start?: string | null;
  class_end?: string | null;
  obligation_kind?: BaseballConflictObligationKind;
  event_id?: string | null;
  game_id?: string | null;
  practice_id?: string | null;
  obligation_label?: string | null;
  obligation_start?: string | null;
  obligation_end?: string | null;
  is_mandatory?: boolean | null;
  severity?: BaseballClassConflictSeverity;
  overlap_minutes?: number | null;
  confidence?: number | null;
  why_it_matters?: string | null;
  source_refs?: BaseballJson;
  recommended_action_label?: string | null;
  recommended_action_type?: BaseballConflictActionType | null;
  signal_id?: string | null;
  visibility?: BaseballClassConflictVisibility;
  disposition?: BaseballClassConflictDisposition;
  dedupe_key?: string | null;
  acknowledged_by?: string | null;
  acknowledged_at?: string | null;
  resolved_at?: string | null;
  expires_at?: string | null;
  created_by?: string | null;
}

export type BaseballClassConflictUpdate = Partial<
  Omit<BaseballClassConflictInsert, 'team_id' | 'player_id'>
>;

/** Dispositions that count as "open" (still on the conflict board). */
export const OPEN_CONFLICT_DISPOSITIONS: readonly BaseballClassConflictDisposition[] =
  ['open', 'acknowledged'] as const;

/** Severity rank for sorting (hard first). */
export const CONFLICT_SEVERITY_RANK: Record<BaseballClassConflictSeverity, number> = {
  hard: 0,
  soft: 1,
  watch: 2,
  informational: 3,
};

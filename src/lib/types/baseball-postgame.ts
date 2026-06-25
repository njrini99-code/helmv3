// =============================================================================
// src/lib/types/baseball-postgame.ts
//
// Hand-written TypeScript types for the Postgame Action Review tables added by:
//   supabase/migrations/20260624000093_baseball_postgame_reviews.sql
//
// WHY THIS FILE EXISTS (same reason as baseball-coachhelm.ts):
//   The generated src/lib/types/database.ts is regenerated from the live DB and
//   does NOT reflect this freshly-written-but-not-yet-applied migration (we
//   cannot db:types regen — prod GolfHelm shares the DB, and an agent never
//   applies migrations). This file hand-mirrors the EXACT column names/types the
//   migration adds, so the postgame builder / action / read paths compile today.
//
//   Column names/types here match the SQL byte-for-byte:
//     SQL text        -> string (constrained unions where a CHECK exists)
//     SQL numeric     -> number
//     SQL boolean     -> boolean
//     SQL jsonb       -> typed array/object
//     SQL timestamptz -> string (ISO timestamp)
//     NOT NULL DEFAULT-> required in Row, optional in Insert
//     NULLable        -> `| null`
//
// OWNERSHIP: this file is part of the postgame-review packet's ownership set.
// The single re-export wiring into src/lib/types/index.ts is left to the
// integration agent (we do NOT edit index.ts here).
//
// Baseball-only. No golf labels. Reuses the canonical BaseballInsightSourceRef
// shape so postgame source citations and engine-insight source citations agree.
// =============================================================================

import type { BaseballInsightSourceRef } from '@/lib/types/baseball-coachhelm';

// -----------------------------------------------------------------------------
// Enums (mirror the SQL CHECK constraints exactly)
// -----------------------------------------------------------------------------

/** How the box-score data feeding a review arrived. */
export type PostgameSourceStatus =
  | 'official'
  | 'partial'
  | 'imported'
  | 'manual'
  | 'missing';

/** AI output visibility ladder (shared with the V2 AI Source Contract). */
export type PostgameVisibility = 'staff_only' | 'player_visible' | 'restricted';

/** Lifecycle disposition of the parent review. */
export type PostgameReviewDisposition = 'new' | 'reviewed' | 'dismissed' | 'resolved';

/**
 * The kind of action a review item proposes — maps 1:1 to the V10 Postgame
 * Action Review sections (player-timeline update, staff decision item, practice
 * focus candidate, workload update, video-evidence prompt).
 */
export type PostgameItemKind =
  | 'timeline_update'
  | 'staff_decision'
  | 'practice_focus'
  | 'workload_update'
  | 'video_evidence';

/** Recommended-action type (V2 AI output shape). */
export type PostgameActionType =
  | 'task'
  | 'note'
  | 'practice_adjustment'
  | 'meeting_topic'
  | 'none';

/** Item-level priority (shared severity ladder). */
export type PostgamePriority = 'low' | 'medium' | 'high' | 'urgent';

/** Lifecycle disposition of a single item. */
export type PostgameItemDisposition =
  | 'new'
  | 'converted_to_task'
  | 'converted_to_timeline'
  | 'dismissed'
  | 'resolved';

// -----------------------------------------------------------------------------
// baseball_postgame_reviews
// -----------------------------------------------------------------------------

export interface BaseballPostgameReviewRow {
  id: string;
  team_id: string;
  game_id: string | null;
  coach_id: string | null;

  source_status: PostgameSourceStatus;
  batting_lines_n: number;
  pitching_lines_n: number;
  import_warnings: string[];

  title: string;
  summary: string | null;
  confidence: number | null;
  visibility: PostgameVisibility;
  disposition: PostgameReviewDisposition;
  generated_by_model: string | null;
  generated_at: string;
  expires_at: string | null;

  created_at: string;
  updated_at: string | null;
}

export interface BaseballPostgameReviewInsert {
  team_id: string;
  game_id?: string | null;
  coach_id?: string | null;

  source_status?: PostgameSourceStatus;
  batting_lines_n?: number;
  pitching_lines_n?: number;
  import_warnings?: string[];

  title: string;
  summary?: string | null;
  confidence?: number | null;
  visibility?: PostgameVisibility;
  disposition?: PostgameReviewDisposition;
  generated_by_model?: string | null;
  generated_at?: string;
  expires_at?: string | null;
}

// -----------------------------------------------------------------------------
// baseball_postgame_review_items
// -----------------------------------------------------------------------------

export interface BaseballPostgameReviewItemRow {
  id: string;
  team_id: string;
  review_id: string;
  player_id: string | null;

  item_kind: PostgameItemKind;
  signal_source: string | null;

  title: string;
  detail: string | null;

  action_label: string | null;
  action_type: PostgameActionType;
  owner_role: string | null;

  priority: PostgamePriority;
  confidence: number | null;
  visibility: PostgameVisibility;
  player_visible: boolean;

  source_refs: BaseballInsightSourceRef[];
  timeline_event_id: string | null;

  disposition: PostgameItemDisposition;
  dedupe_key: string;

  created_at: string;
  updated_at: string | null;
}

export interface BaseballPostgameReviewItemInsert {
  team_id: string;
  review_id: string;
  player_id?: string | null;

  item_kind: PostgameItemKind;
  signal_source?: string | null;

  title: string;
  detail?: string | null;

  action_label?: string | null;
  action_type?: PostgameActionType;
  owner_role?: string | null;

  priority?: PostgamePriority;
  confidence?: number | null;
  visibility?: PostgameVisibility;
  player_visible?: boolean;

  source_refs?: BaseballInsightSourceRef[];
  timeline_event_id?: string | null;

  disposition?: PostgameItemDisposition;
  dedupe_key: string;
}

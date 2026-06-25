// =============================================================================
// src/lib/types/baseball-passport.ts
//
// Hand-written TS types for the two additive tables introduced by migration
// 20260624000220_baseball_player_passport_and_daily_contract.sql.
//
// We hand-write these (rather than db:types regen) because the generated
// database.ts lags the migration on the shared prod DB — the same established
// pattern the rest of the baseball layer uses (see timeline-writer.ts).
//
// OWNED BY the Player Passport + Daily Contract packet. Pure types module — no
// 'use client', no I/O. Baseball-only; no golf labels.
// =============================================================================

// -----------------------------------------------------------------------------
// Passport settings
// -----------------------------------------------------------------------------

/**
 * The exposure state of a player's Passport on a given team. Mirrors the SQL
 * CHECK on baseball_player_passport_settings.visibility_state.
 *
 *   staff_only     -> internal roster-evaluation passport (default)
 *   player_visible -> the player may view their own assembled passport
 *   public_profile -> public/recruiting exposure passport is enabled
 *   scout_packet   -> additionally exportable to a scout packet
 */
export type PassportVisibilityState =
  | 'staff_only'
  | 'player_visible'
  | 'public_profile'
  | 'scout_packet';

/**
 * Per-passport-field visibility level (overrides the section default). Mirrors
 * the V2 data-visibility rules. Never WIDENS a staff-private underlying record.
 */
export type PassportFieldVisibility =
  | 'staff_only'
  | 'player_visible'
  | 'public'
  | 'scout';

/** A jsonb map of { passport_field_key: PassportFieldVisibility }. */
export type PassportFieldVisibilityMap = Record<string, PassportFieldVisibility>;

export interface BaseballPlayerPassportSettingsRow {
  id: string;
  player_id: string;
  team_id: string;
  visibility_state: PassportVisibilityState;
  field_visibility: PassportFieldVisibilityMap;
  headline: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BaseballPlayerPassportSettingsInsert {
  id?: string;
  player_id: string;
  team_id: string;
  visibility_state?: PassportVisibilityState;
  field_visibility?: PassportFieldVisibilityMap;
  headline?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

// -----------------------------------------------------------------------------
// Daily contract
// -----------------------------------------------------------------------------

/** Lifecycle of a daily contract. Mirrors the SQL CHECK on status. */
export type DailyContractStatus = 'draft' | 'committed' | 'completed' | 'missed';

/** Who can see a given day's contract. Mirrors the SQL CHECK on visibility. */
export type DailyContractVisibility = 'player_only' | 'team' | 'staff_only';

/**
 * A single intention inside a daily contract. The per-item done/skipped state
 * keeps a partial day honest: a missed item is NEVER rendered as done.
 */
export interface DailyContractItem {
  /** Stable id (client-generated uuid-ish string) so toggles are addressable. */
  id: string;
  label: string;
  /** Free-text bucket, e.g. 'hitting' | 'arm_care' | 'academics' | 'recovery'. */
  category: string;
  done: boolean;
  skipped: boolean;
}

export interface BaseballPlayerDailyContractRow {
  id: string;
  player_id: string;
  team_id: string;
  /** ISO date (YYYY-MM-DD). */
  contract_date: string;
  status: DailyContractStatus;
  items: DailyContractItem[];
  reflection: string | null;
  committed_at: string | null;
  completed_at: string | null;
  /**
   * When a committed day rolled over to 'missed' without completion. Set by the
   * daily app-layer roll-over sweep. Null unless status = 'missed'.
   */
  missed_at: string | null;
  visibility: DailyContractVisibility;
  /** When a team coach acknowledged this SHARED day. Null = not acked. */
  coach_acknowledged_at: string | null;
  /** auth.users id of the coach who acknowledged this shared day. */
  coach_acknowledged_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BaseballPlayerDailyContractInsert {
  id?: string;
  player_id: string;
  team_id: string;
  contract_date?: string;
  status?: DailyContractStatus;
  items?: DailyContractItem[];
  reflection?: string | null;
  committed_at?: string | null;
  completed_at?: string | null;
  visibility?: DailyContractVisibility;
  created_at?: string;
  updated_at?: string;
}

// -----------------------------------------------------------------------------
// Scout Packet share tokens
//
// Hand-written types for migration
// 20260624000420_baseball_passport_scout_packet_share_tokens.sql. A scout-packet
// share token is the OUTBOUND export capability: staff with can_export_reports
// mint a single-purpose, revocable token for one (player, team) exposed
// passport, and a public route trades it (server-side) for a viewerRole=other
// web packet. The token never grants table access to anon.
// -----------------------------------------------------------------------------

/** Lifecycle of a share token. Mirrors the SQL CHECK on status. */
export type PassportShareTokenStatus = 'active' | 'revoked';

/** Packet kind a token points at. Mirrors the SQL CHECK on packet_kind. */
export type PassportShareTokenKind = 'scout' | 'transfer';

export interface BaseballPassportShareTokenRow {
  id: string;
  player_id: string;
  team_id: string;
  token: string;
  recipient_label: string | null;
  packet_kind: PassportShareTokenKind;
  status: PassportShareTokenStatus;
  expires_at: string | null;
  view_count: number;
  last_viewed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BaseballPassportShareTokenInsert {
  id?: string;
  player_id: string;
  team_id: string;
  token: string;
  recipient_label?: string | null;
  packet_kind?: PassportShareTokenKind;
  status?: PassportShareTokenStatus;
  expires_at?: string | null;
  created_by?: string | null;
}

/**
 * A share link as surfaced to staff (the minting/management view). `url` is the
 * fully-qualified public packet URL; `isLive` folds status + expiry into one
 * honest "can a scout open this right now?" boolean.
 */
export interface PassportShareLinkView {
  id: string;
  recipientLabel: string | null;
  packetKind: PassportShareTokenKind;
  status: PassportShareTokenStatus;
  url: string;
  token: string;
  expiresAt: string | null;
  isLive: boolean;
  viewCount: number;
  lastViewedAt: string | null;
  createdAt: string;
}

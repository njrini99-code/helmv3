// =============================================================================
// src/lib/baseball/stat-import-adapters.ts
//
// Packet: elite-stats (BaseballHelm — stats-integrations)
//
// SOURCE-SPECIFIC IMPORT ADAPTER **CONTRACTS** + the source registry/settings
// for the elite stat event model. This file defines the adapter INTERFACE every
// vendor parser must implement and the static registry describing each known
// source — it is CONTRACTS + SETTINGS ONLY. There is NO direct vendor sync, NO
// OAuth, NO background polling, NO scraping here (V6 vendor matrix §"Do not
// build now", V8 §"Provider Adapter Registry"). Adapters convert an uploaded
// file (CSV / XLSX / XML / PDF text) into the canonical import-row shape; the
// actual file fetching/sync is explicitly a disabled, future capability.
//
// GROUNDING (spec lines implemented):
//   * v6_vendor_integration_matrix.md §"Vendor Adapter Interface" — the 9-method
//     adapter contract (detect/parse/normalize/mapFields/validate/matchPlayers/
//     previewCommit/commit/rollback) + the per-adapter outputs.
//   * v6_vendor_integration_matrix.md (all vendor sections) — GameChanger XML/CSV,
//     StatCrew/Presto/SIDEARM/StatBroadcast/NCAA XML, TrackMan, Rapsodo,
//     Yakkertech/HitTrax/PocketRadar, Blast, Diamond Kinetics, Synergy, 6-4-3,
//     AWRE, OnForm, TeamBuildr, ArmCare, Teamworks, Google Sheets, PDF, manual.
//   * v8_autosync_feature_plan.md §"Provider Adapter Registry" + §"Confidence-
//     Based Auto-Commit" — the per-adapter detect/validate output + confidence
//     bands; the autosync RECEIVE METHODS modeled as settings, all sync OFF.
//   * v6_stats_data_model_and_import_contract.md §"Source Trust and Metric
//     Authority" + §"baseball_stat_sources" — trust tier + category + review.
//
// This module is PURE (no DB, no 'use server', no DOM). It is the contract the
// import-center server actions + the fan-out parser implementations build on.
// Existing import-matching.ts (player matching) is reused, not duplicated.
// =============================================================================

import type {
  BaseballSourceKey,
  BaseballSourceCategory,
  BaseballTrustTier,
  BaseballDataContext,
  BaseballEventVisibility,
} from '@/lib/types/baseball-stat-events';

// -----------------------------------------------------------------------------
// Canonical import grain (V6 import contract §baseball_import_rows.target_grain)
// -----------------------------------------------------------------------------

/** Which structured table a normalized row commits into. */
export type BaseballImportTargetGrain =
  | 'player_game'
  | 'player_season'
  | 'plate_appearance'
  | 'pitch'
  | 'swing'
  | 'batted_ball'
  | 'fielding'
  | 'catching'
  | 'baserunning'
  | 'workload'
  | 'lift_set'
  | 'readiness'
  | 'class_meeting'
  | 'video_clip'
  | 'stat_fact'
  | 'roster'
  | 'task';

/** The import "type" a run declares (V6 baseball_import_runs.import_type). */
export type BaseballImportType =
  | 'roster'
  | 'official_box_score'
  | 'official_season_stats'
  | 'play_by_play'
  | 'pitch_level'
  | 'hitting_tracking'
  | 'pitching_tracking'
  | 'swing_sensor'
  | 'fielding'
  | 'catching'
  | 'baserunning'
  | 'strength'
  | 'wellness'
  | 'workload'
  | 'classes'
  | 'video_index'
  | 'scouting'
  | 'generic';

/** File container the adapter accepts. */
export type BaseballImportFileFormat = 'csv' | 'xlsx' | 'xml' | 'pdf' | 'json' | 'text';

/** How a file reaches BaseballHelm (V8 ingest gateway). ALL sync OFF in Phase 1. */
export type BaseballReceiveMethod =
  | 'manual_upload' // the only ENABLED method in Phase 1
  | 'email_inbox' // team-slug@sync.baseballhelm.com — future, flag off
  | 'sftp_drop' // future, flag off
  | 'https_push' // future, flag off
  | 'local_agent' // desktop watcher — future, flag off
  | 'feed_watcher'; // official website watcher — future, flag off

// -----------------------------------------------------------------------------
// Adapter I/O shapes (the contract — no implementations live here)
// -----------------------------------------------------------------------------

export interface DetectionResult {
  /** best-guess source for this file. */
  sourceKey: BaseballSourceKey;
  /** 0..1 — how confident detection is. */
  confidence: number;
  detectedFormat: BaseballImportFileFormat;
  suggestedImportType: BaseballImportType;
  detectedHeaders?: string[];
  /** ranked alternates so the wizard can offer a manual override. */
  alternates?: Array<{ sourceKey: BaseballSourceKey; confidence: number }>;
  notes?: string[];
}

/** A single raw, untransformed row as the parser read it from the file. */
export interface ParsedRow {
  rowNumber: number;
  raw: Record<string, string | number | null>;
}

export interface ParsedRows {
  format: BaseballImportFileFormat;
  headers: string[];
  rows: ParsedRow[];
  /** preserved file body for audit/raw_text_snapshot (XML/PDF especially). */
  rawTextSnapshot?: string;
  parseWarnings?: string[];
}

/** A normalized row keyed to a canonical grain + the canonical fields it fills. */
export interface CanonicalImportRow {
  rowNumber: number;
  targetGrain: BaseballImportTargetGrain;
  /** canonical field -> value, already unit-normalized. */
  fields: Record<string, string | number | boolean | null>;
  /** raw external player handle preserved for matching + provenance. */
  externalPlayerKey?: string;
  externalPlayerDisplayName?: string;
  externalEventId?: string;
  dataContext: BaseballDataContext;
}

export interface FieldMapping {
  csvHeader: string;
  canonicalField: string;
  transformRule?: string;
  unit?: string;
  isRequired: boolean;
  /** 0..1 — how confident the auto-map is (1.0 = saved/confirmed mapping). */
  confidence: number;
}

export interface ValidationIssue {
  rowNumber: number;
  field?: string;
  code: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationReport {
  validRowCount: number;
  errorRowCount: number;
  warningCount: number;
  issues: ValidationIssue[];
}

export interface MatchReport {
  matchedRowCount: number;
  unmatchedRowCount: number;
  /** rows needing human resolution (below the configured confidence threshold). */
  needsReviewRowNumbers: number[];
}

/** A dry-run plan: exactly what commit() would write (V10 Import Diff Viewer). */
export interface CommitPlan {
  creates: number;
  updates: number;
  skippedDuplicates: number;
  /** per-grain breakdown so the diff viewer can group changes. */
  byGrain: Partial<Record<BaseballImportTargetGrain, { creates: number; updates: number }>>;
  warnings: string[];
}

export interface CommitResult {
  importRunId: string;
  committedRowCount: number;
  createdObjectRefs: Array<{ table: string; id: string }>;
  warnings: string[];
}

export interface RollbackResult {
  importRunId: string;
  reversedRowCount: number;
  restoredSupersededCount: number;
  staleInsightIds: string[];
}

/** Context passed into validate/match/commit (roster + saved mappings + ext ids). */
export interface AdapterRunContext {
  teamId: string;
  sourceId: string;
  trustTier: BaseballTrustTier;
  defaultVisibility: BaseballEventVisibility;
  /** the confidence below which official stats are NEVER auto-committed. */
  minCommitConfidence: number;
}

/** Adapter-level metadata every adapter advertises (V6 §"Each adapter should output"). */
export interface AdapterDescriptor {
  sourceKey: BaseballSourceKey;
  category: BaseballSourceCategory;
  supportedFormats: BaseballImportFileFormat[];
  supportedImportTypes: BaseballImportType[];
  primaryGrains: BaseballImportTargetGrain[];
  /** default data context rows from this source land in. */
  defaultDataContext: BaseballDataContext;
  /** ceiling trust this source can ever claim (sensors can't be 'official'). */
  trustCeiling: BaseballTrustTier;
}

/**
 * The vendor adapter CONTRACT. Each concrete adapter (built by the fan-out
 * parser tasks) implements these 9 methods. Detection/parse/normalize/validate
 * are pure; matchPlayers/previewCommit/commit/rollback take a run context and
 * may be async (they touch staged rows / the DB through the server-action layer,
 * never directly from the client and never via direct vendor sync).
 */
export interface VendorAdapter {
  readonly descriptor: AdapterDescriptor;
  detect(input: { fileName: string; headers?: string[]; sample?: string }): DetectionResult;
  parse(input: { format: BaseballImportFileFormat; body: string }): ParsedRows;
  normalize(row: ParsedRow, mapping: FieldMapping[]): CanonicalImportRow;
  mapFields(headers: string[], savedMapping?: FieldMapping[]): FieldMapping[];
  validate(rows: CanonicalImportRow[], ctx: AdapterRunContext): ValidationReport;
  matchPlayers(
    rows: CanonicalImportRow[],
    ctx: AdapterRunContext,
  ): Promise<MatchReport> | MatchReport;
  previewCommit(rows: CanonicalImportRow[], ctx: AdapterRunContext): Promise<CommitPlan> | CommitPlan;
  commit(plan: CommitPlan, ctx: AdapterRunContext): Promise<CommitResult>;
  rollback(importRunId: string, ctx: AdapterRunContext): Promise<RollbackResult>;
}

// -----------------------------------------------------------------------------
// Confidence-based auto-commit bands (V8 §"Confidence-Based Auto-Commit")
// -----------------------------------------------------------------------------

export type AutoCommitDecision =
  | 'auto_commit_silent' // 0.98..1.00
  | 'auto_commit_warn' // 0.95..0.98
  | 'hold_for_review' // 0.85..0.95
  | 'do_not_commit'; // < 0.85

export function decideAutoCommit(confidence: number): AutoCommitDecision {
  if (confidence >= 0.98) return 'auto_commit_silent';
  if (confidence >= 0.95) return 'auto_commit_warn';
  if (confidence >= 0.85) return 'hold_for_review';
  return 'do_not_commit';
}

// -----------------------------------------------------------------------------
// SOURCE REGISTRY / SETTINGS — the descriptor for every known source.
// CONTRACTS + SETTINGS ONLY. `directSyncEnabled` is ALWAYS false in Phase 1
// (no OAuth/sync/scrape); `receiveMethods` lists the future ingest methods but
// only `manual_upload` is enabled. This is the seed that populates
// baseball_stat_sources rows + drives the Integration Settings UI.
// -----------------------------------------------------------------------------

export interface SourceRegistryEntry extends AdapterDescriptor {
  label: string;
  description: string;
  /** distinctive headers/markers used by detect() to recognize this source. */
  signatureMarkers: string[];
  /** default trust tier a NEW configured source of this kind gets. */
  defaultTrustTier: BaseballTrustTier;
  /** whether rows require coach review before powering CoachHelm by default. */
  requiresReviewByDefault: boolean;
  /** AI may use this source's data only when explicitly enabled (default off). */
  aiCanUseByDefault: boolean;
  /** future ingest methods; only manual_upload is wired in Phase 1. */
  receiveMethods: BaseballReceiveMethod[];
  /** HARD GUARANTEE: no direct vendor sync ships in Phase 1. Always false. */
  directSyncEnabled: false;
  /** typical expected cadence in days for the Source Coverage Board (null = ad-hoc). */
  expectedCadenceDays: number | null;
}

const C = {
  manualOnly: ['manual_upload'] as BaseballReceiveMethod[],
  official: ['manual_upload', 'email_inbox', 'sftp_drop', 'https_push', 'local_agent', 'feed_watcher'] as BaseballReceiveMethod[],
};

export const BASEBALL_SOURCE_REGISTRY: readonly SourceRegistryEntry[] = [
  // ----- Manual -----
  {
    sourceKey: 'manual',
    label: 'Manual entry',
    description: 'Staff-entered game/scrimmage lines and corrections. Source = the staff author, with edit history and reason.',
    category: 'operations',
    supportedFormats: ['json'],
    supportedImportTypes: ['official_box_score', 'generic'],
    primaryGrains: ['player_game', 'stat_fact'],
    signatureMarkers: [],
    defaultDataContext: 'manual',
    trustCeiling: 'coach_reviewed',
    defaultTrustTier: 'coach_reviewed',
    requiresReviewByDefault: false,
    aiCanUseByDefault: true,
    receiveMethods: C.manualOnly,
    directSyncEnabled: false,
    expectedCadenceDays: null,
  },

  // ----- Official game XML/CSV (high-trust, autosync-eligible later) -----
  {
    sourceKey: 'gamechanger_xml',
    label: 'GameChanger (college XML/CSV)',
    description: 'GameChanger college XML/CSV box score + play-by-play export. Official when provided by staff/SID.',
    category: 'official_game',
    supportedFormats: ['xml', 'csv'],
    supportedImportTypes: ['official_box_score', 'official_season_stats', 'play_by_play', 'roster'],
    primaryGrains: ['player_game', 'plate_appearance', 'pitch', 'roster'],
    signatureMarkers: ['gamechanger', 'gc_game', 'baseballgame'],
    defaultDataContext: 'official_game',
    trustCeiling: 'official',
    defaultTrustTier: 'official',
    requiresReviewByDefault: false,
    aiCanUseByDefault: true,
    receiveMethods: C.official,
    directSyncEnabled: false,
    expectedCadenceDays: 3,
  },
  {
    sourceKey: 'statcrew_xml',
    label: 'StatCrew XML',
    description: 'StatCrew legacy game/season XML. Official source for backfill + migration; supports re-import diff for scoring corrections.',
    category: 'official_game',
    supportedFormats: ['xml'],
    supportedImportTypes: ['official_box_score', 'official_season_stats', 'play_by_play'],
    primaryGrains: ['player_game', 'plate_appearance', 'pitch'],
    signatureMarkers: ['bsgame', 'statcrew', 'venue', 'vh'],
    defaultDataContext: 'official_game',
    trustCeiling: 'official',
    defaultTrustTier: 'official',
    requiresReviewByDefault: false,
    aiCanUseByDefault: true,
    receiveMethods: C.official,
    directSyncEnabled: false,
    expectedCadenceDays: 3,
  },
  {
    sourceKey: 'ncaa_live_stats',
    label: 'NCAA Live Stats XML',
    description: 'NCAA live-stats game XML. Treat as official when staff-provided; 2026 market instability makes flexible import essential.',
    category: 'official_game',
    supportedFormats: ['xml'],
    supportedImportTypes: ['official_box_score', 'play_by_play'],
    primaryGrains: ['player_game', 'plate_appearance', 'pitch'],
    signatureMarkers: ['ncaa', 'livestats', 'gamestate'],
    defaultDataContext: 'official_game',
    trustCeiling: 'official',
    defaultTrustTier: 'official',
    requiresReviewByDefault: true,
    aiCanUseByDefault: true,
    receiveMethods: C.official,
    directSyncEnabled: false,
    expectedCadenceDays: 3,
  },
  {
    sourceKey: 'prestosports_xml',
    label: 'PrestoSports XML',
    description: 'PrestoSports roster/game/season/zipped box-score XML, the format the SID website workflow emits. No direct API sync.',
    category: 'official_game',
    supportedFormats: ['xml', 'csv'],
    supportedImportTypes: ['official_box_score', 'official_season_stats', 'play_by_play', 'roster'],
    primaryGrains: ['player_game', 'player_season', 'plate_appearance', 'pitch', 'roster'],
    signatureMarkers: ['presto', 'prestosports', 'sport-baseball'],
    defaultDataContext: 'official_game',
    trustCeiling: 'official',
    defaultTrustTier: 'official',
    requiresReviewByDefault: false,
    aiCanUseByDefault: true,
    receiveMethods: C.official,
    directSyncEnabled: false,
    expectedCadenceDays: 3,
  },
  {
    sourceKey: 'sidearm_xml',
    label: 'SIDEARM XML/CSV',
    description: 'SIDEARM website XML/CSV export (duplicate game-file destination or approved file). No direct API sync promised.',
    category: 'official_game',
    supportedFormats: ['xml', 'csv'],
    supportedImportTypes: ['official_box_score', 'official_season_stats', 'roster'],
    primaryGrains: ['player_game', 'player_season', 'roster'],
    signatureMarkers: ['sidearm', 'sidearmsports'],
    defaultDataContext: 'official_game',
    trustCeiling: 'official',
    defaultTrustTier: 'official',
    requiresReviewByDefault: true,
    aiCanUseByDefault: true,
    receiveMethods: C.official,
    directSyncEnabled: false,
    expectedCadenceDays: 3,
  },
  {
    sourceKey: 'statbroadcast_xml',
    label: 'StatBroadcast XML',
    description: 'StatBroadcast game XML via duplicate destination / approved file watcher. Official when staff-provided.',
    category: 'official_game',
    supportedFormats: ['xml'],
    supportedImportTypes: ['official_box_score', 'play_by_play'],
    primaryGrains: ['player_game', 'plate_appearance', 'pitch'],
    signatureMarkers: ['statbroadcast'],
    defaultDataContext: 'official_game',
    trustCeiling: 'official',
    defaultTrustTier: 'official',
    requiresReviewByDefault: true,
    aiCanUseByDefault: true,
    receiveMethods: C.official,
    directSyncEnabled: false,
    expectedCadenceDays: 3,
  },

  // ----- Tracking / development sources (verified-vendor, never official) -----
  {
    sourceKey: 'trackman_csv',
    label: 'TrackMan CSV',
    description: 'TrackMan pitch + hit CSV (velo, spin, release, movement, plate location, exit speed, launch, distance). Enriches, never overrides official scoring.',
    category: 'tracking',
    supportedFormats: ['csv'],
    supportedImportTypes: ['pitch_level', 'hitting_tracking', 'pitching_tracking'],
    primaryGrains: ['pitch', 'batted_ball'],
    signatureMarkers: ['relspeed', 'spinrate', 'inducedvertbreak', 'horzbreak', 'exitspeed', 'plateloc'],
    defaultDataContext: 'sensor',
    trustCeiling: 'verified_vendor',
    defaultTrustTier: 'verified_vendor',
    requiresReviewByDefault: false,
    aiCanUseByDefault: false,
    receiveMethods: C.manualOnly,
    directSyncEnabled: false,
    expectedCadenceDays: 7,
  },
  {
    sourceKey: 'rapsodo_csv',
    label: 'Rapsodo CSV',
    description: 'Rapsodo hitting/pitching CSV (exit speed, spin profile, seam orientation, strike-zone). Player-development source.',
    category: 'tracking',
    supportedFormats: ['csv'],
    supportedImportTypes: ['hitting_tracking', 'pitching_tracking'],
    primaryGrains: ['pitch', 'batted_ball'],
    signatureMarkers: ['rapsodo', 'exit velocity', 'spin', 'true spin'],
    defaultDataContext: 'sensor',
    trustCeiling: 'verified_vendor',
    defaultTrustTier: 'verified_vendor',
    requiresReviewByDefault: false,
    aiCanUseByDefault: false,
    receiveMethods: C.manualOnly,
    directSyncEnabled: false,
    expectedCadenceDays: 7,
  },
  {
    sourceKey: 'yakkertech_csv',
    label: 'Yakkertech CSV',
    description: 'Yakkertech tracking CSV via the generic tracking profile (pitch velo, exit velo, launch, distance, spray, pitch type, location).',
    category: 'tracking',
    supportedFormats: ['csv'],
    supportedImportTypes: ['pitch_level', 'hitting_tracking', 'pitching_tracking'],
    primaryGrains: ['pitch', 'batted_ball'],
    signatureMarkers: ['yakker', 'yakkertech'],
    defaultDataContext: 'sensor',
    trustCeiling: 'verified_vendor',
    defaultTrustTier: 'verified_vendor',
    requiresReviewByDefault: true,
    aiCanUseByDefault: false,
    receiveMethods: C.manualOnly,
    directSyncEnabled: false,
    expectedCadenceDays: 7,
  },
  {
    sourceKey: 'hittrax_csv',
    label: 'HitTrax CSV',
    description: 'HitTrax cage/live exit-velocity + spray CSV via the generic tracking profile.',
    category: 'tracking',
    supportedFormats: ['csv'],
    supportedImportTypes: ['hitting_tracking'],
    primaryGrains: ['batted_ball'],
    signatureMarkers: ['hittrax', 'velo', 'dist', 'la'],
    defaultDataContext: 'cage',
    trustCeiling: 'verified_vendor',
    defaultTrustTier: 'verified_vendor',
    requiresReviewByDefault: true,
    aiCanUseByDefault: false,
    receiveMethods: C.manualOnly,
    directSyncEnabled: false,
    expectedCadenceDays: 7,
  },
  {
    sourceKey: 'pocket_radar_csv',
    label: 'Pocket Radar CSV',
    description: 'Pocket Radar velocity readings via the generic tracking profile (pitch/throw/exit velo).',
    category: 'tracking',
    supportedFormats: ['csv'],
    supportedImportTypes: ['pitching_tracking', 'hitting_tracking'],
    primaryGrains: ['stat_fact'],
    signatureMarkers: ['pocket radar', 'mph', 'reading'],
    defaultDataContext: 'practice',
    trustCeiling: 'verified_vendor',
    defaultTrustTier: 'player_submitted',
    requiresReviewByDefault: true,
    aiCanUseByDefault: false,
    receiveMethods: C.manualOnly,
    directSyncEnabled: false,
    expectedCadenceDays: null,
  },
  {
    sourceKey: 'blast_csv',
    label: 'Blast Motion CSV',
    description: 'Blast swing-sensor CSV (plane, connection, rotation, attack angle, bat speed, on-plane efficiency). Developmental — never official.',
    category: 'player_development',
    supportedFormats: ['csv'],
    supportedImportTypes: ['swing_sensor'],
    primaryGrains: ['swing'],
    signatureMarkers: ['blast', 'bat speed', 'attack angle', 'on plane', 'connection'],
    defaultDataContext: 'sensor',
    trustCeiling: 'verified_vendor',
    defaultTrustTier: 'verified_vendor',
    requiresReviewByDefault: false,
    aiCanUseByDefault: false,
    receiveMethods: C.manualOnly,
    directSyncEnabled: false,
    expectedCadenceDays: 7,
  },
  {
    sourceKey: 'diamond_kinetics_csv',
    label: 'Diamond Kinetics CSV',
    description: 'Diamond Kinetics bat-sensor CSV (max barrel speed, acceleration, impact momentum, attack angle, contact point). Developmental.',
    category: 'player_development',
    supportedFormats: ['csv'],
    supportedImportTypes: ['swing_sensor'],
    primaryGrains: ['swing'],
    signatureMarkers: ['diamond kinetics', 'barrel speed', 'impact momentum', 'max acceleration'],
    defaultDataContext: 'sensor',
    trustCeiling: 'verified_vendor',
    defaultTrustTier: 'verified_vendor',
    requiresReviewByDefault: false,
    aiCanUseByDefault: false,
    receiveMethods: C.manualOnly,
    directSyncEnabled: false,
    expectedCadenceDays: 7,
  },

  // ----- Video / scouting sources (reference metadata only, no copied video) -----
  {
    sourceKey: 'synergy_export',
    label: 'Synergy Baseball',
    description: 'Synergy export/report + clip links stored as video/stat references. No protected video copied; CoachHelm cites clips when staff has access.',
    category: 'video',
    supportedFormats: ['csv', 'xlsx', 'text'],
    supportedImportTypes: ['video_index', 'scouting', 'play_by_play'],
    primaryGrains: ['video_clip', 'stat_fact', 'plate_appearance'],
    signatureMarkers: ['synergy', 'clip', 'playlist'],
    defaultDataContext: 'video',
    trustCeiling: 'coach_reviewed',
    defaultTrustTier: 'coach_reviewed',
    requiresReviewByDefault: true,
    aiCanUseByDefault: false,
    receiveMethods: C.manualOnly,
    directSyncEnabled: false,
    expectedCadenceDays: null,
  },
  {
    sourceKey: 'six_four_three_export',
    label: '6-4-3 Charts',
    description: '6-4-3 export / Synergy / TrackMan Sync / AWRE reports imported as trusted coaching analytics (not blindly official). Preserves PBP tags + external video refs.',
    category: 'video',
    supportedFormats: ['csv', 'xlsx', 'text'],
    supportedImportTypes: ['play_by_play', 'pitch_level', 'video_index', 'scouting'],
    primaryGrains: ['pitch', 'batted_ball', 'video_clip', 'plate_appearance'],
    signatureMarkers: ['6-4-3', '643', 'six four three'],
    defaultDataContext: 'video',
    trustCeiling: 'coach_reviewed',
    defaultTrustTier: 'coach_reviewed',
    requiresReviewByDefault: true,
    aiCanUseByDefault: false,
    receiveMethods: C.manualOnly,
    directSyncEnabled: false,
    expectedCadenceDays: null,
  },
  {
    sourceKey: 'awre_video',
    label: 'AWRE Video',
    description: 'AWRE video with clip references; links to TrackMan/6-4-3 pitch rows when external ids/timestamps align, else coach-tagged.',
    category: 'video',
    supportedFormats: ['csv', 'text'],
    supportedImportTypes: ['video_index'],
    primaryGrains: ['video_clip'],
    signatureMarkers: ['awre'],
    defaultDataContext: 'video',
    trustCeiling: 'coach_reviewed',
    defaultTrustTier: 'coach_reviewed',
    requiresReviewByDefault: true,
    aiCanUseByDefault: false,
    receiveMethods: C.manualOnly,
    directSyncEnabled: false,
    expectedCadenceDays: null,
  },
  {
    sourceKey: 'onform_export',
    label: 'OnForm',
    description: 'OnForm shared clip links + coach annotations + player responses. An annotated clip can become a task, dev-plan item, or CoachHelm evidence object.',
    category: 'video',
    supportedFormats: ['csv', 'text'],
    supportedImportTypes: ['video_index'],
    primaryGrains: ['video_clip'],
    signatureMarkers: ['onform'],
    defaultDataContext: 'video',
    trustCeiling: 'coach_reviewed',
    defaultTrustTier: 'coach_reviewed',
    requiresReviewByDefault: true,
    aiCanUseByDefault: false,
    receiveMethods: C.manualOnly,
    directSyncEnabled: false,
    expectedCadenceDays: null,
  },

  // ----- Strength / readiness / operations -----
  {
    sourceKey: 'armcare_csv',
    label: 'ArmCare CSV',
    description: 'ArmCare arm strength/fatigue/recovery + individualized throw constraints CSV. Feeds pitcher workload + readiness flags.',
    category: 'strength',
    supportedFormats: ['csv'],
    supportedImportTypes: ['wellness', 'workload', 'strength'],
    primaryGrains: ['readiness', 'workload', 'stat_fact'],
    signatureMarkers: ['armcare', 'arm score', 'shoulder', 'recovery'],
    defaultDataContext: 'readiness',
    trustCeiling: 'verified_vendor',
    defaultTrustTier: 'verified_vendor',
    requiresReviewByDefault: false,
    aiCanUseByDefault: false,
    receiveMethods: C.manualOnly,
    directSyncEnabled: false,
    expectedCadenceDays: 3,
  },
  {
    sourceKey: 'teambuildr_csv',
    label: 'TeamBuildr CSV',
    description: 'TeamBuildr lift assignments/results + wellness/readiness CSV. Phase 1 import only (no full S&C replacement).',
    category: 'strength',
    supportedFormats: ['csv', 'xlsx'],
    supportedImportTypes: ['strength', 'wellness'],
    primaryGrains: ['lift_set', 'readiness'],
    signatureMarkers: ['teambuildr', 'exercise', 'load', 'sets', 'reps', 'rpe'],
    defaultDataContext: 'lift',
    trustCeiling: 'verified_vendor',
    defaultTrustTier: 'verified_vendor',
    requiresReviewByDefault: false,
    aiCanUseByDefault: false,
    receiveMethods: C.manualOnly,
    directSyncEnabled: false,
    expectedCadenceDays: 1,
  },
  {
    sourceKey: 'teamworks_csv',
    label: 'Teamworks CSV',
    description: 'Teamworks roster/classes/calendar/travel CSV. Imports schedules + roster; BaseballHelm wins on baseball-specific action, not department-wide replacement.',
    category: 'operations',
    supportedFormats: ['csv', 'xlsx'],
    supportedImportTypes: ['roster', 'classes', 'generic'],
    primaryGrains: ['roster', 'class_meeting', 'task'],
    signatureMarkers: ['teamworks', 'class', 'schedule', 'period'],
    defaultDataContext: 'manual',
    trustCeiling: 'coach_reviewed',
    defaultTrustTier: 'coach_reviewed',
    requiresReviewByDefault: true,
    aiCanUseByDefault: false,
    receiveMethods: C.manualOnly,
    directSyncEnabled: false,
    expectedCadenceDays: 7,
  },

  // ----- Generic -----
  {
    sourceKey: 'google_sheets',
    label: 'Google Sheets (CSV/XLSX)',
    description: 'Spreadsheet upload with a saved mapping profile. Ideal for HS/showcase programs tracking measurables/practice stats/rosters.',
    category: 'operations',
    supportedFormats: ['csv', 'xlsx'],
    supportedImportTypes: ['generic', 'roster', 'hitting_tracking', 'pitching_tracking'],
    primaryGrains: ['stat_fact', 'roster', 'player_game'],
    signatureMarkers: ['sheet', 'tab'],
    defaultDataContext: 'manual',
    trustCeiling: 'coach_reviewed',
    defaultTrustTier: 'unverified',
    requiresReviewByDefault: true,
    aiCanUseByDefault: false,
    receiveMethods: C.manualOnly,
    directSyncEnabled: false,
    expectedCadenceDays: null,
  },
  {
    sourceKey: 'generic_csv',
    label: 'Generic CSV',
    description: 'Any CSV with a player-name column + stat columns, mapped via the field-mapping wizard. Catch-all, always available.',
    category: 'operations',
    supportedFormats: ['csv'],
    supportedImportTypes: ['generic', 'official_box_score', 'roster'],
    primaryGrains: ['stat_fact', 'player_game', 'roster'],
    signatureMarkers: ['player', 'name'],
    defaultDataContext: 'manual',
    trustCeiling: 'coach_reviewed',
    defaultTrustTier: 'unverified',
    requiresReviewByDefault: true,
    aiCanUseByDefault: false,
    receiveMethods: C.manualOnly,
    directSyncEnabled: false,
    expectedCadenceDays: null,
  },
  {
    sourceKey: 'generic_xlsx',
    label: 'Generic XLSX',
    description: 'Any single-sheet workbook with a player-name column + stat columns, mapped via the field-mapping wizard.',
    category: 'operations',
    supportedFormats: ['xlsx'],
    supportedImportTypes: ['generic', 'official_box_score', 'roster'],
    primaryGrains: ['stat_fact', 'player_game', 'roster'],
    signatureMarkers: ['player', 'name'],
    defaultDataContext: 'manual',
    trustCeiling: 'coach_reviewed',
    defaultTrustTier: 'unverified',
    requiresReviewByDefault: true,
    aiCanUseByDefault: false,
    receiveMethods: C.manualOnly,
    directSyncEnabled: false,
    expectedCadenceDays: null,
  },
  {
    sourceKey: 'pdf_extract',
    label: 'PDF box score',
    description: 'PDF attachment: extract text if a parser exists, else preserve as a source document for manual row mapping. Never silently commit low-confidence extraction to official stats.',
    category: 'official_game',
    supportedFormats: ['pdf', 'text'],
    supportedImportTypes: ['official_box_score', 'official_season_stats', 'generic'],
    primaryGrains: ['player_game', 'stat_fact'],
    signatureMarkers: ['%pdf'],
    defaultDataContext: 'official_game',
    trustCeiling: 'coach_reviewed',
    defaultTrustTier: 'unverified',
    requiresReviewByDefault: true,
    aiCanUseByDefault: false,
    receiveMethods: C.manualOnly,
    directSyncEnabled: false,
    expectedCadenceDays: null,
  },
] as const;

/** Look up a registry entry by source key. */
export function getSourceRegistryEntry(
  sourceKey: BaseballSourceKey,
): SourceRegistryEntry | undefined {
  return BASEBALL_SOURCE_REGISTRY.find((s) => s.sourceKey === sourceKey);
}

/** All source keys whose data may NEVER be marked official (sensors/dev/video/generic). */
export function isOfficialEligible(sourceKey: BaseballSourceKey): boolean {
  const entry = getSourceRegistryEntry(sourceKey);
  return entry?.trustCeiling === 'official';
}

/**
 * Clamp a requested trust tier to the source's ceiling — the one place metric
 * authority is enforced (V6 §"Source Trust and Metric Authority"). A TrackMan
 * row can never be stamped 'official'; a swing-sensor row can never be 'official'.
 */
const TRUST_ORDER: BaseballTrustTier[] = [
  'official',
  'verified_vendor',
  'coach_reviewed',
  'player_submitted',
  'unverified',
  'inferred',
];

export function clampTrustToCeiling(
  requested: BaseballTrustTier,
  sourceKey: BaseballSourceKey,
): BaseballTrustTier {
  const entry = getSourceRegistryEntry(sourceKey);
  if (!entry) return requested === 'official' ? 'coach_reviewed' : requested;
  const ceilingIdx = TRUST_ORDER.indexOf(entry.trustCeiling);
  const requestedIdx = TRUST_ORDER.indexOf(requested);
  // higher in the list = more trusted; clamp UP toward (never above) the ceiling.
  return requestedIdx < ceilingIdx ? entry.trustCeiling : requested;
}

/**
 * HARD INVARIANT for the whole module: no source ships with direct sync enabled
 * in Phase 1. Exposed so a test/CI guard can assert it.
 */
export function assertNoDirectSync(): true {
  for (const s of BASEBALL_SOURCE_REGISTRY) {
    // `directSyncEnabled` is typed `false`; this also guards data drift.
    if ((s as { directSyncEnabled: boolean }).directSyncEnabled) {
      throw new Error(`Source ${s.sourceKey} must not enable direct sync in Phase 1`);
    }
  }
  return true;
}

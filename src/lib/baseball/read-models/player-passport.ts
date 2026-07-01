// =============================================================================
// src/lib/baseball/read-models/player-passport.ts
//
// V5 Player Passport read model — the portable, source-backed development/
// identity snapshot.
//
// Spec: docs/.../19_breakthrough_product_systems_v5/
//        v5_player_passport_and_recruiting_showcase_system.md
//   "Recruiting platforms have profiles. BaseballHelm should have proof."
//
// PROOF, not a profile. Every surfaced value carries:
//   - WHERE it came from (SourceRef / SourceTrust)
//   - whether it is verified (explicit; absence is NOT verified)
//   - whether it is an active capture vs logged intent
//   - its visibility level
// and the model never fabricates a measurable it does not have.
//
// This read model READS existing tables only (baseball_players for identity +
// measurables, baseball_player_stats for recent activity counts,
// baseball_player_timeline_events via the development story). It stores no new
// per-field data of its own beyond the passport SETTINGS row
// (baseball_player_passport_settings) that controls exposure.
//
// VIEWER-AWARE: resolves the asking viewer (staff vs the subject player vs other)
// server-side and filters fields by both the V2 data-visibility rules AND the
// player/program's passport visibility overrides. A staff-private underlying
// record is NEVER widened by a passport override.
//
// 'server-only' + plain async functions (NOT 'use server'). RLS backs every
// query; this layer is defense-in-depth on top of RLS, never a substitute.
// =============================================================================

import 'server-only';

import { createClient } from '@/lib/supabase/server';
import {
  buildSourceRef,
  normalizeConfidence,
  type SourceRef,
  type CaptureMode,
} from '@/lib/baseball/source-record';
import { buildSourceTrust } from '@/components/baseball/source-trust/build-source-trust';
import {
  buildStampedSourceTrust,
  buildImportProvenance,
  type StampedStatProvenance,
} from '@/components/baseball/source-trust/stamped-trust';
import { getPlayerTimeline } from '@/lib/baseball/read-models/timeline';
import { getVideoLibrary } from '@/lib/baseball/read-models/video-classes';
import type {
  SourceTrust,
  SourceProvenance,
  TrustLevel,
} from '@/components/baseball/source-trust/source-trust-types';
import type {
  PassportVisibilityState,
  PassportFieldVisibility,
  PassportFieldVisibilityMap,
} from '@/lib/types/baseball-passport';
import {
  PASSPORT_FIELD_BASE,
  PASSPORT_VISIBILITY_RANK,
} from '@/lib/baseball/passport-fields';

// -----------------------------------------------------------------------------
// Public shapes
// -----------------------------------------------------------------------------

/** Who is asking — resolved server-side, never client-supplied. */
export type PassportViewerRole = 'staff' | 'self' | 'other' | 'none';

/**
 * Assembly depth. 'compact' = identity + measurables + completeness only (the
 * Today embed); 'full' = additionally Development Story, Media, and Baseball
 * Performance (the dedicated passport surface). The completeness engine ALWAYS
 * reasons about every section so the meter is honest in both modes — only the
 * heavy section payloads are skipped in compact.
 */
export type PassportMode = 'compact' | 'full';

/** A passport section the completeness engine reasons about. */
export type PassportSectionKey =
  | 'identity'
  | 'positions'
  | 'measurables'
  | 'stats'
  | 'story'
  | 'media'
  | 'academic'
  | 'exposure';

/**
 * One measurable on the passport. Carries the raw value + unit + a render-ready
 * SourceTrust so the badge can show provenance/verification honestly. A
 * measurable we do NOT have is simply omitted — never shown as 0 or "—" with a
 * fake source.
 */
export interface PassportMeasurable {
  key: string;
  label: string;
  value: number;
  unit: string;
  trust: SourceTrust;
  /**
   * Event/date this measurable was captured (V5 "Each measurable: …event/date").
   * Null when the value is a self-reported profile number with no event anchor —
   * shown honestly, never fabricated.
   */
  eventDate: string | null;
  /** Field visibility resolved for THIS viewer. */
  visibility: PassportFieldVisibility;
}

/** A single identity attribute (name, positions, bats/throws, etc). */
export interface PassportIdentityField {
  key: string;
  label: string;
  value: string;
  visibility: PassportFieldVisibility;
}

// -----------------------------------------------------------------------------
// FULL-passport section shapes (V5 §"Passport Sections")
//
// The compact embed (Today) carries only Identity + Measurables + completeness.
// The FULL passport additionally assembles Development Story, Media, and
// Baseball Performance. These are only populated when getPlayerPassport is asked
// for mode:'full' — the compact path never pays for the extra reads.
// -----------------------------------------------------------------------------

/** A single development-story moment (sourced from the player timeline). */
export interface PassportStoryEvent {
  id: string;
  eventType: string;
  title: string;
  body: string | null;
  occurredAt: string;
  /** Render-ready provenance so each moment shows source + confidence honestly. */
  trust: SourceTrust;
}

/** A media reference on the passport (V5 Media — video links + clips). */
export interface PassportMediaItem {
  id: string;
  title: string;
  /** Outbound URL (external clip) — null when the clip is an internal asset id. */
  url: string | null;
  thumbnailUrl: string | null;
  capturedAt: string | null;
  durationSeconds: number | null;
  /** True only when the clip is an actual, source-backed reference (not a stub). */
  isReference: boolean;
  trust: SourceTrust;
}

/** One per-game line on the passport (V5 Baseball Performance — game logs). */
export interface PassportGameLogRow {
  gameId: string;
  gameDate: string | null;
  opponent: string | null;
  /** 'game' (official) vs 'scrimmage' — never conflated. */
  gameType: 'game' | 'scrimmage';
  /** Whichever side(s) the player produced a line on for that game. */
  batting: {
    ab: number;
    h: number;
    hr: number;
    rbi: number;
    bb: number;
    k: number;
  } | null;
  pitching: {
    ip: number;
    h: number;
    er: number;
    k: number;
    bb: number;
  } | null;
}

/** Season-summary counting/rate lines (official only) for the passport. */
export interface PassportSeasonSummary {
  seasonYear: number;
  batting: {
    g: number;
    ab: number;
    h: number;
    hr: number;
    rbi: number;
    bb: number;
    k: number;
    avg: number | null;
    obp: number | null;
    slg: number | null;
    ops: number | null;
  } | null;
  pitching: {
    g: number;
    ip: number;
    er: number;
    k: number;
    bb: number;
    era: number | null;
    whip: number | null;
  } | null;
  /** True when the player has zero captured box-score lines (honest empty). */
  noData: boolean;
}

/** V5 Baseball Performance section. */
export interface PassportPerformance {
  /** Source label for the section ("Team box scores"). */
  source: SourceRef;
  seasonSummary: PassportSeasonSummary;
  /** Newest-first per-game logs (official + scrimmage, labeled). */
  gameLogs: PassportGameLogRow[];
}

/** Per-section completeness signal (V5 "Profile Completeness Engine"). */
export interface PassportCompletenessSignal {
  section: PassportSectionKey;
  label: string;
  complete: boolean;
  /** Honest, actionable note when incomplete (e.g. "No verified 60-yard time"). */
  note: string;
}

export interface PassportReadModel {
  playerId: string | null;
  teamId: string;
  /** Resolved viewer role; drives which fields are returned. */
  viewerRole: PassportViewerRole;
  /** Exposure state of this passport (settings row; default staff_only). */
  visibilityState: PassportVisibilityState;
  /** Optional player/program headline. */
  headline: string | null;
  /** Which assembly mode produced this model. 'full' populates the deep sections. */
  mode: PassportMode;
  identity: PassportIdentityField[];
  measurables: PassportMeasurable[];
  /** Counts only — full stat detail lives on the profile, not the passport. */
  recentActivity: {
    capturedSessions: number;
    lastSessionDate: string | null;
    /** Source label for the most recent session, for an honest "from" line. */
    lastSessionSource: SourceRef | null;
    /**
     * GAP 3 — render-ready trust + provenance for the most-recent session built
     * from its import-stamped columns, so the passport's "from" line can carry the
     * same SourceTrustBadge + drawer (coach side). Null when the latest session
     * was hand-entered (no stamped provenance).
     */
    lastSessionTrust: SourceTrust | null;
    lastSessionProvenance: SourceProvenance | null;
  };
  /**
   * V5 Development Story (timeline). Populated only in mode:'full'. Viewer-
   * filtered: a player never receives staff_only moments. Null when not loaded.
   */
  developmentStory: {
    events: PassportStoryEvent[];
    /** Moments withheld from THIS viewer (honesty surface). */
    hiddenCount: number;
  } | null;
  /**
   * V5 Media (video links). Populated only in mode:'full'. RLS + the video read
   * model both gate this to clips the viewer may see. Null when not loaded.
   */
  media: {
    items: PassportMediaItem[];
  } | null;
  /**
   * V5 Baseball Performance (game logs + season summary). Populated only in
   * mode:'full'. Derived from per-game box scores the viewer can read. Null when
   * not loaded.
   */
  performance: PassportPerformance | null;
  completeness: {
    /** 0–100 integer. Derived from section signals, not invented. */
    percent: number;
    signals: PassportCompletenessSignal[];
  };
  /** True when at least one field was withheld from this viewer. */
  withheldFieldCount: number;
  /** False when the current user may not view this passport at all. */
  authorized: boolean;
  error: string | null;
}

// -----------------------------------------------------------------------------
// Options
// -----------------------------------------------------------------------------

export interface PassportOptions {
  /**
   * The player whose passport to assemble. When omitted, resolves to the current
   * user's own player id (the self passport). A non-staff viewer may only ever
   * read their OWN passport unless the target passport is exposed.
   */
  playerId?: string;
  /**
   * Assembly depth (default 'compact'). 'full' additionally loads the
   * Development Story, Media, and Baseball Performance sections. Always pass
   * 'full' for the dedicated passport surface; leave default for the Today embed.
   */
  mode?: PassportMode;
}

// -----------------------------------------------------------------------------
// Viewer resolution
// -----------------------------------------------------------------------------

interface ResolvedViewer {
  userId: string | null;
  myPlayerId: string | null;
  isStaff: boolean;
}

async function resolveViewer(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamId: string,
): Promise<ResolvedViewer> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { userId: null, myPlayerId: null, isStaff: false };

  // Resolve my player + coach PROFILE ids (either may be null). The staff link
  // is keyed on baseball_coaches.id (coach_id), NOT auth.users.id — matching the
  // active-context resolution pattern.
  const [meRes, coachRes] = await Promise.all([
    supabase.from('baseball_players').select('id').eq('user_id', user.id).maybeSingle(),
    supabase.from('baseball_coaches').select('id').eq('user_id', user.id).maybeSingle(),
  ]);

  const myCoachId = coachRes.data?.id ?? null;
  let isStaff = false;
  if (myCoachId) {
    const { data: staffRow } = await supabase
      .from('baseball_team_coach_staff')
      .select('id')
      .eq('team_id', teamId)
      .eq('coach_id', myCoachId)
      .maybeSingle();
    isStaff = !!staffRow;
  }

  return {
    userId: user.id,
    myPlayerId: meRes.data?.id ?? null,
    isStaff,
  };
}

// -----------------------------------------------------------------------------
// Visibility resolution
// -----------------------------------------------------------------------------

/**
 * Resolve the effective visibility of a field for a given viewer. Staff see
 * everything. The subject player sees player_visible+ fields. An "other" viewer
 * only sees fields the passport has exposed (public/scout) AND only when the
 * passport's overall visibility_state allows external exposure.
 *
 * IMPORTANT honesty rule: an override can only NARROW, never widen a base that is
 * staff_only. The shared catalog (passport-fields.ts) is the single source of
 * truth for the base map — the WRITE action enforces the same floor on the way
 * in (clampOverrideToBase), so a widened staff_only base can never even be
 * persisted. This resolver applies the floor again defensively: a legacy/forged
 * override row that widens a staff_only base is clamped back to the base here.
 */
function resolveFieldVisibility(
  fieldKey: string,
  overrides: PassportFieldVisibilityMap,
): PassportFieldVisibility {
  const base: PassportFieldVisibility = PASSPORT_FIELD_BASE[fieldKey] ?? 'player_visible';
  const override = overrides[fieldKey];
  if (!override) return base;
  // Defense in depth: a staff_only base is a hard floor even if a stored override
  // somehow tries to widen it.
  if (base === 'staff_only' && VISIBILITY_RANK[override] > VISIBILITY_RANK[base]) {
    return base;
  }
  return override;
}

const VISIBILITY_RANK = PASSPORT_VISIBILITY_RANK;

/** Can a viewer see a field at the resolved visibility? */
function viewerCanSee(
  viewerRole: PassportViewerRole,
  fieldVisibility: PassportFieldVisibility,
  exposureEnabled: boolean,
): boolean {
  if (viewerRole === 'staff') return true; // staff see all passport fields
  if (viewerRole === 'self') return VISIBILITY_RANK[fieldVisibility] >= 1; // player_visible+
  if (viewerRole === 'other') {
    // External viewer: only exposed fields, only when the passport is exposed.
    return exposureEnabled && VISIBILITY_RANK[fieldVisibility] >= 2;
  }
  return false;
}

// -----------------------------------------------------------------------------
// Measurable definitions (read from baseball_players)
// -----------------------------------------------------------------------------

interface MeasurableDef {
  key: string;
  column: keyof PlayerMeasurableColumns;
  label: string;
  unit: string;
}

interface PlayerMeasurableColumns {
  sixty_time: number | null;
  exit_velo: number | null;
  pitch_velo: number | null;
  pop_time: number | null;
  arm_strength: number | null;
}

const MEASURABLE_DEFS: MeasurableDef[] = [
  { key: 'sixty_time', column: 'sixty_time', label: '60-Yard', unit: 's' },
  { key: 'exit_velo', column: 'exit_velo', label: 'Exit Velocity', unit: 'mph' },
  { key: 'pitch_velo', column: 'pitch_velo', label: 'Pitching Velocity', unit: 'mph' },
  { key: 'pop_time', column: 'pop_time', label: 'Pop Time', unit: 's' },
  { key: 'arm_strength', column: 'arm_strength', label: 'Throwing Velocity', unit: 'mph' },
];

// -----------------------------------------------------------------------------
// getPassportSettingsForEditor
// -----------------------------------------------------------------------------

/** Current settings as the Visibility Controls editor needs them. */
export interface PassportEditorSettings {
  /** Resolved subject player id (self by default). Null when unresolved. */
  playerId: string | null;
  /** True when the current user may EDIT these settings (self or team staff). */
  canEdit: boolean;
  visibilityState: PassportVisibilityState;
  headline: string | null;
  /** Stored per-field overrides only (base defaults live in the shared catalog). */
  fieldVisibility: PassportFieldVisibilityMap;
  error: string | null;
}

/**
 * Read the current passport settings for the Visibility Controls editor. Honest
 * defaults (staff_only + {} + no headline) when no row exists yet, so the editor
 * opens on a real starting state rather than empty/broken. RLS backs the read;
 * `canEdit` mirrors the write gate (subject player OR team staff).
 *
 * @param playerId omit for the self path; staff may pass a roster player's id.
 */
export async function getPassportSettingsForEditor(
  teamId: string,
  playerId?: string,
): Promise<PassportEditorSettings> {
  const empty = (
    pid: string | null,
    canEdit: boolean,
    error: string | null,
  ): PassportEditorSettings => ({
    playerId: pid,
    canEdit,
    visibilityState: 'staff_only',
    headline: null,
    fieldVisibility: {},
    error,
  });

  if (!teamId) return empty(null, false, 'A team id is required.');

  const supabase = await createClient();
  const viewer = await resolveViewer(supabase, teamId);
  if (!viewer.userId) return empty(null, false, null);

  const targetPlayerId = playerId ?? viewer.myPlayerId;
  if (!targetPlayerId) return empty(null, false, null);

  // canEdit mirrors the action/RLS gate: subject player OR team staff.
  const isSelf = viewer.myPlayerId === targetPlayerId;
  const canEdit = isSelf || viewer.isStaff;
  if (!canEdit) return empty(targetPlayerId, false, null);

  const { data, error } = await supabase
    .from('baseball_player_passport_settings')
    .select('visibility_state, field_visibility, headline')
    .eq('player_id', targetPlayerId)
    .eq('team_id', teamId)
    .maybeSingle();

  if (error) {
    return empty(targetPlayerId, canEdit, 'Visibility settings could not be loaded.');
  }

  const row = (data ?? null) as {
    visibility_state: PassportVisibilityState;
    field_visibility: PassportFieldVisibilityMap;
    headline: string | null;
  } | null;

  return {
    playerId: targetPlayerId,
    canEdit,
    visibilityState: row?.visibility_state ?? 'staff_only',
    headline: row?.headline ?? null,
    fieldVisibility:
      row?.field_visibility && typeof row.field_visibility === 'object'
        ? row.field_visibility
        : {},
    error: null,
  };
}

// -----------------------------------------------------------------------------
// getPlayerPassport
// -----------------------------------------------------------------------------

/**
 * Assemble the source-backed Player Passport for `playerId` (default: the
 * current user) on `teamId`. Never throws — returns an honest envelope with
 * authorized:false / error when something is wrong. RLS gates every underlying
 * read; this layer additionally narrows fields per viewer + passport settings.
 */
export async function getPlayerPassport(
  teamId: string,
  options: PassportOptions = {},
): Promise<PassportReadModel> {
  const mode: PassportMode = options.mode ?? 'compact';

  const base = (
    playerId: string | null,
    viewerRole: PassportViewerRole,
    authorized: boolean,
    error: string | null,
  ): PassportReadModel => ({
    playerId,
    teamId,
    viewerRole,
    visibilityState: 'staff_only',
    headline: null,
    mode,
    identity: [],
    measurables: [],
    recentActivity: {
      capturedSessions: 0,
      lastSessionDate: null,
      lastSessionSource: null,
      lastSessionTrust: null,
      lastSessionProvenance: null,
    },
    developmentStory: null,
    media: null,
    performance: null,
    completeness: { percent: 0, signals: [] },
    withheldFieldCount: 0,
    authorized,
    error,
  });

  if (!teamId) return base(null, 'none', false, 'A team id is required.');

  const supabase = await createClient();
  const viewer = await resolveViewer(supabase, teamId);
  if (!viewer.userId) return base(null, 'none', false, null);

  const targetPlayerId = options.playerId ?? viewer.myPlayerId;
  if (!targetPlayerId) return base(null, 'none', false, null);

  const viewerRole: PassportViewerRole = viewer.isStaff
    ? 'staff'
    : viewer.myPlayerId === targetPlayerId
      ? 'self'
      : 'other';

  // ---- Load player identity + measurables, settings, recent activity ----
  const [playerRes, settingsRes, statsRes] = await Promise.all([
    supabase
      .from('baseball_players')
      .select(
        'id, first_name, last_name, primary_position, secondary_position, grad_year, bats, throws, height_feet, height_inches, weight_lbs, city, state, high_school_name, gpa, sixty_time, exit_velo, pitch_velo, pop_time, arm_strength',
      )
      .eq('id', targetPlayerId)
      .maybeSingle(),
    // Settings row controls exposure; RLS allows staff or the subject player.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('baseball_player_passport_settings')
      .select('visibility_state, field_visibility, headline')
      .eq('player_id', targetPlayerId)
      .eq('team_id', teamId)
      .maybeSingle(),
    // GAP 3 — pull the import-stamped provenance columns + run link so the most-
    // recent session's "from" line carries the same SourceTrust chip + drawer.
    // Stamped columns aren't in generated database.ts -> untyped client.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('baseball_player_stats')
      .select(
        'session_date, session_name, source, source_trust_level, source_match_tier, source_match_confidence, source_external_id, import_run_id',
      )
      .eq('player_id', targetPlayerId)
      .eq('team_id', teamId)
      .order('session_date', { ascending: false })
      .limit(50),
  ]);

  if (playerRes.error || !playerRes.data) {
    return base(targetPlayerId, viewerRole, false, 'This passport could not be loaded.');
  }
  const p = playerRes.data;

  // Settings (honest defaults when no row yet).
  const settings = (settingsRes?.data ?? null) as {
    visibility_state: PassportVisibilityState;
    field_visibility: PassportFieldVisibilityMap;
    headline: string | null;
  } | null;
  const visibilityState: PassportVisibilityState = settings?.visibility_state ?? 'staff_only';
  const overrides: PassportFieldVisibilityMap = settings?.field_visibility ?? {};
  const exposureEnabled =
    visibilityState === 'public_profile' || visibilityState === 'scout_packet';

  // An external viewer of a non-exposed passport is unauthorized to view it.
  if (viewerRole === 'other' && !exposureEnabled) {
    return base(targetPlayerId, 'other', false, null);
  }

  let withheld = 0;

  // ---- Identity fields ----
  const identityCandidates: PassportIdentityField[] = [];
  const pushIdentity = (key: string, label: string, value: string | null) => {
    if (value === null || value === '') return;
    const vis = resolveFieldVisibility(key, overrides);
    if (!viewerCanSee(viewerRole, vis, exposureEnabled)) {
      withheld += 1;
      return;
    }
    identityCandidates.push({ key, label, value, visibility: vis });
  };

  const fullName = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
  pushIdentity('name', 'Name', fullName || null);
  pushIdentity('grad_year', 'Class Year', p.grad_year ? String(p.grad_year) : null);
  const positions = [p.primary_position, p.secondary_position].filter(Boolean).join(' / ');
  pushIdentity('positions', 'Positions', positions || null);
  const batsThrows =
    p.bats || p.throws ? `B: ${p.bats ?? '—'} / T: ${p.throws ?? '—'}` : null;
  pushIdentity('bats_throws', 'Bats / Throws', batsThrows);
  const height =
    p.height_feet != null
      ? `${p.height_feet}'${p.height_inches ?? 0}"`
      : null;
  const heightWeight =
    height || p.weight_lbs != null
      ? [height, p.weight_lbs != null ? `${p.weight_lbs} lbs` : null]
          .filter(Boolean)
          .join(', ')
      : null;
  pushIdentity('height_weight', 'Height / Weight', heightWeight);
  const hometown = [p.city, p.state].filter(Boolean).join(', ');
  pushIdentity('hometown', 'Hometown', hometown || null);
  pushIdentity('high_school', 'High School', p.high_school_name);
  pushIdentity(
    'academic',
    'GPA',
    p.gpa != null ? p.gpa.toFixed(2) : null,
  );

  // ---- Measurables ----
  // Provenance honesty: these columns predate per-value source tracking, so
  // they are 'unknown' source + NOT verified. We never claim a measurable is
  // "verified" without an explicit verification record. This is the correct,
  // honest tier for box-score-only / self-reported combine numbers.
  const measurableSource: SourceRef = buildSourceRef({
    source: 'manual',
    label: 'Player profile',
  });
  const measurables: PassportMeasurable[] = [];
  for (const def of MEASURABLE_DEFS) {
    const raw = (p as unknown as PlayerMeasurableColumns)[def.column];
    if (raw === null || raw === undefined || !Number.isFinite(Number(raw))) continue;
    const vis = resolveFieldVisibility('measurable', overrides);
    if (!viewerCanSee(viewerRole, vis, exposureEnabled)) {
      withheld += 1;
      continue;
    }
    const trustLevel: TrustLevel = 'player_entered';
    const trust = buildSourceTrust({
      ref: measurableSource,
      confidence: null, // self-reported profile number — no confidence figure
      captureMode: 'active_capture' as CaptureMode,
      verified: false, // honesty: never auto-verified
      conflict: false,
      trustLevel,
    });
    measurables.push({
      key: def.key,
      label: def.label,
      value: Number(raw),
      unit: def.unit,
      trust,
      // These profile columns predate per-value event anchoring, so the event
      // date is honestly unknown — null renders as "no event on file", never a
      // fabricated date. Event-anchored measurables flow in via the elite stat
      // model later; the shape is ready for them.
      eventDate: null,
      visibility: vis,
    });
  }

  // ---- Recent activity (counts only) ----
  const statRows = (statsRes.error ? [] : statsRes.data ?? []) as unknown as Array<
    StampedStatProvenance & { session_date: string; session_name: string | null }
  >;
  const lastSession = statRows[0] ?? null;

  // GAP 3 — build the stamped trust + provenance for the most-recent session.
  let lastSessionTrust: SourceTrust | null = null;
  let lastSessionProvenance: SourceProvenance | null = null;
  if (lastSession && (lastSession.import_run_id || lastSession.source_trust_level)) {
    let reviewState: string | null = null;
    if (lastSession.import_run_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: run } = await (supabase as any)
        .from('baseball_import_runs')
        .select('review_state')
        .eq('id', lastSession.import_run_id)
        .maybeSingle();
      reviewState = (run as { review_state: string | null } | null)?.review_state ?? null;
    }
    const stamped: StampedStatProvenance = {
      source: lastSession.source,
      source_trust_level: lastSession.source_trust_level,
      source_match_tier: lastSession.source_match_tier,
      source_match_confidence: lastSession.source_match_confidence,
      source_external_id: lastSession.source_external_id,
      import_run_id: lastSession.import_run_id,
      review_state: reviewState,
      importedAt: lastSession.session_date,
    };
    const label = lastSession.session_name?.trim() || 'Imported stats';
    lastSessionTrust = buildStampedSourceTrust(stamped, label);
    lastSessionProvenance = buildImportProvenance(stamped, { label });
  }

  const recentActivity = {
    capturedSessions: statRows.length,
    lastSessionDate: lastSession?.session_date ?? null,
    lastSessionSource: lastSession
      ? buildSourceRef({ source: lastSession.source })
      : null,
    lastSessionTrust,
    lastSessionProvenance,
  };

  // ---------------------------------------------------------------------------
  // FULL sections (V5 §Passport Sections): Development Story, Media, Baseball
  // Performance. Only assembled in mode:'full'. Each is independently fault-
  // tolerant: a sub-read failure degrades to a null/empty section + an honest
  // sectionError, never a thrown passport. An "other" viewer never reaches here
  // for a non-exposed passport (we returned above), and the underlying reads
  // (timeline / video / box scores) are RLS- and visibility-gated, so the deep
  // sections inherit the same viewer safety as the rest of the passport.
  // ---------------------------------------------------------------------------
  let developmentStory: PassportReadModel['developmentStory'] = null;
  let media: PassportReadModel['media'] = null;
  let performance: PassportReadModel['performance'] = null;
  let sectionError: string | null = null;

  // Counts the completeness engine reasons about in BOTH modes (cheap-derivable
  // in compact via a single count read, full-derivable in full). Default 0.
  let storyEventCount = 0;
  let mediaItemCount = 0;
  let performanceGameCount = 0;

  if (mode === 'full') {
    const full = await assembleFullSections(supabase, {
      teamId,
      playerId: targetPlayerId,
      viewerRole,
    });
    developmentStory = full.developmentStory;
    media = full.media;
    performance = full.performance;
    sectionError = full.error;
    storyEventCount = full.developmentStory?.events.length ?? 0;
    mediaItemCount = full.media?.items.filter((m) => m.isReference).length ?? 0;
    performanceGameCount = full.performance?.gameLogs.length ?? 0;
  }

  // ---- Completeness engine (honest, section-based) ----
  const signals: PassportCompletenessSignal[] = [
    {
      section: 'identity',
      label: 'Identity',
      complete: !!fullName && !!p.grad_year,
      note: !fullName
        ? 'Add a full name.'
        : !p.grad_year
          ? 'Add a class/grad year.'
          : 'Complete.',
    },
    {
      section: 'positions',
      label: 'Positions',
      complete: !!p.primary_position,
      note: p.primary_position ? 'Complete.' : 'Add a primary position.',
    },
    {
      section: 'measurables',
      label: 'Verified measurables',
      // Honest: we mark this incomplete because none are VERIFIED yet, even when
      // self-reported numbers exist. Proof > presence.
      complete: false,
      note:
        measurables.length === 0
          ? 'No measurables on file.'
          : 'Measurables present but unverified — verification compounds trust.',
    },
    {
      section: 'stats',
      label: 'Captured stats',
      // In full mode we know the real game-log count; in compact we fall back to
      // the captured-session count. Either way this is a real signal, not a guess.
      complete: mode === 'full' ? performanceGameCount > 0 : statRows.length > 0,
      note:
        mode === 'full'
          ? performanceGameCount > 0
            ? `${performanceGameCount} game log${performanceGameCount === 1 ? '' : 's'} on file.`
            : 'No box-score game logs yet.'
          : statRows.length > 0
            ? 'Complete.'
            : 'No captured stat sessions yet.',
    },
    {
      section: 'story',
      label: 'Development story',
      // The timeline is the proof of operational history. In compact mode we
      // cannot assess it without the extra read, so we report it honestly as
      // "open the full passport" rather than mark it complete/incomplete falsely.
      complete: mode === 'full' ? storyEventCount > 0 : false,
      note:
        mode === 'full'
          ? storyEventCount > 0
            ? `${storyEventCount} development moment${storyEventCount === 1 ? '' : 's'} on the timeline.`
            : 'No development moments yet — goals, coach notes, and progress will appear here.'
          : 'Open the full passport to review the development timeline.',
    },
    {
      section: 'media',
      label: 'Media',
      complete: mode === 'full' ? mediaItemCount > 0 : false,
      note:
        mode === 'full'
          ? mediaItemCount > 0
            ? `${mediaItemCount} source-backed clip${mediaItemCount === 1 ? '' : 's'}.`
            : 'No video on file — add a clip to strengthen the proof packet.'
          : 'Open the full passport to review video & media.',
    },
    {
      section: 'academic',
      label: 'Academic',
      complete: p.gpa != null,
      note: p.gpa != null ? 'Complete.' : 'Add GPA / academic info.',
    },
    {
      section: 'exposure',
      label: 'Exposure',
      complete: exposureEnabled,
      note: exposureEnabled
        ? 'Passport exposure is enabled.'
        : 'Passport is internal-only (staff/player).',
    },
  ];
  const completePercent = Math.round(
    (signals.filter((s) => s.complete).length / signals.length) * 100,
  );

  return {
    playerId: targetPlayerId,
    teamId,
    viewerRole,
    visibilityState,
    headline: settings?.headline ?? null,
    mode,
    identity: identityCandidates,
    measurables,
    recentActivity,
    developmentStory,
    media,
    performance,
    completeness: { percent: completePercent, signals },
    withheldFieldCount: withheld,
    authorized: true,
    error: statsRes.error
      ? 'Recent activity could not be loaded.'
      : sectionError,
  };
}

// -----------------------------------------------------------------------------
// Full-section assembly (mode:'full' only)
// -----------------------------------------------------------------------------

interface FullSections {
  developmentStory: PassportReadModel['developmentStory'];
  media: PassportReadModel['media'];
  performance: PassportReadModel['performance'];
  error: string | null;
}

/** Internal per-game box-score line shapes (own/team rows the viewer can read). */
interface BoxBattingRow {
  game_id: string;
  ab: number | null;
  h: number | null;
  hr: number | null;
  rbi: number | null;
  bb: number | null;
  k: number | null;
  doubles: number | null;
  triples: number | null;
  hbp: number | null;
  sf: number | null;
}
interface BoxPitchingRow {
  game_id: string;
  ip: number | null;
  h: number | null;
  er: number | null;
  k: number | null;
  bb: number | null;
}
interface GameMetaRow {
  id: string;
  game_date: string | null;
  opponent_name: string | null;
  game_type: string | null;
}

function r3(n: number): number {
  return parseFloat(n.toFixed(3));
}
function r2(n: number): number {
  return parseFloat(n.toFixed(2));
}

/**
 * Assemble the three deep sections. Each sub-read is independently guarded so a
 * single failure degrades that one section to null/empty + an error string,
 * never the whole passport. Reads are RLS- and visibility-gated at their source.
 */
async function assembleFullSections(
  supabase: Awaited<ReturnType<typeof createClient>>,
  args: { teamId: string; playerId: string; viewerRole: PassportViewerRole },
): Promise<FullSections> {
  const { teamId, playerId } = args;
  const errors: string[] = [];

  // ---- (1) Development Story — via the viewer-filtered timeline read model ----
  let developmentStory: PassportReadModel['developmentStory'] = null;
  try {
    const tl = await getPlayerTimeline(teamId, playerId, { limit: 40 });
    if (tl.error) {
      errors.push('The development timeline could not be loaded.');
    }
    const events: PassportStoryEvent[] = tl.events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      title: e.title,
      body: e.body,
      occurredAt: e.occurredAt,
      trust: buildSourceTrust({
        ref: e.sourceRef,
        confidence: e.confidence,
        captureMode: 'active_capture' as CaptureMode,
        verified: false,
        conflict: false,
      }),
    }));
    developmentStory = { events, hiddenCount: tl.hiddenCount };
  } catch {
    errors.push('The development timeline could not be loaded.');
    developmentStory = { events: [], hiddenCount: 0 };
  }

  // ---- (2) Media — via the video library read model (RLS + visibility gated) --
  let media: PassportReadModel['media'] = null;
  try {
    const lib = await getVideoLibrary({ playerId, limit: 24 });
    if (lib.authorized) {
      const items: PassportMediaItem[] = lib.rows.map((row) => {
        const v = row.video;
        const title =
          v.clip_title?.trim() ||
          v.source_label?.trim() ||
          'Video clip';
        // BaseballVideoLink types video_id/external_video_url (the
        // hand-written, not-yet-applied 0080/0220 shape), but the LIVE
        // baseball_video_events table has neither — the real shareable-link
        // column is video_url. Read the raw row directly so the passport
        // media section stops always rendering url:null.
        const videoUrl =
          (v as unknown as { video_url?: string | null }).video_url ?? null;
        return {
          id: v.id,
          title,
          url: videoUrl,
          thumbnailUrl: v.thumbnail_url ?? null,
          capturedAt: v.captured_at ?? null,
          durationSeconds:
            v.duration_seconds != null ? Number(v.duration_seconds) : null,
          isReference: row.isReference,
          trust: buildSourceTrust({
            ref: buildSourceRef({
              source:
                v.source_vendor === 'manual' || v.source_vendor == null
                  ? 'manual'
                  : 'integration',
              label: v.source_label ?? v.source_vendor ?? 'Video',
            }),
            confidence: normalizeConfidence(v.source_confidence),
            captureMode: 'active_capture' as CaptureMode,
            verified: v.review_status === 'approved',
            conflict: false,
            trustLevel: 'attached_report',
          }),
        };
      });
      media = { items };
    } else {
      media = { items: [] };
    }
  } catch {
    errors.push('Media could not be loaded.');
    media = { items: [] };
  }

  // ---- (3) Baseball Performance — per-player box-score game logs + summary ----
  let performance: PassportReadModel['performance'] = null;
  try {
    performance = await assemblePerformance(supabase, { teamId, playerId });
  } catch {
    errors.push('Baseball performance could not be loaded.');
  }

  return {
    developmentStory,
    media,
    performance,
    error: errors[0] ?? null,
  };
}

/**
 * Derive a single player's season summary + per-game logs from the per-game box
 * scores (the honest source of the official/scrimmage split — the stored season
 * aggregate does NOT distinguish them). Reads are scoped to ONE player; RLS only
 * returns rows the viewer may read (own rows for a player; team rows for staff).
 */
async function assemblePerformance(
  supabase: Awaited<ReturnType<typeof createClient>>,
  args: { teamId: string; playerId: string },
): Promise<PassportPerformance> {
  const { teamId, playerId } = args;
  const seasonYear = new Date().getFullYear();
  const source = buildSourceRef({ source: 'system', label: 'Team box scores' });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const [batRes, pitRes] = await Promise.all([
    db
      .from('baseball_box_score_batting')
      .select('game_id, ab, h, hr, rbi, bb, k, doubles, triples, hbp, sf')
      .eq('team_id', teamId)
      .eq('player_id', playerId),
    db
      .from('baseball_box_score_pitching')
      .select('game_id, ip, h, er, k, bb')
      .eq('team_id', teamId)
      .eq('player_id', playerId),
  ]);

  const batting = (batRes.data as BoxBattingRow[] | null) ?? [];
  const pitching = (pitRes.data as BoxPitchingRow[] | null) ?? [];

  const gameIds = Array.from(
    new Set([...batting.map((b) => b.game_id), ...pitching.map((p) => p.game_id)].filter(Boolean)),
  );

  // Game metadata (date / opponent / official-vs-scrimmage) for the logs.
  const gamesById = new Map<string, GameMetaRow>();
  if (gameIds.length > 0) {
    const { data: games } = await db
      .from('baseball_games')
      .select('id, game_date, opponent_name, game_type')
      .eq('team_id', teamId)
      .in('id', gameIds);
    for (const g of (games as GameMetaRow[] | null) ?? []) gamesById.set(g.id, g);
  }

  // ---- Per-game logs (newest first) ----
  const batByGame = new Map<string, BoxBattingRow>();
  for (const b of batting) batByGame.set(b.game_id, b);
  const pitByGame = new Map<string, BoxPitchingRow>();
  for (const p of pitching) pitByGame.set(p.game_id, p);

  const gameLogs: PassportGameLogRow[] = gameIds
    .map((gid) => {
      const meta = gamesById.get(gid) ?? null;
      const b = batByGame.get(gid) ?? null;
      const p = pitByGame.get(gid) ?? null;
      const gameType: 'game' | 'scrimmage' =
        (meta?.game_type as 'game' | 'scrimmage' | null) === 'scrimmage'
          ? 'scrimmage'
          : 'game';
      return {
        gameId: gid,
        gameDate: meta?.game_date ?? null,
        opponent: meta?.opponent_name ?? null,
        gameType,
        batting: b
          ? {
              ab: b.ab ?? 0,
              h: b.h ?? 0,
              hr: b.hr ?? 0,
              rbi: b.rbi ?? 0,
              bb: b.bb ?? 0,
              k: b.k ?? 0,
            }
          : null,
        pitching: p
          ? {
              ip: Number(p.ip ?? 0),
              h: p.h ?? 0,
              er: p.er ?? 0,
              k: p.k ?? 0,
              bb: p.bb ?? 0,
            }
          : null,
      };
    })
    .sort((a, b) => (b.gameDate ?? '').localeCompare(a.gameDate ?? ''));

  // ---- Season summary (OFFICIAL games only — never inflated by scrimmages) ----
  const officialGameIds = new Set(
    gameLogs.filter((g) => g.gameType === 'game').map((g) => g.gameId),
  );

  let bG = 0;
  let ab = 0;
  let h = 0;
  let hr = 0;
  let rbi = 0;
  let bb = 0;
  let kBat = 0;
  let doubles = 0;
  let triples = 0;
  let hbp = 0;
  let sf = 0;
  for (const b of batting) {
    if (!officialGameIds.has(b.game_id)) continue;
    bG += 1;
    ab += b.ab ?? 0;
    h += b.h ?? 0;
    hr += b.hr ?? 0;
    rbi += b.rbi ?? 0;
    bb += b.bb ?? 0;
    kBat += b.k ?? 0;
    doubles += b.doubles ?? 0;
    triples += b.triples ?? 0;
    hbp += b.hbp ?? 0;
    sf += b.sf ?? 0;
  }
  let pG = 0;
  let ip = 0;
  let pH = 0;
  let er = 0;
  let kPit = 0;
  let bbPit = 0;
  for (const p of pitching) {
    if (!officialGameIds.has(p.game_id)) continue;
    pG += 1;
    ip += Number(p.ip ?? 0);
    pH += p.h ?? 0;
    er += p.er ?? 0;
    kPit += p.k ?? 0;
    bbPit += p.bb ?? 0;
  }

  const battingSummary =
    bG > 0
      ? (() => {
          const singles = h - doubles - triples - hr;
          const avg = ab > 0 ? r3(h / ab) : null;
          const slg =
            ab > 0
              ? r3((singles + 2 * doubles + 3 * triples + 4 * hr) / ab)
              : null;
          const pa = ab + bb + hbp + sf;
          const obp = pa > 0 ? r3((h + bb + hbp) / pa) : null;
          const ops = obp != null && slg != null ? r3(obp + slg) : null;
          return { g: bG, ab, h, hr, rbi, bb, k: kBat, avg, obp, slg, ops };
        })()
      : null;

  const pitchingSummary =
    pG > 0
      ? {
          g: pG,
          ip: r2(ip),
          er,
          k: kPit,
          bb: bbPit,
          era: ip > 0 ? r2((er * 9) / ip) : null,
          whip: ip > 0 ? r2((bbPit + pH) / ip) : null,
        }
      : null;

  const noData = batting.length === 0 && pitching.length === 0;

  return {
    source,
    seasonSummary: {
      seasonYear,
      batting: battingSummary,
      pitching: pitchingSummary,
      noData,
    },
    gameLogs,
  };
}

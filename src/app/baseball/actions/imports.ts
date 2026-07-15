'use server';

// =============================================================================
// src/app/baseball/actions/imports.ts
//
// Wave 6 / packet: source-registry (stats-integrations)
//
// Import Center server actions. Every action runs inside withBaseballAction with
// { featureArea: 'baseball-import', requiredCapability: 'can_manage_imports' } so
// auth + the import capability are enforced SERVER-SIDE before any work. None of
// these actions trust a client-asserted team or capability.
//
// Flow:
//   previewImport  — parse + match (no writes); returns the wizard preview.
//   commitImport   — writes baseball_import_runs (run header) + a
//                    baseball_stat_uploads lineage row (mapping + rollback
//                    snapshot) + baseball_player_stats (create/update via UPSERT,
//                    never delete-then-reinsert) + baseball_player_external_ids
//                    (deterministic future matching, with stored confidence).
//   rollbackImport — reverses ONLY this run's records using the stored
//                    before/after snapshot: deletes the rows this run CREATED and
//                    restores the before-state of the rows it UPDATED. No
//                    delete-then-reinsert.
//   getImportRuns  — lists prior runs for the run history panel.
//
// All import logic lives here + import-matching.ts; actions/stats.ts (spine) is
// never touched.
// =============================================================================

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { assertImportSourceEnabled } from '@/lib/baseball/import-source-enabled';
import { withBaseballAction } from '@/lib/baseball/with-baseball-action';
import { appendImportTimelineEvent } from '@/lib/baseball/timeline-writer';
import { runBaseballEngine } from '@/app/baseball/actions/coachhelm';
import { createGame, saveFullBoxScore } from '@/app/baseball/actions/games';
import { mapBattingToInput, mapPitchingToInput } from '@/components/baseball/box-score/mappers';
import { recalculatePlayerAggregates } from '@/app/baseball/actions/stats';
import { fingerprintBody } from '@/lib/baseball/adapters/file-fingerprint';
import {
  uploadImportRawFile,
  signImportRawFileUrl,
} from '@/lib/baseball/import-raw-file-storage';
import {
  parseCSV,
  findColumnMapping,
  normalizeStatRow,
  autoDetectColumnMapping,
  validateImportRows,
  type CSVRow,
  type ImportValidationReport,
  type ImportValidationIssue,
} from '@/lib/baseball/csv-utils';
import {
  detectSource,
  getImportSource,
  matchRows,
  summarizeMatches,
  detectDuplicate,
  computeRowVerdicts,
  type MatchablePlayer,
  type ExternalIdIndex,
  type MatchRowInput,
  type ExistingStatRecord,
  type IncomingRowForVerdict,
} from '@/lib/baseball/import-matching';
import { assertImportSourceAllowed } from '@/lib/baseball/import-source-enabled';
import type {
  BaseballImportRunRow,
  BaseballImportRowMatch,
  BaseballImportColumnMapping,
  BaseballImportRowSnapshot,
  BaseballImportRowDuplicate,
} from '@/lib/types/baseball-imports';
import type {
  BoxScoreBattingInput,
  BoxScorePitchingInput,
  BaseballBoxScoreBatting,
  BaseballBoxScorePitching,
  BaseballPitchingResult,
} from '@/lib/types';
import type {
  BaseballSourceTrustLevel,
  BaseballDefaultVisibility,
  BaseballDedupeStrictness,
  BaseballPlayerMatchStrategy,
} from '@/lib/types/baseball-settings';
import type {
  BaseballSignalInsert,
  BaseballSignalSeverity,
  BaseballRecommendedActionType,
  BaseballSignalSourceRef,
  BaseballJson,
} from '@/lib/types/baseball-signals';

// -----------------------------------------------------------------------------
// IMPORT VALIDATION -> SIGNAL (the spec's "import validation" generation source).
//
// V5 System 1 lists "import validation" as one of the five ways a signal is
// generated. Before this, a committed import's warnings lived only in the wizard
// UI and evaporated on commit — the Import Dossier never carried them as triage
// work. This emits ONE source_kind:'csv_import' signal per WARNING issue (info
// issues stay in the wizard; blocking issues already hard-stop the commit) into
// category 'import_quality', deduped by (importRunId, code, rowIndex) so a
// re-commit/replay refreshes the same row instead of cloning it.
// -----------------------------------------------------------------------------

const IMPORT_WARNING_TTL_DAYS = 21;

/** A warning issue code -> the conversion target a coach would pick. */
function importIssueActionType(
  code: ImportValidationIssue['code'],
): BaseballRecommendedActionType {
  switch (code) {
    case 'unmatched_row':
    case 'duplicate_likely':
      return 'import_review';
    default:
      return 'import_review';
  }
}

/** Warning issues are never 'critical' (blocking is the hard band); they map to
 * 'warning', except the purely-advisory 'all_zero_row' which is 'info'. */
function importIssueSeverity(
  issue: ImportValidationIssue,
): BaseballSignalSeverity {
  if (issue.severity === 'info') return 'info';
  return issue.code === 'all_zero_row' ? 'info' : 'warning';
}

/**
 * Emit per-warning signals for a committed import. Pure-ish: takes the already-
 * computed validation report so it never re-parses. Best-effort (a signal write
 * failure never fails the import — the data is already saved).
 */
async function emitImportWarningSignals(
  db: LooseClient,
  args: {
    teamId: string;
    importRunId: string;
    userId: string;
    sourceId: string;
    sourceLabel: string;
    validation: ImportValidationReport;
  },
): Promise<number> {
  const warnings = args.validation.issues.filter((i) => i.severity === 'warning');
  if (warnings.length === 0) return 0;

  const now = Date.now();
  const expiresAt = new Date(now + IMPORT_WARNING_TTL_DAYS * 86400000).toISOString();

  const rows: BaseballSignalInsert[] = warnings.map((issue) => {
    const sourceRefs: BaseballSignalSourceRef[] = [
      {
        source_table: 'baseball_import_runs',
        source_id: args.importRunId,
        label: `${args.sourceLabel} import${
          issue.rowIndex != null ? ` · row ${issue.rowIndex + 1}` : ''
        }`,
        visibility: 'staff_only',
      },
    ];
    return {
      team_id: args.teamId,
      player_id: null,
      event_id: null,
      signal_type: `import_${issue.code}`,
      category: 'import_quality',
      severity: importIssueSeverity(issue),
      title: `Import warning: ${issue.message}`,
      why_it_matters:
        issue.rowLabel != null
          ? `Row "${issue.rowLabel}" was committed with a data warning (${issue.code}). Review it so the imported stats are trustworthy.`
          : `This import was committed with a data warning (${issue.code}). Review it so the imported stats are trustworthy.`,
      evidence:
        issue.field != null
          ? `${issue.code} · field ${issue.field}${issue.rowIndex != null ? ` · row ${issue.rowIndex + 1}` : ''}`
          : `${issue.code}${issue.rowIndex != null ? ` · row ${issue.rowIndex + 1}` : ''}`,
      source_refs: sourceRefs as unknown as BaseballJson,
      confidence: 1, // the validator literally found this condition
      sample_n: null,
      recommended_action_label: 'Review the flagged import row',
      recommended_action_type: importIssueActionType(issue.code),
      recommended_owner_role: 'operations',
      disposition: 'new',
      visibility: 'staff_only',
      generated_by: 'import_validation',
      source_kind: 'csv_import',
      dedupe_key: `import_warning:${args.importRunId}:${issue.code}:${
        issue.rowIndex ?? 'file'
      }`,
      expires_at: expiresAt,
      created_by: args.userId,
    };
  });

  const { error } = await db
    .from('baseball_signals')
    .upsert(rows, { onConflict: 'team_id,dedupe_key', ignoreDuplicates: false });
  return error ? 0 : rows.length;
}

// -----------------------------------------------------------------------------
// Transport shapes
// -----------------------------------------------------------------------------

export interface ImportPreview {
  sourceId: string;
  sourceLabel: string;
  detectedSourceId: string;
  headers: string[];
  mapping: BaseballImportColumnMapping;
  matches: BaseballImportRowMatch[];
  totalRows: number;
  matchedRows: number;
  unmatchedRows: number;
  /** The parsed rows, echoed back so the client can pass them to commit. */
  rows: CSVRow[];
  /**
   * The 3-tier VALIDATE pass over the auto-matched preview (data_validation_v2.md
   * severity model). The wizard re-validates locally on every manual override;
   * this is the initial report so the Preview step renders without a round-trip.
   */
  validation: ImportValidationReport;
  /**
   * The REGISTERED source policy this import will be governed by (resolved from
   * the team's baseball_import_sources registry, or adapter defaults when the
   * source is not registered). The wizard surfaces this so a coach sees BEFORE
   * committing that e.g. the source requires review, will be stamped a given
   * trust level, or matches external-id-only. This is what makes the registry
   * load-bearing and visible, not write-only config.
   */
  policy: ImportSourcePolicySummary;
  /**
   * Per-row DUPLICATE verdict (duplicate_resolution_v2.md): for every resolved
   * row, whether committing it will create a NEW record, OVERWRITE an existing one
   * (with the changed-field diff), or be an EXACT re-import the coach can skip.
   * Computed read-only against the targeted (team, session_date, stat_type) grain
   * so the coach sees the create/update/skip decision BEFORE commit, not after.
   * Empty when the target grain is unknown (no statType/sessionDate supplied).
   */
  duplicates: BaseballImportRowDuplicate[];
}

/** Read-only view of the registered source policy, surfaced in the wizard. */
export interface ImportSourcePolicySummary {
  /** true when a registry row drove this; false = adapter defaults used. */
  registered: boolean;
  trustLevel: BaseballSourceTrustLevel;
  defaultVisibility: BaseballDefaultVisibility;
  requiredReview: boolean;
  dedupeStrictness: BaseballDedupeStrictness;
  playerMatchStrategy: BaseballPlayerMatchStrategy;
  externalIdNamespace: string | null;
}

export interface CommitImportArgs {
  teamId: string;
  sourceId: string;
  fileName: string;
  statType: 'practice' | 'game' | 'other';
  sessionDate: string;
  sessionName?: string;
  headers: string[];
  mapping: BaseballImportColumnMapping;
  rows: CSVRow[];
  /** Final per-row matches (after any manual overrides) from the wizard. */
  matches: BaseballImportRowMatch[];
  /**
   * GAP 1 + GAP 2 — the ORIGINAL uploaded file body (the same transport string
   * the wizard already holds: plain CSV/TSV/XML text, or the binary base64
   * envelope for XLSX/PDF). The server recomputes the SHA-256 over the exact
   * bytes it stores (never trusts a client hash), preserves the file in the
   * private `baseball-imports` bucket, and short-circuits an exact-duplicate
   * re-import. Optional so a legacy caller without the body still commits (it
   * just lands with file_url/file_hash null and no dup short-circuit).
   */
  rawFileBody?: string;
  /**
   * When true, bypass the "this exact file was already imported" short-circuit
   * (the coach explicitly chose to re-import the identical file). Default false.
   */
  forceReimport?: boolean;
  /**
   * ISSUE #379 — the wizard's Step 1 "What are you uploading?" choice
   * (ImportWizardClient's `ImportDataShape`). Drives which CANONICAL table this
   * commit ALSO writes to, in addition to the legacy baseball_player_stats row
   * below (kept unchanged so My Stats' raw session list, rollback, and the
   * external-id/timeline/signal pipeline all keep working exactly as before):
   *   'game_box_score' -> baseball_box_score_batting/_pitching (+ baseball_games)
   *                       via the same save_baseball_full_box_score RPC the
   *                       manual box-score entry and per-game CSV upload use.
   *   'season_totals'  -> baseball_player_season_stats, keyed by the table's
   *                       (player_id, team_id, season_year) unique constraint.
   * Both writes are best-effort (never throw / never fail the commit) — the
   * legacy row is the write of record if either fails. Optional so a legacy
   * caller (or a re-import approved from a run staged before this field
   * existed) safely falls back to the pre-existing legacy-only write.
   */
  dataShape?: 'season_totals' | 'game_box_score' | 'event_log';
}

export interface CommitImportResult {
  importRunId: string;
  created: number;
  updated: number;
  skipped: number;
  /**
   * Rows withheld as duplicates by the registered source's dedupe_strictness
   * (distinct from `skipped`, which is rows the coach set to skip / left
   * unmatched). Surfaced so the coach knows a re-import was idempotent.
   */
  duplicatesSkipped: number;
  /**
   * Rows the coach explicitly marked 'Create' that collided with an existing
   * record and were REJECTED rather than silently overwriting it. The coach must
   * roll back the owning run or switch the row to Update to apply it.
   */
  createConflicts: number;
  /**
   * Rows the coach marked 'Update' with no existing target — there was nothing to
   * overwrite, so the wanted data was INSERTED. Surfaced so the count is honest.
   */
  updateFellBackToInsert: number;
  /**
   * When the registered source has required_review=true, the run is HELD: no
   * rows are written, the run lands in the review queue (review_state
   * 'pending_review'), and the coach must approve it. `created`/`updated` are 0
   * in that case and `heldForReview` is true.
   */
  heldForReview: boolean;
  /**
   * GAP 2 — set when the EXACT same file (by server-recomputed SHA-256) was
   * already committed for this (team, source). No run is created and nothing is
   * written; the wizard surfaces "this exact file was already imported on <date>"
   * and lets the coach skip or force a re-import. Null on a normal commit.
   */
  duplicateFileRun: { runId: string; committedAt: string | null } | null;
}

// -----------------------------------------------------------------------------
// Internal helpers (not server actions)
// -----------------------------------------------------------------------------

const PLAYER_NAME_FALLBACKS = ['player', 'name', 'player_name', 'athlete'];

/**
 * Loosely-typed Supabase handle for the import-lineage tables. baseball_import_runs
 * and baseball_player_external_ids do not exist in the generated database.ts yet
 * (we cannot regenerate against a live apply), and baseball_stat_uploads gained
 * additive columns the generated types don't know. We type these reads/writes
 * loosely here, the same pattern the rest of the baseball actions use, with
 * hand-written Row types (baseball-imports.ts) applied at the boundary.
 */
type LooseClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

async function loadRosterPlayers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamId: string
): Promise<MatchablePlayer[]> {
  // Load the tier-3 disambiguation signals (player_matching_v2.md): the
  // per-team jersey_number lives on baseball_team_members; grad_year (the "class"
  // signal) + primary_position live on baseball_players. Selecting them here is
  // what makes the jersey/class tier and the manual-match position hint possible
  // — previously only id/first/last were loaded, so two same-last-name players
  // had no signal to break the tie.
  const { data: members } = await supabase
    .from('baseball_team_members')
    .select(
      `player_id,
       jersey_number,
       baseball_players!inner ( id, first_name, last_name, grad_year, primary_position )`
    )
    .eq('team_id', teamId);

  return (members ?? []).map((m) => {
    const p = m.baseball_players as unknown as {
      id: string;
      first_name: string | null;
      last_name: string | null;
      grad_year: number | null;
      primary_position: string | null;
    };
    const member = m as unknown as { jersey_number: number | null };
    return {
      id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      jersey_number: member.jersey_number,
      grad_year: p.grad_year,
      primary_position: p.primary_position,
    };
  });
}

/**
 * The registered source policy that drives this import, resolved from the team's
 * baseball_import_sources registry. When the chosen sourceId is NOT registered
 * for the team, we fall back to the source's adapter defaults (the hardcoded
 * behavior before the registry was load-bearing) — never a hard failure.
 */
interface ResolvedSourcePolicy {
  /** registry row id, or null when falling back to adapter defaults. */
  configId: string | null;
  trustLevel: BaseballSourceTrustLevel;
  defaultVisibility: BaseballDefaultVisibility;
  requiredReview: boolean;
  dedupeStrictness: BaseballDedupeStrictness;
  playerMatchStrategy: BaseballPlayerMatchStrategy;
  /** external-id namespace to scope deterministic matching to (null = source_id). */
  externalIdNamespace: string | null;
}

/** The fallback policy when a source is not registered for the team. */
const ADAPTER_DEFAULT_POLICY: Omit<ResolvedSourcePolicy, 'configId'> = {
  trustLevel: 'unreviewed',
  defaultVisibility: 'staff_only',
  // Unregistered sources keep the prior auto-commit behavior (no review gate)
  // so existing imports are not silently blocked by this deepening.
  requiredReview: false,
  dedupeStrictness: 'standard',
  playerMatchStrategy: 'name_then_external_id',
  externalIdNamespace: null,
};

/**
 * Load the team's registry policy for the chosen source. The wizard's sourceId
 * is the adapter key (e.g. 'trackman'); production registry rows store it as
 * `adapter_key`, so we match on adapter_key first, then source_name as a secondary key (a coach
 * may register a source under a friendly name with the same type). RLS scopes the
 * read to the staff member's team; we additionally filter by team_id.
 */
async function loadSourcePolicy(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamId: string,
  sourceId: string
): Promise<ResolvedSourcePolicy> {
  const db = supabase as unknown as LooseClient;
  const { data } = await db
    .from('baseball_import_sources')
    .select(
      'id, adapter_key, source_name, trust_level, default_visibility, required_review, dedupe_strictness, player_match_strategy, external_id_namespace, is_active'
    )
    .eq('team_id', teamId)
    .or(`adapter_key.eq.${sourceId},source_name.eq.${sourceId}`)
    .limit(1);

  const row = (data ?? [])[0] as
    | {
        id: string;
        source_name: string;
        trust_level: BaseballSourceTrustLevel;
        default_visibility: BaseballDefaultVisibility;
        required_review: boolean;
        dedupe_strictness: BaseballDedupeStrictness;
        player_match_strategy: BaseballPlayerMatchStrategy | 'name_fuzzy';
        external_id_namespace: string | null;
        is_active: boolean;
      }
    | undefined;

  if (!row) return { configId: null, ...ADAPTER_DEFAULT_POLICY };

  assertImportSourceEnabled(
    { source_name: row.source_name, enabled: row.is_active },
    sourceId,
  );

  return {
    configId: row.id,
    trustLevel: row.trust_level,
    defaultVisibility: row.default_visibility,
    requiredReview: row.required_review,
    dedupeStrictness: row.dedupe_strictness === 'loose' ? 'loose' : 'strict',
    playerMatchStrategy:
      row.player_match_strategy === 'name_fuzzy'
        ? 'name_then_external_id'
        : row.player_match_strategy,
    externalIdNamespace: row.external_id_namespace,
  };
}

async function loadExternalIdIndex(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sourceId: string,
  playerIds: string[],
  /**
   * When the registered source declares an external_id_namespace, deterministic
   * lookups are scoped to it (the ids in the same namespace) instead of the raw
   * sourceId — two sources sharing a vendor id space (e.g. multiple TrackMan
   * units under one program namespace) then resolve against the same mappings.
   */
  namespace?: string | null
): Promise<ExternalIdIndex> {
  const index: ExternalIdIndex = new Map();
  if (playerIds.length === 0) return index;

  const db = supabase as unknown as LooseClient;
  // RLS already scopes external-id rows to the staff member's team(s) via the
  // player->team chain; we additionally filter by source + the team's players.
  const lookupSource = namespace?.trim() || sourceId;
  const { data } = await db
    .from('baseball_player_external_ids')
    .select('player_id, external_id, confidence')
    .eq('source_id', lookupSource)
    .in('player_id', playerIds);

  for (const row of (data ?? []) as Array<{
    player_id: string;
    external_id: string;
    confidence: number | null;
  }>) {
    index.set(row.external_id, {
      playerId: row.player_id,
      confidence: row.confidence ?? 1,
    });
  }
  return index;
}

/**
 * Load the EXISTING committed stat records for the targeted grain (team, session
 * date, stat type), reduced to what the duplicate-verdict pass needs. This is the
 * read the spec's "detect existing source rows" requires — run at PREVIEW (so the
 * coach sees create/update/skip BEFORE commit) and again at COMMIT (so the server
 * never trusts a stale client verdict). Scoped to only the rostered players being
 * imported keeps it cheap. RLS scopes the read to the staff member's team.
 */
async function loadExistingStatRecords(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamId: string,
  statType: string,
  sessionDate: string,
  playerIds: string[],
  mapping: BaseballImportColumnMapping,
): Promise<ExistingStatRecord[]> {
  if (playerIds.length === 0) return [];
  const db = supabase as unknown as LooseClient;
  const { data } = await db
    .from('baseball_player_stats')
    .select('*')
    .eq('team_id', teamId)
    .eq('stat_type', statType)
    .eq('session_date', sessionDate)
    .in('player_id', playerIds);

  // Only diff the fields THIS import maps, so the changed-field list mirrors what
  // a commit would actually write (an unmapped column never reads as "changed").
  const mappedFields = Object.entries(mapping)
    .filter(([field, col]) => field !== 'player_name' && col)
    .map(([field]) => field);

  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
    const values: Record<string, number | null> = {};
    for (const f of mappedFields) {
      const v = r[f];
      values[f] = typeof v === 'number' ? v : v == null ? null : Number(v);
    }
    return {
      statId: String(r.id),
      playerId: String(r.player_id),
      source: (r.source as string | null) ?? null,
      externalId: (r.source_external_id as string | null) ?? null,
      values,
    };
  });
}

/**
 * The single external-id column detector, shared by EVERY path that keys on an
 * external row/event id: the preview duplicate verdict, the committed-row
 * source_external_id stamp, and the player external-id mapping. Keeping one
 * regex means the preview's "this row will overwrite X" identity can never drift
 * from the identity the commit actually stamps + dedupes on.
 */
function findExternalIdColumn(headers: string[]): string | null {
  return (
    headers.find((h) =>
      /(^|_)(player_?id|athlete_?id|external_?id|event_?id)$/.test(h),
    ) ?? null
  );
}

function resolveNameColumn(headers: string[], mapping: BaseballImportColumnMapping): string | null {
  if (mapping.player_name) return mapping.player_name;
  const detected = findColumnMapping(headers, 'player_name');
  if (detected) return detected;
  return headers.find((h) => PLAYER_NAME_FALLBACKS.includes(h.toLowerCase())) ?? null;
}

/**
 * Detect the source's jersey column for tier-3 disambiguation. Matches common
 * box-score header spellings ('#', 'jersey', 'number', 'no', 'uni') after the
 * parser's lowercase/underscore normalization. Deliberately tight (anchored) so
 * a stat like 'home_runs' or 'runs' never masquerades as a jersey column.
 */
function findJerseyColumn(headers: string[]): string | null {
  return (
    headers.find((h) =>
      /^(jersey(_?number)?|jersey_?no|uni(form)?(_?number)?|number|num|no|#)$/.test(
        h.toLowerCase(),
      ),
    ) ?? null
  );
}

/**
 * Detect the source's class / grad-year column for tier-3 disambiguation
 * ('class', 'year', 'grad', 'grad_year', 'yr', 'eligibility'). 'year' is
 * intentionally allowed here — flat box scores rarely carry a season 'year'
 * column, and when they do, a 4-digit grad year and a season year both resolve
 * to a comparable grad year via classTokenToGradYear.
 */
function findClassColumn(headers: string[]): string | null {
  return (
    headers.find((h) =>
      /^(class(_?year)?|grad(_?year)?|year|yr|eligibility|elig)$/.test(h.toLowerCase()),
    ) ?? null
  );
}

// -----------------------------------------------------------------------------
// previewImport — parse + match, NO writes
// -----------------------------------------------------------------------------

/**
 * previewImport's args. `dataShape` mirrors CommitImportArgs.dataShape (the
 * wizard's Step 1 "What are you uploading?" choice) so the capability gate
 * below can relax identically at preview time and at commit time — a
 * stats-only coach whose ONLY unlocked path is 'game_box_score' must not get
 * blocked at the FIRST wizard step the two-shape capability model allows them
 * to reach. Optional so a legacy/other caller that omits it (see
 * EventImportWizard.tsx, which never sets it) keeps the pre-existing
 * can_manage_imports-only gate — the restrictive default.
 */
interface PreviewImportArgs {
  teamId: string;
  sourceId: string;
  csvContent: string;
  // The targeted grain — supplied so the preview can detect EXISTING rows and
  // show the per-row create/update/skip verdict BEFORE commit. Optional so a
  // caller that only wants the parse/match preview still works (verdicts empty).
  statType?: 'practice' | 'game' | 'other';
  sessionDate?: string;
  dataShape?: 'season_totals' | 'game_box_score' | 'event_log';
}

/**
 * ROUND-4 FIX (#863) — the SAME shape-conditional capability gate commitImport
 * uses (see its own comment above the `requiredCapability` option): a
 * 'game_box_score' request may be authorized by can_manage_imports OR
 * can_manage_stats; every other shape (including omitted/undefined, which
 * covers every existing non-wizard caller) keeps the original can_manage_imports-
 * only gate. `dataShape` here is the exact field the wizard sends and the coach
 * chose in the UI — there is no other, more "server-trusted" source for it at
 * preview time (no write has happened yet to derive it from); resolving the
 * SAME field the commit-time gate resolves is what keeps the two gates from
 * ever disagreeing about what a given request is allowed to do.
 */
function importCapabilityForShape(
  a: Pick<PreviewImportArgs, 'dataShape'>,
): 'can_manage_imports' | readonly ['can_manage_stats', 'can_manage_imports'] {
  return a.dataShape === 'game_box_score'
    ? (['can_manage_stats', 'can_manage_imports'] as const)
    : 'can_manage_imports';
}

export const previewImport = withBaseballAction(
  'previewImport',
  {
    featureArea: 'baseball-import',
    requiredCapability: (a: PreviewImportArgs) => importCapabilityForShape(a),
    teamFrom: (a: PreviewImportArgs) => a.teamId,
  },
  async (_ctx, args: PreviewImportArgs): Promise<ImportPreview> => {
    const supabase = await createClient();
    const { teamId, sourceId } = args;
    const db = supabase as unknown as LooseClient;

    await assertImportSourceAllowed(db, teamId, sourceId);

    // Resolve the registered source policy up front — it governs matching
    // strategy + namespace below and is surfaced in the preview either way.
    const policy = await loadSourcePolicy(supabase, teamId, sourceId);
    const policySummary: ImportSourcePolicySummary = {
      registered: policy.configId !== null,
      trustLevel: policy.trustLevel,
      defaultVisibility: policy.defaultVisibility,
      requiredReview: policy.requiredReview,
      dedupeStrictness: policy.dedupeStrictness,
      playerMatchStrategy: policy.playerMatchStrategy,
      externalIdNamespace: policy.externalIdNamespace,
    };

    const rows = parseCSV(args.csvContent);
    if (rows.length === 0) {
      return {
        sourceId,
        sourceLabel: getImportSource(sourceId).label,
        detectedSourceId: sourceId,
        headers: [],
        mapping: {},
        matches: [],
        totalRows: 0,
        matchedRows: 0,
        unmatchedRows: 0,
        rows: [],
        validation: {
          issues: [],
          blockingCount: 0,
          warningCount: 0,
          infoCount: 0,
          blockingRowIndices: [],
          hasBlockers: false,
          hasWarnings: false,
        },
        policy: policySummary,
        duplicates: [],
      };
    }

    const headers = Object.keys(rows[0]!);
    const detected = detectSource(headers);
    const detectedSourceId = detected[0]?.source.id ?? 'generic_csv';

    // Auto-map every importable field; the client may override before commit.
    const mapping: BaseballImportColumnMapping = autoDetectColumnMapping(headers);

    const nameCol = resolveNameColumn(headers, mapping);
    if (nameCol) mapping.player_name = nameCol;

    const players = await loadRosterPlayers(supabase, teamId);
    const playerIds = players.map((p) => p.id);
    const externalIdIndex = await loadExternalIdIndex(
      supabase,
      sourceId,
      playerIds,
      policy.externalIdNamespace
    );

    // External id column (if the source carries one) — best effort.
    const extIdCol =
      headers.find((h) => /(^|_)(player_?id|athlete_?id|external_?id)$/.test(h)) ?? null;
    // Jersey + class columns drive the tier-3 (name + jersey + class)
    // disambiguation. Best-effort header detection; null when the file lacks them.
    const jerseyCol = findJerseyColumn(headers);
    const classCol = findClassColumn(headers);

    const matchInputs: MatchRowInput[] = rows.map((row, rowIndex) => ({
      rowIndex,
      sourceName: nameCol ? (row[nameCol] ?? '').trim() : '',
      externalId: extIdCol ? (row[extIdCol] ?? '').trim() || null : null,
      sourceJersey: jerseyCol ? (row[jerseyCol] ?? '').trim() || null : null,
      sourceClass: classCol ? (row[classCol] ?? '').trim() || null : null,
    }));

    // Match honoring the registered source's player_match_strategy
    // (external_id_only / name_then_external_id / manual_only).
    const matches = matchRows(matchInputs, players, externalIdIndex, policy.playerMatchStrategy);
    const summary = summarizeMatches(matches);

    // DUPLICATE / RE-IMPORT VERDICT (duplicate_resolution_v2.md). Detect existing
    // rows for the targeted grain and decide, per resolved row, whether commit will
    // CREATE a new record, OVERWRITE an existing one (with the changed-field diff),
    // or be an EXACT re-import. This is the read the gap called out as missing — the
    // wizard preview previously never ran the existing-row lookup, so a coach was
    // never shown "this row will OVERWRITE an existing line for <date>" pre-commit.
    let duplicates: BaseballImportRowDuplicate[] = [];
    if (args.statType && args.sessionDate) {
      const matchedPlayerIds = matches
        .filter((m) => m.playerId && m.action !== 'skip')
        .map((m) => m.playerId as string);
      if (matchedPlayerIds.length > 0) {
        const existing = await loadExistingStatRecords(
          supabase,
          teamId,
          args.statType,
          args.sessionDate,
          [...new Set(matchedPlayerIds)],
          mapping,
        );
        const incoming: IncomingRowForVerdict[] = matches
          .filter((m) => m.playerId && m.action !== 'skip')
          .map((m) => ({
            rowIndex: m.rowIndex,
            playerId: m.playerId as string,
            externalId: extIdCol ? (rows[m.rowIndex]?.[extIdCol] ?? '').trim() || null : null,
            incomingSource: `import:${sourceId}`,
            values: normalizeStatRow(rows[m.rowIndex] as CSVRow, mapping),
          }));
        duplicates = computeRowVerdicts(incoming, existing) as BaseballImportRowDuplicate[];
      }
    }

    // VALIDATE pass over the auto-matched preview. The wizard re-runs this pure
    // function client-side after every manual match/action override; this seeds
    // the Preview step so it renders the report without an extra round-trip.
    const validation = validateImportRows({
      rows,
      mapping,
      headers,
      matches: matches.map((m) => ({
        rowIndex: m.rowIndex,
        playerId: m.playerId,
        action: m.action,
        sourceName: m.sourceName,
      })),
    });

    return {
      sourceId,
      sourceLabel: getImportSource(sourceId).label,
      detectedSourceId,
      headers,
      mapping,
      matches,
      totalRows: summary.total,
      matchedRows: summary.matched,
      unmatchedRows: summary.unmatched,
      rows,
      validation,
      policy: policySummary,
      duplicates,
    };
  }
);

// -----------------------------------------------------------------------------
// commitImport — write run + lineage + stats (UPSERT) + external ids
// -----------------------------------------------------------------------------

export const commitImport = withBaseballAction(
  'commitImport',
  {
    featureArea: 'baseball-import',
    // ROUND-4 FIX (#863) — pre-consolidation, stats-only staff (can_manage_stats,
    // no can_manage_imports) could upload box scores via the legacy /stats/upload
    // wizard; the consolidated Import Center regressed that by hard-gating BOTH
    // previewImport and commitImport to can_manage_imports unconditionally,
    // silently locking out every stats-only role even though the quickEntryOnly
    // inline wizard (see StatsUploadPage) still renders for them. Restore the
    // faithful capability model: a 'game_box_score' commit — the ONLY shape
    // quickEntryOnly's UI can ever produce (see ImportWizardClient's `!quickEntryOnly`-
    // gated shape picker / back-to-choose affordances) — may be authorized by
    // can_manage_imports OR can_manage_stats. Every other shape (season_totals,
    // event_log, or omitted/undefined) keeps the ORIGINAL can_manage_imports-only
    // gate, so stats-only staff gain NOTHING beyond the historical box-score path.
    // `args.dataShape` (CommitImportArgs.dataShape) is gated on here via the SAME
    // field applyImportPlan below uses to decide canonical-table routing — there
    // is no separate, more "server-trusted" value to derive it from at commit
    // time (no staged/server-persisted preview precedes a direct commit; see
    // reviewImportRun for the ONE flow that does persist it, which stays fully
    // can_manage_imports-gated below, unchanged). Using the identical binding for
    // both the auth decision and the write decision means they can never diverge:
    // a caller cannot claim 'game_box_score' to unlock the OR-gate while having
    // the season_totals/event_log canonical write actually apply — that write
    // branch only runs when this SAME field says 'season_totals'/'event_log',
    // which requires the (unrelaxed) can_manage_imports gate to have passed.
    requiredCapability: (a: CommitImportArgs) => importCapabilityForShape(a),
    teamFrom: (a: CommitImportArgs) => a.teamId,
  },
  async (ctx, args: CommitImportArgs): Promise<CommitImportResult> => {
    const supabase = await createClient();
    const {
      teamId,
      sourceId,
      fileName,
      statType,
      sessionDate,
      sessionName,
      headers,
      mapping,
      rows,
      matches,
      dataShape,
    } = args;

    const coachId = ctx.activeCoachId;
    if (!coachId) {
      // Capability is staff-only, so this should be unreachable; guard anyway.
      throw new Error('No coach identity for import commit.');
    }

    const source = getImportSource(sourceId);
    const db = supabase as unknown as LooseClient;

    // Resolve the registered source policy. This is the load-bearing read the
    // gap called out: trust/visibility stamping, review routing, dedupe pass,
    // and (already-applied) match-strategy all flow from this one row.
    const policy = await loadSourcePolicy(supabase, teamId, sourceId);
    const sourceTag = `import:${sourceId}`;

    // 0. SERVER-SIDE VALIDATION GATE (defense-in-depth). The wizard already
    //    disables Commit while blockers exist, but the server NEVER trusts that:
    //    a tampered/replayed request could carry blocking rows. We re-run the
    //    identical pure VALIDATE pass over the committed payload and REFUSE to
    //    write a single row if any blocker survives. No run header is created, so
    //    a rejected commit leaves zero trace (it never started). Warnings do not
    //    block here — the wizard's explicit acknowledgement is the warning gate.
    const validation = validateImportRows({
      rows,
      mapping,
      headers,
      matches: matches.map((m) => ({
        rowIndex: m.rowIndex,
        playerId: m.playerId,
        action: m.action,
        sourceName: m.sourceName,
      })),
    });
    if (validation.hasBlockers) {
      const first = validation.issues.find((x) => x.severity === 'blocking');
      throw new Error(
        `Import blocked: ${validation.blockingCount} blocking issue${
          validation.blockingCount === 1 ? '' : 's'
        } must be resolved before committing.${first ? ` First: ${first.message}` : ''}`,
      );
    }

    // GAP 1 + GAP 2 — FILE FINGERPRINT + DUPLICATE SHORT-CIRCUIT. Compute the
    // SHA-256 over the EXACT bytes we will store (server-recomputed; a tampered
    // client hash can never poison dedupe). If the identical file was already
    // committed for this (team, source) and the coach did not force a re-import,
    // RETURN early writing nothing — the "same file hash is ignored as duplicate"
    // invariant. Best-effort: a fingerprint failure never blocks the import.
    let fingerprint: Awaited<ReturnType<typeof fingerprintBody>> | null = null;
    if (args.rawFileBody && args.rawFileBody.length > 0) {
      try {
        fingerprint = await fingerprintBody(args.rawFileBody);
      } catch {
        fingerprint = null;
      }
    }
    if (fingerprint && !args.forceReimport) {
      const { data: priorRun } = await db
        .from('baseball_import_runs')
        .select('id, committed_at')
        .eq('team_id', teamId)
        .eq('source_id', sourceId)
        .eq('file_hash', fingerprint.fileHash)
        .eq('status', 'committed')
        .order('committed_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (priorRun) {
        const dup = priorRun as { id: string; committed_at: string | null };
        return {
          importRunId: dup.id,
          created: 0,
          updated: 0,
          skipped: rows.length,
          duplicatesSkipped: 0,
          createConflicts: 0,
          updateFellBackToInsert: 0,
          heldForReview: false,
          duplicateFileRun: { runId: dup.id, committedAt: dup.committed_at },
        };
      }
    }

    // Roll-up of what WOULD be written (for the run header + review queue), and
    // the resolved match -> snapshot decisions, computed once so both the
    // review-hold path and the commit path share the same staged plan.
    const summaryAll = summarizeMatches(matches);

    // 1. Create the run header. review_state is driven by required_review:
    //    required_review=true  -> status:'review', review_state:'pending_review'
    //                             (no rows written; coach approves later).
    //    required_review=false -> status:'parsing' -> 'committed' below.
    const willHold = policy.requiredReview;
    const { data: runRow, error: runErr } = await db
      .from('baseball_import_runs')
      .insert({
        team_id: teamId,
        source_id: sourceId,
        source_label: source.label,
        file_name: fileName,
        status: willHold ? 'review' : 'parsing',
        total_rows: rows.length,
        matched_rows: summaryAll.matched,
        unmatched_rows: summaryAll.unmatched,
        created_by: ctx.user.id,
        source_config_id: policy.configId,
        review_state: willHold ? 'pending_review' : 'not_required',
        // GAP 2 — persist the fingerprint with the header so the duplicate index
        // is populated even for a held run (a re-upload of the same held file is
        // recognized) and so the dossier can show the hash.
        file_hash: fingerprint?.fileHash ?? null,
        file_bytes: fingerprint?.fileBytes ?? null,
      })
      .select('*')
      .single();

    if (runErr || !runRow) {
      throw new Error('Failed to create import run.');
    }
    const importRunId = (runRow as { id: string }).id;

    // GAP 1 — preserve the original file. Upload AFTER the run row exists so the
    // path carries the real run id (<team>/<run>/<file>), then UPDATE file_url.
    // For the willHold path this stores at STAGE time so a reviewer approves
    // against the real file. Best-effort: an upload failure leaves file_url null
    // and never fails the import.
    if (fingerprint) {
      const storedPath = await uploadImportRawFile(supabase, {
        teamId,
        runId: importRunId,
        fileName,
        bytes: fingerprint.bytes,
        contentType: fingerprint.mime,
      });
      if (storedPath) {
        await db
          .from('baseball_import_runs')
          .update({ file_url: storedPath })
          .eq('id', importRunId);
      }
    }

    // 1a. REVIEW HOLD. A source registered required_review=true never auto-
    //     commits. We stage the full plan (mapping + matches) on the lineage row
    //     so a reviewer can approve it later, but write ZERO stat rows now. This
    //     is the registry's required_review becoming load-bearing: the toggle now
    //     changes whether the import is applied, not just stored config.
    if (willHold) {
      await db
        .from('baseball_stat_uploads')
        .insert({
          team_id: teamId,
          coach_id: coachId,
          filename: fileName,
          stat_type: statType,
          session_date: sessionDate,
          session_name: sessionName ?? null,
          total_rows: rows.length,
          matched_rows: summaryAll.matched,
          unmatched_rows: summaryAll.unmatched,
          // Stage the entire plan so approval can apply it without re-uploading
          // (rows + headers + matches are replayed by reviewImportRun ->
          // applyImportPlan with the current registry policy).
          unmatched_data: {
            staged: true,
            matches,
            headers,
            rows,
            // ISSUE #379 — carried so an approved held run still routes to the
            // canonical box-score/season-stats tables, not just the legacy one.
            dataShape: dataShape ?? null,
            policy: {
              trustLevel: policy.trustLevel,
              defaultVisibility: policy.defaultVisibility,
              dedupeStrictness: policy.dedupeStrictness,
            },
          },
          status: 'needs_review',
          import_run_id: importRunId,
          source_id: sourceId,
          mapping_config: mapping,
        });

      revalidatePath('/baseball/dashboard/import');
      revalidatePath('/baseball/dashboard/command-center');

      return {
        importRunId,
        created: 0,
        updated: 0,
        skipped: rows.length,
        duplicatesSkipped: 0,
        createConflicts: 0,
        updateFellBackToInsert: 0,
        heldForReview: true,
        duplicateFileRun: null,
      };
    }

    // 2. Apply the staged plan (dedupe + stamp + write + lineage + timeline +
    //    engine). Shared with the review-approval path so an approved held run
    //    applies through the EXACT same load-bearing policy logic.
    const applied = await applyImportPlan(db, {
      importRunId,
      teamId,
      coachId,
      userId: ctx.user.id,
      sourceId,
      sourceLabel: source.label,
      sourceTag,
      policy,
      statType,
      sessionDate,
      sessionName: sessionName ?? null,
      fileName,
      headers,
      mapping,
      rows,
      matches,
      dataShape,
      // Carry the already-computed report so committed WARNINGS surface as
      // Import Dossier signals (the spec's import-validation generation source).
      validation,
    });

    return {
      importRunId,
      created: applied.created,
      updated: applied.updated,
      // `skipped` is everything not written and not a dedupe/create-conflict skip
      // (coach-set skips + unmatched rows). Create-conflicts are reported in their
      // own field so the coach can tell a deliberate withhold from a plain skip.
      skipped:
        rows.length -
        applied.created -
        applied.updated -
        applied.duplicatesSkipped -
        applied.createConflicts,
      duplicatesSkipped: applied.duplicatesSkipped,
      createConflicts: applied.createConflicts,
      updateFellBackToInsert: applied.updateFellBackToInsert,
      heldForReview: false,
      duplicateFileRun: null,
    };
  }
);

// -----------------------------------------------------------------------------
// applyImportPlan — the load-bearing write core (internal; not a server action)
//   Shared by commitImport (auto-commit path) and reviewImportRun (approve a
//   held run). It dedupes by dedupe_strictness, STAMPS trust_level +
//   default_visibility on each committed row, writes the rollback snapshot +
//   lineage row, finalizes the run header to 'committed', closes the import ->
//   timeline link, and triggers the import -> insight engine loop.
// -----------------------------------------------------------------------------

interface ApplyImportPlanArgs {
  importRunId: string;
  teamId: string;
  coachId: string;
  userId: string;
  sourceId: string;
  sourceLabel: string;
  sourceTag: string;
  policy: ResolvedSourcePolicy;
  statType: 'practice' | 'game' | 'other';
  sessionDate: string;
  sessionName: string | null;
  fileName: string;
  headers: string[];
  mapping: BaseballImportColumnMapping;
  rows: CSVRow[];
  matches: BaseballImportRowMatch[];
  /** The validation report for THIS payload, so warnings can be surfaced into
   * the Import Dossier as signals after the commit succeeds. Optional so the
   * review-approval path (which re-validates) can omit it without breaking. */
  validation?: ImportValidationReport;
  /** ISSUE #379 — see CommitImportArgs.dataShape. Optional; undefined/'event_log'
   * both fall back to the legacy-only write (never a hard failure). */
  dataShape?: 'season_totals' | 'game_box_score' | 'event_log';
}

/** A single row's resolved write intent — hoisted to module scope so the
 * canonical-table routing helpers below (applyGameBoxScoreImport,
 * upsertSeasonTotalsImport) can share the same shape applyImportPlan builds. */
type StatWrite = {
  rowIndex: number;
  playerId: string;
  /** The coach's EXPLICIT per-row intent from the wizard (honored below — a
   * 'create' that collides is rejected, not silently turned into an update). */
  action: 'create' | 'update';
  externalId: string | null;
  values: Record<string, number | null>;
  /** Carried from the row's match so the chosen resolution + confidence are
   * stamped on the committed stat row (player_matching_v2.md). */
  matchConfidence: number;
  matchTier: BaseballImportRowMatch['matchTier'];
};

/**
 * REPAIR ROUND — before-state snapshot of a `game_box_score` import's
 * canonical write, persisted alongside the legacy `snapshot` array so
 * `rollbackImport` can reverse `baseball_box_score_batting`/`_pitching` (and
 * the game's own score/status) to their exact pre-import state, the same
 * before/after contract already kept for `baseball_player_stats`.
 */
type GameBoxScoreSnapshot = {
  gameId: string;
  /** True when `findOrCreateImportGame` itself created this game — rollback
   * deletes it (cascading its box-score rows) rather than leaving a
   * scoreless phantom game behind, the exact inverse of a create. */
  gameCreatedByImport: boolean;
  /** The game's own status/scores immediately before this import's write —
   * `save_baseball_full_box_score` always overwrites both scores and flips
   * status to 'completed', so a non-completed pre-import status must be
   * restored explicitly. */
  beforeStatus: string | null;
  beforeOurScore: number | null;
  beforeOpponentScore: number | null;
  /** The FULL batting/pitching rows that existed for this game before this
   * import touched it (both sides) — i.e. the exact end-state a rollback
   * must restore via the same atomic RPC the write side uses. */
  beforeBatting: BoxScoreBattingInput[];
  beforePitching: BoxScorePitchingInput[];
};

/**
 * REPAIR ROUND — one row's before-state for a `season_totals` import's
 * upsert into `baseball_player_season_stats`, so rollback can restore (or,
 * if this run created the row, delete) each affected player's line.
 */
type SeasonTotalsSnapshotEntry = {
  /** The row's own id post-upsert (created or pre-existing) — rollback keys
   * off this directly rather than the (player_id, team_id, season_year)
   * natural key. Null only if the upsert didn't return a row for this write. */
  rowId: string | null;
  playerId: string;
  seasonYear: number;
  /** Full pre-import row, or null when this run CREATED the row (no prior
   * season-stats line existed for this player + year). */
  before: (Record<string, unknown> & { id: string }) | null;
};

async function applyImportPlan(
  db: LooseClient,
  a: ApplyImportPlanArgs
): Promise<{
  created: number;
  updated: number;
  duplicatesSkipped: number;
  createConflicts: number;
  updateFellBackToInsert: number;
}> {
  const {
    importRunId, teamId, coachId, userId, sourceId, sourceLabel, sourceTag,
    policy, statType, sessionDate, sessionName, fileName, headers, mapping, rows, matches,
    validation, dataShape,
  } = a;

  // Resolve the rows we will actually write (matched + not skipped).
  const actionable = matches.filter(
    (m) => m.playerId && m.action !== 'skip' && rows[m.rowIndex]
  );

  // The external-id column (when the source carries one) — resolved once so each
  // write can stamp its row's external id onto the committed stat (the stable
  // identity duplicate detection keys on across re-imports).
  const extIdColForWrite = findExternalIdColumn(headers);

  const writes: StatWrite[] = actionable.map((m) => ({
    rowIndex: m.rowIndex,
    playerId: m.playerId as string,
    action: m.action === 'create' ? 'create' : 'update',
    externalId: extIdColForWrite
      ? (rows[m.rowIndex]?.[extIdColForWrite] ?? '').trim() || null
      : null,
    values: normalizeStatRow(rows[m.rowIndex] as CSVRow, mapping),
    matchConfidence: m.confidence,
    matchTier: m.matchTier,
  }));

  const snapshot: BaseballImportRowSnapshot[] = [];
  let createdCount = 0;
  let updatedCount = 0;
  let duplicatesSkipped = 0;
  // Rows the coach marked 'Create' that collided with an existing record — we do
  // NOT silently overwrite (the gap's "reject a 'Create' that collides"); they are
  // withheld and reported so the coach can roll back the owning run or switch the
  // row to Update. These are distinct from dedupe-policy duplicate skips.
  let createConflicts = 0;
  // Rows the coach marked 'Update' with no existing target — there is nothing to
  // overwrite, so we INSERT the wanted data and count it honestly (the gap's
  // "warn on an 'Update' with no existing target").
  let updateFellBackToInsert = 0;
  // REPAIR ROUND — the SAME-shaped subset of `writes` that actually survives
  // the dedupe-duplicate-skip and create-conflict-reject checks below. This,
  // NOT the raw `writes` array, is what the canonical-table routing further
  // down is allowed to see: a row the checks below withhold from
  // baseball_player_stats must never still land in
  // baseball_box_score_batting/_pitching or baseball_player_season_stats.
  const canonicalWrites: StatWrite[] = [];

  type TouchedPlayer = { playerId: string; created: number; updated: number };
  const touchedByPlayer = new Map<string, TouchedPlayer>();
  const bumpTouched = (playerId: string, kind: 'create' | 'update') => {
    const t = touchedByPlayer.get(playerId) ?? { playerId, created: 0, updated: 0 };
    if (kind === 'create') t.created += 1;
    else t.updated += 1;
    touchedByPlayer.set(playerId, t);
  };
  const confidenceByPlayer = new Map<string, number>();
  for (const m of actionable) {
    const pid = m.playerId as string;
    const prev = confidenceByPlayer.get(pid);
    confidenceByPlayer.set(pid, prev == null ? m.confidence : Math.min(prev, m.confidence));
  }

  for (const w of writes) {
    // Look for an existing stat row for this player + session (idempotency key).
    const { data: existing } = await db
      .from('baseball_player_stats')
      .select('*')
      .eq('player_id', w.playerId)
      .eq('team_id', teamId)
      .eq('session_date', sessionDate)
      .eq('stat_type', statType)
      .maybeSingle();

    // DEDUPE PASS driven by the registered source's dedupe_strictness.
    if (existing) {
      const existingRow0 = existing as { id: string; source: string | null };
      const dup = detectDuplicate(
        { playerId: w.playerId, incomingSource: sourceTag },
        [{ statId: existingRow0.id, playerId: w.playerId, source: existingRow0.source }],
        policy.dedupeStrictness
      );
      if (dup.duplicate) {
        // Do NOT overwrite the existing row; record it as a duplicate skip so the
        // result is honest and the coach can roll back the owning run first.
        duplicatesSkipped++;
        continue;
      }
    }

    // HONOR THE COACH'S EXPLICIT CREATE/UPDATE INTENT. Before this, the labels were
    // cosmetic — the actual create-vs-update was decided solely by `if (existing)`,
    // so a 'Create' silently became an update if a row existed, and an 'Update'
    // silently became an insert if none did. Now the per-row action is load-bearing:
    //   * action 'create' + an existing row -> REJECT (the coach asked to create a
    //     NEW line but one already exists; silently overwriting it would lose data).
    //     Withhold + count it; the coach rolls back the owner or switches to Update.
    //   * action 'update' + no existing row -> there is nothing to overwrite; INSERT
    //     the wanted data and count the fallback honestly.
    if (w.action === 'create' && existing) {
      createConflicts++;
      continue;
    }
    if (w.action === 'update' && !existing) {
      updateFellBackToInsert++;
    }

    // This row survived both withholding checks above — it is one of the rows
    // about to actually be written to baseball_player_stats below, so (and
    // only so) it is also eligible for the canonical-table routing.
    canonicalWrites.push(w);

    const baseRow = {
      player_id: w.playerId,
      team_id: teamId,
      coach_id: coachId,
      stat_type: statType,
      session_date: sessionDate,
      session_name: sessionName,
      source: sourceTag,
      // STAMP the external row/event id (when present) so this committed line's
      // STABLE identity (external id + player + grain) survives a future re-import
      // of the same file (duplicate_resolution_v2.md).
      source_external_id: w.externalId,
      // STAMP the registered source's trust + visibility onto the committed row
      // so downstream Source-Trust surfaces + player-visibility honor it.
      source_trust_level: policy.trustLevel,
      source_visibility: policy.defaultVisibility,
      // STAMP the chosen player-match resolution + confidence (player_matching_v2.md
      // "store match confidence and chosen resolution") so an auditor can see HOW
      // each row resolved (e.g. fuzzy vs. deterministic) at the stat-row grain.
      source_match_confidence: w.matchConfidence,
      source_match_tier: w.matchTier,
      ...w.values,
    };

    if (existing) {
      const existingRow = existing as { id: string } & Record<string, unknown>;
      snapshot.push({
        statId: existingRow.id,
        playerId: w.playerId,
        action: 'update',
        before: existingRow as unknown as BaseballImportRowSnapshot['before'],
        after: baseRow as unknown as BaseballImportRowSnapshot['after'],
      });
      const { error: upErr } = await db
        .from('baseball_player_stats')
        .update(baseRow)
        .eq('id', existingRow.id);
      if (!upErr) {
        updatedCount++;
        bumpTouched(w.playerId, 'update');
      }
    } else {
      const { data: inserted, error: insErr } = await db
        .from('baseball_player_stats')
        .insert(baseRow)
        .select('id')
        .single();
      if (!insErr && inserted) {
        const newId = (inserted as { id: string }).id;
        snapshot.push({
          statId: newId,
          playerId: w.playerId,
          action: 'create',
          before: null,
          after: baseRow as unknown as BaseballImportRowSnapshot['after'],
        });
        createdCount++;
        bumpTouched(w.playerId, 'create');
      }
    }
  }

  // ISSUE #379 — ALSO write to the canonical table Stats Center actually reads
  // (baseball_player_stats above is kept as-is so My Stats' raw session list,
  // rollback, external-id matching, timeline events, and signals all keep
  // working unchanged). REPAIR ROUND: this MUST use `canonicalWrites`, not the
  // raw `writes` array — `writes` is every actionable row BEFORE the dedupe
  // and create-conflict checks above run, so it still includes rows the loop
  // just withheld from baseball_player_stats. Routing those into
  // baseball_box_score_batting/_pitching (which REPLACES every row for
  // players present in its payload) or baseball_player_season_stats would
  // defeat the exact "reject a colliding Create" / "don't overwrite" guards
  // this loop just enforced. Both helpers are best-effort and never throw: a
  // failure here never undoes or blocks the legacy write above.
  let boxScoreSnapshot: GameBoxScoreSnapshot | null = null;
  let seasonTotalsSnapshot: SeasonTotalsSnapshotEntry[] = [];
  if (dataShape === 'game_box_score') {
    boxScoreSnapshot = await applyGameBoxScoreImport(db, {
      teamId, sessionDate, sessionName, writes: canonicalWrites, headers, rows,
    });
  } else if (dataShape === 'season_totals') {
    seasonTotalsSnapshot = await upsertSeasonTotalsImport(db, {
      teamId, sessionDate, writes: canonicalWrites,
    });
  }

  // Persist external-id mappings for deterministic future matching, scoped to
  // the registered namespace when configured (read + write must agree on key).
  const nameCol = resolveNameColumn(headers, mapping);
  if (nameCol) {
    const extIdCol =
      headers.find((h) => /(^|_)(player_?id|athlete_?id|external_?id)$/.test(h)) ?? null;
    if (extIdCol) {
      const extIdKey = policy.externalIdNamespace?.trim() || sourceId;
      const extRows = actionable
        .map((m) => {
          const raw = (rows[m.rowIndex]?.[extIdCol] ?? '').trim();
          if (!raw) return null;
          return {
            team_id: teamId,
            player_id: m.playerId as string,
            source_id: extIdKey,
            external_id: raw,
            confidence: m.confidence,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);
      if (extRows.length > 0) {
        // Team-scoped unique key per the data contract (v2_data_contracts_expanded.md:37):
        // the same vendor external id can map to a player on each team, so the
        // conflict target must include team_id.
        await db
          .from('baseball_player_external_ids')
          .upsert(extRows, { onConflict: 'team_id,source_id,external_id' });
      }
    }
  }

  // Write/refresh the lineage row (mapping + rollback snapshot) for this run. A
  // held run already has a staged lineage row; upsert by import_run_id replaces
  // its staged plan with the real applied snapshot (non-destructive, keyed).
  const summary = summarizeMatches(matches);
  const unmatchedNames = matches
    .filter((m) => !m.playerId || m.action === 'skip')
    .map((m) => m.sourceName)
    .filter(Boolean);

  await db
    .from('baseball_stat_uploads')
    .upsert(
      {
        team_id: teamId,
        coach_id: coachId,
        filename: fileName,
        stat_type: statType,
        session_date: sessionDate,
        session_name: sessionName,
        total_rows: rows.length,
        matched_rows: summary.matched,
        unmatched_rows: summary.unmatched,
        unmatched_data: {
          unmatchedNames,
          snapshot,
          // Persist the honored-action outcomes so the run audit records WHY a
          // coach's 'Create' was withheld / an 'Update' became an insert.
          createConflicts,
          updateFellBackToInsert,
          // REPAIR ROUND — carried so rollbackImport can also reverse the
          // canonical-table write this run made (Stats Center's actual read
          // model), not just the legacy baseball_player_stats rows above.
          dataShape: dataShape ?? null,
          canonicalSnapshot:
            dataShape === 'game_box_score'
              ? boxScoreSnapshot
              : dataShape === 'season_totals'
                ? seasonTotalsSnapshot
                : null,
        },
        status: 'completed',
        import_run_id: importRunId,
        source_id: sourceId,
        mapping_config: mapping,
      },
      { onConflict: 'import_run_id' }
    );

  // Finalize the run header.
  await db
    .from('baseball_import_runs')
    .update({
      status: 'committed',
      matched_rows: summary.matched,
      unmatched_rows: summary.unmatched,
      committed_at: new Date().toISOString(),
    })
    .eq('id', importRunId);

  // CLOSE THE IMPORT -> TIMELINE LINK (one honest event per touched player).
  const touched = [...touchedByPlayer.values()];
  if (touched.length > 0) {
    await Promise.allSettled(
      touched.map((t) => {
        const lines = t.created + t.updated;
        const verb = t.created > 0 && t.updated === 0 ? 'Imported' : 'Updated';
        const statWord = lines === 1 ? 'stat line' : 'stat lines';
        const sessionLabel = sessionName?.trim() || sourceLabel;
        return appendImportTimelineEvent({
          teamId,
          playerId: t.playerId,
          title: `${verb} ${lines} ${statWord} from ${sourceLabel}`,
          body: `${sessionLabel} (${sessionDate}) — ${statType} stats imported from ${sourceLabel}.`,
          source: 'csv_import',
          sourceId: importRunId,
          confidence: confidenceByPlayer.get(t.playerId) ?? null,
          occurredAt: new Date().toISOString(),
          createdBy: userId,
        });
      }),
    );

    // Refresh baseball_player_aggregates (Command Center roster rows, My Stats
    // season-summary tiles) for every touched player — previously these stayed
    // stale after an Import Center commit since nothing here called this.
    // recalculatePlayerAggregates never throws (it returns {success:false} on
    // failure), so no try/catch is needed to keep this best-effort.
    await Promise.allSettled(
      touched.map((t) => recalculatePlayerAggregates(t.playerId, teamId)),
    );
  }

  // IMPORT VALIDATION -> SIGNAL: surface each WARNING into the Import Dossier as
  // triage work (the spec's "import validation" generation source). Best-effort
  // — the data is already committed; a signal write failure never fails import.
  if (validation && validation.hasWarnings) {
    try {
      await emitImportWarningSignals(db, {
        teamId,
        importRunId,
        userId,
        sourceId,
        sourceLabel,
        validation,
      });
      revalidatePath('/baseball/dashboard/signals');
      revalidatePath('/baseball/dashboard/command-center');
    } catch {
      // Non-fatal: import committed; warnings still live in the run's report.
    }
  }

  revalidatePath('/baseball/dashboard/import');
  revalidatePath('/baseball/dashboard/stats-center');

  // AUTOMATIC IMPORT -> INSIGHT LOOP. Swallow engine failures (data is saved).
  if (createdCount + updatedCount > 0) {
    try {
      await runBaseballEngine();
    } catch {
      // Non-fatal: import already committed; coach can re-run the Daily Brief.
    }
  } else {
    revalidatePath('/baseball/dashboard/command-center');
  }

  return {
    created: createdCount,
    updated: updatedCount,
    duplicatesSkipped,
    createConflicts,
    updateFellBackToInsert,
  };
}

// -----------------------------------------------------------------------------
// ISSUE #379 — canonical-table routing helpers for applyImportPlan.
//
// Row-level fields that only exist on one side of the box score (e.g.
// doubles/triples/home_runs/rbis for batting; innings_pitched/earned_runs/
// home_runs_allowed for pitching) discriminate whether a given imported row
// contributes a batting line, a pitching line, or both (a two-way player).
// 'walks' and 'strikeouts' are the importer's ONE shared canonical field for
// both sides (HEADER_MAPPINGS has no separate bb_allowed/k_thrown alias) — a
// two-way player's row stamps the same captured number onto both sides. This
// is a pre-existing limit of the CSV column-mapping vocabulary (also visible
// in DATA_SHAPE_META's own column templates), not something introduced here.
// -----------------------------------------------------------------------------

const BATTING_ONLY_FIELDS = [
  'doubles', 'triples', 'home_runs', 'rbis', 'stolen_bases', 'caught_stealing',
  'hit_by_pitch', 'sacrifice_bunts', 'sacrifice_flies', 'left_on_base', 'batting_order',
] as const;
const PITCHING_ONLY_FIELDS = [
  'innings_pitched', 'hits_allowed', 'runs_allowed', 'earned_runs',
  'home_runs_allowed', 'pitch_count',
] as const;
const VALID_PITCHING_RESULTS: readonly BaseballPitchingResult[] = ['W', 'L', 'S', 'H', 'BS', 'ND'];

function hasAny(values: Record<string, number | null>, fields: readonly string[]): boolean {
  return fields.some((f) => values[f] != null);
}

/**
 * Find an existing game for this exact (team, date, opponent), or create one
 * via games.ts's `createGame` — reused rather than a raw insert so game
 * creation stays gated by `can_manage_stats`, the SAME capability the manual
 * Games UI requires, distinct from this action's own `can_manage_imports`
 * gate. `createGame` never throws (it catches internally and returns
 * `{success:false}`), so a coach who can import but not manage games simply
 * degrades to the pre-existing legacy-only write rather than a hard failure.
 */
async function findOrCreateImportGame(
  db: LooseClient,
  args: { teamId: string; gameDate: string; opponentName: string | null },
): Promise<{ gameId: string; wasCreated: boolean } | null> {
  const { teamId, gameDate, opponentName } = args;
  let query = db
    .from('baseball_games')
    .select('id')
    .eq('team_id', teamId)
    .eq('game_date', gameDate);
  query = opponentName ? query.eq('opponent_name', opponentName) : query.is('opponent_name', null);
  const { data: existing } = await query.limit(1).maybeSingle();
  if (existing) return { gameId: (existing as { id: string }).id, wasCreated: false };

  const created = await createGame(teamId, {
    game_date: gameDate,
    game_type: 'game',
    opponent_name: opponentName,
  });
  return created.success && created.data ? { gameId: created.data.id, wasCreated: true } : null;
}

/**
 * ISSUE #379 — routes a 'game_box_score' import to the SAME atomic
 * save_baseball_full_box_score RPC the manual box-score entry and per-game CSV
 * upload (games.ts) already use, instead of leaving the committed rows
 * invisible to Stats Center (which never reads baseball_player_stats).
 * Merges in any EXISTING box-score rows for players NOT touched by this
 * import (mirrors games.ts's saveCsvBoxScoreViaRpc) so a partial re-import —
 * e.g. batting lines now, pitching lines in a follow-up file — never wipes
 * the other side; the RPC replaces every row not present in its payload.
 * Best-effort: never throws. baseball_player_stats (written above, unchanged)
 * remains the write of record if this fails for any reason.
 * Returns a `GameBoxScoreSnapshot` of the pre-import state (or null if
 * nothing was written) so `rollbackImport` can reverse this write later.
 */
async function applyGameBoxScoreImport(
  db: LooseClient,
  args: {
    teamId: string;
    sessionDate: string;
    sessionName: string | null;
    writes: StatWrite[];
    headers: string[];
    rows: CSVRow[];
  },
): Promise<GameBoxScoreSnapshot | null> {
  try {
    const { teamId, sessionDate, sessionName, writes, headers, rows } = args;
    if (writes.length === 0) return null;

    const resultCol = findColumnMapping(headers, 'result');
    const battingRows: BoxScoreBattingInput[] = [];
    const pitchingRows: BoxScorePitchingInput[] = [];

    for (const w of writes) {
      const v = w.values;
      if (v.at_bats != null || hasAny(v, BATTING_ONLY_FIELDS)) {
        battingRows.push({
          player_id: w.playerId,
          batting_order: v.batting_order ?? undefined,
          ab: v.at_bats ?? 0,
          r: v.runs ?? 0,
          h: v.hits ?? 0,
          doubles: v.doubles ?? 0,
          triples: v.triples ?? 0,
          hr: v.home_runs ?? 0,
          rbi: v.rbis ?? 0,
          bb: v.walks ?? 0,
          k: v.strikeouts ?? 0,
          sb: v.stolen_bases ?? 0,
          cs: v.caught_stealing ?? 0,
          hbp: v.hit_by_pitch ?? 0,
          sac: v.sacrifice_bunts ?? 0,
          sf: v.sacrifice_flies ?? 0,
          lob: v.left_on_base ?? 0,
        });
      }
      if (hasAny(v, PITCHING_ONLY_FIELDS)) {
        const rawResult = resultCol ? (rows[w.rowIndex]?.[resultCol] ?? '').toUpperCase() : '';
        const result = (VALID_PITCHING_RESULTS as readonly string[]).includes(rawResult)
          ? (rawResult as BaseballPitchingResult)
          : undefined;
        pitchingRows.push({
          player_id: w.playerId,
          ip: v.innings_pitched ?? 0,
          h: v.hits_allowed ?? 0,
          r: v.runs_allowed ?? 0,
          er: v.earned_runs ?? 0,
          bb: v.walks ?? 0,
          k: v.strikeouts ?? 0,
          hr: v.home_runs_allowed ?? 0,
          pitch_count: v.pitch_count ?? undefined,
          result,
        });
      }
    }

    if (battingRows.length === 0 && pitchingRows.length === 0) return null;

    const gameResult = await findOrCreateImportGame(db, {
      teamId,
      gameDate: sessionDate,
      opponentName: sessionName?.trim() || null,
    });
    if (!gameResult) return null;
    const { gameId, wasCreated } = gameResult;

    // REPAIR ROUND — snapshot the game's own score/status columns before this
    // import overwrites them (save_baseball_full_box_score always flips
    // status to 'completed' and sets both scores), so rollback can restore
    // them exactly.
    const { data: gameRow } = await db
      .from('baseball_games')
      .select('status, our_score, opponent_score')
      .eq('id', gameId)
      .maybeSingle();
    const beforeGame = gameRow as
      | { status: string | null; our_score: number | null; opponent_score: number | null }
      | null;

    // Preserve any player NOT touched by THIS import on either side so a
    // partial re-import never silently deletes the other side's rows.
    const touchedBattingIds = new Set(battingRows.map((b) => b.player_id));
    const touchedPitchingIds = new Set(pitchingRows.map((p) => p.player_id));
    const [{ data: existingBatting }, { data: existingPitching }] = await Promise.all([
      db.from('baseball_box_score_batting').select('*').eq('game_id', gameId),
      db.from('baseball_box_score_pitching').select('*').eq('game_id', gameId),
    ]);
    // REPAIR ROUND — the FULL pre-import box score for this game (both
    // sides), captured before the merge-in below mutates battingRows/
    // pitchingRows — this is the exact end-state a rollback must restore.
    const beforeBatting = ((existingBatting ?? []) as BaseballBoxScoreBatting[]).map(mapBattingToInput);
    const beforePitching = ((existingPitching ?? []) as BaseballBoxScorePitching[]).map(mapPitchingToInput);
    for (const row of (existingBatting ?? []) as BaseballBoxScoreBatting[]) {
      if (!touchedBattingIds.has(row.player_id)) battingRows.push(mapBattingToInput(row));
    }
    for (const row of (existingPitching ?? []) as BaseballBoxScorePitching[]) {
      if (!touchedPitchingIds.has(row.player_id)) pitchingRows.push(mapPitchingToInput(row));
    }

    const ourScore = battingRows.reduce((sum, b) => sum + (b.r ?? 0), 0);
    const opponentScore = pitchingRows.reduce((sum, p) => sum + (p.r ?? 0), 0);

    // saveFullBoxScore computes rates + calls save_baseball_full_box_score +
    // recalculates season stats internally (never throws — returns a result).
    await saveFullBoxScore(gameId, battingRows, pitchingRows, ourScore, opponentScore);

    return {
      gameId,
      gameCreatedByImport: wasCreated,
      beforeStatus: beforeGame?.status ?? null,
      beforeOurScore: beforeGame?.our_score ?? null,
      beforeOpponentScore: beforeGame?.opponent_score ?? null,
      beforeBatting,
      beforePitching,
    };
  } catch {
    // Non-fatal: baseball_player_stats already holds this import's data.
    return null;
  }
}

/**
 * ISSUE #379 — upserts a 'season_totals' import into the canonical
 * baseball_player_season_stats row Stats Center actually reads, keyed by the
 * table's (player_id, team_id, season_year) unique constraint. `sessionDate`
 * carries the season YEAR for this shape (the wizard's Step 2 swaps its
 * date input for a year number input when 'season_totals' is chosen).
 *
 * NOTE: baseball_player_season_stats is also the sole write target of
 * recalculate_baseball_season_stats(), which FULLY recomputes every column
 * from box-score rows whenever any game for this player+season is saved
 * afterward. Once real per-game box scores exist for the season, they become
 * authoritative and supersede this bulk-imported baseline — the same
 * "derived data wins" behavior the season-stats cache already has everywhere
 * else, not a regression introduced here.
 *
 * Best-effort: never throws. baseball_player_stats (written above, unchanged)
 * remains the write of record if this fails for any reason.
 * Returns a `SeasonTotalsSnapshotEntry[]` of the pre-import state for every
 * touched row (or `[]` if nothing was written) so `rollbackImport` can
 * reverse this upsert later.
 */
async function upsertSeasonTotalsImport(
  db: LooseClient,
  args: { teamId: string; sessionDate: string; writes: StatWrite[] },
): Promise<SeasonTotalsSnapshotEntry[]> {
  try {
    const { teamId, sessionDate, writes } = args;
    if (writes.length === 0) return [];

    const seasonYear = parseInt(sessionDate, 10);
    if (!Number.isFinite(seasonYear)) return [];

    // REPAIR ROUND — snapshot the pre-import row (if any) for every touched
    // player, keyed by the table's own unique constraint, so rollback can
    // restore (or delete, if this run created it) each affected line.
    const playerIds = [...new Set(writes.map((w) => w.playerId))];
    const { data: existingRows } = await db
      .from('baseball_player_season_stats')
      .select('*')
      .eq('team_id', teamId)
      .eq('season_year', seasonYear)
      .in('player_id', playerIds);
    const beforeByPlayer = new Map(
      ((existingRows ?? []) as Array<{ id: string; player_id: string } & Record<string, unknown>>).map(
        (r) => [r.player_id, r]
      )
    );

    const round = (n: number, digits: number) => parseFloat(n.toFixed(digits));

    const rows = writes.map((w) => {
      const v = w.values;
      const ab = v.at_bats ?? 0;
      const h = v.hits ?? 0;
      const doubles = v.doubles ?? 0;
      const triples = v.triples ?? 0;
      const hr = v.home_runs ?? 0;
      const bb = v.walks ?? 0;
      const hbp = v.hit_by_pitch ?? 0;
      const sf = v.sacrifice_flies ?? 0;
      const ip = v.innings_pitched ?? 0;
      const er = v.earned_runs ?? 0;
      const hAllowed = v.hits_allowed ?? 0;
      // 'walks'/'strikeouts' are the importer's ONE shared canonical field for
      // both batting and pitching (see the file-level note above) — the same
      // captured number stamps bb/bb_allowed and k/k_thrown for a two-way row.
      const bbAllowed = v.walks ?? 0;
      const kThrown = v.strikeouts ?? 0;

      const avg = ab > 0 ? round(h / ab, 3) : null;
      const singles = h - doubles - triples - hr;
      const slg = ab > 0 ? round((singles + 2 * doubles + 3 * triples + 4 * hr) / ab, 3) : null;
      const pa = ab + bb + hbp + sf;
      const obp = pa > 0 ? round((h + bb + hbp) / pa, 3) : null;
      const ops = obp != null && slg != null ? round(obp + slg, 3) : null;
      const era = ip > 0 ? round((9 * er) / ip, 2) : null;
      const whip = ip > 0 ? round((bbAllowed + hAllowed) / ip, 3) : null;
      const k9 = ip > 0 ? round((9 * kThrown) / ip, 2) : null;
      const bb9 = ip > 0 ? round((9 * bbAllowed) / ip, 2) : null;

      return {
        player_id: w.playerId,
        team_id: teamId,
        season_year: seasonYear,
        ab, r: v.runs ?? 0, h, doubles, triples, hr,
        rbi: v.rbis ?? 0, bb, k: v.strikeouts ?? 0,
        sb: v.stolen_bases ?? 0, cs: v.caught_stealing ?? 0,
        hbp, sac: v.sacrifice_bunts ?? 0, sf,
        avg, obp, slg, ops,
        ip, h_allowed: hAllowed, r_allowed: v.runs_allowed ?? 0, er,
        bb_allowed: bbAllowed, k_thrown: kThrown, hr_allowed: v.home_runs_allowed ?? 0,
        era, whip, k9, bb9,
        last_updated: new Date().toISOString(),
      };
    });

    const { data: upserted } = await db
      .from('baseball_player_season_stats')
      .upsert(rows, { onConflict: 'player_id,team_id,season_year' })
      .select('id, player_id');
    const idByPlayer = new Map(
      ((upserted ?? []) as Array<{ id: string; player_id: string }>).map((r) => [r.player_id, r.id])
    );

    return writes.map((w) => ({
      rowId: idByPlayer.get(w.playerId) ?? null,
      playerId: w.playerId,
      seasonYear,
      before: (beforeByPlayer.get(w.playerId) as (Record<string, unknown> & { id: string }) | undefined) ?? null,
    }));
  } catch {
    // Non-fatal: baseball_player_stats already holds this import's data.
    return [];
  }
}

/**
 * REPAIR ROUND — reverses a `game_box_score` import's canonical write
 * (mirrors applyGameBoxScoreImport). Best-effort: never throws — the same
 * "canonical routing is best-effort" contract the write side established;
 * a failure here never blocks reverting the legacy baseball_player_stats
 * rows or marking the run rolled_back.
 */
async function revertGameBoxScoreImport(
  db: LooseClient,
  snap: GameBoxScoreSnapshot,
): Promise<void> {
  try {
    if (snap.gameCreatedByImport) {
      // This game exists ONLY because this import created it — deleting it
      // is the exact inverse of that create. ON DELETE CASCADE on
      // baseball_box_score_batting/_pitching.game_id removes this run's
      // box-score rows as part of the same delete.
      await db.from('baseball_games').delete().eq('id', snap.gameId);
      return;
    }

    // Restore the box score to its pre-import state via the SAME atomic RPC
    // the write side uses — this also re-recalculates season stats for every
    // affected player off the restored rows (the "derived data wins"
    // recalculation already documented on upsertSeasonTotalsImport).
    await saveFullBoxScore(
      snap.gameId,
      snap.beforeBatting,
      snap.beforePitching,
      snap.beforeOurScore ?? 0,
      snap.beforeOpponentScore ?? 0,
    );
    // save_baseball_full_box_score always flips status to 'completed' — put
    // a non-'completed' pre-import status back explicitly.
    if (snap.beforeStatus && snap.beforeStatus !== 'completed') {
      await db
        .from('baseball_games')
        .update({ status: snap.beforeStatus })
        .eq('id', snap.gameId);
    }
  } catch {
    // Non-fatal: the legacy baseball_player_stats rows are still reverted
    // below; the canonical box score may retain this import's numbers until
    // retried.
  }
}

/**
 * REPAIR ROUND — reverses a `season_totals` import's canonical upsert into
 * baseball_player_season_stats. Same best-effort contract as
 * revertGameBoxScoreImport.
 */
async function revertSeasonTotalsImport(
  db: LooseClient,
  entries: SeasonTotalsSnapshotEntry[],
): Promise<void> {
  try {
    for (const entry of entries) {
      if (!entry.rowId) continue;
      if (entry.before) {
        // Restore the pre-import values (stage-and-swap via a targeted update).
        const { id: _id, ...restoreCols } = entry.before;
        void _id;
        await db
          .from('baseball_player_season_stats')
          .update(restoreCols)
          .eq('id', entry.rowId);
      } else {
        // This run CREATED the row (no prior season-stats line existed) —
        // remove exactly the row it created. NOT delete-then-reinsert; the
        // single inverse of the insert.
        await db
          .from('baseball_player_season_stats')
          .delete()
          .eq('id', entry.rowId);
      }
    }
  } catch {
    // Non-fatal: see revertGameBoxScoreImport.
  }
}

// -----------------------------------------------------------------------------
// rollbackImport — reverse ONLY this run's records via the stored snapshot
// -----------------------------------------------------------------------------

export const rollbackImport = withBaseballAction(
  'rollbackImport',
  {
    featureArea: 'baseball-import',
    requiredCapability: 'can_manage_imports',
    teamFrom: (a: { teamId: string; importRunId: string }) => a.teamId,
  },
  async (
    _ctx,
    args: { teamId: string; importRunId: string }
  ): Promise<{ reverted: number; restored: number }> => {
    const supabase = await createClient();
    const db = supabase as unknown as LooseClient;
    const { teamId, importRunId } = args;

    // Load the run header (RLS guarantees it is this staff member's team).
    const { data: run } = await db
      .from('baseball_import_runs')
      .select('id, team_id, status')
      .eq('id', importRunId)
      .eq('team_id', teamId)
      .maybeSingle();

    if (!run) throw new Error('Import run not found.');
    if ((run as { status: string }).status === 'rolled_back') {
      return { reverted: 0, restored: 0 };
    }

    // Load the lineage row carrying the before/after snapshot for this run.
    const { data: lineage } = await db
      .from('baseball_stat_uploads')
      .select('id, unmatched_data')
      .eq('import_run_id', importRunId)
      .eq('team_id', teamId)
      .maybeSingle();

    const lineageData =
      (lineage as { unmatched_data?: Record<string, unknown> } | null)?.unmatched_data ?? null;

    // EVENT-GRAIN GUARD — an event-level run's committed lineage row (stat-
    // event-imports.ts) stores `{ grain_counts, validation }`, with NO
    // `snapshot` KEY AT ALL (not just an empty array). Silently treating that
    // as "zero rows to revert" would report `0 removed · 0 restored` as a
    // false success and still mark the run 'rolled_back' below, permanently
    // hiding the Roll-back control while the event rows still fully exist.
    // getImportRuns already excludes event-grain runs from this wizard's list;
    // this is defense-in-depth for a stale client / direct call.
    if (lineageData && !('snapshot' in lineageData)) {
      throw new Error(
        'This run has no box-score rollback snapshot (it looks like an event-level import) and cannot be rolled back from here.'
      );
    }

    const snapshot: BaseballImportRowSnapshot[] =
      (lineageData?.snapshot as BaseballImportRowSnapshot[] | undefined) ?? [];

    // REPAIR ROUND — carried by applyImportPlan (commit-time) so this run's
    // canonical-table write (Stats Center's actual read model) can also be
    // reversed, not just the legacy baseball_player_stats rows below. Absent
    // on a run committed before this field existed — degrades to a
    // legacy-only revert, same as every other optional field in this file.
    const dataShape = lineageData?.dataShape as
      | 'season_totals'
      | 'game_box_score'
      | 'event_log'
      | null
      | undefined;
    const canonicalSnapshot = lineageData?.canonicalSnapshot;

    let reverted = 0; // created rows removed
    let restored = 0; // updated rows put back to before-state

    const affectedPlayers = new Set<string>();

    for (const snap of snapshot) {
      affectedPlayers.add(snap.playerId);
      if (snap.action === 'create') {
        // Reverse of a CREATE = remove exactly the row this run created. This is
        // NOT delete-then-reinsert; it is the single inverse of the insert.
        const { error } = await db
          .from('baseball_player_stats')
          .delete()
          .eq('id', snap.statId);
        if (!error) reverted++;
      } else if (snap.action === 'update' && snap.before) {
        // Restore the pre-import values (stage-and-swap via a targeted update).
        const before = snap.before as Record<string, unknown>;
        // Strip immutable / server-managed keys before writing back.
        const { id: _id, created_at: _c, updated_at: _u, ...restoreCols } = before;
        void _id;
        void _c;
        void _u;
        const { error } = await db
          .from('baseball_player_stats')
          .update(restoreCols)
          .eq('id', snap.statId);
        if (!error) restored++;
      }
    }

    // REPAIR ROUND — also reverse the canonical-table write this run made, so
    // Stats Center (which reads box-score/season-stats, never
    // baseball_player_stats) reflects the roll-back too, not just the legacy
    // numbers above.
    if (dataShape === 'game_box_score' && canonicalSnapshot) {
      await revertGameBoxScoreImport(db, canonicalSnapshot as GameBoxScoreSnapshot);
    } else if (dataShape === 'season_totals' && Array.isArray(canonicalSnapshot)) {
      await revertSeasonTotalsImport(db, canonicalSnapshot as SeasonTotalsSnapshotEntry[]);
    }

    // Mark the run + lineage row rolled back (status only; we keep the audit).
    await db
      .from('baseball_import_runs')
      .update({
        status: 'rolled_back',
        rolled_back_at: new Date().toISOString(),
      })
      .eq('id', importRunId);

    if (lineage) {
      await db
        .from('baseball_stat_uploads')
        .update({ status: 'failed' })
        .eq('id', (lineage as { id: string }).id);
    }

    revalidatePath('/baseball/dashboard/import');
    revalidatePath('/baseball/dashboard/stats-center');
    revalidatePath('/baseball/dashboard/command-center');

    void affectedPlayers;
    return { reverted, restored };
  }
);

// -----------------------------------------------------------------------------
// getImportRuns — run history for the wizard's "recent imports" panel
// -----------------------------------------------------------------------------

export const getImportRuns = withBaseballAction(
  'getImportRuns',
  {
    featureArea: 'baseball-import',
    requiredCapability: 'can_manage_imports',
    teamFrom: (a: { teamId: string; limit?: number }) => a.teamId,
  },
  async (
    _ctx,
    args: { teamId: string; limit?: number }
  ): Promise<BaseballImportRunRow[]> => {
    const supabase = await createClient();
    const db = supabase as unknown as LooseClient;
    const limit = args.limit ?? 20;
    // Over-fetch a wider raw window before filtering out event-grain runs
    // below, so a run of consecutive event-level imports doesn't starve this
    // list down to fewer than `limit` box-score entries.
    const { data } = await db
      .from('baseball_import_runs')
      .select('*')
      .eq('team_id', args.teamId)
      .order('created_at', { ascending: false })
      .limit(limit * 3);
    const runs = (data ?? []) as unknown as BaseballImportRunRow[];
    if (runs.length === 0) return runs;

    // ISSUE #379 (2nd finding) — exclude EVENT-GRAIN runs (created by the
    // Event-level wizard / stat-event-imports.ts) from this box-score wizard's
    // "Recent imports" list. Their staged/committed lineage rows carry a
    // different shape (CanonicalEventRow[] rows; no `.matches`/`.snapshot`)
    // that this wizard's Approve/Reject/Roll-back buttons cannot safely act
    // on (see the hardened guards in reviewImportRun/rollbackImport below).
    // Discriminated by the SAME convention stat-event-imports.ts documents at
    // its own staging site: mapping_config.adapter present => event-grain.
    const runIds = runs.map((r) => r.id);
    const { data: lineageRows } = await db
      .from('baseball_stat_uploads')
      .select('import_run_id, mapping_config')
      .in('import_run_id', runIds);
    const eventRunIds = new Set(
      ((lineageRows ?? []) as Array<{
        import_run_id: string;
        mapping_config: { adapter?: string } | null;
      }>)
        .filter((r) => typeof r.mapping_config?.adapter === 'string')
        .map((r) => r.import_run_id),
    );
    return runs.filter((r) => !eventRunIds.has(r.id)).slice(0, limit);
  }
);

// -----------------------------------------------------------------------------
// getImportRunFileUrl — GAP 1: a short-lived signed download URL for a run's
//   preserved source file. The bucket is PRIVATE + RLS-scoped to the team, so a
//   signed URL is the only way to hand the coach the original file. Returns null
//   when no file was preserved (legacy run) or the run is not this team's.
// -----------------------------------------------------------------------------

export const getImportRunFileUrl = withBaseballAction(
  'getImportRunFileUrl',
  {
    featureArea: 'baseball-import',
    requiredCapability: 'can_manage_imports',
    teamFrom: (a: { teamId: string; importRunId: string }) => a.teamId,
  },
  async (
    _ctx,
    args: { teamId: string; importRunId: string }
  ): Promise<{ url: string | null; fileName: string | null }> => {
    const supabase = await createClient();
    const db = supabase as unknown as LooseClient;
    const { teamId, importRunId } = args;

    const { data: run } = await db
      .from('baseball_import_runs')
      .select('file_url, file_name')
      .eq('id', importRunId)
      .eq('team_id', teamId)
      .maybeSingle();
    if (!run) return { url: null, fileName: null };

    const row = run as { file_url: string | null; file_name: string | null };
    const url = await signImportRawFileUrl(supabase, row.file_url, 300);
    return { url, fileName: row.file_name };
  }
);

// -----------------------------------------------------------------------------
// reviewImportRun — approve/reject a run HELD by a source's required_review
//   This is what makes required_review load-bearing END-TO-END: a held run is
//   staged (no rows written); a reviewer here either APPROVES (applies the
//   staged plan through the same applyImportPlan core, with full trust/visibility
//   stamping + dedupe) or REJECTS (no rows ever written).
// -----------------------------------------------------------------------------

export const reviewImportRun = withBaseballAction(
  'reviewImportRun',
  {
    featureArea: 'baseball-import',
    requiredCapability: 'can_manage_imports',
    teamFrom: (a: { teamId: string; importRunId: string; decision: 'approve' | 'reject' }) =>
      a.teamId,
  },
  async (
    ctx,
    args: { teamId: string; importRunId: string; decision: 'approve' | 'reject' }
  ): Promise<{
    created: number;
    updated: number;
    duplicatesSkipped: number;
    createConflicts: number;
    updateFellBackToInsert: number;
    rejected: boolean;
  }> => {
    const supabase = await createClient();
    const db = supabase as unknown as LooseClient;
    const { teamId, importRunId, decision } = args;

    const coachId = ctx.activeCoachId;
    if (!coachId) throw new Error('No coach identity for import review.');

    // Load the held run (RLS scopes to the staff member's team).
    const { data: run } = await db
      .from('baseball_import_runs')
      .select('id, team_id, status, review_state, source_id, source_label, source_config_id')
      .eq('id', importRunId)
      .eq('team_id', teamId)
      .maybeSingle();

    if (!run) throw new Error('Import run not found.');
    const runRow = run as {
      review_state: string;
      source_id: string;
      source_label: string | null;
      source_config_id: string | null;
    };
    if (runRow.review_state !== 'pending_review') {
      // Idempotent: a run that is not awaiting review is a no-op (already decided).
      return {
        created: 0,
        updated: 0,
        duplicatesSkipped: 0,
        createConflicts: 0,
        updateFellBackToInsert: 0,
        rejected: false,
      };
    }

    const reviewedAt = new Date().toISOString();

    if (decision === 'reject') {
      await db
        .from('baseball_import_runs')
        .update({
          status: 'failed',
          review_state: 'rejected',
          reviewed_by: ctx.user.id,
          reviewed_at: reviewedAt,
        })
        .eq('id', importRunId);
      await db
        .from('baseball_stat_uploads')
        .update({ status: 'failed' })
        .eq('import_run_id', importRunId)
        .eq('team_id', teamId);
      revalidatePath('/baseball/dashboard/import');
      revalidatePath('/baseball/dashboard/command-center');
      return {
        created: 0,
        updated: 0,
        duplicatesSkipped: 0,
        createConflicts: 0,
        updateFellBackToInsert: 0,
        rejected: true,
      };
    }

    // APPROVE: load the staged plan from the lineage row and apply it.
    const { data: lineage } = await db
      .from('baseball_stat_uploads')
      .select(
        'id, filename, stat_type, session_date, session_name, mapping_config, unmatched_data'
      )
      .eq('import_run_id', importRunId)
      .eq('team_id', teamId)
      .maybeSingle();

    if (!lineage) throw new Error('Staged import plan not found for this run.');
    const staged = lineage as {
      filename: string | null;
      stat_type: 'practice' | 'game' | 'other';
      session_date: string;
      session_name: string | null;
      mapping_config: BaseballImportColumnMapping | null;
      unmatched_data: {
        staged?: boolean;
        matches?: BaseballImportRowMatch[];
        headers?: string[];
        rows?: CSVRow[];
        // ISSUE #379 — absent on a run staged before this field existed; falls
        // back to the legacy-only write, same as an omitted commit-time value.
        dataShape?: 'season_totals' | 'game_box_score' | 'event_log' | null;
      } | null;
    };

    // EVENT-GRAIN GUARD — an event-level run's staged lineage row (stat-event-
    // imports.ts) carries `rows: CanonicalEventRow[]` with NO `.matches` field
    // at all. Approving here would resolve `stagedMatches` to `[]`, run
    // `applyImportPlan` over zero actionable rows, and still finalize the run
    // as 'committed'/'approved' — a false "0 created · 0 updated" success that
    // permanently discards the staged vendor data (the idempotent
    // pending_review guard above means it can never be re-approved). Fail
    // loud instead. getImportRuns already excludes event-grain runs from this
    // wizard's list; this is defense-in-depth for a stale client / direct call.
    if (staged.unmatched_data && !Array.isArray(staged.unmatched_data.matches)) {
      throw new Error(
        'This run was staged by the event-level importer and must be approved from the Event-level wizard, not here.'
      );
    }

    const stagedMatches = staged.unmatched_data?.matches ?? [];
    const stagedHeaders = staged.unmatched_data?.headers ?? [];
    const stagedRows = staged.unmatched_data?.rows ?? [];
    const stagedDataShape = staged.unmatched_data?.dataShape ?? undefined;
    if (stagedRows.length === 0) {
      throw new Error(
        'This run was staged before row payloads were retained; re-upload to apply it.'
      );
    }

    // Re-resolve the source policy at approval time (the registry is the source
    // of truth; a coach may have adjusted trust/visibility since staging).
    const policy = await loadSourcePolicy(supabase, teamId, runRow.source_id);
    const sourceLabel = runRow.source_label ?? getImportSource(runRow.source_id).label;

    // Re-validate the staged payload so an approved held run surfaces its
    // WARNINGS into the Import Dossier identically to the auto-commit path.
    const stagedValidation = validateImportRows({
      rows: stagedRows,
      mapping: staged.mapping_config ?? {},
      headers: stagedHeaders,
      matches: stagedMatches.map((m) => ({
        rowIndex: m.rowIndex,
        playerId: m.playerId,
        action: m.action,
        sourceName: m.sourceName,
      })),
    });

    const applied = await applyImportPlan(db, {
      importRunId,
      teamId,
      coachId,
      userId: ctx.user.id,
      sourceId: runRow.source_id,
      sourceLabel,
      sourceTag: `import:${runRow.source_id}`,
      policy,
      statType: staged.stat_type,
      sessionDate: staged.session_date,
      sessionName: staged.session_name,
      fileName: staged.filename ?? `import_${Date.now()}.csv`,
      headers: stagedHeaders,
      mapping: staged.mapping_config ?? {},
      rows: stagedRows,
      matches: stagedMatches,
      dataShape: stagedDataShape,
      validation: stagedValidation,
    });

    // applyImportPlan finalizes status -> 'committed'; stamp the review decision.
    await db
      .from('baseball_import_runs')
      .update({
        review_state: 'approved',
        reviewed_by: ctx.user.id,
        reviewed_at: reviewedAt,
      })
      .eq('id', importRunId);

    return { ...applied, rejected: false };
  }
);

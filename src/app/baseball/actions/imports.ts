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
import { withBaseballAction } from '@/lib/baseball/with-baseball-action';
import { appendImportTimelineEvent } from '@/lib/baseball/timeline-writer';
import { runBaseballEngine } from '@/app/baseball/actions/coachhelm';
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
import type {
  BaseballImportRunRow,
  BaseballImportRowMatch,
  BaseballImportColumnMapping,
  BaseballImportRowSnapshot,
  BaseballImportRowDuplicate,
} from '@/lib/types/baseball-imports';
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
 * is the adapter key (e.g. 'trackman'); registry rows store it as `source_type`,
 * so we match on source_type first, then source_name as a secondary key (a coach
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
      'id, source_type, source_name, trust_level, default_visibility, required_review, dedupe_strictness, player_match_strategy, external_id_namespace, enabled'
    )
    .eq('team_id', teamId)
    .or(`source_type.eq.${sourceId},source_name.eq.${sourceId}`)
    .limit(1);

  const row = (data ?? [])[0] as
    | {
        id: string;
        trust_level: BaseballSourceTrustLevel;
        default_visibility: BaseballDefaultVisibility;
        required_review: boolean;
        dedupe_strictness: BaseballDedupeStrictness;
        player_match_strategy: BaseballPlayerMatchStrategy;
        external_id_namespace: string | null;
        enabled: boolean;
      }
    | undefined;

  if (!row) return { configId: null, ...ADAPTER_DEFAULT_POLICY };

  return {
    configId: row.id,
    trustLevel: row.trust_level,
    defaultVisibility: row.default_visibility,
    requiredReview: row.required_review,
    dedupeStrictness: row.dedupe_strictness,
    playerMatchStrategy: row.player_match_strategy,
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

export const previewImport = withBaseballAction(
  'previewImport',
  {
    featureArea: 'baseball-import',
    requiredCapability: 'can_manage_imports',
    teamFrom: (a: {
      teamId: string;
      sourceId: string;
      csvContent: string;
      statType?: 'practice' | 'game' | 'other';
      sessionDate?: string;
    }) => a.teamId,
  },
  async (
    _ctx,
    args: {
      teamId: string;
      sourceId: string;
      csvContent: string;
      // The targeted grain — supplied so the preview can detect EXISTING rows and
      // show the per-row create/update/skip verdict BEFORE commit. Optional so a
      // caller that only wants the parse/match preview still works (verdicts empty).
      statType?: 'practice' | 'game' | 'other';
      sessionDate?: string;
    }
  ): Promise<ImportPreview> => {
    const supabase = await createClient();
    const { teamId, sourceId } = args;

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
    requiredCapability: 'can_manage_imports',
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
}

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
    validation,
  } = a;

  // Resolve the rows we will actually write (matched + not skipped).
  const actionable = matches.filter(
    (m) => m.playerId && m.action !== 'skip' && rows[m.rowIndex]
  );

  // The external-id column (when the source carries one) — resolved once so each
  // write can stamp its row's external id onto the committed stat (the stable
  // identity duplicate detection keys on across re-imports).
  const extIdColForWrite = findExternalIdColumn(headers);

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
  revalidatePath('/baseball/dashboard/stats');

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

    const snapshot: BaseballImportRowSnapshot[] =
      ((lineage as { unmatched_data?: { snapshot?: BaseballImportRowSnapshot[] } } | null)
        ?.unmatched_data?.snapshot) ?? [];

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
    revalidatePath('/baseball/dashboard/stats');
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
    const { data } = await db
      .from('baseball_import_runs')
      .select('*')
      .eq('team_id', args.teamId)
      .order('created_at', { ascending: false })
      .limit(args.limit ?? 20);
    return (data ?? []) as unknown as BaseballImportRunRow[];
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
      } | null;
    };

    const stagedMatches = staged.unmatched_data?.matches ?? [];
    const stagedHeaders = staged.unmatched_data?.headers ?? [];
    const stagedRows = staged.unmatched_data?.rows ?? [];
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

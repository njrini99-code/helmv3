'use server';

// =============================================================================
// src/app/baseball/actions/stat-event-imports.ts
//
// Packet: elite-stats (BaseballHelm — stats-integrations)
//
// The FILE -> EVENT-ROW commit path for the CONCRETE vendor adapters
// (TrackMan / Rapsodo / Blast / Diamond Kinetics / GameChanger / StatCrew). This
// is the missing pipeline the contracts file only TYPED: a real
// parse -> normalize -> validate -> matchPlayers -> previewCommit -> commit /
// rollback into the elite event tables (baseball_pitch_events /
// baseball_batted_ball_events / baseball_swing_events), populating data_context,
// trust_tier, source_id, import_run_id and external event ids.
//
// Boundaries (CLAUDE.md hard rules):
//   * Every action runs inside withBaseballAction { can_manage_imports } — auth +
//     capability enforced server-side; never trusts a client-asserted team.
//   * NO direct/OAuth sync (Phase 1) — this is file-upload only.
//   * NON-DESTRUCTIVE: commit UPSERTs by (source_id, external_event_id); rollback
//     deletes ONLY the rows THIS run created (recorded by import_run_id). No
//     delete-then-reinsert anywhere.
//   * The event-grain tables are not in generated database.ts (migration written,
//     not applied) — typed loosely at the boundary with hand-written Row types.
// =============================================================================

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { withBaseballAction } from '@/lib/baseball/with-baseball-action';
import { appendImportTimelineEvent } from '@/lib/baseball/timeline-writer';
import { logServerError } from '@/lib/server-error-logger';
import {
  getConcreteParser,
  hasConcreteEventAdapter,
  validateEventRows,
  resolveEventPlayers,
  buildEventCommitPlan,
  resolveEventTrust,
  handleOf,
  detectFromParse,
  type EventPlayerResolution,
  type EventCommitPlan,
  type EventValidationIssue,
  type ExternalIdLookup,
  type SourceFileDetection,
} from '@/lib/baseball/adapters';
import {
  GRAIN_TO_TABLE,
  GRAIN_TO_EXTERNAL_ID_COLUMN,
  GRAIN_TO_PRIMARY_FK,
  type CanonicalEventRow,
  type EventGrain,
} from '@/lib/baseball/adapters/event-rows';
import { getSourceRegistryEntry } from '@/lib/baseball/stat-import-adapters';
import type { MatchablePlayer } from '@/lib/baseball/import-matching';
import { assertImportSourceAllowed } from '@/lib/baseball/import-source-enabled';
import type { BaseballSourceKey } from '@/lib/types/baseball-stat-events';
import { fingerprintBody } from '@/lib/baseball/adapters/file-fingerprint';
import {
  uploadImportRawFile,
  signImportRawFileUrl,
} from '@/lib/baseball/import-raw-file-storage';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = { from: (table: string) => any };

const GRAINS: EventGrain[] = ['pitch', 'batted_ball', 'swing'];

// -----------------------------------------------------------------------------
// Transport shapes (serializable across the server-action boundary).
// -----------------------------------------------------------------------------

export interface EventImportPreview {
  sourceKey: BaseballSourceKey;
  sourceLabel: string;
  /** Detect-step result: detected source, grain(s), trust ceiling, auto-commit band. */
  detection: SourceFileDetection;
  rowsRead: number;
  eventRowCount: number;
  /** distinct primary players resolved (sorted by row count, biggest first). */
  resolutions: EventPlayerResolution[];
  validation: EventValidationIssue[];
  plan: EventCommitPlan;
  /** echoed so commit() re-derives the exact same rows (no re-upload). */
  rows: CanonicalEventRow[];
}

export interface CommitEventImportArgs {
  teamId: string;
  sourceKey: BaseballSourceKey;
  fileName: string;
  rows: CanonicalEventRow[];
  /** handle -> final player id after any coach override in the diff viewer. */
  resolutionOverrides: Array<{ handle: string; playerId: string | null }>;
  /** optional anchor (game/practice) for the imported events. */
  gameId?: string | null;
  /**
   * GAP 1 + GAP 2 — the ORIGINAL uploaded file body (same transport string the
   * wizard holds). The server recomputes SHA-256 over the bytes it stores,
   * preserves the file, and short-circuits an exact-duplicate re-import.
   */
  rawFileBody?: string;
  /** Bypass the exact-duplicate short-circuit (coach chose to re-import). */
  forceReimport?: boolean;
  /**
   * GAP 4 — the preview's detection band, echoed so commit re-derives the same
   * review decision without re-detecting (it also re-validates server-side).
   * `requiresReview` re-computed from the registry + this band.
   */
  detectionAutoCommit?: SourceFileDetection['autoCommit'];
}

export interface CommitEventImportResult {
  importRunId: string;
  created: number;
  updated: number;
  skipped: number;
  byGrain: EventCommitPlan['byGrain'];
  /**
   * GAP 4 — set when the source's auto-commit band / requiresReviewByDefault held
   * the run for review: status:'review', rows STAGED on the lineage row, ZERO
   * event rows written. The coach approves via reviewEventImportRun.
   */
  heldForReview: boolean;
  /**
   * GAP 2 — set when the EXACT same file was already committed for this
   * (team, source). Nothing is written; the wizard offers skip-or-force.
   */
  duplicateFileRun: { runId: string; committedAt: string | null } | null;
  /**
   * GAP 2 — set when the file hash DIFFERS but it targets the same game/session
   * as a prior run (a correction). The wizard routes to the correction/diff
   * workflow rather than a blind second import.
   */
  correctionOf: string | null;
}

// -----------------------------------------------------------------------------
// Shared helpers
// -----------------------------------------------------------------------------

async function loadRoster(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamId: string,
): Promise<MatchablePlayer[]> {
  const { data } = await supabase
    .from('baseball_team_members')
    .select(`player_id, baseball_players!inner ( id, first_name, last_name )`)
    .eq('team_id', teamId);
  return (data ?? []).map((m) => {
    const p = m.baseball_players as unknown as {
      id: string;
      first_name: string | null;
      last_name: string | null;
    };
    return { id: p.id, first_name: p.first_name, last_name: p.last_name };
  });
}

/** Resolve (or lazily seed) the baseball_stat_sources row for this source_key. */
async function resolveSourceId(
  db: LooseClient,
  teamId: string,
  sourceKey: BaseballSourceKey,
  createdBy: string,
): Promise<string | null> {
  const entry = getSourceRegistryEntry(sourceKey);
  const sourceName = entry?.label ?? sourceKey;
  const { data: existing } = await db
    .from('baseball_stat_sources')
    .select('id')
    .eq('team_id', teamId)
    .eq('source_key', sourceKey)
    .eq('source_name', sourceName)
    .maybeSingle();
  if (existing) return (existing as { id: string }).id;

  if (!entry) return null;
  const { data: inserted } = await db
    .from('baseball_stat_sources')
    .insert({
      team_id: teamId,
      source_key: sourceKey,
      source_name: sourceName,
      // Dual-write the legacy `name` column — still NOT NULL with no default
      // on baseball_stat_sources (see the #651b reconcile migration), so
      // this insert fails without it. `source_type`/`trust_level` (the other
      // two legacy NOT NULL columns) are intentionally left at their own
      // DEFAULTs ('manual' / 'unreviewed') rather than mapped from
      // source_category/trust_tier: the legacy CHECK vocabularies
      // (manual/device/api/import/official/partner,
      // official/device_export/staff_entered/player_entered/ai_derived/
      // unreviewed) don't correspond 1:1 to the designed ones
      // (official_game/player_development/tracking/... ,
      // official/verified_vendor/coach_reviewed/...) — a wrong guess would
      // be worse than an honest default.
      name: sourceName,
      source_category: entry.category,
      trust_tier: entry.defaultTrustTier,
      is_enabled: true,
      default_visibility: 'staff_only',
      requires_review: entry.requiresReviewByDefault,
      ai_can_use: entry.aiCanUseByDefault,
      expected_cadence_days: entry.expectedCadenceDays,
      created_by: createdBy,
    })
    .select('id')
    .maybeSingle();
  return inserted ? (inserted as { id: string }).id : null;
}

/** Load the set of external event ids already present per grain for this source. */
async function loadExistingExternalIds(
  db: LooseClient,
  teamId: string,
  sourceId: string | null,
): Promise<Record<EventGrain, Set<string>>> {
  const result: Record<EventGrain, Set<string>> = {
    pitch: new Set(),
    batted_ball: new Set(),
    swing: new Set(),
  };
  if (!sourceId) return result;
  for (const grain of GRAINS) {
    const col = GRAIN_TO_EXTERNAL_ID_COLUMN[grain];
    const { data } = await db
      .from(GRAIN_TO_TABLE[grain])
      .select(col)
      .eq('team_id', teamId)
      .eq('source_id', sourceId)
      .not(col, 'is', null);
    for (const r of (data ?? []) as Array<Record<string, string | null>>) {
      const v = r[col];
      if (v) result[grain].add(v);
    }
  }
  return result;
}

function buildResolutionMap(
  resolutions: EventPlayerResolution[],
): Map<string, EventPlayerResolution> {
  return new Map(resolutions.map((r) => [r.handle, r]));
}

// -----------------------------------------------------------------------------
// previewEventImport — parse + validate + match + plan. NO writes.
// -----------------------------------------------------------------------------

export const previewEventImport = withBaseballAction(
  'previewEventImport',
  {
    featureArea: 'baseball-import',
    requiredCapability: 'can_manage_imports',
    teamFrom: (a: { teamId: string; sourceKey: string; fileBody: string }) => a.teamId,
  },
  async (
    _ctx,
    args: { teamId: string; sourceKey: string; fileBody: string },
  ): Promise<EventImportPreview> => {
    const { teamId, sourceKey, fileBody } = args;
    if (!hasConcreteEventAdapter(sourceKey)) {
      throw new Error(`No concrete event adapter for source "${sourceKey}".`);
    }
    const parser = getConcreteParser(sourceKey)!;
    const supabase = await createClient();
    const db = supabase as unknown as LooseClient;

    await assertImportSourceAllowed(db, teamId, sourceKey);

    const parsed = parser(fileBody);

    // Detect-step result, derived from the SAME parse (no double-parse): detected
    // source, grain(s), trust ceiling, and the v8 auto-commit band. This is what
    // the wizard's Provider-detection step renders before player matching.
    const detection = detectFromParse(
      parsed.sourceKey,
      {
        rows: parsed.rows,
        rowsRead: parsed.rowsRead,
        warnings: parsed.warnings,
        preservedText: parsed.preservedText,
      },
      fileBody.slice(0, 4096),
    );

    const roster = await loadRoster(supabase, teamId);

    // External-id index for deterministic matching (best effort; table may be empty).
    const externalIds: ExternalIdLookup = new Map();
    const { data: extRows } = await db
      .from('baseball_player_external_ids')
      .select('player_id, external_id, confidence')
      .eq('source_id', sourceKey);
    for (const r of (extRows ?? []) as Array<{
      player_id: string;
      external_id: string;
      confidence: number | null;
    }>) {
      externalIds.set(r.external_id, { playerId: r.player_id, confidence: r.confidence ?? 1 });
    }

    const resolutions = resolveEventPlayers(parsed.rows, roster, externalIds);
    const validation = validateEventRows(parsed.rows);

    const sourceId = await resolveSourceIdReadonly(db, teamId, sourceKey);
    const existingExternalIds = await loadExistingExternalIds(db, teamId, sourceId);

    const plan = buildEventCommitPlan({
      rows: parsed.rows,
      resolutionByHandle: buildResolutionMap(resolutions),
      existingExternalIds,
      parseWarnings: parsed.warnings,
      validation,
    });

    return {
      sourceKey: parsed.sourceKey,
      sourceLabel: getSourceRegistryEntry(parsed.sourceKey)?.label ?? parsed.sourceKey,
      detection,
      rowsRead: parsed.rowsRead,
      eventRowCount: parsed.rows.length,
      resolutions,
      validation,
      plan,
      rows: parsed.rows,
    };
  },
);

/** Read-only source-id lookup (preview must not seed rows). */
async function resolveSourceIdReadonly(
  db: LooseClient,
  teamId: string,
  sourceKey: BaseballSourceKey,
): Promise<string | null> {
  const entry = getSourceRegistryEntry(sourceKey);
  const sourceName = entry?.label ?? sourceKey;
  const { data } = await db
    .from('baseball_stat_sources')
    .select('id')
    .eq('team_id', teamId)
    .eq('source_key', sourceKey)
    .eq('source_name', sourceName)
    .maybeSingle();
  return data ? (data as { id: string }).id : null;
}

// -----------------------------------------------------------------------------
// commitEventImport — write run + event rows (UPSERT by external id) + lineage +
// external-id mappings + ONE timeline event per touched player.
// -----------------------------------------------------------------------------

export const commitEventImport = withBaseballAction(
  'commitEventImport',
  {
    featureArea: 'baseball-import',
    requiredCapability: 'can_manage_imports',
    teamFrom: (a: CommitEventImportArgs) => a.teamId,
  },
  async (ctx, args: CommitEventImportArgs): Promise<CommitEventImportResult> => {
    const { teamId, sourceKey, fileName, rows, resolutionOverrides, gameId } = args;
    if (!hasConcreteEventAdapter(sourceKey)) {
      throw new Error(`No concrete event adapter for source "${sourceKey}".`);
    }
    const supabase = await createClient();
    const db = supabase as unknown as LooseClient;

    await assertImportSourceAllowed(db, teamId, sourceKey);

    const sourceId = await resolveSourceId(db, teamId, sourceKey, ctx.user.id);
    const entry = getSourceRegistryEntry(sourceKey);

    // GAP 1 + GAP 2 — FILE FINGERPRINT, server-recomputed over the bytes we store.
    let fingerprint: Awaited<ReturnType<typeof fingerprintBody>> | null = null;
    if (args.rawFileBody && args.rawFileBody.length > 0) {
      try {
        fingerprint = await fingerprintBody(args.rawFileBody);
      } catch {
        fingerprint = null;
      }
    }

    // GAP 2 — exact-duplicate short-circuit: an identical file already committed
    // for this (team, source) writes nothing unless the coach forces it.
    if (fingerprint && !args.forceReimport) {
      const { data: priorRun } = await db
        .from('baseball_import_runs')
        .select('id, committed_at')
        .eq('team_id', teamId)
        .eq('source_id', sourceKey)
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
          byGrain: emptyByGrain(),
          heldForReview: false,
          duplicateFileRun: { runId: dup.id, committedAt: dup.committed_at },
          correctionOf: null,
        };
      }
    }

    // GAP 2 — correction detection: a DIFFERENT file that targets the same
    // game OR overlaps the external event ids already present from a prior run is
    // a correction, not a blind re-import. Surface correctionOf so the wizard
    // routes into the diff workflow (rows still apply via the supersede model).
    const correctionOf = await detectCorrectionRun(db, teamId, sourceKey, sourceId, {
      gameId: gameId ?? null,
      rows,
    });

    // GAP 4 — REVIEW HOLD (#415). Recompute detection band server-side when raw
    // bytes are available; never trust client-supplied detectionAutoCommit alone.
    const validation = validateEventRows(rows);
    let serverAutoCommit: SourceFileDetection['autoCommit'] | undefined;
    if (args.rawFileBody && args.rawFileBody.length > 0) {
      const parser = getConcreteParser(sourceKey)!;
      const parsed = parser(args.rawFileBody);
      const detection = detectFromParse(
        parsed.sourceKey,
        {
          rows: parsed.rows,
          rowsRead: parsed.rowsRead,
          warnings: parsed.warnings,
          preservedText: parsed.preservedText,
        },
        args.rawFileBody.slice(0, 4096),
      );
      serverAutoCommit = detection.autoCommit;
    }

    const autoCommitBand = serverAutoCommit ?? args.detectionAutoCommit;
    if (autoCommitBand === 'do_not_commit') {
      throw new Error(
        'This file cannot be committed automatically. Detection confidence is too low — review the source format.',
      );
    }

    const requiresReview =
      !!entry?.requiresReviewByDefault ||
      autoCommitBand === 'hold_for_review';

    // 1. Run header (held or committing). file_hash persisted for the dup index.
    const { data: runRow, error: runErr } = await db
      .from('baseball_import_runs')
      .insert({
        team_id: teamId,
        source_id: sourceKey,
        source_label: entry?.label ?? sourceKey,
        file_name: fileName,
        status: requiresReview ? 'review' : 'parsing',
        review_state: requiresReview ? 'pending_review' : 'not_required',
        total_rows: rows.length,
        matched_rows: 0,
        unmatched_rows: 0,
        created_by: ctx.user.id,
        file_hash: fingerprint?.fileHash ?? null,
        file_bytes: fingerprint?.fileBytes ?? null,
      })
      .select('id')
      .single();
    if (runErr || !runRow) throw new Error('Failed to create import run.');
    const importRunId = (runRow as { id: string }).id;

    // GAP 1 — preserve the original file (upload AFTER the run exists, at STAGE
    // time for a held run too, so a reviewer approves against the real file).
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

    // GAP 4 — held: STAGE the plan on the lineage row, write ZERO event rows.
    if (requiresReview) {
      await db.from('baseball_stat_uploads').insert({
        team_id: teamId,
        coach_id: ctx.activeCoachId,
        filename: fileName,
        stat_type: 'other',
        session_date: new Date().toISOString().slice(0, 10),
        session_name: entry?.label ?? sourceKey,
        total_rows: rows.length,
        matched_rows: 0,
        unmatched_rows: rows.length,
        unmatched_data: {
          staged: true,
          rows,
          resolutionOverrides,
          gameId: gameId ?? null,
          sourceKey,
          validation,
        },
        status: 'needs_review',
        import_run_id: importRunId,
        source_id: sourceKey,
        // mapping_config.adapter present => reviewEventImportRun recognizes this
        // as an EVENT-grain staged run (vs the flat staged shape).
        mapping_config: { adapter: sourceKey },
      });

      revalidatePath('/baseball/dashboard/import');
      revalidatePath('/baseball/dashboard/command-center');

      return {
        importRunId,
        created: 0,
        updated: 0,
        skipped: rows.length,
        byGrain: emptyByGrain(),
        heldForReview: true,
        duplicateFileRun: null,
        correctionOf,
      };
    }

    // 2. Apply the plan through the shared core (also used by approval).
    const applied = await applyEventImportPlan(db, {
      importRunId,
      teamId,
      sourceKey,
      sourceId,
      fileName,
      rows,
      resolutionOverrides,
      gameId: gameId ?? null,
      validation,
      coachId: ctx.activeCoachId,
      userId: ctx.user.id,
    });

    revalidatePath('/baseball/dashboard/import');
    revalidatePath('/baseball/dashboard/stats-center');
    revalidatePath('/baseball/dashboard/command-center');

    return {
      importRunId,
      created: applied.created,
      updated: applied.updated,
      skipped: applied.skipped,
      byGrain: applied.byGrain,
      heldForReview: false,
      duplicateFileRun: null,
      correctionOf,
    };
  },
);

/** Empty by-grain counters. */
function emptyByGrain(): EventCommitPlan['byGrain'] {
  return {
    pitch: { creates: 0, updates: 0, skipped: 0 },
    batted_ball: { creates: 0, updates: 0, skipped: 0 },
    swing: { creates: 0, updates: 0, skipped: 0 },
  };
}

/**
 * GAP 2 — is this file a CORRECTION of a prior run? True when a prior committed
 * run for this (team, source) shares the same gameId OR any of the incoming
 * external event ids already exist for this source. Returns that prior run id so
 * the wizard surfaces the diff workflow. Best-effort (read-only).
 */
async function detectCorrectionRun(
  db: LooseClient,
  teamId: string,
  _sourceKey: BaseballSourceKey,
  sourceId: string | null,
  payload: { gameId: string | null; rows: CanonicalEventRow[] },
): Promise<string | null> {
  if (!sourceId) return null;

  // Same game targeted by a prior committed run.
  if (payload.gameId) {
    for (const grain of GRAINS) {
      const { data } = await db
        .from(GRAIN_TO_TABLE[grain])
        .select('import_run_id')
        .eq('team_id', teamId)
        .eq('source_id', sourceId)
        .eq('game_id', payload.gameId)
        .is('superseded_by_run_id', null)
        .not('import_run_id', 'is', null)
        .limit(1);
      const hit = (data ?? [])[0] as { import_run_id: string | null } | undefined;
      if (hit?.import_run_id) return hit.import_run_id;
    }
  }

  // Overlapping external event ids already present for this source.
  const extIds: Record<EventGrain, string[]> = { pitch: [], batted_ball: [], swing: [] };
  for (const row of payload.rows) {
    if (row.externalEventId) extIds[row.grain].push(row.externalEventId);
  }
  for (const grain of GRAINS) {
    const ids = [...new Set(extIds[grain])].slice(0, 200);
    if (ids.length === 0) continue;
    const col = GRAIN_TO_EXTERNAL_ID_COLUMN[grain];
    const { data } = await db
      .from(GRAIN_TO_TABLE[grain])
      .select('import_run_id')
      .eq('team_id', teamId)
      .eq('source_id', sourceId)
      .in(col, ids)
      .is('superseded_by_run_id', null)
      .not('import_run_id', 'is', null)
      .limit(1);
    const hit = (data ?? [])[0] as { import_run_id: string | null } | undefined;
    if (hit?.import_run_id) return hit.import_run_id;
  }
  return null;
}

// -----------------------------------------------------------------------------
// applyEventImportPlan — the load-bearing event write core (internal). Shared by
//   commitEventImport (auto-commit) and reviewEventImportRun (approve a held run)
//   exactly like applyImportPlan on the flat path.
//
// GAP 5 — SUPERSEDE, not overwrite. When an existing (source_id, external id) row
//   is found, we INSERT the new value stamped with THIS run's import_run_id and
//   set the prior row's superseded_by_run_id = thisRun + superseded_at. Reads
//   filter superseded_by_run_id IS NULL. rollbackEventImport then deletes this
//   run's created rows AND un-supersedes the rows it superseded — fully reversible.
// -----------------------------------------------------------------------------

interface ApplyEventPlanArgs {
  importRunId: string;
  teamId: string;
  sourceKey: BaseballSourceKey;
  sourceId: string | null;
  fileName: string;
  rows: CanonicalEventRow[];
  resolutionOverrides: Array<{ handle: string; playerId: string | null }>;
  gameId: string | null;
  validation: EventValidationIssue[];
  coachId: string | null;
  userId: string;
}

async function applyEventImportPlan(
  db: LooseClient,
  a: ApplyEventPlanArgs,
): Promise<{
  created: number;
  updated: number;
  skipped: number;
  byGrain: EventCommitPlan['byGrain'];
}> {
  const { importRunId, teamId, sourceKey, sourceId, fileName, rows, resolutionOverrides, gameId, validation } = a;
  const trustTier = resolveEventTrust(sourceKey);
  const entry = getSourceRegistryEntry(sourceKey);
  const visibility = 'staff_only';
  const dataContextDefault = entry?.defaultDataContext ?? 'sensor';

  const overrideMap = new Map(resolutionOverrides.map((o) => [o.handle, o.playerId]));
  const handlePlayer = (row: CanonicalEventRow): string | null => {
    const h = handleOf(row);
    return overrideMap.has(h) ? (overrideMap.get(h) ?? null) : null;
  };

  const errorRows = new Set(
    validation
      .filter((v) => v.severity === 'error')
      .map((v) => `${v.grain}:${v.sourceRowNumber}`),
  );

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const byGrain = emptyByGrain();
  const touchedPlayers = new Map<string, { created: number; updated: number; conf: number }>();
  const bumpTouched = (pid: string, kind: 'create' | 'update', conf: number) => {
    const t = touchedPlayers.get(pid) ?? { created: 0, updated: 0, conf };
    if (kind === 'create') t.created += 1;
    else t.updated += 1;
    t.conf = Math.min(t.conf, conf);
    touchedPlayers.set(pid, t);
  };

  const nowIso = new Date().toISOString();

  for (const row of rows) {
    const playerId = handlePlayer(row);
    if (!playerId || errorRows.has(`${row.grain}:${row.sourceRowNumber}`)) {
      skipped += 1;
      byGrain[row.grain].skipped += 1;
      continue;
    }

    const fk = GRAIN_TO_PRIMARY_FK[row.grain];
    const extCol = GRAIN_TO_EXTERNAL_ID_COLUMN[row.grain];
    const baseRow: Record<string, unknown> = {
      team_id: teamId,
      game_id: gameId ?? null,
      [fk]: playerId,
      data_context: row.dataContext ?? dataContextDefault,
      trust_tier: trustTier,
      visibility,
      source_id: sourceId,
      import_run_id: importRunId,
      measured_at: row.measuredAt,
      [extCol]: row.externalEventId,
      ...row.fields,
    };

    // GAP 5 — supersede an existing CURRENT row instead of overwriting it.
    if (row.externalEventId && sourceId) {
      const { data: existing } = await db
        .from(GRAIN_TO_TABLE[row.grain])
        .select('id')
        .eq('source_id', sourceId)
        .eq(extCol, row.externalEventId)
        .is('superseded_by_run_id', null)
        .maybeSingle();
      if (existing) {
        const existingId = (existing as { id: string }).id;
        // Insert the corrected value as a NEW row owned by THIS run.
        const { error: insErr } = await db
          .from(GRAIN_TO_TABLE[row.grain])
          .insert(baseRow);
        if (!insErr) {
          // Mark the prior row superseded by this run (reversible in rollback).
          await db
            .from(GRAIN_TO_TABLE[row.grain])
            .update({ superseded_by_run_id: importRunId, superseded_at: nowIso })
            .eq('id', existingId);
          updated += 1;
          byGrain[row.grain].updates += 1;
          bumpTouched(playerId, 'update', 1);
        } else {
          skipped += 1;
          byGrain[row.grain].skipped += 1;
          await logServerError(
            `Failed to insert superseding ${row.grain} event row (row #${row.sourceRowNumber}): ${insErr.message}`,
            {
              action: 'stat-event-imports.applyEventImportPlan',
              featureArea: 'baseball-import',
              errorCode: insErr.code,
              errorDetails: insErr.details ?? undefined,
              errorHint: insErr.hint ?? undefined,
              metadata: { table: GRAIN_TO_TABLE[row.grain], importRunId, teamId, sourceKey },
            },
          );
        }
        continue;
      }
    }

    const { error } = await db.from(GRAIN_TO_TABLE[row.grain]).insert(baseRow);
    if (!error) {
      created += 1;
      byGrain[row.grain].creates += 1;
      bumpTouched(playerId, 'create', 1);
    } else {
      skipped += 1;
      byGrain[row.grain].skipped += 1;
      await logServerError(
        `Failed to insert ${row.grain} event row (row #${row.sourceRowNumber}): ${error.message}`,
        {
          action: 'stat-event-imports.applyEventImportPlan',
          featureArea: 'baseball-import',
          errorCode: error.code,
          errorDetails: error.details ?? undefined,
          errorHint: error.hint ?? undefined,
          metadata: { table: GRAIN_TO_TABLE[row.grain], importRunId, teamId, sourceKey },
        },
      );
    }
  }

  // Persist external-id -> player mappings for deterministic future matching.
  const extMappings = new Map<string, { player_id: string; confidence: number }>();
  for (const row of rows) {
    const pid = handlePlayer(row);
    if (pid && row.externalPlayerId) {
      extMappings.set(row.externalPlayerId, { player_id: pid, confidence: 1 });
    }
  }
  if (extMappings.size > 0) {
    const extInsert = [...extMappings.entries()].map(([external_id, v]) => ({
      team_id: teamId,
      player_id: v.player_id,
      source_id: sourceKey,
      external_id,
      confidence: v.confidence,
    }));
    // Team-scoped unique key per the data contract (v2_data_contracts_expanded.md:37).
    await db
      .from('baseball_player_external_ids')
      .upsert(extInsert, { onConflict: 'team_id,source_id,external_id' });
  }

  // Lineage row (upsert by import_run_id so an approved held run replaces its
  // staged plan with the applied summary, non-destructively).
  await db
    .from('baseball_stat_uploads')
    .upsert(
      {
        team_id: teamId,
        coach_id: a.coachId,
        filename: fileName,
        stat_type: 'other',
        session_date: new Date().toISOString().slice(0, 10),
        session_name: entry?.label ?? sourceKey,
        total_rows: rows.length,
        matched_rows: created + updated,
        unmatched_rows: skipped,
        unmatched_data: { grain_counts: byGrain, validation },
        status: 'completed',
        import_run_id: importRunId,
        source_id: sourceKey,
        mapping_config: { adapter: sourceKey, grains: byGrain },
      },
      { onConflict: 'import_run_id' },
    );

  // Finalize run.
  await db
    .from('baseball_import_runs')
    .update({
      status: 'committed',
      matched_rows: created + updated,
      unmatched_rows: skipped,
      committed_at: nowIso,
    })
    .eq('id', importRunId);

  // ONE honest timeline event per touched player.
  const touched = [...touchedPlayers.entries()];
  if (touched.length > 0) {
    await Promise.allSettled(
      touched.map(([pid, t]) => {
        const lines = t.created + t.updated;
        const word = lines === 1 ? 'event' : 'events';
        return appendImportTimelineEvent({
          teamId,
          playerId: pid,
          title: `Imported ${lines} ${entry?.label ?? sourceKey} ${word}`,
          body: `${t.created} new · ${t.updated} updated from ${entry?.label ?? sourceKey} (${fileName}).`,
          source: 'csv_import',
          sourceId: importRunId,
          confidence: Number.isFinite(t.conf) ? t.conf : null,
          occurredAt: nowIso,
          createdBy: a.userId,
        });
      }),
    );
  }

  return { created, updated, skipped, byGrain };
}

// -----------------------------------------------------------------------------
// rollbackEventImport — FULLY reversible (GAP 5). For each grain:
//   (a) delete the rows THIS run created that are still CURRENT (import_run_id ==
//       run AND superseded_by_run_id IS NULL) — the inverse of an insert; and
//   (b) un-supersede the prior rows THIS run superseded (clear
//       superseded_by_run_id / superseded_at) — restoring the prior value.
// Never delete-then-reinsert; never touch a row another run owns + still current.
// -----------------------------------------------------------------------------

export const rollbackEventImport = withBaseballAction(
  'rollbackEventImport',
  {
    featureArea: 'baseball-import',
    requiredCapability: 'can_manage_imports',
    teamFrom: (a: { teamId: string; importRunId: string }) => a.teamId,
  },
  async (
    _ctx,
    args: { teamId: string; importRunId: string },
  ): Promise<{ reverted: number; restored: number }> => {
    const { teamId, importRunId } = args;
    const supabase = await createClient();
    const db = supabase as unknown as LooseClient;

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

    let reverted = 0; // created rows removed
    let restored = 0; // prior rows un-superseded (value restored)
    for (const grain of GRAINS) {
      // (a) Delete rows this run created that are still current. A row this run
      //     created which a LATER run already superseded is left alone — the
      //     later run owns its lifecycle (we never strand a chain).
      const { data: toDelete } = await db
        .from(GRAIN_TO_TABLE[grain])
        .select('id')
        .eq('team_id', teamId)
        .eq('import_run_id', importRunId)
        .is('superseded_by_run_id', null);
      const ids = (toDelete ?? []).map((r: { id: string }) => r.id);
      if (ids.length > 0) {
        const { error } = await db.from(GRAIN_TO_TABLE[grain]).delete().in('id', ids);
        if (!error) reverted += ids.length;
      }

      // (b) Un-supersede the prior rows THIS run superseded — restore them as the
      //     current value (the correction this run made is reversed).
      const { data: toRestore } = await db
        .from(GRAIN_TO_TABLE[grain])
        .select('id')
        .eq('team_id', teamId)
        .eq('superseded_by_run_id', importRunId);
      const restoreIds = (toRestore ?? []).map((r: { id: string }) => r.id);
      if (restoreIds.length > 0) {
        const { error } = await db
          .from(GRAIN_TO_TABLE[grain])
          .update({ superseded_by_run_id: null, superseded_at: null })
          .in('id', restoreIds);
        if (!error) restored += restoreIds.length;
      }
    }

    await db
      .from('baseball_import_runs')
      .update({ status: 'rolled_back', rolled_back_at: new Date().toISOString() })
      .eq('id', importRunId);
    await db
      .from('baseball_stat_uploads')
      .update({ status: 'failed' })
      .eq('import_run_id', importRunId)
      .eq('team_id', teamId);

    revalidatePath('/baseball/dashboard/import');
    revalidatePath('/baseball/dashboard/stats-center');
    revalidatePath('/baseball/dashboard/command-center');

    return { reverted, restored };
  },
);

// -----------------------------------------------------------------------------
// reviewEventImportRun — GAP 4: approve/reject a HELD event-grain run. Mirrors the
//   flat reviewImportRun: APPROVE replays the staged plan through the shared
//   applyEventImportPlan core; REJECT writes nothing and marks the run rejected.
// -----------------------------------------------------------------------------

export const reviewEventImportRun = withBaseballAction(
  'reviewEventImportRun',
  {
    featureArea: 'baseball-import',
    requiredCapability: 'can_manage_imports',
    teamFrom: (a: { teamId: string; importRunId: string; decision: 'approve' | 'reject' }) =>
      a.teamId,
  },
  async (
    ctx,
    args: { teamId: string; importRunId: string; decision: 'approve' | 'reject' },
  ): Promise<CommitEventImportResult & { rejected: boolean }> => {
    const { teamId, importRunId, decision } = args;
    const supabase = await createClient();
    const db = supabase as unknown as LooseClient;

    const { data: run } = await db
      .from('baseball_import_runs')
      .select('id, team_id, status, review_state, source_id')
      .eq('id', importRunId)
      .eq('team_id', teamId)
      .maybeSingle();
    if (!run) throw new Error('Import run not found.');
    const runRow = run as { review_state: string; source_id: string };
    const empty: CommitEventImportResult & { rejected: boolean } = {
      importRunId,
      created: 0,
      updated: 0,
      skipped: 0,
      byGrain: emptyByGrain(),
      heldForReview: false,
      duplicateFileRun: null,
      correctionOf: null,
      rejected: false,
    };
    if (runRow.review_state !== 'pending_review') return empty; // idempotent

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
      return { ...empty, rejected: true };
    }

    // APPROVE — load the staged event plan from the lineage row and replay it.
    const { data: lineage } = await db
      .from('baseball_stat_uploads')
      .select('id, filename, mapping_config, unmatched_data')
      .eq('import_run_id', importRunId)
      .eq('team_id', teamId)
      .maybeSingle();
    if (!lineage) throw new Error('Staged event plan not found for this run.');

    const staged = lineage as {
      filename: string | null;
      mapping_config: { adapter?: string } | null;
      unmatched_data: {
        staged?: boolean;
        rows?: CanonicalEventRow[];
        resolutionOverrides?: Array<{ handle: string; playerId: string | null }>;
        gameId?: string | null;
        sourceKey?: string;
        validation?: EventValidationIssue[];
      } | null;
    };
    const sourceKey = (staged.mapping_config?.adapter ??
      staged.unmatched_data?.sourceKey ??
      runRow.source_id) as BaseballSourceKey;
    const stagedRows = staged.unmatched_data?.rows ?? [];
    if (stagedRows.length === 0) {
      throw new Error('This run was staged without an event payload; re-upload to apply it.');
    }
    const sourceId = await resolveSourceId(db, teamId, sourceKey, ctx.user.id);
    const validation = staged.unmatched_data?.validation ?? validateEventRows(stagedRows);

    const applied = await applyEventImportPlan(db, {
      importRunId,
      teamId,
      sourceKey,
      sourceId,
      fileName: staged.filename ?? `${sourceKey}_${Date.now()}`,
      rows: stagedRows,
      resolutionOverrides: staged.unmatched_data?.resolutionOverrides ?? [],
      gameId: staged.unmatched_data?.gameId ?? null,
      validation,
      coachId: ctx.activeCoachId,
      userId: ctx.user.id,
    });

    await db
      .from('baseball_import_runs')
      .update({
        review_state: 'approved',
        reviewed_by: ctx.user.id,
        reviewed_at: reviewedAt,
      })
      .eq('id', importRunId);

    revalidatePath('/baseball/dashboard/import');
    revalidatePath('/baseball/dashboard/stats-center');
    revalidatePath('/baseball/dashboard/command-center');

    return {
      importRunId,
      created: applied.created,
      updated: applied.updated,
      skipped: applied.skipped,
      byGrain: applied.byGrain,
      heldForReview: false,
      duplicateFileRun: null,
      correctionOf: null,
      rejected: false,
    };
  },
);

// -----------------------------------------------------------------------------
// getEventImportRunFileUrl — GAP 1: signed download URL for an event run's file.
// -----------------------------------------------------------------------------

export const getEventImportRunFileUrl = withBaseballAction(
  'getEventImportRunFileUrl',
  {
    featureArea: 'baseball-import',
    requiredCapability: 'can_manage_imports',
    teamFrom: (a: { teamId: string; importRunId: string }) => a.teamId,
  },
  async (
    _ctx,
    args: { teamId: string; importRunId: string },
  ): Promise<{ url: string | null; fileName: string | null }> => {
    const supabase = await createClient();
    const db = supabase as unknown as LooseClient;
    const { data: run } = await db
      .from('baseball_import_runs')
      .select('file_url, file_name')
      .eq('id', args.importRunId)
      .eq('team_id', args.teamId)
      .maybeSingle();
    if (!run) return { url: null, fileName: null };
    const row = run as { file_url: string | null; file_name: string | null };
    const url = await signImportRawFileUrl(supabase, row.file_url, 300);
    return { url, fileName: row.file_name };
  },
);

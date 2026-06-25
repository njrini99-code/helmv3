'use server';

// =============================================================================
// src/app/lifting/actions/imports.ts
//
// Helm Lifting Lab — data import lifecycle (staged → validated → committed).
//
//   initiateImportRun  — create a staged import_run + import_rows (validation pass)
//   commitImportRun    — mark validated import as committed; caller applies data
//   rollbackImportRun  — mark import as rolled_back (data writer should guard this)
//
// Import data application (lifting results / maxes / wellness) is done by the
// caller after commitImportRun returns — this file only manages the run lifecycle
// metadata. The actual rows land in helm_lifting_set_results / helm_lifting_maxes
// / helm_lifting_readiness_checkins through dedicated import handlers that check
// import_run.status === 'committed' before writing.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { withLiftingAction, LiftingActionError } from '@/lib/lifting/with-lifting-action';
import type {
  HelmLiftingImportRunInsert,
  HelmLiftingImportRowInsert,
  HelmLiftingImportSource,
  HelmLiftingImportKind,
  HelmLiftingImportStatus,
  HelmLiftingImportConfidence,
} from '@/lib/types/helm-lifting-data';
import type { Json } from '@/lib/types';

const SESSIONS_PATH = '/lifting/dashboard/sessions';

// -----------------------------------------------------------------------------
// Shared result
// -----------------------------------------------------------------------------

export interface ImportActionResult {
  success: boolean;
  runId?: string;
  totalRows?: number;
  matchedRows?: number;
  unmatchedRows?: number;
  error?: string;
}

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------

const uuid = z.string().uuid();

const importRowSchema = z.object({
  rowNumber: z.number().int().min(1),
  rawJson: z.record(z.string(), z.unknown()),
  matchedAthleteId: uuid.optional().nullable(),
  matchStatus: z.enum(['matched', 'unmatched', 'ambiguous', 'skipped']).optional(),
  validationError: z.string().max(500).optional().nullable(),
});

const initiateImportSchema = z.object({
  orgId: uuid.optional(),
  source: z.enum(['teambuildr', 'trainheroic', 'bridge', 'volt', 'google_sheets', 'csv', 'manual']),
  importKind: z.enum(['lift_assignment', 'lift_result', 'testing', 'wellness', 'attendance']),
  sport: z.enum(['baseball', 'golf']).optional(),
  fileName: z.string().max(260).optional().nullable(),
  fileHash: z.string().max(64).optional().nullable(),
  mappingJson: z.record(z.string(), z.unknown()).optional(),
  unitsJson: z.record(z.string(), z.unknown()).optional(),
  sourceConfidence: z.enum(['verified', 'reported', 'inferred']).optional(),
  rows: z.array(importRowSchema).min(1).max(5000),
});

const commitImportSchema = z.object({ orgId: uuid.optional(), runId: uuid });
const rollbackImportSchema = z.object({ orgId: uuid.optional(), runId: uuid, reason: z.string().max(500).optional().nullable() });

// -----------------------------------------------------------------------------
// 1. initiateImportRun — create staged run + validate rows
// -----------------------------------------------------------------------------

export const initiateImportRun = withLiftingAction(
  'initiateImportRun',
  {
    featureArea: 'lifting-imports',
    requireEdit: true,
    orgFrom: (...args) => (args[0] as { orgId?: string })?.orgId,
  },
  async (ctx, raw: z.input<typeof initiateImportSchema>): Promise<ImportActionResult> => {
    const input = initiateImportSchema.parse(raw);
    const supabase = await createClient();

    const totalRows = input.rows.length;
    const matchedRows = input.rows.filter((r) => r.matchStatus === 'matched').length;
    const unmatchedRows = input.rows.filter(
      (r) => !r.matchStatus || r.matchStatus === 'unmatched',
    ).length;

    const runPayload: HelmLiftingImportRunInsert = {
      organization_id: ctx.orgId,
      sport: (input.sport ?? 'baseball') as 'baseball' | 'golf',
      created_by_coach_id: ctx.access.coachRow?.id ?? null,
      source: input.source as HelmLiftingImportSource,
      import_kind: input.importKind as HelmLiftingImportKind,
      file_name: input.fileName ?? null,
      file_hash: input.fileHash ?? null,
      mapping_json: (input.mappingJson ?? {}) as Json,
      units_json: (input.unitsJson ?? {}) as Json,
      total_rows: totalRows,
      matched_rows: matchedRows,
      unmatched_rows: unmatchedRows,
      status: 'staged' as HelmLiftingImportStatus,
      source_confidence: (input.sourceConfidence ?? 'reported') as HelmLiftingImportConfidence,
    };

    const { data: run, error: runErr } = await fromUntyped(supabase, 'helm_lifting_import_runs')
      .insert(runPayload)
      .select('id')
      .single();

    if (runErr) throw runErr;
    const runId = (run as { id: string }).id;

    // Insert import rows in one batch.
    const rowPayloads: HelmLiftingImportRowInsert[] = input.rows.map((r) => ({
      import_run_id: runId,
      organization_id: ctx.orgId,
      sport: (input.sport ?? 'baseball') as 'baseball' | 'golf',
      row_number: r.rowNumber,
      raw_json: r.rawJson as Json,
      matched_athlete_id: r.matchedAthleteId ?? null,
      match_status: r.matchStatus ?? 'unmatched',
      validation_error: r.validationError ?? null,
    }));

    const { error: rowsErr } = await fromUntyped(supabase, 'helm_lifting_import_rows').insert(rowPayloads);
    if (rowsErr) {
      // Roll back the run on failure.
      await fromUntyped(supabase, 'helm_lifting_import_runs')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', runId);
      throw rowsErr;
    }

    return { success: true, runId, totalRows, matchedRows, unmatchedRows };
  },
);

// -----------------------------------------------------------------------------
// 2. commitImportRun
// -----------------------------------------------------------------------------

export const commitImportRun = withLiftingAction(
  'commitImportRun',
  {
    featureArea: 'lifting-imports',
    requireEdit: true,
    orgFrom: (...args) => (args[0] as { orgId?: string })?.orgId,
  },
  async (ctx, raw: z.input<typeof commitImportSchema>): Promise<ImportActionResult> => {
    const { runId } = commitImportSchema.parse(raw);
    const supabase = await createClient();

    const { data: run } = await fromUntyped(supabase, 'helm_lifting_import_runs')
      .select('id, organization_id, status')
      .eq('id', runId)
      .eq('organization_id', ctx.orgId)
      .maybeSingle() as { data: { id: string; organization_id: string; status: string } | null };

    if (!run) throw new LiftingActionError('Import run not found.');
    if (run.status === 'committed') return { success: true, runId };
    if (run.status !== 'staged' && run.status !== 'validated') {
      throw new LiftingActionError(`Cannot commit a run in "${run.status}" status.`);
    }

    const { error } = await fromUntyped(supabase, 'helm_lifting_import_runs')
      .update({
        status: 'committed',
        committed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', runId)
      .eq('organization_id', ctx.orgId);

    if (error) throw error;
    revalidatePath(SESSIONS_PATH);
    return { success: true, runId };
  },
);

// -----------------------------------------------------------------------------
// 3. rollbackImportRun
// -----------------------------------------------------------------------------

export const rollbackImportRun = withLiftingAction(
  'rollbackImportRun',
  {
    featureArea: 'lifting-imports',
    requireEdit: true,
    orgFrom: (...args) => (args[0] as { orgId?: string })?.orgId,
  },
  async (ctx, raw: z.input<typeof rollbackImportSchema>): Promise<ImportActionResult> => {
    const { runId, reason } = rollbackImportSchema.parse(raw);
    const supabase = await createClient();

    const { data: run } = await fromUntyped(supabase, 'helm_lifting_import_runs')
      .select('id, organization_id, status')
      .eq('id', runId)
      .eq('organization_id', ctx.orgId)
      .maybeSingle() as { data: { id: string; organization_id: string; status: string } | null };

    if (!run) throw new LiftingActionError('Import run not found.');
    if (run.status === 'rolled_back') return { success: true, runId };
    if (run.status === 'committed') {
      throw new LiftingActionError(
        'Cannot roll back a committed import — the data has been applied. Contact support if data removal is needed.',
      );
    }

    const { error } = await fromUntyped(supabase, 'helm_lifting_import_runs')
      .update({
        status: 'rolled_back',
        rolled_back_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...(reason ? { mapping_json: { rollback_reason: reason } } : {}),
      })
      .eq('id', runId)
      .eq('organization_id', ctx.orgId);

    if (error) throw error;
    return { success: true, runId };
  },
);

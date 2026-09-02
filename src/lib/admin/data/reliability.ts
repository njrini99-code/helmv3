import 'server-only';

/**
 * Helm Bridge — Reliability tab data.
 *
 * Reads the rows written by `/api/cron/reliability-triage`. Nothing here
 * collects, and nothing here mutates: the tab is a live view over the
 * collector's own record, which is why it reflects production within one
 * 3-hour cycle rather than within one deploy.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { failed, ok, type AdminFetchResult } from '@/lib/admin/fetch-result';
import { RELIABILITY_SNAPSHOT_JOB_TYPE } from '@/lib/reliability/normalize';
import type { ReliabilityRun } from '@/lib/reliability/types';
import { rcaAnalysisSchema, type RcaAnalysis } from '@/lib/admin/rca';

export interface ReliabilityRunRow {
  id: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  errorMessage: string | null;
  run: ReliabilityRun | null;
}

export interface ReliabilitySnapshot {
  latest: ReliabilityRunRow | null;
  /** Recent runs, newest first — the cadence-and-health strip. */
  history: ReliabilityRunRow[];
  /** True when the collector has never written a row. */
  neverRan: boolean;
}

const HISTORY_LIMIT = 12; // ~36 hours at a 3-hour cadence.

/**
 * A row whose metadata predates the current schema is surfaced as a run with
 * `run: null` rather than being coerced. The Bridge renders that as "recorded,
 * not readable" — an honest gap beats a confidently empty panel.
 */
function parseRun(metadata: unknown): ReliabilityRun | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const candidate = metadata as Partial<ReliabilityRun>;
  if (candidate.version !== 1) return null;
  if (!Array.isArray(candidate.signals) || !Array.isArray(candidate.sources)) return null;
  return candidate as ReliabilityRun;
}

function mapRow(row: {
  id: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  metadata: unknown;
}): ReliabilityRunRow {
  return {
    id: row.id,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMs: row.duration_ms,
    errorMessage: row.error_message,
    run: parseRun(row.metadata),
  };
}

export async function fetchReliabilitySnapshot(): Promise<AdminFetchResult<ReliabilitySnapshot>> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('background_job_logs')
    .select('id, status, started_at, completed_at, duration_ms, error_message, metadata')
    // The SNAPSHOT job type, not the cron's own: the cron-board row written by
    // `recordJobRun` carries only scalars and would render here as "recorded
    // but unreadable". See the comment on these two constants.
    .eq('job_type', RELIABILITY_SNAPSHOT_JOB_TYPE)
    .order('started_at', { ascending: false })
    .limit(HISTORY_LIMIT);

  if (error) return failed(error.message);

  const rows = (data ?? []).map(mapRow);

  return ok({
    latest: rows[0] ?? null,
    history: rows,
    // Distinct from "ran and found nothing". A collector that has never run is
    // a wiring problem; the tab must not render that as an all-clear.
    neverRan: rows.length === 0,
  });
}

/**
 * Stored root-cause analyses for a set of reliability signals, keyed by their
 * BARE signature (not the `rel:` fingerprint).
 *
 * The nightly triage writes an analysis for a reliability signal into
 * `admin_events` as an `rca_analysis` row under `fingerprint = 'rel:' +
 * signature` (see `scripts/run-triage.ts` / `triage-engine.ts`). The
 * Reliability tab holds `signal.signature` but never looked the analysis up,
 * so every one of them was invisible. This is that lookup.
 *
 * Direct batched query rather than a per-row `getStoredRcaAnalysis` call: the
 * latter is a `'use server'` action that re-runs `requireSuperAdmin()` every
 * time, and calling it once per signal (up to MAX_STORED_SIGNALS) is an N+1.
 * One `.in()` covers the whole page. Fail-soft — a missing-analysis badge must
 * never take the tab down — exactly like `queryAnalyzedFingerprints`.
 */
export async function queryRelAnalyses(
  signatures: readonly string[],
): Promise<Map<string, RcaAnalysis>> {
  const out = new Map<string, RcaAnalysis>();
  const unique = [...new Set(signatures)].filter(Boolean);
  if (unique.length === 0) return out;

  const admin = createAdminClient();
  const keys = unique.map((sig) => `rel:${sig}`);

  const { data, error } = await admin
    .from('admin_events')
    .select('fingerprint, metadata, created_at')
    .eq('event_type', 'rca_analysis')
    .in('fingerprint', keys)
    .order('created_at', { ascending: false });

  if (error) {
    // Degrade explicitly: no analyses shown, tab intact. Never throw.
    console.warn(`queryRelAnalyses: lookup failed, no analyses shown: ${error.message}`);
    return out;
  }

  // Newest-first, so the first row seen for a signature is the one to keep.
  for (const row of data ?? []) {
    const fp = typeof row.fingerprint === 'string' ? row.fingerprint : null;
    if (!fp || !fp.startsWith('rel:')) continue;
    const signature = fp.slice('rel:'.length);
    if (out.has(signature)) continue;
    const parsed = rcaAnalysisSchema.safeParse(row.metadata);
    if (parsed.success) out.set(signature, parsed.data);
  }
  return out;
}

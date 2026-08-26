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
import { RELIABILITY_JOB_TYPE } from '@/lib/reliability/normalize';
import type { ReliabilityRun } from '@/lib/reliability/types';

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
    .eq('job_type', RELIABILITY_JOB_TYPE)
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

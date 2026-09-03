'use server';

import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import {
  getTracerData,
  getTracerEnrichedData,
  getTracerRoundDiagnostic,
  fixRoundData,
  type TracerData,
  type TracerEnrichedData,
  type TracerRoundDiagnosticData,
} from '@/app/golf/actions/admin-tracer-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { reconcileObservedStepCount, extractStatusDowngrade } from '@/app/admin/traces/trace-view-helpers';

type TraceRpcClient = {
  rpc(name: string, args: Record<string, unknown>): Promise<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>;
};

export type FlightTraceRun = {
  trace_id: string;
  workflow: string;
  status: string;
  started_at: string;
  duration_ms: number | null;
  round_id: string | null;
  failure_step: string | null;
  missing_required_step_count: number;
  /**
   * Declared vs actually-recorded step counts. Returned by
   * `helm_debug_list_traces` (verified against production 2026-09-01) but
   * absent from this type until now, so the fleet summary could not read
   * them. Optional because the RPC is the contract and a store that predates
   * these columns must degrade rather than render `undefined` as a number.
   */
  expected_step_count?: number | null;
  observed_step_count?: number | null;
  /**
   * Present only on the DETAIL RPC's row (`helm_debug_get_trace`), never on
   * the fleet-list RPC's (`helm_debug_list_traces` explicitly SELECTs a fixed
   * column list that omits `metadata`, so it has nothing to read these from).
   * Set by `helm_debug_finalize_trace` (see
   * 20260901140000_trace_cannot_claim_success_while_blind.sql) when it
   * silently downgrades a caller-claimed 'success' to 'warning' because the
   * run was demonstrably blind. `bridgeGetFlightTrace` extracts these from
   * the row's own `metadata` and attaches them here; a trace never downgraded
   * (or finalized before that migration) simply won't carry them.
   */
  status_downgraded_from?: string;
  status_downgraded_reason?: string;
};

export type FlightTraceDetail = {
  run: FlightTraceRun & Record<string, unknown>;
  steps: Array<Record<string, unknown>>;
};

async function traceRpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await (createAdminClient() as unknown as TraceRpcClient).rpc(name, args);
  if (error) throw new Error(`Trace Explorer data unavailable (${error.code ?? 'unknown'}).`);
  return data;
}

/**
 * Helm Bridge → Tracer delegation. requireSuperAdmin() first (Layer 2);
 * the legacy actions then re-check users.role='admin' internally
 * (admin-tracer-data.ts:661/1296/1393) — a deliberate DOUBLE gate during
 * the transition. fixRoundData performs service-role UPDATEs on live
 * golf_rounds/golf_holes; its null-score refusal guard (the
 * `recalculate_round_totals` case refuses to write when any hole has a
 * null score — admin-tracer-data.ts:1416-1419) ships UNTOUCHED. This file
 * does not modify admin-tracer-data.ts in any way.
 */

export async function bridgeGetTracerData(): Promise<TracerData> {
  await requireSuperAdmin();
  return getTracerData();
}

/**
 * Enriched data (30d daily round/error trend + stuck-round detector) — was
 * computed by admin-tracer-data.ts and exported (`getTracerEnrichedData`)
 * but had no Bridge delegation, so `/admin/golf/tracer` never called it.
 * Same double-gate pattern as `bridgeGetTracerData` above.
 */
export async function bridgeGetTracerEnrichedData(): Promise<TracerEnrichedData> {
  await requireSuperAdmin();
  return getTracerEnrichedData();
}

/** Server/admin-only gateway for the private helm_debug trace store. */
export async function bridgeListFlightTraces(): Promise<FlightTraceRun[]> {
  await requireSuperAdmin();
  const data = await traceRpc('helm_debug_list_traces', { p_limit: 50, p_workflow: null, p_round_id: null });
  return Array.isArray(data) ? data as FlightTraceRun[] : [];
}

export async function bridgeGetFlightTrace(traceId: string): Promise<FlightTraceDetail | null> {
  await requireSuperAdmin();
  const data = await traceRpc('helm_debug_get_trace', { p_trace_id: traceId });
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const detail = data as Partial<FlightTraceDetail>;
  if (!detail.run || !Array.isArray(detail.steps)) return null;

  // Reconcile the DB's own (possibly-stale) counter against the steps array
  // this same response just returned, so a trace once opened can never show
  // a different "steps observed" number in its KPI strip than in its tree —
  // see reconcileObservedStepCount's doc comment for the full reasoning and
  // its documented scope boundary (unopened fleet-list rows are unaffected).
  const reconciledRun = reconcileObservedStepCount(detail.run, detail.steps.length);

  // status_downgraded_from/reason live only inside the run's own `metadata`
  // column, which helm_debug_get_trace returns in full (to_jsonb(r)).
  const downgrade = extractStatusDowngrade((detail.run as Record<string, unknown>).metadata);

  return {
    run: downgrade
      ? { ...reconciledRun, status_downgraded_from: downgrade.from, status_downgraded_reason: downgrade.reason }
      : reconciledRun,
    steps: detail.steps,
  };
}

export async function bridgeGetTracerRoundDiagnostic(
  roundId: string,
): Promise<TracerRoundDiagnosticData> {
  await requireSuperAdmin();
  return getTracerRoundDiagnostic(roundId);
}

export async function bridgeFixRoundData(
  ...args: Parameters<typeof fixRoundData>
): ReturnType<typeof fixRoundData> {
  await requireSuperAdmin();
  return fixRoundData(...args);
}

import 'server-only';

/**
 * Trace funnels — Bridge Control Plane Phase D.6.
 *
 * A DIFFERENT read of the same `helm_debug_list_traces` RPC
 * `/admin/traces` already uses (`src/app/admin/actions/golf-tracer.ts`'s
 * `bridgeListFlightTraces`) — that page opens ONE trace at a time
 * (containment tree, checkpoint-vs-never-ran); this asks the fleet
 * question: across the last N runs of a workflow, where does attrition
 * happen, and how often does a run reach every required step. Same RPC
 * called independently (not through that action file) so this module has
 * no coupling to a page it does not own — only the `FlightTraceRun` TYPE is
 * reused, to avoid re-declaring the RPC's row shape.
 *
 * WORKFLOW LIST: `GolfRoundWorkflow`'s ten members are not enumerable at
 * runtime, so `WORKFLOW_PRESENCE` below is a compile-time exhaustiveness
 * check — `Record<GolfRoundWorkflow, true>` requires every union member as
 * a key, so adding a workflow without updating this file fails typecheck
 * rather than silently excluding it from every funnel.
 *
 * BOUNDED, NOT BLIND: `helm_debug_list_traces` has no server-side count
 * endpoint, so `hitCeiling` (sampledRuns === the read's own limit) is the
 * same conservative-boundary signal `qualifier-logic.ts`'s `BoundedFetch`
 * uses — true at the exact boundary because the read cannot tell "exactly
 * N" apart from "more than N" without another round-trip.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import type { GolfRoundWorkflow } from '@/lib/observability/golf-round-flight-workflow';
import type { FlightTraceRun } from '@/app/admin/actions/golf-tracer';

const WORKFLOW_PRESENCE: Record<GolfRoundWorkflow, true> = {
  'golf.round.start': true,
  'golf.shot.add_or_edit': true,
  'golf.hole.complete': true,
  'golf.round.autosave': true,
  'golf.round.resume': true,
  'golf.shot.delete': true,
  'golf.round.submit': true,
  'golf.qualifier.submit': true,
  'golf.stats.refresh': true,
  'golf.coachhelm.post_round': true,
};
/** Declared order, not volume-sorted — a rare-but-critical workflow
 *  (`golf.qualifier.submit`) must never disappear off the bottom of a
 *  volume-ranked list. */
const ALL_WORKFLOWS = Object.keys(WORKFLOW_PRESENCE) as GolfRoundWorkflow[];

const RUNS_PER_WORKFLOW = 100;
const TOP_DROPOFFS = 5;

export interface StepDropoff {
  step: string;
  failedCount: number;
}

export interface WorkflowFunnel {
  workflow: GolfRoundWorkflow;
  status: 'ok' | 'error';
  error: string | null;
  sampledRuns: number;
  hitCeiling: boolean;
  statusCounts: Readonly<Record<string, number>>;
  /** Runs whose `missing_required_step_count > 0` — reached "done" without
   *  every required step actually recorded. */
  missingRequiredStepRuns: number;
  /** `failure_step` tallied and ranked worst-first, capped at
   *  `TOP_DROPOFFS` — where attrition actually concentrates. */
  dropoffs: readonly StepDropoff[];
}

export interface TraceFunnelReport {
  generatedAt: string;
  funnels: readonly WorkflowFunnel[];
}

async function fetchWorkflowRuns(workflow: GolfRoundWorkflow): Promise<{ rows: FlightTraceRun[]; error: string | null }> {
  const admin = createAdminClient();
  const { data, error } = await (admin as unknown as {
    rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>;
  }).rpc('helm_debug_list_traces', { p_limit: RUNS_PER_WORKFLOW, p_workflow: workflow, p_round_id: null });

  if (error) return { rows: [], error: error.message };
  return { rows: Array.isArray(data) ? (data as FlightTraceRun[]) : [], error: null };
}

/** Pure — exported for direct unit testing without mocking Supabase. */
export function buildFunnel(workflow: GolfRoundWorkflow, rows: FlightTraceRun[]): WorkflowFunnel {
  const statusCounts: Record<string, number> = {};
  const dropoffCounts = new Map<string, number>();
  let missingRequiredStepRuns = 0;

  for (const row of rows) {
    statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;
    if (row.missing_required_step_count > 0) missingRequiredStepRuns += 1;
    if (row.failure_step) dropoffCounts.set(row.failure_step, (dropoffCounts.get(row.failure_step) ?? 0) + 1);
  }

  const dropoffs = Array.from(dropoffCounts.entries())
    .map(([step, failedCount]) => ({ step, failedCount }))
    .sort((a, b) => b.failedCount - a.failedCount)
    .slice(0, TOP_DROPOFFS);

  return {
    workflow,
    status: 'ok',
    error: null,
    sampledRuns: rows.length,
    hitCeiling: rows.length === RUNS_PER_WORKFLOW,
    statusCounts,
    missingRequiredStepRuns,
    dropoffs,
  };
}

/**
 * One RPC call per workflow, fault-isolated: a failing workflow reports its
 * own `status: 'error'` row rather than taking the whole funnel report down
 * — matches the collector's per-arm isolation rule.
 */
export async function fetchTraceFunnels(now: Date = new Date()): Promise<TraceFunnelReport> {
  const settled = await Promise.allSettled(ALL_WORKFLOWS.map((w) => fetchWorkflowRuns(w)));

  const funnels: WorkflowFunnel[] = settled.map((outcome, i) => {
    const workflow = ALL_WORKFLOWS[i]!;
    if (outcome.status === 'rejected') {
      return {
        workflow,
        status: 'error',
        error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
        sampledRuns: 0,
        hitCeiling: false,
        statusCounts: {},
        missingRequiredStepRuns: 0,
        dropoffs: [],
      };
    }
    if (outcome.value.error) {
      return {
        workflow,
        status: 'error',
        error: outcome.value.error,
        sampledRuns: 0,
        hitCeiling: false,
        statusCounts: {},
        missingRequiredStepRuns: 0,
        dropoffs: [],
      };
    }
    return buildFunnel(workflow, outcome.value.rows);
  });

  return { generatedAt: now.toISOString(), funnels };
}

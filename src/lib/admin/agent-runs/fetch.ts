import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { failed, ok, unconfigured, type AdminFetchResult } from '@/lib/admin/fetch-result';
import type { AgentRunDetail, AgentRunListRow, AgentVerifierVerdict, AgentProductionOutcome, AgentRunStatus } from './types';

type AgentRunListRpcRow = {
  run_id: string;
  workflow: string;
  status: string;
  incident_fingerprint: string | null;
  charter: string | null;
  verifier_verdict: string | null;
  production_outcome: string | null;
  confidence: number | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
};

type AgentRunGetRpcRow = AgentRunListRpcRow & {
  hypotheses: unknown;
  context_loaded: unknown;
  tools_used: unknown;
  files_changed: unknown;
  verification: unknown;
};

function toListRow(row: AgentRunListRpcRow): AgentRunListRow {
  return {
    runId: row.run_id,
    workflow: row.workflow,
    status: row.status as AgentRunStatus,
    incidentFingerprint: row.incident_fingerprint,
    charter: row.charter,
    verifierVerdict: row.verifier_verdict as AgentVerifierVerdict | null,
    productionOutcome: row.production_outcome as AgentProductionOutcome | null,
    confidence: row.confidence,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms,
  };
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** Pure — no I/O, safe to unit test without a client. */
export function toAgentRunDetail(row: AgentRunGetRpcRow): AgentRunDetail {
  return {
    ...toListRow(row),
    hypotheses: toStringArray(row.hypotheses),
    contextLoaded: toStringArray(row.context_loaded),
    toolsUsed: toStringArray(row.tools_used),
    filesChanged: toStringArray(row.files_changed),
    verification: (row.verification as AgentRunDetail['verification']) ?? {},
  };
}

/** True for the specific "the migration hasn't shipped yet" shape this
 *  repo's own precedent (player-detail.ts's flight-trace section,
 *  traces/page.tsx's loadTraces()) treats as an expected environment fact,
 *  not an incident — undefined_function (42883) / undefined_table (42P01),
 *  or the same wording from a non-PostgrestError throw. */
function isUnappliedMigrationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: string })?.code;
  return code === '42883' || code === '42P01' || /does not exist/i.test(message);
}

type AgentRunReadRpcClient = {
  rpc(
    name: 'helm_debug_list_agent_runs',
    args: { p_limit: number; p_workflow: string | null; p_status: string | null },
  ): Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
  rpc(
    name: 'helm_debug_get_agent_run',
    args: { p_run_id: string },
  ): Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
};

export interface AgentRunListInput {
  limit?: number;
  workflow?: string;
  status?: string;
}

export async function fetchAgentRuns(input: AgentRunListInput = {}): Promise<AdminFetchResult<AgentRunListRow[]>> {
  try {
    const client = createAdminClient() as unknown as AgentRunReadRpcClient;
    const { data, error } = await client.rpc('helm_debug_list_agent_runs', {
      p_limit: input.limit ?? 50,
      p_workflow: input.workflow ?? null,
      p_status: input.status ?? null,
    });
    if (error) {
      if (isUnappliedMigrationError(error)) {
        return unconfigured('Agent Flight Recorder (helm_debug.agent_runs migration not yet applied)');
      }
      return failed(`${error.code ?? 'AGENT_RUNS_RPC'}: ${error.message}`);
    }
    const rows = Array.isArray(data) ? (data as AgentRunListRpcRow[]) : [];
    return ok(rows.map(toListRow));
  } catch (error) {
    if (isUnappliedMigrationError(error)) {
      return unconfigured('Agent Flight Recorder (helm_debug.agent_runs migration not yet applied)');
    }
    return failed(error instanceof Error ? error.message : String(error));
  }
}

export async function fetchAgentRun(runId: string): Promise<AdminFetchResult<AgentRunDetail | null>> {
  try {
    const client = createAdminClient() as unknown as AgentRunReadRpcClient;
    const { data, error } = await client.rpc('helm_debug_get_agent_run', { p_run_id: runId });
    if (error) {
      if (isUnappliedMigrationError(error)) {
        return unconfigured('Agent Flight Recorder (helm_debug.agent_runs migration not yet applied)');
      }
      return failed(`${error.code ?? 'AGENT_RUN_GET_RPC'}: ${error.message}`);
    }
    const row = data as AgentRunGetRpcRow | Record<string, never> | null;
    if (!row || !('run_id' in row)) return ok(null);
    return ok(toAgentRunDetail(row as AgentRunGetRpcRow));
  } catch (error) {
    if (isUnappliedMigrationError(error)) {
      return unconfigured('Agent Flight Recorder (helm_debug.agent_runs migration not yet applied)');
    }
    return failed(error instanceof Error ? error.message : String(error));
  }
}

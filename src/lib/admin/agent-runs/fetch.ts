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

/**
 * True for the specific "the migration hasn't shipped yet" shape this repo's
 * own precedent treats as an expected environment fact, not an incident —
 * matches `src/app/api/cron/helm-debug-prune/route.ts`'s
 * `isMigrationNotAppliedError` exactly (same four codes, same message
 * fallbacks), because this RPC is in the identical position: HELD migration,
 * PostgREST-exposed facade. While the migration is HELD, PostgREST cannot
 * resolve the RPC name at all and answers `PGRST202` ("Could not find the
 * function public.helm_debug_list_agent_runs(...) in the schema cache") —
 * NOT `42883`/`42P01`, which only fire if the function exists but the
 * `helm_debug` schema/tables it queries do not (`3F000` invalid_schema_name
 * covers that second shape too). Without `PGRST202` here, every 60s
 * `AutoRefresh` poll on `/admin/engineering` returned `failed(...)` and
 * rendered a red `role="alert"` "read failed" panel instead of the
 * not-yet-live `PanelNoData` state — a routine, expected environment fact
 * reading as a production incident.
 */
const MIGRATION_NOT_APPLIED_CODES = new Set(['PGRST202', '42883', '42P01', '3F000']);

function isUnappliedMigrationError(error: unknown): boolean {
  if (!error) return false;
  const code = (error as { code?: string }).code ?? '';
  if (MIGRATION_NOT_APPLIED_CODES.has(code)) return true;

  // The RPC-error-result shape ({code, message}, not an Error instance) and
  // the catch-block throw shape (a real Error) carry the message on
  // different property paths that both happen to be `.message` — but
  // `String(someNonErrorObject)` yields "[object Object]", not its message,
  // so extract `.message` directly rather than gating on `instanceof Error`.
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : String(error);
  const message = rawMessage.toLowerCase();
  return (
    message.includes('could not find the function') ||
    (message.includes('function') && message.includes('does not exist')) ||
    (message.includes('relation') && message.includes('does not exist')) ||
    (message.includes('schema') && message.includes('does not exist'))
  );
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

import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import type { AgentRunRecord } from './types';

/** Mirrors `helm_private.agent_run_safe_payload`'s strip list in the
 *  migration — defense in depth, not a substitute for it: the DB facade is
 *  the actual boundary, this just keeps an obviously-wrong payload from
 *  ever leaving the process. */
const UNSAFE_PAYLOAD_KEYS = new Set([
  'authorization', 'cookie', 'cookies', 'token', 'access_token',
  'refresh_token', 'service_role', 'service_role_key', 'password',
  'raw_prompt', 'raw_transcript', 'headers', 'anthropic_api_key',
]);

/** Hard cap on any string field this table stores. Hypotheses and charter
 *  are short structured summaries, never a prompt or a model transcript —
 *  this is the backstop if a caller passes one by mistake. */
const MAX_STRING_LEN = 600;
const MAX_LIST_ITEMS = 40;

function clampString(value: string): string {
  return value.length > MAX_STRING_LEN ? `${value.slice(0, MAX_STRING_LEN)}…[truncated]` : value;
}

function clampList(values: readonly string[] | undefined): string[] {
  if (!values) return [];
  return values.slice(0, MAX_LIST_ITEMS).map((v) => clampString(String(v)));
}

function sanitizeMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!metadata) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (UNSAFE_PAYLOAD_KEYS.has(key.toLowerCase())) continue;
    out[key] = typeof value === 'string' ? clampString(value) : value;
  }
  return out;
}

/**
 * Pure — builds the `p_payload` jsonb argument for `helm_debug_record_agent_run`.
 * No I/O, no `server-only`, so a test can assert the sanitized shape without
 * standing up an admin client.
 */
export function buildAgentRunPayload(input: AgentRunRecord): Record<string, unknown> {
  return {
    incident_fingerprint: input.incidentFingerprint ?? null,
    charter: input.charter ? clampString(input.charter) : null,
    hypotheses: clampList(input.hypotheses),
    context_loaded: clampList(input.contextLoaded),
    tools_used: clampList(input.toolsUsed),
    files_changed: clampList(input.filesChanged),
    verification: input.verification ?? {},
    verifier_verdict: input.verifierVerdict ?? null,
    production_outcome: input.productionOutcome ?? null,
    // Never write 1 — matches classifyReleaseRelationship's convention in
    // src/lib/admin/incidents/release-context.ts.
    confidence: input.confidence == null ? null : Math.min(input.confidence, 0.95),
    started_at: input.startedAt ?? null,
    duration_ms: input.durationMs ?? null,
    ...sanitizeMetadata(input.metadata),
  };
}

type AgentRunRpcClient = {
  rpc(
    name: 'helm_debug_record_agent_run',
    args: { p_run_id: string; p_workflow: string; p_status: string; p_payload: Record<string, unknown> },
  ): Promise<{ error: { code?: string; message: string } | null }>;
};

export interface RecordAgentRunDependencies {
  rpc(args: { p_run_id: string; p_workflow: string; p_status: string; p_payload: Record<string, unknown> }): Promise<{
    error: { code?: string; message: string } | null;
  }>;
  onFailure(error: unknown, context: { runId: string; workflow: string }): void;
}

function defaultDependencies(): RecordAgentRunDependencies {
  return {
    rpc: (args) => (createAdminClient() as unknown as AgentRunRpcClient).rpc('helm_debug_record_agent_run', args),
    onFailure: (error, context) => {
      console.warn('[agent-flight-recorder] record write failed (fail-open, request unaffected)', {
        runId: context.runId,
        workflow: context.workflow,
        error: error instanceof Error ? error.message : String(error),
      });
    },
  };
}

/**
 * Records (inserts or upserts) one agent run. FAIL-OPEN: never throws. The
 * migration this calls is HELD (not yet applied in production) — until the
 * owner applies it, every call is expected to swallow a "function
 * helm_debug_record_agent_run(...) does not exist" error exactly like the
 * golf Flight Recorder did while `20260825200811` sat unapplied (see that
 * migration's HELD.md row). Callers must pass the run's FULL current state
 * on every call, not a delta — the RPC overwrites structured columns on
 * conflict rather than merging them (see the migration's own header).
 */
export async function recordAgentRun(
  input: AgentRunRecord,
  deps: RecordAgentRunDependencies = defaultDependencies(),
): Promise<void> {
  try {
    const { error } = await deps.rpc({
      p_run_id: input.runId,
      p_workflow: input.workflow,
      p_status: input.status,
      p_payload: buildAgentRunPayload(input),
    });
    if (error) {
      deps.onFailure(new Error(`${error.code ?? 'AGENT_RUN_RPC'}: ${error.message}`), {
        runId: input.runId,
        workflow: input.workflow,
      });
    }
  } catch (error) {
    deps.onFailure(error, { runId: input.runId, workflow: input.workflow });
  }
}

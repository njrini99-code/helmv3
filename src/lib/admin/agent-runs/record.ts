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

/**
 * `metadata` is caller-supplied "any additional non-sensitive detail"
 * (`AgentRunRecord.metadata`'s own doc comment) — unlike every other field
 * on this type, its shape is not fixed by `AgentRunRecord`, so the ORIGINAL
 * top-level-only `sanitizeMetadata` clamped a string value one level deep
 * and passed anything else (nested objects, arrays of objects) through
 * completely unbounded. A caller building `metadata.contextSnapshot` from a
 * few KB of surrounding state — plausible for a self-heal Diagnose run —
 * would write it whole, defeating every other clamp on this file and
 * relying entirely on the migration's own strip-list (`helm_private.
 * agent_run_safe_payload`, which only strips known TOP-LEVEL keys, same
 * gap). These four bounds apply at every nesting level, not just the top:
 */
const MAX_METADATA_DEPTH = 4;
const MAX_KEYS_PER_LEVEL = 40;
/** Budget for the metadata subtree's total serialized size — independent of
 *  and in addition to the per-string/per-list caps above, because many
 *  small strings under those caps can still sum to an unbounded blob. */
const MAX_METADATA_BYTES = 32_000;

function clampString(value: string): string {
  return value.length > MAX_STRING_LEN ? `${value.slice(0, MAX_STRING_LEN)}…[truncated]` : value;
}

function clampList(values: readonly string[] | undefined): string[] {
  if (!values) return [];
  return values.slice(0, MAX_LIST_ITEMS).map((v) => clampString(String(v)));
}

/** Shared mutable budget threaded through the whole recursive sanitize pass
 *  — a `{ remaining }` box rather than a return value, so every recursive
 *  call (arrays, nested objects) draws from the SAME pool instead of each
 *  subtree getting its own independent 32KB allowance. */
interface MetadataBudget {
  remainingBytes: number;
}

function sanitizeMetadataValue(value: unknown, depth: number, budget: MetadataBudget): unknown {
  if (budget.remainingBytes <= 0) return '[budget-exceeded]';

  if (value === null || value === undefined) return value ?? null;

  if (typeof value === 'string') {
    const clamped = clampString(value);
    budget.remainingBytes -= clamped.length;
    return clamped;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    budget.remainingBytes -= 8;
    return value;
  }

  if (depth >= MAX_METADATA_DEPTH) return '[max-depth-exceeded]';

  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const item of value.slice(0, MAX_LIST_ITEMS)) {
      if (budget.remainingBytes <= 0) break;
      out.push(sanitizeMetadataValue(item, depth + 1, budget));
    }
    return out;
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>).slice(0, MAX_KEYS_PER_LEVEL)) {
      if (budget.remainingBytes <= 0) break;
      if (UNSAFE_PAYLOAD_KEYS.has(key.toLowerCase())) continue;
      budget.remainingBytes -= key.length;
      out[key] = sanitizeMetadataValue(nested, depth + 1, budget);
    }
    return out;
  }

  // function, symbol, bigint — nothing this table's caller should ever send.
  return null;
}

function sanitizeMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!metadata) return {};
  const budget: MetadataBudget = { remainingBytes: MAX_METADATA_BYTES };
  return sanitizeMetadataValue(metadata, 0, budget) as Record<string, unknown>;
}

/**
 * Pure — builds the `p_payload` jsonb argument for `helm_debug_record_agent_run`.
 * No I/O and no dependency on anything the module-level `import 'server-
 * only'` above guards against (that import exists for `recordAgentRun`'s
 * `createAdminClient()` call, not for this function) — a test can assert
 * the sanitized shape directly, without standing up an admin client or
 * running under a server-only-aware bundler.
 */
export function buildAgentRunPayload(input: AgentRunRecord): Record<string, unknown> {
  return {
    // Spread FIRST, not last: `metadata` is caller-supplied and this repo's
    // own convention (`helm_private.trace_safe_metadata`'s comment,
    // `agent_run_safe_payload`'s in this file's migration) treats it as the
    // untrusted half of the payload. Spread last meant a metadata key
    // matching a structured column name (e.g. `{ confidence: 1 }` inside
    // `metadata`) silently OVERWROTE the clamped/capped value computed
    // below — defeating the confidence cap and every clamp() call in one
    // move. Structured fields are now the last, and therefore winning,
    // writes.
    ...sanitizeMetadata(input.metadata),
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
    finished_at: input.finishedAt ?? null,
    duration_ms: input.durationMs ?? null,
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

/** Matches `helm-flight-recorder.ts`'s `PERSIST_START_TIMEOUT_MS` — the same
 *  shape of risk (a service-role RPC against `helm_debug`, which this run's
 *  caller — self-heal Diagnose/Repair — must never be blocked behind). */
export const RECORD_AGENT_RUN_TIMEOUT_MS = 1500;

/**
 * Resolves `'settled'` once `promise` settles, or `'timeout'` after `ms` —
 * whichever comes first. Copied from (not imported from) `helm-flight-
 * recorder.ts`'s own `raceAgainstTimeout`, which is module-private there —
 * small enough to duplicate rather than promote to a shared util for two
 * call sites. Never rejects: the caller here always passes a promise
 * produced inside the surrounding try/catch, whose own rejection path is
 * handled by that catch, but the `.catch` below stays as a second line of
 * defense against a future edit turning this into an unhandled rejection.
 */
function raceAgainstTimeout(promise: Promise<unknown>, ms: number): Promise<'settled' | 'timeout'> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve('timeout'), ms);
    const settle = () => {
      clearTimeout(timer);
      resolve('settled');
    };
    promise.then(settle, settle);
  });
}

/**
 * Records (inserts or upserts) one agent run. FAIL-OPEN: never throws, and
 * never blocks its caller past `RECORD_AGENT_RUN_TIMEOUT_MS` — a hung RPC
 * (network partition, a Postgres statement stuck behind a lock on
 * `helm_debug.agent_runs`) must not stall the self-heal loop that calls
 * this mid-run, the same reasoning `helm-flight-recorder.ts`'s own
 * `PERSIST_START_TIMEOUT_MS` race documents for the golf trace recorder.
 * On timeout the underlying RPC promise keeps running in the background
 * (JS has no true cancellation, and Supabase's client offers none here) —
 * this function simply stops WAITING for it and reports the timeout via
 * `onFailure` instead of leaving the caller blocked.
 *
 * The migration this calls is HELD (not yet applied in production) — until
 * the owner applies it, every call is expected to swallow a "function
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
    const rpcPromise = deps.rpc({
      p_run_id: input.runId,
      p_workflow: input.workflow,
      p_status: input.status,
      p_payload: buildAgentRunPayload(input),
    });
    const outcome = await raceAgainstTimeout(rpcPromise, RECORD_AGENT_RUN_TIMEOUT_MS);
    if (outcome === 'timeout') {
      deps.onFailure(new Error(`recordAgentRun exceeded ${RECORD_AGENT_RUN_TIMEOUT_MS}ms`), {
        runId: input.runId,
        workflow: input.workflow,
      });
      return;
    }
    const { error } = await rpcPromise;
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

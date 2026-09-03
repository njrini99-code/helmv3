/**
 * Agent Flight Recorder — shared types.
 *
 * One row per autonomous Claude run (self-heal Diagnose/Repair today; any
 * future workflow tomorrow), stored in `helm_debug.agent_runs`
 * (`supabase/migrations/20260903150000_helm_debug_agent_runs.sql`, HELD —
 * not yet applied). Distinct from the golf round Flight Recorder
 * (`helm_debug.trace_runs`/`trace_steps`), which traces one database
 * mutation, not one agent's reasoning.
 */

export type AgentRunStatus = 'started' | 'success' | 'failure' | 'rejected' | 'pending';

export type AgentVerifierVerdict = 'accept' | 'reject' | 'not_run';

export type AgentProductionOutcome = 'proven' | 'regressed' | 'unknown' | 'pending';

/** Free-form `namespace.verb`. Not a closed union at the DB layer (see the
 *  migration's own comment on why the CHECK was dropped) — these are the
 *  values this repo's one live agent loop actually writes today. */
export type AgentRunWorkflow = 'selfheal.diagnose' | 'selfheal.repair' | (string & {});

export interface AgentRunVerification {
  adversary?: { verdict: AgentVerifierVerdict; note?: string };
  security?: { verdict: AgentVerifierVerdict; note?: string };
  product?: { verdict: AgentVerifierVerdict; note?: string };
  judge?: { verdict: AgentVerifierVerdict; note?: string };
}

/** What `record.ts` sends and what the read model gets back — the row shape,
 *  minus DB-only bookkeeping columns (`id`, `created_at`). */
export interface AgentRunRecord {
  runId: string;
  workflow: AgentRunWorkflow;
  status: AgentRunStatus;
  incidentFingerprint?: string | null;
  /** What the agent was asked to do — one or two sentences, never a raw
   *  prompt or transcript. */
  charter?: string | null;
  /** Short hypothesis strings, most-considered first — not full reasoning. */
  hypotheses?: readonly string[];
  /** File paths / doc ids the run actually read, not their contents. */
  contextLoaded?: readonly string[];
  toolsUsed?: readonly string[];
  filesChanged?: readonly string[];
  verification?: AgentRunVerification;
  verifierVerdict?: AgentVerifierVerdict | null;
  productionOutcome?: AgentProductionOutcome | null;
  /** Never 1 — see release-context.ts's classifyReleaseRelationship for the
   *  same convention applied to release-relationship confidence. */
  confidence?: number | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  durationMs?: number | null;
  /** Any additional non-sensitive detail. Sanitized twice: once here
   *  (`sanitizeAgentRunPayload`) and again inside the DB facade
   *  (`helm_private.agent_run_safe_payload`). */
  metadata?: Record<string, unknown>;
}

/** The list-row projection `helm_debug_list_agent_runs` returns — compact,
 *  no hypotheses/context/tools/files/verification blobs (those load on
 *  demand via `fetchAgentRun`). */
export interface AgentRunListRow {
  runId: string;
  workflow: string;
  status: AgentRunStatus;
  incidentFingerprint: string | null;
  charter: string | null;
  verifierVerdict: AgentVerifierVerdict | null;
  productionOutcome: AgentProductionOutcome | null;
  confidence: number | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
}

export interface AgentRunDetail extends AgentRunListRow {
  hypotheses: readonly string[];
  contextLoaded: readonly string[];
  toolsUsed: readonly string[];
  filesChanged: readonly string[];
  verification: AgentRunVerification;
}

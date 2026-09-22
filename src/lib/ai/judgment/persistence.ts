/**
 * Private persistence for judgments: `helm_debug.judgment_evaluations` via
 * the service-role-only facade `public.helm_debug_record_judgment(jsonb)`
 * (supabase/migrations/20260917090000_helm_judgment_evaluations.sql).
 *
 * Best-effort: a persistence failure is logged and the judgment still
 * returns. The raw provider state is never stored — only its hash, an
 * allowlisted summary, the normalized answers and the policy outcome.
 */

import 'server-only';
import type { JudgmentResult } from './types';

type RpcClient = {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
};

export interface PersistJudgmentInput {
  result: JudgmentResult;
  environment: string;
  entityType: string;
  entityKeyHash: string | null;
  traceId: string | null;
  evidenceSummary: Record<string, unknown>;
}

export async function persistJudgment(input: PersistJudgmentInput, client?: RpcClient): Promise<string | null> {
  try {
    const rpc = client ?? ((await import('@/lib/supabase/admin')).createAdminClient() as unknown as RpcClient);
    const r = input.result;
    const { data, error } = await rpc.rpc('helm_debug_record_judgment', {
      p_row: {
        use_case: r.useCase,
        evaluator_version: r.evaluatorVersion,
        policy_version: r.policyVersion,
        provider: r.provider,
        model_id: r.modelId,
        environment: input.environment,
        mode: r.mode,
        entity_type: input.entityType,
        entity_key_hash: input.entityKeyHash,
        trace_id: input.traceId,
        state_hash: r.stateHash,
        evidence_summary: input.evidenceSummary,
        answers: r.answers,
        disposition: r.disposition,
        reason_codes: r.reasonCodes,
        duration_ms: r.durationMs,
        provider_error_code: r.providerErrorCode,
      },
    });
    if (error) throw new Error(error.message);
    return typeof data === 'string' ? data : null;
  } catch (error) {
    const { logServerError } = await import('@/lib/server-error-logger');
    await logServerError(
      `judgment: persist failed for ${input.result.useCase} (${error instanceof Error ? error.message : 'unknown'})`,
      { action: 'helm.judgment.persist_failed', featureArea: 'judgment', skipSentry: true },
      'warning',
    ).catch(() => undefined);
    return null;
  }
}

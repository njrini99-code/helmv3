/**
 * Judgment metrics ride the existing server trace pipeline
 * (`logServerEvent` → admin_events/Sentry) under stable action names so
 * the Bridge can chart them. No player/team dimensions — ever.
 */

import { logServerEvent } from '@/lib/server-error-logger';
import type { JudgmentResult } from './types';

export const JUDGMENT_METRIC_ACTIONS = {
  call: 'helm.judgment.call',
  error: 'helm.judgment.error',
  unassessed: 'helm.judgment.unassessed',
  disagreement: 'helm.judgment.disagreement',
} as const;

export async function recordJudgmentTelemetry(result: JudgmentResult, extra: Record<string, unknown> = {}): Promise<void> {
  const action = result.providerErrorCode
    ? JUDGMENT_METRIC_ACTIONS.error
    : result.disposition === 'unassessed'
      ? JUDGMENT_METRIC_ACTIONS.unassessed
      : JUDGMENT_METRIC_ACTIONS.call;
  await logServerEvent(
    `judgment: ${result.useCase} ${result.disposition}${result.shadow ? ' (shadow)' : ''}`,
    {
      action,
      featureArea: 'judgment',
      skipSentry: true,
      extra: {
        use_case: result.useCase,
        evaluator_version: result.evaluatorVersion,
        policy_version: result.policyVersion,
        mode: result.mode,
        disposition: result.disposition,
        reason_codes: result.reasonCodes,
        duration_ms: result.durationMs,
        provider_error_code: result.providerErrorCode,
        state_hash: result.stateHash,
        evaluation_id: result.evaluationId,
        ...extra,
      },
    },
    result.providerErrorCode ? 'warning' : 'info',
  ).catch(() => undefined);
}

/**
 * Per-user gates for expensive server actions.
 *
 * 2026-05-23: All user-callable CoachHelm engine entrypoints rate-limit at
 * 5/min/user — the engine runs are multi-second jobs that load shots, mine
 * patterns, predict, and write multiple tables. Without this, an authenticated
 * coach can hold a function instance hostage with a tight loop across the
 * roster. Audit finding P0-11.
 *
 * 2026-08-01: lifted out of insights.ts so alerts.ts, round-recap.ts,
 * schedule-image.ts and v3/llm.ts share ONE definition instead of five.
 * DB-backed limiter on purpose — it is correct across serverless instances
 * unconditionally, unlike the Upstash-or-memory tiering in ./rate-limit.
 */

import { checkRateLimit } from '@/lib/auth/supabase-rate-limit';

export type ActionGateResult = { allowed: true } | { allowed: false; error: string };

export const COACHHELM_ENGINE_RATE_LIMIT = { maxAttempts: 5, windowMs: 60 * 1000 } as const;
/** LLM prose composition — cheaper than an engine run, still billable. */
export const LLM_COMPOSE_RATE_LIMIT = { maxAttempts: 10, windowMs: 60 * 1000 } as const;
/** Vision extraction — hourly, because each call is a full-image model call. */
export const VISION_EXTRACT_RATE_LIMIT = { maxAttempts: 5, windowMs: 60 * 60 * 1000 } as const;

/**
 * Generic per-user gate. `bucket` namespaces the key so two features cannot
 * share a counter.
 */
export async function gateUserAction(
  bucket: string,
  userId: string | undefined,
  config: { maxAttempts: number; windowMs: number; blockDurationMs?: number },
  error: string,
): Promise<ActionGateResult> {
  if (!userId) return { allowed: true }; // pre-auth callers already rejected upstream
  const rl = await checkRateLimit(`${bucket}:${userId}`, config);
  return rl.allowed ? { allowed: true } : { allowed: false, error };
}

export async function gateCoachHelmEngineCall(
  userId: string | undefined,
): Promise<ActionGateResult> {
  return gateUserAction(
    'coachhelm:engine',
    userId,
    COACHHELM_ENGINE_RATE_LIMIT,
    'Too many analyze requests in the last minute — please wait a moment and try again.',
  );
}

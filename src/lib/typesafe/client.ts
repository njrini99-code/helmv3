/**
 * TypeSafe (Jev) System One client — server-side only.
 *
 * Jev answers narrow typed questions (yes/no probability, choice, ordered
 * score) over a JSON state in ~150–600 ms. It never generates prose. Code
 * owns the workflow; Jev supplies the semantic judgment. Docs:
 * https://docs.typesafe.ai/api.md
 *
 * Contract for every caller in this repo:
 *   - Absent key ⇒ `askJev` resolves `null`. Every consumer must treat null
 *     as "no opinion" and fall through to today's deterministic behaviour.
 *   - Any transport/API error ⇒ `null`, logged once at 'warning'. A judgment
 *     call must never fail the request that asked for it (chat persist,
 *     recap save, cron triage).
 *   - The key is `TYPESAFE_API_KEY`; there is no `NEXT_PUBLIC_` variant and
 *     this module must not be imported from client components.
 */

import 'server-only';
import { TypeSafeClient, type Questions, type SystemOneResult } from '@typesafe-ai/sdk';

export const TYPESAFE_MODEL = process.env.TYPESAFE_MODEL?.trim() || 'jev-latest';

/** Per-attempt timeout. Jev is fast; anything slower than this is an outage. */
const DEFAULT_TIMEOUT_MS = 4_000;

let cached: TypeSafeClient | null | undefined;

export function isTypeSafeConfigured(): boolean {
  return Boolean(process.env.TYPESAFE_API_KEY?.trim());
}

function getClient(): TypeSafeClient | null {
  if (cached !== undefined) return cached;
  const apiKey = process.env.TYPESAFE_API_KEY?.trim();
  if (!apiKey) {
    cached = null;
    return cached;
  }
  cached = new TypeSafeClient({
    apiKey,
    defaultModel: TYPESAFE_MODEL,
    timeout: DEFAULT_TIMEOUT_MS,
    // One retry only: these calls sit in request paths and cron loops where
    // a second 5 s backoff costs more than the judgment is worth.
    retry: { maxRetries: 1, backoffMaxMs: 1_000 },
  });
  return cached;
}

/** Test seam: drop the memoised client so a test can swap the env/fetch. */
export function __resetTypeSafeClientForTests(): void {
  cached = undefined;
}

export interface JevResult<Q extends Questions> {
  answers: SystemOneResult<Q>['answers'];
  /** The concrete model version that answered (e.g. `jev-1.13.0`). */
  model: string;
  usage: SystemOneResult<Q>['usage'];
  latencyMs: number;
}

export interface AskJevOptions {
  /** Where this judgment is used, for the warning log. */
  purpose: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * Ask Jev a set of independent questions over one state. Questions run in
 * parallel server-side and cannot see each other's answers.
 */
export async function askJev<const Q extends Questions>(
  state: Parameters<TypeSafeClient['systemOne']>[0]['state'],
  questions: Q,
  opts: AskJevOptions,
): Promise<JevResult<Q> | null> {
  const client = getClient();
  if (!client) return null;
  const startedAt = Date.now();
  try {
    const result = await client.systemOne(
      { state, questions },
      { timeout: opts.timeoutMs, signal: opts.signal },
    );
    return {
      answers: result.answers,
      model: result.model,
      usage: result.usage,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    // Lazy import keeps this module importable from lightweight scripts that
    // do not want the observability stack.
    const { logServerError } = await import('@/lib/server-error-logger');
    await logServerError(
      `typesafe: ${opts.purpose} judgment failed (${error instanceof Error ? error.name : 'unknown'})`,
      { action: 'typesafe.ask_failed', extra: { purpose: opts.purpose, latencyMs: Date.now() - startedAt } },
      'warning',
    ).catch(() => undefined);
    return null;
  }
}

import { logServerException } from '@/lib/server-error-logger';

/**
 * Helm Bridge capture class #2 — failed server actions. Generalizes the
 * with-baseball-action / with-lifting-action idea for cross-sport use.
 * Contract: NEVER changes the wrapped function's behavior — same resolve,
 * same reject; logging is fire-and-forget and self-swallowing.
 */

export function isNextControlFlowError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const digest = (err as { digest?: unknown }).digest;
  if (typeof digest !== 'string') return false;
  return digest.startsWith('NEXT_REDIRECT') || digest === 'NEXT_NOT_FOUND';
}

export function withAdminObserved<Args extends unknown[], R>(
  name: string,
  opts: { sport?: 'golf' | 'baseball' | 'shared'; featureArea?: string },
  fn: (...args: Args) => Promise<R>,
): (...args: Args) => Promise<R> {
  return async (...args: Args): Promise<R> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (!isNextControlFlowError(err)) {
        try {
          void logServerException(err, {
            action: name,
            source: 'server_action',
            featureArea: opts.featureArea ?? null,
            sport: opts.sport,
            handled: false,
          }).catch(() => {});
        } catch {
          // Logging must never mask the real failure.
        }
      }
      throw err;
    }
  };
}

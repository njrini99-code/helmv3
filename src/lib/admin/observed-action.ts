import { logServerException } from '@/lib/server-error-logger';
import { shouldEmit, drainCollapsedCount } from '@/lib/admin/emit-throttle';
import type { FeatureKey } from '@/lib/admin/feature-registry';

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

/** Flood-collapse key (Noise Charter N4): `${action}:${errCode ?? errName}`. */
function throttleKeyFor(name: string, err: unknown): string {
  let code: string | undefined;
  if (err && typeof err === 'object' && 'code' in err) {
    const c = (err as { code?: unknown }).code;
    if (typeof c === 'string') code = c;
  }
  const errName = err instanceof Error ? err.name : 'UnknownError';
  return `${name}:${code ?? errName}`;
}

export function withAdminObserved<Args extends unknown[], R>(
  name: string,
  opts: { sport?: 'golf' | 'baseball' | 'shared'; feature?: FeatureKey; featureArea?: string },
  fn: (...args: Args) => Promise<R>,
): (...args: Args) => Promise<R> {
  return async (...args: Args): Promise<R> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (!isNextControlFlowError(err)) {
        try {
          const throttleKey = throttleKeyFor(name, err);
          if (shouldEmit(throttleKey)) {
            const collapsedCount = drainCollapsedCount(throttleKey);
            void logServerException(err, {
              action: name,
              source: 'server_action',
              feature: opts.feature ?? null,
              featureArea: opts.featureArea ?? opts.feature ?? null,
              sport: opts.sport,
              handled: false,
              ...(collapsedCount > 0 ? { metadata: { collapsed_count: collapsedCount } } : {}),
            }).catch(() => {});
          }
        } catch {
          // Logging must never mask the real failure.
        }
      }
      throw err;
    }
  };
}

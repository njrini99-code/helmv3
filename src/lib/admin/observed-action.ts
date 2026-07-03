import { logServerException } from '@/lib/server-error-logger';
import { shouldEmit, drainCollapsedCount } from '@/lib/admin/emit-throttle';
import { createClient } from '@/lib/supabase/server';
import type { FeatureKey } from '@/lib/admin/feature-registry';

/**
 * Identity/subject fields a caller already knows from its own arguments
 * (e.g. the roundId a round-recap action was invoked with) that the
 * generic auth-only `resolveObservedUser()` below has no way to see.
 * Kept intentionally small and string|null-only — this is error-context
 * enrichment, not a general payload passthrough.
 */
export interface ObservedActionContext {
  roundId?: string | null;
  playerId?: string | null;
  teamId?: string | null;
  route?: string | null;
}

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

async function resolveObservedUser(): Promise<{ userId: string | null; userEmail: string | null }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return { userId: user?.id ?? null, userEmail: user?.email ?? null };
  } catch {
    return { userId: null, userEmail: null };
  }
}

export function withAdminObserved<Args extends unknown[], R>(
  name: string,
  opts: {
    sport?: 'golf' | 'baseball' | 'shared';
    feature?: FeatureKey;
    featureArea?: string;
    /**
     * Derive extra identity/subject context from the ORIGINAL call
     * arguments at error time — e.g. `([roundId]) => ({ roundId })`. This
     * is how a caller that already knows its subject (the round-recap
     * action always knows `roundId`, even though `resolveObservedUser()`
     * below only ever sees the *authenticated* user, not the record being
     * acted on) gets that identity into admin_events instead of relying
     * on auth alone. Errors thrown by this callback are swallowed —
     * enrichment must never mask the real failure.
     */
    contextFrom?: (args: Args) => ObservedActionContext;
  },
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
            const observedUser = await resolveObservedUser();
            let extraContext: ObservedActionContext = {};
            try {
              extraContext = opts.contextFrom?.(args) ?? {};
            } catch {
              extraContext = {};
            }
            void logServerException(err, {
              action: name,
              source: 'server_action',
              feature: opts.feature ?? null,
              featureArea: opts.featureArea ?? opts.feature ?? null,
              sport: opts.sport,
              handled: false,
              userId: observedUser.userId,
              userEmail: observedUser.userEmail,
              roundId: extraContext.roundId ?? null,
              playerId: extraContext.playerId ?? null,
              teamId: extraContext.teamId ?? null,
              route: extraContext.route ?? null,
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

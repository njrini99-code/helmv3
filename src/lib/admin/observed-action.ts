import { logServerException } from '@/lib/server-error-logger';
import { shouldEmit, drainCollapsedCount } from '@/lib/admin/emit-throttle';
import {
  extractActionSoftFailure,
  observeActionSoftFailure,
} from '@/lib/admin/observe-action-result';
import { createClient } from '@/lib/supabase/server';
import { runWithRequestContext } from '@/lib/admin/request-context';
import { assertGolfDemoWritable, isGolfDemoReadOnlyError } from '@/lib/demo/golf-read-only';
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

/** Authentication/authorization rejections are expected access control. */
export function isAdminAuthControlFlowError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return /^(Unauthorized|Forbidden|Not authenticated)$/i.test(err.message.trim());
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
     * Set false when the wrapped implementation already records its returned
     * failure with richer domain-specific context. Thrown exceptions remain
     * covered by this wrapper either way.
     */
    observeSoftFailures?: boolean;
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
    /**
     * Set true on a MUTATING golf action to block it for the shared demo
     * account. Mirrors `withBaseballAction`'s `demoSafe`, which golf had no
     * equivalent of — every prospect entering the public demo signs into the
     * SAME Supabase account, so one visitor's write is visible to (and wrecks
     * the tour for) every other concurrent visitor, and mutates the founder's
     * own team, since the demo coach and the owner share one org and team.
     *
     * Declarative on purpose: the alternative was a hand-edited assertion in
     * ~60 action bodies, where the one that gets missed is the one that
     * matters. Marking it here keeps the guard next to the action's identity.
     *
     * Reads must NOT set this. Guarding a read would break the tour itself.
     */
    demoSafe?: boolean;
  },
  fn: (...args: Args) => Promise<R>,
): (...args: Args) => Promise<R> {
  return async (...args: Args): Promise<R> => {
    // One correlation scope per invocation. Opening it HERE — rather than at
    // each logging call site — is what makes requestId actually get populated:
    // every logServer* call beneath this frame inherits the id with no call
    // site changes, so several log lines from one action finally share a key.
    // Nested wrapped actions reuse the outer scope (see runWithRequestContext).
    return runWithRequestContext({ action: name }, async () => {
    try {
      if (opts.demoSafe) {
        // Resolve the email ONCE and hand it to the guard, rather than letting
        // the guard run its own `getUser()`. That matters: the guard fails
        // CLOSED on an unresolvable session, so a transient GoTrue blip would
        // otherwise tell a real, paying coach that they are "in a read-only
        // demo" and refuse to save their work. Going through
        // `resolveObservedUser()` — which swallows and returns null — means an
        // unresolvable session simply is not the demo account, and the action's
        // own auth check (which every mutating action already performs) is what
        // rejects it, with the correct message.
        const { userEmail } = await resolveObservedUser();
        await assertGolfDemoWritable(userEmail);
      }
      const result = await fn(...args);
      // A successful action with no soft-failure envelope has nothing to
      // observe. Avoid a second GoTrue network request solely to enrich a
      // telemetry event that will never be emitted.
      if (opts.observeSoftFailures !== false && extractActionSoftFailure(result)) {
        const observedUser = await resolveObservedUser();
        let extraContext: ObservedActionContext = {};
        try {
          extraContext = opts.contextFrom?.(args) ?? {};
        } catch {
          extraContext = {};
        }
        observeActionSoftFailure(result, {
          action: name,
          source: 'server_action',
          feature: opts.feature ?? null,
          featureArea: opts.featureArea ?? opts.feature ?? null,
          sport: opts.sport,
          userId: observedUser.userId,
          userEmail: observedUser.userEmail,
          roundId: extraContext.roundId ?? null,
          playerId: extraContext.playerId ?? null,
          teamId: extraContext.teamId ?? null,
          route: extraContext.route ?? null,
          handled: true,
        });
      }
      return result;
    } catch (err) {
      // A demo read-only rejection is the guard working as designed, not a
      // defect. Reporting it would bury Sentry and admin_events in noise on
      // any night a batch of prospects is touring the demo at once.
      if (!isNextControlFlowError(err) && !isAdminAuthControlFlowError(err) && !isGolfDemoReadOnlyError(err)) {
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
    });
  };
}

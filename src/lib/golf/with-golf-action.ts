// =============================================================================
// src/lib/golf/with-golf-action.ts
//
// withGolfAction — the golf counterpart of
// src/lib/baseball/with-baseball-action.ts, scoped to what golf action files
// actually need TODAY: centralized error observability, not a new
// auth/context/capability layer.
//
// WHY THIS IS SMALLER THAN withBaseballAction. Baseball's wrapper resolves
// AUTH, an active-team CONTEXT, and a CAPABILITY gate because every wrapped
// baseball action needed all three and had been hand-rolling them. Golf
// actions already resolve their own auth/team context inline (see
// src/app/golf/actions/golf.ts) via getUser() + resolveCoachTeamIdWithCookie /
// per-action ownership checks — there is no single "active golf context"
// helper this wrapper could delegate to without inventing one. What golf
// actions DO hand-roll at every catch site, file after file, is the
// three-step observability sequence: classify the failure, run
// maybeCaptureRlsDenial first so a real RLS denial doesn't ALSO mint a
// generic error, then logServerException/logServerError if it didn't. That
// sequence — not auth — is what this module centralizes.
//
// DELEGATION SHAPE — matches withBaseballAction exactly:
//   withGolfAction(name, opts, fn) => (...args) => Promise<TResult>
// The returned value is an `async (...args) => {...}` — genuinely an async
// function, not an object or a plain arrow wrapping a sync body — which is
// what lets `export const foo = withGolfAction(...)` live inside a
// `'use server'` file: every binding a 'use server' module exports must be an
// async function, and this wrapper's return type satisfies that mechanically
// rather than by convention.
//
// ON THROW:
//   1. A Next.js control-flow throw (redirect()/notFound(), digest-tagged) is
//      passed straight through, untouched and unlogged — see
//      src/lib/admin/observed-action.ts's isNextControlFlowError, reused here
//      rather than re-implemented. Swallowing this and rethrowing a sanitized
//      GolfActionError instead would silently break every redirect() call
//      inside a wrapped action, since Next's own runtime is what looks for
//      the NEXT_REDIRECT/NEXT_NOT_FOUND digest on the error it catches.
//   2. Otherwise the failure is classified via
//      src/lib/admin/observe-action-result.ts's classifySoftFailure(message,
//      code) — the SAME shared classifier `observeActionSoftFailure` (below,
//      success path) and every other Helm Bridge capture class already use,
//      so "not authenticated", "forbidden", a known qualifier-lifecycle code,
//      etc. land at the same severity here as they would if the action had
//      instead returned `{ success: false, ... }`. This substitutes for
//      withBaseballAction's fixed allowlist of typed control-flow error
//      classes (BaseballUnauthorizedError and friends) — golf's wrapper owns
//      no auth/context step of its own, so it has no typed errors of its own
//      to allowlist, and reuses the message/code classifier instead.
//        - severity !== 'error' (an expected/benign failure): logged as a
//          handled warning (skipSentry per the classifier), then the
//          ORIGINAL error is rethrown unsanitized so a caller can still
//          branch on its message/name — exactly what withBaseballAction does
//          for its allowlisted classes.
//        - severity === 'error' (unexpected): maybeCaptureRlsDenial runs
//          FIRST (table/verb from opts.rlsContext, falling back to
//          { table: featureArea, verb: 'rpc' } — the same fallback
//          withBaseballAction's catch block uses, since this generic wrapper
//          layer never sees which real table a query several calls deep
//          targeted). Only when that did NOT already capture the failure as
//          an RLS denial does the generic logServerException run — one
//          admin_events row per failure, never two.
//   3. Either way, when `opts.toErrorResult` is supplied the classified
//      message (original if expected, the generic sanitized string if not)
//      is handed to it and ITS return value is returned instead of throwing
//      — this is the "or return the action's error shape" half of
//      withBaseballAction's pattern, spelled out as an explicit opt-in
//      because golf's own ActionResult<T> convention
//      (`{ success: false, error, code? }`, see golf.ts) is a RETURNED
//      envelope, not a thrown class hierarchy the way baseball's is. Omit it
//      and this wrapper behaves exactly like withBaseballAction: it throws.
//
// captureGolfActionError (below) is the other half of this module: a
// fire-and-forget helper for a catch site that has NO intention of routing
// through withGolfAction at all — it already caught its own error and
// intends to keep returning its own fallback value inline (the
// savePartialRound pattern in golf.ts today, hand-rolled at every call site).
// It runs the identical classify -> maybeCaptureRlsDenial -> logServerException
// sequence and returns nothing; the caller calls it, then returns its own
// fallback on the next line.
//
// This module is additive and golf-scoped; it shares nothing with
// BaseballHelm and reuses the existing cross-sport Bridge primitives
// (server-error-logger, observe-action-result, rls-denial,
// observed-action's isNextControlFlowError).
// =============================================================================

import 'server-only';

import * as Sentry from '@sentry/nextjs';

import { logServerException } from '@/lib/server-error-logger';
import { observeActionSoftFailure, classifySoftFailure } from '@/lib/admin/observe-action-result';
import { maybeCaptureRlsDenial } from '@/lib/admin/rls-denial';
import { isNextControlFlowError } from '@/lib/admin/observed-action';
import type { ObservedActionContext } from '@/lib/admin/observed-action';
import type { FeatureKey } from '@/lib/admin/feature-registry';

// -----------------------------------------------------------------------------
// Public types
// -----------------------------------------------------------------------------

/** Same verb vocabulary maybeCaptureRlsDenial already accepts. */
export type GolfRlsVerb = 'select' | 'insert' | 'update' | 'delete' | 'rpc';

/**
 * The sanitized error rethrown after an UNEXPECTED (severity 'error') throw,
 * when the caller did not supply `opts.toErrorResult`. Mirrors
 * BaseballActionError: the full original error (stack, pg detail/hint) is
 * already captured by logServerException before this is thrown; this surface
 * is intentionally generic so internals never leak to the client.
 */
export class GolfActionError extends Error {
  constructor(message = 'Something went wrong. Please try again.') {
    super(message);
    this.name = 'GolfActionError';
  }
}

/**
 * Identity/subject context this wrapper cannot see on its own — it does not
 * resolve auth or a team context, so anything beyond the action's own
 * arguments has to come from the caller. Extends the SAME
 * ObservedActionContext shape withAdminObserved's `contextFrom` already
 * produces (roundId/playerId/teamId/route) rather than inventing a parallel
 * one, plus the two fields that shape doesn't carry (userId/userEmail —
 * withAdminObserved resolves those itself via a live getUser() call, which
 * this lighter wrapper deliberately does not do; supply them here if the
 * wrapped action already has them to hand).
 */
export interface GolfActionExtraContext extends ObservedActionContext {
  userId?: string | null;
  userEmail?: string | null;
}

export interface WithGolfActionOptions<TArgs extends unknown[] = unknown[], TResult = unknown> {
  /**
   * Logical feature area, e.g. 'golf-round-tracking' | 'golf-qualifiers'.
   * Surfaces as the Sentry `feature_area` tag + the server-error-logger
   * `featureArea`, and is the RLS-denial fallback `table` when
   * `rlsContext` is omitted (see the module header).
   */
  featureArea: string;
  /** Canonical Helm Bridge feature key for admin_events.feature. */
  feature?: FeatureKey;
  /**
   * How to resolve the real table/verb for maybeCaptureRlsDenial when an
   * UNEXPECTED error is caught. A static value, or a resolver over the
   * action's own args (e.g. the id it operates on determines which table).
   * Omit when not derivable at this layer — the catch falls back to
   * `{ table: featureArea, verb: 'rpc' }`, same as withBaseballAction's
   * generic wrapper-level fallback. A catch site that already knows its
   * exact table should prefer calling maybeCaptureRlsDenial itself (or
   * captureGolfActionError below) with precise context instead of relying on
   * this fallback.
   */
  rlsContext?:
    | { table: string; verb: GolfRlsVerb }
    | ((...args: TArgs) => { table: string; verb: GolfRlsVerb } | null);
  /**
   * Derive identity/subject context from the ORIGINAL call arguments (NOT
   * from inside `fn` — this wrapper never sees fn's internal auth
   * resolution). Errors thrown by this callback are swallowed; enrichment
   * must never mask the real failure.
   */
  contextFrom?: (...args: TArgs) => GolfActionExtraContext;
  /**
   * When supplied, a caught error is converted into the action's own result
   * shape and RETURNED instead of thrown — the "or return the action's
   * error shape" half of withBaseballAction's contract, spelled out
   * explicitly here because golf's ActionResult<T> convention
   * (`{ success: false, error, code? }`) is a returned envelope, not a
   * thrown class. Receives the classified message (the ORIGINAL message for
   * an expected/benign failure, the generic sanitized string for an
   * unexpected one) and the error's `code` when one was derivable. Omit this
   * to get withBaseballAction's default behavior: throw.
   */
  toErrorResult?: (message: string, code: string | null) => TResult;
  /**
   * When false, an UNEXPECTED throw is rethrown as the ORIGINAL error
   * instead of the sanitized GolfActionError. The failure is still fully
   * logged either way; this only controls what the caller sees. Defaults to
   * true (sanitize), matching withBaseballAction. Has no effect when
   * `toErrorResult` is supplied — that path never throws.
   */
  sanitizeUnexpectedErrors?: boolean;
}

export type GolfActionFn<TArgs extends unknown[], TResult> = (
  ...args: TArgs
) => Promise<TResult>;

// -----------------------------------------------------------------------------
// Internal: shared classify -> maybeCaptureRlsDenial -> logServerException
// sequence, used by BOTH withGolfAction's catch block and the standalone
// captureGolfActionError helper, so the two never drift apart.
// -----------------------------------------------------------------------------

interface ClassifiedGolfFailure {
  severity: 'info' | 'warning' | 'error';
  skipSentry: boolean;
  /** The failure's own message — NOT sanitized. Callers decide what a user sees. */
  message: string;
  code: string | null;
}

function classifyThrown(error: unknown): ClassifiedGolfFailure {
  const errObj =
    error && typeof error === 'object'
      ? (error as { code?: string | null; message?: string | null })
      : null;
  const message =
    error instanceof Error ? error.message : (errObj?.message ?? String(error));
  const code = errObj?.code ?? null;
  const { severity, skipSentry } = classifySoftFailure(message, code);
  return { severity, skipSentry, message, code };
}

interface GolfActionLogContext {
  action: string;
  featureArea: string;
  feature?: FeatureKey;
  userId?: string | null;
  userEmail?: string | null;
  roundId?: string | null;
  playerId?: string | null;
  teamId?: string | null;
  route?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Runs the shared capture sequence for one caught error and returns whether
 * it was captured as an RLS denial (so a caller that wants to skip a SECOND,
 * more specific log for the same failure can check this — mirrors the
 * `capturedAsRlsDenial` boolean golf.ts's savePartialRound already threads
 * through by hand at each of its catch sites).
 *
 * Fire-and-forget by contract: the returned promise only tracks the write,
 * it never rejects (both maybeCaptureRlsDenial and logServerException
 * already swallow their own failures).
 */
async function logGolfActionFailure(
  error: unknown,
  classified: ClassifiedGolfFailure,
  ctx: GolfActionLogContext,
  rls: { table: string; verb: GolfRlsVerb } | null,
): Promise<boolean> {
  const errObj =
    error && typeof error === 'object'
      ? (error as { code?: string | null; message?: string | null })
      : null;

  // RLS-denial capture only applies to genuinely UNEXPECTED failures.
  // Expected/benign ones (severity !== 'error') are things like "not
  // authenticated" or a known qualifier-lifecycle code — never RLS-shaped —
  // so running maybeCaptureRlsDenial for them would be a wasted (and
  // semantically wrong) check every time.
  const capturedAsRlsDenial =
    classified.severity === 'error'
      ? maybeCaptureRlsDenial(errObj, {
          table: rls?.table ?? ctx.featureArea,
          verb: rls?.verb ?? 'rpc',
          action: ctx.action,
          sport: 'golf',
          userId: ctx.userId ?? null,
          feature: ctx.feature,
        })
      : false;

  if (!capturedAsRlsDenial) {
    const normalized = error instanceof Error ? error : new Error(classified.message);
    await logServerException(
      normalized,
      {
        action: ctx.action,
        featureArea: ctx.featureArea,
        feature: ctx.feature,
        sport: 'golf',
        source: 'server_action',
        handled: classified.severity !== 'error',
        skipSentry: classified.skipSentry,
        errorCode: classified.code ?? undefined,
        userId: ctx.userId ?? null,
        userEmail: ctx.userEmail ?? null,
        roundId: ctx.roundId ?? null,
        playerId: ctx.playerId ?? null,
        teamId: ctx.teamId ?? null,
        route: ctx.route ?? null,
        metadata: ctx.metadata,
        fingerprint: ['server_action', ctx.featureArea, ctx.action],
      },
      // logServerException's severity param intentionally excludes 'info'
      // (that tier belongs to logServerEvent) — a thrown error classified
      // 'info' (only possible when a raw thrown object happens to carry one
      // of the empty-state codes) is still logged, just one tier up.
      classified.severity === 'info' ? 'warning' : classified.severity,
    );
  }

  return capturedAsRlsDenial;
}

// -----------------------------------------------------------------------------
// captureGolfActionError — for catch sites that keep their own fallback
// -----------------------------------------------------------------------------

export interface GolfActionErrorContext {
  /** Stable action name — same identity a withGolfAction-wrapped call would use. */
  action: string;
  featureArea: string;
  feature?: FeatureKey;
  userId?: string | null;
  userEmail?: string | null;
  roundId?: string | null;
  playerId?: string | null;
  teamId?: string | null;
  /**
   * The catch site is almost always several calls closer to the actual
   * query than a generic wrapper would be, so it usually KNOWS the real
   * table/verb — pass it here for a precise RLS-denial capture instead of
   * relying on withGolfAction's featureArea/'rpc' fallback.
   */
  rls?: { table: string; verb: GolfRlsVerb };
  metadata?: Record<string, unknown>;
}

/**
 * Fire-and-forget capture for a catch site that has already decided to keep
 * returning its own fallback value (`{ success: false, error }`, `[]`,
 * `null`, ...) rather than routing the error through withGolfAction.
 * Centralizes the exact three-step sequence golf.ts's savePartialRound hand-
 * rolls today (classify -> maybeCaptureRlsDenial -> logServerException) into
 * one call.
 *
 * NEVER throws and returns nothing — call it, then return your own fallback
 * on the next line:
 *
 *   } catch (error) {
 *     captureGolfActionError(error, {
 *       action: 'getPlayerRoundHistory',
 *       featureArea: 'golf-round-tracking',
 *       rls: { table: 'golf_rounds', verb: 'select' },
 *       playerId,
 *     });
 *     return [];
 *   }
 */
export function captureGolfActionError(error: unknown, ctx: GolfActionErrorContext): void {
  try {
    const classified = classifyThrown(error);
    void logGolfActionFailure(
      error,
      classified,
      {
        action: ctx.action,
        featureArea: ctx.featureArea,
        feature: ctx.feature,
        userId: ctx.userId ?? null,
        userEmail: ctx.userEmail ?? null,
        roundId: ctx.roundId ?? null,
        playerId: ctx.playerId ?? null,
        teamId: ctx.teamId ?? null,
        metadata: ctx.metadata,
      },
      ctx.rls ?? null,
    ).catch(() => {});
  } catch {
    // Fire-and-forget: observability must never break the caller.
  }
}

// -----------------------------------------------------------------------------
// withGolfAction
// -----------------------------------------------------------------------------

/**
 * Wrap a golf server action body with Sentry scoping + centralized error
 * observability. Returns a new async function with the SAME argument list as
 * `fn` that resolves to `fn`'s result — see the module header for the full
 * throw/return contract.
 *
 * @param name  Stable action name — Sentry `action` tag + error-log `action`.
 * @param opts  featureArea (required), feature?, rlsContext?, contextFrom?,
 *              toErrorResult?, sanitizeUnexpectedErrors?
 * @param fn    The action body: (...args) => Promise<TResult>
 */
export function withGolfAction<TArgs extends unknown[], TResult>(
  name: string,
  opts: WithGolfActionOptions<TArgs, TResult>,
  fn: GolfActionFn<TArgs, TResult>,
): (...args: TArgs) => Promise<TResult> {
  const { featureArea, feature, rlsContext, contextFrom, toErrorResult, sanitizeUnexpectedErrors = true } =
    opts;

  return async (...args: TArgs): Promise<TResult> => {
    return Sentry.withScope(async (scope) => {
      scope.setTag('sport', 'golf');
      scope.setTag('feature_area', featureArea);
      if (feature) scope.setTag('feature', feature);
      scope.setTag('action', name);
      scope.addBreadcrumb({
        category: 'golf.action',
        message: `start ${name}`,
        level: 'info',
        data: { feature, featureArea },
      });

      let extra: GolfActionExtraContext = {};
      try {
        extra = contextFrom?.(...args) ?? {};
      } catch {
        extra = {};
      }
      if (extra.userId || extra.userEmail) {
        scope.setUser({ id: extra.userId ?? undefined, email: extra.userEmail ?? undefined });
      }

      const logCtx: GolfActionLogContext = {
        action: name,
        featureArea,
        feature,
        userId: extra.userId ?? null,
        userEmail: extra.userEmail ?? null,
        roundId: extra.roundId ?? null,
        playerId: extra.playerId ?? null,
        teamId: extra.teamId ?? null,
        route: extra.route ?? null,
      };

      try {
        const result = await fn(...args);
        observeActionSoftFailure(result, {
          action: name,
          feature,
          featureArea,
          sport: 'golf',
          source: 'server_action',
          handled: true,
          userId: logCtx.userId,
          userEmail: logCtx.userEmail,
          roundId: logCtx.roundId,
          playerId: logCtx.playerId,
          teamId: logCtx.teamId,
        });
        scope.addBreadcrumb({ category: 'golf.action', message: `done ${name}`, level: 'info' });
        return result;
      } catch (error) {
        // Next.js control-flow throws (redirect()/notFound()) are framework
        // signals, not incidents — pass through untouched. Reusing
        // observed-action.ts's check rather than re-implementing it.
        if (isNextControlFlowError(error)) {
          throw error;
        }

        const classified = classifyThrown(error);
        const rls = typeof rlsContext === 'function' ? rlsContext(...args) : (rlsContext ?? null);
        await logGolfActionFailure(error, classified, logCtx, rls);

        if (toErrorResult) {
          const outMessage =
            classified.severity === 'error' ? new GolfActionError().message : classified.message;
          return toErrorResult(outMessage, classified.code);
        }

        if (classified.severity !== 'error') {
          // Expected/benign — rethrow the ORIGINAL error unsanitized so a
          // caller can still branch on its message/name, same as
          // withBaseballAction's allowlisted control-flow classes.
          throw error;
        }

        if (sanitizeUnexpectedErrors === false) {
          throw error;
        }
        throw new GolfActionError();
      }
    });
  };
}

// =============================================================================
// src/lib/baseball/with-baseball-action.ts
//
// Wave 2 / packet: auth-join
//
// withBaseballAction — the advanced-error-tracking wrapper that EVERY new
// BaseballHelm server action runs inside. It standardizes the four things a
// baseball mutation should never get wrong:
//
//   1. AUTH        — resolve the current auth user; throw 401 if there is none.
//   2. CONTEXT     — resolve the server-validated active baseball team/role via
//                    getActiveBaseballContext() (cookie is re-validated against
//                    real membership rows, never trusted on its own).
//   3. CAPABILITY  — when opts.requiredCapability is set, enforce it
//                    SERVER-SIDE via requireBaseballCapability() against the
//                    resolved team. Head/primary coach implicitly hold all caps;
//                    non-staff / suspended hold none. requiredCapability may
//                    also be a non-empty readonly array (ANY-of / OR) or a
//                    resolver function of the action's own args that RETURNS a
//                    single capability or a non-empty ANY-of array — e.g.
//                    relaxing the gate only for one client-declared shape/kind
//                    while every other shape keeps the original, single,
//                    stricter capability. Resolved exactly ONCE per call,
//                    INSIDE this wrapper's own guarded try/catch (after AUTH,
//                    before enforcement) — a throwing resolver (e.g. a
//                    malformed/omitted argument) is therefore sanitized and
//                    logged through the same BaseballActionError + Sentry path
//                    as any other action-body failure, never thrown raw. A
//                    resolver that returns an empty array at runtime is
//                    rejected (fail closed) rather than silently skipping
//                    enforcement.
//   4. OBSERVABILITY — run the action inside a Sentry scope tagged
//                    { sport:'baseball', feature:<featureArea>, action:<name> }
//                    with user + breadcrumbs, and on throw route the error
//                    through src/lib/server-error-logger.ts (logServerException)
//                    so it lands in error_logs + admin_events + Sentry, then
//                    rethrow a sanitized error so internals never leak to the
//                    client.
//
// DEMO READ-ONLY GUARD (Issue #392)
//   - Immediately after AUTH, every action is checked against the shared
//     Baseball demo coach session (isCurrentSessionBaseballDemo). Unless the
//     action was registered with `demoSafe: true`, the demo session is
//     short-circuited with BaseballDemoReadOnlyError before CONTEXT/CAPABILITY
//     resolution even runs — no visitor can use the shared demo login to
//     mutate state another visitor would then see.
//
// SECURITY
//   - Capability checks are enforced here on the server. The client never gets
//     to assert a capability; requiredCapability is wired by the action author,
//     not the caller.
//   - The rethrown error is sanitized: callers see a stable, user-safe message,
//     never a Postgres detail/hint or stack. The real error is fully captured.
//
// USAGE
//   export const renamePractice = withBaseballAction(
//     'renamePractice',
//     { featureArea: 'baseball-practice', requiredCapability: 'can_manage_practice' },
//     async (ctx, args: { practiceId: string; name: string }) => {
//       const supabase = await createClient();
//       // ctx.activeTeamId / ctx.activeCoachId / ctx.user already resolved.
//       ...
//       return { success: true };
//     },
//   );
//
// This module is additive and baseball-scoped; it shares nothing with GolfHelm
// and reuses the existing server-side primitives (server.ts createClient,
// active-context resolution, capabilities resolver, server-error-logger).
// =============================================================================

import 'server-only';

import * as Sentry from '@sentry/nextjs';
import type { User } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';
import { logServerException } from '@/lib/server-error-logger';
import { observeActionSoftFailure } from '@/lib/admin/observe-action-result';
import { maybeCaptureRlsDenial } from '@/lib/admin/rls-denial';
import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import type { ActiveBaseballContext } from '@/lib/baseball/active-context-shared';
import {
  requireBaseballCapability,
  hasBaseballCapability,
  BaseballCapabilityError,
  type BaseballCapability,
} from '@/lib/baseball/capabilities';
import {
  requirePlayerAccess,
  PlayerAccessError,
  type PlayerAccessKey,
} from '@/lib/baseball/player-access';
import { BaseballDisabledSourceError } from '@/lib/baseball/import-source-enabled';
import { isCurrentSessionBaseballDemo } from '@/lib/demo/baseball-config.server';

// -----------------------------------------------------------------------------
// Public error types
// -----------------------------------------------------------------------------

/**
 * Thrown when no authenticated user is present. Carries an HTTP-401 status so
 * route handlers / boundaries can map it; server actions can `catch` by name.
 */
export class BaseballUnauthorizedError extends Error {
  readonly status = 401;
  constructor(message = 'You must be signed in.') {
    super(message);
    this.name = 'BaseballUnauthorizedError';
  }
}

/**
 * Thrown when the authenticated user has no active baseball team context (no
 * memberships, or a team could not be resolved). Carries HTTP-403.
 */
export class BaseballNoActiveTeamError extends Error {
  readonly status = 403;
  constructor(message = 'No active baseball team for this account.') {
    super(message);
    this.name = 'BaseballNoActiveTeamError';
  }
}

/**
 * The sanitized error rethrown to the caller after an action body throws. The
 * full original error (stack, pg detail/hint) is captured by
 * logServerException; this surface is intentionally generic.
 */
export class BaseballActionError extends Error {
  constructor(message = 'Something went wrong. Please try again.') {
    super(message);
    this.name = 'BaseballActionError';
  }
}

/**
 * Thrown when the active session is the shared Baseball demo coach and the
 * action is not marked `demoSafe`. The demo coach account is shared by every
 * visitor at once, so it must never be able to persist a mutation that other
 * visitors would then see (Issue #392). Carries HTTP-403.
 */
export class BaseballDemoReadOnlyError extends Error {
  readonly status = 403;
  constructor(message = "This isn't available in the live demo.") {
    super(message);
    this.name = 'BaseballDemoReadOnlyError';
  }
}

/**
 * Thrown when an action belongs to a product module the app is not currently
 * shipping (`product-modules.ts` — recruiting is sunset as of 2026-07-29).
 * Carries HTTP-403.
 *
 * WHY THIS IS ITS OWN CLASS and not one of the four above. A withheld module is
 * a fourth kind of refusal, and every existing class states something untrue
 * about it:
 *
 * - `BaseballUnauthorizedError` (401, "You must be signed in") makes callers
 *   that branch on it bounce the user to /baseball/login. The scout-packet
 *   preview page does exactly that, so reusing it would send a correctly
 *   signed-in head coach to a login screen.
 * - `BaseballCapabilityError` blames the coach's permissions for a product
 *   decision. It is also structurally wrong: a head coach holds every
 *   capability unconditionally, which is why capability gates could never have
 *   expressed the sunset in the first place (see product-modules.ts).
 * - `BaseballNoActiveTeamError` asserts a broken team context that is fine.
 * - `BaseballDemoReadOnlyError` says the opposite of what is true — the live
 *   demo is not the restriction.
 *
 * Listed in the expected-throw allowlist below, so a closed door is logged as a
 * handled warning rather than paging someone with a Sentry error.
 */
export class BaseballModuleDisabledError extends Error {
  readonly status = 403;
  constructor(message = "This isn't part of BaseballHelm right now.") {
    super(message);
    this.name = 'BaseballModuleDisabledError';
  }
}

// -----------------------------------------------------------------------------
// Options + context shapes
// -----------------------------------------------------------------------------

/**
 * Configuration for a wrapped baseball server action.
 */
export interface WithBaseballActionOptions<TArgs extends unknown[] = unknown[]> {
  /**
   * Logical feature area, e.g. 'baseball-roster' | 'baseball-practice'. Surfaces
   * as the Sentry `feature` tag + the server-error-logger `featureArea`, and is
   * the second segment of the default error fingerprint.
   */
  featureArea: string;
  /**
   * Canonical Helm Bridge feature key for admin_events.feature. Defaults to
   * featureArea for existing Baseball actions, while letting new surfaces keep a
   * stable feature name if their saved Sentry search uses a broader featureArea.
   */
  feature?: string;
  /**
   * When set, the wrapper enforces this capability SERVER-SIDE (via
   * requireBaseballCapability) against the resolved team before the body runs.
   * Head/primary coach implicitly satisfy every capability.
   *
   * Three forms:
   *   - a single BaseballCapability            : the existing, most common form.
   *   - a NON-EMPTY readonly array of
   *     BaseballCapability                     : ANY-of (OR) — the staff member
   *                                               need only hold ONE of the listed
   *                                               capabilities. On a miss, the
   *                                               thrown BaseballCapabilityError
   *                                               names the LAST array element
   *                                               (put the action's "primary" /
   *                                               historical capability last so
   *                                               a fully-unauthorized caller sees
   *                                               the same error identity as a
   *                                               single-capability gate would).
   *   - (...args) => single | non-empty array   : resolve the requirement from the
   *                                               action's OWN arguments (e.g. gate
   *                                               on a client-supplied shape/kind
   *                                               field) — evaluated exactly ONCE
   *                                               per call, from the SAME `args`
   *                                               the action body receives, INSIDE
   *                                               this wrapper's own guarded
   *                                               try/catch (after AUTH resolves,
   *                                               before capability enforcement
   *                                               runs) — a throwing resolver is
   *                                               sanitized + logged exactly like
   *                                               any other action failure, never
   *                                               thrown raw. A resolver that
   *                                               returns an empty array at
   *                                               runtime (despite the non-empty
   *                                               tuple type below) is rejected —
   *                                               fail closed, enforcement is
   *                                               never silently skipped.
   *
   * The array forms are typed as non-empty tuples
   * (`readonly [BaseballCapability, ...BaseballCapability[]]`) so `[]` is a
   * compile-time error; the runtime check above catches a resolver that
   * manufactures an empty array anyway (e.g. from an empty input list).
   */
  requiredCapability?:
    | BaseballCapability
    | readonly [BaseballCapability, ...BaseballCapability[]]
    | ((...args: TArgs) =>
        | BaseballCapability
        | readonly [BaseballCapability, ...BaseballCapability[]]);
  /**
   * When set, the wrapper enforces a PLAYER/GUARDIAN-access toggle SERVER-SIDE
   * (via requirePlayerAccess) against the resolved team before the body runs.
   * This makes the Settings-OS player-access toggles (players_can_edit_profile,
   * players_can_upload_video, players_can_self_log_lift, etc.) load-bearing: a
   * false toggle DENIES the player behavior server-side, not just by hiding a
   * tab. Coaches acting on the team bypass self-service toggles (their staff
   * capability governs them) per the player-access resolver's bypass policy.
   *
   * Both requiredCapability and requiredPlayerAccess may be set; both are
   * enforced (capability first, then player-access).
   */
  requiredPlayerAccess?: PlayerAccessKey;
  /**
   * How to resolve the team a capability is enforced against (and that the body
   * receives). Defaults to 'active' — the cookie-backed, server-validated active
   * team. Use a resolver to enforce against a team id derived from the action's
   * own arguments (e.g. an action that operates on an explicitly-passed team).
   *
   *   - 'active'        : use ctx.activeTeamId from getActiveBaseballContext.
   *   - (...args) => id : extract the team id from the action args. The extracted
   *                       id is what requiredCapability is checked against and is
   *                       passed through as ctx.targetTeamId.
   */
  teamFrom?: 'active' | ((...args: TArgs) => string | null | undefined);
  /**
   * When false, skip resolving an active baseball team context. Use only for
   * first-write flows (onboarding) where the user is authenticated but has no
   * team membership yet. Capability / player-access checks still run when set
   * but require a teamFrom resolver or an existing activeTeamId.
   */
  requireActiveContext?: boolean;
  /**
   * Marks this action as safe to run for the shared Baseball demo coach
   * session — i.e. it performs no write a visitor could use to alter state
   * every other visitor also sees. Defaults to `false`: EVERY wrapped action
   * is blocked for the demo session unless explicitly opted in here. This is
   * an intentional fail-closed default (Issue #392) so a future mutating
   * action can never become demo-reachable just by omission; an action
   * author must affirmatively mark it `demoSafe: true` after confirming it
   * never writes.
   */
  demoSafe?: boolean;
}

/**
 * Context handed to every wrapped action body. Always carries a resolved auth
 * user and active baseball context. `targetTeamId` is the team the action acts
 * on / was capability-checked against (== activeTeamId unless opts.teamFrom is a
 * resolver). `staff` is populated only when a requiredCapability was enforced
 * (reuse it instead of re-querying).
 */
export interface BaseballActionContext {
  user: User;
  context: ActiveBaseballContext;
  /** Convenience alias for context.activeTeamId. */
  activeTeamId: string;
  /** Convenience alias for context.activeRole. */
  activeRole: ActiveBaseballContext['activeRole'];
  /** Convenience alias for context.activeCoachId. */
  activeCoachId: string | null;
  /** Convenience alias for context.activePlayerId. */
  activePlayerId: string | null;
  /** The team the action targets / was capability-checked against. */
  targetTeamId: string;
}

/** The signature of a wrapped action body. */
export type BaseballActionFn<TArgs extends unknown[], TResult> = (
  ctx: BaseballActionContext,
  ...args: TArgs
) => Promise<TResult>;

// -----------------------------------------------------------------------------
// withBaseballAction
// -----------------------------------------------------------------------------

/**
 * Wrap a baseball server action body with auth + active-context resolution,
 * server-side capability enforcement, Sentry scoping, and centralized error
 * logging. Returns a new async function with the SAME argument list as `fn`
 * (minus the leading injected context) that resolves to `fn`'s result.
 *
 * @param name   Stable action name — Sentry `action` tag + error-log `action`.
 * @param opts   featureArea (required), requiredCapability?, teamFrom?
 * @param fn     The action body: (ctx, ...args) => Promise<TResult>
 */
export function withBaseballAction<TArgs extends unknown[], TResult>(
  name: string,
  opts: WithBaseballActionOptions<TArgs>,
  fn: BaseballActionFn<TArgs, TResult>,
): (...args: TArgs) => Promise<TResult> {
  const {
    featureArea,
    feature = featureArea.replaceAll('-', '_'),
    requiredCapability,
    requiredPlayerAccess,
    teamFrom = 'active',
    requireActiveContext = true,
    demoSafe = false,
  } = opts;

  return async (...args: TArgs): Promise<TResult> => {
    // The (possibly args-conditional) capability requirement is resolved
    // exactly ONCE per call, from the SAME `args` the action body receives
    // below — but NOT here. It is resolved INSIDE the guarded try/catch below
    // (see step 1c, after AUTH), not before Sentry.withScope even starts, so a
    // throwing resolver (e.g. a malformed/omitted argument) is caught by this
    // wrapper's own error handling and produces the same sanitized
    // BaseballActionError + Sentry-logged path as any other action-body
    // failure — never a raw, unsanitized throw straight out of this function
    // before any observability wiring has run. These are declared here (not
    // `const` inside the try) only so buildTraceContext's closure below can
    // read whatever they resolve to, from either the success or catch path.
    let resolvedCapabilityList: readonly BaseballCapability[] | null = null;
    let resolvedCapabilityTag: string | null = null;

    return Sentry.withScope(async (scope) => {
      // Stable scope identity for every trace emitted from this action.
      scope.setTag('sport', 'baseball');
      scope.setTag('feature', feature);
      scope.setTag('feature_area', featureArea);
      scope.setTag('action', name);
      scope.addBreadcrumb({
        category: 'baseball.action',
        message: `start ${name}`,
        level: 'info',
        data: {
          feature,
          featureArea,
          // requiredCapability is intentionally omitted here: it isn't
          // resolved yet at this point (see step 1c below, inside the try) —
          // logging it now would always show `null`. The "capability
          // requirement resolved" breadcrumb added in step 1c carries it.
          requiredPlayerAccess: requiredPlayerAccess ?? null,
        },
      });

      let observedUserId: string | null = null;
      let observedUserEmail: string | null = null;
      let observedTeamId: string | null = null;
      let observedRole: ActiveBaseballContext['activeRole'] | null = null;
      let observedCoachId: string | null = null;
      let observedPlayerId: string | null = null;
      let observedTargetTeamId: string | null = null;

      const buildTraceContext = (handled: boolean) => ({
        action: name,
        feature,
        featureArea,
        sport: 'baseball' as const,
        teamId: observedTargetTeamId ?? observedTeamId,
        userId: observedUserId,
        userEmail: observedUserEmail,
        source: 'server_action' as const,
        handled,
        tags: {
          sport: 'baseball',
          feature,
          feature_area: featureArea,
          ...(observedRole ? { baseball_role: observedRole } : {}),
          ...(observedTeamId ? { baseball_team: observedTeamId } : {}),
          ...(observedTargetTeamId ? { baseball_target_team: observedTargetTeamId } : {}),
          ...(resolvedCapabilityTag ? { baseball_capability: resolvedCapabilityTag } : {}),
          ...(requiredPlayerAccess ? { baseball_player_access: requiredPlayerAccess } : {}),
        },
        metadata: {
          activeTeamId: observedTeamId,
          targetTeamId: observedTargetTeamId,
          activeRole: observedRole,
          activeCoachId: observedCoachId,
          activePlayerId: observedPlayerId,
          requiredCapability: resolvedCapabilityTag,
          requiredPlayerAccess: requiredPlayerAccess ?? null,
          requireActiveContext,
          demoSafe,
        },
      });

      try {
        // -------------------------------------------------------------------
        // 1. AUTH — resolve the user; 401 if none.
        // -------------------------------------------------------------------
        const supabase = await createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          throw new BaseballUnauthorizedError();
        }
        observedUserId = user.id;
        observedUserEmail = user.email ?? null;
        scope.setUser({ id: user.id, email: user.email ?? undefined });

        // -------------------------------------------------------------------
        // 1b. DEMO READ-ONLY GUARD — the shared Baseball demo coach account
        //     must never be able to mutate state that every other visitor's
        //     session also sees. Fail closed: only actions explicitly marked
        //     `demoSafe: true` run for the demo session; everything else is
        //     short-circuited here with a friendly, expected (non-Sentry)
        //     error. Reuses the `user` already resolved above — no extra
        //     auth round-trip.
        // -------------------------------------------------------------------
        if (!demoSafe && (await isCurrentSessionBaseballDemo(user.email ?? null))) {
          throw new BaseballDemoReadOnlyError();
        }

        // -------------------------------------------------------------------
        // 1c. Resolve the (possibly args-conditional) capability requirement.
        //     Moved here (post-review fix) from BEFORE Sentry.withScope even
        //     started to HERE — inside this try/catch, after AUTH — so a
        //     throwing resolver (e.g. a malformed/omitted argument) is caught
        //     by this wrapper's own error handling below and produces the
        //     same sanitized BaseballActionError + Sentry-logged path as any
        //     other action-body failure, instead of a raw, unsanitized throw
        //     that skipped every bit of this wrapper's observability. Still
        //     resolved exactly ONCE, from the SAME `args` reference the
        //     action body receives (unchanged from before this move) — the
        //     auth/write coupling (capability always checked against the
        //     same args the body runs with) is preserved.
        // -------------------------------------------------------------------
        const resolvedCapability =
          typeof requiredCapability === 'function'
            ? requiredCapability(...args)
            : requiredCapability;
        resolvedCapabilityList = resolvedCapability
          ? Array.isArray(resolvedCapability)
            ? resolvedCapability
            : [resolvedCapability as BaseballCapability]
          : null;
        // Fail closed: a resolver typed to return a non-empty tuple can still
        // manufacture an empty array at runtime (e.g. an empty input list).
        // Treating `[]` as "no capability required" would silently SKIP
        // enforcement entirely — instead, reject it the same way any other
        // capability miss is rejected (a thrown BaseballCapabilityError),
        // same fail-closed posture as this codebase's other capability
        // defaults (e.g. imports.ts's can_manage_imports fallback for an
        // unrecognized shape).
        if (resolvedCapabilityList && resolvedCapabilityList.length === 0) {
          // Team id isn't resolved yet at this point in the flow (CONTEXT
          // runs next) — an empty string here is fine, the thrown error is
          // caught as a recognized control-flow error below regardless of
          // teamId, and the resolver bug it flags has nothing to do with
          // which team was targeted.
          throw new BaseballCapabilityError(
            'can_manage_imports',
            '',
            'Capability requirement resolved to an empty set — denying by default.',
          );
        }
        resolvedCapabilityTag = resolvedCapabilityList?.join('|') ?? null;
        if (resolvedCapabilityTag) {
          scope.setTag('baseball_capability', resolvedCapabilityTag);
        }
        scope.addBreadcrumb({
          category: 'baseball.action',
          message: `capability requirement resolved for ${name}`,
          level: 'info',
          data: { requiredCapability: resolvedCapabilityTag },
        });

        // -------------------------------------------------------------------
        // 2. CONTEXT — resolve the server-validated active baseball context.
        // -------------------------------------------------------------------
        let context: ActiveBaseballContext | null = null;
        if (requireActiveContext) {
          context = await getActiveBaseballContext();
          if (!context) {
            throw new BaseballNoActiveTeamError();
          }
          observedTeamId = context.activeTeamId;
          observedRole = context.activeRole;
          observedCoachId = context.activeCoachId;
          observedPlayerId = context.activePlayerId;
          scope.setTag('baseball_team', context.activeTeamId);
          scope.setTag('baseball_role', context.activeRole);
          scope.addBreadcrumb({
            category: 'baseball.action',
            message: `context resolved for ${name}`,
            level: 'info',
            data: {
              activeTeamId: context.activeTeamId,
              activeRole: context.activeRole,
              fellBackFromStale: context.fellBackFromStale,
            },
          });
        }

        // Resolve the team this action targets / is capability-checked against.
        let targetTeamId = context?.activeTeamId ?? '';
        if (typeof teamFrom === 'function') {
          const resolved = teamFrom(...args);
          if (!resolved) {
            throw new BaseballNoActiveTeamError(
              'Could not resolve a team for this action.',
            );
          }
          targetTeamId = resolved;
          observedTargetTeamId = targetTeamId;
          scope.setTag('baseball_target_team', targetTeamId);
        } else if (context) {
          targetTeamId = context.activeTeamId;
        }
        observedTargetTeamId = targetTeamId || observedTargetTeamId;

        // -------------------------------------------------------------------
        // 3. CAPABILITY — enforce server-side when required.
        //
        //    A single-element resolvedCapabilityList (the ~60 existing static
        //    single-capability call sites, plus any function-form resolver
        //    that returns a single capability) enforces via
        //    requireBaseballCapability EXACTLY as before this list-normalized
        //    form existed.
        //
        //    A multi-element list is ANY-of (OR): the staff member need only
        //    hold ONE of the listed capabilities. Every candidate but the
        //    last is probed with the non-throwing hasBaseballCapability; the
        //    LAST candidate is enforced via requireBaseballCapability so a
        //    genuine miss still throws the real BaseballCapabilityError (not
        //    a bespoke error type) — reported against that last capability.
        // -------------------------------------------------------------------
        if (resolvedCapabilityList) {
          if (!targetTeamId) {
            throw new BaseballNoActiveTeamError(
              'Could not resolve a team for capability enforcement.',
            );
          }
          // baseball_capability tag already set in step 1c, right after
          // resolution — not repeated here.
          if (resolvedCapabilityList.length === 1) {
            await requireBaseballCapability(targetTeamId, resolvedCapabilityList[0]!);
          } else {
            let granted = false;
            for (const cap of resolvedCapabilityList.slice(0, -1)) {
              if (await hasBaseballCapability(targetTeamId, cap)) {
                granted = true;
                break;
              }
            }
            if (!granted) {
              await requireBaseballCapability(
                targetTeamId,
                resolvedCapabilityList[resolvedCapabilityList.length - 1]!,
              );
            }
          }
          scope.addBreadcrumb({
            category: 'baseball.action',
            message: `capability ${resolvedCapabilityTag} granted`,
            level: 'info',
            data: { teamId: targetTeamId },
          });
        }

        // -------------------------------------------------------------------
        // 3b. PLAYER ACCESS — enforce the team player/guardian toggle when
        //     required. Coaches bypass self-service toggles per the resolver's
        //     policy (their staff capability governs them, not the switch).
        // -------------------------------------------------------------------
        if (requiredPlayerAccess) {
          if (!targetTeamId) {
            throw new BaseballNoActiveTeamError(
              'Could not resolve a team for player-access enforcement.',
            );
          }
          scope.setTag('baseball_player_access', requiredPlayerAccess);
          await requirePlayerAccess(targetTeamId, requiredPlayerAccess);
          scope.addBreadcrumb({
            category: 'baseball.action',
            message: `player access ${requiredPlayerAccess} granted`,
            level: 'info',
            data: { teamId: targetTeamId },
          });
        }

        // -------------------------------------------------------------------
        // 4. RUN — execute the action body with the resolved context.
        // -------------------------------------------------------------------
        const ctx: BaseballActionContext = {
          user,
          context: context ?? {
            userId: user.id,
            activeTeamId: '',
            activeRole: 'coach',
            activePlayerId: null,
            activeCoachId: null,
            fellBackFromStale: false,
          },
          activeTeamId: context?.activeTeamId ?? '',
          activeRole: context?.activeRole ?? 'coach',
          activeCoachId: context?.activeCoachId ?? null,
          activePlayerId: context?.activePlayerId ?? null,
          targetTeamId,
        };

        const result = await fn(ctx, ...args);
        observeActionSoftFailure(result, buildTraceContext(true));
        scope.addBreadcrumb({
          category: 'baseball.action',
          message: `done ${name}`,
          level: 'info',
        });
        return result;
      } catch (error) {
        // Expected control-flow throws (auth/context/capability) are re-raised
        // as-is so the caller can branch on them — but still recorded as handled
        // warnings, NOT surfaced as Sentry Errors that drown out real bugs.
        if (
          error instanceof BaseballUnauthorizedError ||
          error instanceof BaseballNoActiveTeamError ||
          error instanceof BaseballCapabilityError ||
          error instanceof PlayerAccessError ||
          error instanceof BaseballDisabledSourceError ||
          error instanceof BaseballDemoReadOnlyError ||
          error instanceof BaseballModuleDisabledError
        ) {
          await logServerException(
            error,
            {
              ...buildTraceContext(true),
              skipSentry: true,
            },
            'warning',
          );
          throw error;
        }

        // RLS-denial capture (Helm Bridge capture class #1) — centralized here
        // so every one of the 60+ withBaseballAction call sites gets it for
        // free, matching golf's per-call-site maybeCaptureRlsDenial coverage
        // (golf.ts, teams.ts, event-documents.ts, etc.) without hand-adding a
        // call to each action file. This generic wrapper layer never sees the
        // specific table a query targeted (that context lives in the action
        // body, several calls deep), so `table` falls back to `featureArea`
        // and `verb` to the catch-all 'rpc' bucket — good enough to route a
        // denial into /admin/errors?source=rls_denial and the rls_denials
        // feature-health rollup. `feature` is deliberately omitted: this
        // file's `feature` option is a free-form string (not the registry's
        // FeatureKey union), so featureForTable's lookup is left to resolve
        // it (or fall back to null) rather than passing a mistyped value.
        // Action files that know their real table name add a precise
        // maybeCaptureRlsDenial call at the swallow site instead (see e.g.
        // games.ts saveFullBoxScore, lifting-v11.ts logSetResult). Checked
        // against the RAW error, not `normalized` below — normalizing a
        // plain PostgrestError-like object into `new Error(String(error))`
        // would drop its `.code`.
        maybeCaptureRlsDenial(
          error && typeof error === 'object'
            ? (error as { code?: string | null; message?: string | null })
            : null,
          {
            table: featureArea,
            verb: 'rpc',
            action: name,
            sport: 'baseball',
            userId: observedUserId,
          },
        );

        // Unexpected failure: capture the FULL error (stack, pg detail/hint)
        // through the central logger so it lands in error_logs + admin_events +
        // Sentry, then rethrow a sanitized error so internals never reach the
        // client.
        const normalized =
          error instanceof Error ? error : new Error(String(error));
        await logServerException(normalized, {
          ...buildTraceContext(false),
          fingerprint: ['server_action', feature, name],
        });

        throw new BaseballActionError();
      }
    });
  };
}

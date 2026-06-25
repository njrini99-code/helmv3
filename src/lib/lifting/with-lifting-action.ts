// =============================================================================
// src/lib/lifting/with-lifting-action.ts
//
// withLiftingAction — auth + org-context + edit-gate wrapper for all Helm
// Lifting Lab server actions. Mirrors the pattern from
// src/lib/baseball/with-baseball-action.ts.
//
// Every lifting Lab mutation runs inside this wrapper. It standardises:
//   1. AUTH        — resolve auth user; throw LiftingUnauthorizedError if none.
//   2. ORG-CONTEXT — resolve the lifting org from opts.orgId or from args.
//   3. EDIT-GATE   — when opts.requireEdit is true, gate via resolveLiftingAccess;
//                    throw LiftingForbiddenError if canEdit is false.
//   4. OBSERVABILITY — Sentry scope tagged { sport:'lifting', feature, action }.
//
// USAGE
//   export const updateProgram = withLiftingAction(
//     'updateProgram',
//     { featureArea: 'lifting-programs', requireEdit: true,
//       orgFrom: (args) => args[0].orgId },
//     async (ctx, input: { orgId: string; name: string }) => {
//       // ctx.user, ctx.orgId, ctx.access all resolved
//       ...
//       return { success: true };
//     },
//   );
// =============================================================================

import 'server-only';

import * as Sentry from '@sentry/nextjs';
import type { User } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';
import { logServerException } from '@/lib/server-error-logger';
import { resolveLiftingAccess } from '@/lib/lifting/access';
import { fromUntyped } from '@/lib/supabase/untyped';
import type { HelmLiftingAccessResult } from '@/lib/types/helm-lifting';

// -----------------------------------------------------------------------------
// Error types
// -----------------------------------------------------------------------------

export class LiftingUnauthorizedError extends Error {
  readonly status = 401;
  constructor(message = 'You must be signed in.') {
    super(message);
    this.name = 'LiftingUnauthorizedError';
  }
}

export class LiftingNoOrgError extends Error {
  readonly status = 403;
  constructor(message = 'No Lifting Lab org resolved for this action.') {
    super(message);
    this.name = 'LiftingNoOrgError';
  }
}

export class LiftingForbiddenError extends Error {
  readonly status = 403;
  constructor(message = 'You do not have edit access to this Lifting Lab.') {
    super(message);
    this.name = 'LiftingForbiddenError';
  }
}

export class LiftingActionError extends Error {
  constructor(message = 'Something went wrong. Please try again.') {
    super(message);
    this.name = 'LiftingActionError';
  }
}

// -----------------------------------------------------------------------------
// Options + context
// -----------------------------------------------------------------------------

export interface WithLiftingActionOptions<TArgs extends unknown[]> {
  /**
   * Logical feature area, e.g. 'lifting-programs' | 'lifting-sessions'.
   * Surfaces as the Sentry `feature` tag.
   */
  featureArea: string;
  /**
   * When true, the wrapper enforces canEdit from resolveLiftingAccess before
   * running the action body. VIEW-ONLY users are rejected.
   */
  requireEdit?: boolean;
  /**
   * Derive the organization_id from the action args. If omitted, the resolved
   * user's FIRST active coach org is used (suitable for single-org actions).
   */
  orgFrom?: (...args: TArgs) => string | null | undefined;
}

/** Context injected into every wrapped action body. */
export interface LiftingActionContext {
  user: User;
  orgId: string;
  access: HelmLiftingAccessResult;
}

export type LiftingActionFn<TArgs extends unknown[], TResult> = (
  ctx: LiftingActionContext,
  ...args: TArgs
) => Promise<TResult>;

// -----------------------------------------------------------------------------
// withLiftingAction
// -----------------------------------------------------------------------------

export function withLiftingAction<TArgs extends unknown[], TResult>(
  name: string,
  opts: WithLiftingActionOptions<TArgs>,
  fn: LiftingActionFn<TArgs, TResult>,
): (...args: TArgs) => Promise<TResult> {
  const { featureArea, requireEdit = false, orgFrom } = opts;

  return async (...args: TArgs): Promise<TResult> => {
    return Sentry.withScope(async (scope) => {
      scope.setTag('sport', 'lifting');
      scope.setTag('feature', featureArea);
      scope.setTag('action', name);
      scope.addBreadcrumb({
        category: 'lifting.action',
        message: `start ${name}`,
        level: 'info',
        data: { feature: featureArea, requireEdit },
      });

      try {
        // 1. AUTH
        const supabase = await createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new LiftingUnauthorizedError();
        scope.setUser({ id: user.id, email: user.email ?? undefined });

        // 2. ORG-CONTEXT
        let orgId: string | null = null;
        if (orgFrom) {
          orgId = orgFrom(...args) ?? null;
        }
        if (!orgId) {
          // Fall back: resolve the user's first active coach org.
          // helm_lifting_coaches isn't in the generated Database types yet, so
          // go through the centralized untyped-table escape hatch (same pattern
          // resolveLiftingAccess uses for this exact table).
          const { data: coachRows } = (await fromUntyped(supabase, 'helm_lifting_coaches')
            .select('organization_id')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .limit(1)) as { data: Array<{ organization_id: string }> | null };
          orgId = coachRows?.[0]?.organization_id ?? null;
        }
        if (!orgId) throw new LiftingNoOrgError();

        scope.setTag('lifting_org', orgId);

        // 3. EDIT-GATE
        const access = await resolveLiftingAccess(orgId);
        scope.addBreadcrumb({
          category: 'lifting.action',
          message: `access resolved for ${name}`,
          level: 'info',
          data: { isCoach: access.isCoach, canEdit: access.canEdit, canView: access.canView },
        });

        if (requireEdit && !access.canEdit) {
          throw new LiftingForbiddenError();
        }
        if (!access.canView) {
          throw new LiftingForbiddenError('You do not have access to this Lifting Lab.');
        }

        // 4. RUN
        const ctx: LiftingActionContext = { user, orgId, access };
        const result = await fn(ctx, ...args);
        scope.addBreadcrumb({ category: 'lifting.action', message: `done ${name}`, level: 'info' });
        return result;
      } catch (error) {
        // Expected control-flow errors: re-raise as-is (logged as warnings)
        if (
          error instanceof LiftingUnauthorizedError ||
          error instanceof LiftingNoOrgError ||
          error instanceof LiftingForbiddenError
        ) {
          await logServerException(
            error,
            {
              action: name,
              featureArea,
              source: 'server_action',
              handled: true,
              skipSentry: true,
              tags: { sport: 'lifting', feature: featureArea },
            },
            'warning',
          );
          throw error;
        }

        // Unexpected failure: capture full error, rethrow sanitized
        const normalized = error instanceof Error ? error : new Error(String(error));
        await logServerException(normalized, {
          action: name,
          featureArea,
          source: 'server_action',
          handled: false,
          tags: { sport: 'lifting', feature: featureArea },
          fingerprint: ['server_action', featureArea, name],
        });
        throw new LiftingActionError();
      }
    });
  };
}

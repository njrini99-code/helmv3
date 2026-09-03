import 'server-only';
import { FLAG_REGISTRY } from './registry.generated';
import type { FlagDefinition, FlagEnvironmentName } from './types';
import { resolveFlagEnvironment } from './environment';
import { recordFlagEvaluationToSentry } from './sentry';

export interface FlagEvaluationContext {
  /** Overrides environment detection — mainly for tests. */
  environment?: FlagEnvironmentName;
  /** Skips the Sentry correlation side effect — mainly for tests. */
  skipTelemetry?: boolean;
  /** Injects a registry other than the real generated one — for tests. */
  registry?: readonly FlagDefinition[];
  /** Overrides "now" for expiry evaluation — for tests. */
  now?: Date;
}

export type FlagEvaluationReason =
  | 'unknown_flag'
  | 'archived'
  | 'expired'
  | 'environment_rollout'
  | 'default_fallback';

export interface FlagEvaluation {
  value: boolean;
  reason: FlagEvaluationReason;
}

/**
 * Evaluates one flag by `feature_id`.
 *
 * Fail-closed contract:
 *   - a name absent from the registry evaluates to `false` (never assume a
 *     typo means "on");
 *   - an `archived` flag evaluates to `false` regardless of `default`/
 *     `environment`;
 *   - a flag whose `expires_at` has passed evaluates to `false` — this is a
 *     runtime backstop, not the primary control; `npm run flags:check`
 *     (CI) is supposed to catch an expired-but-still-`active` flag before
 *     merge, but a flag can still age past `expires_at` on a long-lived
 *     deploy between CI runs;
 *   - otherwise, the running environment's rollout column
 *     (`environment.production` / `.preview` / `.development`) applies, and
 *     `default` is the fallback if that column is somehow absent.
 *
 * Every evaluation is reported to Sentry (name + boolean value only) via
 * `recordFlagEvaluationToSentry`, unless `ctx.skipTelemetry` is set.
 */
export function evaluateFlag(featureId: string, ctx: FlagEvaluationContext = {}): FlagEvaluation {
  const registry = ctx.registry ?? FLAG_REGISTRY;
  const now = ctx.now ?? new Date();
  const flag = registry.find((f) => f.feature_id === featureId);

  if (!flag) {
    return { value: false, reason: 'unknown_flag' };
  }
  if (flag.status === 'archived') {
    return { value: false, reason: 'archived' };
  }
  if (flag.expires_at != null && Date.parse(flag.expires_at) < now.getTime()) {
    return { value: false, reason: 'expired' };
  }

  const environment = ctx.environment ?? resolveFlagEnvironment();
  const rolloutValue = flag.environment[environment];
  if (typeof rolloutValue === 'boolean') {
    return { value: rolloutValue, reason: 'environment_rollout' };
  }
  return { value: flag.default, reason: 'default_fallback' };
}

/**
 * The main entry point: `isFlagEnabled('some_flag')`. See `evaluateFlag`
 * for the fail-closed contract; this wraps it, adds the Sentry side effect,
 * and returns only the boolean.
 */
export function isFlagEnabled(featureId: string, ctx: FlagEvaluationContext = {}): boolean {
  const { value } = evaluateFlag(featureId, ctx);
  if (!ctx.skipTelemetry) {
    recordFlagEvaluationToSentry(featureId, value);
  }
  return value;
}

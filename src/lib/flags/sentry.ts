import * as Sentry from '@sentry/nextjs';

/**
 * Attaches a feature-flag evaluation to Sentry — the plan's Phase F flag
 * correlation (`docs/ai-system/CONTROL_PLANE_IMPLEMENTATION_PLAN_2026-09-03.md`
 * §9, and the Sentry brief's §28 issue-detail drill-through) and the
 * reliability extension's §14-15 governance line "flags attach to events".
 *
 * `@sentry/nextjs` 10.71.0 ships a real `featureFlagsIntegration` (confirmed
 * at runtime: `require('@sentry/nextjs').featureFlagsIntegration` is a
 * function; `getClient().getIntegrationByName('FeatureFlags')` is the
 * documented lookup). But `Sentry.init()` — where an integration gets
 * registered — lives in `src/instrumentation.ts` and
 * `src/instrumentation-client.ts`, both owned by the parallel Sentry
 * session per `docs/ai-system/HANDOFF_BRIDGE_CONTROL_PLANE_2026-09-03.md`'s
 * ownership table. This module cannot register the integration itself
 * without crossing that boundary, so today `getIntegrationByName('FeatureFlags')`
 * returns `undefined` in every environment. When the Sentry session adds
 * `Sentry.featureFlagsIntegration()` to its `integrations: [...]` array,
 * this helper starts using the real buffered API with no caller-side change
 * — it is written against the integration existing, not against it being
 * absent.
 *
 * Until then it falls back to a bounded per-event tag,
 * `flag.<feature_id>` = `"true" | "false"`. Bounded by construction: the
 * only names that ever reach this function are `FLAG_REGISTRY` entries
 * (`isFlagEnabled` is the sole caller), so tag cardinality is capped at the
 * size of `config/feature-flags.yml`, not user input.
 *
 * Never throws. Never records anything but the flag NAME and its boolean
 * VALUE — no user id, no request data, no environment context beyond what
 * Sentry already attaches to the event on its own.
 */
export function recordFlagEvaluationToSentry(featureId: string, value: boolean): void {
  try {
    interface FeatureFlagsLike {
      // `name` (not to be confused with the flag name passed to
      // addFeatureFlag) is required by @sentry/core's `Integration`
      // interface, the bound on `getIntegrationByName`'s type parameter.
      name: string;
      addFeatureFlag: (name: string, value: unknown) => void;
    }

    const client = Sentry.getClient?.();
    const integration = client?.getIntegrationByName<FeatureFlagsLike>('FeatureFlags');

    if (integration && typeof integration.addFeatureFlag === 'function') {
      integration.addFeatureFlag(featureId, value);
      return;
    }

    Sentry.setTag(`flag.${featureId}`, value ? 'true' : 'false');
  } catch {
    // Flag telemetry must never break the caller's evaluation path.
  }
}

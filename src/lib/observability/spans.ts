/**
 * Helm's span/attribute vocabulary (the §29 tagging standard, as code).
 *
 * WHY A MODULE RATHER THAN A CONVENTION
 * -------------------------------------
 * A documented convention decays: the tenth person to add a span writes
 * `feature_name` instead of `feature`, and a dashboard filtered on `feature`
 * silently stops counting their traffic. Nothing errors. The chart just
 * quietly becomes wrong, which is worse than having no chart at all.
 *
 * Everything here is therefore a constant or a typed helper. If a name changes
 * it changes in one place, and a typo is a compile error.
 *
 * CARDINALITY RULE — the one that matters
 * ---------------------------------------
 * Span attributes and metric dimensions are not the same thing. A `round_id`
 * on a span is exactly what you want when reading ONE trace. The same value as
 * a global tag on every event creates an unbounded key space that degrades
 * search and costs money.
 *
 * So: identity values (round_id, player_id) go on a SPAN, scoped to the one
 * request that produced them. Low-cardinality classifiers (sport, feature,
 * action, result) are safe anywhere. Nothing here ever emits an email address
 * or a token — `redact-pii.ts` is the backstop, not the plan.
 */
import * as Sentry from '@sentry/nextjs';

/** Stable low-cardinality classifiers. Safe as tags, attributes, or dimensions. */
export const SPORT = 'sport';
export const FEATURE = 'feature';
export const ACTION = 'action';
export const RESULT = 'result';
export const OPERATION = 'operation';
export const ERROR_CODE = 'error_code';
export const RUNTIME = 'runtime';

/**
 * Span operations. Sentry groups and charts by `op`, so these must stay stable
 * — renaming one orphans every saved query and alert built on it.
 */
export const OP_SERVER_ACTION = 'function.server_action';
export const OP_ROUND_STAGE = 'golf.round.stage';

/** The feature key shared by every round/shot tracking surface. */
export const FEATURE_ROUND_TRACKING = 'round_tracking';

/**
 * Attribute values Sentry will accept. Deliberately narrow: no objects, no
 * arrays. That is the type-level expression of "we do not put payloads on
 * spans" — a shot array cannot be passed through this signature.
 */
export type SpanAttributeValue = string | number | boolean | undefined | null;

/**
 * Drop null/undefined so a span carries "no value" as an absent key rather
 * than the string "undefined", which is unsearchable noise in Sentry's UI.
 */
export function safeAttributes(
  attributes: Record<string, SpanAttributeValue>,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (value === null || value === undefined) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Pull the stable, non-sensitive parts of a Supabase/Postgres error onto a
 * span: SQLSTATE / PostgREST code is the field that actually identifies a
 * failure class (57014 statement timeout, 40P01 deadlock, 55000 lifecycle
 * guard, 42501 insufficient privilege).
 *
 * `message` / `details` / `hint` are deliberately NOT copied. They are already
 * preserved by the existing server logger, which runs them through PII
 * redaction; a span attribute has no such filter, and Postgres error text can
 * echo row values back at you.
 */
export function describeDbErrorForSpan(error: unknown): Record<string, string> {
  if (!error || typeof error !== 'object') return {};
  const candidate = error as { code?: unknown; name?: unknown };
  const out: Record<string, string> = {};
  if (typeof candidate.code === 'string' && candidate.code) out[ERROR_CODE] = candidate.code;
  if (typeof candidate.name === 'string' && candidate.name) out['error_type'] = candidate.name;
  return out;
}

/**
 * Run one logical stage of a larger operation as a child span.
 *
 * Stages are APPLICATION phases (`resolve_player`, `prepare_shots_payload`),
 * not network calls — Sentry's Supabase integration already emits a `db` span
 * for every query and RPC. The point of these is to answer "how far did we
 * get" when something fails BETWEEN the queries, which no automatic
 * instrumentation can tell you.
 *
 * Never changes the wrapped function's behaviour: same resolve, same reject.
 * On throw, the failure class is recorded on the stage span before rethrowing,
 * so "which stage failed" is answerable from the trace alone.
 */
export async function roundStage<T>(
  stage: string,
  attributes: Record<string, SpanAttributeValue>,
  fn: () => Promise<T>,
): Promise<T> {
  return Sentry.startSpan(
    {
      name: stage,
      op: OP_ROUND_STAGE,
      attributes: safeAttributes({
        [SPORT]: 'golf',
        [FEATURE]: FEATURE_ROUND_TRACKING,
        stage,
        ...attributes,
      }),
    },
    async (span) => {
      try {
        const value = await fn();
        span?.setAttribute(RESULT, 'success');
        return value;
      } catch (error) {
        span?.setAttribute(RESULT, 'error');
        for (const [key, value] of Object.entries(describeDbErrorForSpan(error))) {
          span?.setAttribute(key, value);
        }
        throw error;
      }
    },
  );
}

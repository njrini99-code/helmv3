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

/**
 * Workflow-level ops for Phase C's instrumentation pass. Each names ONE
 * complete user-facing operation (as opposed to `OP_ROUND_STAGE`, which
 * names an internal phase within one). Kept here, not invented at each call
 * site, for the same reason every other constant in this file is a constant:
 * a typo in a raw string compiles; a typo in an import does not.
 */
export const OP_ROUND_CREATE = 'golf.round.create';
export const OP_ROUND_AUTOSAVE = 'golf.round.autosave';
export const OP_ROUND_SUBMIT = 'golf.round.submit';
export const OP_SHOT_PERSIST = 'golf.shot.persist';
export const OP_ROUND_RECOVER = 'golf.round.recover';
export const OP_COACHHELM_REQUEST = 'coachhelm.request';
export const OP_COACHHELM_PERSIST = 'coachhelm.persist';
export const OP_JOB_RUN = 'job.run';
export const OP_PUSH_DELIVER = 'push.deliver';
export const OP_AUTH_ATTEMPT = 'auth.attempt';

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
/**
 * A resolved value shaped like supabase-js's `{ data, error }` RPC response.
 * The RPC promise only ever REJECTS on a network/abort failure; a genuine
 * Postgres/PostgREST failure (a SQLSTATE, an RLS denial, a lifecycle guard
 * exception) comes back as a RESOLVED value with `error` populated. Without
 * this check, `roundStage` would show `result: success` on a span for
 * exactly the failures this instrumentation exists to surface.
 */
function isSupabaseErrorShaped(value: unknown): value is { error: unknown } {
  return Boolean(value) && typeof value === 'object' && 'error' in (value as object)
    && (value as { error: unknown }).error != null;
}

/**
 * The full set of outcomes a shot-tracking write is normalized to, wherever
 * this vocabulary is used (autosave, submit, and — once wired — the Golf
 * Tracer). `rpc_failed` covers a resolved `{error}` from PostgREST that
 * `classifyOutcome` didn't map to something more specific; `unknown_commit`
 * is reserved for an abort/timeout raced against the RPC's own commit — the
 * one outcome that must NEVER be inferred from a thrown error alone, since
 * the transaction may have completed server-side regardless of what the
 * client observed.
 */
export type RoundStageOutcome =
  | 'success'
  | 'validation_failed'
  | 'auth_expired'
  | 'busy'
  | 'timeout'
  | 'network_failed'
  | 'rpc_failed'
  | 'unknown_commit';

/**
 * Classifies a save_partial_round_atomic-shaped RPC response
 * (`{ data: { success, error }, error }`) into the canonical autosave
 * outcome taxonomy. Exported so both the call site and its tests use the
 * exact same mapping — the taxonomy only means something if it is applied
 * consistently everywhere an autosave result is observed.
 *
 * `busy` and `conflict` are normal, expected outcomes (single-flight guard /
 * optimistic-lock race) and are NOT errors from the tracer's point of view —
 * they classify as their own named outcome rather than 'rpc_failed' so a
 * dashboard can tell "healthy coalescing" apart from "broken".
 */
export function classifyAutosaveOutcome(
  value: { data?: { success?: boolean; error?: unknown } | null; error?: { code?: string; message?: string } | null },
): RoundStageOutcome | undefined {
  if (value.error) return undefined; // let the generic DB-error path classify + attach SQLSTATE
  const businessError = value.data?.error;
  if (value.data?.success === false && typeof businessError === 'string') {
    if (businessError === 'busy') return 'busy';
    if (businessError === 'conflict') return 'busy';
    if (businessError.toLowerCase().includes('already been completed')) return 'busy';
    if (businessError.toLowerCase().includes('permission') || businessError.toLowerCase().includes('not found')) {
      return 'auth_expired';
    }
    return 'rpc_failed';
  }
  return 'success';
}

export async function roundStage<T>(
  stage: string,
  attributes: Record<string, SpanAttributeValue>,
  fn: () => Promise<T>,
  /**
   * Inspect the resolved value and return a specific RoundStageOutcome, or
   * undefined to fall back to the generic success/error heuristic below.
   * Needed because a business-level outcome (autosave's 'busy'/'conflict')
   * lives INSIDE a successfully-resolved RPC response, not in `.error` —
   * the generic heuristic alone cannot see it.
   */
  classifyOutcome?: (value: T) => RoundStageOutcome | undefined,
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
        const classified = classifyOutcome?.(value);
        if (classified) {
          span?.setAttribute(RESULT, classified);
        } else if (isSupabaseErrorShaped(value)) {
          span?.setAttribute(RESULT, 'rpc_failed' satisfies RoundStageOutcome);
          for (const [key, attrValue] of Object.entries(describeDbErrorForSpan(value.error))) {
            span?.setAttribute(key, attrValue);
          }
        } else {
          span?.setAttribute(RESULT, 'success' satisfies RoundStageOutcome);
        }
        return value;
      } catch (error) {
        // A thrown error here is a network/abort failure, not a Postgres
        // response — supabase-js's RPC promise only rejects on those. See
        // `unknown_commit` above: distinguishing a genuine client-side abort
        // from a request whose commit already happened server-side is NOT
        // possible from this signal alone, so this stays classified as
        // network_failed rather than guessing at the DB outcome.
        span?.setAttribute(
          RESULT,
          (error instanceof Error && /timeout|aborted/i.test(error.message)
            ? 'timeout'
            : 'network_failed') satisfies RoundStageOutcome,
        );
        for (const [key, value] of Object.entries(describeDbErrorForSpan(error))) {
          span?.setAttribute(key, value);
        }
        throw error;
      }
    },
  );
}

/**
 * The outcome taxonomy for Phase C's workflow-level spans (`OP_ROUND_CREATE`,
 * `OP_COACHHELM_REQUEST`, `OP_JOB_RUN`, etc.) — a SUPERSET of
 * `RoundStageOutcome`, deliberately not an alias of it. `RoundStageOutcome` is
 * locked to what `classifyAutosaveOutcome`/`roundStage` actually distinguish
 * today; widening it here to add `permission_denied`/`conflict`/
 * `provider_failed`/`not_found`/`unknown` would let every existing `roundStage`
 * call site silently accept an outcome the taxonomy tests never exercised.
 * Two names, two contracts, one shared spelling for the eight members they
 * hold in common.
 */
export type WorkflowOutcome =
  | RoundStageOutcome
  | 'permission_denied'
  | 'conflict'
  | 'provider_failed'
  | 'not_found'
  | 'unknown';

/**
 * Records a workflow span's terminal outcome the same way at every call
 * site: `result` always gets set from `outcome`, and any extra attributes
 * (typically `error_code`) are attached through `safeAttributes` so a
 * null/undefined value never becomes the literal string "undefined" in
 * Sentry's UI.
 *
 * No-ops on a missing span (sampled-out or already-ended) and never throws —
 * observability must not be able to break the workflow it is describing.
 */
export function finishWorkflowSpan(
  span: Sentry.Span | undefined,
  outcome: WorkflowOutcome,
  extra?: Record<string, SpanAttributeValue>,
): void {
  if (!span) return;
  try {
    span.setAttribute(RESULT, outcome);
    for (const [key, value] of Object.entries(safeAttributes(extra ?? {}))) {
      span.setAttribute(key, value);
    }
  } catch {
    // Never let a telemetry write break the workflow it is describing.
  }
}

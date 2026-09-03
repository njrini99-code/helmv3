/**
 * Helm's metric vocabulary — the ONLY place a metric NAME is allowed to
 * live, and the ONLY place that decides which DIMENSIONS are safe to put on
 * one.
 *
 * WHY A CATALOGUE, NOT A CONVENTION
 * ----------------------------------
 * Same argument as `spans.ts`'s header, aimed at a sharper failure mode.
 * `Sentry.metrics.count('helm.workflow.sucess', ...)` (typo) compiles, ships,
 * and silently stops a dashboard from counting anything — nobody sees an
 * error, they see a chart that quietly went to zero. Routing every emission
 * through a typed constant turns that typo into a compile error instead of a
 * production incident nobody notices for a week.
 *
 * CARDINALITY, AGAIN
 * -------------------
 * `spans.ts` draws the line between "identity value, scope it to one span"
 * and "low-cardinality classifier, safe as a global dimension". Metric
 * dimensions are the SAME line, drawn more strictly, because a metric
 * dimension is a Sentry-side index key forever — there is no equivalent of
 * "just this one trace". `ALLOWED_METRIC_DIMENSIONS` below is the complete
 * list. Nothing else is ever attached to a Helm metric, and `beforeSendMetric`
 * in both instrumentation entrypoints enforces the same list a second time,
 * independently of every call site in this file.
 *
 * FAILURE MODE THIS FILE REFUSES TO HAVE
 * ----------------------------------------
 * A Sentry outage, a malformed value, a thrown getter — NONE of it may ever
 * reach product code. Every exported function here is wrapped in try/catch
 * and returns `void`. A metric that fails to record is a worse dashboard;
 * a metric call that throws is a broken round save. Only ONE function in
 * this file deliberately breaks that rule in the other direction:
 * `enforceMetricAttributeAllowlist` (the `beforeSendMetric` hook body) fails
 * CLOSED — on an internal error it strips attributes rather than letting an
 * unsanitized value through — because its entire job is being the second,
 * independent line of defence against a PII leak, and "fail open" there
 * would silently disable that defence exactly when it is needed.
 *
 * ATTRIBUTE-LEVEL DROPPING, NOT METRIC-LEVEL
 * ---------------------------------------------
 * `sanitizeMetricAttributes` drops the single BAD ATTRIBUTE and keeps
 * every other attribute plus the metric event itself. It never drops the
 * whole metric — a `helm.workflow.failure` count that arrives with one
 * fewer dimension than intended is still a real, countable event; silently
 * discarding the entire increment because one caller-supplied value looked
 * PII-shaped would make the dashboards under-count without any visible
 * signal that they were doing so.
 */
import * as Sentry from '@sentry/nextjs';
import { scheduleTelemetryFlush } from './flush';

// ---------------------------------------------------------------------------
// Dimensions
// ---------------------------------------------------------------------------

/** The complete, closed set of dimension keys a Helm metric may carry. */
export const ALLOWED_METRIC_DIMENSIONS = [
  'environment',
  'sport',
  'feature',
  'action',
  'operation',
  'result',
  'runtime',
  'provider',
  'error_code',
  'model',
  'job_name',
] as const;

export type AllowedMetricDimension = (typeof ALLOWED_METRIC_DIMENSIONS)[number];

const ALLOWED_METRIC_DIMENSION_SET: ReadonlySet<string> = new Set(ALLOWED_METRIC_DIMENSIONS);

export type MetricAttributes = Partial<Record<AllowedMetricDimension, string | number | boolean>>;

/** Conservative email matcher — same shape redact-pii.ts uses for event text. */
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
/** RFC 4122-shaped UUID, any version/variant. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Three base64url segments — the JWT compact-serialization shape. */
const JWT_RE = /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/;
/** A URL carrying a query string — the shape most likely to embed a token. */
const URL_WITH_QUERY_RE = /^https?:\/\/[^\s]+\?[^\s]+$/i;

/** True when a string VALUE looks like it carries PII, regardless of key. */
function looksLikePii(value: string): boolean {
  return EMAIL_RE.test(value) || UUID_RE.test(value) || JWT_RE.test(value) || URL_WITH_QUERY_RE.test(value);
}

/**
 * `error_code` is documented as "SQLSTATE or short class, never a message" —
 * enforced here, not just asked for in a comment. A genuine SQLSTATE
 * (`57014`) or exception class (`AuthApiError`) is a short, space-free
 * token; a message ("permission denied for table golf_rounds") is neither.
 */
function looksLikeErrorMessage(value: string): boolean {
  return value.length > 64 || /\s/.test(value);
}

/**
 * The allow-list + PII-shape filter every `record*` function routes its
 * attributes through before they ever reach the SDK, and the same filter
 * `enforceMetricAttributeAllowlist` applies again at the `beforeSendMetric`
 * boundary. Drops the offending ATTRIBUTE, never the whole metric (see file
 * header). Never throws — a hostile input (e.g. a getter that throws) is
 * treated as an unsafe value for that key and dropped, not propagated.
 */
export function sanitizeMetricAttributes(input: Record<string, unknown>): MetricAttributes {
  const out: MetricAttributes = {};
  if (!input || typeof input !== 'object') return out;
  for (const key of Object.keys(input)) {
    try {
      if (!ALLOWED_METRIC_DIMENSION_SET.has(key)) continue;
      const value = input[key];
      if (value === null || value === undefined) continue;
      if (typeof value === 'number' || typeof value === 'boolean') {
        out[key as AllowedMetricDimension] = value;
        continue;
      }
      if (typeof value !== 'string') continue;
      if (looksLikePii(value)) continue;
      if (key === 'error_code' && looksLikeErrorMessage(value)) continue;
      out[key as AllowedMetricDimension] = value;
    } catch {
      // A hostile getter/toString on this key is an unsafe value — drop
      // just this attribute and keep sanitizing the rest.
      continue;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// beforeSendMetric — the second, independent line of defence
// ---------------------------------------------------------------------------

/** The minimal shape `beforeSendMetric` is called with — see @sentry/core's `Metric`. */
interface SentryMetricLike {
  name: string;
  value: number;
  type: 'counter' | 'gauge' | 'distribution';
  unit?: string;
  attributes?: Record<string, unknown>;
}

/**
 * The body of both instrumentation entrypoints' `beforeSendMetric` hook.
 * Re-applies `sanitizeMetricAttributes` to whatever attributes a metric
 * event arrives with, independently of whether the call site that emitted
 * it used this file's `record*` helpers. Deliberately FAILS CLOSED: if
 * reading or sanitizing `metric.attributes` itself throws, the returned
 * metric carries NO attributes rather than the unsanitized originals — see
 * the file header for why this one function inverts the fail-open rule.
 * Never returns `null`: dropping the entire metric is not this hook's job
 * (a metric with zero dimensions is still an honest count), only cleaning
 * what it carries.
 */
export function enforceMetricAttributeAllowlist<T extends SentryMetricLike>(metric: T): T {
  let attributes: MetricAttributes = {};
  try {
    attributes = sanitizeMetricAttributes((metric.attributes ?? {}) as Record<string, unknown>);
  } catch {
    attributes = {};
  }
  // Rebuild from the named fields rather than `{ ...metric, attributes }`.
  // A spread evaluates EVERY own enumerable property of `metric` — including
  // a hostile `attributes` getter — before the explicit `attributes` key
  // below can override it, which would re-throw the very error the try/catch
  // above just absorbed. Reading each field individually keeps the failure
  // contained to the one property that produced it.
  return {
    name: metric.name,
    value: metric.value,
    type: metric.type,
    unit: metric.unit,
    attributes,
  } as T;
}

// ---------------------------------------------------------------------------
// Metric name catalogue
// ---------------------------------------------------------------------------

export const METRIC_WORKFLOW_ATTEMPT = 'helm.workflow.attempt';
export const METRIC_WORKFLOW_SUCCESS = 'helm.workflow.success';
export const METRIC_WORKFLOW_FAILURE = 'helm.workflow.failure';
export const METRIC_WORKFLOW_DURATION = 'helm.workflow.duration';

export const METRIC_DB_FAILURE = 'helm.db.failure';
export const METRIC_DB_DURATION = 'helm.db.duration';

export const METRIC_JOB_STARTED = 'helm.job.started';
export const METRIC_JOB_COMPLETED = 'helm.job.completed';
export const METRIC_JOB_FAILED = 'helm.job.failed';
export const METRIC_JOB_DURATION = 'helm.job.duration';

export const METRIC_AI_REQUEST = 'helm.ai.request';
export const METRIC_AI_SUCCESS = 'helm.ai.success';
export const METRIC_AI_FAILURE = 'helm.ai.failure';
export const METRIC_AI_DURATION = 'helm.ai.duration';
export const METRIC_AI_INPUT_TOKENS = 'helm.ai.input_tokens';
export const METRIC_AI_OUTPUT_TOKENS = 'helm.ai.output_tokens';

export const METRIC_PUSH_ATTEMPT = 'helm.push.attempt';
export const METRIC_PUSH_DELIVERED = 'helm.push.delivered';
export const METRIC_PUSH_FAILED = 'helm.push.failed';

export const METRIC_AUTH_ATTEMPT = 'helm.auth.attempt';
export const METRIC_AUTH_FAILURE = 'helm.auth.failure';

/**
 * Phase 2 Track B addition (Storage observability, brief §11/§36-39) — an
 * ADDITIVE constant + one record function only, matching this file's
 * existing helm.db.failure/helm.auth.failure shape. This file is owned by
 * another track; nothing above this comment was touched.
 */
export const METRIC_STORAGE_FAILURE = 'helm.storage.failure';

/**
 * Not part of the six named families above — `structured-log.ts` needs
 * exactly one counter (how often it silently drops a secret-shaped field),
 * and this file is where every Helm metric name lives, full stop. Kept here
 * rather than hardcoded in structured-log.ts so a rename is still one place.
 */
export const METRIC_LOG_REDACTED_FIELD = 'helm.log.redacted_field';

// ---------------------------------------------------------------------------
// Low-level, fail-open emitters
// ---------------------------------------------------------------------------

function safeCount(name: string, value: number, attributes: Record<string, unknown>): void {
  try {
    Sentry.metrics.count(name, value, { attributes: sanitizeMetricAttributes(attributes) });
    scheduleTelemetryFlush();
  } catch {
    // A Sentry failure must never reach product code.
  }
}

function safeDistribution(
  name: string,
  value: number,
  attributes: Record<string, unknown>,
  unit: string,
): void {
  try {
    Sentry.metrics.distribution(name, value, { unit, attributes: sanitizeMetricAttributes(attributes) });
    scheduleTelemetryFlush();
  } catch {
    // A Sentry failure must never reach product code.
  }
}

// ---------------------------------------------------------------------------
// record* — one call per completed operation, typed outcome + duration in
// ---------------------------------------------------------------------------

interface RecordWorkflowInput {
  feature: string;
  action: string;
  /** Any non-'success' outcome buckets as helm.workflow.failure; the exact
   *  value still rides along on the `result` dimension for drill-down. */
  outcome: string;
  durationMs?: number;
  sport?: string;
  environment?: string;
  operation?: string;
  runtime?: string;
  errorCode?: string;
}

/** Emits helm.workflow.{attempt,success|failure,duration}. Call once, after the workflow settles. */
export function recordWorkflow(input: RecordWorkflowInput): void {
  const dims = {
    feature: input.feature,
    action: input.action,
    sport: input.sport,
    environment: input.environment,
    operation: input.operation,
    runtime: input.runtime,
  };
  safeCount(METRIC_WORKFLOW_ATTEMPT, 1, dims);
  const outcomeDims = { ...dims, result: input.outcome, error_code: input.errorCode };
  safeCount(input.outcome === 'success' ? METRIC_WORKFLOW_SUCCESS : METRIC_WORKFLOW_FAILURE, 1, outcomeDims);
  if (typeof input.durationMs === 'number') {
    safeDistribution(METRIC_WORKFLOW_DURATION, input.durationMs, dims, 'millisecond');
  }
}

interface RecordDbFailureInput {
  feature: string;
  action: string;
  errorCode?: string;
  durationMs?: number;
  sport?: string;
  environment?: string;
  operation?: string;
  runtime?: string;
}

/**
 * Emits ONLY helm.db.{failure,duration} — the catalogue has no
 * helm.db.attempt/success (Supabase call volume is already captured by the
 * `db` spans `withSupabaseTracing` produces; this exists for the failure
 * signal a span sampling decision can drop). Call only from a DB error branch.
 */
export function recordDbFailure(input: RecordDbFailureInput): void {
  const dims = {
    feature: input.feature,
    action: input.action,
    sport: input.sport,
    environment: input.environment,
    operation: input.operation,
    runtime: input.runtime,
    error_code: input.errorCode,
  };
  safeCount(METRIC_DB_FAILURE, 1, dims);
  if (typeof input.durationMs === 'number') {
    safeDistribution(METRIC_DB_DURATION, input.durationMs, dims, 'millisecond');
  }
}

interface RecordJobInput {
  jobName: string;
  outcome: string;
  durationMs?: number;
  environment?: string;
  runtime?: string;
  errorCode?: string;
}

/** Emits helm.job.{started,completed|failed,duration}. Call once, after the job settles. */
export function recordJob(input: RecordJobInput): void {
  const dims = { job_name: input.jobName, environment: input.environment, runtime: input.runtime };
  safeCount(METRIC_JOB_STARTED, 1, dims);
  const outcomeDims = { ...dims, result: input.outcome, error_code: input.errorCode };
  safeCount(input.outcome === 'success' ? METRIC_JOB_COMPLETED : METRIC_JOB_FAILED, 1, outcomeDims);
  if (typeof input.durationMs === 'number') {
    safeDistribution(METRIC_JOB_DURATION, input.durationMs, dims, 'millisecond');
  }
}

interface RecordAiInput {
  feature: string;
  action: string;
  outcome: string;
  model?: string;
  provider?: string;
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  environment?: string;
  runtime?: string;
  errorCode?: string;
}

/**
 * Emits helm.ai.{request,success|failure,duration} always, plus
 * .input_tokens/.output_tokens distributions only when the caller supplies
 * them (a failed request before the SDK returns usage has neither).
 */
export function recordAi(input: RecordAiInput): void {
  const dims = {
    feature: input.feature,
    action: input.action,
    model: input.model,
    provider: input.provider,
    environment: input.environment,
    runtime: input.runtime,
  };
  safeCount(METRIC_AI_REQUEST, 1, dims);
  const outcomeDims = { ...dims, result: input.outcome, error_code: input.errorCode };
  safeCount(input.outcome === 'success' ? METRIC_AI_SUCCESS : METRIC_AI_FAILURE, 1, outcomeDims);
  if (typeof input.durationMs === 'number') {
    safeDistribution(METRIC_AI_DURATION, input.durationMs, dims, 'millisecond');
  }
  if (typeof input.inputTokens === 'number') {
    safeDistribution(METRIC_AI_INPUT_TOKENS, input.inputTokens, dims, 'none');
  }
  if (typeof input.outputTokens === 'number') {
    safeDistribution(METRIC_AI_OUTPUT_TOKENS, input.outputTokens, dims, 'none');
  }
}

interface RecordPushInput {
  feature: string;
  action: string;
  outcome: string;
  provider?: string;
  environment?: string;
  runtime?: string;
  errorCode?: string;
}

/** Emits helm.push.{attempt,delivered|failed}. No duration metric exists in the catalogue. */
export function recordPush(input: RecordPushInput): void {
  const dims = {
    feature: input.feature,
    action: input.action,
    provider: input.provider,
    environment: input.environment,
    runtime: input.runtime,
  };
  safeCount(METRIC_PUSH_ATTEMPT, 1, dims);
  const outcomeDims = { ...dims, result: input.outcome, error_code: input.errorCode };
  safeCount(input.outcome === 'success' ? METRIC_PUSH_DELIVERED : METRIC_PUSH_FAILED, 1, outcomeDims);
}

interface RecordAuthInput {
  action: string;
  outcome: string;
  environment?: string;
  runtime?: string;
  errorCode?: string;
}

/**
 * Emits helm.auth.attempt always, and helm.auth.failure ONLY on a
 * non-success outcome — the catalogue has no helm.auth.success/duration
 * (a successful auth attempt is not, on its own, an interesting metric;
 * failures are what this exists to count).
 */
export function recordAuth(input: RecordAuthInput): void {
  const dims = { action: input.action, environment: input.environment, runtime: input.runtime };
  safeCount(METRIC_AUTH_ATTEMPT, 1, dims);
  if (input.outcome !== 'success') {
    safeCount(METRIC_AUTH_FAILURE, 1, { ...dims, result: input.outcome, error_code: input.errorCode });
  }
}

/** Bumped by structured-log.ts every time it silently drops a secret-shaped field. */
export function recordLogRedactedField(dims: Record<string, unknown> = {}): void {
  safeCount(METRIC_LOG_REDACTED_FIELD, 1, dims);
}

interface RecordStorageFailureInput {
  feature: string;
  action: string;
  errorCode?: string;
  sport?: string;
  environment?: string;
  operation?: string;
  runtime?: string;
}

/**
 * Emits ONLY helm.storage.failure — same shape as `recordDbFailure` (no
 * attempt/success counterpart; call only from a Storage error branch). Added
 * for `observe-storage.ts` (Phase 2 Track B); this file has no other
 * knowledge of Storage.
 */
export function recordStorageFailure(input: RecordStorageFailureInput): void {
  safeCount(METRIC_STORAGE_FAILURE, 1, {
    feature: input.feature,
    action: input.action,
    sport: input.sport,
    environment: input.environment,
    operation: input.operation,
    runtime: input.runtime,
    error_code: input.errorCode,
  });
}

/**
 * Phase 2 Track B addition (Realtime observability, brief §12/§36-39) —
 * ADDITIVE constant + one record function, same discipline as the Storage
 * addition above. `metrics.ts` has NO `server-only` marker (confirmed by
 * reading its own import graph — `flush.ts` and `vercel-wait-until.ts`
 * neither import `server-only`), so this IS safe to call from the client-side
 * `realtime.ts` module.
 */
export const METRIC_REALTIME_CHANNEL_FAILURE = 'helm.realtime.channel_failure';

interface RecordRealtimeChannelFailureInput {
  feature: string;
  /** The realtime channel status string (CHANNEL_ERROR | TIMED_OUT), lower-
   *  cased onto the `result` dimension. */
  result: string;
  environment?: string;
  runtime?: string;
}

/** Emits ONLY helm.realtime.channel_failure — call only from `realtime.ts`'s
 *  CHANNEL_ERROR/TIMED_OUT branch. */
export function recordRealtimeChannelFailure(input: RecordRealtimeChannelFailureInput): void {
  safeCount(METRIC_REALTIME_CHANNEL_FAILURE, 1, {
    feature: input.feature,
    operation: 'subscribe',
    result: input.result,
    environment: input.environment,
    runtime: input.runtime,
  });
}

/**
 * Phase 2 Track B addition (Edge Function observability, brief §13/§36-39) —
 * ADDITIVE constant + one record function, same discipline as the Storage
 * and Realtime additions above. This is the third and last metrics.ts
 * addition this track makes.
 */
export const METRIC_EDGE_FUNCTION_FAILURE = 'helm.edge_function.failure';

interface RecordEdgeFunctionFailureInput {
  feature: string;
  action: string;
  errorCode?: string;
  environment?: string;
  runtime?: string;
}

/** Emits ONLY helm.edge_function.failure — call only from
 *  `observe-edge.ts`'s error branch. */
export function recordEdgeFunctionFailure(input: RecordEdgeFunctionFailureInput): void {
  safeCount(METRIC_EDGE_FUNCTION_FAILURE, 1, {
    feature: input.feature,
    action: input.action,
    operation: 'invoke',
    environment: input.environment,
    runtime: input.runtime,
    error_code: input.errorCode,
  });
}

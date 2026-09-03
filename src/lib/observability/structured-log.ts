/**
 * `helmLog.{debug,info,warn,error}(event, fields)` — the normalized entry
 * point onto `Sentry.logger`.
 *
 * WHY A WRAPPER AROUND Sentry.logger
 * ------------------------------------
 * Calling `Sentry.logger.info('...', {...})` directly at 40 call sites means
 * 40 different ideas of what a "field" is: one spells the sport dimension
 * `sport`, the next `app`, the next omits it. `helmLog` normalizes the
 * shared low-cardinality fields (`sport`, `feature`, `action`, `result`,
 * `error_code`, `retry`, `runtime` — the SAME vocabulary `spans.ts` and
 * `metrics.ts` use) and treats everything else as caller-supplied context
 * that MUST be sanitized before it leaves the process, because nothing else
 * in the SDK's logging path does that for you.
 *
 * WHAT "SANITIZED" MEANS HERE
 * ------------------------------
 *   1. Secret-shaped KEYS are dropped, at any nesting depth. A field named
 *      `token`, `authorization`, `apiKey`, or `user.sessionCookie` is
 *      removed — not masked, removed — and a single `helm.log.redacted_field`
 *      counter (metrics.ts) is bumped so a caller who keeps doing this shows
 *      up in a dashboard rather than staying invisible forever. This is
 *      deliberately over-inclusive: matching on KEY NAME SUBSTRING (not
 *      exact equality) means a field like `sortKey` or `keyword` is also
 *      dropped. That is an accepted false positive, not a bug — losing an
 *      occasional harmless field is a better failure mode than leaking a
 *      token because someone named a field `refreshTokenValue`.
 *   2. Remaining STRING values go through `maskEmails` (redact-pii.ts) —
 *      the same email masking every Sentry event already gets.
 *   3. Remaining OBJECT/ARRAY values are NEVER sent as objects. They are
 *      `JSON.stringify`'d (after the secret-key strip above, so a nested
 *      secret never reaches the stringifier), capped at ~2KB, then also
 *      passed through `maskEmails`.
 *   4. `null`/`undefined` fields are dropped rather than sent as literal
 *      "null"/"undefined" strings.
 *
 * TRACE CORRELATION
 * -------------------
 * Nothing in this file attaches a trace id — the SDK does that itself, at
 * serialization time, for any `Sentry.logger.*` call made while a span is
 * active (see `_INTERNAL_captureLog` in `@sentry/core`). `helmLog` does not
 * need to do anything special to get it; it only needs to not swallow the
 * ambient span, which a synchronous, non-context-switching function like
 * this one never does. See `correlation.test.ts` for why that claim is
 * verified against a REAL span rather than the mocked SDK this file's own
 * tests use.
 *
 * NEVER THROWS. A logging call must never be the reason a workflow fails.
 */
import * as Sentry from '@sentry/nextjs';
import { maskEmails } from './redact-pii';
import { recordLogRedactedField } from './metrics';

export type HelmLogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Field names refused at ANY nesting depth, matched case-insensitively as a substring. */
const SECRET_KEY_RE = /token|secret|password|authorization|cookie|key|jwt|apikey/i;

function isSecretKey(key: string): boolean {
  return SECRET_KEY_RE.test(key);
}

/** Bounds the walk so a pathological/cyclic payload cannot hang a log call. */
const MAX_FIELD_DEPTH = 6;
/** ~2KB cap on a stringified object/array field, applied after secret-key stripping. */
const MAX_JSON_FIELD_CHARS = 2000;

/**
 * Recursively strips any key matching `SECRET_KEY_RE` from `value`, at every
 * nesting level, and reports each one it drops via `onRedacted`. Cycle-safe
 * (a self-referential object stops the walk rather than hanging) and
 * depth-bounded. Never throws: a hostile getter on one property is treated
 * as an unsafe value for that key and dropped, exactly like a secret-named
 * key would be — this is a redaction pass, and "I couldn't read it safely"
 * is itself a reason to redact.
 */
function dropSecretKeysDeep(
  value: unknown,
  onRedacted: (key: string) => void,
  depth = 0,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (depth > MAX_FIELD_DEPTH) return value;
  if (value === null || typeof value !== 'object') return value;
  const obj = value as object;
  if (seen.has(obj)) return undefined; // cyclic — drop rather than loop
  seen.add(obj);

  if (Array.isArray(value)) {
    return value.map((item) => dropSecretKeysDeep(item, onRedacted, depth + 1, seen));
  }

  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (isSecretKey(key)) {
      onRedacted(key);
      continue;
    }
    try {
      out[key] = dropSecretKeysDeep((value as Record<string, unknown>)[key], onRedacted, depth + 1, seen);
    } catch {
      onRedacted(key);
    }
  }
  return out;
}

/**
 * Converts one already secret-stripped extra-field value into whatever is
 * actually safe to hand to `Sentry.logger.*` as an attribute value:
 * primitives pass through (numbers/booleans as-is, strings through
 * `maskEmails`), objects/arrays become a capped, masked JSON string, and
 * null/undefined become "omit this field" (signalled by returning
 * `undefined`). Never throws.
 */
function toSafeAttributeValue(value: unknown): string | number | boolean | undefined {
  try {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value === 'string') return maskEmails(value);
    const json = JSON.stringify(value) ?? '';
    return maskEmails(json.slice(0, MAX_JSON_FIELD_CHARS));
  } catch {
    return '[unserializable]';
  }
}

export interface HelmLogFields {
  sport?: string;
  feature?: string;
  action?: string;
  result?: string;
  error_code?: string;
  retry?: number;
  runtime?: string;
  /** Anything else — sanitized per the rules documented at the top of this file. */
  [extra: string]: unknown;
}

const NORMALIZED_KEYS = new Set(['sport', 'feature', 'action', 'result', 'error_code', 'retry', 'runtime']);

function buildAttributes(event: string, fields: HelmLogFields): Record<string, unknown> {
  const attributes: Record<string, unknown> = { event };
  for (const key of NORMALIZED_KEYS) {
    const value = (fields as Record<string, unknown>)[key];
    if (value !== undefined && value !== null) attributes[key] = value;
  }

  const extra: Record<string, unknown> = {};
  for (const key of Object.keys(fields)) {
    if (NORMALIZED_KEYS.has(key)) continue;
    extra[key] = (fields as Record<string, unknown>)[key];
  }

  let redactedCount = 0;
  const stripped = dropSecretKeysDeep(extra, () => {
    redactedCount += 1;
  }) as Record<string, unknown>;

  for (const [key, value] of Object.entries(stripped)) {
    const safe = toSafeAttributeValue(value);
    if (safe !== undefined) attributes[key] = safe;
  }

  if (redactedCount > 0) {
    const featureDim = typeof fields.feature === 'string' ? fields.feature : undefined;
    for (let i = 0; i < redactedCount; i++) {
      recordLogRedactedField({ feature: featureDim });
    }
  }

  return attributes;
}

function emit(level: HelmLogLevel, event: string, fields: HelmLogFields): void {
  try {
    const safeEvent = typeof event === 'string' && event.length > 0 ? event : 'helm.log.invalid_event';
    const attributes = buildAttributes(safeEvent, fields ?? {});
    Sentry.logger[level](safeEvent, attributes);
  } catch {
    // A logging call must never be the reason a workflow fails.
  }
}

export const helmLog = {
  debug: (event: string, fields: HelmLogFields = {}) => emit('debug', event, fields),
  info: (event: string, fields: HelmLogFields = {}) => emit('info', event, fields),
  warn: (event: string, fields: HelmLogFields = {}) => emit('warn', event, fields),
  error: (event: string, fields: HelmLogFields = {}) => emit('error', event, fields),
};

// ---------------------------------------------------------------------------
// beforeSendLog — the second, independent line of defence
// ---------------------------------------------------------------------------

/**
 * Applies the SAME secret-key-strip + email-mask + object-cap rules
 * `helmLog` applies, to an arbitrary attributes bag. Exists so a call site
 * that reaches `Sentry.logger.*` directly — bypassing `helmLog` — still gets
 * sanitized, via the `beforeSendLog` hook wired in both instrumentation
 * entrypoints. Never throws; degrades to `{}` on internal failure.
 */
export function sanitizeLogAttributes(attributes: Record<string, unknown> | undefined | null): Record<string, unknown> {
  try {
    if (!attributes || typeof attributes !== 'object') return {};
    let redactedCount = 0;
    const stripped = dropSecretKeysDeep(attributes, () => {
      redactedCount += 1;
    }) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(stripped)) {
      const safe = toSafeAttributeValue(value);
      if (safe !== undefined) out[key] = safe;
    }
    if (redactedCount > 0) {
      for (let i = 0; i < redactedCount; i++) recordLogRedactedField();
    }
    return out;
  } catch {
    return {};
  }
}

/** The minimal shape `beforeSendLog` is called with — see @sentry/core's `Log`. */
interface SentryLogLike {
  level: string;
  message: unknown;
  attributes?: Record<string, unknown>;
  severityNumber?: number;
}

/**
 * The body of both instrumentation entrypoints' `beforeSendLog` hook.
 * Rebuilds the log from its NAMED fields (never `{ ...log, attributes }`) for
 * the same reason `enforceMetricAttributeAllowlist` does in metrics.ts: a
 * spread would re-evaluate a hostile `attributes` getter a second time,
 * outside the try/catch that just absorbed its first throw. Fails CLOSED —
 * an internal sanitization error yields `attributes: {}`, never the
 * unsanitized originals.
 */
export function enforceLogAttributeAllowlist<T extends SentryLogLike>(log: T): T {
  let rawAttributes: Record<string, unknown> | undefined;
  try {
    // Reading the property is what can throw on a hostile getter — kept in
    // its own try so that failure cannot escape before sanitizeLogAttributes
    // ever runs.
    rawAttributes = log.attributes;
  } catch {
    rawAttributes = undefined;
  }
  return {
    level: log.level,
    message: log.message,
    attributes: sanitizeLogAttributes(rawAttributes),
    severityNumber: log.severityNumber,
  } as T;
}

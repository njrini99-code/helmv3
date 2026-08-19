/**
 * Mask email addresses anywhere in a Sentry event before it leaves the process.
 *
 * WHY THIS EXISTS
 * ---------------
 * Both `beforeSend` hooks were already named for PII, and both scrubbed only
 * the REQUEST ENVELOPE — cookies, Authorization headers, the query string.
 * Neither touched `event.message`, `event.extra`, `event.contexts`, breadcrumbs
 * or exception values.
 *
 * Those are precisely the fields this app puts emails into. Measured 2026-08-19,
 * 11 files send a raw address to Sentry, among them:
 *
 *   src/lib/auth/send-password-reset.ts   "password reset send failed for {email}"
 *   src/app/golf/actions/task-reminders.ts "Failed to send email to {email}"
 *   src/app/api/webhooks/resend/route.ts  "Failed to suppress {reason} for {email}"
 *   src/app/baseball/actions/auth.ts      metadata: { email, ip }
 *
 * The last shape is the one that matters most: an email and an IP together, on
 * a login/signup failure path, forwarded to a third-party processor. Either
 * alone is ordinary operational telemetry; the pair identifies a person and
 * where they were.
 *
 * WHY CENTRALLY, RATHER THAN AT THE CALL SITES
 * --------------------------------------------
 * Fixing 11 call sites fixes 11 call sites. The 12th gets written next week by
 * someone reasonably assuming a function called `scrubPii` scrubs PII. A
 * `beforeSend` filter is the only point every event must pass through.
 *
 * WHY MASK RATHER THAN DROP
 * -------------------------
 * `nick@example.com` -> `n***@example.com`. The domain is usually the
 * diagnostically useful half — bounce and deliverability problems cluster by
 * domain — while the local part is the identifier. Dropping the whole address
 * would make several of these messages useless and invite people to log it
 * again some other way.
 */

/** Conservative address matcher: local@label.tld, no display names, no angle brackets. */
const EMAIL_RE = /\b([A-Za-z0-9._%+-])([A-Za-z0-9._%+-]*)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g;

/** Bound the walk. A pathological payload must not turn beforeSend into a hang. */
const MAX_DEPTH = 6;
const MAX_STRING = 20_000;

export function maskEmails(input: string): string {
  if (input.length > MAX_STRING) return input;
  return input.replace(EMAIL_RE, (_m, first: string, _rest: string, domain: string) => `${first}***@${domain}`);
}

/**
 * Recursively mask strings in place. Returns the same reference for objects so
 * callers can hand it a Sentry event directly.
 *
 * Cycle-safe: Sentry events are normally acyclic, but `extra` carries
 * caller-supplied objects and one of those being self-referential must not
 * hang the reporter.
 */
export function redactPiiDeep<T>(value: T, depth = 0, seen = new WeakSet<object>()): T {
  if (depth > MAX_DEPTH) return value;

  if (typeof value === 'string') return maskEmails(value) as unknown as T;
  if (value === null || typeof value !== 'object') return value;

  const obj = value as unknown as object;
  if (seen.has(obj)) return value;
  seen.add(obj);

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      (value as unknown[])[i] = redactPiiDeep((value as unknown[])[i], depth + 1, seen);
    }
    return value;
  }

  const rec = value as Record<string, unknown>;
  for (const k of Object.keys(rec)) {
    rec[k] = redactPiiDeep(rec[k], depth + 1, seen);
  }
  return value;
}

/**
 * The fields an event can carry free text in. Deliberately explicit rather than
 * walking the whole event: `event.sdk`, `event.modules` and friends are large,
 * fixed, and contain no user data, so walking them is pure cost.
 */
export function redactEventPii<
  T extends {
    message?: unknown;
    extra?: unknown;
    contexts?: unknown;
    tags?: unknown;
    breadcrumbs?: unknown;
    exception?: { values?: Array<{ value?: string }> } | unknown;
    user?: unknown;
  },
>(event: T): T {
  if (typeof event.message === 'string') event.message = maskEmails(event.message);
  else if (event.message) event.message = redactPiiDeep(event.message);

  if (event.extra) event.extra = redactPiiDeep(event.extra);
  if (event.contexts) event.contexts = redactPiiDeep(event.contexts);
  if (event.tags) event.tags = redactPiiDeep(event.tags);
  if (event.breadcrumbs) event.breadcrumbs = redactPiiDeep(event.breadcrumbs);
  if (event.user) event.user = redactPiiDeep(event.user);

  const values = (event.exception as { values?: Array<{ value?: string }> } | undefined)?.values;
  if (Array.isArray(values)) {
    for (const v of values) {
      if (typeof v?.value === 'string') v.value = maskEmails(v.value);
    }
  }

  return event;
}

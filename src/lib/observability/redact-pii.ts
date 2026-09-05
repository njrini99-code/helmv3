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

import { redactSensitiveUrl } from '@/lib/security/redact-url';

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
    // js/remote-property-injection (#584): `rec` can be a JSON-parsed Sentry
    // event/extra payload, and JSON.parse happily creates a normal OWN
    // property literally named "__proto__" (it does NOT trigger the special
    // accessor at parse time) — but `rec[k] = ...` below WOULD trigger it for
    // k === '__proto__', reassigning this object's actual prototype instead
    // of writing a data property. Skip the three names that resolve to
    // something other than an own data property assignment.
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
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

/**
 * Collapse every address to a single fixed token.
 *
 * Distinct from `maskEmails`, and the difference is the whole point. The mask
 * keeps the first character and the domain because that is diagnostically
 * useful in a message a human reads. But it is still UNIQUE PER ADDRESS, so it
 * does nothing for anything that groups by string equality.
 *
 * Incident fingerprints group by string equality. `... failed for a***@x.edu`
 * and `... failed for b***@x.edu` are one incident and hash to two. This form
 * collapses them to one.
 *
 * Use `maskEmails` for anything displayed; use this only for a grouping key.
 */
export function collapseEmailsForGrouping(input: string): string {
  if (input.length > MAX_STRING) return input;
  return input.replace(EMAIL_RE, '<email>');
}

/**
 * Matches a URL-shaped secret ANYWHERE inside free text — a whole `https://…`
 * URL, or a bare `?key=value` / `#key=value` fragment sent as its own field.
 * Neither `\s` nor the excluded quote/bracket characters can appear inside a
 * URL, so this is line-safe across a multi-line stack without splitting it.
 *
 * The key-name run is BOUNDED at 256 on purpose. Unbounded, `…{1,}=` backtracks
 * once per candidate start, and text like `#aaa…#aaa…` with no `=` turns that
 * into quadratic work — on input a client fully controls, reaching an
 * unauthenticated ingest route (CodeQL js/polynomial-redos). A query-string KEY
 * longer than 256 characters is not a real key, so the bound costs nothing.
 * The URL alternative stays unbounded deliberately: it is greedy with nothing
 * required after it, so it cannot backtrack, and bounding it would leave the
 * TAIL of a very long URL — the end a token usually sits at — unredacted.
 */
const EMBEDDED_URL_SECRET_RE =
  /https?:\/\/[^\s"'<>)]+|[?#][A-Za-z0-9_.[\]-]{1,256}=[^\s"'<>)]*/gi;

/**
 * Redact free text before it is persisted to `error_logs.message` / `.stack`
 * or `admin_events.message` / `.title` / `.stack_trace`.
 *
 * Two hazards, and a fix for each:
 *
 *   1. A URL-shaped secret embedded mid-string. Cutting at the first `?`/`#`
 *      alone is not enough — a live PATH-segment credential
 *      (`/api/calendar/coach/<bearer>`, per redact-url.ts) has neither, so
 *      each match goes through `redactSensitiveUrl` FIRST and only then loses
 *      its query/fragment (which covers key names redactSensitiveUrl's
 *      allowlist misses, `token_hash` being the one that started this).
 *   2. Email addresses, masked the same way `context` already is.
 *
 * ORDER IS LOAD-BEARING: the slice to `maxLength` happens BEFORE `maskEmails`,
 * because `maskEmails` silently no-ops above MAX_STRING (20k) and a client
 * fully controls stack length. Masking first would let a fat payload skip
 * masking entirely.
 *
 * FAIL-OPEN, but never to the raw value. A cheap fallback (cut at the first
 * `?`) can only protect against one of the two hazards, and a failure could be
 * in either half — so the fallback is a fixed placeholder. The row is still
 * written; only the content is withheld.
 *
 * Why this lives here rather than beside either caller: both the client ingest
 * route and the server logger write to the SAME two columns, and both are read
 * back by the RCA action and forwarded to a third-party model. Two copies of a
 * redaction rule is one copy that eventually stops matching the other, and the
 * half that drifts fails silently and invisibly.
 */
export function redactFreeTextForStorage(
  value: string,
  maxLength: number,
  onError?: (error: unknown) => void,
): string {
  try {
    // Truncate FIRST, so nothing downstream ever scans more than the caller
    // agreed to store. The old order ran the scan across the whole payload —
    // a megabyte of attacker-chosen text on an unauthenticated route — and
    // only then cut it to a couple of kilobytes. Bounding the input is the
    // structural half of the ReDoS fix; the bounded key-name quantifier above
    // is the other half. It also keeps `maskEmails` under its own 20k no-op
    // guard, which is why the slice had to precede it either way.
    const bounded = value.slice(0, maxLength);
    const stripped = bounded.replace(EMBEDDED_URL_SECRET_RE, (match) =>
      (redactSensitiveUrl(match) ?? match).replace(/[?#].*$/, ''),
    );
    return maskEmails(stripped);
  } catch (error) {
    try {
      onError?.(error);
    } catch {
      // Reporting the redaction failure must never become a second failure.
    }
    return `[redaction failed - ${value.length} chars withheld]`;
  }
}

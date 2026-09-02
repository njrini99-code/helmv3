/**
 * Serialize any thrown value into a human-readable string suitable for
 * logs and admin telemetry.
 *
 * Why this exists: `String(someError)` on a plain object returns the
 * useless `"[object Object]"`. The common pattern across the codebase
 * was `error instanceof Error ? error.message : String(error)`, which
 * produced `[object Object]` in 20+ telemetry incidents because Supabase
 * `PostgrestError` and similar plain objects do NOT extend Error.
 *
 * Order of precedence:
 *   1. Error instance → `.message`
 *   2. Supabase/Postgres-shaped object → compact `code=X msg=Y details=Z hint=W`
 *   3. Plain object → `JSON.stringify` (with a circular-safe fallback)
 *   4. Anything else → `String(x)`
 */
/**
 * A gateway that fails before reaching the origin answers with an HTML PAGE, not
 * JSON — and the whole page lands in `error.message`.
 *
 * Found 2026-07-29 in the Vercel runtime errors. Two cron routes each threw a
 * multi-kilobyte Cloudflare 522 document as their error text:
 *
 *   Error: run_integrity_checks failed: <!DOCTYPE html> … <title>supabase.co |
 *   522: Connection timed out</title> … Cloudflare Ray ID: a22a42d3dbe0d4c1 …
 *   Your IP: 35.175.113.239 … 2026-07-29 07:03:17 UTC …
 *
 * Two separate harms, and the second is the expensive one:
 *
 *   1. The useful fact — "Supabase was unreachable" — is buried in ~6KB of
 *      Cloudflare markup, so triage reads as noise.
 *   2. That markup carries a UNIQUE Ray ID, a unique client IP and a
 *      to-the-second timestamp per occurrence. `admin_events` fingerprints hash
 *      the message, so every single 522 mints a NEW incident group. A one-hour
 *      outage becomes dozens of unrelated-looking one-off incidents instead of
 *      one row with a count — which is precisely how the 9.4-hour database wedge
 *      on 2026-07-29 stayed invisible as a single event.
 *
 * So this collapses any HTML error body to one STABLE line. Stability is the
 * requirement, not brevity: the output must be byte-identical across
 * occurrences of the same upstream failure, which means no Ray ID, no IP and no
 * timestamp may survive.
 */
export function collapseHtmlErrorBody(text: string): string | null {
  const head = text.slice(0, 2000);
  const looksLikeHtml = /^\s*<(?:!doctype\s+html|html[\s>])/i.test(text) || /<html[\s>]/i.test(head);
  if (!looksLikeHtml) return null;

  // `<title>` carries the whole story on every gateway error page worth naming:
  // "supabase.co | 522: Connection timed out", "502 Bad Gateway", "Attention
  // Required! | Cloudflare".
  const title = /<title[^>]*>([\s\S]{0,200}?)<\/title>/i.exec(text)?.[1]?.replace(/\s+/g, ' ').trim();

  // Status code from the title, or from Cloudflare's own error-code label.
  const status =
    /\b(4\d{2}|5\d{2})\b/.exec(title ?? '')?.[1] ??
    /Error code\s*(\d{3})/i.exec(head)?.[1] ??
    null;

  const detail = title && title.length > 0 ? title : 'no <title>';
  return status
    ? `upstream returned an HTML error page (HTTP ${status}): ${detail}`
    : `upstream returned an HTML error page: ${detail}`;
}

/**
 * Same collapse, but for a message that has HTML embedded PART WAY THROUGH —
 * the shape produced by every `logServerError(`prefix: ${error.message}`)` call
 * site when the upstream returns a gateway error page.
 *
 * `collapseHtmlErrorBody` replaces the whole string, which would throw away the
 * `[cron.refresh-engagement] RPC failed:` prefix that says WHICH call failed.
 * This keeps the prefix and collapses only from the start of the HTML document
 * to the end.
 *
 * Returns null when there is no embedded HTML, so callers can pass the original
 * through untouched.
 */
export function collapseEmbeddedHtml(message: string): string | null {
  const start = /<!doctype\s+html|<html[\s>]/i.exec(message);
  if (!start || start.index === undefined) return null;

  const prefix = message.slice(0, start.index).trimEnd();
  const collapsed = collapseHtmlErrorBody(message.slice(start.index));
  if (!collapsed) return null;

  return prefix.length > 0 ? `${prefix} ${collapsed}` : collapsed;
}

/**
 * A malformed/truncated 2xx response body puts the RAW, unparsed response
 * text into `error.message` — postgrest-js's own fallback when
 * `JSON.parse(body)` throws on an otherwise-successful request
 * (`PostgrestBuilder.ts`: on a 2xx status, `catch { error = { message: body
 * } } `). For a query that returns rows — the common shape — that raw body
 * IS the near-complete result set: a JSON array of row objects.
 *
 * Found 2026-08-03: `getInsightsForCoach failed: [{"id":"0138a7f6-…` put an
 * entire coach's insight feed — a player's putting percentages, coaching
 * evidence, drill content — into `error_logs.message`, because the response
 * simply failed to finish streaming. The request substantively SUCCEEDED;
 * only the last byte or so was lost in transit. None of that row content is
 * what an operator needs to triage a transport hiccup, and — same harm as the
 * HTML gateway page above — every occurrence carries different row content,
 * so each one mints its own incident group instead of collapsing into one.
 *
 * Detects the shape (a JSON array/object opener that runs on far longer than
 * any genuine error message ever does — Postgrest/JS error text is a short
 * English sentence, never a multi-hundred-byte run of `{"key":value,…}`) and
 * collapses it to ONE fixed summary line, deliberately dropping the byte
 * count along with the row content: two occurrences of the same underlying
 * truncation never fetch the same number of rows, so a length-bearing summary
 * would still fragment into a new incident group per occurrence — exactly the
 * failure mode this exists to fix. Stability is the requirement, same as the
 * HTML case above; the size is not worth keeping if keeping it defeats the
 * point.
 */
const RAW_JSON_DUMP_OPENER = /(\[\s*\{"|\{\s*"[^"]{1,64}"\s*:)/;
const RAW_JSON_DUMP_MIN_LENGTH = 300;
const RAW_JSON_DUMP_SUMMARY =
  'upstream response body could not be parsed as JSON — looks like a truncated row dump, not an error message';

export function collapseRawJsonDumpBody(text: string): string | null {
  if (text.length < RAW_JSON_DUMP_MIN_LENGTH) return null;
  if (!RAW_JSON_DUMP_OPENER.test(text)) return null;
  return RAW_JSON_DUMP_SUMMARY;
}

/**
 * Same collapse, but for a message with the raw JSON dump embedded PART WAY
 * THROUGH — the shape every `logServerError(`prefix: ${error.message}`)` call
 * site produces when postgrest-js hits this fallback. Keeps the prefix (which
 * says WHICH call failed) and collapses only the dump.
 */
export function collapseEmbeddedRawJsonDump(message: string): string | null {
  const start = RAW_JSON_DUMP_OPENER.exec(message);
  if (!start || start.index === undefined) return null;

  const prefix = message.slice(0, start.index).trimEnd();
  const collapsed = collapseRawJsonDumpBody(message.slice(start.index));
  if (!collapsed) return null;

  return prefix.length > 0 ? `${prefix} ${collapsed}` : collapsed;
}

export function describeError(err: unknown): string {
  if (err == null) return 'unknown';
  if (err instanceof Error) return collapseHtmlErrorBody(err.message) ?? collapseRawJsonDumpBody(err.message) ?? err.message;
  if (typeof err === 'string') return collapseHtmlErrorBody(err) ?? collapseRawJsonDumpBody(err) ?? err;
  if (typeof err !== 'object') return String(err);

  const e = err as Record<string, unknown>;

  // Same collapse for the Supabase/transport shape, where the HTML — or a raw
  // unparsed response body, see collapseRawJsonDumpBody below — arrives as
  // `.message` on a plain object rather than on an Error.
  if (typeof e.message === 'string') {
    const collapsed = collapseHtmlErrorBody(e.message) ?? collapseRawJsonDumpBody(e.message);
    if (collapsed) {
      return e.code ? `code=${e.code} msg=${collapsed}` : collapsed;
    }
  }

  // Supabase / node-postgres shape — these are the plain objects that were
  // producing `[object Object]` in telemetry. We collapse them into a single
  // line so grep-by-code still works in admin dashboards.
  const parts = [
    e.code ? `code=${e.code}` : null,
    e.message ? `msg=${e.message}` : null,
    e.details ? `details=${e.details}` : null,
    e.hint ? `hint=${e.hint}` : null,
  ].filter(Boolean);
  if (parts.length > 0) return parts.join(' ');

  // Fallback: JSON.stringify — but NEVER `String(err)`, which is the exact
  // `[object Object]` this whole module exists to eliminate. The previous
  // version's circular-reference catch did precisely that, so the safety net
  // had the original bug inside it.
  //
  // Found 2026-07-29 in production: `[recurring_events.editRecurringEvent]
  // [editRecurringEvent Error]: [object Object]` — logged from a call site
  // that DOES use describeError, twice, while a coach failed to edit a
  // recurring event. Two occurrences, zero information about why.
  //
  // Three reachable ways to get here, all verified in node:
  //   - circular reference        JSON.stringify throws  -> was "[object Object]"
  //   - BigInt anywhere inside    JSON.stringify throws  -> was "[object Object]"
  //   - a function/symbol value   JSON.stringify RETURNS undefined -> was "undefined"
  // The last one never even reached the catch, so a try/catch alone would not
  // have fixed it.
  try {
    const json = JSON.stringify(err);
    // `undefined` for functions/symbols; `{}` for an object whose own
    // properties are all non-serializable. Neither tells you anything, so fall
    // through to the shape description instead.
    if (json !== undefined && json !== '{}') return json;
  } catch {
    // fall through
  }

  return describeShape(e);
}

/**
 * Last resort: say what the value IS when its contents cannot be serialized.
 *
 * A constructor name plus the list of own keys is not the error text, but it is
 * enough to recognise the shape and find the throw site — which is infinitely
 * more than `[object Object]`, and is the difference between a one-line grep
 * and an unreproducible ticket.
 */
function describeShape(e: Record<string, unknown>): string {
  const name =
    typeof e.constructor === 'function' && e.constructor.name && e.constructor.name !== 'Object'
      ? e.constructor.name
      : 'object';

  let keys: string[] = [];
  try {
    keys = Object.keys(e);
  } catch {
    // Exotic proxies can throw on ownKeys.
  }

  // A `message`-like field is worth surfacing even when the whole value would
  // not serialize — it is the one field most likely to name the cause.
  const message = typeof e.message === 'string' && e.message.length > 0 ? ` msg=${e.message}` : '';

  return keys.length > 0
    ? `unserializable ${name} keys=[${keys.join(',')}]${message}`
    : `unserializable ${name}${message}`;
}

/**
 * Build a structured `extra` payload for a failed write.
 *
 * `describeError` makes the incident MESSAGE readable, but the message is also
 * what incident fingerprints hash, so the useful discriminators (which Postgres
 * error code, which columns, which scope) cannot live there without minting a
 * new incident group per variant. Put them in `extra` instead: the group stays
 * stable and one click still names the cause.
 *
 * `code`/`details`/`hint` are lifted out of the Postgres-shaped error so the
 * common triage question — constraint violation vs. RLS denial vs. statement
 * timeout vs. a transport failure — is answerable without a repro. Note that
 * supabase-js also reports fetch/transport failures through this same shape
 * (with an empty `code`), so `transport: true` distinguishes those.
 */
export function describeWriteFailure(
  err: unknown,
  context: Record<string, unknown> = {},
): Record<string, unknown> {
  const e = (err && typeof err === 'object' ? err : {}) as Record<string, unknown>;
  const code = typeof e.code === 'string' && e.code.length > 0 ? e.code : null;

  return {
    ...context,
    pgCode: code,
    pgDetails: e.details ?? null,
    pgHint: e.hint ?? null,
    // supabase-js wraps a failed fetch as `{ message: 'TypeError: fetch
    // failed', code: '' }` — no Postgres code, so an empty code with a
    // message is a transport problem, not a database rejection.
    transport: !(err instanceof Error) && code === null && e.message != null,
  };
}

/**
 * The Supabase/Postgres error shape, structurally. Deliberately not imported
 * from `@supabase/supabase-js`: node-postgres, PostgREST and supabase-js all
 * produce this shape, and a structural type accepts every one of them without
 * tying this module to a client library.
 */
interface PostgrestShaped {
  message?: unknown;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Turn a Supabase/Postgres-shaped error into a real `Error` that carries its
 * Postgres code where the Bridge can actually see it.
 *
 * The pattern this replaces is `new Error(err.message)`, which appears ~50
 * times in this codebase. `logError` requires an `Error`, and wrapping the
 * message is the obvious way to get one — but it throws away `code`, `details`
 * and `hint`, which are precisely the fields that answer the first triage
 * question: RLS denial (42501) vs. constraint violation (23514) vs. statement
 * timeout (57014) vs. a transport failure (empty code). The Bridge then renders
 * a blank ERROR CODE next to a message that cannot distinguish them.
 *
 * The code goes on `.name` because that is the ONLY channel the client path
 * has: `/api/log-error` lifts `context.error.name` to `metadata.errorCode`,
 * which is where `incident-report.ts`'s `extractErrorCode()` reads. A context
 * field named `errorCode` is NOT read there — that route exists only on the
 * server logger. One value, one channel, no third spelling.
 *
 * `.message` is left EXACTLY as the driver produced it. `details` and `hint`
 * deliberately do not go into it: `admin_events` fingerprints hash the message,
 * and `details` routinely carries row-specific text ("Failing row contains
 * (…)"), so folding it in would mint a new incident group per occurrence — the
 * same fragmentation failure documented for Cloudflare Ray IDs above. Codes are
 * stable per failure class, so `.name` is fingerprint-safe; `details`/`hint`
 * belong in context, via `postgrestErrorContext()`.
 */
export function toPostgrestError(err: unknown): Error {
  if (err instanceof Error) return err;

  const e = (err && typeof err === 'object' ? err : {}) as PostgrestShaped;
  const error = new Error(str(e.message) ?? describeError(err));

  const code = str(e.code);
  if (code) error.name = code;

  return error;
}

/**
 * The `details`/`hint`/`code` fields as a context fragment, to spread into a
 * `logError`/`logServerError` call alongside `toPostgrestError()`.
 *
 * Named `errorCode`/`errorHint` to match what `server-error-logger.ts` writes
 * and what `incident-report.ts`'s `extractErrorCode()`/`extractErrorHint()`
 * render. (`describeWriteFailure()` above emits `pgCode`/`pgDetails`/`pgHint`
 * instead — verified 2026-08-27 that nothing in the Bridge reads those three,
 * so they are written and never displayed. Do not add a third vocabulary here.)
 *
 * `errorDetails` has no renderer yet either, but is spelled to match the two
 * that do rather than inventing another prefix.
 */
export function postgrestErrorContext(err: unknown): {
  errorCode: string | null;
  errorHint: string | null;
  errorDetails: string | null;
} {
  const e = (err && typeof err === 'object' ? err : {}) as PostgrestShaped;
  return {
    errorCode: str(e.code),
    errorHint: str(e.hint),
    errorDetails: str(e.details),
  };
}

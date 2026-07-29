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
function collapseHtmlErrorBody(text: string): string | null {
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

export function describeError(err: unknown): string {
  if (err == null) return 'unknown';
  if (err instanceof Error) return collapseHtmlErrorBody(err.message) ?? err.message;
  if (typeof err === 'string') return collapseHtmlErrorBody(err) ?? err;
  if (typeof err !== 'object') return String(err);

  const e = err as Record<string, unknown>;

  // Same collapse for the Supabase/transport shape, where the HTML arrives as
  // `.message` on a plain object rather than on an Error.
  if (typeof e.message === 'string') {
    const collapsed = collapseHtmlErrorBody(e.message);
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

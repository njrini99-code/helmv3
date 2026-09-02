/**
 * One place that decides how Helm's Supabase clients are traced.
 *
 * Every Supabase client factory in this repo routes through `withSupabaseTracing`
 * and `SUPABASE_TRACE_PROPAGATION`. Five factories, one policy: the privacy
 * decision below is made once and cannot drift between the browser client, the
 * SSR client, the service-role client, the proxy/edge client, and the
 * rate-limiter's client.
 *
 * WHAT THE TWO HALVES DO — they are NOT the same thing
 * ----------------------------------------------------
 *   withSupabaseTracing()        Sentry's Supabase integration. Wraps the
 *                                PostgREST builders and the auth client so
 *                                queries/RPCs/auth calls become `db` spans on
 *                                the Sentry trace. Purely local to this process.
 *
 *   SUPABASE_TRACE_PROPAGATION   supabase-js's own W3C trace propagation. Makes
 *                                the client attach `traceparent` to the HTTP
 *                                request so Supabase's API Gateway logs record
 *                                the SAME trace id Sentry is using.
 *
 * The first gives you spans in Sentry. The second gives you correlation into
 * Supabase's logs. Neither replaces the other.
 *
 * PRIVACY: `sendOperationData: false` IS THE WHOLE POINT
 * ------------------------------------------------------
 * Verified against @sentry/core 10.68.0
 * (build/cjs/integrations/supabase.js, the `PostgRESTFilterBuilder.prototype.then`
 * proxy). That single flag gates FOUR separate leak paths, all of which default
 * to ON via `dataCollection.databaseQueryData`:
 *
 *   attributes['db.query']      PostgREST filter values  -> withheld
 *   attributes['db.body']       mutation body payload    -> withheld
 *   breadcrumb.data.{query,body}                         -> withheld
 *   scope.setContext('supabase', {query, body}) on error -> withheld
 *
 * With it false, the span description degrades to `insert(...) from(golf_shots)`
 * and `[redacted]` in place of filter values — the shape of the operation
 * without its contents. That is exactly the trade Helm wants: a round submit
 * carries an entire player's shot-by-shot round in the mutation body.
 *
 * It is passed EXPLICITLY rather than left to default, because the default is
 * `client.getDataCollectionOptions().databaseQueryData === true` — i.e. a global
 * Sentry setting, somewhere else, could silently switch payload capture on for
 * every Supabase call in the app. Passing `false` here makes that impossible.
 *
 * The auth half was checked separately (`instrumentAuthOperation`, same file):
 * span names are built from `operation.name` alone (`auth signInWithPassword`,
 * `auth (admin) createUser`) and `argumentsList` is never read into telemetry.
 * No email, password, or token reaches a span. That is why the service-role
 * client is safe to instrument too.
 *
 * WHY THE GUARD IS NOT OPTIONAL
 * -----------------------------
 * `Sentry.instrumentSupabaseClient` derives the class to patch via
 * `supabaseClient.constructor` and then does
 * `new Proxy(SupabaseClient.prototype.from, ...)`. Hand it a plain object and
 * `constructor` resolves to `Object`, `Object.prototype.from` is `undefined`,
 * and the call throws `TypeError: Cannot create proxy with a non-object as
 * target` — after having already targeted `Object.prototype`.
 *
 * That is not hypothetical. Six middleware tests mock `@supabase/ssr` with
 * `createServerClient: vi.fn(() => ({ auth: {...}, from: vi.fn() }))`, a plain
 * object literal. Unguarded, instrumenting it would fail the tests and, in the
 * near-miss case, mutate `Object.prototype`. The prototype check below is what
 * makes "instrument every factory" safe to say.
 */
import * as Sentry from '@sentry/nextjs';

/**
 * supabase-js's W3C propagation options, for the runtimes where they can
 * actually do something.
 *
 * `respectSamplingDecision` is deliberately LEFT AT ITS DEFAULT (`true`). On
 * 2.112.3 that still sends `traceparent` on an unsampled trace — it only
 * withholds `tracestate`/`baggage` — so Supabase log correlation survives
 * sampling without us forcing full context onto unsampled requests.
 *
 * Only meaningful where an OpenTelemetry propagator is actually registered.
 * Sentry registers a global one on Node (`@sentry/node` sdk/initOtel.js) and on
 * Edge (`@sentry/vercel-edge` calls `propagation.setGlobalPropagator(new
 * SentryPropagator())`). It does NOT in the browser: `@sentry/browser` 10.68.0
 * contains no OpenTelemetry reference at all. See the browser note in
 * `src/lib/supabase/client.ts`.
 */
export const SUPABASE_TRACE_PROPAGATION = { enabled: true } as const;

/**
 * True only for something that really is a `SupabaseClient` — i.e. whose class
 * prototype owns a `from` method. Rejects plain-object test doubles, and in
 * particular rejects `Object` itself.
 */
function isInstrumentableSupabaseClient(client: unknown): boolean {
  if (!client || typeof client !== 'object') return false;
  const ctor = (client as { constructor?: unknown }).constructor;
  if (typeof ctor !== 'function') return false;
  const proto = (ctor as { prototype?: unknown }).prototype;
  if (!proto || typeof proto !== 'object') return false;
  return typeof (proto as { from?: unknown }).from === 'function';
}

/**
 * Attach Sentry's Supabase instrumentation to a freshly created client and
 * return that same client, so a factory can wrap its return value directly:
 *
 *   return withSupabaseTracing(createServerClient<Database>(...));
 *
 * Idempotent: Sentry marks the patched prototype with `__SENTRY_INSTRUMENTED__`
 * and the per-instance auth client likewise, so calling this on every
 * request-scoped client is cheap after the first.
 *
 * Never throws. Observability that can break a round submit is worse than no
 * observability.
 */
export function withSupabaseTracing<T>(client: T): T {
  try {
    if (!isInstrumentableSupabaseClient(client)) return client;
    Sentry.instrumentSupabaseClient(client, { sendOperationData: false });
  } catch {
    // Deliberately swallowed and NOT logged. This runs on every client
    // construction, i.e. on essentially every request — a failure here would
    // flood Sentry/console rather than inform anyone, and the caller still gets
    // a fully working Supabase client either way.
  }
  return client;
}

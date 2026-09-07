// Opt-in OpenTelemetry runtime for supabase-js `tracePropagation`. The IMPORT
// ITSELF is the opt-in — the module has no exports; it registers a process-wide
// trace-context extractor built on @opentelemetry/api. Without it, a client
// configured with `tracePropagation` logs a one-time warning and sends requests
// with no trace headers at all.
//
// This file is Next's instrumentation hook and is evaluated once per SERVER
// runtime — Node and Edge each get their own module graph and therefore their
// own registration, which is exactly the "once per runtime" placement supabase
// documents. Both runtimes have a Sentry OpenTelemetry propagator for it to
// read from (@sentry/node sdk/initOtel.js; @sentry/vercel-edge
// `propagation.setGlobalPropagator(new SentryPropagator())`).
//
// The BROWSER is deliberately not covered here: @sentry/browser registers no
// OpenTelemetry propagator, so there would be nothing to extract. The browser
// propagates `traceparent` through Sentry's own fetch instrumentation instead —
// see `propagateTraceparent` / `tracePropagationTargets` in
// src/instrumentation-client.ts.
import '@supabase/supabase-js/tracing';
import * as Sentry from '@sentry/nextjs';
import '@supabase/supabase-js/tracing';
import { redactEventPii } from '@/lib/observability/redact-pii';
import { getAppBaseUrl } from '@/lib/app-base-url';
import { isAlreadyBridgeLogged } from '@/lib/bridge-logged-marker';
import { resolveServerEnvironment } from '@/lib/sentry-environment';
import { enforceMetricAttributeAllowlist } from '@/lib/observability/metrics';
import { enforceLogAttributeAllowlist } from '@/lib/observability/structured-log';

const release = process.env.NEXT_PUBLIC_SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA;
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || process.env.SENTRY_DSN?.trim();
// NOT `VERCEL_ENV || NODE_ENV`: NODE_ENV is 'production' in ANY optimized
// build, so `next build && next start` on a laptop reported
// `environment: production` and agent QA worktrees landed in Sentry looking
// like live outages. Gated on `VERCEL` (set to "1" on every Vercel build and
// runtime) so a genuine production event can never be relabelled — see
// resolve-environment.ts and its matrix test.
const environment = resolveServerEnvironment(process.env);

const sharedIgnoreErrors = [
  'NEXT_NOT_FOUND',
  'NEXT_REDIRECT',
  // Supabase emits these for stale refresh-token cookies (logged-out users,
  // long-idle tabs, just-rotated tokens). Middleware already swallows them —
  // don't page the team for normal session expiry.
  'Invalid Refresh Token: Refresh Token Not Found',
  'Refresh Token Not Found',
  // Was: 'AuthApiError' — which suppressed ALL Supabase auth errors (wrong
  // password, locked accounts, expired invites — real signals the Helm
  // Bridge auth tab needs). Keep ONLY the routine refresh-token-expiry noise
  // suppressed; every other AuthApiError now reaches Sentry.
  /AuthApiError: Invalid Refresh Token/,
  // A HELD migration's RPC does not exist yet, and that is a normal, recorded
  // environment fact — not a production incident.
  //
  // src/lib/admin/agent-runs/fetch.ts ALREADY treats PGRST202 as
  // `unconfigured` and renders the not-yet-live PanelNoData state, so the
  // product behaves correctly. The event reaches Sentry anyway because the
  // Supabase integration captures the failed call at the driver, before any
  // application code gets to classify it. Result, first seen 46 minutes after
  // the 2026-09-03 deploy: an unresolved issue on GET /admin/engineering
  // re-raised by every 60s AutoRefresh poll, for a migration deliberately
  // awaiting review.
  //
  // Listed BY RPC NAME rather than as a generic "Could not find the function"
  // pattern, so this suppresses exactly the three facades whose migration
  // (20260903150000_helm_debug_agent_runs.sql) is HELD. A LIVE helm_debug RPC
  // that disappears — dropped, mis-granted, lost to a bad deploy — still
  // pages, which a broad pattern would have silenced. Delete these three lines
  // in the same change that applies that migration.
  /Could not find the function public\.helm_debug_record_agent_run/,
  /Could not find the function public\.helm_debug_list_agent_runs/,
  /Could not find the function public\.helm_debug_get_agent_run/,
  /Refresh Token Not Found/,
  // Baseball expected control-flow throws. withBaseballAction already
  // classifies these as handled/expected (admin_events + Sentry warning with
  // skipSentry) and then RE-RAISES so callers can branch — but the re-raise
  // escapes the server-action boundary, where Next's own console.error +
  // onRequestError capture it a second time as an unhandled Sentry Error
  // (observed live: a logged-out tab's 60 s NotificationBell poll produced
  // "BaseballUnauthorizedError: You must be signed in"). These stay fully
  // visible in admin_events / Helm Bridge; only the duplicate Sentry Error
  // is suppressed.
  'BaseballUnauthorizedError',
  'BaseballNoActiveTeamError',
  'BaseballCapabilityError',
  'BaseballDisabledSourceError',
  'BaseballDemoReadOnlyError',
  // Golf's equivalent. A demo night puts many prospects on one shared account
  // at once, so every "no, the demo is read-only" would otherwise arrive in
  // Sentry as an error — dozens of them, all working as designed.
  'GolfDemoReadOnlyError',
  'PlayerAccessError',
  // Lift Lab's equivalent of the Baseball five above — withLiftingAction
  // (src/lib/lifting/with-lifting-action.ts) resolves AUTH -> ORG-CONTEXT ->
  // EDIT-GATE and throws these three typed control-flow classes, logged via
  // logServerEvent(..., skipSentry: true, ...) and then re-thrown so callers
  // can branch — the exact same re-raise-escapes-to-onRequestError shape as
  // the Baseball classes above. Phase A finding #3
  // (docs/observability/SENTRY_PHASE_A_FINDINGS.md §(b)/(c)): this list was
  // never updated when Lift Lab's wrapper shipped, so every "not signed in" /
  // "no Lifting org resolved" / "no edit access" throw was a live, alertable
  // Sentry issue — the exact noise pattern already fixed for Baseball/Golf,
  // reproduced in the one wrapper nobody matched up.
  'LiftingUnauthorizedError',
  'LiftingNoOrgError',
  'LiftingForbiddenError',
];

/**
 * Best-effort per-app classification for RSC/route errors that never went
 * through a sport-aware wrapper (those already `scope.setTag('sport', ...)`).
 *
 * `cron` and `unattributed` are separate outcomes from `marketing`, and the
 * distinction is not cosmetic. Verified in production 2026-08-27: a real
 * permission-denied failure on `GET /api/cron/event-reminders` arrived in
 * Sentry tagged `sport: marketing`, because a cron path matches none of the
 * app prefixes and fell through to the default. Filtering Sentry by
 * `sport:marketing` — the marketing site — therefore returned a broken
 * BACKGROUND JOB, and filtering the other way hid it.
 *
 * A wrong label is worse than an honest "unattributed": it puts the event in
 * someone else's bucket, where it is neither looked for nor found.
 */
function deriveSportFromUrl(
  url: string | undefined,
): 'baseball' | 'golf' | 'lifting' | 'admin' | 'cron' | 'marketing' | 'unattributed' {
  if (!url) return 'unattributed';
  const path = url.split('?')[0] ?? '';
  // Crons first: a job is named for what it does, not the app it reads from,
  // and several touch more than one sport in a single invocation.
  if (/\/api\/cron(\/|$)/.test(path)) return 'cron';
  if (/\/baseball(\/|$)/.test(path)) return 'baseball';
  if (/\/golf(\/|$)/.test(path)) return 'golf';
  if (/\/lifting(\/|$)/.test(path)) return 'lifting';
  if (/\/admin(\/|$)/.test(path)) return 'admin';
  // Only a genuine site path is 'marketing'. An /api/* route that matched none
  // of the above is unattributed — saying so is honest; calling it marketing is
  // a guess that reads as a fact.
  if (/^https?:\/\/[^/]+\/?$/.test(path) || !/\/api(\/|$)/.test(path)) return 'marketing';
  return 'unattributed';
}

/**
 * Keep database spans at full rate while leaving page loads sampled.
 *
 * `tracesSampleRate: 0.2` is a sensible ceiling for page-load volume and a bad
 * one for database work: it discards four out of five Supabase spans, so the
 * slow or failing query you are hunting is usually simply absent. Sampling is
 * meant to bound cost on the high-volume, low-information spans — and page
 * loads are exactly that, while `db.*` spans are the opposite.
 *
 * DB operations are comparatively rare per request and carry the highest
 * diagnostic value, so they sample at 1.0. Everything else keeps the previous
 * behaviour unchanged, which is why this is close to free: the added volume is
 * the DB spans that were already being generated and then thrown away.
 *
 * Sampling decisions are inherited by child spans, so this reads the ROOT
 * span's attributes — a `db.*` op nested under a page-load transaction is
 * governed by that transaction's decision, not this one. Naming the op
 * explicitly here is what makes a Supabase call made from a server action
 * (its own root) reliably kept.
 */
function makeTracesSampler(isDev: boolean): Sentry.NodeOptions['tracesSampler'] {
  const base = isDev ? 0.1 : 0.2;
  return (samplingContext) => {
    // Respect an upstream sampling decision so a distributed trace stays whole
    // rather than being half-recorded.
    if (typeof samplingContext.parentSampled === 'boolean') {
      return samplingContext.parentSampled;
    }
    const attributes = samplingContext.attributes ?? {};
    const op = String(attributes['sentry.op'] ?? samplingContext.name ?? '');
    if (op.startsWith('db.') || op.startsWith('db ')) return 1.0;
    return base;
  };
}

/**
 * Postgres error codes as the grouping key.
 *
 * PostgREST surfaces failures as VALUES carrying a `code` (`42501` RLS denial,
 * `23505` unique violation, `PGRST116` no-rows-for-single), and the human
 * message around that code embeds table names, column names and constraint
 * names. Grouping on the message therefore scatters one bad policy across many
 * Sentry issues — the same splitting already documented for
 * `normalizeIncidentMessagePrefix`, and visible in production right now, where
 * one Inngest key mismatch occupies four fingerprints because the message
 * carries "signature was 1s old" vs "2s".
 *
 * Fingerprinting on the code makes the class countable: "42501 is up 40x this
 * hour" is actionable, where forty separately-named issues are not.
 *
 * Only applied when a code is actually present, so nothing else regroups.
 */
function fingerprintByPostgresCode(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  if (event.fingerprint) return event; // never override a deliberate one
  const candidates = [
    (event.contexts?.postgres as { code?: unknown } | undefined)?.code,
    (event.extra as Record<string, unknown> | undefined)?.code,
    (event.extra as Record<string, unknown> | undefined)?.errorCode,
    event.tags?.pg_code,
  ];
  const code = candidates.find(
    (c): c is string => typeof c === 'string' && /^(PGRST\d{3}|[0-9A-Z]{5})$/.test(c),
  );
  if (!code) return event;
  return {
    ...event,
    tags: { ...event.tags, pg_code: code },
    // `{{ default }}` keeps Sentry's own grouping as a secondary axis, so two
    // genuinely different 42501s do not collapse into one issue.
    fingerprint: ['{{ default }}', `pg:${code}`],
  };
}

/**
 * Supabase auth-key rejection as a grouping key.
 *
 * On 2026-09-06 21:27-21:43 UTC the owner disabled Supabase legacy API keys
 * while Vercel still held a legacy key, and production threw "Legacy API
 * keys are disabled" (and the sibling "Invalid API key") from at least four
 * unrelated call paths — POST /golf/login, recordDeployMarker, the presence
 * heartbeat RPC, and a bridge_write_failed follow-on — each with its own
 * message wrapper, so Sentry split one root cause into four-plus separate
 * issues. The presence heartbeat wraps its message as `msg=...` rather than
 * surfacing the Supabase text directly, so this checks the full exception
 * value / event message text rather than requiring an exact match.
 *
 * Same shape as fingerprintByPostgresCode: only applies when no deliberate
 * fingerprint already exists, keeps `{{ default }}` as a secondary axis, and
 * tags the event so the two failure modes stay distinguishable in counts.
 * The permanent fix (rotating Vercel's key) is the owner's; this only keeps
 * every occurrence of the same root cause in one issue while it's live.
 */
function fingerprintSupabaseKeyError(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  if (event.fingerprint) return event; // never override a deliberate one
  const haystacks: string[] = [];
  for (const value of event.exception?.values ?? []) {
    if (typeof value.value === 'string') haystacks.push(value.value);
  }
  if (typeof event.message === 'string') haystacks.push(event.message);
  const text = haystacks.join(' ');
  if (!text) return event;

  if (/legacy api keys are disabled/i.test(text)) {
    return {
      ...event,
      tags: { ...event.tags, supabase_key_error: 'legacy_disabled' },
      fingerprint: ['{{ default }}', 'supabase:legacy-keys-disabled'],
    };
  }
  if (/invalid api key/i.test(text)) {
    return {
      ...event,
      tags: { ...event.tags, supabase_key_error: 'invalid' },
      fingerprint: ['{{ default }}', 'supabase:invalid-api-key'],
    };
  }
  return event;
}

const scrubPii: Sentry.NodeOptions['beforeSend'] = (event) => {
  if (event.request) {
    delete event.request.cookies;
    if (event.request.headers) {
      delete event.request.headers['Cookie'];
      delete event.request.headers['cookie'];
      delete event.request.headers['Authorization'];
      delete event.request.headers['authorization'];
      // Defensive: `event.request` is documented as the INBOUND request, so
      // a well-formed event should never carry a response header here — but
      // nothing in the SDK's types guarantees an integration or a future
      // change can't attach one, and the cost of scrubbing a header that
      // never appears is zero. Added alongside the beforeSendMetric/
      // beforeSendLog wiring below because the privacy-sentinel suite this
      // phase adds explicitly checks for it.
      delete event.request.headers['Set-Cookie'];
      delete event.request.headers['set-cookie'];
    }
    if (event.request.url) {
      event.request.url = event.request.url.split('?')[0];
    }
  }
  // Helm Bridge: tag every event with a sport so RSC/render errors (which
  // never pass through logServerError's scope.setTag('sport', ...)) stay
  // filterable per app in Sentry. Additive only — never overrides a tag a
  // sport-aware wrapper already set.
  if (!event.tags?.sport) {
    event.tags = { ...event.tags, sport: deriveSportFromUrl(event.request?.url) };
  }

  // Mask email addresses in the free-text fields.
  //
  // Everything above this line scrubs the request ENVELOPE — cookies, auth
  // headers, the query string. Nothing scrubbed `message`, `extra`, `contexts`
  // or exception values, which is where this app actually puts addresses: 11
  // files send a raw email to Sentry, and the auth paths send an email and an
  // IP together (baseball/actions/auth.ts:320, :471). Either alone is ordinary
  // telemetry; the pair identifies a person and where they were.
  //
  // Applied last, so it also covers anything the tagging above introduced.
  // Postgres-code and Supabase-key-error fingerprinting both run on the
  // redacted event, so grouping never depends on a value that was about to
  // be scrubbed. Supabase-key runs first: it bails immediately when the text
  // doesn't match, and fingerprintByPostgresCode's own "never override a
  // deliberate fingerprint" guard means whichever rule matches first wins —
  // the two are not expected to co-occur on the same event.
  return fingerprintByPostgresCode(fingerprintSupabaseKeyError(redactEventPii(event)));
};

export async function register() {
  const isDev = process.env.NODE_ENV === 'development';

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    let profilingIntegration: ReturnType<typeof import('@sentry/profiling-node').nodeProfilingIntegration> | undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { nodeProfilingIntegration } = require('@sentry/profiling-node');
      profilingIntegration = nodeProfilingIntegration();
    } catch {
      // Profiling native module not available — skip
    }

    Sentry.init({
      dsn,
      release,
      environment,
      debug: false,
      // Supabase JS uses the W3C traceparent header when its tracing runtime
      // is loaded. Sentry must emit that header instead of only sentry-trace.
      propagateTraceparent: true,

      integrations: [
        ...(!isDev && profilingIntegration ? [profilingIntegration] : []),
        // Auto-instruments Vercel AI SDK calls (generateText/streamText/
        // generateObject). Captures model, latency, errors, and — when the
        // call sets experimental_telemetry.isEnabled:true — token usage and
        // (subject to these two flags) prompt/output bodies. CoachHelm chat,
        // round-recap composition, and the class-schedule vision importer
        // all go through the AI SDK.
        //
        // recordInputs/recordOutputs:false — Phase A finding
        // (docs/observability/SENTRY_PHASE_A_FINDINGS.md §(a)): this
        // integration was fully configured with BOTH flags `true` while
        // being structurally inert (no call site set
        // `experimental_telemetry.isEnabled`), one line away from recording
        // prompt/output bodies at every call site simultaneously the moment
        // any of them opted in. Phase C's five production call sites (chat
        // stream, schedule-vision's two vision calls, RCA, compose()) all
        // now opt in individually with recordInputs/recordOutputs:false of
        // their own — this is the matching SAFE DEFAULT for the global
        // integration, so a future call site that opts into telemetry
        // without also setting these two explicitly inherits "do not
        // record" rather than "record everything", which is what let a
        // schedule screenshot's raw image bytes and a coach chat prompt
        // carrying a player's first name both sit one flag away from
        // Sentry.
        Sentry.vercelAIIntegration({
          recordInputs: false,
          recordOutputs: false,
        }),
        // Forward server console.log/warn/error to Sentry → Explore → Logs
        // (separate stream from issues). Catches anything we log via console
        // that doesn't go through logServerError.
        Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
        // Capture console.error/.warn AS issues too (high-signal, errors only).
        Sentry.captureConsoleIntegration({ levels: ['error'] }),
      ],

      // Enable Sentry SDK structured logs (separate from error events).
      enableLogs: true,

      // Sentry Metrics (Sentry.metrics.count/gauge/distribution — Phase C's
      // helm.workflow.*/helm.ai.*/helm.job.* catalogue, metrics.ts). Set
      // explicitly rather than relying on the installed SDK's own default:
      // read live from node_modules/@sentry/core/build/cjs/metrics/internal.js
      // (`metricsEnabled = enableMetrics ?? _experiments?.enableMetrics ??
      // true`) and confirmed by an actual captured envelope, metrics already
      // send with this option absent — contradicting
      // docs/observability/SENTRY_SDK_API_VERIFICATION.md's claim that they
      // "would currently be dropped" unset. Kept explicit anyway so the
      // intent survives a future SDK default change, same reasoning as
      // `sourcemaps.deleteSourcemapsAfterUpload` in sentry-build-options.mjs.
      enableMetrics: true,

      // Page loads stay sampled; db.* spans are kept at 1.0 — see makeTracesSampler.
      tracesSampler: makeTracesSampler(isDev),
      profileSessionSampleRate: isDev ? 0 : 0.3,
      profileLifecycle: 'trace',

      beforeSend: scrubPii,
      // Second, independent line of defence beyond metrics.ts's/
      // structured-log.ts's own sanitization at the call site: catches any
      // Sentry.metrics.*/Sentry.logger.* call anywhere in the codebase that
      // does not route through record*()/helmLog. See
      // enforceMetricAttributeAllowlist / enforceLogAttributeAllowlist for
      // why each fails CLOSED (strips attributes) on an internal error,
      // unlike the fail-OPEN convention everywhere else in this file.
      beforeSendMetric: enforceMetricAttributeAllowlist,
      beforeSendLog: enforceLogAttributeAllowlist,
      ignoreErrors: sharedIgnoreErrors,
    });

    console.log('[Sentry] Node runtime initialized', {
      release: release ?? 'none',
      hasDsn: Boolean(dsn),
    });

    // Helm Bridge: record a deploy marker once per production sha (idempotent).
    import('@/lib/admin/deploy-marker')
      .then((m) => m.recordDeployMarker())
      .catch(() => {});

    // Helm Bridge: an absent or malformed Inngest credential in production is
    // a fault, not a config state — every durable job silently turns off. The
    // SDK's own "no signing key found" console.error fires here at start-up
    // (3 of the 4 Sentry events on 2026-09-01 carried no request URL), so
    // start-up is where the Bridge row is written too. Production-gated,
    // throttled, collapsed across cold starts — see src/lib/inngest/credentials.ts.
    //
    // Started here, AWAITED below. register() runs before the first request
    // and has no request scope, so `after()` is unavailable and the write
    // takes scheduleBridgeWrite's awaited fallback (bounded at 2.5s, and handed
    // to the Vercel request context's waitUntil when one exists). `void`ing
    // that made it a promise nobody held on a function that freezes: the row
    // never landed, and the throttle window it had opened silenced the next
    // `send`/`inbound` report. In the healthy case it returns before any I/O,
    // so cold start pays nothing.
    const inngestCredentialReport = import('@/lib/inngest/credentials')
      .then((m) => m.reportInngestCredentialFault('startup'))
      .catch(() => false);

    // `process.on` is a Node-only API. Load the handler module only from the
    // Node runtime so Edge builds never evaluate that implementation.
    void import('@/lib/observability/register-process-error-handlers')
      .then((m) => m.registerProcessErrorHandlers())
      .catch(() => {});

    // After the handlers are on their way, never before them: a slow Bridge
    // must not delay the process-level catch-all.
    await inngestCredentialReport;
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn,
      release,
      environment,
      debug: false,
      propagateTraceparent: true,
      integrations: [
        Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
        Sentry.captureConsoleIntegration({ levels: ['error'] }),
      ],
      enableLogs: true,
      // Same rationale as the Node block above — kept identical on both
      // runtimes since a metric call could in principle originate from
      // Edge/proxy code.
      enableMetrics: true,
      tracesSampler: makeTracesSampler(isDev),
      beforeSend: scrubPii,
      beforeSendMetric: enforceMetricAttributeAllowlist,
      beforeSendLog: enforceLogAttributeAllowlist,
      ignoreErrors: sharedIgnoreErrors,
    });

    console.log('[Sentry] Edge runtime initialized', {
      release: release ?? 'none',
      hasDsn: Boolean(dsn),
    });
  }
}

// Error *names* (not full messages) for the Baseball control-flow classes
// sharedIgnoreErrors already suppresses at the Sentry level. withBaseballAction
// classifies these as handled/expected and RE-RAISES so callers can branch —
// the re-raise escapes the server-action boundary and lands in onRequestError
// a second time. Sentry already ignores them (sharedIgnoreErrors above); this
// derives the same name list to skip the Bridge write too, so a re-raise
// never becomes a duplicate admin_events row.
const bridgeSkipErrorNames = new Set(
  sharedIgnoreErrors.filter(
    (entry): entry is string =>
      typeof entry === 'string' &&
      (entry.startsWith('Baseball') ||
        entry === 'PlayerAccessError' ||
        // Lift Lab's wrapper re-raises these exactly like withBaseballAction
        // does (review of Phase C, 2026-09-03: each one produced a second
        // admin_events row labelled as an unhandled 500).
        entry.startsWith('Lifting') ||
        entry === 'GolfDemoReadOnlyError'),
  ),
);

function isNextControlFlowDigest(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === 'string' && (digest === 'DYNAMIC_SERVER_USAGE' || digest.startsWith('NEXT_'));
}

function shouldSkipBridgeWrite(error: unknown, alreadyLogged: boolean): boolean {
  if (isNextControlFlowDigest(error)) return true;
  // Already went through logServerException/logServerError at the throw
  // site (e.g. a golf CRM server action's `catch { logServerException(...);
  // throw error; }`) and is now escaping to onRequestError a second time —
  // skip the Bridge write so the same failure doesn't produce a duplicate
  // error_logs/admin_events row (Sentry already has it too, via
  // Sentry.captureRequestError above).
  if (alreadyLogged) return true;
  const name = error instanceof Error ? error.name : undefined;
  return Boolean(name && bridgeSkipErrorNames.has(name));
}

// Next's actual routeType union is 'render' | 'route' | 'action' | 'proxy'
// (see node_modules/next/dist/server/instrumentation/types.d.ts); typed as
// plain string here so an unrecognized future value falls through to the
// 'server_component' default in mapRouteTypeToSource instead of a type error.
type OnRequestErrorRoutePath = string;

function mapRouteTypeToSource(
  routeType: OnRequestErrorRoutePath,
): 'server_component' | 'route_handler' | 'server_action' | 'request_hook' {
  switch (routeType) {
    case 'route':
      return 'route_handler';
    case 'action':
      return 'server_action';
    // Next 16 renamed middleware.ts → proxy.ts and routeType to match
    // ('proxy'); 'middleware' kept for forward/back compatibility.
    case 'proxy':
    case 'middleware':
      return 'request_hook';
    case 'render':
    default:
      return 'server_component';
  }
}

type OnRequestErrorRequest = Readonly<{
  path: string;
  method: string;
  headers: Record<string, string | string[] | undefined>;
}>;

type OnRequestErrorContext = Readonly<{
  routerKind: 'Pages Router' | 'App Router';
  routePath: string;
  routeType: OnRequestErrorRoutePath;
  renderSource?: 'react-server-components' | 'react-server-components-payload' | 'server-rendering';
  revalidateReason?: 'on-demand' | 'stale';
}>;

// Capture errors from nested React Server Components. The Helm Bridge write
// is strictly additive and can never affect Next's own error handling.
export async function onRequestError(
  error: unknown,
  request: OnRequestErrorRequest,
  errorContext: OnRequestErrorContext,
): Promise<void> {
  // isAlreadyBridgeLogged has no node-only deps (see bridge-logged-marker.ts)
  // so it's imported statically above and is safe to call on both the edge
  // and nodejs paths, and before any dynamic import below.
  const alreadyLogged = isAlreadyBridgeLogged(error);

  // Phase A finding #6 (duplicate-capture bug #4, structural): this call used
  // to run UNCONDITIONALLY, regardless of whether the throw site already sent
  // this exact error to Sentry itself. When a call site does
  // `logServerException(error, {...}); throw error;` WITHOUT skipSentry, that
  // throw-site call already ran the richer capture (Sentry.withScope with
  // action/feature/sport tags, a fingerprint override) via
  // captureSentryTrace — and captureRequestError below would mint a SECOND,
  // differently-fingerprinted issue for the identical error the moment it
  // escaped the boundary. Symmetrically, when a call site deliberately passed
  // skipSentry:true (a routine/expected error it chose not to page on), an
  // unconditional captureRequestError here undermined that choice the moment
  // the error escaped. Gating on the same __helmBridgeLogged marker
  // shouldSkipBridgeWrite already reads fixes both: an error already routed
  // through the approved logServerException/logError pipeline — captured or
  // deliberately not — is never captured a second/first time here. A
  // never-before-seen error (alreadyLogged === false) is captured exactly as
  // before.
  if (!alreadyLogged) {
    Sentry.captureRequestError(error, request, errorContext);
  }

  try {
    // Dynamic import keeps server-error-logger (and its @/lib/supabase/admin
    // dependency) out of the edge bundle — only resolved on the nodejs path.
    const { logServerException } =
      process.env.NEXT_RUNTIME === 'nodejs'
        ? await import('@/lib/server-error-logger')
        : { logServerException: undefined };

    if (shouldSkipBridgeWrite(error, alreadyLogged)) return;

    const route = errorContext.routePath || request.path;
    const source = mapRouteTypeToSource(errorContext.routeType);

    if (process.env.NEXT_RUNTIME === 'nodejs' && logServerException) {
      await logServerException(
        error,
        {
          action: route,
          route,
          source,
          handled: false,
          statusCode: 500,
          runtime: 'nodejs',
          // Sentry.captureRequestError already captured this exception above
          // — logServerException's own internal Sentry.captureException call
          // would otherwise produce a second, differently-fingerprinted
          // Sentry issue for the same error. The Bridge DB write (error_logs
          // + admin_events) still happens; only its Sentry capture is skipped.
          skipSentry: true,
          metadata: {
            routerKind: errorContext.routerKind,
            routeType: errorContext.routeType,
            renderSource: errorContext.renderSource,
            method: request.method,
          },
        },
        'error',
      );
    } else if (process.env.NEXT_RUNTIME === 'edge') {
      const key = process.env.INTERNAL_LOG_KEY;
      if (!key) return; // silently skip — matches src/proxy.ts's guard
      const normalized = error instanceof Error ? error : new Error(String(error));
      fetch(new URL('/api/internal/log-server-error', getAppBaseUrl()), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-log-key': key },
        body: JSON.stringify({
          message: normalized.message.slice(0, 2000),
          stack: normalized.stack?.slice(0, 8000) ?? null,
          name: normalized.name,
          route,
          routeType: errorContext.routeType,
          routerKind: errorContext.routerKind,
          method: request.method,
        }),
      }).catch(() => {});
    }
  } catch {
    // Bridge write must never break Next's own error handling.
  }
}

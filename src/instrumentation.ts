import * as Sentry from '@sentry/nextjs';
import { getAppBaseUrl } from '@/lib/app-base-url';
import { isAlreadyBridgeLogged } from '@/lib/bridge-logged-marker';

const release = process.env.NEXT_PUBLIC_SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA;
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || process.env.SENTRY_DSN?.trim();
const environment = process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';

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
  'PlayerAccessError',
];

/** Best-effort per-app classification for RSC/route errors that never went through a sport-aware wrapper (those already scope.setTag('sport', ...) themselves). */
function deriveSportFromUrl(url: string | undefined): 'baseball' | 'golf' | 'lifting' | 'admin' | 'marketing' {
  const path = url?.split('?')[0] ?? '';
  if (/\/baseball(\/|$)/.test(path)) return 'baseball';
  if (/\/golf(\/|$)/.test(path)) return 'golf';
  if (/\/lifting(\/|$)/.test(path)) return 'lifting';
  if (/\/admin(\/|$)/.test(path)) return 'admin';
  return 'marketing';
}

const scrubPii: Sentry.NodeOptions['beforeSend'] = (event) => {
  if (event.request) {
    delete event.request.cookies;
    if (event.request.headers) {
      delete event.request.headers['Cookie'];
      delete event.request.headers['cookie'];
      delete event.request.headers['Authorization'];
      delete event.request.headers['authorization'];
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
  return event;
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

      integrations: [
        ...(!isDev && profilingIntegration ? [profilingIntegration] : []),
        // Auto-instruments Vercel AI SDK calls (generateText/streamText/
        // generateObject). Captures model, latency, errors, and — when the
        // call sets experimental_telemetry — token usage and prompt/output
        // bodies. CoachHelm and round-recap go through the AI SDK.
        Sentry.vercelAIIntegration({
          recordInputs: true,
          recordOutputs: true,
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

      // 20% in prod controls span volume on hot endpoints; 10% in dev for speed.
      tracesSampleRate: isDev ? 0.1 : 0.2,
      profileSessionSampleRate: isDev ? 0 : 0.3,
      profileLifecycle: 'trace',

      beforeSend: scrubPii,
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

    registerProcessErrorHandlers();
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn,
      release,
      environment,
      debug: false,
      integrations: [
        Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
        Sentry.captureConsoleIntegration({ levels: ['error'] }),
      ],
      enableLogs: true,
      tracesSampleRate: isDev ? 0.1 : 0.2,
      beforeSend: scrubPii,
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
      typeof entry === 'string' && (entry.startsWith('Baseball') || entry === 'PlayerAccessError'),
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

// Capture errors from nested React Server Components. Sentry still gets
// every error first (unchanged behavior); the Helm Bridge write is strictly
// additive and can never affect Next's own error handling.
export async function onRequestError(
  error: unknown,
  request: OnRequestErrorRequest,
  errorContext: OnRequestErrorContext,
): Promise<void> {
  Sentry.captureRequestError(error, request, errorContext);

  try {
    // Dynamic import keeps server-error-logger (and its @/lib/supabase/admin
    // dependency) out of the edge bundle — only resolved on the nodejs path.
    // isAlreadyBridgeLogged has no node-only deps (see bridge-logged-marker.ts)
    // so it's imported statically above and is safe to call on both paths.
    const { logServerException } =
      process.env.NEXT_RUNTIME === 'nodejs'
        ? await import('@/lib/server-error-logger')
        : { logServerException: undefined };

    if (shouldSkipBridgeWrite(error, isAlreadyBridgeLogged(error))) return;

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

// --- process-level fallback: catches errors that never flow through Next's
// request lifecycle at all (detached timers, fire-and-forget promises,
// background job code). nodejs runtime only — process doesn't exist on edge.
let processHandlersRegistered = false;

// Shared 20-writes/minute ceiling across both handlers so a rejection storm
// (e.g. a bad dependency spinning on a promise) can't flood admin_events.
const BRIDGE_PROCESS_WRITE_LIMIT = 20;
let bridgeProcessWindowStart = Date.now();
let bridgeProcessWriteCount = 0;

function allowBridgeProcessWrite(): boolean {
  const now = Date.now();
  if (now - bridgeProcessWindowStart > 60_000) {
    bridgeProcessWindowStart = now;
    bridgeProcessWriteCount = 0;
  }
  bridgeProcessWriteCount += 1;
  return bridgeProcessWriteCount <= BRIDGE_PROCESS_WRITE_LIMIT;
}

function logProcessErrorToBridge(action: string, error: Error): void {
  if (!allowBridgeProcessWrite()) return;
  void import('@/lib/server-error-logger')
    .then((m) => m.logServerException(error, { action, source: 'background_job', handled: false }, 'error'))
    .catch(() => {});
}

function registerProcessErrorHandlers(): void {
  if (processHandlersRegistered) return;
  processHandlersRegistered = true;

  process.on('unhandledRejection', (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    Sentry.captureException(error);
    logProcessErrorToBridge('process.unhandledRejection', error);
  });

  process.on('uncaughtException', (error) => {
    Sentry.captureException(error);
    logProcessErrorToBridge('process.uncaughtException', error);
    // Do NOT process.exit() or rethrow here — Sentry's own uncaughtException
    // integration (wired via Sentry.init above) owns fatality/exit behavior.
  });
}

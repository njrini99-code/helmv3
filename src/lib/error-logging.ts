/**
 * Error Logging Service — routes errors to Sentry + the internal error_logs table.
 */

import * as Sentry from '@sentry/nextjs';
import { classifyTraceSurface } from '@/lib/error-trace-classification';

const SEVERITY_TO_SENTRY_LEVEL: Record<'low' | 'medium' | 'high' | 'critical', Sentry.SeverityLevel> = {
  low: 'info',
  medium: 'warning',
  high: 'error',
  critical: 'fatal',
};

export interface ErrorContext {
  userId?: string;
  userEmail?: string;
  route?: string;
  component?: string;
  action?: string;
  [key: string]: unknown;
}

interface ErrorLogEntry {
  error: Error;
  context?: ErrorContext;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: string;
}

interface NavigatorConnectionLike {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

interface NavigatorWithConnection extends Navigator {
  connection?: NavigatorConnectionLike;
  mozConnection?: NavigatorConnectionLike;
  webkitConnection?: NavigatorConnectionLike;
  deviceMemory?: number;
}

function getBrowserDiagnostics(): ErrorContext {
  if (typeof window === 'undefined') return {};

  const nav = navigator as NavigatorWithConnection;
  const connection = nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
  const navigationEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;

  return {
    browser: {
      userAgent: navigator.userAgent,
      language: navigator.language,
      languages: navigator.languages,
      cookieEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: nav.deviceMemory ?? null,
    },
    location: {
      href: window.location.href,
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
      origin: window.location.origin,
      referrer: document.referrer || null,
    },
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      pixelRatio: window.devicePixelRatio,
    },
    document: {
      visibilityState: document.visibilityState,
      readyState: document.readyState,
    },
    history: {
      length: window.history.length,
    },
    network: connection
      ? {
          effectiveType: connection.effectiveType ?? null,
          downlink: connection.downlink ?? null,
          rtt: connection.rtt ?? null,
          saveData: connection.saveData ?? null,
        }
      : null,
    navigation: navigationEntry
      ? {
          type: navigationEntry.type,
          redirectCount: navigationEntry.redirectCount,
          transferSize: navigationEntry.transferSize,
          encodedBodySize: navigationEntry.encodedBodySize,
          decodedBodySize: navigationEntry.decodedBodySize,
          domComplete: Math.round(navigationEntry.domComplete),
          loadEventEnd: Math.round(navigationEntry.loadEventEnd),
        }
      : null,
    serviceWorker: 'serviceWorker' in navigator
      ? {
          controlled: !!navigator.serviceWorker.controller,
          state: navigator.serviceWorker.controller?.state ?? null,
        }
      : null,
  };
}

function enrichErrorContext(error: Error, context?: ErrorContext): ErrorContext | undefined {
  const browserDiagnostics = getBrowserDiagnostics();
  const contextRoute = typeof context?.route === 'string' ? context.route : null;
  const locationRoute =
    typeof browserDiagnostics.location === 'object' &&
    browserDiagnostics.location !== null &&
    'pathname' in browserDiagnostics.location &&
    typeof browserDiagnostics.location.pathname === 'string'
      ? browserDiagnostics.location.pathname
      : null;
  const component = typeof context?.component === 'string' ? context.component : null;
  const trace = classifyTraceSurface(contextRoute ?? locationRoute, component);
  const mergedContext = {
    ...browserDiagnostics,
    sport: context?.sport ?? trace.sport ?? undefined,
    feature: context?.feature ?? trace.feature ?? undefined,
    featureArea: context?.featureArea ?? trace.feature ?? undefined,
    ...context,
    error: {
      name: error.name,
      message: error.message,
      digest: 'digest' in error ? (error as Error & { digest?: string }).digest ?? null : null,
      stackPreview: error.stack ? error.stack.split('\n').slice(0, 5).join('\n') : null,
    },
  };

  return Object.keys(mergedContext).length > 0 ? mergedContext : undefined;
}

/**
 * Detects the specific Next.js stale-server-action error that surfaces when a
 * client tab references an action ID from a previous deployment. Not actionable
 * in error tracking — the fix is a single page reload to pick up the new
 * action map. We suppress server-side capture and rely on the client error
 * boundary's reload-once logic to recover.
 *
 * Accepts `unknown` so window error handlers and React error boundaries can
 * pass through whatever they got (Error, string, or random rejection value)
 * without their own type guards.
 */
export function isStaleServerActionError(error: unknown): boolean {
  if (!error) return false;

  let msg = '';
  if (typeof error === 'string') {
    msg = error;
  } else if (typeof error === 'object' && 'message' in error) {
    const candidate = (error as { message?: unknown }).message;
    msg = typeof candidate === 'string' ? candidate : '';
  }

  if (!msg) return false;

  return (
    /Server Action ".*" was not found on the server/.test(msg) ||
    msg.includes('was not found on the server')
  );
}

/** Track suppressed stale-action warnings so we still emit one per session. */
let staleActionWarnedThisSession = false;

/**
 * `ResizeObserver loop completed with undelivered notifications` (and its
 * older Chrome/Firefox alias `ResizeObserver loop limit exceeded`) fires
 * whenever an observed element's resize callback triggers another resize
 * within the same frame — routine with elastic/spring layouts — and the
 * browser simply defers delivery to the next frame. It is not a bug and
 * never carries a useful stack. Sentry's own `ignoreErrors` (instrumentation
 * -client.ts) already filters it from becoming an issue, but that filter
 * only guards Sentry's automatic capture — this module's own Bridge pipeline
 * (`sendToMonitoringService` → /api/log-error → error_logs/admin_events)
 * is a separate path and would otherwise persist one row per occurrence.
 */
function isResizeObserverLoopNoise(message: string): boolean {
  return /ResizeObserver loop (completed with undelivered notifications|limit exceeded)/.test(
    message,
  );
}

/**
 * CefSharp's JavaScript bridge emits `Object Not Found Matching Id:1,
 * MethodName:update, ParamCount:4` when an embedded-browser host tears down a
 * bound object before a queued callback runs. It originates OUTSIDE our bundle
 * — there is no Helm frame to fix, no stack, and no user impact — which is why
 * instrumentation-client.ts already lists this exact pattern in Sentry's
 * `ignoreErrors`. Same asymmetry as the ResizeObserver case above: that filter
 * only guards Sentry's automatic capture, so without this the Bridge pipeline
 * still persists one `severity:error` row per occurrence.
 */
function isEmbeddedBrowserBridgeNoise(message: string): boolean {
  return /Object Not Found Matching Id:\d+, MethodName:\w+, ParamCount:\d+/.test(message);
}

/**
 * A fetch that never reached the server.
 *
 * Every engine words this differently, and the message is all we get — the
 * `TypeError` carries no status and no useful stack:
 *
 *   Safari / iOS WKWebView ... "Load failed"
 *   Chrome / Edge ............ "Failed to fetch"
 *   Firefox .................. "NetworkError when attempting to fetch resource."
 *   Stripe.js ................ "A network error occurred."
 *   WebKit, mid-request ...... "The network connection was lost."
 *
 * All five are the transport layer, not the application: a 500 from our own API
 * does NOT land here, because `fetch` resolves for any HTTP response it
 * actually received. That is what makes the class safe to tier down.
 *
 * Deliberately NOT matched: `AbortError`. Aborts are our own timeouts firing
 * (`AbortSignal.timeout`), which is a budget we chose and may need to revisit —
 * a different question from the user's connection dropping.
 */
function isTransientNetworkErrorMessage(message: string): boolean {
  const msg = message.toLowerCase();
  return (
    msg.includes('load failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror when attempting to fetch') ||
    msg.includes('a network error occurred') ||
    msg.includes('network connection was lost') ||
    msg.includes('internet connection appears to be offline') ||
    msg.includes('net::err_')
  );
}

/**
 * Ceiling on the severity of failures that carry their own recovery path.
 *
 * A chunk-load failure means the tab is holding asset URLs from a deployment
 * that no longer exists. It is not a defect: the `beforeInteractive` recovery
 * script plus `ChunkLoadErrorHandler` reload the tab once per session and the
 * user lands on the new build. Sentry already declines to open an issue for it
 * (`instrumentation-client.ts` `ignoreErrors`, "Stale deployment assets are
 * already handled by the global one-shot ChunkLoadError recovery"), so leaving
 * the Bridge at `severity:error` meant one class read as a live incident in
 * Helm Bridge while being deliberately ignored one layer over — the same
 * inconsistency `RouteErrorBoundary` already resolved for transient-network
 * failures by tiering them to 'medium'.
 *
 * Transient network failures belong in the same bucket, and this is where the
 * Bridge disagreed with the code that reports them. `useShotStateMachine`
 * auto-save calls `logError(..., 'high')` from all three of its failure sites,
 * but those sites sit ON a recovery ladder: the initial attempt retries at 5s,
 * 15s and 30s, then a circuit breaker takes over with 60s cooldown probes, and
 * any success resets the whole thing. So one dropped request mid-round — a
 * phone on a golf course, `Load failed` from iOS WebKit — was filed as a
 * `severity:error` incident describing a save that the very next tick almost
 * certainly completed. The report is still worth having; calling it an error is
 * not.
 *
 * Capped rather than dropped, in both cases: one stale tab or one dropped
 * request is noise, but a SPIKE is a real signal (a bad deploy, a purged CDN,
 * an API that is actually down), so the rows must keep arriving — just as
 * warnings, not as errors. A sustained auto-save outage still produces a
 * warning per retry and per probe, which is the shape worth alerting on.
 *
 * `critical` is left untouched; a caller that has escalated that far knows
 * something this filter does not.
 */
function capSeverityForSelfRecovering(
  message: string,
  severity: ErrorLogEntry['severity'],
): ErrorLogEntry['severity'] {
  if (severity !== 'high') return severity;
  return isChunkLoadErrorMessage(message) || isTransientNetworkErrorMessage(message)
    ? 'medium'
    : severity;
}

/**
 * Automated clients: crawlers, link previewers, uptime probes, headless agents.
 *
 * A crawler is not a user, so a failure it hits is not a user-facing defect —
 * and it reaches pages no user flow does, with no cookies, no consent state and
 * frequently with JavaScript features disabled. Production example: Stripe's
 * `Stripebot/1.0` fetched the public `/products` page, Stripe.js could not
 * reach its own API, and the resulting unhandled rejection ("A network error
 * occurred.") was filed as a `severity:error` incident against a marketing
 * page that was working perfectly for every human on it.
 *
 * Matched on the conventional self-identifying tokens rather than a vendor
 * list, so a new crawler is covered without an edit. `HeadlessChrome` is
 * included because that is what Lighthouse CI and the synthetic checks in
 * `.circleci/config.yml` report, and their failures are CI's to surface.
 */
const AUTOMATED_CLIENT_UA = /bot|crawl|spider|slurp|headlesschrome|phantomjs|puppeteer|playwright|lighthouse|pingdom|uptimerobot|semrush|ahrefs|bingpreview|facebookexternalhit|preview/i;

function isAutomatedClient(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // `navigator.webdriver` is the spec-mandated automation flag; Playwright and
  // Selenium set it even when the UA is spoofed to look like a real browser.
  if ((navigator as Navigator & { webdriver?: boolean }).webdriver === true) return true;
  return typeof ua === 'string' && AUTOMATED_CLIENT_UA.test(ua);
}

/**
 * Client-side report de-duplication.
 *
 * A single flaky tab — e.g. a backgrounded `/golf/dashboard/rounds/new` on a
 * weak connection throwing `TypeError: network error` every few seconds — was
 * writing hundreds of identical rows to error_logs + Sentry (one client wrote
 * 320 in 8 hours). Collapse identical `(severity|component|message)` reports:
 * always send the first, then at most one per REPORT_WINDOW_MS, capped at
 * REPORT_SESSION_CAP total per tab. Distinct errors (different message or
 * component) each get their own budget and are never suppressed, so a genuine
 * multi-error outage still surfaces — and it spans many tabs/users anyway.
 */
const REPORT_WINDOW_MS = 60_000;
const REPORT_SESSION_CAP = 8;
const reportLedger = new Map<string, { last: number; count: number }>();

function shouldThrottleClientReport(
  severity: string,
  error: Error,
  context?: ErrorContext,
): boolean {
  const who =
    (typeof context?.component === 'string' && context.component) ||
    (typeof context?.route === 'string' && context.route) ||
    'unknown';
  const key = `${severity}|${who}|${error.message}`;
  const now = Date.now();
  const prev = reportLedger.get(key);
  if (!prev) {
    reportLedger.set(key, { last: now, count: 1 });
    return false;
  }
  if (prev.count >= REPORT_SESSION_CAP) return true;
  if (now - prev.last < REPORT_WINDOW_MS) return true;
  prev.last = now;
  prev.count += 1;
  return false;
}

/**
 * Main error logging function
 * Logs errors to console in development and sends to monitoring service in production
 */
export function logError(
  error: Error,
  context?: ErrorContext,
  requestedSeverity: ErrorLogEntry['severity'] = 'medium'
): void {
  // Stale-server-action errors are deployment artifacts, not bugs. Downgrade
  // to a single per-session warning instead of paging error tracking 18 times
  // for one user with an open tab.
  if (isStaleServerActionError(error)) {
    if (!staleActionWarnedThisSession) {
      staleActionWarnedThisSession = true;
      console.warn('[error-logging] stale server action detected — client will reload to pick up the new bundle');
    }
    return;
  }

  // Benign browser noise — filter before Sentry AND before the Bridge write,
  // not just from Sentry's ignoreErrors. See isResizeObserverLoopNoise and
  // isEmbeddedBrowserBridgeNoise above.
  if (isResizeObserverLoopNoise(error.message) || isEmbeddedBrowserBridgeNoise(error.message)) {
    return;
  }

  // Nobody is looking at the screen. See isAutomatedClient above: a crawler's
  // failure is not a user's failure, and it is reported against pages and
  // states no user flow reaches.
  if (isAutomatedClient()) {
    return;
  }

  const severity = capSeverityForSelfRecovering(error.message, requestedSeverity);

  const enrichedContext = enrichErrorContext(error, context);
  const logEntry: ErrorLogEntry = {
    error,
    context: enrichedContext,
    severity,
    timestamp: new Date().toISOString(),
  };

  // Always log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.group(`🔴 Error [${severity}]`);
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
    if (enrichedContext) {
      console.log('Context:', enrichedContext);
    }
    console.groupEnd();
  }

  // De-duplicate identical reports from a single tab before paying the
  // network/Sentry cost. Dev console logging above is unaffected.
  if (shouldThrottleClientReport(severity, error, context)) {
    return;
  }

  // Send to Sentry — captures stack, breadcrumbs, replay, user context
  Sentry.withScope((scope) => {
    scope.setLevel(SEVERITY_TO_SENTRY_LEVEL[severity]);
    if (enrichedContext) {
      const { browser, location, viewport, document: docCtx, history, network, ...rest } = enrichedContext as Record<string, unknown>;
      // Promote diagnostic blocks to Sentry contexts (queryable in UI)
      if (browser) scope.setContext('browser', browser as Record<string, unknown>);
      if (location) scope.setContext('location', location as Record<string, unknown>);
      if (viewport) scope.setContext('viewport', viewport as Record<string, unknown>);
      if (docCtx) scope.setContext('document', docCtx as Record<string, unknown>);
      if (history) scope.setContext('history', history as Record<string, unknown>);
      if (network) scope.setContext('network', network as Record<string, unknown>);
      // Remaining keys become tags / extras
      for (const [key, value] of Object.entries(rest)) {
        if (value === undefined || value === null) continue;
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          scope.setTag(key, String(value));
        } else {
          scope.setExtra(key, value);
        }
      }
    }
    Sentry.captureException(error);
  });

  // Also persist to error_logs table for product analytics
  sendToMonitoringService(logEntry);
}

/** 429 (rate-limited) and 5xx (backend fault) are worth retrying; other 4xx are not — the
 * request itself is malformed/rejected and a retry or beacon fallback would just repeat it. */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Send error to external monitoring service
 *
 * Lossless-effort delivery: a plain `fetch().catch(() => {})` drops the report
 * the moment the network hiccups or the tab is backgrounded mid-request, which
 * is exactly when we most need the report. `keepalive` lets the request outlive
 * a navigating/closing page; one retry absorbs a transient 429/5xx or network
 * blip; `sendBeacon` is the last-resort transport that the browser guarantees
 * to attempt even during unload, when `fetch` itself can be aborted outright.
 *
 * This path must never recurse into `logError` (that would risk an infinite
 * loop reporting its own delivery failures) and must never throw — the worst
 * outcome here is a `console.error`, not a crashed caller.
 */
function sendToMonitoringService(logEntry: ErrorLogEntry): void {
  if (typeof window === 'undefined') return;

  const body = JSON.stringify({
    message: logEntry.error.message,
    stack: logEntry.error.stack,
    context: logEntry.context,
    severity: logEntry.severity,
    timestamp: logEntry.timestamp,
    url: window.location.href,
  });

  const fallbackToBeacon = (): void => {
    try {
      if (typeof navigator.sendBeacon === 'function') {
        const delivered = navigator.sendBeacon('/api/log-error', new Blob([body], { type: 'application/json' }));
        if (delivered) return;
      }
    } catch {
      // fall through to the console.error below
    }
    console.error('[error-logging] failed to deliver error report to /api/log-error');
  };

  const post = (isRetry: boolean): void => {
    fetch('/api/log-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    })
      .then((response) => {
        if (response.ok || !isRetryableStatus(response.status)) return;
        if (isRetry) {
          fallbackToBeacon();
        } else {
          setTimeout(() => post(true), 2000);
        }
      })
      .catch(() => {
        // Network-level failure (offline, DNS, aborted) — treat the same as a
        // retryable status: one retry, then the beacon fallback.
        if (isRetry) {
          fallbackToBeacon();
        } else {
          setTimeout(() => post(true), 2000);
        }
      });
  };

  post(false);
}

/**
 * Storage key used to ensure we only auto-reload once per session after
 * detecting a stale-server-action error. Prevents an infinite reload loop
 * if for some reason the new bundle is still broken.
 *
 * Exported so other modules (e.g. RouteErrorBoundary) coordinate on the
 * same key — there must be exactly one source of truth, otherwise two
 * paths can each "first-reload" the same session.
 */
export const STALE_ACTION_RELOAD_KEY = 'stale-action-auto-reload';

/**
 * Module-level fallback flag for environments where sessionStorage throws
 * (Safari private mode, sandboxed iframes, storage quota exceeded). Without
 * this, a sessionStorage failure in the catch block would silently fall
 * through and the reload would fire on every error → infinite loop.
 */
let reloadAttempted = false;

/**
 * Reload the page once per session after a stale-server-action error,
 * showing a toast to explain what's happening if a toast system is mounted.
 * Falls back to a silent reload if `sonner` isn't loaded yet.
 *
 * Reload-guarding is layered: sessionStorage is the primary signal (survives
 * the reload itself), but the module-level `reloadAttempted` flag is the
 * authoritative fallback when sessionStorage is unavailable or throws.
 */
export function softReloadForStaleServerAction(): void {
  if (typeof window === 'undefined') return;

  // Module-level guard catches the private-mode case where sessionStorage
  // throws on every read AND every write — without this, both fail silently
  // and we'd reload forever.
  if (reloadAttempted) return;

  let storageAvailable = true;
  try {
    const already = window.sessionStorage.getItem(STALE_ACTION_RELOAD_KEY);
    if (already) return;
  } catch {
    storageAvailable = false;
  }

  if (storageAvailable) {
    try {
      window.sessionStorage.setItem(STALE_ACTION_RELOAD_KEY, Date.now().toString());
    } catch {
      // setItem can throw even when getItem succeeds (quota exceeded /
      // privacy mode partial support). Fall through to the module flag.
      storageAvailable = false;
    }
  }

  // Always set the module flag so a same-tick second call cannot reload
  // again, regardless of sessionStorage state.
  reloadAttempted = true;

  // Best-effort toast. Dynamic import keeps this file framework-agnostic and
  // avoids pulling sonner into the server bundle.
  void import('sonner')
    .then(({ toast }) => {
      try {
        toast('Updating to latest version…');
      } catch {
        /* noop */
      }
    })
    .catch(() => {
      /* sonner not available — silent reload is fine */
    })
    .finally(() => {
      // Small delay so the toast has a chance to render before reload.
      setTimeout(() => {
        window.location.reload();
      }, 250);
    });
}

/**
 * Mirrors the chunk-load detection in `RouteErrorBoundary` (not exported there,
 * so duplicated here rather than imported) — a stale deployment reference is
 * a distinct, non-actionable failure mode worth tagging separately from a
 * generic runtime error.
 */
function isChunkLoadErrorMessage(message: string): boolean {
  const msg = message.toLowerCase();
  return (
    msg.includes('loading chunk') ||
    msg.includes('loading css chunk') ||
    msg.includes('chunkloaderror') ||
    (msg.includes('cannot read properties of undefined') && msg.includes("'call'"))
  );
}

/** React hydration mismatches, including the minified production error codes
 * (#418/#419/#421/#425) that replace the descriptive dev-mode message. */
function isHydrationErrorMessage(message: string): boolean {
  const msg = message.toLowerCase();
  return (
    msg.includes('hydration failed') ||
    msg.includes('while hydrating') ||
    msg.includes('text content does not match server-rendered html') ||
    msg.includes('#418') ||
    msg.includes('#419') ||
    msg.includes('#421') ||
    msg.includes('#425')
  );
}

/**
 * Kebab-case to match `RouteErrorBoundary`'s five `errorKind` values
 * ('chunk-load', 'stale-server-action', 'transient-network', …). The two paths
 * previously disagreed — 'chunk_load' here vs 'chunk-load' there — which split
 * one failure class across two keys in every telemetry grouping.
 */
function classifyGlobalErrorKind(message: string): 'chunk-load' | 'hydration' | undefined {
  if (isChunkLoadErrorMessage(message)) return 'chunk-load';
  if (isHydrationErrorMessage(message)) return 'hydration';
  return undefined;
}

/**
 * Capture and log unhandled promise rejections
 */
export function setupGlobalErrorHandlers(): void {
  if (typeof window !== 'undefined') {
    // Unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      const reasonMessage =
        (reason && typeof reason === 'object' && 'message' in reason ? String(reason.message) : '') ||
        (typeof reason === 'string' ? reason : '');

      // Stale server action — soft-reload once per session and don't log.
      if (isStaleServerActionError(reason) || isStaleServerActionError(reasonMessage)) {
        softReloadForStaleServerAction();
        return;
      }

      const errorKind = classifyGlobalErrorKind(reasonMessage);
      logError(
        new Error(reasonMessage || 'Unhandled Promise Rejection'),
        {
          component: 'GlobalErrorHandler',
          action: 'unhandledrejection',
          reason,
          ...(errorKind ? { errorKind } : {}),
        },
        'high'
      );
    });

    // Global error handler
    window.addEventListener('error', (event) => {
      const err = event.error || new Error(event.message);
      if (isStaleServerActionError(err)) {
        softReloadForStaleServerAction();
        return;
      }
      const errorKind = classifyGlobalErrorKind(err.message || event.message || '');
      logError(
        err,
        {
          component: 'GlobalErrorHandler',
          action: 'error',
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          ...(errorKind ? { errorKind } : {}),
        },
        'high'
      );
    });
  }
}

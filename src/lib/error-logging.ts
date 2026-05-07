/**
 * Error Logging Service — routes errors to Sentry + the internal error_logs table.
 */

import * as Sentry from '@sentry/nextjs';

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
  const mergedContext = {
    ...browserDiagnostics,
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
 */
function isStaleServerActionError(error: Error): boolean {
  const msg = error?.message ?? '';
  return (
    /Server Action ".*" was not found on the server/.test(msg) ||
    msg.includes('was not found on the server')
  );
}

/** Track suppressed stale-action warnings so we still emit one per session. */
let staleActionWarnedThisSession = false;

/**
 * Main error logging function
 * Logs errors to console in development and sends to monitoring service in production
 */
export function logError(
  error: Error,
  context?: ErrorContext,
  severity: ErrorLogEntry['severity'] = 'medium'
): void {
  // Stale-server-action errors are deployment artifacts, not bugs. Downgrade
  // to a single per-session warning instead of paging error tracking 18 times
  // for one user with an open tab.
  if (isStaleServerActionError(error)) {
    if (!staleActionWarnedThisSession) {
      staleActionWarnedThisSession = true;
      // eslint-disable-next-line no-console
      console.warn('[error-logging] stale server action detected — client will reload to pick up the new bundle');
    }
    return;
  }

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

/**
 * Send error to external monitoring service
 * Replace this with your actual error monitoring service integration
 */
function sendToMonitoringService(logEntry: ErrorLogEntry): void {
  if (typeof window === 'undefined') return;

  fetch('/api/log-error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: logEntry.error.message,
      stack: logEntry.error.stack,
      context: logEntry.context,
      severity: logEntry.severity,
      timestamp: logEntry.timestamp,
      url: window.location.href,
    }),
  }).catch(() => {
    // Silently fail - don't let logging errors break the app
  });
}

/**
 * Storage key + flag used to ensure we only auto-reload once per session
 * after detecting a stale-server-action error. Prevents an infinite reload
 * loop if for some reason the new bundle is still broken.
 */
const STALE_ACTION_RELOAD_KEY = 'stale-action-auto-reload';

/**
 * Reload the page once per session after a stale-server-action error,
 * showing a toast to explain what's happening if a toast system is mounted.
 * Falls back to a silent reload if `sonner` isn't loaded yet.
 */
function softReloadForStaleServerAction(): void {
  if (typeof window === 'undefined') return;
  try {
    const already = window.sessionStorage.getItem(STALE_ACTION_RELOAD_KEY);
    if (already) return;
    window.sessionStorage.setItem(STALE_ACTION_RELOAD_KEY, Date.now().toString());
  } catch {
    // sessionStorage may be unavailable (SSR / private mode) — proceed anyway.
  }

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
      if (
        /Server Action ".*" was not found on the server/.test(reasonMessage) ||
        reasonMessage.includes('was not found on the server')
      ) {
        softReloadForStaleServerAction();
        return;
      }

      logError(
        new Error(reasonMessage || 'Unhandled Promise Rejection'),
        {
          component: 'GlobalErrorHandler',
          action: 'unhandledrejection',
          reason,
        },
        'high'
      );
    });

    // Global error handler
    window.addEventListener('error', (event) => {
      const err = event.error || new Error(event.message);
      if (err && err.message && err.message.includes('was not found on the server')) {
        softReloadForStaleServerAction();
        return;
      }
      logError(
        err,
        {
          component: 'GlobalErrorHandler',
          action: 'error',
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
        'high'
      );
    });
  }
}


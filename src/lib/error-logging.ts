/**
 * Error Logging Service
 *
 * Centralized error logging that can be integrated with:
 * - Sentry (https://sentry.io)
 * - LogRocket (https://logrocket.com)
 * - Datadog (https://www.datadoghq.com)
 * - Custom logging solution
 */

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
 * Main error logging function
 * Logs errors to console in development and sends to monitoring service in production
 */
export function logError(
  error: Error,
  context?: ErrorContext,
  severity: ErrorLogEntry['severity'] = 'medium'
): void {
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

  // Send to error_logs table via API route
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
 * Capture and log unhandled promise rejections
 */
export function setupGlobalErrorHandlers(): void {
  if (typeof window !== 'undefined') {
    // Unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      logError(
        new Error(event.reason?.message || 'Unhandled Promise Rejection'),
        {
          component: 'GlobalErrorHandler',
          action: 'unhandledrejection',
          reason: event.reason,
        },
        'high'
      );
    });

    // Global error handler
    window.addEventListener('error', (event) => {
      logError(
        event.error || new Error(event.message),
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


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
  [key: string]: any;
}

export interface ErrorLogEntry {
  error: Error;
  context?: ErrorContext;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: string;
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
  const logEntry: ErrorLogEntry = {
    error,
    context,
    severity,
    timestamp: new Date().toISOString(),
  };

  // Always log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.group(`🔴 Error [${severity}]`);
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
    if (context) {
      console.log('Context:', context);
    }
    console.groupEnd();
  }

  // Send to error monitoring service in production
  if (process.env.NODE_ENV === 'production') {
    sendToMonitoringService(logEntry);
  }
}

/**
 * Log a critical error that requires immediate attention
 */
export function logCriticalError(error: Error, context?: ErrorContext): void {
  logError(error, context, 'critical');

  // Additional actions for critical errors
  if (process.env.NODE_ENV === 'production') {
    // Could trigger alerts, notifications, etc.
    console.error('CRITICAL ERROR:', error.message);
  }
}

/**
 * Log a warning (non-blocking error)
 */
export function logWarning(message: string, context?: ErrorContext): void {
  const error = new Error(message);
  error.name = 'Warning';
  logError(error, context, 'low');
}

/**
 * Send error to external monitoring service
 * Replace this with your actual error monitoring service integration
 */
function sendToMonitoringService(logEntry: ErrorLogEntry): void {
  // Example: Sentry integration
  // if (typeof window !== 'undefined' && window.Sentry) {
  //   window.Sentry.captureException(logEntry.error, {
  //     level: logEntry.severity,
  //     extra: logEntry.context,
  //   });
  // }

  // Example: Custom API endpoint
  // fetch('/api/log-error', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({
  //     message: logEntry.error.message,
  //     stack: logEntry.error.stack,
  //     context: logEntry.context,
  //     severity: logEntry.severity,
  //     timestamp: logEntry.timestamp,
  //   }),
  // }).catch(() => {
  //   // Silently fail - don't let logging errors break the app
  // });

  // For now, just log to console in production
  console.error('[Error Monitor]', logEntry);
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

/**
 * Helper to get current user context for error logging
 */
export async function getCurrentUserContext(): Promise<ErrorContext | undefined> {
  try {
    // This would typically fetch from your auth context/store
    // For now, return undefined
    // const user = await getCurrentUser();
    // return {
    //   userId: user?.id,
    //   userEmail: user?.email,
    //   route: window.location.pathname,
    // };
    return {
      route: typeof window !== 'undefined' ? window.location.pathname : undefined,
    };
  } catch {
    return undefined;
  }
}

/**
 * Wrapper for async operations with automatic error logging
 */
export async function withErrorLogging<T>(
  operation: () => Promise<T>,
  context?: ErrorContext
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    logError(
      error instanceof Error ? error : new Error(String(error)),
      context,
      'medium'
    );
    return null;
  }
}

/**
 * Performance monitoring helper
 */
export function logPerformanceMetric(
  metricName: string,
  value: number,
  context?: ErrorContext
): void {
  if (process.env.NODE_ENV === 'development') {
    console.log(`📊 Performance: ${metricName} = ${value}ms`, context);
  }

  // Send to monitoring service in production
  if (process.env.NODE_ENV === 'production') {
    // Example: Send to monitoring service
    // sendMetricToService(metricName, value, context);
  }
}

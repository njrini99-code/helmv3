/**
 * Error monitoring and logging utilities
 *
 * For production, integrate with:
 * - Sentry (recommended): npm install @sentry/nextjs
 * - LogRocket: npm install logrocket
 * - Datadog: npm install @datadog/browser-logs
 */

export interface ErrorContext {
  userId?: string;
  userEmail?: string;
  page?: string;
  action?: string;
  metadata?: Record<string, unknown>;
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface ErrorReport {
  message: string;
  stack?: string;
  severity: ErrorSeverity;
  context?: ErrorContext;
  timestamp: string;
}

class ErrorMonitoring {
  private enabled: boolean;
  private environment: string;

  constructor() {
    this.enabled = process.env.NODE_ENV === 'production';
    this.environment = process.env.NODE_ENV || 'development';
  }

  /**
   * Log an error with context
   */
  logError(
    error: Error | string,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    context?: ErrorContext
  ): void {
    const errorMessage = typeof error === 'string' ? error : error.message;
    const stack = typeof error === 'string' ? undefined : error.stack;

    const report: ErrorReport = {
      message: errorMessage,
      stack,
      severity,
      context,
      timestamp: new Date().toISOString(),
    };

    // Log to console in development
    if (!this.enabled) {
      console.error('[Error Monitoring]', report);
      return;
    }

    // In production, this would send to Sentry/LogRocket/etc.
    this.sendToMonitoringService(report);
  }

  /**
   * Log a handled exception (expected error)
   */
  logException(
    error: Error,
    context?: ErrorContext
  ): void {
    this.logError(error, ErrorSeverity.MEDIUM, context);
  }

  /**
   * Log a critical error (app-breaking)
   */
  logCritical(
    error: Error | string,
    context?: ErrorContext
  ): void {
    this.logError(error, ErrorSeverity.CRITICAL, context);
  }

  /**
   * Log a warning (non-breaking issue)
   */
  logWarning(
    message: string,
    context?: ErrorContext
  ): void {
    this.logError(message, ErrorSeverity.LOW, context);
  }

  /**
   * Set user context for error tracking
   */
  setUser(user: { id: string; email: string; role?: string }): void {
    if (typeof window !== 'undefined') {
      import('@sentry/nextjs').then((Sentry) => {
        Sentry.setUser({
          id: user.id,
          email: user.email,
          role: user.role,
        });
        console.debug('[Error Monitoring] User context set:', user.id);
      }).catch(() => {
        console.debug('[Error Monitoring] Sentry not available');
      });
    }
  }

  /**
   * Clear user context (on logout)
   */
  clearUser(): void {
    if (typeof window !== 'undefined') {
      import('@sentry/nextjs').then((Sentry) => {
        Sentry.setUser(null);
        console.debug('[Error Monitoring] User context cleared');
      }).catch(() => {
        console.debug('[Error Monitoring] Sentry not available');
      });
    }
  }

  /**
   * Send error report to monitoring service
   */
  private sendToMonitoringService(report: ErrorReport): void {
    // Send to Sentry
    if (typeof window !== 'undefined') {
      import('@sentry/nextjs').then((Sentry) => {
        Sentry.captureException(new Error(report.message), {
          level: this.mapSeverityToSentryLevel(report.severity),
          contexts: {
            error_context: report.context,
          },
          extra: {
            timestamp: report.timestamp,
            stack: report.stack,
          },
        } as any);
      }).catch(() => {
        // Sentry not available, fallback to console
        console.error('[Production Error]', report);
      });

      // Also send to backend logging endpoint
      fetch('/api/log-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
      }).catch(() => {
        // Silently fail - don't cause errors in error logging
      });
    } else {
      // Server-side
      import('@sentry/nextjs').then((Sentry) => {
        Sentry.captureException(new Error(report.message), {
          level: this.mapSeverityToSentryLevel(report.severity),
          contexts: {
            error_context: report.context,
          },
          extra: {
            timestamp: report.timestamp,
            stack: report.stack,
          },
        } as any);
      }).catch(() => {
        console.error('[Server Error]', report);
      });
    }
  }

  /**
   * Map our severity to Sentry levels
   */
  private mapSeverityToSentryLevel(severity: ErrorSeverity): string {
    switch (severity) {
      case ErrorSeverity.LOW:
        return 'warning';
      case ErrorSeverity.MEDIUM:
        return 'error';
      case ErrorSeverity.HIGH:
      case ErrorSeverity.CRITICAL:
        return 'fatal';
      default:
        return 'error';
    }
  }
}

// Export singleton instance
export const errorMonitoring = new ErrorMonitoring();

// Convenience exports
export const logError = errorMonitoring.logError.bind(errorMonitoring);
export const logException = errorMonitoring.logException.bind(errorMonitoring);
export const logCritical = errorMonitoring.logCritical.bind(errorMonitoring);
export const logWarning = errorMonitoring.logWarning.bind(errorMonitoring);
export const setUser = errorMonitoring.setUser.bind(errorMonitoring);
export const clearUser = errorMonitoring.clearUser.bind(errorMonitoring);

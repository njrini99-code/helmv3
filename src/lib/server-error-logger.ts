'use server';

import * as Sentry from '@sentry/nextjs';
import { createAdminClient } from '@/lib/supabase/admin';

interface RoundErrorContext {
  action: string;
  roundId?: string | null;
  playerId?: string | null;
  userId?: string | null;
  userEmail?: string | null;
  holesCount?: number;
  shotsCount?: number;
  errorCode?: string;
  errorHint?: string;
  errorDetails?: string;
  /** Arbitrary extra data for debugging */
  extra?: Record<string, unknown>;
}

const SEVERITY_MAP: Record<string, Sentry.SeverityLevel> = {
  warning: 'warning',
  error: 'error',
  critical: 'fatal',
};

/**
 * Log an error to both Sentry and the error_logs table from server actions.
 *
 * Sentry is already initialized via instrumentation.ts, but handled errors
 * (caught + returned as {success: false}) never reach it automatically.
 * This explicitly captures them with full context.
 *
 * Fire-and-forget: never throws, never blocks the caller.
 */
export async function logServerError(
  message: string,
  context: RoundErrorContext,
  severity: 'warning' | 'error' | 'critical' = 'error'
): Promise<void> {
  // 1. Send to Sentry with rich context
  try {
    Sentry.withScope((scope) => {
      scope.setLevel(SEVERITY_MAP[severity] || 'error');

      // Tag for easy filtering in Sentry dashboard
      scope.setTag('action', context.action);
      scope.setTag('error_source', 'server_action');
      if (context.errorCode) scope.setTag('pg_error_code', context.errorCode);

      // User context so Sentry groups by user
      if (context.userId || context.userEmail) {
        scope.setUser({
          id: context.userId || undefined,
          email: context.userEmail || undefined,
        });
      }

      // Structured extra data for the Sentry event detail view
      scope.setContext('round', {
        roundId: context.roundId,
        playerId: context.playerId,
        holesCount: context.holesCount,
        shotsCount: context.shotsCount,
      });
      scope.setContext('postgres_error', {
        code: context.errorCode,
        hint: context.errorHint,
        details: context.errorDetails,
      });
      if (context.extra) {
        scope.setContext('extra', context.extra);
      }

      // Set fingerprint so Sentry groups by action + error code, not stack
      scope.setFingerprint([context.action, context.errorCode || 'unknown']);

      Sentry.captureException(new Error(message));
    });
  } catch {
    // Sentry failure should never block the rest of error logging
  }

  // 2. Also persist to error_logs table for in-app admin dashboard
  try {
    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from('error_logs').insert({
      message: message.slice(0, 2000),
      severity,
      stack: new Error().stack?.slice(0, 8000) || null,
      context: JSON.parse(JSON.stringify(context)),
      user_id: context.userId || null,
      url: `/golf/actions/${context.action}`,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Last-resort console log — this is the error logger itself failing
    console.error('[ServerErrorLogger] Failed to log error:', message, context);
  }
}

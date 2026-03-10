'use server';

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

/**
 * Log an error directly to the error_logs table from server actions.
 *
 * Unlike the client-side logError (which relies on window/fetch/Sentry),
 * this writes directly to Supabase via the admin client — so it works
 * in server actions where window is undefined.
 *
 * Fire-and-forget: never throws, never blocks the caller.
 */
export async function logServerError(
  message: string,
  context: RoundErrorContext,
  severity: 'warning' | 'error' | 'critical' = 'error'
): Promise<void> {
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

/**
 * Admin Event Logger (Server-Side)
 * 
 * Use this to log events from server actions, API routes, and server components.
 * Events are stored in admin_events table and streamed via Supabase Realtime.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { shouldPersistAdminTables, getRuntimeEnv } from '@/lib/telemetry-gate';
import type { FeatureKey } from '@/lib/admin/feature-registry';

// ============================================
// TYPES
// ============================================

export type AdminEventType =
  | 'error'           // Application errors
  | 'signup'          // New user registrations
  | 'login'           // User logins
  | 'round_submitted' // Golf round submissions
  | 'ai_generation'   // CoachHelm AI generations
  | 'feature_use'     // Feature usage tracking
  | 'onboarding'      // Onboarding milestones
  | 'security'        // Security events (failed logins, etc.)
  | 'system'          // System events (deployments, maintenance)
  | 'subscription'    // Subscription/billing events
  | 'api';            // API events

export type AdminEventSeverity = 'info' | 'warning' | 'error' | 'critical';

interface AdminEventInput {
  eventType: AdminEventType;
  title: string;
  severity?: AdminEventSeverity;
  message?: string;
  metadata?: Record<string, unknown>;
  userId?: string;
  userEmail?: string;
  url?: string;
  stackTrace?: string;
  browserInfo?: Record<string, unknown>;
  sport?: 'golf' | 'baseball' | 'shared';
  teamId?: string | null;
  fingerprint?: string;
  source?: string;
  /** Helm Bridge: canonical feature key (src/lib/admin/feature-registry.ts). */
  feature?: FeatureKey | string | null;
}


// ============================================
// MAIN LOGGER
// ============================================

/**
 * Log an admin event to the database
 * Uses service role to bypass RLS
 */
async function logAdminEvent(input: AdminEventInput): Promise<string | null> {
  // Off-prod runtimes (CI dev servers, local dev/next start, preview builds)
  // hold prod Supabase creds — keep their telemetry out of the prod feed.
  if (!shouldPersistAdminTables()) {
    console.info(`[AdminLogger] ${input.eventType} not persisted off-prod (set ADMIN_EVENTS_FORCE_CAPTURE=1 to override)`);
    return null;
  }
  try {
    const adminDb = createAdminClient();
    
    type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
    const { data, error } = await adminDb
      .from('admin_events')
      .insert({
        event_type: input.eventType as string,
        title: input.title,
        severity: (input.severity ?? 'info') as 'info' | 'warning' | 'error' | 'critical',
        message: input.message ?? null,
        // Only reached when shouldPersistAdminTables() is true, so this is
        // always 'production' in practice — tagged explicitly so a future
        // gate regression is visible in the row itself.
        metadata: { ...(input.metadata ?? {}), runtimeEnv: getRuntimeEnv() } as Json,
        user_id: input.userId ?? null,
        user_email: input.userEmail ?? null,
        url: input.url ?? null,
        stack_trace: input.stackTrace ?? null,
        browser_info: (input.browserInfo ?? null) as Json,
        sport: input.sport ?? null,
        team_id: input.teamId ?? null,
        fingerprint: input.fingerprint ?? null,
        source: input.source ?? null,
        feature: input.feature ?? null,
      })
      .select('id')
      .single();

    if (error) {
      // Suppress the missing-table error in dev. Some Supabase projects
      // (local stubs, branch envs, freshly-cloned dashboards) haven't run
      // the admin_events migration yet — when that happens, every page
      // visit floods the console with the same PGRST205 schema-cache
      // error. We log it once so it's discoverable, then silently fail.
      if (error.code === 'PGRST205') {
        if (!hasWarnedAdminEventsMissing) {
          console.warn(
            '[AdminLogger] admin_events table not found — skipping event logging. ' +
              'Run supabase migration 20260214220000_create_admin_events.sql to enable.',
          );
          hasWarnedAdminEventsMissing = true;
        }
        return null;
      }
      console.error('[AdminLogger] Failed to log event:', error);
      return null;
    }

    return data?.id ?? null;
  } catch (err) {
    console.error('[AdminLogger] Error logging event:', err);
    return null;
  }
}

let hasWarnedAdminEventsMissing = false;

// ============================================
// ERROR HELPERS
// ============================================

// ============================================
// EVENT HELPERS
// ============================================

/**
 * Log a user signup event
 */
export async function logSignup(
  userId: string,
  userEmail: string,
  role: 'coach' | 'player',
  metadata?: Record<string, unknown>
): Promise<string | null> {
  const sport = metadata?.sport as 'golf' | 'baseball' | 'shared' | undefined;
  return logAdminEvent({
    eventType: 'signup',
    title: `New ${role} signed up`,
    severity: 'info',
    message: `${userEmail} registered as ${role}`,
    userId,
    userEmail,
    metadata: { role, ...metadata },
    source: 'auth',
    sport,
  });
}

/**
 * Log a user login event
 */
export async function logLogin(
  userId: string,
  userEmail: string,
  metadata?: Record<string, unknown>
): Promise<string | null> {
  const sport = metadata?.sport as 'golf' | 'baseball' | 'shared' | undefined;
  return logAdminEvent({
    eventType: 'login',
    title: 'User logged in',
    severity: 'info',
    userId,
    userEmail,
    metadata,
    source: 'auth',
    sport,
  });
}

/**
 * Log a round submission
 */
export async function logRoundSubmitted(
  userId: string,
  userEmail: string,
  roundId: string,
  metadata?: Record<string, unknown>
): Promise<string | null> {
  return logAdminEvent({
    eventType: 'round_submitted',
    title: 'Round submitted',
    severity: 'info',
    userId,
    userEmail,
    metadata: { roundId, ...metadata },
  });
}

/**
 * Log AI generation event
 */
export async function logAIGeneration(
  userId: string,
  userEmail: string,
  generationType: string,
  success: boolean,
  metadata?: Record<string, unknown>
): Promise<string | null> {
  return logAdminEvent({
    eventType: 'ai_generation',
    title: success ? `AI ${generationType} completed` : `AI ${generationType} failed`,
    severity: success ? 'info' : 'warning',
    userId,
    userEmail,
    metadata: { generationType, success, ...metadata },
  });
}

/**
 * Log security event.
 *
 * `userId` attributes the event to the person the action was TAKEN ON (e.g.
 * the target of a revoke/view-as, not necessarily the acting admin) — that's
 * what makes it show up on `/admin/users/[id]` via `fetchUserDetail`'s
 * `.eq('user_id', userId)` filter (`admin_events.user_id`). Optional and
 * additive: every pre-existing 2-3 arg call site (password resets, etc.)
 * still logs exactly as before, just without a user-scoped attribution.
 */
export async function logSecurityEvent(
  title: string,
  severity: AdminEventSeverity,
  metadata?: Record<string, unknown>,
  userId?: string,
): Promise<string | null> {
  return logAdminEvent({
    eventType: 'security',
    title,
    severity,
    metadata,
    userId,
    source: 'auth',
  });
}


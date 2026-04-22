/**
 * Admin Event Logger (Server-Side)
 * 
 * Use this to log events from server actions, API routes, and server components.
 * Events are stored in admin_events table and streamed via Supabase Realtime.
 */

import { createAdminClient } from '@/lib/supabase/admin';

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
}


// ============================================
// MAIN LOGGER
// ============================================

/**
 * Log an admin event to the database
 * Uses service role to bypass RLS
 */
async function logAdminEvent(input: AdminEventInput): Promise<string | null> {
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
        metadata: (input.metadata ?? {}) as Json,
        user_id: input.userId ?? null,
        user_email: input.userEmail ?? null,
        url: input.url ?? null,
        stack_trace: input.stackTrace ?? null,
        browser_info: (input.browserInfo ?? null) as Json,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[AdminLogger] Failed to log event:', error);
      return null;
    }

    return data?.id ?? null;
  } catch (err) {
    console.error('[AdminLogger] Error logging event:', err);
    return null;
  }
}

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
  return logAdminEvent({
    eventType: 'signup',
    title: `New ${role} signed up`,
    severity: 'info',
    message: `${userEmail} registered as ${role}`,
    userId,
    userEmail,
    metadata: { role, ...metadata },
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
  return logAdminEvent({
    eventType: 'login',
    title: 'User logged in',
    severity: 'info',
    userId,
    userEmail,
    metadata,
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
 * Log security event
 */
export async function logSecurityEvent(
  title: string,
  severity: AdminEventSeverity,
  metadata?: Record<string, unknown>
): Promise<string | null> {
  return logAdminEvent({
    eventType: 'security',
    title,
    severity,
    metadata,
  });
}


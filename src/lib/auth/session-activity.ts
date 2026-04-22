/**
 * Session Activity Tracking
 *
 * Tracks user activity and enforces session timeout after 30 minutes of inactivity.
 * Uses cookies to maintain activity timestamp and automatic logout.
 */

'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const ACTIVITY_CHECK_INTERVAL_MS = 60 * 1000; // Check every minute
const COOKIE_NAME = 'last_activity';

/**
 * Get last activity timestamp from cookie
 */
function getLastActivity(): number {
  if (typeof window === 'undefined') return Date.now();

  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === COOKIE_NAME && value) {
      const timestamp = parseInt(value, 10);
      return isNaN(timestamp) ? Date.now() : timestamp;
    }
  }
  return Date.now();
}

/**
 * Update last activity timestamp in cookie
 */
function updateLastActivity(): void {
  if (typeof window === 'undefined') return;

  const now = Date.now();
  const expires = new Date(now + SESSION_TIMEOUT_MS).toUTCString();

  document.cookie = `${COOKIE_NAME}=${now}; path=/; expires=${expires}; SameSite=Strict; Secure`;
}

/**
 * Clear activity tracking cookie
 */
function clearLastActivity(): void {
  if (typeof window === 'undefined') return;

  document.cookie = `${COOKIE_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

/**
 * Check if session has timed out
 */
function isSessionTimedOut(): boolean {
  const lastActivity = getLastActivity();
  const now = Date.now();
  const inactiveMs = now - lastActivity;

  return inactiveMs >= SESSION_TIMEOUT_MS;
}

/**
 * React hook for automatic session timeout and activity tracking
 *
 * Usage:
 * ```tsx
 * function MyComponent() {
 *   useSessionActivity();
 *   return <div>...</div>;
 * }
 * ```
 */
export function useSessionActivity() {
  const router = useRouter();
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const supabase = createClient();

  const handleLogout = useCallback(async () => {
    console.warn('[Session] Session timeout - logging out');

    // Clear activity cookie
    clearLastActivity();

    // Sign out from Supabase
    await supabase.auth.signOut();

    // Redirect to login with timeout message
    const sport = window.location.pathname.startsWith('/golf') ? 'golf' : 'baseball';
    router.push(`/${sport}/login?message=Session expired due to inactivity. Please log in again.`);
  }, [router, supabase]);

  const checkSessionTimeout = useCallback(async () => {
    if (isSessionTimedOut()) {
      await handleLogout();
    }
  }, [handleLogout]);

  const updateActivity = useCallback(() => {
    updateLastActivity();
  }, []);

  useEffect(() => {
    // Initialize activity tracking
    updateActivity();

    // Set up periodic timeout check
    checkIntervalRef.current = setInterval(checkSessionTimeout, ACTIVITY_CHECK_INTERVAL_MS);

    // Track user activity events
    const activityEvents = [
      'mousedown',
      'mousemove',
      'keydown',
      'scroll',
      'touchstart',
      'click',
    ];

    // Throttle activity updates to avoid excessive cookie writes
    let lastUpdate = Date.now();
    const throttleMs = 10 * 1000; // Update at most every 10 seconds

    const handleActivity = () => {
      const now = Date.now();
      if (now - lastUpdate >= throttleMs) {
        updateActivity();
        lastUpdate = now;
      }
    };

    activityEvents.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    // Cleanup
    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
      activityEvents.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [updateActivity, checkSessionTimeout]);

  // Check for session timeout on mount
  useEffect(() => {
    checkSessionTimeout();
  }, [checkSessionTimeout]);

  return null;
}


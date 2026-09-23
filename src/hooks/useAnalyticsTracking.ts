'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * A random suffix for the client-side analytics session id.
 *
 * js/insecure-randomness (#102, #103): `Math.random()` is not
 * cryptographically secure and CodeQL flags any value derived from it that
 * later flows into a session/identifier context (`getSessionId`'s two call
 * sites) as a security-sensitive use of insecure randomness — this value is
 * only ever used to correlate analytics rows for one browser tab, never for
 * anything auth-relevant, but `crypto.getRandomValues` is free here and
 * removes the finding at its source instead of arguing the severity.
 */
export function randomSuffix(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 7);
}

// Generate a session ID that persists across page navigations
function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  let sid = sessionStorage.getItem('helm_session_id');
  if (!sid) {
    sid = `${Date.now()}-${randomSuffix()}`;
    sessionStorage.setItem('helm_session_id', sid);
  }
  return sid;
}

export function useAnalyticsTracking() {
  const pathname = usePathname();
  const lastPathRef = useRef<string>('');
  const sessionStartRef = useRef<number>(Date.now());

  useEffect(() => {
    // Track page view on path change
    if (pathname === lastPathRef.current) return;
    lastPathRef.current = pathname;

    const supabase = createClient();
    const sessionId = getSessionId();

    // Fire and forget - don't block the UI
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from as any)('admin_analytics_events').insert({
        user_id: user.id,
        event_type: 'page_view',
        page_path: pathname,
        session_id: sessionId,
        metadata: { referrer: typeof document !== 'undefined' ? document.referrer : null },
      }).then(() => {});  // ignore result
    });
  }, [pathname]);

  // Track feature usage (call this from components)
  const trackFeature = (featureName: string, metadata?: Record<string, unknown>) => {
    const supabase = createClient();
    const sessionId = getSessionId();

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from as any)('admin_analytics_events').insert({
        user_id: user.id,
        event_type: 'feature_use',
        feature_name: featureName,
        page_path: lastPathRef.current,
        session_id: sessionId,
        metadata: metadata ?? {},
      }).then(() => {});
    });
  };

  // Suppress unused ref warning - sessionStartRef reserved for future duration tracking
  void sessionStartRef;

  return { trackFeature };
}

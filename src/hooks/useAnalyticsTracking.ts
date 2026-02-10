'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// Generate a session ID that persists across page navigations
function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  let sid = sessionStorage.getItem('helm_session_id');
  if (!sid) {
    sid = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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

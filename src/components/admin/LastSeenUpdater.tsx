'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Silent component that updates the user's last_seen timestamp.
 * Debounced to max once per 5 minutes (handled by the DB function).
 * Mount in authenticated layouts.
 */
export function LastSeenUpdater() {
  const hasFired = useRef(false);

  useEffect(() => {
    if (hasFired.current) return;
    hasFired.current = true;

    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      (supabase.rpc as unknown as (fn: string, params: Record<string, string>) => Promise<unknown>)('update_user_last_seen', { target_user_id: user.id }).catch(() => {
        // Silently fail
      });
    });
  }, []);

  return null;
}

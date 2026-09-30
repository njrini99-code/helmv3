'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { chReport } from '../../lib/track';

/**
 * "Updates as rounds are signed": while a qualifier is live, a signed round
 * re-reads the page on the server (router.refresh), so the standings stay the
 * loader's, never a second client copy. RLS scopes the realtime feed like
 * every other read. A burst of changes becomes one refresh.
 */
export function useLiveStandings(qualifierId: string, enabled: boolean): void {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    let timer: number | undefined;
    const sb = createClient();
    const channel = sb
      .channel(`ch-qualifier-${qualifierId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'golf_rounds', filter: `qualifier_id=eq.${qualifierId}` }, () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => router.refresh(), 800);
      })
      .subscribe((status) => {
        // A dropped feed is reported, not shown: the page still has the standings it loaded, and a reload refreshes them.
        if (status === 'CHANNEL_ERROR') chReport(new Error('qualifier realtime channel error'), { surface: 'qualifiers.live', severity: 'low' });
      });
    return () => {
      window.clearTimeout(timer);
      void sb.removeChannel(channel);
    };
  }, [qualifierId, enabled, router]);
}

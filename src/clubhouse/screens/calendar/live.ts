'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { channelDropReporter } from '../../live/channel';

/** A burst of changes (a series saved, a sync of classes) becomes one re-read. */
export const CAL_LIVE_DEBOUNCE_MS = 800;

/**
 * The calendar follows the team's events as production's does (use-calendar-range-events.ts): one channel on
 * `golf_events` for the team, every change re-reads the page on the server (router.refresh, so the screen is always
 * the loader's, never a second client copy), and so does a reconnect after the feed dropped, since changes may have
 * been missed meanwhile. RLS scopes the feed like every other read. A feed that stays down is reported, once per outage
 * (channelDropReporter); the page still reads
 * on every change of the viewer's own and on Try again.
 */
export function useCalendarLive(teamId: string, enabled: boolean): void {
  const router = useRouter();
  useEffect(() => {
    if (!enabled || !teamId) return;
    let alive = true;
    let timer: number | undefined;
    let subscribed = false;
    const reread = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => router.refresh(), CAL_LIVE_DEBOUNCE_MS);
    };
    const reportDrop = channelDropReporter('calendar realtime channel error', 'calendar.live');
    const sb = createClient();
    const channel = sb
      .channel(`ch-calendar-${teamId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'golf_events', filter: `team_id=eq.${teamId}` }, reread)
      .subscribe((status) => {
        if (!alive) return;
        reportDrop(status);
        if (status === 'SUBSCRIBED') {
          if (subscribed) reread();
          subscribed = true;
        }
      });
    return () => {
      alive = false;
      window.clearTimeout(timer);
      void sb.removeChannel(channel);
    };
  }, [teamId, enabled, router]);
}

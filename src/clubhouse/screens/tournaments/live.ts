'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { chReport } from '../../lib/track';
import { CH_DUR } from '../../lib/motion';

/** A burst of changes (a tournament's three rounds saved together) becomes one re-read, as the calendar's does. */
export const TOUR_HOME_LIVE_DEBOUNCE_MS = 800;

/** Whether a golf_events change is a tournament's: the new or old row is of type tournament (a delete carries old only). */
export function isTournamentChange(payload: { new?: { event_type?: string | null } | null; old?: { event_type?: string | null } | null; eventType?: string }): boolean {
  if (payload.new?.event_type === 'tournament' || payload.old?.event_type === 'tournament') return true;
  // A delete under the default replica identity carries only the old row's key: re-read, since it may have been a round.
  return payload.eventType === 'DELETE';
}

/**
 * P-5 8.7: the season home follows the calendar. One channel on the team's `golf_events` (already in the realtime
 * publication; 4.33's tables stay out of it); a change to a tournament event re-reads the page on the server
 * (router.refresh) after 800 ms, and so does a reconnect. A sibling of 4.33's Broadcast live layer, not part of it.
 */
export function useSeasonHomeLive(teamId: string, enabled: boolean): void {
  const router = useRouter();
  useEffect(() => {
    if (!enabled || !teamId) return;
    let alive = true;
    let timer: number | undefined;
    let subscribed = false;
    const reread = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => router.refresh(), TOUR_HOME_LIVE_DEBOUNCE_MS);
    };
    const sb = createClient();
    const channel = sb
      .channel(`ch-tour-home-${teamId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'golf_events', filter: `team_id=eq.${teamId}` }, (payload) => {
        if (isTournamentChange(payload as never)) reread();
      })
      .subscribe((status) => {
        if (!alive) return;
        if (status === 'SUBSCRIBED') {
          if (subscribed) reread();
          subscribed = true;
        } else if (status === 'CHANNEL_ERROR') {
          chReport(new Error('season home realtime channel error'), { surface: 'tournaments.home.live', severity: 'low' });
        }
      });
    return () => {
      alive = false;
      window.clearTimeout(timer);
      void sb.removeChannel(channel);
    };
  }, [teamId, enabled, router]);
}

/**
 * P-5 M9 (CH-16650, CH-16850): the tournaments that arrived while the page was open. On first paint nothing has
 * arrived (no motion on first paint); afterwards an id not seen before is washed for the reveal duration and said once.
 * The wash is a held class (4.33's `.ch-tour-changed`), not an animation, so reduced motion and Animations off keep the
 * information and lose only the fade.
 */
export function useArrivals(events: ReadonlyArray<{ id: string; name: string }>): { arrived: ReadonlySet<string>; said: string } {
  const seen = useRef<Set<string> | null>(null);
  const [arrived, setArrived] = useState<ReadonlySet<string>>(() => new Set());
  const [said, setSaid] = useState('');
  const key = events.map((e) => e.id).join(',');
  useEffect(() => {
    const ids = new Set(events.map((e) => e.id));
    const before = seen.current;
    seen.current = ids;
    if (!before) return;
    const fresh = events.filter((e) => !before.has(e.id));
    if (!fresh.length) return;
    setArrived(new Set(fresh.map((e) => e.id)));
    setSaid(fresh.length === 1 ? `${fresh[0]!.name} added to your season.` : `${fresh.length} tournaments added to your season.`);
    const t = window.setTimeout(() => setArrived(new Set()), CH_DUR.reveal * 1000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { arrived, said };
}

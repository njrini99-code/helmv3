'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * The inbox's mute glyph (Messages redesign): one read of the viewer's own participant rows, only with the flag on, so flag off runs
 * no new query. The rule is `isConversationMuted`'s (`src/lib/notifications/golf-message-fanout.ts`), kept here because that module
 * holds the service-role fan-out. Null until it lands, and on a failed read: rows then draw no glyph.
 */
export function isMutedRow(row: { notification_level?: string | null; muted_until?: string | null }, now: number = Date.now()): boolean {
  if (row.notification_level !== 'muted') return false;
  if (!row.muted_until) return true;
  const until = Date.parse(row.muted_until);
  return Number.isFinite(until) && until > now;
}

export function useRowMutes(viewerUserId: string, enabled: boolean): { muted: ReadonlySet<string> | null; refresh: () => void } {
  const [muted, setMuted] = useState<ReadonlySet<string> | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void createClient()
      .from('golf_conversation_participants')
      .select('conversation_id, notification_level, muted_until')
      .eq('user_id', viewerUserId)
      .then(({ data, error }) => {
        if (!live || error) return;
        setMuted(new Set((data ?? []).filter((r) => isMutedRow(r)).map((r) => r.conversation_id)));
      });
    return () => {
      live = false;
    };
  }, [enabled, viewerUserId, tick]);
  return { muted, refresh: useCallback(() => setTick((n) => n + 1), []) };
}

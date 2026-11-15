'use client';

import { useEffect, useState } from 'react';
import type { ChatUIMessage } from '@/lib/coachhelm/v3/chat/engine/protocol';
import { restoreUIMessages } from '@/lib/coachhelm/v3/chat/restore';
import type { ChatMessage } from '@/lib/coachhelm/v3/chat/types';
import { formatClock, isoDay } from '../../lib/dates';
import { plural } from '../../lib/plural';

export type QcEarlier = { title: string; line: string; at: string };

/** A conversation's last receipt, as the row shows it. A receipt that didn't land isn't "done earlier". */
export function earlierOf(messages: ReadonlyArray<{ ui_parts?: unknown; created_at?: string }>, at: string, tz?: string): QcEarlier | null {
  for (let m = messages.length - 1; m >= 0; m--) {
    const parts = Array.isArray(messages[m]!.ui_parts) ? (messages[m]!.ui_parts as Array<{ type?: string; data?: unknown }>) : [];
    for (let p = parts.length - 1; p >= 0; p--) {
      if (parts[p]!.type !== 'data-action-receipt') continue;
      const r = parts[p]!.data as { summary?: string; status?: string; notifications?: Array<{ recipients?: number; status?: string }>; } | null;
      if (!r?.summary || r.status === 'failed') return null;
      const told = Math.max(0, ...(r.notifications ?? []).filter((n) => n.status !== 'failed').map((n) => n.recipients ?? 0));
      return { title: r.summary, line: told ? `${plural(told, 'player')} told` : 'Nobody was told', at: formatClock(messages[m]!.created_at ?? at, tz) };
    }
  }
  return null;
}

/** "Earlier today" (06 S-PANEL.hello): the newest chat started today, read on panel open. A failed read leaves the block out. */
export function useEarlierToday(open: boolean, enabled: boolean): QcEarlier | null {
  const [row, setRow] = useState<QcEarlier | null>(null);
  useEffect(() => {
    if (!open || !enabled) return;
    let live = true;
    void (async () => {
      const list = await fetch('/api/coachhelm/v3/chat/conversations').then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const today = isoDay(new Date());
      const first = (list?.conversations as Array<{ id: string; created_at: string }> | undefined)?.find((c) => isoDay(c.created_at) === today);
      if (!first) return;
      const one = await fetch(`/api/coachhelm/v3/chat/conversations/${encodeURIComponent(first.id)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (live && Array.isArray(one?.messages)) setRow(earlierOf(one.messages, first.created_at));
    })();
    return () => {
      live = false;
    };
  }, [open, enabled]);
  return row;
}

/**
 * `ST-9.qc.today.restored`: the newest conversation started today, as the hook's own messages, or null (none today, or
 * the read failed: the empty start, with no error). The list names each conversation's surface (engine E18); a row whose
 * surface is not known yet (null until the held migration is applied) counts, so today's thread is then the newest one
 * started today, as before, and narrows to quick chat's own by itself once the surface is stored.
 */
export async function readTodayThread(now: Date = new Date()): Promise<{ id: string; messages: ChatUIMessage[] } | null> {
  const get = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const list = (await get('/api/coachhelm/v3/chat/conversations')) as { conversations?: Array<{ id: string; created_at: string; surface?: string }> } | null;
  const today = isoDay(now);
  const mine = (list?.conversations ?? []).filter((c) => isoDay(c.created_at) === today && (c.surface == null || c.surface === 'quick_chat'));
  const first = mine[0];
  if (!first) return null;
  const one = (await get(`/api/coachhelm/v3/chat/conversations/${encodeURIComponent(first.id)}`)) as { messages?: ChatMessage[] } | null;
  if (!Array.isArray(one?.messages) || !one.messages.length) return null;
  return { id: first.id, messages: restoreUIMessages(one.messages) };
}

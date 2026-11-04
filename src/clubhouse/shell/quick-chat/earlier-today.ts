'use client';

import { useEffect, useState } from 'react';
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

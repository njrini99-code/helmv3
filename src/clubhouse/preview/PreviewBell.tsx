'use client';

import { useMemo, useState, type ReactNode } from 'react';
import type { UnifiedNotificationItem } from '@/app/golf/actions/unified-notifications-model';
import { BellSourceProvider, type ChBellApi } from '../shell/Bell';

/** A notification feed shaped like the live one, for the dev preview (`?bell=empty|failed|slow`). */
function fixtures(now: number): UnifiedNotificationItem[] {
  const at = (mins: number) => new Date(now - mins * 60000).toISOString();
  const n = (id: string, category: UnifiedNotificationItem['category'], title: string, body: string | null, mins: number, read: boolean): UnifiedNotificationItem => ({
    id,
    source: category === 'events' ? 'golf_calendar_notifications' : 'notifications',
    category,
    title,
    body,
    action_url: null,
    created_at: at(mins),
    read_at: read ? at(mins - 1) : null,
  });
  return [
    n('n1', 'messages', 'Ava Lindqvist in Varsity team', 'Does the bus leave from Finley or the field house?', 9, false),
    n('n2', 'events', 'Eli replied maybe to Course prep · 9 holes', 'Chemistry lab runs until 4:15 on Wednesday.', 52, false),
    n('n3', 'coachhelm', 'Jonah’s approach play has slipped for three rounds', 'Proximity from 125 to 150 yards is up 6 feet since the Wolfpack Classic.', 140, false),
    n('n4', 'tasks', 'Two players have not submitted travel forms', 'Due before the bus leaves Thursday at 6:15.', 60 * 20, true),
    n('n5', 'announcements', 'Qualifier pairings posted', '5 of 6 players acknowledged.', 60 * 26, true),
    n('n6', 'events', 'Round review moved to Friday at 1:00', null, 60 * 72, true),
  ];
}

export function PreviewBell({ state, children }: { state?: string; children: ReactNode }) {
  const [items, setItems] = useState(() => (state === 'empty' ? [] : fixtures(Date.now())));
  const api = useMemo<ChBellApi>(
    () => ({
      unread: items.filter((i) => !i.read_at).length,
      load: async () => {
        await new Promise((r) => setTimeout(r, state === 'slow' ? 60000 : 250));
        return state === 'failed' ? { success: false, error: 'preview' } : { success: true, data: { items } };
      },
      markRead: async (item) => setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, read_at: new Date().toISOString() } : i))),
      markAll: async () => {
        setItems((prev) => prev.map((i) => ({ ...i, read_at: i.read_at ?? new Date().toISOString() })));
        return { success: true };
      },
      refetchCount: () => {},
    }),
    [items, state],
  );
  return <BellSourceProvider api={api}>{children}</BellSourceProvider>;
}

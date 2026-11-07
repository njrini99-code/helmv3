import type { ChClock } from '../../../lib/clock-cookie';
import { dayDiff, parts, clock } from '../model-time';
import type { ChConv } from '../model';

export type ChConvFilter = 'all' | 'unread' | 'groups';

/** Rail time: "2:31 PM", "Yesterday", "Sat", "Oct 8". */
export function railTime(iso: string | null, now: string, timeZone: string, hours: ChClock = '12'): string {
  if (!iso) return '';
  const d = dayDiff(parts(now, timeZone), parts(iso, timeZone));
  if (d <= 0) return clock(iso, timeZone, hours);
  if (d === 1) return 'Yesterday';
  if (d < 7) return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(new Date(iso));
  return new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric' }).format(new Date(iso));
}

/** Whether a conversation reads as unread: something new in it, or marked unread by the viewer. */
export function isUnread(c: Pick<ChConv, 'unread' | 'markedUnread'>): boolean {
  return c.unread > 0 || !!c.markedUnread;
}

export function filterConvs(convs: ChConv[], filter: ChConvFilter, q: string): ChConv[] {
  const s = q.trim().toLowerCase();
  return convs.filter((c) => (filter === 'unread' ? isUnread(c) : filter === 'groups' ? c.group : true) && (!s || c.title.toLowerCase().includes(s) || c.lastText.toLowerCase().includes(s)));
}

/** The Pinned card's threads (06 S-MSG): the team's channel is always first, then the viewer's own pins, three faces in all. */
export function pinnedThreads<T extends { id: string; channel?: boolean }>(convs: readonly T[], pinIds: readonly string[]): T[] {
  const channel = convs.find((c) => c.channel);
  const own = pinIds.map((id) => convs.find((c) => c.id === id)).filter((c): c is T => !!c && c !== channel);
  return (channel ? [channel, ...own] : own).slice(0, 3);
}

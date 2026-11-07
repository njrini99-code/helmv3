import type { ChClock } from '../../../lib/clock-cookie';
import { dayDiff, parts, clock } from '../model-time';
import type { ChConv } from '../model';
import { firstName } from '../../../lib/names';
import { PIN_LIMIT, type ChPins } from '../pinned';

export type ChConvFilter = 'all' | 'unread' | 'groups';

/** The three filters, in the order the well draws them (MSG-104). */
export const INBOX_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'groups', label: 'Groups' },
] as const satisfies ReadonlyArray<{ value: ChConvFilter; label: string }>;

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

/**
 * The pins as the menus and tiles see them (Q-11): the team's channel is always pinned, first, and takes one of the three
 * places, so with a channel on screen a person has two of their own to give. The channel itself has no Pin or Unpin; at
 * the limit, Pin is dimmed and a tap changes nothing. Without a channel the pins are returned as they were.
 */
export function pinsWithChannel(pins: ChPins | undefined, convs: readonly { id: string; channel?: boolean }[]): ChPins | undefined {
  const channel = convs.find((c) => c.channel);
  if (!pins || !channel) return pins;
  const own = pins.ids.filter((id) => id !== channel.id);
  const atLimit = pins.atLimit || own.length >= PIN_LIMIT - 1;
  return {
    ids: pins.ids,
    has: (id) => id === channel.id || pins.has(id),
    atLimit,
    toggle: (id) => {
      if (id === channel.id) return;
      if (atLimit && !pins.has(id)) return;
      pins.toggle(id);
    },
  };
}

/** The Pinned card's tile label (MSG-105): the channel is "Team", a group its name, a person their first name. */
export function pinLabel(c: Pick<ChConv, 'title' | 'group' | 'channel'>): string {
  return c.channel ? 'Team' : c.group ? c.title : firstName(c.title);
}

/**
 * The line a pin's bubblet says (MSG-106): the latest message when someone else sent it, in a direct thread or a group,
 * with no sender prefix; nothing when it is the viewer's own or there is none.
 */
export function bubbletLine(c: Pick<ChConv, 'lastText' | 'lastSenderId'>, viewerId: string): string | null {
  const text = c.lastText.replace(/^Poll: /, '').trim();
  if (!text || c.lastSenderId === viewerId) return null;
  return text;
}

/** What a filter or a search that lists nothing says (MSG-108, MSG-115): the body under the Recent card's "Nothing here" header. */
export function nothingHere(filter: ChConvFilter, q: string): string {
  const term = q.trim();
  if (term) return `No results for “${term}”`;
  return filter === 'unread' ? 'No unread conversations right now.' : filter === 'groups' ? 'No groups right now.' : 'No conversations right now.';
}

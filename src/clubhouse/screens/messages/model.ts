/**
 * Messages view model. Everything the screen renders goes through these
 * shapes, so the live container (realtime hooks) and the dev preview
 * (fixtures) drive the same view. All times format in one explicit zone, so
 * server and client render the same labels.
 */

import type { GolfAnnouncementMeta } from '@/lib/types/golf';
import type { Poll } from '@/lib/golf/message-polls';
import type { ChClock } from '../../lib/clock-cookie';

export interface ChPerson {
  userId: string;
  name: string;
  role: 'coach' | 'player';
  subtitle: string;
  /** golf_players.id, for links to the player's stats. */
  playerId: string | null;
}

export interface ChConv {
  id: string;
  group: boolean;
  title: string;
  subtitle: string;
  /** Other participants' user ids (groups), or the one other person (direct). */
  memberIds: string[];
  memberCount: number;
  unread: number;
  /**
   * Marked unread from the row menu or a swipe (owner decision 14). The database has no per-person unread flag, so the
   * mark is this device's own (marked-unread.ts) and opening or marking the conversation read clears it.
   */
  markedUnread?: boolean;
  lastAt: string | null;
  lastSenderId: string | null;
  lastText: string;
  /** The last message is a poll's plain-text copy (`isPollFallbackText`): the row shows its glyph and question. */
  lastIsPoll?: boolean;
  creatorId: string | null;
}

export interface ChMsg {
  id: string;
  senderId: string;
  text: string;
  at: string;
  mine: boolean;
  /** The other side has read it (direct threads). */
  seen: boolean;
  failed: 'refused' | 'unknown' | null;
  edited: boolean;
  deleted: boolean;
  hasAttachments: boolean;
  /** Persisted parent in this conversation; content is read only from loaded messages. */
  replyToId?: string | null;
  /** A poll (kind 'poll' with a payload we can draw); its `text` is then the plain-text copy, never shown in the card. */
  poll?: Poll | null;
  /** Still sending: the server hasn't confirmed it, so it carries no receipt (P-1). */
  pending?: boolean;
}

/** P-1 Seen by: every member's last_read_at in the open conversation, from the messages hook. */
export interface ChReceipts {
  status: 'loading' | 'ready' | 'error';
  marks: ReadonlyMap<string, string | null>;
  retry: () => void;
}

export interface ChAttachment {
  id: string;
  name: string;
  size: number;
  mime: string;
  url: string | null;
}

export type ChReactionKey = 'Like' | 'Love' | 'Laugh' | 'Celebrate' | 'Surprised' | 'Thanks';
export interface ChReaction {
  key: ChReactionKey;
  count: number;
  mine: boolean;
  /** Who reacted (auth user ids), for the card a click on the chip opens; the preview omits it. */
  userIds?: string[];
}

export interface ChMember {
  userId: string;
  name: string;
  subtitle: string;
  role: 'coach' | 'player' | 'member';
}

export type ChConvFilter = 'all' | 'unread' | 'groups';

function parts(iso: string, timeZone: string) {
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso))) p[x.type] = x.value;
  return `${p.year}-${p.month}-${p.day}`;
}
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400000);

export function clock(iso: string, timeZone: string, hours: ChClock = '12'): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: hours === '24' ? '2-digit' : 'numeric', minute: '2-digit', ...(hours === '24' ? { hourCycle: 'h23' as const } : {}) }).format(new Date(iso));
}

/** Rail time: "2:31 PM", "Yesterday", "Sat", "Oct 8". */
export function railTime(iso: string | null, now: string, timeZone: string, hours: ChClock = '12'): string {
  if (!iso) return '';
  const d = dayDiff(parts(now, timeZone), parts(iso, timeZone));
  if (d <= 0) return clock(iso, timeZone, hours);
  if (d === 1) return 'Yesterday';
  if (d < 7) return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(new Date(iso));
  return new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric' }).format(new Date(iso));
}

/** Day separators in a thread: "Today", "Yesterday", "Saturday", "Oct 8". */
export function dayLabel(iso: string, now: string, timeZone: string): string {
  const d = dayDiff(parts(now, timeZone), parts(iso, timeZone));
  if (d <= 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7) return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(new Date(iso));
  return new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric' }).format(new Date(iso));
}

/**
 * A future day, for "Muted until …": "today", "tomorrow", "Friday" within the week, then "Oct 25". A week from now is a
 * date, never a weekday: that weekday is also today's.
 */
export function untilLabel(iso: string, now: string, timeZone: string): string {
  const d = dayDiff(parts(iso, timeZone), parts(now, timeZone));
  if (d <= 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d < 7) return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(new Date(iso));
  return new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric' }).format(new Date(iso));
}

export function sectionOf(iso: string | null, now: string, timeZone: string): 'today' | 'week' | 'earlier' {
  if (!iso) return 'earlier';
  const d = dayDiff(parts(now, timeZone), parts(iso, timeZone));
  return d <= 0 ? 'today' : d < 7 ? 'week' : 'earlier';
}

export type ChThreadItem =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'msg'; key: string; m: ChMsg; first: boolean; last: boolean };

/** Day separators, and runs of messages from one sender within five minutes grouped as one block. */
export function threadItems(msgs: ChMsg[], now: string, timeZone: string): ChThreadItem[] {
  const out: ChThreadItem[] = [];
  let day = '';
  msgs.forEach((m, i) => {
    const d = parts(m.at, timeZone);
    if (d !== day) {
      day = d;
      out.push({ kind: 'day', key: `d${d}`, label: dayLabel(m.at, now, timeZone) });
    }
    const prev = msgs[i - 1];
    const next = msgs[i + 1];
    const near = (a?: ChMsg, b?: ChMsg) => !!a && !!b && a.senderId === b.senderId && parts(a.at, timeZone) === parts(b.at, timeZone) && Math.abs(Date.parse(b.at) - Date.parse(a.at)) < 5 * 60000;
    out.push({ kind: 'msg', key: m.id, m, first: !near(prev, m), last: !near(m, next) });
  });
  return out;
}

/** Whether a conversation reads as unread: something new in it, or marked unread by the viewer. */
export function isUnread(c: Pick<ChConv, 'unread' | 'markedUnread'>): boolean {
  return c.unread > 0 || !!c.markedUnread;
}

export function filterConvs(convs: ChConv[], filter: ChConvFilter, q: string): ChConv[] {
  const s = q.trim().toLowerCase();
  return convs.filter((c) => (filter === 'unread' ? isUnread(c) : filter === 'groups' ? c.group : true) && (!s || c.title.toLowerCase().includes(s) || c.lastText.toLowerCase().includes(s)));
}

export { firstName } from '../../lib/names';

/**
 * Where the "New" divider goes when a thread opens: the earliest of the last `unread` messages someone else sent. Null
 * with nothing unread.
 */
export function firstUnreadId(msgs: readonly ChMsg[], unread: number): string | null {
  if (unread <= 0) return null;
  let left = unread;
  let id: string | null = null;
  for (let i = msgs.length - 1; i >= 0 && left > 0; i--) {
    const m = msgs[i]!;
    if (m.mine) continue;
    id = m.id;
    left--;
  }
  return id;
}

/** A search hit's text cut to show its match: a little before it, the match itself, and the rest. */
export function searchSnippet(text: string, term: string, lead = 24): { before: string; match: string; after: string } {
  const at = term ? text.toLowerCase().indexOf(term.toLowerCase()) : -1;
  if (at < 0) return { before: text, match: '', after: '' };
  const from = Math.max(0, at - lead);
  // Start on a word where one is near, so the cut doesn't open mid-word.
  const space = from > 0 ? text.indexOf(' ', from) : -1;
  const start = from > 0 && space >= 0 && space < at ? space + 1 : from;
  return { before: (start > 0 ? '…' : '') + text.slice(start, at), match: text.slice(at, at + term.length), after: text.slice(at + term.length) };
}

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi;

/**
 * A message's text split into plain runs and web links. Only http and https are links; trailing punctuation stays text
 * ("see https://x.org." links https://x.org), and so does a closing bracket the link didn't open.
 */
export function linkParts(text: string): Array<string | { href: string; text: string }> {
  const out: Array<string | { href: string; text: string }> = [];
  let last = 0;
  for (const found of text.matchAll(URL_RE)) {
    let raw = found[0];
    for (;;) {
      const end = raw.at(-1);
      if (end && '.,;:!?\'"'.includes(end)) raw = raw.slice(0, -1);
      else if (end && ')]}'.includes(end) && raw.split(end).length > raw.split({ ')': '(', ']': '[', '}': '{' }[end]!).length) raw = raw.slice(0, -1);
      else break;
    }
    let href: string | null = null;
    try {
      const u = new URL(raw);
      if (u.protocol === 'http:' || u.protocol === 'https:') href = u.href;
    } catch {
      href = null;
    }
    if (!href) continue;
    const at = found.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    out.push({ href, text: raw });
    last = at + raw.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export interface ChSearchHit {
  messageId: string;
  conversationId: string;
  conversationName: string;
  senderName: string;
  text: string;
  at: string | null;
}

export interface ChAnnouncement {
  id: string;
  title: string;
  body: string;
  urgent: boolean;
  publishedAt: string | null;
  requiresAck: boolean;
  ackCount: number;
  total: number;
  /** Player view: whether this player has acknowledged. */
  acknowledgedByMe: boolean;
  taskCount: number;
  completedTaskCount: number;
  docCount: number;
  /** golf_coaches.id of the coach who posted it, for the signature; null when unknown. */
  authorId?: string | null;
}

/** One announcement row from getAnnouncementsWithMeta, as the inbox shows it (the server route and the client share it). */
export function toChAnnouncement(a: GolfAnnouncementMeta): ChAnnouncement {
  return {
    id: a.id,
    title: a.title,
    body: a.body ?? '',
    urgent: a.urgency === 'urgent' || a.urgency === 'high',
    publishedAt: a.published_at ?? a.publish_at ?? a.created_at,
    requiresAck: !!a.requires_acknowledgement,
    ackCount: a.acknowledged_count ?? 0,
    total: a.total_recipients ?? a.recipient_count ?? 0,
    acknowledgedByMe: !!a.has_player_acknowledged,
    taskCount: a.task_count ?? 0,
    completedTaskCount: a.completed_task_count ?? 0,
    docCount: a.document_count ?? 0,
    authorId: (a as { created_by?: string | null }).created_by ?? null,
  };
}

export interface ChAnnouncementDetail {
  id: string;
  acknowledged: Array<{ playerId: string; name: string; at: string }>;
  waiting: Array<{ playerId: string; name: string }>;
  tasks: Array<{ taskId: string; title: string; due: string | null; doneByMe: boolean; done: number; total: number }>;
  /**
   * `url` is the stored `file_url`, which points at the private documents bucket and never opens (Fairway #1259): the
   * live pane opens a file through `api.openAnnouncementDocument` (a signed link per tap) instead.
   */
  documents: Array<{ id: string; title: string; url?: string; size: number }>;
}

/** The server's limit on a message (sendMessageSchema `content.max(5000)`); the fields stop there, as Fairway's do. */
export const MESSAGE_MAX = 5000;

/**
 * A coach's new group is created as a team broadcast, which adds the chosen players and, given none, every player on
 * the team (`createGolfTeamBroadcast`). Coaches join it after (D-45), so a group of coaches alone would reach the whole
 * team: it needs at least one player, as Fairway's group sheet asks.
 */
export const groupLacksPlayer = (role: 'coach' | 'player', to: readonly string[], directory: readonly ChPerson[]) =>
  role === 'coach' && to.length > 0 && !to.some((id) => directory.some((p) => p.userId === id && p.role === 'player' && !!p.playerId));

/** A file shared in a conversation (getGolfConversationFiles; no storage path). Open it through its message's attachments. */
export interface ChFile {
  id: string;
  messageId: string;
  name: string;
  size: number;
  mime: string;
  sentAt: string | null;
  senderId: string | null;
}

export interface ChMute {
  muted: boolean;
  until: string | null;
}

/** An announcement still needs this player when it asks for acknowledgement and they haven't given it. */
export const needsMyAck = (a: ChAnnouncement, role: 'coach' | 'player') => role === 'player' && a.requiresAck && !a.acknowledgedByMe;

/**
 * Messages view model. Everything the screen renders goes through these
 * shapes, so the live container (realtime hooks) and the dev preview
 * (fixtures) drive the same view. All times format in one explicit zone, so
 * server and client render the same labels.
 */

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
  lastAt: string | null;
  lastSenderId: string | null;
  lastText: string;
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

export function clock(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

/** Rail time: "2:31 PM", "Yesterday", "Sat", "Oct 8". */
export function railTime(iso: string | null, now: string, timeZone: string): string {
  if (!iso) return '';
  const d = dayDiff(parts(now, timeZone), parts(iso, timeZone));
  if (d <= 0) return clock(iso, timeZone);
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

export function filterConvs(convs: ChConv[], filter: ChConvFilter, q: string): ChConv[] {
  const s = q.trim().toLowerCase();
  return convs.filter((c) => (filter === 'unread' ? c.unread > 0 : filter === 'groups' ? c.group : true) && (!s || c.title.toLowerCase().includes(s) || c.lastText.toLowerCase().includes(s)));
}

export const firstName = (name: string) => name.split(/\s+/)[0] ?? name;

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
}

export interface ChAnnouncementDetail {
  id: string;
  acknowledged: Array<{ playerId: string; name: string; at: string }>;
  waiting: Array<{ playerId: string; name: string }>;
  tasks: Array<{ taskId: string; title: string; due: string | null; doneByMe: boolean; done: number; total: number }>;
  documents: Array<{ id: string; title: string; url: string; size: number }>;
}

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

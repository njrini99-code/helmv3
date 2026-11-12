import type { Poll } from '@/lib/golf/message-polls';
import type { GolfAnnouncementMeta } from '@/lib/types/golf';

export interface ChPerson {
  userId: string;
  name: string;
  role: 'coach' | 'player';
  subtitle: string;
  /** The coin's class year (Messages redesign); null for a coach or an unknown year. */
  gradYear?: number | null;
  /** golf_players.id, for links to the player's stats. */
  playerId: string | null;
}

export interface ChConv {
  id: string;
  group: boolean;
  /** The team's channel. With one player on the team it has two members, so `group` alone can't tell it from a DM. */
  channel?: boolean;
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
  /** Messages redesign: the viewer muted this conversation (the row's glyph). Absent with the flag off or before the read lands. */
  muted?: boolean;
}

/**
 * The one-to-one thread with `userId`, if the list holds one: two members, the other being `userId`, and neither a
 * group nor the team's channel. F-0003: a message meant for one person never goes to a channel or group.
 */
export function directWith(convs: readonly ChConv[], userId: string): ChConv | undefined {
  return convs.find((c) => isDirect(c) && c.memberIds[0] === userId);
}

/**
 * Whether an inbox row is a group. The server's `is_group` is the coach-made group flag (`is_team_chat`), so a coach
 * group that has only two members (one player so far, or after a removal) is still a group and not a direct thread:
 * messaging that player must not reuse it (audit L4, the server's F-0003 rule). Three or more members is a group
 * whatever the flag says; a row with no count falls back to the flag.
 */
export function isGroupRow(c: { is_group?: boolean | null; participant_count?: number | null; participant_ids?: readonly string[] | null }): boolean {
  if (c.is_group) return true;
  const n = c.participant_count ?? c.participant_ids?.length ?? 0;
  return n > 2;
}

/**
 * A two-person thread stored as a team chat and named for one of the two (a coach's broadcast to one player carries `is_team_chat`
 * and that player's name). It is a one-to-one thread: each side sees the other person. A coach's group with its own name that happens
 * to hold one player stays a group (audit L4), and so does the team's channel.
 */
export function isNamedForOneOfTwo(
  c: { is_team_channel?: boolean | null; title?: string | null; participant_count?: number | null; participant_ids?: readonly string[] | null },
  names: ReadonlyArray<string | null | undefined>,
): boolean {
  if (c.is_team_channel) return false;
  if ((c.participant_count ?? c.participant_ids?.length ?? 0) !== 2) return false;
  const title = c.title?.trim().toLowerCase();
  if (!title) return true;
  return names.some((n) => n?.trim().toLowerCase() === title);
}

/** A one-to-one thread: not a group, not the channel, two members. */
export function isDirect(c: ChConv): boolean {
  return !c.group && !c.channel && c.memberCount === 2;
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
  /** P-10: a coach chose to interrupt (Notify anyway) and a push really went out. The caption keys on this, nothing else. */
  notifiedAnyway?: boolean;
  /** A poll (kind 'poll' with a payload we can draw); its `text` is then the plain-text copy, never shown in the card. */
  poll?: Poll | null;
  /** Still sending: the server hasn't confirmed it, so it carries no receipt (P-1). */
  pending?: boolean;
  /** What the attachment is, when the list payload says so, so its frame can be held before the file is signed (MSG-220/221, Q-41). */
  attachmentKind?: 'photo' | 'file' | 'video';
  attachmentWidth?: number;
  attachmentHeight?: number;
  durationSeconds?: number;
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
  /** From `golf_message_attachments.file_type` (image | video | document | audio) and its measured `width`, `height`, `duration_seconds`; null where the upload did not measure. */
  kind?: 'photo' | 'file' | 'video';
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
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

export { firstName } from '../../lib/names';
export { type ChConvFilter, railTime, isUnread, filterConvs, pinnedThreads } from './inbox/model';
export { clock, dayLabel, untilLabel, sectionOf } from './model-time';
export { type ChThreadItem, threadItems, firstUnreadId } from './thread/model';

/**
 * Seen by (premium features P-1, handoff 4.34.1): who in a group thread has seen a message, said on the time line under
 * it. Pure: no React, no Supabase.
 *
 * The rule: a participant has seen a message when their `golf_conversation_participants.last_read_at` is at or after
 * the message's `created_at`. The sender is never counted. Every current participant but the sender is, coaches
 * included; someone who left has no participant row and drops out of both numbers.
 */

/** user id -> last_read_at (null: never opened), for the conversation's current members. */
export type ReadMarks = ReadonlyMap<string, string | null>;

export interface SeenBy {
  /** User ids who have seen it (last_read_at >= created_at). */
  seen: string[];
  /** User ids who haven't, sender excluded. */
  notYet: string[];
  /** seen.length + notYet.length. */
  total: number;
}

const at = (iso: string | null | undefined): number => (iso ? Date.parse(iso) : NaN);

/** The rule. `>=`; the sender is excluded; a member missing from `marks` is not counted. */
export function seenBy(createdAt: string, senderId: string, marks: ReadMarks): SeenBy {
  const sent = at(createdAt);
  const seen: string[] = [];
  const notYet: string[] = [];
  for (const [userId, lastRead] of marks) {
    if (userId === senderId) continue;
    const read = at(lastRead);
    if (Number.isFinite(read) && Number.isFinite(sent) && read >= sent) seen.push(userId);
    else notYet.push(userId);
  }
  return { seen, notYet, total: seen.length + notYet.length };
}

/** "Sent" | "Seen by 4 of 11" | "Seen by everyone". A thread of one (total 0) says nothing. */
export function seenByLabel(s: SeenBy): string | null {
  if (s.total === 0) return null;
  if (s.seen.length === 0) return 'Sent';
  if (s.seen.length >= s.total) return 'Seen by everyone';
  return `Seen by ${s.seen.length} of ${s.total}`;
}

/** The receipt's accessible name (section 7): "Seen by 9 of 11 people. Show who". */
export function seenByAccessibleName(s: SeenBy, canOpen: boolean): string {
  const tail = canOpen ? '. Show who' : '';
  if (s.total === 0) return '';
  if (s.seen.length === 0) return `Sent. Nobody has seen it yet${tail}`;
  if (s.seen.length >= s.total) return `Seen by everyone${tail}`;
  return `Seen by ${s.seen.length} of ${s.total} ${s.total === 1 ? 'person' : 'people'}${tail}`;
}

export interface ReceiptCandidate {
  id: string;
  senderId: string;
  failed?: unknown;
  deleted?: boolean;
  poll?: unknown;
  kind?: string | null;
  pending?: boolean;
}

/**
 * The message that carries the inline receipt: the viewer's newest (scope 'mine') or the thread's newest (scope
 * 'thread', option (c)) message that the server confirmed, not failed, not deleted, not a poll and not a system row.
 * `msgs` is oldest first, as the thread draws them.
 */
export function receiptCarrierId(msgs: ReadonlyArray<ReceiptCandidate>, opts: { viewerId: string; scope: 'mine' | 'thread' }): string | null {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i]!;
    if (opts.scope === 'mine' && m.senderId !== opts.viewerId) continue;
    if (m.pending || m.failed || m.deleted || m.poll || m.kind === 'poll' || m.kind === 'system') continue;
    return m.id;
  }
  return null;
}

/** OQ-67: who sees the count and who opens the list. One constant; the default is (a). */
export type SeenByVisibility = 'sender-and-coaches' | 'coaches-only' | 'everyone';
export const SEEN_BY_VISIBILITY: SeenByVisibility = 'sender-and-coaches';

export interface SeenByAccess {
  /** Draw the label under the carrier. */
  inline: boolean;
  /** Show the count anywhere (inline, the action sheet's preview). */
  count: boolean;
  /** Open the list (sheet or popover). Coaches only; there is no Nudge (owner, 2026-10-25). */
  list: boolean;
}

/** Section 4.2's table. Under 'everyone' the carrier is the thread's newest message (see `receiptCarrierId`). */
export function seenByAccess(v: SeenByVisibility, role: 'coach' | 'player', isMine: boolean): SeenByAccess {
  const coach = role === 'coach';
  if (v === 'everyone') return { inline: true, count: true, list: coach };
  if (v === 'coaches-only') return coach ? { inline: isMine, count: true, list: true } : { inline: false, count: false, list: false };
  if (coach) return { inline: isMine, count: true, list: true };
  return isMine ? { inline: true, count: true, list: false } : { inline: false, count: false, list: false };
}

export interface ReceiptRowInput {
  userId: string;
  name: string;
  role: 'coach' | 'player' | 'member';
  /** last_read_at, clamped to now by the caller. */
  lastOpened: string | null;
  /** First seen, from golf_message_seen_times when the held migration answers. */
  seenAt: string | null;
}

/**
 * The list's order (4.4). Not yet: last opened oldest first, then never opened, then by name. Seen: by seen time,
 * newest first, when times exist, otherwise by name. Coaches sort after players in each section.
 */
export function orderReceiptRows<T extends ReceiptRowInput>(rows: readonly T[], section: 'notYet' | 'seen'): T[] {
  const coachLast = (a: T, b: T) => (a.role === 'coach' ? 1 : 0) - (b.role === 'coach' ? 1 : 0);
  const byName = (a: T, b: T) => a.name.localeCompare(b.name);
  return [...rows].sort((a, b) => {
    const c = coachLast(a, b);
    if (c) return c;
    if (section === 'notYet') {
      const ta = at(a.lastOpened);
      const tb = at(b.lastOpened);
      const fa = Number.isFinite(ta);
      const fb = Number.isFinite(tb);
      if (fa && fb && ta !== tb) return ta - tb;
      if (fa !== fb) return fa ? -1 : 1;
      return byName(a, b);
    }
    const sa = at(a.seenAt);
    const sb = at(b.seenAt);
    const ha = Number.isFinite(sa);
    const hb = Number.isFinite(sb);
    if (ha && hb && sa !== sb) return sb - sa;
    if (ha !== hb) return ha ? -1 : 1;
    return byName(a, b);
  });
}

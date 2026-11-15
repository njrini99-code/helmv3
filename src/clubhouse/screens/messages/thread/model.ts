import type { ChMsg } from '../model';
import { parts, dayLabel } from '../model-time';

export type ChThreadItem =
  | { kind: 'day'; key: string; label: string; at: string }
  | { kind: 'msg'; key: string; m: ChMsg; first: boolean; last: boolean };

/**
 * Day separators, and runs of messages grouped as one block (MSG-205): consecutive messages from one sender on one day,
 * with no gap rule (the artifact's `joins()`), and a poll is never part of a run.
 */
export function threadItems(msgs: ChMsg[], now: string, timeZone: string): ChThreadItem[] {
  const out: ChThreadItem[] = [];
  let day = '';
  msgs.forEach((m, i) => {
    const d = parts(m.at, timeZone);
    if (d !== day) {
      day = d;
      out.push({ kind: 'day', key: `d${d}`, label: dayLabel(m.at, now, timeZone), at: m.at });
    }
    const prev = msgs[i - 1];
    const next = msgs[i + 1];
    const near = (a?: ChMsg, b?: ChMsg) => !!a && !!b && a.senderId === b.senderId && !a.poll && !b.poll && parts(a.at, timeZone) === parts(b.at, timeZone);
    out.push({ kind: 'msg', key: m.id, m, first: !near(prev, m), last: !near(m, next) });
  });
  return out;
}

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

const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}(?:\uFE0F|\u200D|\p{Emoji_Modifier})*|\s){1,3}$/u;

/** MSG-204: one to three emoji and nothing else draws with no bubble, at 40k. */
export function isEmojiOnly(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const count = (t.match(/\p{Extended_Pictographic}/gu) ?? []).length;
  return count > 0 && count <= 3 && EMOJI_ONLY.test(t);
}

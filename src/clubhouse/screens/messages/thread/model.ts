import type { ChMsg } from '../model';
import { parts, dayLabel } from '../model-time';

export type ChThreadItem =
  | { kind: 'day'; key: string; label: string; at: string }
  | { kind: 'msg'; key: string; m: ChMsg; first: boolean; last: boolean };

/** Day separators, and runs of messages from one sender within five minutes grouped as one block. */
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
    const near = (a?: ChMsg, b?: ChMsg) => !!a && !!b && a.senderId === b.senderId && parts(a.at, timeZone) === parts(b.at, timeZone) && Math.abs(Date.parse(b.at) - Date.parse(a.at)) < 5 * 60000;
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

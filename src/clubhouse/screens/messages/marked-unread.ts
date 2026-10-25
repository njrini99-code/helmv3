/**
 * Conversations the viewer marked unread (owner decision 14: Mark as unread in the row menu, and the phone's leading
 * swipe). Golf's unread count is the shared `golf_messages.read` flag, which only a sender may write back (the
 * `golf_messages_update_v2` policy), so un-reading a message would need a schema change the decision rules out. The
 * mark is kept here instead: per signed-in user, in localStorage, so it outlives a reload on this device. Opening the
 * conversation or marking it read clears it.
 *
 * Storage can be absent or refuse writes (private mode, quota): every access is guarded, and the set in memory still
 * works for the visit.
 */
const keyOf = (userId: string) => `ch.msg.unread.${userId}`;

export function readMarkedUnread(userId: string): Set<string> {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(keyOf(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string' && id.length > 0) : []);
  } catch {
    return new Set();
  }
}

export function writeMarkedUnread(userId: string, ids: ReadonlySet<string>): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (ids.size === 0) localStorage.removeItem(keyOf(userId));
    else localStorage.setItem(keyOf(userId), JSON.stringify([...ids]));
  } catch {
    // A refused write keeps the mark for this visit only.
  }
}

/** The set with `id` marked (unread) or cleared (read); the same set when nothing changes. */
export function withMark(ids: ReadonlySet<string>, id: string, unread: boolean): ReadonlySet<string> {
  if (ids.has(id) === unread) return ids;
  const next = new Set(ids);
  if (unread) next.add(id);
  else next.delete(id);
  return next;
}

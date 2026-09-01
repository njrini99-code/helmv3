/**
 * Opening a thread must not re-render it N times.
 *
 * Reported 2026-08-31: "whenever messages loads, it instantly loads again",
 * together with threads not sitting at the latest message.
 *
 * The two are one bug. `fetchMessages` ends by calling
 * `markGolfMessagesAsRead`, which flips `read = true` on every message someone
 * ELSE sent in that conversation. Each flip is a `golf_messages` UPDATE, and
 * the hook subscribes to exactly that. So opening a group thread with N
 * unread messages emits N realtime UPDATEs immediately.
 *
 * The old handler answered each with `prev.map(...)` — a new array every time
 * — even though it only ever copies `content` and `edited_at`, neither of
 * which a read-receipt write touches. N events therefore rebuilt the list N
 * times to produce N IDENTICAL lists, re-rendering the thread underneath the
 * scroll position that had just been set.
 *
 * The fix is a reference-identity bail-out, so that is what these assert. Deep
 * equality is NOT enough: `toEqual` passes on a fresh array with identical
 * contents, which is precisely the broken behaviour. Every assertion here uses
 * `toBe`.
 */
import { describe, it, expect } from 'vitest';
import { applyRealtimeMessageUpdate } from '../use-golf-messages';

type Msg = { id: string; content: string; edited_at: string | null; is_deleted?: boolean | null };

const list: Msg[] = [
  { id: 'm1', content: 'first', edited_at: null },
  { id: 'm2', content: 'second', edited_at: null },
  { id: 'm3', content: 'third', edited_at: null },
];

describe('applyRealtimeMessageUpdate — read receipts must not churn the list', () => {
  it('returns the SAME array when nothing rendered changed (the read-receipt case)', () => {
    // Exactly what a `read = true` flip delivers: same content, same edited_at.
    const next = applyRealtimeMessageUpdate(list, {
      id: 'm2', content: 'second', edited_at: null, is_deleted: false,
    });
    expect(next).toBe(list);
  });

  it('stays identical across a burst, the way opening a group thread arrives', () => {
    let acc = list;
    for (const id of ['m1', 'm2', 'm3', 'm1', 'm2']) {
      const src = list.find((m) => m.id === id)!;
      acc = applyRealtimeMessageUpdate(acc, { ...src, is_deleted: false });
    }
    expect(acc).toBe(list);
  });

  it('ignores an update for a message not in view', () => {
    expect(applyRealtimeMessageUpdate(list, {
      id: 'not-loaded', content: 'x', edited_at: null,
    })).toBe(list);
  });

  it('still applies a real edit', () => {
    const next = applyRealtimeMessageUpdate(list, {
      id: 'm2', content: 'second (edited)', edited_at: '2026-08-31T12:00:00Z',
    });
    expect(next).not.toBe(list);
    expect(next[1]).toMatchObject({ content: 'second (edited)', edited_at: '2026-08-31T12:00:00Z' });
    // Untouched rows keep their identity so their rows do not re-render either.
    expect(next[0]).toBe(list[0]);
    expect(next[2]).toBe(list[2]);
  });

  it('still removes a soft-deleted message, and no-ops if already gone', () => {
    const removed = applyRealtimeMessageUpdate(list, {
      id: 'm3', content: 'third', edited_at: null, is_deleted: true,
    });
    expect(removed.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(applyRealtimeMessageUpdate(removed, {
      id: 'm3', content: 'third', edited_at: null, is_deleted: true,
    })).toBe(removed);
  });
});

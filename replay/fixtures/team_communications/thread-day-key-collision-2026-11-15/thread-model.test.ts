import { describe, expect, it } from 'vitest';
import { isEmojiOnly, threadItems } from '../thread/model';
import type { ChMsg } from '../model';

const TZ = 'America/New_York';
const NOW = '2026-10-18T18:40:00Z';
const msg = (id: string, senderId: string, at: string, extra: Partial<ChMsg> = {}): ChMsg => ({
  id, senderId, text: id, at, mine: senderId === 'me', seen: false, failed: null, edited: false, deleted: false, hasAttachments: false, ...extra,
});
const shape = (items: ReturnType<typeof threadItems>) => items.map((i) => (i.kind === 'day' ? `# ${i.label}` : `${i.m.id}${i.first ? 'F' : ''}${i.last ? 'L' : ''}`));

describe('threadItems runs (MSG-205)', () => {
  it('keeps one sender on one day in a run however long the gap (no five-minute rule)', () => {
    const items = threadItems([msg('a', 'dan', '2026-10-18T13:00:00Z'), msg('b', 'dan', '2026-10-18T13:01:00Z'), msg('c', 'dan', '2026-10-18T15:30:00Z')], NOW, TZ);
    expect(shape(items)).toEqual(['# Today', 'aF', 'b', 'cL']);
  });

  it('breaks a run at a poll, before and after it', () => {
    const poll = msg('p', 'dan', '2026-10-18T13:01:00Z', { poll: {} as never });
    expect(shape(threadItems([msg('a', 'dan', '2026-10-18T13:00:00Z'), poll, msg('c', 'dan', '2026-10-18T13:02:00Z')], NOW, TZ))).toEqual(['# Today', 'aFL', 'pFL', 'cFL']);
  });

  it('breaks a run at a new sender and at midnight', () => {
    const items = threadItems([msg('a', 'dan', '2026-10-17T13:00:00Z'), msg('b', 'dan', '2026-10-18T13:00:00Z'), msg('c', 'me', '2026-10-18T13:01:00Z')], NOW, TZ);
    expect(shape(items)).toEqual(['# Yesterday', 'aFL', '# Today', 'bFL', 'cFL']);
  });
});

describe('isEmojiOnly (MSG-204)', () => {
  it('is true for one to three emoji and nothing else', () => {
    for (const t of ['👍', ' 😂😂 ', '👍🏽', '⛳️ 🏌️']) expect(isEmojiOnly(t), t).toBe(true);
  });
  it('is false for words, four or more emoji, digits and empty text', () => {
    for (const t of ['ok 👍', '👍👍👍👍', '12', '  ', '']) expect(isEmojiOnly(t), t).toBe(false);
  });
});

describe('threadItems keys (Sentry JAVASCRIPT-NEXTJS-1EH / 1MG)', () => {
  it('gives every item a unique React key even when a day comes back round (out-of-order input)', () => {
    // 2026-11-15: /clubhouse-preview/messages logged "Encountered two children with the same key, `d2026-10-15`"
    // 35 times in an hour. A day separator keyed on the day alone collides when the thread revisits a day.
    const items = threadItems(
      [msg('a', 'dan', '2026-10-15T15:00:00Z'), msg('b', 'amy', '2026-10-16T15:00:00Z'), msg('c', 'dan', '2026-10-15T16:00:00Z')],
      NOW,
      TZ,
    );
    const keys = items.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps one separator key stable for a day as long as its first message is unchanged', () => {
    const first = threadItems([msg('a', 'dan', '2026-10-15T15:00:00Z')], NOW, TZ)[0]!;
    const more = threadItems([msg('a', 'dan', '2026-10-15T15:00:00Z'), msg('b', 'dan', '2026-10-15T15:05:00Z')], NOW, TZ)[0]!;
    expect(first.kind).toBe('day');
    expect(more.key).toBe(first.key);
  });
});

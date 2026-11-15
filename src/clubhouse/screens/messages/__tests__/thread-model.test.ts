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

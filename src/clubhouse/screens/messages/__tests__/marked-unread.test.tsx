import { afterEach, describe, expect, it, vi } from 'vitest';
import { readMarkedUnread, withMark, writeMarkedUnread } from '../marked-unread';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

/** Mark as unread is kept per user on this device (owner decision 14); storage may be corrupt or refuse access. */
describe('marked unread', () => {
  it('round-trips per user, and an empty set removes the key', () => {
    writeMarkedUnread('u1', new Set(['c1', 'c2']));
    expect([...readMarkedUnread('u1')].sort()).toEqual(['c1', 'c2']);
    expect(readMarkedUnread('u2').size).toBe(0);
    writeMarkedUnread('u1', new Set());
    expect(localStorage.getItem('ch.msg.unread.u1')).toBeNull();
  });

  it('reads corrupt or foreign JSON as nothing marked', () => {
    localStorage.setItem('ch.msg.unread.u1', '{not json');
    expect(readMarkedUnread('u1').size).toBe(0);
    localStorage.setItem('ch.msg.unread.u1', JSON.stringify({ c1: true }));
    expect(readMarkedUnread('u1').size).toBe(0);
    localStorage.setItem('ch.msg.unread.u1', JSON.stringify(['c1', 3, '', null]));
    expect([...readMarkedUnread('u1')]).toEqual(['c1']);
  });

  it('survives storage that throws on read and on write', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(readMarkedUnread('u1').size).toBe(0);
    expect(() => writeMarkedUnread('u1', new Set(['c1']))).not.toThrow();
  });

  it('withMark adds and clears one conversation without touching the rest', () => {
    const a = withMark(new Set(['c1']), 'c2', true);
    expect([...a].sort()).toEqual(['c1', 'c2']);
    expect([...withMark(a, 'c1', false)]).toEqual(['c2']);
  });
});

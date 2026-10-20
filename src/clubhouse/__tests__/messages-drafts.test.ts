/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DraftStore } from '../screens/messages/drafts';

/** F-12: a draft survived a conversation switch but not a reload. */
describe('Messages drafts', () => {
  beforeEach(() => sessionStorage.clear());

  it('a draft survives a reload (a new store for the same user) and is gone once sent or cleared', () => {
    const a = new DraftStore('u1');
    a.set('c1', 'See you at 7');
    a.set('c2', 'Bring the yardage book');
    const reloaded = new DraftStore('u1');
    expect(reloaded.get('c1')).toBe('See you at 7');
    expect(reloaded.get('c2')).toBe('Bring the yardage book');
    reloaded.delete('c1');
    expect(new DraftStore('u1').get('c1')).toBeUndefined();
    reloaded.clear();
    expect(new DraftStore('u1').size).toBe(0);
  });

  it("another account on the same device never sees the drafts", () => {
    new DraftStore('u1').set('c1', 'private');
    expect(new DraftStore('u2').get('c1')).toBeUndefined();
  });

  it('a refused write keeps the draft in memory, and malformed storage starts empty', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded');
    });
    const s = new DraftStore('u1');
    s.set('c1', 'still here');
    expect(s.get('c1')).toBe('still here');
    spy.mockRestore();
    sessionStorage.setItem('ch.msg.drafts.u3', '{not json');
    expect(new DraftStore('u3').size).toBe(0);
  });
});

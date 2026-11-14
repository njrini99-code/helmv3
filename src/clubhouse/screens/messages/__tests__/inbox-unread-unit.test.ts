import { describe, expect, it } from 'vitest';
import { inboxContextDesktop } from '../inbox/Rail';

/*
 * F-0021 (audit 2026-11-13): the rail's head read "1 unread · 1 conversation" while the sidebar badge read 2: one conversation held two
 * unread messages. The head counts conversations, so it says so ("1 unread conversation"); with none unread it gives the total.
 */
describe('F-0021 the inbox head names what it counts', () => {
  it('counts unread conversations as conversations', () => {
    expect(inboxContextDesktop(1, 1)).toBe('1 unread conversation');
    expect(inboxContextDesktop(3, 7)).toBe('3 unread conversations');
  });

  it('with nothing unread, the conversations', () => {
    expect(inboxContextDesktop(0, 7)).toBe('7 conversations');
    expect(inboxContextDesktop(0, 1)).toBe('1 conversation');
  });
});

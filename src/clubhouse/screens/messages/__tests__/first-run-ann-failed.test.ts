import { describe, expect, it } from 'vitest';
import { isMessagesFirstRun } from '../MessagesFirstRun';

const base = { convs: [] as unknown[], announcements: [] as unknown[], convsLoading: false, convsError: null, annLoading: false, annError: false };

/**
 * GAP-S-01: the first-run page replaces the whole inbox, so it may only draw when both reads answered empty. A failed
 * announcements read defaults the list to [], and drawing "No conversations yet" over it told a player whose inbox is
 * announcements only that they had no messages, and hid the CH-7206 notice and its Try again.
 */
describe('Messages · first run only when both reads answered empty', () => {
  it('is a first run when conversations and announcements both answered empty', () => {
    expect(isMessagesFirstRun(base)).toBe(true);
  });

  it('is not a first run when the announcements read failed', () => {
    expect(isMessagesFirstRun({ ...base, annError: true })).toBe(false);
  });

  it('is not a first run when the conversations read failed, or while either read is loading', () => {
    expect(isMessagesFirstRun({ ...base, convsError: new Error('x') })).toBe(false);
    expect(isMessagesFirstRun({ ...base, convsLoading: true })).toBe(false);
    expect(isMessagesFirstRun({ ...base, annLoading: true })).toBe(false);
  });

  it('is not a first run when there are announcements to show', () => {
    expect(isMessagesFirstRun({ ...base, announcements: [{}] })).toBe(false);
  });
});

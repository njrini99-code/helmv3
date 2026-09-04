import { describe, expect, it } from 'vitest';

import { fixtureIds, fixturePeople } from './fixtures';

describe('golf messaging mobile render fixtures', () => {
  it('keeps the four reviewed mobile states available to the capture runner', () => {
    expect(fixtureIds).toEqual([
      'inbox-unread-group',
      'thread-short-group',
      'thread-failed-send',
      'new-private-group',
    ]);
  });

  it('deliberately exercises the deterministic no-photo identity treatment', () => {
    expect(Object.values(fixturePeople).every((person) => person.avatar === null)).toBe(true);
  });
});

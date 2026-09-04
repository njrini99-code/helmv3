import { describe, expect, it } from 'vitest';

import { fixtureIds } from './fixtures';

describe('golf messaging mobile render fixtures', () => {
  it('keeps the four reviewed mobile states available to the capture runner', () => {
    expect(fixtureIds).toEqual([
      'inbox-unread-group',
      'thread-short-group',
      'thread-failed-send',
      'new-private-group',
    ]);
  });
});

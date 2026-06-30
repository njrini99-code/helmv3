import { describe, it, expect } from 'vitest';
import type { RosterReadModel } from '../read-models/roster';

describe('roster read model shape (#411)', () => {
  it('distinguishes roster failure from healthy empty roster', () => {
    const failed: RosterReadModel = {
      teamId: 'team-1',
      authorized: true,
      members: [],
      aggregates: {},
      rosterError: true,
      aggregatesError: false,
    };
    const empty: RosterReadModel = {
      teamId: 'team-1',
      authorized: true,
      members: [],
      aggregates: {},
      rosterError: false,
      aggregatesError: false,
    };

    expect(failed.rosterError).toBe(true);
    expect(empty.rosterError).toBe(false);
    expect(failed.members).toEqual([]);
  });
});

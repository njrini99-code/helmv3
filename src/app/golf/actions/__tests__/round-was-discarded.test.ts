import { describe, expect, it } from 'vitest';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';
import { roundWasDiscarded } from '../golf-action-shared';
import { describeRoundWriteFailure } from '@/lib/golf/round-missing-recovery';

// A round discarded on one device came back from another device's saved copy: the save found the id gone, answered
// round_missing, and the client re-created it. golf_round_discards (20261031141000) records the discard, and a save
// or submit against that id answers round_discarded instead.
describe('roundWasDiscarded', () => {
  const sb = createFakeSupabase({
    tables: { golf_round_discards: [{ round_id: 'r1', player_id: 'p1', round_before: {} }] },
  });

  it('is true only for the discarding player’s own round', async () => {
    expect(await roundWasDiscarded(sb as never, 'r1', 'p1')).toBe(true);
    expect(await roundWasDiscarded(sb as never, 'r1', 'p2')).toBe(false);
    expect(await roundWasDiscarded(sb as never, 'r2', 'p1')).toBe(false);
  });

  it('reads a failed lookup as not known, so the old round_missing path stays', async () => {
    const broken = { from: () => { throw new Error('offline'); } };
    expect(await roundWasDiscarded(broken as never, 'r1', 'p1')).toBe(false);
  });

  it('tells the player in a sentence, never the bare key', () => {
    expect(describeRoundWriteFailure('round_discarded')).toMatch(/^This round was discarded/);
  });
});

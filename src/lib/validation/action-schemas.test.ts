/**
 * Regression test for the 5-stage recruiting pipeline contract (#426).
 *
 * The Pipeline UI once surfaced 7 stages (including `contacted` and
 * `campus_visit`), but `updateWatchlistStatus` validates against
 * `WatchlistSchemas.updateStatus`, whose enum only allows the 5 stages in the
 * `baseball_pipeline_stage` DB enum. Choosing a non-contract stage was rejected
 * server-side while the client refetched as if it worked. These tests pin the
 * contract so the UI and server can never drift apart again.
 */
import { describe, it, expect } from 'vitest';
import { WatchlistSchemas } from './action-schemas';

const VALID_UUID = '00000000-0000-0000-0000-000000000000';

describe('WatchlistSchemas.updateStatus — 5-stage server contract', () => {
  const VALID_STAGES = ['watchlist', 'high_priority', 'offer_extended', 'committed', 'uninterested'] as const;
  const LEGACY_STAGES = ['contacted', 'campus_visit'] as const;

  it.each(VALID_STAGES)('accepts the contract stage %s', (status) => {
    const result = WatchlistSchemas.updateStatus.safeParse({ watchlist_id: VALID_UUID, status });
    expect(result.success).toBe(true);
  });

  it.each(LEGACY_STAGES)('rejects the removed legacy stage %s', (status) => {
    const result = WatchlistSchemas.updateStatus.safeParse({ watchlist_id: VALID_UUID, status });
    expect(result.success).toBe(false);
  });

  it('rejects an arbitrary unknown stage', () => {
    const result = WatchlistSchemas.updateStatus.safeParse({ watchlist_id: VALID_UUID, status: 'not_a_stage' });
    expect(result.success).toBe(false);
  });
});

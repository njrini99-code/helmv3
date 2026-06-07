import { describe, it, expect } from 'vitest';
import {
  deterministicShotPatternId,
  shotPatternSignature,
} from '../shot-pattern-miner';

/**
 * SUSTAINABILITY regression guard (2026-06-07).
 *
 * Shot patterns formerly used crypto.randomUUID() ids, so the nightly
 * roster-sweep + every round-submit APPENDED a fresh golf_patterns_v2 row per
 * situation, silting the table to ~29.6k rows. The fix makes the id
 * deterministic per (player, distanceRange.label, lie) so upsert(onConflict:'id')
 * collapses re-runs to one row per situation. If anyone reintroduces a random
 * id, these assertions break.
 */
describe('shot-pattern deterministic id (silt guard)', () => {
  const player = '49ffe06d-9b22-4f2f-8c69-f56badbbde6b';

  it('is stable across runs for the same (player, situation)', () => {
    const sig = shotPatternSignature('Mid (130-160)', 'all');
    const a = deterministicShotPatternId(player, sig);
    const b = deterministicShotPatternId(player, sig);
    expect(a).toBe(b);
  });

  it('produces a valid RFC-4122 UUID', () => {
    const id = deterministicShotPatternId(player, shotPatternSignature('Wedge (0-50)', 'rough'));
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('differs across distinct situations (no collisions) and players', () => {
    const ids = new Set([
      deterministicShotPatternId(player, shotPatternSignature('Mid (130-160)', 'all')),
      deterministicShotPatternId(player, shotPatternSignature('Mid (130-160)', 'rough')),
      deterministicShotPatternId(player, shotPatternSignature('Long (190-220)', 'all')),
      deterministicShotPatternId('00000000-0000-0000-0000-000000000001', shotPatternSignature('Mid (130-160)', 'all')),
    ]);
    expect(ids.size).toBe(4);
  });
});

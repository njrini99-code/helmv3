import { describe, expect, it } from 'vitest';
import { evictTerrain, rememberViewedHole, residentTerrainKeys, TERRAIN_RESIDENCY_MAX } from '../terrain-residency';

describe('terrain residency (§69)', () => {
  it('keeps current, next and the most recently viewed hole, never more than three', () => {
    expect(TERRAIN_RESIDENCY_MAX).toBe(3);
    let recent: string[] = [];
    for (const key of ['h01', 'h02', 'h03', 'h04']) recent = rememberViewedHole(recent, key);
    expect(recent).toEqual(['h04', 'h03', 'h02']);
    expect(residentTerrainKeys({ current: 'h05', next: 'h06', recent })).toEqual(['h05', 'h06', 'h04']);
    // Jumping back keeps the hole the golfer just left, not an older one.
    expect(residentTerrainKeys({ current: 'h02', next: 'h03', recent: ['h05', 'h04'] })).toEqual(['h02', 'h03', 'h05']);
    expect(residentTerrainKeys({ current: 'h18', next: null, recent: ['h17', 'h16', 'h15'] })).toEqual(['h18', 'h17', 'h16']);
    expect(residentTerrainKeys({ current: 'h07', next: 'h07', recent: [] })).toEqual(['h07']);
  });
  it('evicts everything outside the resident set and keeps the object stable when nothing changes', () => {
    const loaded = { h01: 1, h02: 2, h03: 3, h04: 4 };
    expect(evictTerrain(loaded, ['h03', 'h04', 'h02'])).toEqual({ h02: 2, h03: 3, h04: 4 });
    const same = { h03: 3, h04: 4 };
    expect(evictTerrain(same, ['h03', 'h04', 'h05'])).toBe(same);
    // Eighteen filmstrip cells never force eighteen meshes resident.
    const all = Object.fromEntries(Array.from({ length: 18 }, (_, i) => [`h${i + 1}`, i]));
    expect(Object.keys(evictTerrain(all, residentTerrainKeys({ current: 'h7', next: 'h8', recent: ['h6', 'h5'] }))).length).toBe(3);
  });
});

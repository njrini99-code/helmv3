import { describe, expect, it } from 'vitest';
import { changeMatters, REFRESH_GAP_MS, refreshDelay } from '../live';

/**
 * recompute_golf_round_totals updates golf_rounds about 37 times per autosave (once per hole row), so a watching qualifier
 * page used to re-read on every autosave of every player (P-6 plan 8.1, 8.14). A repeat of the same `updated_at` and status
 * carries nothing new, and two re-reads are never closer than five seconds.
 */
describe('the qualifier page’s re-read gate', () => {
  it('waits the usual 800 ms when nothing was read lately', () => {
    expect(refreshDelay(100_000, 0)).toBe(800);
  });
  it('stretches the wait so two re-reads are at least five seconds apart', () => {
    expect(refreshDelay(10_000, 9_000)).toBe(REFRESH_GAP_MS - 1_000);
    expect(refreshDelay(10_000 + REFRESH_GAP_MS, 10_000)).toBe(800);
  });
  it('passes a round it has not seen, and a new updated_at or status', () => {
    const seen = new Map();
    const row = (updated_at: string, status = 'in_progress') => ({ new: { id: 'r1', updated_at, status } });
    expect(changeMatters(row('2026-10-14T18:00:00Z'), seen)).toBe(true);
    expect(changeMatters(row('2026-10-14T18:00:00Z'), seen)).toBe(false);
    expect(changeMatters(row('2026-10-14T18:00:05Z'), seen)).toBe(true);
    expect(changeMatters(row('2026-10-14T18:00:05Z', 'completed'), seen)).toBe(true);
  });
  it('keeps rounds apart and lets a change with no id through', () => {
    const seen = new Map();
    expect(changeMatters({ new: { id: 'a', updated_at: 'x', status: 's' } }, seen)).toBe(true);
    expect(changeMatters({ new: { id: 'b', updated_at: 'x', status: 's' } }, seen)).toBe(true);
    expect(changeMatters({ new: null }, seen)).toBe(true);
  });
});

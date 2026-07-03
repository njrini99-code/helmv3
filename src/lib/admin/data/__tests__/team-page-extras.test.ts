import { describe, it, expect } from 'vitest';
import { buildLastRoundScoreByPlayer } from '@/lib/admin/data/team-page-extras';

describe('buildLastRoundScoreByPlayer', () => {
  it('keeps the first (most recent, given desc-ordered input) row per player', () => {
    const map = buildLastRoundScoreByPlayer([
      { player_id: 'p1', total_score: 72, score_to_par: 0, created_at: '2026-07-02T00:00:00Z' },
      { player_id: 'p1', total_score: 80, score_to_par: 8, created_at: '2026-06-01T00:00:00Z' },
      { player_id: 'p2', total_score: 75, score_to_par: 3, created_at: '2026-07-01T00:00:00Z' },
    ]);
    expect(map.get('p1')).toEqual({ score: 72, toPar: 0 });
    expect(map.get('p2')).toEqual({ score: 75, toPar: 3 });
  });

  it('returns an empty map for no rows', () => {
    expect(buildLastRoundScoreByPlayer([]).size).toBe(0);
  });

  it('a player with no rows in the slice simply has no entry', () => {
    const map = buildLastRoundScoreByPlayer([
      { player_id: 'p1', total_score: 72, score_to_par: 0, created_at: '2026-07-02T00:00:00Z' },
    ]);
    expect(map.has('p2')).toBe(false);
  });
});

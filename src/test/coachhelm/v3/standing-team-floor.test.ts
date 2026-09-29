import { describe, it, expect } from 'vitest';
import { applyTeamFloor, MIN_TEAM_N_FOR_MARKER } from '@/lib/coachhelm/v3/standing/team-floor';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';

function row(team_n: number): PlayerStanding {
  return {
    player_id: 'p', metric_id: 'sg_total', player_value: -1.2,
    team_avg: -1.2, team_n, team_pct: 100,
    level_avg: -2.0, level_n: 40, level_pct: 60,
    pga_value: 0, pga_delta: -1.2, computed_at: '2026-09-28T00:00:00Z',
  } as PlayerStanding;
}

describe('audit row 19 — team markers need a team', () => {
  it('blanks team_avg and team_pct when fewer than 3 teammates are measured', () => {
    // 2 of 47 production rows had team_n = 1: the "team average" was the
    // player's own value and the percentile a tautological 100.
    const out = applyTeamFloor(row(1));
    expect(MIN_TEAM_N_FOR_MARKER).toBe(3);
    expect(out.team_avg).toBeNull();
    expect(out.team_pct).toBeNull();
    expect(out.team_n).toBe(1);
    // The player's own value and the cohort / Tour markers are untouched.
    expect(out.player_value).toBe(-1.2);
    expect(out.level_avg).toBe(-2.0);
  });

  it('keeps the team markers at 3 or more', () => {
    const out = applyTeamFloor(row(3));
    expect(out.team_avg).toBe(-1.2);
    expect(out.team_pct).toBe(100);
  });
});

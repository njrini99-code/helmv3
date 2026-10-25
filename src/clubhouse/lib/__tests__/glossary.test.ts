import { describe, expect, it } from 'vitest';
import { hits, ratchet, ROOT, walk } from '../../__tests__/_scan';
import { TERMS } from '../glossary';

/**
 * CONS-18: golf words come from the glossary. The files below still spell an off-glossary word ("Avg", "Around
 * green", "Short game", which wait on the owner) in their own code; their counts may only fall.
 */
const ALLOW_WORDS: Record<string, number> = {
  'data/coachhelm-standing-shape.ts': 1,
  'data/leg-rows.ts': 1,
  'data/round-review-shape.ts': 1,
  'data/stats-player.ts': 4,
  'data/stats-team.ts': 1,
  'preview/fixtures-player-home.ts': 1,
  'preview/fixtures-stats.ts': 5,
  'preview/fixtures.ts': 1,
  'screens/home/Leaderboard.tsx': 1,
  'screens/roster/Roster.tsx': 4,
  'screens/roster/RosterPhone.tsx': 1,
  'screens/roster/TeamRoster.tsx': 1,
  'screens/roster/TeamRosterPhone.tsx': 1,
  'screens/roster/sort.ts': 1,
  'screens/roster/team.ts': 2,
  'screens/rounds/RoundReview.tsx': 1,
  'screens/rounds/card/card-model.ts': 1,
  'screens/rounds/parts.tsx': 1,
  'screens/settings/model.ts': 1,
  'screens/stats/GameDetail.tsx': 2,
  'screens/stats/OverviewZones.tsx': 1,
  'screens/stats/StatsPlayer.tsx': 1,
  'screens/stats/StatsTeamPhone.tsx': 1,
  'screens/stats/leg-rows.ts': 1,
  'screens/stats/legs.ts': 2,
  'screens/stats/team-rank.ts': 1,
};

describe('golf glossary (CONS-18)', () => {
  it('a long and a short form for each word; the handicap is HCP in capitals', () => {
    expect(TERMS.handicap).toEqual({ long: 'Handicap', short: 'HCP' });
    expect(TERMS.scoringAvg.short).toBe('Scoring avg');
    for (const t of Object.values(TERMS)) expect(t.long.length).toBeGreaterThanOrEqual(t.short.length);
  });

  it('golf words come from the glossary', () => {
    const banned = /['"`>](Avg score|Avg|hcp|Around green|Short game)['"`<]/;
    const r = ratchet(hits(banned, walk(ROOT, /\.tsx?$/)).filter((h) => h.file !== 'lib/glossary.ts'), ALLOW_WORDS);
    expect(r.over).toEqual([]);
    expect(r.stale).toEqual([]);
  });
});

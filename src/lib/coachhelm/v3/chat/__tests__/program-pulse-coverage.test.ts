/**
 * Coverage line and openers count RECENT coverage (2026-09 audit row 49):
 * coverage counted any completed round ever, so 14% of "covered" players had
 * nothing in 60 days, and "Where is the team losing the most strokes?" was
 * offered as soon as one player had any round.
 */
import { describe, expect, it } from 'vitest';
import {
  MIN_COVERED_FOR_STROKES_OPENER,
  coverageLine,
  generalOpeners,
  suggestionsFromPulse,
  type ProgramPulse,
} from '@/lib/coachhelm/v3/chat/program-pulse';

const pulse = (over: Partial<ProgramPulse>): ProgramPulse => ({
  items: [],
  latest_round_at: null,
  players_without_rounds: 0,
  players_with_recent_rounds: 0,
  recent_window_days: 60,
  active_roster: 0,
  as_of: '2026-09-28T00:00:00Z',
  ...over,
});

const STROKES = 'Where is the team losing the most strokes?';

describe('coverageLine', () => {
  it('states recent coverage, not all-time', () => {
    expect(coverageLine(pulse({ active_roster: 10, players_without_rounds: 1, players_with_recent_rounds: 6 }))).toBe(
      '6 of 10 players have a round in the last 60 days. Answers cover those 6.',
    );
  });

  it('says all when every player is current', () => {
    expect(coverageLine(pulse({ active_roster: 4, players_with_recent_rounds: 4 }))).toBe(
      'All 4 players have a round in the last 60 days.',
    );
  });

  it('says so when rounds exist but none are recent', () => {
    expect(coverageLine(pulse({ active_roster: 5, players_without_rounds: 2, players_with_recent_rounds: 0 }))).toBe(
      'No player has a round in the last 60 days. 3 of 5 have older rounds; answers draw on those.',
    );
  });

  it('is null for an empty roster', () => {
    expect(coverageLine(pulse({}))).toBeNull();
  });
});

describe('strokes-lost opener', () => {
  it('needs a minimum number of recently covered players', () => {
    const thin = pulse({ active_roster: 10, players_without_rounds: 0, players_with_recent_rounds: MIN_COVERED_FOR_STROKES_OPENER - 1 });
    expect(generalOpeners(thin, 'Team')).toEqual(['Brief me on Team']);
    expect(suggestionsFromPulse(thin, 'Team')).not.toContain(STROKES);

    const enough = pulse({ active_roster: 10, players_with_recent_rounds: MIN_COVERED_FOR_STROKES_OPENER });
    expect(generalOpeners(enough, 'Team')).toContain(STROKES);
    expect(suggestionsFromPulse(enough, 'Team')).toContain(STROKES);
  });

  it('offers nothing to a roster with no rounds', () => {
    expect(generalOpeners(pulse({ active_roster: 3, players_without_rounds: 3 }), 'Team')).toEqual([]);
  });
});

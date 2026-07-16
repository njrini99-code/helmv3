// =============================================================================
// src/lib/baseball/read-models/decision-room/__tests__/games-wins-label-honesty.test.ts
//
// PRODUCT TRUTH THIS FILE PINS:
//   The "Wins since last meeting" rail on the Staff Decision Room (and its
//   Export Summary text) used to be captioned "Last 14 days" even though
//   `loadGameResults` applies NO date-range filter — it just returns the
//   most-recent `MAX_ROWS` completed games regardless of age. On a team that
//   hasn't played in the last two weeks (verified prod case: games ran
//   May 28 -> Jun 17 against an audit "today" of Jul 15), that caption was a
//   flat lie: a coach trusting it would believe these were this fortnight's
//   results when they were roughly a month stale.
//
//   Fix: relabel to "Most recent completed games" (honest — makes no window
//   claim) rather than bolting on a real 14-day filter, which would have
//   silently emptied this section for any team on a bye week. This file pins
//   BOTH halves of the fix so neither can silently regress:
//     1. loadGameResults still returns old completed games untouched (the
//        behavior the honest label describes).
//     2. The UI copy (masthead eyebrow, empty state, export text) no longer
//        claims a 14-day window it doesn't enforce.
// =============================================================================

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

const repo = process.cwd();
const read = (path: string) => readFileSync(join(repo, path), 'utf8');

let fake: FakeSupabase;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

import { loadGameResults } from '@/lib/baseball/read-models/decision-room/games';

const TEAM_ID = 'team-1';

function daysAgoDateString(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

beforeEach(() => {
  fake = createFakeSupabase({ user: { id: 'user-1' } });
});

describe('loadGameResults — no date-range filter (the behavior the honest label describes)', () => {
  it('returns a completed game far outside any 14-day window, unfiltered by age', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: {
        baseball_games: [
          {
            id: 'game-old',
            team_id: TEAM_ID,
            game_date: daysAgoDateString(40),
            game_type: 'conference',
            opponent_name: 'Old Dominion',
            location: null,
            home_away: 'home',
            our_score: 6,
            opponent_score: 3,
            innings_played: 9,
            status: 'completed',
            notes: null,
            created_at: daysAgoDateString(40),
          },
        ],
      },
    });

    const results = await loadGameResults(fake as unknown as never, TEAM_ID);

    expect(results).toHaveLength(1);
    expect(results[0]?.opponentName).toBe('Old Dominion');
  });

  it('excludes only non-completed games — status filtering, not date filtering, is the gate', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: {
        baseball_games: [
          {
            id: 'game-scheduled',
            team_id: TEAM_ID,
            game_date: daysAgoDateString(1),
            game_type: 'conference',
            opponent_name: 'Upcoming Opponent',
            location: null,
            home_away: 'away',
            our_score: null,
            opponent_score: null,
            innings_played: null,
            status: 'scheduled',
            notes: null,
            created_at: daysAgoDateString(1),
          },
        ],
      },
    });

    const results = await loadGameResults(fake as unknown as never, TEAM_ID);
    expect(results).toHaveLength(0);
  });
});

describe('Staff Decision Room copy — honest about the wins/results window (#DISHONEST fix)', () => {
  const fairwaySrc = read(
    'src/components/baseball/staff-decision-room/StaffDecisionRoomFairway.tsx',
  );
  const clientSrc = read(
    'src/components/baseball/staff-decision-room/StaffDecisionRoomClient.tsx',
  );

  it('the masthead eyebrow no longer claims a 14-day window over an unfiltered query', () => {
    expect(fairwaySrc).not.toContain('Last 14 days');
    expect(fairwaySrc).toContain('Most recent completed games');
  });

  it('the empty state no longer claims a 14-day window either', () => {
    expect(fairwaySrc).not.toContain('No completed games in the last 14 days');
    expect(fairwaySrc).toContain('No completed games yet.');
  });

  it('the Export Summary text mirrors the honest, window-free label', () => {
    expect(clientSrc).not.toContain('WINS / RESULTS (last 14 days)');
    expect(clientSrc).toContain('WINS / RESULTS (most recent completed games)');
  });
});

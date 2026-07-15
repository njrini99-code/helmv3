// =============================================================================
// src/lib/baseball/read-models/__tests__/player-passport-recent-activity.test.ts
//
// PRODUCT TRUTH THIS FILE PINS (#845 review fix, post-#379):
//   getPlayerPassport's recentActivity (capturedSessions/lastSessionDate/
//   lastSessionSource/lastSessionTrust/lastSessionProvenance/sourceLayer) and
//   the compact-mode completeness engine's 'stats' signal must resolve via
//   the SAME box-score > legacy-fallback > no-data precedence
//   legacy-stat-adapters.ts enforces elsewhere: a player with real history
//   captured before the box-score pipeline existed (zero
//   baseball_box_score_batting/_pitching rows, real baseball_player_stats
//   rows) must show REAL recent-activity data — never a silent honest-LOOKING
//   empty caused by the #379 migration itself.
//
// Source of truth: fetchRecentActivity + getPlayerPassport in
// src/lib/baseball/read-models/player-passport.ts.
//
// Mocks ONLY '@/lib/supabase/server', mirroring the sibling
// player-today-honest-loop.test.ts contract-test pattern for player-today.ts.
// =============================================================================

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

import { getPlayerPassport } from '@/lib/baseball/read-models/player-passport';

const TEAM_ID = 'team-1';
const PLAYER_ID = 'player-1';
const USER_ID = 'user-1';

type Row = Record<string, unknown>;

function baseTables(extra: Record<string, Row[]> = {}): Record<string, Row[]> {
  return {
    baseball_players: [
      { id: PLAYER_ID, user_id: USER_ID, first_name: 'Jordan', last_name: 'Rivera' },
    ],
    baseball_coaches: [],
    baseball_player_passport_settings: [],
    // #379 — recentActivity now sources from the canonical box-score layer,
    // falling back to the deprecated flat table (#845 review fix, below).
    baseball_box_score_batting: [],
    baseball_box_score_pitching: [],
    baseball_games: [],
    baseball_player_stats: [],
    baseball_import_runs: [],
    ...extra,
  };
}

beforeEach(() => {
  fake = createFakeSupabase({ user: { id: USER_ID }, tables: baseTables() });
});

describe('getPlayerPassport — recentActivity legacy fallback for a legacy-only player (#845)', () => {
  it('zero box-score rows, real baseball_player_stats rows -> recentActivity shows REAL data, not an honest-looking empty', async () => {
    fake = createFakeSupabase({
      user: { id: USER_ID },
      tables: baseTables({
        baseball_player_stats: [
          {
            id: 'stat-1',
            player_id: PLAYER_ID,
            team_id: TEAM_ID,
            session_date: '2026-03-10',
            session_name: 'vs Rival High',
            source: 'manual',
            source_trust_level: null,
            source_match_tier: null,
            source_match_confidence: null,
            source_external_id: null,
            import_run_id: null,
          },
          {
            id: 'stat-2',
            player_id: PLAYER_ID,
            team_id: TEAM_ID,
            session_date: '2026-03-01',
            session_name: null,
            source: 'manual',
            source_trust_level: null,
            source_match_tier: null,
            source_match_confidence: null,
            source_external_id: null,
            import_run_id: null,
          },
        ],
      }),
    });

    const result = await getPlayerPassport(TEAM_ID);
    expect(result.authorized).toBe(true);
    expect(result.recentActivity.sourceLayer).toBe('legacy-fallback');
    expect(result.recentActivity.capturedSessions).toBe(2);
    expect(result.recentActivity.lastSessionDate).toBe('2026-03-10');
    expect(result.completeness.signals.find((s) => s.section === 'stats')?.complete).toBe(true);
    expect(result.error).toBeNull();
  });

  it('an imported legacy row surfaces its REAL stamped trust/provenance (never flattened to null just because it came through the fallback)', async () => {
    fake = createFakeSupabase({
      user: { id: USER_ID },
      tables: baseTables({
        baseball_player_stats: [
          {
            id: 'stat-3',
            player_id: PLAYER_ID,
            team_id: TEAM_ID,
            session_date: '2026-02-01',
            session_name: 'Imported batch',
            source: 'csv_import',
            source_trust_level: 'unreviewed',
            source_match_tier: 'exact_roster',
            source_match_confidence: 0.92,
            source_external_id: 'ext-1',
            import_run_id: 'run-1',
          },
        ],
        baseball_import_runs: [{ id: 'run-1', review_state: 'pending_review' }],
      }),
    });

    const result = await getPlayerPassport(TEAM_ID);
    expect(result.recentActivity.sourceLayer).toBe('legacy-fallback');
    expect(result.recentActivity.lastSessionTrust).not.toBeNull();
    expect(result.recentActivity.lastSessionProvenance).not.toBeNull();
  });

  it('a box-score row present -> box-score wins outright, even with legacy rows also present (never blended)', async () => {
    fake = createFakeSupabase({
      user: { id: USER_ID },
      tables: baseTables({
        baseball_box_score_batting: [
          { id: 'bb-1', game_id: 'game-1', player_id: PLAYER_ID, team_id: TEAM_ID },
        ],
        baseball_games: [
          { id: 'game-1', team_id: TEAM_ID, game_date: '2026-04-01', opponent_name: 'Rival High' },
        ],
        baseball_player_stats: [
          {
            id: 'stat-old',
            player_id: PLAYER_ID,
            team_id: TEAM_ID,
            session_date: '2020-01-01',
            session_name: 'Ancient session',
            source: 'manual',
            source_trust_level: null,
            source_match_tier: null,
            source_match_confidence: null,
            source_external_id: null,
            import_run_id: null,
          },
        ],
      }),
    });

    const result = await getPlayerPassport(TEAM_ID);
    expect(result.recentActivity.sourceLayer).toBe('box-score');
    expect(result.recentActivity.lastSessionDate).toBe('2026-04-01');
    // Box-score rows carry no CSV-import provenance — honest null, never the
    // legacy row's stamped values leaking through.
    expect(result.recentActivity.lastSessionTrust).toBeNull();
  });

  it('zero box-score AND zero legacy rows -> honest no-data, never fabricated', async () => {
    const result = await getPlayerPassport(TEAM_ID);
    expect(result.recentActivity.sourceLayer).toBe('no-data');
    expect(result.recentActivity.capturedSessions).toBe(0);
    expect(result.recentActivity.lastSessionDate).toBeNull();
    expect(result.completeness.signals.find((s) => s.section === 'stats')?.complete).toBe(false);
  });
});

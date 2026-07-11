// =============================================================================
// src/contracts/baseball/product-trust/honest-empty-state.test.ts
//
// PRODUCT TRUTH THIS FILE PINS:
//   Absence and failure must degrade HONESTLY — never render as a healthy,
//   confident result:
//     1. A player with zero captured box-score lines gets `noData: true` on
//        their Stats Center row, never a fabricated `.000` line.
//     2. `computeOPS` (operational-signals.ts cold-streak rule) returns `null`
//        — and the caller SKIPS the player — when neither `ops` nor
//        `obp + slg` is available, so cold-streak detection can never fire on
//        absent data.
//     3. When the team's master AI switch is OFF, the engine run reports
//        `generated: 0` / `aiDisabled: true` rather than a fake-success
//        "nothing wrong" result with a zero count that looks identical to "we
//        checked and there is nothing to report".
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

import { getStatsCenter } from '@/lib/baseball/read-models/stats-center';
import {
  runBaseballEngineCore,
  type EngineRunClient,
} from '@/lib/baseball/coachhelm/engine-run';
import { DEFAULT_AI_POLICY } from '@/lib/baseball/ai-policy';

const TEAM_ID = 'team-1';
const SEASON = 2026;

beforeEach(() => {
  fake = createFakeSupabase({ user: { id: 'user-1' } });
});

describe('getStatsCenter — honest empty state (#377)', () => {
  it('a player with zero box-score lines gets noData:true, never a fabricated .000 row', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: {
        baseball_coaches: [{ id: 'coach-1', user_id: 'user-1' }],
        baseball_team_coach_staff: [{ id: 'staff-1', team_id: TEAM_ID, coach_id: 'coach-1' }],
        baseball_team_members: [
          {
            team_id: TEAM_ID,
            player_id: 'p-no-data',
            jersey_number: 9,
            baseball_players: {
              id: 'p-no-data',
              first_name: 'Bench',
              last_name: 'Player',
              primary_position: 'OF',
            },
          },
        ],
        baseball_games: [],
        baseball_box_score_batting: [],
        baseball_box_score_pitching: [],
        baseball_player_season_stats: [],
      },
    });

    const result = await getStatsCenter(TEAM_ID, { seasonYear: SEASON });
    expect(result.authorized).toBe(true);
    const row = result.rows.find((r) => r.playerId === 'p-no-data');
    expect(row).toBeTruthy();
    expect(row?.noData).toBe(true);
    // Honest: derived rates are null, not a fabricated zero/`.000`.
    expect(row?.battingAll.avg).toBeNull();
    expect(row?.battingAll.ab).toBe(0);
    expect(result.summary.playersWithData).toBe(0);
  });
});

describe('cold-streak detection (#377) — computeOPS never fabricates an OPS to detect a "cold streak" on', () => {
  const src = read('src/app/baseball/actions/operational-signals.ts');

  it('computeOPS derives OBP/SLG from counting stats, null on zero denominators (never 0)', () => {
    // baseball_player_stats stores counting stats only (no ops/obp/slg
    // columns in prod — selecting them 42703'd; fixed 2026-07-11), so OPS is
    // derived with stats-center's formulas and each rate is null — not 0 —
    // when its denominator is empty.
    expect(src).toContain('const slg = ab > 0 ? totalBases / ab : null;');
    expect(src).toContain('const obp = obpDen > 0 ? (h + bb + hbp) / obpDen : null;');
    expect(src).toContain('if (obp === null || slg === null) return null;');
  });

  it('the cold-streak loader SKIPS a row when computeOPS is null, rather than treating it as 0', () => {
    expect(src).toContain('if (ops === null) continue;');
  });
});

describe('CoachHelm engine run (#377) — aiDisabled never renders as a healthy zero', () => {
  it('master AI switch OFF short-circuits the run: success:true, generated:0, aiDisabled:true', async () => {
    // The client must NEVER be touched once the master switch gate trips —
    // asserting that proves the short-circuit happens before any DB read.
    const client: EngineRunClient = {
      from: () => {
        throw new Error('runBaseballEngineCore must not query the DB when AI is disabled');
      },
    };

    const result = await runBaseballEngineCore(client, {
      teamId: TEAM_ID,
      coachId: 'coach-1',
      createdByUserId: 'user-1',
      policy: { ...DEFAULT_AI_POLICY, enabled: false },
      nowIso: '2026-04-01T00:00:00.000Z',
    });

    expect(result.success).toBe(true);
    expect(result.generated).toBe(0);
    expect(result.aiDisabled).toBe(true);
    // Distinguishable from "we ran and found nothing": aiDisabled is the
    // explicit honesty flag — a caller that only checks `generated === 0`
    // would otherwise read this identically to a clean, healthy run.
    expect(result.error).toBeUndefined();
  });
});

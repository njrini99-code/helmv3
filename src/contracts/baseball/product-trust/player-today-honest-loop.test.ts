// =============================================================================
// src/contracts/baseball/product-trust/player-today-honest-loop.test.ts
//
// PRODUCT TRUTH THIS FILE PINS (#377 — Player Today daily loop):
//   1. Readiness never fabricates a green band: with no check-in row at all,
//      the gate is `available:false` with a prompt note (never a fabricated
//      band); a submitted-but-non-green check-in still surfaces the REAL
//      band/reasons/missingInputs computeReadiness produced (never silently
//      swapped for a healthy result).
//   2. `summary.readinessNeedsAttention` is true whenever the gate is not a
//      confident green-today (no submission, or band !== 'green'), and false
//      only for a genuine submitted + non-stale + green result.
//   3. assignments/coachActions/tasks/coachNotes are honest feeds: a
//      genuinely empty table returns `available:true, items:[], error:null`,
//      while a FAILED sub-query also returns `available:true, items:[]` but
//      with a non-null `error` string. The two states must be distinguishable
//      ONLY by `error` — `available` is identical in both, which is the
//      actual fabrication risk: a caller that checks only `available` cannot
//      tell "genuinely nothing assigned" from "the query failed".
//   4. A hand-entered recent-stat row (no import_run_id, no
//      source_trust_level) never gets a fabricated trust/provenance object;
//      a stamped row does.
//
// Source of truth: `getPlayerToday` in
// src/lib/baseball/read-models/player-today.ts.
//
// Mocks ONLY '@/lib/supabase/server' and '@/lib/lifting/resolve-baseball-context'
// — the real team-local-day (contract-day.ts) and computeReadiness
// (readiness-compute.ts) logic runs UNMOCKED, exactly as the sibling
// player-today-lift-timezone.test.ts already does for the Lift & Check-in
// card's own action.
// =============================================================================

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';
import { failSelect } from '@/test/fixtures/fake-supabase-fail-select';

let fake: FakeSupabase;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

// Literal ids (NOT referencing outer `const`s — vi.mock factories run before
// this module's own top-level declarations execute) so the Helm Lifting Lab
// context always resolves, keeping the assignments/readiness sub-queries live
// without needing to seed baseball_teams/helm_lifting_athletes rows for it.
vi.mock('@/lib/lifting/resolve-baseball-context', () => ({
  resolveBaseballLiftingOrg: vi.fn(async () => ({ organizationId: 'org-1', teamId: 'team-1' })),
  resolveMyBaseballAthleteId: vi.fn(async () => 'athlete-1'),
}));

import { getPlayerToday } from '@/lib/baseball/read-models/player-today';

const TEAM_ID = 'team-1';
const PLAYER_ID = 'player-1';
const USER_ID = 'user-1';
const DAY = '2026-04-01';

type Row = Record<string, unknown>;

function baseTables(extra: Record<string, Row[]> = {}): Record<string, Row[]> {
  return {
    baseball_teams: [{ id: TEAM_ID, timezone: 'UTC' }],
    baseball_players: [{ id: PLAYER_ID, user_id: USER_ID }],
    baseball_team_members: [{ id: 'mem-1', team_id: TEAM_ID, player_id: PLAYER_ID }],
    baseball_events: [],
    baseball_player_stats: [],
    helm_lifting_sessions: [],
    baseball_actions: [],
    helm_lifting_readiness_checkins: [],
    baseball_task_assignments: [],
    baseball_coach_notes: [],
    baseball_practices: [],
    ...extra,
  };
}

beforeEach(() => {
  fake = createFakeSupabase({ user: { id: USER_ID }, tables: baseTables() });
});

describe('getPlayerToday — readiness gate never fabricates a green band (#377)', () => {
  it('no check-in row at all -> available:false with a prompt note, never a fabricated band', async () => {
    const result = await getPlayerToday(TEAM_ID, { forDate: DAY });
    expect(result.authorized).toBe(true);
    expect(result.readiness.available).toBe(false);
    expect(result.readiness.band).toBeNull();
    expect(result.readiness.note).toMatch(/submit a check-in/i);
    expect(result.summary.readinessNeedsAttention).toBe(true);
  });

  it('a submitted illness check-in surfaces the REAL red band/reasons, never a swapped-in green', async () => {
    fake = createFakeSupabase({
      user: { id: USER_ID },
      tables: baseTables({
        helm_lifting_readiness_checkins: [
          {
            id: 'checkin-1',
            athlete_id: 'athlete-1',
            organization_id: 'org-1',
            checkin_date: DAY,
            sleep_quality: 3,
            energy_level: 3,
            stress_level: 3,
            soreness_overall: 3,
            lower_body_status: null,
            illness_flag: true,
            notes: null,
          },
        ],
      }),
    });

    const result = await getPlayerToday(TEAM_ID, { forDate: DAY });
    expect(result.readiness.available).toBe(true);
    expect(result.readiness.submittedToday).toBe(true);
    expect(result.readiness.band).toBe('red');
    expect(result.readiness.reasons).toContain('reported illness');
    expect(result.readiness.missingInputs).toContain('arm status');
    expect(result.readiness.stale).toBe(false);
    // Never a healthy-looking result: readinessNeedsAttention stays true even
    // though a check-in WAS submitted today (submittedToday alone is not
    // "fine" — the band still is).
    expect(result.summary.readinessNeedsAttention).toBe(true);
  });

  it('a genuinely healthy submitted check-in DOES resolve green (the contrast case)', async () => {
    fake = createFakeSupabase({
      user: { id: USER_ID },
      tables: baseTables({
        helm_lifting_readiness_checkins: [
          {
            id: 'checkin-2',
            athlete_id: 'athlete-1',
            organization_id: 'org-1',
            checkin_date: DAY,
            sleep_quality: 4, // -> 8h, not < 6
            energy_level: 4, // not <= 2
            stress_level: 2, // not >= 4
            soreness_overall: 2, // not >= 4
            lower_body_status: 2, // not >= 4
            illness_flag: false,
            notes: null,
          },
        ],
      }),
    });

    const result = await getPlayerToday(TEAM_ID, { forDate: DAY });
    expect(result.readiness.band).toBe('green');
    expect(result.readiness.submittedToday).toBe(true);
    expect(result.readiness.stale).toBe(false);
    // Only now — real green, submitted today, not stale — does the gate stop
    // asking for attention.
    expect(result.summary.readinessNeedsAttention).toBe(false);
  });
});

describe('getPlayerToday — sub-read failures are distinguishable from honest empty (#377)', () => {
  it('a genuinely empty coachActions/tasks table: available:true, items:[], error:null', async () => {
    const result = await getPlayerToday(TEAM_ID, { forDate: DAY });
    expect(result.coachActions.available).toBe(true);
    expect(result.coachActions.items).toEqual([]);
    expect(result.tasks.available).toBe(true);
    expect(result.tasks.items).toEqual([]);
    expect(result.error).toBeNull();
  });

  it('a FAILING coachActions query still reports available:true + items:[], but sets `error` — distinguishing it from genuine emptiness', async () => {
    failSelect(fake, 'baseball_actions', 'boom');

    const result = await getPlayerToday(TEAM_ID, { forDate: DAY });
    // Same shape as the honest-empty case above (available:true, items:[])...
    expect(result.coachActions.available).toBe(true);
    expect(result.coachActions.items).toEqual([]);
    // ...but `error` is now non-null, which is the ONLY signal that this is a
    // failure, not "your coach hasn't assigned anything".
    expect(result.error).toBe('Your coach assignments could not be loaded.');
  });

  it('a FAILING tasks query still reports available:true + items:[], but sets a DIFFERENT `error` string', async () => {
    failSelect(fake, 'baseball_task_assignments', 'boom');

    const result = await getPlayerToday(TEAM_ID, { forDate: DAY });
    expect(result.tasks.available).toBe(true);
    expect(result.tasks.items).toEqual([]);
    expect(result.error).toBe('Your tasks could not be loaded.');
  });

  it('a FAILING coachNotes query still reports available:true + items:[], but sets a DIFFERENT `error` string', async () => {
    failSelect(fake, 'baseball_coach_notes', 'boom');

    const result = await getPlayerToday(TEAM_ID, { forDate: DAY });
    expect(result.coachNotes.available).toBe(true);
    expect(result.coachNotes.items).toEqual([]);
    expect(result.error).toBe('Your coach notes could not be loaded.');
  });
});

describe('getPlayerToday — recent stats never fabricate provenance for a hand-entered row (#377)', () => {
  it('a hand-entered row (no import_run_id, no source_trust_level) gets trust:null + provenance:null', async () => {
    fake = createFakeSupabase({
      user: { id: USER_ID },
      tables: baseTables({
        baseball_player_stats: [
          {
            id: 'stat-hand',
            player_id: PLAYER_ID,
            team_id: TEAM_ID,
            stat_type: 'batting',
            session_date: DAY,
            session_name: 'Hand-entered line',
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

    const result = await getPlayerToday(TEAM_ID, { forDate: DAY });
    const row = result.recentStats.find((s) => s.id === 'stat-hand');
    expect(row).toBeTruthy();
    expect(row?.trust).toBeNull();
    expect(row?.provenance).toBeNull();
  });

  it('a stamped row (source_trust_level set) DOES get a real trust + provenance object', async () => {
    fake = createFakeSupabase({
      user: { id: USER_ID },
      tables: baseTables({
        baseball_player_stats: [
          {
            id: 'stat-stamped',
            player_id: PLAYER_ID,
            team_id: TEAM_ID,
            stat_type: 'batting',
            session_date: DAY,
            session_name: 'Imported line',
            source: 'csv_import',
            source_trust_level: 'staff_entered',
            source_match_tier: null,
            source_match_confidence: null,
            source_external_id: null,
            import_run_id: null,
          },
        ],
      }),
    });

    const result = await getPlayerToday(TEAM_ID, { forDate: DAY });
    const row = result.recentStats.find((s) => s.id === 'stat-stamped');
    expect(row).toBeTruthy();
    expect(row?.trust).not.toBeNull();
    expect(row?.provenance).not.toBeNull();
  });
});

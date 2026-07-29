// =============================================================================
// src/lib/baseball/__tests__/recruiting-cross-org-team-browse.test.ts
//
// Tenant-isolation RLS fix (migrations 20260729000100 + 20260729000200).
//
// Every cross-org "which teams belong to these programs?" read in the
// recruiting surfaces resolves through public.baseball_teams_public_profile,
// never public.baseball_teams. Once migration B lands, baseball_teams_select
// admits only teams the caller staffs or plays for, so a base-table read in
// these paths collapses to the coach's own program and Discover/Compare go
// silently empty. The view is security_invoker = false, so it keeps answering.
//
// The base table is wired to THROW in the double below. That is the point of
// the fixture: in a cross-org browse path, touching baseball_teams is the bug,
// and a test that only compared row counts would still pass while the query
// quietly reads the wrong relation.
//
// The view also drops programs with public_profile_mode = 'private'. That
// exclusion is asserted as intended behaviour, not tolerated as drift — a
// program that turned its public profile off has opted out of being surfaced
// to other programs, so its teams are not a recruiting-discovery target.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { createClient } from '@/lib/supabase/server';

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Row = Record<string, unknown>;

const PLAYER_OPEN_PROGRAM = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PLAYER_PRIVATE_PROGRAM = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const basePlayer = {
  first_name: 'Test',
  last_name: 'Player',
  avatar_url: null,
  city: null,
  state: 'NC',
  primary_position: null,
  secondary_position: null,
  grad_year: 2027,
  pitch_velo: 88,
  exit_velo: null,
  sixty_time: null,
  bats: null,
  throws: null,
  height_feet: null,
  height_inches: null,
  weight_lbs: null,
  gpa: null,
  high_school_name: null,
  has_video: false,
  recruiting_activated: true,
  updated_at: '2026-01-01',
  player_type: 'high_school',
};

// Both teams belong to the same discoverable high-school org. Only TEAM_OPEN
// appears in the view — TEAM_PRIVATE's program set public_profile_mode =
// 'private', which is exactly the row the view's WHERE clause removes.
const TABLES: Record<string, Row[]> = {
  organizations: [{ id: 'org-hs', type: 'high_school' }],
  baseball_teams_public_profile: [{ id: 'team-open', organization_id: 'org-hs' }],
  baseball_team_members: [
    { team_id: 'team-open', player_id: PLAYER_OPEN_PROGRAM },
    { team_id: 'team-private', player_id: PLAYER_PRIVATE_PROGRAM },
  ],
  baseball_team_coach_staff: [],
  baseball_player_settings: [],
  baseball_coaches: [{ id: 'coach-1', coach_type: 'college', user_id: 'user-1' }],
  baseball_players: [
    { ...basePlayer, id: PLAYER_OPEN_PROGRAM },
    { ...basePlayer, id: PLAYER_PRIVATE_PROGRAM },
  ],
};

/**
 * A PostgREST-shaped double that actually applies the filters it is given, so
 * the assertions below are about returned rows rather than about which spy was
 * called with which string.
 */
function makeChain(rows: Row[]) {
  const preds: Array<(r: Row) => boolean> = [];
  const apply = () => rows.filter((r) => preds.every((p) => p(r)));

  const chain = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      preds.push((r) => r[col] === val);
      return chain;
    },
    neq: (col: string, val: unknown) => {
      preds.push((r) => r[col] !== val);
      return chain;
    },
    in: (col: string, vals: readonly unknown[]) => {
      preds.push((r) => vals.includes(r[col]));
      return chain;
    },
    not: (col: string, op: string, val: string) => {
      if (op === 'in') {
        const excluded = val.replace(/^\(|\)$/g, '').split(',').filter(Boolean);
        preds.push((r) => !excluded.includes(String(r[col])));
      }
      return chain;
    },
    or: () => chain,
    gte: () => chain,
    lte: () => chain,
    order: () => chain,
    range: (from: number, to: number) => {
      const matched = apply();
      return Promise.resolve({
        data: matched.slice(from, to + 1),
        count: matched.length,
        error: null,
      });
    },
    single: () => Promise.resolve({ data: apply()[0] ?? null, error: null }),
    maybeSingle: () => Promise.resolve({ data: apply()[0] ?? null, error: null }),
    then: (
      onFulfilled?: ((value: { data: Row[]; error: null }) => unknown) | null,
      onRejected?: ((reason: unknown) => unknown) | null,
    ) => Promise.resolve({ data: apply(), error: null }).then(onFulfilled, onRejected),
  };

  return chain;
}

const tablesRead: string[] = [];

const from = vi.fn((table: string) => {
  tablesRead.push(table);
  if (table === 'baseball_teams') {
    throw new Error(
      'cross-org browse read the tenant-scoped base table public.baseball_teams; ' +
        'it must read public.baseball_teams_public_profile',
    );
  }
  return makeChain(TABLES[table] ?? []);
});

const supabase = { auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) }, from };

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => supabase),
}));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
}));
// The withBaseballAction wrapper's Sentry scope and demo guard are inert here —
// this file tests which relation the browse reads, not the guard mechanics.
vi.mock('@sentry/nextjs', () => ({
  withScope: (fn: (scope: unknown) => unknown) =>
    fn({ setTag: vi.fn(), setUser: vi.fn(), addBreadcrumb: vi.fn() }),
}));
vi.mock('@/lib/demo/baseball-config.server', () => ({
  isCurrentSessionBaseballDemo: vi.fn(async () => false),
  isBaseballDemoCoachEmail: vi.fn(() => false),
}));

import { assertCoachCanRecruitPlayer } from '@/lib/baseball/recruitability';
import { getDiscoverPlayers } from '@/app/baseball/actions/discover';

describe('cross-org team browse reads baseball_teams_public_profile', () => {
  beforeEach(() => {
    tablesRead.length = 0;
  });

  it('recruitability: resolves discoverable teams through the view, not the base table', async () => {
    const result = await assertCoachCanRecruitPlayer(
      supabase as unknown as Supabase,
      'coach-1',
      'college',
      PLAYER_OPEN_PROGRAM,
    );

    expect(result).toEqual({ allowed: true });
    expect(tablesRead).toContain('baseball_teams_public_profile');
    expect(tablesRead).not.toContain('baseball_teams');
  });

  it('recruitability: a player whose only program is private is not on a discoverable team', async () => {
    const result = await assertCoachCanRecruitPlayer(
      supabase as unknown as Supabase,
      'coach-1',
      'college',
      PLAYER_PRIVATE_PROGRAM,
    );

    // The player is activated, public and non-college — the sole reason for the
    // denial is that the view withholds their program's team, which is the
    // intended meaning of public_profile_mode = 'private'.
    expect(result).toEqual({ allowed: false, reason: 'not_on_discoverable_team' });
  });

  it('discover: getDiscoverPlayers surfaces only players on a team the view returns', async () => {
    const { players } = await getDiscoverPlayers({});

    expect(players.map((p) => p.id)).toEqual([PLAYER_OPEN_PROGRAM]);
    expect(tablesRead).toContain('baseball_teams_public_profile');
    expect(tablesRead).not.toContain('baseball_teams');
  });
});

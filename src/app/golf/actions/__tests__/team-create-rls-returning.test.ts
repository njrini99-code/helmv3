import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Creating a golf team must not read the new row back through RLS.
 *
 * `.insert().select()` compiles to INSERT ... RETURNING, and RETURNING is
 * filtered by the SELECT policy. `golf_teams_select` is
 * `USING (is_golf_team_coach(id) OR is_golf_team_player(id))`, and
 * `is_golf_team_coach` requires a `golf_team_coach_staff` row — which for a
 * team being created right now does not exist yet; it is inserted moments
 * later. So the creator could never read back the team they had just made and
 * the whole statement failed with 42501.
 *
 * Observed on production 2026-08-05: Shenandoah's head coach could not add
 * their Women's team at all ("Failed to create team. Please try again."), so
 * the program stayed on one team and the top-bar team toggle — which only
 * renders for a head coach with more than one team — never appeared.
 *
 * These tests fail if anyone reintroduces a RETURNING on the create path.
 */

const mockGetUser = vi.fn(async () => ({
  data: { user: { id: 'user-coach-1', email: 'coach@su.edu' } },
  error: null,
}));

/** Records every table touched, and whether a select() followed an insert(). */
function buildClient(label: string, sink: string[], seed: Record<string, unknown>) {
  const from = vi.fn((table: string) => {
    let inserted = false;
    const chain: Record<string, unknown> = {};
    const result = () => ({ data: seed[table] ?? null, error: null });

    chain.insert = vi.fn(() => { inserted = true; sink.push(`${label}:insert:${table}`); return chain; });
    chain.select = vi.fn(() => {
      // THE ASSERTION TARGET: a select() chained onto an insert() is a
      // RETURNING clause, which RLS filters.
      if (inserted) sink.push(`${label}:RETURNING:${table}`);
      else sink.push(`${label}:select:${table}`);
      return chain;
    });
    for (const m of ['update', 'upsert', 'delete', 'eq', 'in', 'order', 'limit']) {
      chain[m] = vi.fn(() => chain);
    }
    chain.single = vi.fn(async () => result());
    chain.maybeSingle = vi.fn(async () => result());
    chain.then = vi.fn((ok: (v: unknown) => void) => { void Promise.resolve(result()).then(ok); });
    return chain;
  });
  return from;
}

const calls: string[] = [];
const serverSeed: Record<string, unknown> = {};
const adminSeed: Record<string, unknown> = {};

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: buildClient('user', calls, serverSeed),
    rpc: vi.fn(async () => ({ data: null, error: null })),
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: buildClient('admin', calls, adminSeed) })),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(), logServerException: vi.fn(), logServerEvent: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { addSecondTeam } from '../teams';

describe('addSecondTeam — team creation must not use RETURNING', () => {
  beforeEach(() => {
    calls.length = 0;
    vi.clearAllMocks();
    for (const k of Object.keys(serverSeed)) delete serverSeed[k];
    for (const k of Object.keys(adminSeed)) delete adminSeed[k];

    serverSeed.golf_coaches = { id: 'coach-1', organization_id: 'org-1' };
    serverSeed.golf_team_coach_staff = { id: 'staff-primary', is_primary: true };
    serverSeed.golf_teams = { gender: 'mens' }; // existing men's team, no conflict
    // What the elevated read-back finds after the insert.
    adminSeed.golf_teams = {
      id: 'team-womens',
      name: "Shenandoah University Women's Golf",
      season: '2026-2027',
      join_code: 'ZZZ12345',
      created_at: '2026-08-05T00:00:00Z',
      organization_id: 'org-1',
    };
  });

  it('creates the team', async () => {
    const res = await addSecondTeam("Shenandoah University Women's Golf", 'womens');
    expect(res.success).toBe(true);
  });

  it('never chains select() onto the golf_teams insert', async () => {
    await addSecondTeam("Shenandoah University Women's Golf", 'womens');

    const returning = calls.filter((c) => c.endsWith('RETURNING:golf_teams'));
    expect(returning, `RETURNING on golf_teams is filtered by RLS and fails 42501 — calls: ${calls.join(' | ')}`)
      .toHaveLength(0);
  });

  it('inserts the team with the CALLER’s client, not the admin one', async () => {
    // The RLS write check must still authorize the create. Only the read-back
    // is elevated — silently doing the whole thing as service-role would drop
    // that check.
    await addSecondTeam("Shenandoah University Women's Golf", 'womens');

    expect(calls).toContain('user:insert:golf_teams');
    expect(calls).not.toContain('admin:insert:golf_teams');
  });

  it('reads the new team back with the admin client', async () => {
    await addSecondTeam("Shenandoah University Women's Golf", 'womens');

    const idx = calls.indexOf('user:insert:golf_teams');
    const readback = calls.findIndex((c) => c === 'admin:select:golf_teams');
    expect(readback).toBeGreaterThan(idx);
  });

  it('still grants the head-coach staff row on the new team', async () => {
    // Without this the coach cannot see or manage the team they just made —
    // is_golf_team_coach() is exactly what the staff row satisfies.
    await addSecondTeam("Shenandoah University Women's Golf", 'womens');

    expect(calls).toContain('admin:insert:golf_team_coach_staff');
  });
});

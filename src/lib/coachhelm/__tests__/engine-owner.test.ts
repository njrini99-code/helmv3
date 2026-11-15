import { describe, expect, it } from 'vitest';
import { resolveEngineOwner } from '../engine-owner';

/**
 * rel:7d52f412 / rel:842340ab / 3ca3e034: when a player has no active team, or the
 * team's organization has no golf_coaches row, the lookup finds zero rows. With
 * `.single()` PostgREST answers that with HTTP 406 "Cannot coerce the result to a
 * single JSON object" (PGRST116), which the reliability collector files as a
 * failure of /api/cron/coachhelm-roster-sweep on every sweep. Zero rows is an
 * expected answer here (the engine parks the player), so the reads use
 * `.maybeSingle()`: same result, no 406.
 */
type Rows = Record<string, unknown[]>;

function fakeAdmin(rows: Rows) {
  const calls: string[] = [];
  const from = (table: string) => {
    const data = rows[table] ?? [];
    const builder: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'limit']) builder[m] = () => builder;
    builder.single = async () => {
      calls.push(`${table}.single`);
      return data.length === 1
        ? { data: data[0], error: null }
        : { data: null, error: { code: 'PGRST116', message: 'Cannot coerce the result to a single JSON object' } };
    };
    builder.maybeSingle = async () => {
      calls.push(`${table}.maybeSingle`);
      return { data: data[0] ?? null, error: null };
    };
    return builder;
  };
  return { admin: { from } as never, calls };
}

describe('resolveEngineOwner: zero-row lookups do not make PostgREST answer 406', () => {
  it('a player with no active team is no_team, without a .single() read', async () => {
    const { admin, calls } = fakeAdmin({ golf_team_members: [] });
    await expect(resolveEngineOwner(admin, 'p1')).resolves.toEqual({ kind: 'no_team' });
    expect(calls.filter((c) => c.endsWith('.single'))).toEqual([]);
  });

  it("a team whose organization has no coach row is no_coach, without a .single() read", async () => {
    const { admin, calls } = fakeAdmin({
      golf_team_members: [{ team_id: 't1', golf_teams: { organization_id: 'o1' } }],
      golf_coaches: [],
    });
    await expect(resolveEngineOwner(admin, 'p1')).resolves.toEqual({ kind: 'no_coach', teamId: 't1' });
    expect(calls.filter((c) => c.endsWith('.single'))).toEqual([]);
  });

  it('the happy path is unchanged', async () => {
    const { admin } = fakeAdmin({
      golf_team_members: [{ team_id: 't1', golf_teams: { organization_id: 'o1' } }],
      golf_coaches: [{ id: 'c1' }],
    });
    await expect(resolveEngineOwner(admin, 'p1')).resolves.toEqual({ kind: 'ok', teamId: 't1', coachId: 'c1' });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { CausalRelationship } from '@/lib/coachhelm/v2/types';

// ---------------------------------------------------------------------------
// Regression guard for the golf_causal_relationships stale-data hole.
//
// Every fire re-tests the hypothesis set over the player's last 100 rounds. A
// relationship that stops passing is absent from the fresh batch — before the
// fix its prior row lingered as is_active=true forever and the panel surfaced
// stale strength/confidence. saveRelationships() now soft-supersedes this
// player's active rows that did NOT fire this run (is_active=false, NEVER
// delete), reactivates survivors via is_active=true in the upsert payload, and
// — because reaching the save path means analysis genuinely ran — retires ALL
// active rows when the run produced nothing.
// ---------------------------------------------------------------------------

const { record, state, adminFromMock } = vi.hoisted(() => {
  const record = {
    inserts: [] as Array<Record<string, unknown>>,
    updates: [] as Array<Record<string, unknown>>,
    eqs: [] as Array<[string, unknown]>,
    nots: [] as Array<[string, string, unknown]>,
    deletes: 0,
  };
  const state = { lookup: { data: null as { id: string } | null, error: null as unknown } };

  // Single fluent builder reused for the whole saveRelationships call (the
  // production code calls supabase.from() once and chains off it).
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.insert = (row: Record<string, unknown>) => {
    record.inserts.push(row);
    return Promise.resolve({ error: null });
  };
  builder.update = (payload: Record<string, unknown>) => {
    record.updates.push(payload);
    return builder;
  };
  builder.delete = () => {
    record.deletes += 1;
    return builder;
  };
  builder.eq = (col: string, val: unknown) => {
    record.eqs.push([col, val]);
    return builder;
  };
  builder.not = (col: string, op: string, val: unknown) => {
    record.nots.push([col, op, val]);
    return builder;
  };
  builder.limit = () => builder;
  builder.order = () => builder;
  builder.maybeSingle = () => Promise.resolve(state.lookup);
  // Thenable: awaiting the .update()...chain resolves to { error: null }.
  builder.then = (resolve: (v: { error: null }) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve({ error: null as null }).then(resolve, reject);

  const adminFromMock = vi.fn(() => builder);
  return { record, state, adminFromMock };
});

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: adminFromMock }),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));

const { CausalEngine } = await import('@/lib/coachhelm/v2/mining/causal-engine');

type SaveRels = { saveRelationships: (r: CausalRelationship[]) => Promise<void> };

function makeRel(id: string, cause: string): CausalRelationship {
  return {
    id,
    playerId: 'player-1',
    teamId: 'team-1',
    cause,
    causeMetric: `${cause}_metric`,
    effect: 'scoring',
    effectMetric: 'score_to_par',
    relationshipType: 'direct',
    strength: 0.5,
    confidence: 0.8,
    mechanism: 'because',
    confounders: [],
    doseResponse: true,
    interventionPotential: 0.7,
    evidence: {
      temporalPrecedence: true,
      doseResponseConfirmed: true,
      confoundersControlled: [],
      naturalExperiments: [],
    },
    validationCount: 1,
  };
}

describe('CausalEngine.saveRelationships soft-supersede (stale-data fix)', () => {
  beforeEach(() => {
    record.inserts.length = 0;
    record.updates.length = 0;
    record.eqs.length = 0;
    record.nots.length = 0;
    record.deletes = 0;
    state.lookup = { data: null, error: null };
  });

  it('inserts fired relationships active, then retires this player\'s other active rows', async () => {
    state.lookup = { data: null, error: null }; // every rel is new → INSERT
    const engine = new CausalEngine('player-1', 'team-1');

    await (engine as unknown as SaveRels).saveRelationships([makeRel('rel-1', 'putting'), makeRel('rel-2', 'practice_frequency')]);

    // Fired rows persisted active.
    expect(record.inserts).toHaveLength(2);
    expect(record.inserts.every((r) => r.is_active === true)).toBe(true);

    // Exactly one supersede UPDATE, setting is_active=false. Never a delete.
    const supersede = record.updates.filter((u) => u.is_active === false);
    expect(supersede).toHaveLength(1);
    expect(record.deletes).toBe(0);

    // Scoped to this player + currently-active rows, excluding the fired ids.
    expect(record.eqs).toContainEqual(['player_id', 'player-1']);
    expect(record.eqs).toContainEqual(['is_active', true]);
    expect(record.nots).toContainEqual(['id', 'in', '("rel-1","rel-2")']);
  });

  it('retires ALL active rows when the run produced no relationships (no id exclusion)', async () => {
    const engine = new CausalEngine('player-1', 'team-1');

    await (engine as unknown as SaveRels).saveRelationships([]);

    expect(record.inserts).toHaveLength(0);
    const supersede = record.updates.filter((u) => u.is_active === false);
    expect(supersede).toHaveLength(1);
    expect(record.eqs).toContainEqual(['player_id', 'player-1']);
    expect(record.eqs).toContainEqual(['is_active', true]);
    // No id-exclusion list — retire everything for the player.
    expect(record.nots).toHaveLength(0);
    expect(record.deletes).toBe(0);
  });

  it('reactivates an existing row in place (is_active=true) and keeps it as a survivor', async () => {
    state.lookup = { data: { id: 'existing-1' }, error: null }; // natural-key hit → UPDATE in place
    const engine = new CausalEngine('player-1', 'team-1');

    await (engine as unknown as SaveRels).saveRelationships([makeRel('rel-1', 'putting')]);

    expect(record.inserts).toHaveLength(0);
    // First update is the in-place reactivation carrying the engine payload.
    expect(record.updates[0]).toMatchObject({ is_active: true, relationship_type: 'direct' });
    // The survivor (existing-1) is excluded from the supersede.
    expect(record.nots).toContainEqual(['id', 'in', '("existing-1")']);
    expect(record.updates.filter((u) => u.is_active === false)).toHaveLength(1);
    expect(record.deletes).toBe(0);
  });
});

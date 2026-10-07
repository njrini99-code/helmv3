import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Regression guard (Bridge ca4409c2 / ed64f3b6, 2026-09-28 01:19 UTC): the
// player CoachHelm page READ must not WRITE golf_causal_relationships.
//
// getPlayerCoachHelmDashboardImpl calls analyzePlayer with
// `persistPatterns: false` / `runInsightGenerators: false` so a page view has
// no side-effecting write on its critical path. The causal engine ignored
// that: `discoverCausalRelationships()` always ran `saveRelationships`
// (a lookup + UPDATE/INSERT per relationship, then a supersede sweep), and
// any failure there THROWS, rejecting analyzePlayer's Promise.all and failing
// the whole page: "getPlayerCoachHelmDashboard failed: Failed to update
// CoachHelm causal relationship: TypeError: fetch failed".
//
// Contract: `discoverCausalRelationships({ persist: false })` computes and
// returns the relationships without touching golf_causal_relationships; the
// default (persist) keeps writing for the legitimate writers (post-round
// trigger, crons).
// ---------------------------------------------------------------------------

const { state, adminFromMock } = vi.hoisted(() => {
  const state = {
    fixture: [] as Array<Record<string, unknown>>,
    writeTables: [] as string[],
  };

  function makeRoundsBuilder() {
    const builder: Record<string, unknown> = {};
    builder.select = () => builder;
    builder.eq = () => builder;
    builder.order = () => builder;
    builder.limit = () => builder;
    builder.then = (
      resolve: (v: { data: unknown; error: null }) => unknown,
      reject?: (e: unknown) => unknown,
    ) => Promise.resolve({ data: [...state.fixture], error: null as null }).then(resolve, reject);
    return builder;
  }

  /** Every non-golf_rounds table access is recorded; the update fails like the incident. */
  function makeWriteBuilder(table: string) {
    state.writeTables.push(table);
    const builder: Record<string, unknown> = {};
    builder.select = () => builder;
    builder.insert = () => Promise.resolve({ error: null });
    builder.update = () => builder;
    builder.delete = () => builder;
    builder.eq = () => builder;
    builder.not = () => builder;
    builder.in = () => builder;
    builder.limit = () => builder;
    builder.order = () => builder;
    builder.maybeSingle = () => Promise.resolve({ data: { id: 'existing-row' }, error: null });
    builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve({ error: { message: 'TypeError: fetch failed' } }).then(resolve, reject);
    return builder;
  }

  const adminFromMock = vi.fn((table: string) =>
    table === 'golf_rounds' ? makeRoundsBuilder() : makeWriteBuilder(table),
  );
  return { state, adminFromMock };
});

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: adminFromMock }),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));

import { CausalEngine } from '@/lib/coachhelm/v2/mining/causal-engine';

/** 40 rounds (newest first, as the query returns them) with strongly coupled stats. */
function buildFixture(): Array<Record<string, unknown>> {
  return Array.from({ length: 40 }, (_, i) => {
    const putts = 27 + (i % 8);
    const day = new Date(Date.UTC(2026, 0, 1 + i * 3));
    return {
      id: `round-${i}`,
      // score tracks putts and GIR so hypotheses find real relationships
      score_to_par: putts - 30 + (i % 3),
      round_date: day.toISOString().slice(0, 10),
      total_putts: putts,
      total_fairways_hit: 6 + (i % 6),
      total_gir: 14 - (i % 8),
    };
  }).reverse();
}

describe('CausalEngine — a read-only caller never writes golf_causal_relationships', () => {
  beforeEach(() => {
    state.fixture = buildFixture();
    state.writeTables = [];
    adminFromMock.mockClear();
  });

  it('persist: false returns the relationships without any causal-table access, so a write failure cannot fail the read', async () => {
    const engine = new CausalEngine('player-1', 'team-1');
    const relationships = await engine.discoverCausalRelationships({ persist: false });

    expect(Array.isArray(relationships)).toBe(true);
    expect(state.writeTables).not.toContain('golf_causal_relationships');
  });

  it('the default still persists (the post-round trigger and crons are the writers)', async () => {
    const engine = new CausalEngine('player-1', 'team-1');
    const relationships = await engine
      .discoverCausalRelationships()
      .catch(() => 'threw' as const);

    // The fixture must produce relationships, or the write path is never exercised
    // and the persist:false assertion above would pass vacuously.
    expect(state.writeTables).toContain('golf_causal_relationships');
    // With the failing UPDATE stub, the writer surfaces the failure (unchanged behaviour).
    expect(relationships).toBe('threw');
  });
});

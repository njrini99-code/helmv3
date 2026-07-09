/**
 * Regression tests for the coach LLM chat tools' visibility filter (audit P2).
 *
 * `get_player_insights` and `get_team_patterns` read `golf_coach_insights` and
 * feed the rows straight into the coach chat context. They MUST apply the SAME
 * product-visibility contract every coach surface uses (v3 engine only, visible
 * lifecycle states, not dismissed) so the agent can never quote a stale v2
 * phantom or a sweep-retracted (archived-but-status-active) insight as current.
 * `get_player_insights` must ALSO select `lifecycle_state` so a retracted row
 * can never be resurfaced downstream.
 *
 * The mock builder SIMULATES the PostgREST predicates; the tests fail if either
 * handler drops the shared `.or` / `.in` / `.neq` filter.
 */

import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import {
  V3_ENGINE_FILTER,
  VISIBLE_LIFECYCLE_STATES,
} from '@/lib/coachhelm/v3/insight-visibility';
import { get_player_insights, get_team_patterns } from '@/lib/coachhelm/v3/chat/tools';

const PLAYER = '11111111-1111-4111-9111-111111111111';
const TEAM = '22222222-2222-4222-9222-222222222222';

interface FixtureRow {
  id: string;
  insight_type: string;
  category: string | null;
  title: string;
  content: string | null;
  evidence: Record<string, unknown> | null;
  created_at: string;
  player_id: string | null;
  engine_version: string | null;
  signature: string | null;
  lifecycle_state: string;
  status: string;
}

function row(over: Partial<FixtureRow> & { id: string }): FixtureRow {
  return {
    insight_type: 'putt_distance_control',
    category: 'putting',
    title: `Insight ${over.id}`,
    content: 'body',
    evidence: { metric_label: 'Putts/round', your_value_display: '30.1' },
    // Dynamic: get_team_patterns filters gte(created_at, now − window). A
    // hardcoded date here is a time bomb — it silently ages out of the window.
    created_at: new Date(Date.now() - 5 * 86400_000).toISOString(),
    player_id: PLAYER,
    engine_version: 'v3',
    signature: 'v3:putting:abc',
    lifecycle_state: 'detected',
    status: 'active',
    ...over,
  };
}

/** Chainable, thenable builder that applies the predicates to `rows`. */
function makeInsightsBuilder(rows: FixtureRow[]) {
  let filtered = [...rows];
  let selected = '';
  const calls: Record<string, unknown[][]> = {};
  const record = (name: string, args: unknown[]) => {
    (calls[name] ??= []).push(args);
  };
  const builder = {
    select: vi.fn((cols: string) => {
      record('select', [cols]);
      selected = cols;
      return builder;
    }),
    eq: vi.fn((col: string, v: unknown) => {
      record('eq', [col, v]);
      filtered = filtered.filter((r) => r[col as keyof FixtureRow] === v);
      return builder;
    }),
    neq: vi.fn((col: string, v: unknown) => {
      record('neq', [col, v]);
      filtered = filtered.filter((r) => r[col as keyof FixtureRow] !== v);
      return builder;
    }),
    in: vi.fn((col: string, values: string[]) => {
      record('in', [col, values]);
      filtered = filtered.filter((r) => values.includes(String(r[col as keyof FixtureRow])));
      return builder;
    }),
    gte: vi.fn((col: string, v: string) => {
      record('gte', [col, v]);
      filtered = filtered.filter((r) => String(r[col as keyof FixtureRow]) >= v);
      return builder;
    }),
    or: vi.fn((expr: string) => {
      record('or', [expr]);
      expect(expr).toBe(V3_ENGINE_FILTER);
      filtered = filtered.filter(
        (r) => r.engine_version === 'v3' || (r.signature ?? '').startsWith('v3:'),
      );
      return builder;
    }),
    order: vi.fn((...a: unknown[]) => (record('order', a), builder)),
    limit: vi.fn((n: number) => {
      record('limit', [n]);
      return Promise.resolve({ data: filtered.slice(0, n), error: null });
    }),
    then: (onFulfilled?: ((value: unknown) => unknown) | null) => {
      const p = Promise.resolve({ data: filtered, error: null });
      return onFulfilled ? p.then(onFulfilled) : p;
    },
  };
  return { builder, calls, selectedCols: () => selected };
}

function makeClient(insightRows: FixtureRow[], opts?: { members?: Array<{ player_id: string }> }) {
  const { builder, calls, selectedCols } = makeInsightsBuilder(insightRows);
  const membersBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnValue(
      Promise.resolve({ data: opts?.members ?? [{ player_id: PLAYER }], error: null }),
    ),
  };
  // get_team_patterns chains .eq twice (team_id, status) then awaits — give the
  // members builder a thenable .eq chain.
  let memberEqCount = 0;
  membersBuilder.eq = vi.fn(() => {
    memberEqCount += 1;
    if (memberEqCount >= 2) {
      return Promise.resolve({ data: opts?.members ?? [{ player_id: PLAYER }], error: null });
    }
    return membersBuilder;
  }) as unknown as typeof membersBuilder.eq;

  const client = {
    from: vi.fn((table: string) => {
      if (table === 'golf_coach_insights') return builder;
      if (table === 'golf_team_members') return membersBuilder;
      throw new Error(`Unexpected table: ${table}`);
    }),
  } as unknown as SupabaseClient<Database>;
  return { client, calls, selectedCols };
}

describe('chat tool visibility filters (audit P2)', () => {
  it('get_player_insights applies the shared contract and selects lifecycle_state', async () => {
    const rows: FixtureRow[] = [
      row({ id: 'visible' }),
      // Stale v2 phantom — must be excluded by the engine filter.
      row({ id: 'v2', engine_version: 'v2', signature: 'par_scoring_par4:x' }),
      // Sweep-archived row (status still 'active') — excluded by lifecycle.
      row({ id: 'archived', lifecycle_state: 'archived' }),
      // Dismissed — excluded.
      row({ id: 'dismissed', status: 'dismissed' }),
    ];
    const { client, calls, selectedCols } = makeClient(rows);

    const out = await get_player_insights(client, { player_id: PLAYER, limit: 5 });

    // Only the one visible row survived.
    expect(out.insights.map((i) => i.id)).toEqual(['visible']);
    // Shared contract applied verbatim.
    expect(calls.or).toEqual([[V3_ENGINE_FILTER]]);
    expect(calls.in).toEqual([['lifecycle_state', [...VISIBLE_LIFECYCLE_STATES]]]);
    expect(calls.neq).toEqual([['status', 'dismissed']]);
    // lifecycle_state must be in the SELECT so retracted rows can't be quoted.
    expect(selectedCols()).toContain('lifecycle_state');
    // …and surfaced on the returned shape.
    expect(out.insights[0]).toHaveProperty('lifecycle_state');
  });

  it('get_team_patterns applies the shared visibility contract', async () => {
    const rows: FixtureRow[] = [
      row({ id: 'a', insight_type: 'putt_distance_control' }),
      row({ id: 'b', insight_type: 'putt_distance_control' }),
      // Archived row that would have inflated the rollup.
      row({ id: 'arch', insight_type: 'putt_distance_control', lifecycle_state: 'archived' }),
      // v2 phantom.
      row({ id: 'v2', insight_type: 'par_scoring', engine_version: 'v2', signature: 'p:x' }),
    ];
    const { client, calls } = makeClient(rows);

    const out = await get_team_patterns(client, { team_id: TEAM, window_days: 30 });

    expect(calls.or).toEqual([[V3_ENGINE_FILTER]]);
    // The query also chains .in('player_id', …) before the helper, so assert
    // the lifecycle predicate is PRESENT (not the sole .in call).
    expect(calls.in).toContainEqual(['lifecycle_state', [...VISIBLE_LIFECYCLE_STATES]]);
    expect(calls.neq).toEqual([['status', 'dismissed']]);
    // Only the two visible putt rows counted (one player → player_count 1).
    const putt = out.patterns.find((p) => p.insight_type === 'putt_distance_control');
    expect(putt?.player_count).toBe(1);
    expect(out.patterns.find((p) => p.insight_type === 'par_scoring')).toBeUndefined();
  });
});

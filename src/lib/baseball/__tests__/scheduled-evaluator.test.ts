// =============================================================================
// Tests for the CoachHelm baseball SCHEDULED EVALUATOR — the daily heartbeat.
//
// THE GAP these lock (V5 System 1 "Signals are the heartbeat of BaseballHelm"):
// the engine used to fire ONLY on a manual click / post-import, so nothing ran
// the rule evaluator on a cadence and nothing ever swept expires_at. These pin:
//   1. resolveOwningCoachByTeam — the DETERMINISTIC owner-precedence rule
//      (is_primary > head/assoc/assistant role > first seen) so daily re-runs
//      keep a stable coach_id owner on the upserted insight rows.
//   2. sweepExpiredSignals — the TTL actor: only UNTRIAGED open signals whose
//      expires_at has passed flip to the first-class 'expired' disposition; a
//      coach-triaged signal is NEVER walked back; nothing is deleted.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { resolveOwningCoachByTeam } from '@/lib/baseball/coachhelm/scheduled-evaluator';
import { sweepExpiredSignals } from '@/lib/baseball/coachhelm/engine-run';

describe('resolveOwningCoachByTeam — deterministic owner precedence', () => {
  it('prefers the is_primary coach over everything else', () => {
    const out = resolveOwningCoachByTeam([
      { team_id: 't1', coach_id: 'assistant', role: 'assistant_coach', is_primary: false },
      { team_id: 't1', coach_id: 'primary', role: 'volunteer', is_primary: true },
      { team_id: 't1', coach_id: 'head', role: 'head_coach', is_primary: false },
    ]);
    // is_primary wins even though its role is the LOWEST precedence.
    expect(out.get('t1')).toBe('primary');
  });

  it('falls back to role precedence (head > assoc > assistant) when no primary', () => {
    const out = resolveOwningCoachByTeam([
      { team_id: 't1', coach_id: 'assistant', role: 'assistant_coach', is_primary: false },
      { team_id: 't1', coach_id: 'assoc', role: 'associate_head_coach', is_primary: false },
      { team_id: 't1', coach_id: 'head', role: 'head_coach', is_primary: false },
    ]);
    expect(out.get('t1')).toBe('head');
  });

  it('falls back to first-seen when neither primary nor a ranked role exists', () => {
    const out = resolveOwningCoachByTeam([
      { team_id: 't1', coach_id: 'analyst', role: 'analyst', is_primary: false },
      { team_id: 't1', coach_id: 'volunteer', role: 'volunteer', is_primary: false },
    ]);
    expect(out.get('t1')).toBe('analyst');
  });

  it('is stable across two calls with the same staff set (idempotent owner)', () => {
    const staff = [
      { team_id: 't1', coach_id: 'b', role: 'assistant_coach', is_primary: false },
      { team_id: 't1', coach_id: 'a', role: 'head_coach', is_primary: false },
    ];
    expect(resolveOwningCoachByTeam(staff).get('t1')).toBe(
      resolveOwningCoachByTeam(staff).get('t1'),
    );
  });

  it('resolves each team independently', () => {
    const out = resolveOwningCoachByTeam([
      { team_id: 't1', coach_id: 'h1', role: 'head_coach', is_primary: false },
      { team_id: 't2', coach_id: 'p2', role: 'analyst', is_primary: true },
    ]);
    expect(out.get('t1')).toBe('h1');
    expect(out.get('t2')).toBe('p2');
  });

  it('drops rows missing team_id or coach_id', () => {
    const out = resolveOwningCoachByTeam([
      { team_id: null, coach_id: 'x', role: 'head_coach', is_primary: true },
      { team_id: 't1', coach_id: null, role: 'head_coach', is_primary: true },
    ]);
    expect(out.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Minimal fake Supabase query builder for sweepExpiredSignals. It records the
// disposition filter the sweep applies and the update payload, and returns the
// rows the test seeds for the SELECT. This mirrors the .from().select()....
// chain shape the sweep uses without a live DB.
// ---------------------------------------------------------------------------

interface SignalSeed {
  id: string;
  disposition: string;
  expires_at: string | null;
}

function makeFakeClient(seed: SignalSeed[], nowIso: string) {
  const captured = { updatedIds: [] as string[], updatePayload: null as unknown };

  function selectChain() {
    const filters: { dispositions?: string[]; notNullExpires?: boolean; ltExpires?: string } = {};
    const chain: Record<string, unknown> = {};
    chain.eq = () => chain; // team_id scope — ignored in the fake
    chain.in = (_col: string, vals: string[]) => {
      filters.dispositions = vals;
      return chain;
    };
    chain.not = () => {
      filters.notNullExpires = true;
      return chain;
    };
    chain.lt = (_col: string, val: string) => {
      filters.ltExpires = val;
      // Terminal: resolve the SELECT applying the recorded filters.
      const rows = seed.filter(
        (r) =>
          (filters.dispositions ?? []).includes(r.disposition) &&
          r.expires_at != null &&
          r.expires_at < val,
      );
      return Promise.resolve({ data: rows.map((r) => ({ id: r.id })), error: null });
    };
    return chain;
  }

  function updateChain(payload: unknown) {
    captured.updatePayload = payload;
    return {
      in: (_col: string, ids: string[]) => {
        captured.updatedIds = ids;
        return Promise.resolve({ error: null });
      },
    };
  }

  const client = {
    from: () => ({
      select: () => selectChain(),
      update: (payload: unknown) => updateChain(payload),
    }),
  };
  return { client, captured, nowIso };
}

describe('sweepExpiredSignals — TTL actor (the expires_at gap)', () => {
  const NOW = '2026-06-24T00:00:00.000Z';
  const PAST = '2026-06-20T00:00:00.000Z';
  const FUTURE = '2026-07-01T00:00:00.000Z';

  it('only expires UNTRIAGED open signals whose expires_at has passed', async () => {
    const { client, captured } = makeFakeClient(
      [
        { id: 'expired-new', disposition: 'new', expires_at: PAST },
        { id: 'expired-thin', disposition: 'sample_too_small', expires_at: PAST },
        { id: 'fresh-new', disposition: 'new', expires_at: FUTURE },
        // triaged states must NOT be eligible (excluded by the disposition filter)
        { id: 'acked', disposition: 'acknowledged', expires_at: PAST },
        { id: 'converted', disposition: 'converted', expires_at: PAST },
        { id: 'no-ttl', disposition: 'new', expires_at: null },
      ],
      NOW,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const count = await sweepExpiredSignals(client as any, 'team-1', NOW);

    expect(count).toBe(2);
    expect(captured.updatedIds.sort()).toEqual(['expired-new', 'expired-thin']);
    // first-class 'expired' disposition (NOT 'resolved'), soft + non-destructive.
    expect(captured.updatePayload).toMatchObject({ disposition: 'expired' });
  });

  it('is a no-op (writes nothing) when nothing is past its TTL', async () => {
    const { client, captured } = makeFakeClient(
      [{ id: 'fresh', disposition: 'new', expires_at: FUTURE }],
      NOW,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const count = await sweepExpiredSignals(client as any, 'team-1', NOW);
    expect(count).toBe(0);
    expect(captured.updatedIds).toEqual([]);
  });

  it('restricts the disposition filter to the two untriaged open states', async () => {
    // Verifies the sweep can NEVER walk back acknowledged/converted/dismissed/
    // resolved by construction (they are not in the queried dispositions).
    const { client } = makeFakeClient(
      [{ id: 'acked', disposition: 'acknowledged', expires_at: PAST }],
      NOW,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const count = await sweepExpiredSignals(client as any, 'team-1', NOW);
    expect(count).toBe(0);
  });
});

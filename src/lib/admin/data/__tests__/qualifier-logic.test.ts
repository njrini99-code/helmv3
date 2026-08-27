/**
 * Qualifier Logic data layer — thin I/O tests.
 *
 * The business rules themselves (`evaluateQualifierInvariants`,
 * `summarizeQualifierLifecycle`, `worstQualifierSeverity`) are pure and
 * tested on their own in `qualifier-invariants.test.ts`; nothing here
 * re-derives that logic. These tests cover exactly what this module adds:
 *   1. the raw Supabase rows are wired through to the evaluators unchanged
 *      (an id/qualifier_id typo here would silently break every invariant);
 *   2. a query failure returns an honest AdminFetchResult error, never a
 *      fabricated empty snapshot;
 *   3. the exact-count truncation check reports honestly on BOTH bounded
 *      reads (qualifiers and linked rounds), and degrades to a conservative
 *      (never false-positive-suppressing) fallback when the count probe
 *      itself fails.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface Probe {
  data: unknown[] | null;
  error: { message: string } | null;
  count?: number | null;
}

const qualifiersPage: Probe = { data: [], error: null };
const qualifiersCount: Probe = { data: null, error: null, count: 0 };
const roundsPage: Probe = { data: [], error: null };
const roundsCount: Probe = { data: null, error: null, count: 0 };

/** Every chain method returns the same thenable node — matches the
 *  supabase-js PostgrestFilterBuilder shape (awaitable at any point in the
 *  chain), mirroring the mock style already used in ai-availability.test.ts. */
function chainNode(result: Probe) {
  const node = {
    not: () => node,
    order: () => node,
    limit: () => node,
    then: (onFulfilled: (v: Probe) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return node;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
        const isCountProbe = Boolean(opts?.head);
        if (table === 'golf_qualifiers') return chainNode(isCountProbe ? qualifiersCount : qualifiersPage);
        if (table === 'golf_rounds') return chainNode(isCountProbe ? roundsCount : roundsPage);
        throw new Error(`unexpected table in test mock: ${table}`);
      },
    }),
  }),
}));

import { fetchQualifierLogic } from '../qualifier-logic';

function resetAll() {
  qualifiersPage.data = [];
  qualifiersPage.error = null;
  qualifiersCount.count = 0;
  qualifiersCount.error = null;
  roundsPage.data = [];
  roundsPage.error = null;
  roundsCount.count = 0;
  roundsCount.error = null;
}

describe('fetchQualifierLogic', () => {
  beforeEach(resetAll);

  it('wires fetched rows through to the pure evaluators unchanged', async () => {
    qualifiersPage.data = [
      { id: 'q1', team_id: 'team-a', num_rounds: 2, status: 'open', name: 'Fall Qualifier' },
      { id: 'q2', team_id: 'team-b', num_rounds: null, status: 'closed', name: 'Legacy Qualifier' },
    ];
    qualifiersCount.count = 2;
    roundsPage.data = [
      { id: 'r1', team_id: 'team-a', player_id: 'p1', qualifier_id: 'q1', qualifier_round_number: 1 },
      // Orphan: points at a qualifier that isn't in the fetched set.
      { id: 'r2', team_id: 'team-a', player_id: 'p2', qualifier_id: 'q-missing', qualifier_round_number: 1 },
    ];
    roundsCount.count = 2;

    const result = await fetchQualifierLogic();

    expect(result.status).toBe('ok');
    expect(result.data).not.toBeNull();
    expect(result.fetchedAt).not.toBeNull();
    expect(result.truncated).toBe(false);
    const snapshot = result.data!;

    expect(snapshot.qualifiers).toEqual({ evaluated: 2, confirmedTotal: 2, truncated: false });
    expect(snapshot.linkedRounds).toEqual({ evaluated: 2, confirmedTotal: 2, truncated: false });
    expect(snapshot.lifecycle.total).toBe(2);
    expect(snapshot.lifecycle.multiRound).toBe(1); // q1's num_rounds=2
    expect(snapshot.lifecycle.missingCap).toBe(1); // q2's num_rounds=null

    const orphan = snapshot.invariants.find((i) => i.id === 'orphan_link');
    expect(orphan).toBeDefined();
    expect(orphan!.violations).toBe(1);
    expect(orphan!.sampleRoundIds).toEqual(['r2']);

    // Every invariant is present regardless of whether it fired — the page
    // renders a row for each one, not only the violated ones.
    expect(snapshot.invariants).toHaveLength(4);
    expect(snapshot.worstSeverity).toBe('critical'); // orphan_link is critical
  });

  it('reports checked-and-holding (no violations, worstSeverity null) when the data is clean', async () => {
    qualifiersPage.data = [{ id: 'q1', team_id: 'team-a', num_rounds: 1, status: 'open', name: 'Q' }];
    qualifiersCount.count = 1;
    roundsPage.data = [{ id: 'r1', team_id: 'team-a', player_id: 'p1', qualifier_id: 'q1', qualifier_round_number: 1 }];
    roundsCount.count = 1;

    const result = await fetchQualifierLogic();

    expect(result.status).toBe('ok');
    expect(result.data!.worstSeverity).toBeNull();
    expect(result.data!.invariants.every((i) => i.violations === 0)).toBe(true);
  });

  it('reports an honest error, not a fabricated empty snapshot, when the qualifiers query fails', async () => {
    qualifiersPage.error = { message: 'connection reset' };

    const result = await fetchQualifierLogic();

    expect(result.status).toBe('error');
    expect(result.data).toBeNull();
    expect(result.error).toContain('golf_qualifiers query failed');
    expect(result.error).toContain('connection reset');
  });

  it('reports an honest error when the linked-rounds query fails', async () => {
    roundsPage.error = { message: 'statement timeout' };

    const result = await fetchQualifierLogic();

    expect(result.status).toBe('error');
    expect(result.data).toBeNull();
    expect(result.error).toContain('golf_rounds query failed');
    expect(result.error).toContain('statement timeout');
  });

  it('flags qualifier truncation honestly when the exact count exceeds the fetched page, and names the true total', async () => {
    qualifiersPage.data = [{ id: 'q1', team_id: 'team-a', num_rounds: 1, status: 'open', name: 'Q' }];
    qualifiersCount.count = 5_000; // far more qualifiers exist than the bounded page fetched
    roundsPage.data = [];
    roundsCount.count = 0;

    const result = await fetchQualifierLogic();

    expect(result.status).toBe('ok');
    expect(result.truncated).toBe(true);
    // `evaluated` is what was actually checked; `confirmedTotal` is the true
    // count — the page must be able to tell these apart, not collapse them.
    expect(result.data!.qualifiers).toEqual({ evaluated: 1, confirmedTotal: 5_000, truncated: true });
    expect(result.data!.linkedRounds).toEqual({ evaluated: 0, confirmedTotal: 0, truncated: false });
  });

  it('flags linked-round truncation honestly, mirroring the qualifiers case', async () => {
    qualifiersPage.data = [];
    qualifiersCount.count = 0;
    roundsPage.data = [{ id: 'r1', team_id: 'team-a', player_id: 'p1', qualifier_id: 'q1', qualifier_round_number: 1 }];
    roundsCount.count = 9_999; // far more linked rounds exist than the bounded page fetched

    const result = await fetchQualifierLogic();

    expect(result.status).toBe('ok');
    expect(result.truncated).toBe(true);
    expect(result.data!.linkedRounds).toEqual({ evaluated: 1, confirmedTotal: 9_999, truncated: true });
    expect(result.data!.qualifiers).toEqual({ evaluated: 0, confirmedTotal: 0, truncated: false });
  });

  it('never reports a false "not truncated" when the count probe itself fails and the page came back short of the cap', async () => {
    qualifiersPage.data = [{ id: 'q1', team_id: 'team-a', num_rounds: 1, status: 'open', name: 'Q' }];
    qualifiersCount.error = { message: 'count probe unavailable' };
    qualifiersCount.count = null;

    const result = await fetchQualifierLogic();

    expect(result.status).toBe('ok');
    // A single fetched row is nowhere near the bounded cap, so the honest
    // fallback (fetchedLen >= limit) correctly reports "not truncated" even
    // though the count probe itself could not confirm it.
    expect(result.data!.qualifiers.truncated).toBe(false);
    // The probe failure is distinguishable from "confirmed zero more rows":
    // confirmedTotal is null, not a number, when the count probe errored.
    expect(result.data!.qualifiers.confirmedTotal).toBeNull();
    expect(result.data!.qualifiers.evaluated).toBe(1);
  });
});

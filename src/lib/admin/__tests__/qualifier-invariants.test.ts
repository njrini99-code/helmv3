import { describe, it, expect } from 'vitest';
import {
  evaluateQualifierInvariants,
  summarizeQualifierLifecycle,
  worstQualifierSeverity,
  type QualifierLinkedRound,
  type QualifierRow,
} from '../qualifier-invariants';

/**
 * These invariants exist because prose rules in this repo read as true forever.
 * `memory/features/qualifiers.md` documented "scheduled dates are calendar
 * metadata, never a player-entry deadline" and the product still shipped a bug
 * closing qualifiers on their end date (INC-2026-08-22). Nothing compared the
 * sentence to the data.
 *
 * So each test constructs the exact violating shape. Production is at zero
 * violations today, which means production alone can never prove these checks
 * work — only a fixture can.
 */

function qualifier(over: Partial<QualifierRow> = {}): QualifierRow {
  return { id: 'q1', team_id: 'team-a', num_rounds: 3, status: 'active', name: 'Fall Q', ...over };
}

function round(over: Partial<QualifierLinkedRound> = {}): QualifierLinkedRound {
  return {
    id: 'r1', team_id: 'team-a', player_id: 'p1',
    qualifier_id: 'q1', qualifier_round_number: 1, ...over,
  };
}

function find(results: ReturnType<typeof evaluateQualifierInvariants>, id: string) {
  const hit = results.find((r) => r.id === id);
  if (!hit) throw new Error(`invariant ${id} missing from results`);
  return hit;
}

describe('cross-team linkage — the data-side view of security finding F8', () => {
  it('flags a round attached to another team’s qualifier', () => {
    // reclassify_golf_round verifies the caller owns the ROUND but never that
    // the supplied qualifier belongs to the round's team. This is what that
    // looks like once it has happened.
    const results = evaluateQualifierInvariants(
      [qualifier({ id: 'q1', team_id: 'team-a' })],
      [round({ id: 'r-bad', team_id: 'team-b', qualifier_id: 'q1' })],
    );
    const check = find(results, 'cross_team_link');
    expect(check.violations).toBe(1);
    expect(check.sampleRoundIds).toEqual(['r-bad']);
    expect(check.severity).toBe('critical');
  });

  it('does not flag a round on its own team’s qualifier', () => {
    const results = evaluateQualifierInvariants([qualifier()], [round()]);
    expect(find(results, 'cross_team_link').violations).toBe(0);
  });

  it('does not flag when either team_id is null rather than guessing', () => {
    // A null team is unknown, not a mismatch. Reporting it would manufacture a
    // critical finding out of missing data.
    const results = evaluateQualifierInvariants(
      [qualifier({ team_id: null })],
      [round({ team_id: null })],
    );
    expect(find(results, 'cross_team_link').violations).toBe(0);
  });
});

describe('orphan linkage', () => {
  it('flags a round pointing at a qualifier that no longer exists', () => {
    const results = evaluateQualifierInvariants(
      [qualifier({ id: 'q1' })],
      [round({ id: 'r-orphan', qualifier_id: 'q-deleted' })],
    );
    const check = find(results, 'orphan_link');
    expect(check.violations).toBe(1);
    expect(check.sampleRoundIds).toEqual(['r-orphan']);
  });
});

describe('duplicate slot — two scores competing for one qualifier round', () => {
  it('flags both rounds claiming the same (qualifier, player, round number)', () => {
    const results = evaluateQualifierInvariants(
      [qualifier()],
      [
        round({ id: 'r-a', qualifier_round_number: 2 }),
        round({ id: 'r-b', qualifier_round_number: 2 }),
      ],
    );
    const check = find(results, 'duplicate_slot');
    // BOTH are reported — neither is authoritative, which is the whole problem.
    expect(check.violations).toBe(2);
    expect(check.sampleRoundIds.sort()).toEqual(['r-a', 'r-b']);
  });

  it('does not flag the same slot number for DIFFERENT players', () => {
    // Every player has their own round 1; that is the design, not a collision.
    const results = evaluateQualifierInvariants(
      [qualifier()],
      [
        round({ id: 'r-a', player_id: 'p1', qualifier_round_number: 1 }),
        round({ id: 'r-b', player_id: 'p2', qualifier_round_number: 1 }),
      ],
    );
    expect(find(results, 'duplicate_slot').violations).toBe(0);
  });

  it('ignores rounds with no slot number rather than grouping them together', () => {
    const results = evaluateQualifierInvariants(
      [qualifier()],
      [
        round({ id: 'r-a', qualifier_round_number: null }),
        round({ id: 'r-b', qualifier_round_number: null }),
      ],
    );
    expect(find(results, 'duplicate_slot').violations).toBe(0);
  });
});

describe('over-cap', () => {
  it('flags a round numbered beyond the configured cap', () => {
    const results = evaluateQualifierInvariants(
      [qualifier({ num_rounds: 2 })],
      [round({ id: 'r-over', qualifier_round_number: 3 })],
    );
    const check = find(results, 'over_cap');
    expect(check.violations).toBe(1);
    expect(check.severity).toBe('warning');
  });

  it('allows a round exactly at the cap', () => {
    const results = evaluateQualifierInvariants(
      [qualifier({ num_rounds: 3 })],
      [round({ qualifier_round_number: 3 })],
    );
    expect(find(results, 'over_cap').violations).toBe(0);
  });

  it('does not flag when the qualifier has no cap configured', () => {
    // Legacy rows predate num_rounds. Unenforceable is not the same as violated;
    // the lifecycle summary counts these separately as `missingCap`.
    const results = evaluateQualifierInvariants(
      [qualifier({ num_rounds: null })],
      [round({ qualifier_round_number: 9 })],
    );
    expect(find(results, 'over_cap').violations).toBe(0);
  });
});

describe('result shape', () => {
  it('always reports every invariant, including the passing ones', () => {
    // A surface that only lists failures cannot distinguish "this rule holds"
    // from "nobody checks this rule" — which is the state qualifiers were
    // already in. Passing checks must stay visible.
    const results = evaluateQualifierInvariants([qualifier()], [round()]);
    expect(results.map((r) => r.id).sort()).toEqual(
      ['cross_team_link', 'duplicate_slot', 'orphan_link', 'over_cap'],
    );
    expect(results.every((r) => r.rule.length > 0)).toBe(true);
    expect(results.every((r) => r.consequence.length > 0)).toBe(true);
  });

  it('caps the sample list so one bad migration cannot flood the page', () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      round({ id: `r${i}`, team_id: 'team-b' }));
    const check = find(evaluateQualifierInvariants([qualifier()], many), 'cross_team_link');
    expect(check.violations).toBe(40);
    expect(check.sampleRoundIds).toHaveLength(5);
  });

  it('handles an empty database without throwing', () => {
    const results = evaluateQualifierInvariants([], []);
    expect(results).toHaveLength(4);
    expect(results.every((r) => r.violations === 0)).toBe(true);
  });
});

describe('worstQualifierSeverity', () => {
  it('is null when everything holds — never a false "warning"', () => {
    expect(worstQualifierSeverity(evaluateQualifierInvariants([qualifier()], [round()]))).toBeNull();
  });

  it('reports critical when a critical invariant is breached', () => {
    const results = evaluateQualifierInvariants(
      [qualifier()], [round({ team_id: 'team-b' })],
    );
    expect(worstQualifierSeverity(results)).toBe('critical');
  });

  it('reports warning when only a warning-level invariant is breached', () => {
    const results = evaluateQualifierInvariants(
      [qualifier({ num_rounds: 1 })], [round({ qualifier_round_number: 5 })],
    );
    expect(worstQualifierSeverity(results)).toBe('warning');
  });
});

describe('lifecycle summary', () => {
  it('counts by status, multi-round, and unenforceable caps', () => {
    const summary = summarizeQualifierLifecycle(
      [
        qualifier({ id: 'a', status: 'active', num_rounds: 3 }),
        qualifier({ id: 'b', status: 'closed', num_rounds: 1 }),
        qualifier({ id: 'c', status: 'closed', num_rounds: null }),
      ],
      [round(), round({ id: 'r2' })],
    );
    expect(summary.total).toBe(3);
    expect(summary.byStatus[0]).toEqual({ status: 'closed', count: 2 });
    expect(summary.multiRound).toBe(1);
    expect(summary.missingCap).toBe(1);
    expect(summary.linkedRounds).toBe(2);
  });

  it('buckets a null status as "unknown" rather than dropping the row', () => {
    const summary = summarizeQualifierLifecycle([qualifier({ status: null })], []);
    expect(summary.byStatus).toEqual([{ status: 'unknown', count: 1 }]);
    expect(summary.total).toBe(1);
  });
});

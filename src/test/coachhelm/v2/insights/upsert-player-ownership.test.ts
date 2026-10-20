import { describe, it, expect, vi } from 'vitest';
import { InsightOwnershipLookupError, upsertInsight } from '@/lib/coachhelm/v2/insights/upsert';
import { classifyThrown } from '@/lib/coachhelm/v3/engine/analysis-outcome';
import type { InsightInput, InsightEvidence } from '@/lib/coachhelm/v2/insights/types';

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => undefined),
}));
vi.mock('@/lib/notifications/insight-notifier', () => ({
  notifyInsightLanded: vi.fn(async () => undefined),
}));

/**
 * Covers the 2026-09-22 `resolvePlayerOwnership` fix (orphan-insight
 * investigation, PR C): 'inactive'-but-still-rostered players used to be
 * wrongly treated as teamless, and a real query error on either lookup was
 * silently indistinguishable from "this player genuinely has no team" — both
 * produced the same permanent orphan (coach_id AND team_id both NULL).
 */

const now = new Date().toISOString();

const baseEvidence: InsightEvidence = {
  metric: 'putt_make_rate_6_10ft',
  metric_label: 'Make rate from 6–10ft',
  unit: 'percent',
  your_value: 0.3,
  your_value_display: '30%',
  comparison_value: 0.48,
  comparison_label: 'Division II average',
  comparison_source: 'd2_avg',
  sample_n: 25,
  window_days: 30,
  window_start: new Date(Date.now() - 30 * 86400e3).toISOString(),
  window_end: now,
  strokes_impact: 0.5,
  strokes_impact_method: 'peer_delta',
  confidence: 0,
  confidence_factors: { sample_adequacy: 1, recency: 1, variance: 1 },
};

function makeInput(overrides: Partial<InsightInput> = {}): InsightInput {
  return {
    player_id: 'player-1',
    // coach_id/team_id intentionally omitted so upsertInsight calls
    // resolvePlayerOwnership.
    category: 'putting',
    insight_type: 'pattern',
    signature: 'ownership-sig',
    title: 'Title',
    content: 'Content',
    evidence: baseEvidence,
    metadata: {},
    ...overrides,
  };
}

type Row = Record<string, unknown>;
type Resp = { data: unknown; error: { message: string } | null };

/**
 * Minimal per-table fake tailored to resolvePlayerOwnership's two SELECTs
 * plus upsertInsight's dedup lookup + insert. `teamMembersResponses` and
 * `coachStaffResponses` are consumed in order (one entry per call), so a
 * test can script "error, then success" to exercise the one-shot retry.
 */
function makeFakeSupabase(opts: {
  teamMembersResponses: Resp[];
  coachStaffResponses?: Resp[];
  insertedRows: Row[];
}) {
  let teamMembersCallIdx = 0;
  let coachStaffCallIdx = 0;
  const teamMembersCalls: Array<{ eq: Record<string, unknown>; in?: unknown[] }> = [];

  return {
    from(table: string) {
      if (table === 'golf_team_members') {
        const call: { eq: Record<string, unknown>; in?: unknown[] } = { eq: {} };
        const chain = {
          select: () => chain,
          eq: (col: string, val: unknown) => {
            call.eq[col] = val;
            return chain;
          },
          in: (_col: string, vals: unknown[]) => {
            call.in = vals;
            return chain;
          },
          order: () => chain,
          limit: () => chain,
          maybeSingle: async () => {
            teamMembersCalls.push(call);
            const resp = opts.teamMembersResponses[teamMembersCallIdx]
              ?? opts.teamMembersResponses[opts.teamMembersResponses.length - 1];
            teamMembersCallIdx += 1;
            return resp;
          },
        };
        return chain;
      }
      if (table === 'golf_team_coach_staff') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          limit: () => chain,
          maybeSingle: async () => {
            const responses = opts.coachStaffResponses ?? [{ data: null, error: null }];
            const resp = responses[coachStaffCallIdx] ?? responses[responses.length - 1];
            coachStaffCallIdx += 1;
            return resp;
          },
        };
        return chain;
      }
      if (table === 'golf_coach_insights') {
        // Dedup lookup — always "no existing row" for these tests.
        const selectChain = {
          select: () => selectChain,
          eq: () => selectChain,
          is: () => selectChain,
          order: () => selectChain,
          limit: async () => ({ data: [], error: null }),
        };
        return {
          select: () => selectChain,
          upsert: (payload: Row) => ({
            select: () => ({
              maybeSingle: async () => {
                const row = { id: `ins-${opts.insertedRows.length + 1}`, ...payload };
                opts.insertedRows.push(row);
                return { data: { id: row.id }, error: null };
              },
            }),
          }),
        };
      }
      throw new Error(`unexpected table in test fake: ${table}`);
    },
    __teamMembersCalls: teamMembersCalls,
  };
}

describe('resolvePlayerOwnership (via upsertInsight)', () => {
  it('attributes ownership for an active team member', async () => {
    const insertedRows: Row[] = [];
    const supabase = makeFakeSupabase({
      teamMembersResponses: [{ data: { team_id: 'team-1' }, error: null }],
      coachStaffResponses: [{ data: { coach_id: 'coach-1' }, error: null }],
      insertedRows,
    });

    await upsertInsight(supabase as never, makeInput());

    expect(insertedRows[0]?.team_id).toBe('team-1');
    expect(insertedRows[0]?.coach_id).toBe('coach-1');
    // status filter must include both active and inactive.
    expect(supabase.__teamMembersCalls[0]?.in).toEqual(
      expect.arrayContaining(['active', 'inactive']),
    );
  });

  it('attributes ownership for an inactive-but-rostered player (the fixed bug)', async () => {
    // The fake doesn't itself filter by status (no row storage), so this
    // asserts the query is shaped to include 'inactive' rather than
    // excluding it — the actual filtering is Postgres's job in prod.
    const insertedRows: Row[] = [];
    const supabase = makeFakeSupabase({
      teamMembersResponses: [{ data: { team_id: 'team-2' }, error: null }],
      coachStaffResponses: [{ data: { coach_id: 'coach-2' }, error: null }],
      insertedRows,
    });

    await upsertInsight(supabase as never, makeInput({ player_id: 'player-inactive' }));

    expect(insertedRows[0]?.team_id).toBe('team-2');
    expect(supabase.__teamMembersCalls[0]?.in).not.toContain('pending');
    expect(supabase.__teamMembersCalls[0]?.in).not.toContain('removed');
  });

  it('lands an orphan (not a throw) when the player has no team row at all', async () => {
    const insertedRows: Row[] = [];
    const supabase = makeFakeSupabase({
      teamMembersResponses: [{ data: null, error: null }],
      insertedRows,
    });

    await expect(upsertInsight(supabase as never, makeInput({ player_id: 'player-no-team' })))
      .resolves.toBeTruthy();

    expect(insertedRows[0]?.team_id ?? null).toBeNull();
    expect(insertedRows[0]?.coach_id ?? null).toBeNull();
  });

  it('retries once on a transient golf_team_members error, then succeeds', async () => {
    const insertedRows: Row[] = [];
    const supabase = makeFakeSupabase({
      teamMembersResponses: [
        { data: null, error: { message: 'connection reset' } },
        { data: { team_id: 'team-3' }, error: null },
      ],
      coachStaffResponses: [{ data: { coach_id: 'coach-3' }, error: null }],
      insertedRows,
    });

    await upsertInsight(supabase as never, makeInput({ player_id: 'player-transient' }));

    expect(supabase.__teamMembersCalls.length).toBe(2);
    expect(insertedRows[0]?.team_id).toBe('team-3');
    expect(insertedRows[0]?.coach_id).toBe('coach-3');
  });

  // 2026-09-25: a lookup that errors past its retry no longer writes. The
  // fallback row carried a partial ownership tuple the dedup lookup could not
  // match to the owned row, so each failed lookup minted a duplicate (the
  // 2026-09-24 brownout wrote 19 coachless twins). A genuine no-team player
  // still lands an orphan (above).
  it('refuses to write when the team lookup error persists past the retry', async () => {
    const insertedRows: Row[] = [];
    const supabase = makeFakeSupabase({
      teamMembersResponses: [
        { data: null, error: { message: 'connection reset' } },
        { data: null, error: { message: 'connection reset' } },
      ],
      insertedRows,
    });

    await expect(upsertInsight(supabase as never, makeInput({ player_id: 'player-persistent-error' })))
      .rejects.toBeInstanceOf(InsightOwnershipLookupError);

    expect(supabase.__teamMembersCalls.length).toBe(2);
    expect(insertedRows).toHaveLength(0);
  });

  it('refuses to write a coachless twin when the coach-staff lookup errors on both attempts', async () => {
    const insertedRows: Row[] = [];
    const supabase = makeFakeSupabase({
      teamMembersResponses: [{ data: { team_id: 'team-4' }, error: null }],
      coachStaffResponses: [
        { data: null, error: { message: 'Could not query the database for the schema cache', code: 'PGRST002' } as never },
        { data: null, error: { message: 'Could not query the database for the schema cache', code: 'PGRST002' } as never },
      ],
      insertedRows,
    });

    const err = await upsertInsight(supabase as never, makeInput({ player_id: 'player-staff-error' })).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(InsightOwnershipLookupError);
    expect(insertedRows).toHaveLength(0);
    // The analysis run records it as a transient fault, not a permanent one.
    expect(classifyThrown(err).kind).toBe('retryable_failure');
  });
});

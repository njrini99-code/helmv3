// =============================================================================
// Test for the OUTCOME → LIFECYCLE bridge (V10 gap closure):
// when a linked action's target metric IMPROVES, the SOURCE insight's
// lifecycle_state transitions -> 'resolved' (orthogonal to coach_status).
//
// Before this fix the outcome sweep wrote the verdict onto the action but the
// originating baseball_coach_insights row was never resolved, so the engine
// could never recognize "the thing we flagged actually got better". These lock:
//   * an improved action resolves its source insight via signal_id -> dedupe_key;
//   * only ACTIVE, non-terminal-lifecycle insights are touched (status filter);
//   * coach_status is NEVER written (orthogonality);
//   * a non-improved verdict resolves nothing.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { sweepActionOutcomes } from '@/lib/baseball/coachhelm/outcome-sweep';

const TEAM = 'team-1';

/** Captured .update() payloads + the table they targeted. */
interface UpdateCall {
  table: string;
  payload: Record<string, unknown>;
}

/**
 * Minimal chainable Supabase fake. Each `.from(table)` returns a builder that
 * records the update payload (when present) and resolves selects from canned
 * data. The builder is thenable so `await` resolves it like the real client.
 */
function makeClient(opts: {
  actions: Array<Record<string, unknown>>;
  stats: Array<Record<string, unknown>>;
  signals: Array<Record<string, unknown>>;
  updates: UpdateCall[];
}) {
  function from(table: string) {
    const state: { isUpdate: boolean; payload: Record<string, unknown> | null } = {
      isUpdate: false,
      payload: null,
    };
    const data =
      table === 'baseball_actions'
        ? opts.actions
        : table === 'baseball_player_stats'
          ? opts.stats
          : table === 'baseball_signals'
            ? opts.signals
            : [];
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      order: () => builder,
      limit: () => builder,
      // The stats read now paginates via fetchAllRowsResult (ends on .range).
      // The fake returns the full canned set on the first page, which is < the
      // 1000-row page size, so the pagination loop terminates after one page.
      range: () => builder,
      update(payload: Record<string, unknown>) {
        state.isUpdate = true;
        state.payload = payload;
        return builder;
      },
      then(resolve: (v: { data: unknown; error: null }) => unknown) {
        if (state.isUpdate && state.payload) {
          opts.updates.push({ table, payload: state.payload });
          return resolve({ data: null, error: null });
        }
        return resolve({ data, error: null });
      },
    };
    return builder;
  }
  return { from } as unknown as Parameters<typeof sweepActionOutcomes>[0];
}

describe('sweepActionOutcomes — improved action resolves its source insight', () => {
  it("transitions the source insight lifecycle_state -> 'resolved' (not coach_status)", async () => {
    // An action targeting k_rate (lower_better) whose AFTER window shows a clear
    // drop (improvement). created_at is old so the after-window has ≥2 sessions.
    const actions = [
      {
        id: 'act-1',
        player_id: 'p1',
        created_at: '2026-01-01T00:00:00.000Z',
        outcome_metric: 'k_rate',
        outcome_baseline_value: 0.4, // was striking out a lot
        outcome_observed_value: null, // unmeasured → first-pass eligible
        signal_id: 'sig-1',
        status: 'open',
      },
    ];
    // After-window box-score rows showing a much LOWER k_rate (improvement for a
    // lower_better metric). Enough PAs + sessions to clear the after-sample gate.
    const stats = [
      { id: 's1', player_id: 'p1', stat_type: 'game', session_date: '2026-03-01', at_bats: 10, walks: 2, strikeouts: 1, hits: 4 },
      { id: 's2', player_id: 'p1', stat_type: 'game', session_date: '2026-03-05', at_bats: 10, walks: 2, strikeouts: 1, hits: 3 },
      { id: 's3', player_id: 'p1', stat_type: 'game', session_date: '2026-03-09', at_bats: 12, walks: 1, strikeouts: 1, hits: 4 },
    ];
    const signals = [{ id: 'sig-1', dedupe_key: 'two_strike_chase:p1' }];
    const updates: UpdateCall[] = [];
    const client = makeClient({ actions, stats, signals, updates });

    const res = await sweepActionOutcomes(client, TEAM);
    expect(res.measured).toBe(1);

    // The action row was updated with an 'improved' verdict...
    const actionUpdate = updates.find((u) => u.table === 'baseball_actions');
    expect(actionUpdate?.payload.outcome_verdict).toBe('improved');

    // ...and the SOURCE insight was resolved via the signal's dedupe_key.
    const insightUpdate = updates.find((u) => u.table === 'baseball_coach_insights');
    expect(insightUpdate).toBeTruthy();
    expect(insightUpdate?.payload.lifecycle_state).toBe('resolved');
    // ORTHOGONALITY: the coach-owned status column is NEVER written here.
    expect(insightUpdate?.payload).not.toHaveProperty('coach_status');
    expect(insightUpdate?.payload).not.toHaveProperty('status');
  });

  it('resolves nothing when the verdict is not improved', async () => {
    // Same action but the after-window shows k_rate climbing (regressed) — no
    // insight resolution should fire.
    const actions = [
      {
        id: 'act-2',
        player_id: 'p2',
        created_at: '2026-01-01T00:00:00.000Z',
        outcome_metric: 'k_rate',
        outcome_baseline_value: 0.1, // was good
        outcome_observed_value: null,
        signal_id: 'sig-2',
        status: 'open',
      },
    ];
    const stats = [
      { id: 's1', player_id: 'p2', stat_type: 'game', session_date: '2026-03-01', at_bats: 10, walks: 0, strikeouts: 5, hits: 1 },
      { id: 's2', player_id: 'p2', stat_type: 'game', session_date: '2026-03-05', at_bats: 10, walks: 0, strikeouts: 5, hits: 1 },
    ];
    const signals = [{ id: 'sig-2', dedupe_key: 'two_strike_chase:p2' }];
    const updates: UpdateCall[] = [];
    const client = makeClient({ actions, stats, signals, updates });

    await sweepActionOutcomes(client, TEAM);

    const insightUpdate = updates.find((u) => u.table === 'baseball_coach_insights');
    expect(insightUpdate).toBeUndefined();
  });
});

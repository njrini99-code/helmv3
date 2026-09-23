/**
 * compose() budget-zero — REAL checkBudget (Package 8 slice 1, repair plan
 * 14.10, advisor guidance).
 *
 * `compose.test.ts` only ever mocks `checkBudget` to return `allowed:
 * true`/`false` directly — that proves compose()'s own branch exists, not
 * that a genuinely configured `budget_usd: 0` actually PRODUCES
 * `allowed: false` from the real resolution logic in budget.ts. This file
 * does NOT mock `./budget`, so `checkBudget`'s real SELECT-and-compare
 * runs against a Supabase stub encoding a real (coach_id, today) row with
 * `budget_usd: 0` — pinning that an explicit zero stays zero (distinct
 * from an unconfigured budget silently falling through to the $3
 * platform default) and that compose() makes NO LLM call in that case.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateTextMock = vi.fn();
vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
}));

vi.mock('@/lib/observability/metrics', () => ({
  recordAi: vi.fn(),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
  logServerEvent: vi.fn().mockResolvedValue(undefined),
}));

// --- Real budget.ts. Only the Supabase admin client is stubbed, with a
//     genuine `golf_coachhelm_llm_budget` row carrying budget_usd: 0. ---
const loggedRows: Array<Record<string, unknown>> = [];
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'golf_coachhelm_llm_budget') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({ data: { spent_usd: 0, budget_usd: 0 }, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'golf_coachhelm_llm_calls') {
        return {
          insert: (row: Record<string, unknown>) => {
            loggedRows.push(row);
            return {
              select: () => ({
                maybeSingle: () => Promise.resolve({ data: { id: 'log-1' }, error: null }),
              }),
            };
          },
        };
      }
      throw new Error(`unexpected table in budget-zero test stub: ${table}`);
    },
  }),
}));

import { compose } from './compose';
import type { ComposeRequest } from './types';

const FALLBACK = 'Deterministic fallback summary.';

function baseReq(overrides: Partial<ComposeRequest> = {}): ComposeRequest {
  return {
    task: 'round_review',
    coach_id: 'coach-zero-budget',
    player_id: 'player-1',
    prompt: 'Write a round review.',
    evidence: [{ field: 'total_putts', value: 28 }],
    max_completion_tokens: 200,
    ...overrides,
  };
}

beforeEach(() => {
  generateTextMock.mockReset();
  loggedRows.length = 0;
});

describe('compose() — real checkBudget against a genuine budget_usd: 0 row', () => {
  it('makes no LLM call and returns the deterministic fallback', async () => {
    const result = await compose(baseReq(), FALLBACK);

    expect(generateTextMock).not.toHaveBeenCalled();
    expect(result.text).toBe(FALLBACK);
    expect(result.used_llm).toBe(false);
    expect(result.cost_usd).toBe(0);

    // The gate's own reason distinguishes "configured off" from "unconfigured
    // -> platform default" — budget.ts's fallback_reason for budget_usd===0.
    const row = loggedRows[0];
    expect(row?.citations).toEqual({ reason: 'budget_disabled' });
    expect(row?.fallback_to_template).toBe(true);
  });

  it('still makes no LLM call when an evidence_packet is supplied', async () => {
    const result = await compose(
      baseReq({
        evidence_packet: {
          player_id: 'player-1',
          window_start: '2026-09-01T00:00:00.000Z',
          window_end: '2026-09-08T00:00:00.000Z',
          entries: [{ metric_id: 'total_putts', value: 28, sample_n: 18 }],
        },
      }),
      FALLBACK,
    );

    expect(generateTextMock).not.toHaveBeenCalled();
    expect(result.used_llm).toBe(false);
  });
});

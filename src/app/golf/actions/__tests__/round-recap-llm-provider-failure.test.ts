import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// §15.2 fixture-matrix row 36 ("LLM provider failure") — wiring-level test.
//
// Every OTHER round-recap test in this directory mocks `compose()` itself
// (see round-recap.test.ts / round-recap-claim-gate.test.ts's own composeMock
// / real-compose harness) — this file is deliberately the one exception:
// `@/lib/coachhelm/v3/llm/compose.ts` and `../round-recap.ts` are BOTH real.
// Only the `ai` package's `generateText` is mocked, to reject the way a
// genuine provider outage does. The point is to prove the WIRING between
// `generateRoundRecap` -> `compose()` -> the caller-supplied deterministic
// fallback actually holds end to end, not just that each piece is correct
// in isolation.
//
// Doc-pointer correction (see this PR's body): `memory/features/
// coachhelm-ai.md` and `docs/architecture/coachhelm-evidence-contract.md`
// already correctly identify THIS file's `buildDeterministicRecap` (via
// `generateLLMRecap`'s `fallbackText` argument to `compose()`) as the live,
// persisted LLM-fallback core — neither states that
// `src/lib/golf/round-review/deterministic-review.ts` (which is only used by
// `scripts/coachhelm-prewarm-round-reviews.ts`) is that path. This test pins
// the correct wiring so a future edit that says otherwise fails here first.
// ---------------------------------------------------------------------------

// --- Mock ONLY the AI gateway — compose.ts's real generateText call. ---
const generateTextMock = vi.fn();
vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
}));

// --- Direct-Anthropic provider marker (compose.test.ts's own pattern) — not
//     exercised here (generateText never resolves), mocked only so importing
//     compose.ts's real `resolveModelProvider` path never needs a real
//     `@ai-sdk/anthropic` client. ---
vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: (modelName: string) => ({ __direct: modelName }),
}));

// --- Sentry AI observability — compose.ts calls this unconditionally. ---
vi.mock('@/lib/observability/metrics', () => ({
  recordAi: vi.fn(),
}));

// --- Budget gate. `resolveBillingCoachId` resolves to null in this fixture
//     (no golf_team_members row — see mockFrom below), so compose.ts's own
//     `if (req.coach_id)` guards skip checkBudget/recordSpend entirely on
//     this path; mocked anyway so importing `./budget` never needs a real
//     admin client of its own. ---
vi.mock('@/lib/coachhelm/v3/llm/budget', () => ({
  checkBudget: vi.fn().mockResolvedValue({ allowed: true, remaining_usd: 10, budget_usd: 10, spent_usd: 0 }),
  recordSpend: vi.fn().mockResolvedValue(undefined),
}));

// --- Two tables share one admin client: compose.ts's own call-log insert
//     (golf_coachhelm_llm_calls) and round-recap.ts's post-persist provenance
//     insert (golf_round_recap_provenance). Both captured for assertions. ---
const loggedLlmCalls: Array<Record<string, unknown>> = [];
const provenanceInserts: Array<Record<string, unknown>> = [];
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'golf_coachhelm_llm_calls') {
        return {
          insert: (row: Record<string, unknown>) => {
            loggedLlmCalls.push(row);
            return { select: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'log-1' }, error: null }) }) };
          },
        };
      }
      if (table === 'golf_round_recap_provenance') {
        return {
          insert: (row: Record<string, unknown>) => {
            provenanceInserts.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`unexpected admin table in this fixture: ${table}`);
    },
  }),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
  logServerEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// --- round-recap.ts's own (non-admin) Supabase client: round fetch, RPC
//     persist, player self-access probe. Mirrors round-recap.test.ts's
//     established pattern — real `verifyPlayerAccess` / `gateUserAction`
//     read through this same mock rather than being mocked directly. ---
interface MockRoundRow {
  id: string;
  player_id: string;
  course_name: string | null;
  course_city: string | null;
  course_state: string | null;
  round_date: string;
  round_type: string | null;
  total_score: number | null;
  score_to_par: number | null;
  total_putts: number | null;
  total_fairways: number | null;
  total_fairways_hit: number | null;
  total_gir: number | null;
  total_gir_possible: number | null;
  holes_played: number | null;
  front_nine: number | null;
  back_nine: number | null;
  status: string | null;
  ai_recap: string | null;
  ai_recap_generated_at: string | null;
}

const ROUND: MockRoundRow = {
  id: 'round-1',
  player_id: 'player-1',
  course_name: 'Test GC',
  course_city: null,
  course_state: null,
  round_date: '2026-06-01',
  round_type: 'practice',
  total_score: 75,
  score_to_par: 3,
  total_putts: null,
  total_fairways: null,
  total_fairways_hit: null,
  total_gir: null,
  total_gir_possible: null,
  holes_played: 18,
  front_nine: null,
  back_nine: null,
  status: 'completed',
  ai_recap: null,
  ai_recap_generated_at: null,
};

function createChainableMock(maybeSingleData: unknown) {
  const chain: Record<string, unknown> = { data: null, error: null };
  for (const method of ['select', 'eq', 'limit']) {
    chain[method] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(async () => ({ data: maybeSingleData, error: null }));
  return chain;
}

let persistedRecap: { p_round_id: string; p_recap: string | null } | null = null;

const mockFrom = vi.fn((table: string) => {
  if (table === 'golf_rounds') return createChainableMock(ROUND);
  if (table === 'golf_player_stats_cache') return createChainableMock(null); // no season stats on file
  if (table === 'golf_players') return createChainableMock({ id: 'player-1', first_name: 'Jordan' });
  // golf_team_members / golf_team_coach_staff — no billing coach on file,
  // so resolveBillingCoachId() resolves to null and compose()'s budget gate
  // is skipped for this fixture (see the `budget` mock comment above).
  return createChainableMock(null);
});

const mockGetUser = vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null }));
const mockRpc = vi.fn(async (_name: string, args: { p_round_id: string; p_recap: string | null }) => {
  persistedRecap = args;
  return { data: { success: true }, error: null };
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ from: mockFrom, rpc: mockRpc, auth: { getUser: mockGetUser } })),
}));

import { generateRoundRecap } from '../round-recap';

describe('generateRoundRecap — §15.2 row 36 "LLM provider failure" (real compose() + real round-recap.ts)', () => {
  beforeEach(() => {
    generateTextMock.mockReset();
    loggedLlmCalls.length = 0;
    provenanceInserts.length = 0;
    persistedRecap = null;
    mockFrom.mockClear();
    mockRpc.mockClear();
  });

  it('falls back to the exact buildDeterministicRecap output and leaks no LLM text when generateText rejects', async () => {
    generateTextMock.mockRejectedValueOnce(new Error('provider unavailable'));

    const result = await generateRoundRecap('round-1');

    // The real provider path was attempted (proves this test exercises the
    // actual wiring, not a stubbed compose()).
    expect(generateTextMock).toHaveBeenCalledTimes(1);

    // Manually traced buildDeterministicRecap(round, stats) for this exact
    // fixture: score_to_par=3 (not negative), no stats row, no putts/GIR/
    // fairway data -> falls through every conditional lede/takeaway branch
    // to the final `else` of each, so this string is the ENTIRE deterministic
    // contract for this input, not a substring match.
    const EXPECTED_DETERMINISTIC_RECAP =
      '75 on the card at Test GC. The next round is where this baseline gets tested.';

    expect(result.recap).toBe(EXPECTED_DETERMINISTIC_RECAP);
    expect(result.recap).not.toBeNull();
    // No leaked LLM text: generateText never resolved, so the only possible
    // source of `result.recap` is the deterministic template — this is the
    // structural guarantee, and the exact-string assertion above pins it.

    // Persisted through the lifecycle RPC with the SAME deterministic text.
    expect(persistedRecap).toEqual({ p_round_id: 'round-1', p_recap: EXPECTED_DETERMINISTIC_RECAP });

    // The call log records the failure path (compose.ts's own contract),
    // and provenance records source:'deterministic' — never 'llm' — for a
    // recap that was never actually produced by the model.
    expect(loggedLlmCalls).toHaveLength(1);
    expect(loggedLlmCalls[0]).toMatchObject({ verified: false, fallback_to_template: true });
    expect(provenanceInserts).toHaveLength(1);
    expect(provenanceInserts[0]).toMatchObject({
      round_id: 'round-1',
      player_id: 'player-1',
      source: 'deterministic',
    });
  });
});

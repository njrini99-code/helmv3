import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Package 8 slice 2 (repair plan 14.10): round-recap.ts's real, live-render,
 * persisted (`golf_rounds.ai_recap`) LLM surface, now wired to build a typed
 * `EvidencePacket` and pass it into the real `compose()` -> claim-validator.ts
 * pipeline behind the `coachhelm_recap_claim_packet` flag.
 *
 * `round-recap.test.ts` mocks `compose()` itself wholesale, so it never
 * exercises the real typed gate. This file forces the flag ON and mocks only
 * compose()'s OWN dependencies (the AI gateway, budget, admin log insert) —
 * `compose()` and `claim-validator.ts` run for real — to prove the two
 * guarantees the wiring exists for:
 *
 *   1. A rejected or malformed typed claim NEVER reaches `save_round_ai_recap`
 *      — the RPC only ever receives the deterministic recap in that case.
 *   2. The deterministic recap always renders (persists) when the gate
 *      discards the LLM text; the flow never returns `{ recap: null }` for
 *      what would otherwise be a successful generation.
 *
 * A third scenario proves the positive path: a well-formed claims block that
 * matches the packet is accepted and the LLM prose itself is what persists.
 */

// --- Force the packet-gating flag ON for this whole file. ---
const { isFlagEnabledMock } = vi.hoisted(() => ({
  isFlagEnabledMock: vi.fn((_featureId?: string, _ctx?: unknown) => true),
}));
vi.mock('@/lib/flags/is-enabled', () => ({
  isFlagEnabled: (featureId: string, ctx?: unknown) => isFlagEnabledMock(featureId, ctx),
}));

// --- Mock the AI gateway. Each test queues the text(s) it wants back. ---
const generateTextMock = vi.fn();
vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
}));

vi.mock('@/lib/observability/metrics', () => ({
  recordAi: vi.fn(),
}));

// --- Budget: no primary coach on file in these fixtures (see baseRound
//     below — no golf_team_members row), so compose()'s coach_id-gated
//     budget checks are skipped entirely and this mock is never actually
//     invoked; it only needs to satisfy the module import. ---
const recordSpendMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/coachhelm/v3/llm/budget', () => ({
  checkBudget: vi.fn().mockResolvedValue({
    allowed: true,
    remaining_usd: 10,
    budget_usd: 10,
    spent_usd: 0,
    source: 'coach_configured',
  }),
  recordSpend: (...args: unknown[]) => recordSpendMock(...args),
}));

// --- Capture rows written to golf_coachhelm_llm_calls. ---
const loggedRows: Array<Record<string, unknown>> = [];
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        loggedRows.push(row);
        return {
          select: () => ({
            maybeSingle: () => Promise.resolve({ data: { id: 'log-1' }, error: null }),
          }),
        };
      },
    }),
  }),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
  logServerEvent: vi.fn().mockResolvedValue(undefined),
}));

// --- round-recap.ts's own Supabase/server plumbing (round-recap.test.ts's
//     established mocking pattern). ---
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

let mockRound: MockRoundRow | null = null;
let mockStats: { scoring_average: number | null; best_round: number | null; rounds_played: number | null } | null =
  null;
let persistedRecap: { p_round_id: string; p_recap: string | null } | null = null;
let mockPlayerFirstName: string | null = 'Caden';

function createChainableMock(maybeSingleData: unknown) {
  const chain: Record<string, unknown> = { data: null, error: null };
  const methods = ['select', 'eq', 'limit'];
  for (const method of methods) {
    chain[method] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(async () => ({ data: maybeSingleData, error: null }));
  return chain;
}

const mockFrom = vi.fn((table: string) => {
  if (table === 'golf_rounds') {
    return createChainableMock(mockRound);
  }
  if (table === 'golf_player_stats_cache') {
    return createChainableMock(mockStats);
  }
  if (table === 'golf_players') {
    return createChainableMock({ id: 'player-1', first_name: mockPlayerFirstName });
  }
  // golf_team_members / golf_team_coach_staff — no primary coach on file,
  // so resolveBillingCoachId resolves to null and compose()'s coach_id-gated
  // budget checks are skipped for every test in this file.
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

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { generateRoundRecap } from '../round-recap';
import { buildRecapEvidencePacket } from '@/lib/coachhelm/v3/llm/recap-evidence';
import { extractNumericTokens, normalize, SAFE_NUMERIC_TOKENS } from '@/lib/coachhelm/v3/llm/citations';

// 18-hole round chosen so buildDeterministicRecap takes one specific,
// entirely predictable branch: no season stats to compare against
// (mockStats = null below), score over par but not under it, moderate
// putts, and mid-range fairway/GIR — none of the earlier lede/takeaway
// branches fire, landing on the same final "else" branch every time this
// fixture is used. See buildDeterministicRecap in ../round-recap.ts.
const baseRound: MockRoundRow = {
  id: 'round-1',
  player_id: 'player-1',
  course_name: 'Pinehurst No. 2',
  course_city: null,
  course_state: null,
  round_date: '2026-06-01',
  round_type: 'tournament',
  total_score: 74,
  score_to_par: 2,
  total_putts: 30,
  total_fairways: 14,
  total_fairways_hit: 10, // pct(10, 14) = 71.4
  total_gir: 12,
  total_gir_possible: 18, // pct(12, 18) = 66.7
  holes_played: 18,
  front_nine: 37,
  back_nine: 37,
  status: 'completed',
  ai_recap: null,
  ai_recap_generated_at: null,
};

// The exact deterministic fallback buildDeterministicRecap produces for
// baseRound: lede falls through every earlier branch (no season stats,
// score not under par, putts/hole ratio not > 2, fairway% not > 75,
// GIR% not < 40) to the final "on the card" lede, and the takeaway falls
// through to the final "next round" default.
const EXPECTED_DETERMINISTIC_RECAP =
  '74 on the card at Pinehurst No. 2. The next round is where this baseline gets tested.';

function claimsBlock(claims: unknown[]): string {
  return `\n\n<<<CLAIMS>>>\n${JSON.stringify(claims)}\n<<<END_CLAIMS>>>`;
}

const WINDOW_START = '2026-06-01T00:00:00.000Z';

describe('round-recap.ts x claim-validator.ts — typed gate wired (flag ON)', () => {
  beforeEach(() => {
    mockRound = { ...baseRound };
    mockStats = null;
    persistedRecap = null;
    mockPlayerFirstName = 'Caden';
    generateTextMock.mockReset();
    recordSpendMock.mockClear();
    mockFrom.mockClear();
    mockRpc.mockClear();
    loggedRows.length = 0;
    isFlagEnabledMock.mockReset();
    isFlagEnabledMock.mockReturnValue(true);
  });

  it('persists the LLM prose when its claims block matches the evidence packet', async () => {
    const goodText =
      'Caden carded 74, holding 71.4% of fairways to keep the card clean. Consistency next time is the target.';
    generateTextMock.mockResolvedValueOnce({
      text:
        goodText +
        claimsBlock([
          {
            claim_id: 'c1',
            metric_id: 'fairways_hit_pct',
            value: 71.4,
            player_id: 'player-1',
            window_start: WINDOW_START,
            window_end: WINDOW_START,
            claim_type: 'fact',
          },
        ]),
      usage: { inputTokens: 20, outputTokens: 20 },
    });

    const result = await generateRoundRecap('round-1');

    expect(generateTextMock).toHaveBeenCalledTimes(1); // no retry needed — verified first try
    expect(result.recap).toBe(goodText);
    expect(persistedRecap).toEqual({ p_round_id: 'round-1', p_recap: goodText });
    // The claims block delimiters must never survive into the persisted text.
    expect(persistedRecap?.p_recap).not.toContain('<<<CLAIMS>>>');
  });

  it('never persists a rejected typed claim — falls back to the deterministic recap (both attempts, isolating the typed gate)', async () => {
    const text =
      'Caden carded 74, holding 71.4% of fairways to keep the card clean. Consistency next time is the target.';
    // Same prose (passes the flat numeric scan on its own) but a claim that
    // cites a value no packet entry has, under a metric that IS on the
    // packet (total_putts) — a wrong_field/value_mismatch typed rejection
    // that the flat scan alone would never catch, since the prose text
    // itself carries no unsupported number.
    const badResponse = {
      text:
        text +
        claimsBlock([
          {
            claim_id: 'c1',
            metric_id: 'total_putts',
            value: 999,
            player_id: 'player-1',
            window_start: WINDOW_START,
            window_end: WINDOW_START,
            claim_type: 'fact',
          },
        ]),
      usage: { inputTokens: 20, outputTokens: 20 },
    };
    generateTextMock.mockResolvedValueOnce(badResponse).mockResolvedValueOnce(badResponse);

    const result = await generateRoundRecap('round-1');

    expect(generateTextMock).toHaveBeenCalledTimes(2); // one retry, still rejected
    expect(result.recap).toBe(EXPECTED_DETERMINISTIC_RECAP);
    expect(persistedRecap).toEqual({ p_round_id: 'round-1', p_recap: EXPECTED_DETERMINISTIC_RECAP });
    // The rejected claim's fabricated value must never reach what's stored.
    expect(persistedRecap?.p_recap).not.toContain('999');

    const discardRow = loggedRows.find((r) => r.verified === false);
    expect(discardRow).toBeTruthy();
    const citations = discardRow?.citations as { claim_validation?: { rejected?: unknown[] } };
    expect(citations.claim_validation?.rejected?.length).toBe(1);
  });

  it('never persists a malformed claims block (duplicated block) — falls back to the deterministic recap', async () => {
    const text = 'Caden carded 74 at Pinehurst No. 2. Consistency next time is the target.';
    const oneClaim = [
      {
        claim_id: 'c1',
        metric_id: 'total_score',
        value: 74,
        player_id: 'player-1',
        window_start: WINDOW_START,
        window_end: WINDOW_START,
        claim_type: 'fact',
      },
    ];
    // Two claims blocks in one response — MUST-1 (post-#1991 review):
    // malformed, not "use the first one".
    const malformedResponse = {
      text: text + claimsBlock(oneClaim) + claimsBlock(oneClaim),
      usage: { inputTokens: 20, outputTokens: 20 },
    };
    generateTextMock.mockResolvedValueOnce(malformedResponse).mockResolvedValueOnce(malformedResponse);

    const result = await generateRoundRecap('round-1');

    expect(generateTextMock).toHaveBeenCalledTimes(2);
    expect(result.recap).toBe(EXPECTED_DETERMINISTIC_RECAP);
    expect(persistedRecap).toEqual({ p_round_id: 'round-1', p_recap: EXPECTED_DETERMINISTIC_RECAP });
    expect(persistedRecap?.p_recap).not.toContain('<<<CLAIMS>>>');

    const discardRow = loggedRows.find((r) => r.verified === false);
    const citations = discardRow?.citations as { claim_validation?: { malformed?: boolean } };
    expect(citations.claim_validation?.malformed).toBe(true);
  });

  it('with the flag OFF, never builds or sends an evidence_packet, and the flat-scan-only gate still renders (regression guard)', async () => {
    isFlagEnabledMock.mockReturnValue(false);
    const goodText = 'Caden carded 74, holding 71.4% of fairways to keep the card clean. Consistency next time.';
    generateTextMock.mockResolvedValueOnce({ text: goodText, usage: { inputTokens: 20, outputTokens: 20 } });

    const result = await generateRoundRecap('round-1');

    expect(result.recap).toBe(goodText);
    expect(persistedRecap).toEqual({ p_round_id: 'round-1', p_recap: goodText });
    expect(isFlagEnabledMock).toHaveBeenCalledWith('coachhelm_recap_claim_packet', undefined);
  });

  it('accepts prose that accurately cites "over 18 holes" — regression pin for the holes_played gap (must-fix)', async () => {
    // The prompt's very first fact line is "Score: ... over 18 holes" — before
    // the fix, buildRecapEvidencePacket never registered holes_played, so ANY
    // accurate recap repeating "18 holes" tripped the uncited_number vacuous-
    // pass guard and fell back to the deterministic recap on every call. No
    // claims block content matters here — this is deliberately an EMPTY but
    // well-formed claims block, so the only thing that can save this response
    // is holes_played being a registered packet VALUE.
    const goodText =
      'Caden carded 74 over 18 holes, holding 71.4% of fairways to keep the card clean. Consistency next time is the target.';
    generateTextMock.mockResolvedValueOnce({
      text: goodText + claimsBlock([]),
      usage: { inputTokens: 20, outputTokens: 20 },
    });

    const result = await generateRoundRecap('round-1');

    expect(generateTextMock).toHaveBeenCalledTimes(1); // no retry needed
    expect(result.recap).toBe(goodText);
    expect(persistedRecap).toEqual({ p_round_id: 'round-1', p_recap: goodText });
  });

  it("every number in the prompt's Round data facts has a matching packet entry (CI guard against this class of bug)", async () => {
    // General regression guard, not specific to holes_played: whatever the
    // prompt's facts block shows the model, buildRecapEvidencePacket must
    // register too, or an accurate recap fails uncited_number. Cross-checks
    // the REAL prompt sent to the REAL compose() against the REAL packet
    // builder's own output for the same round/stats — a future fact added to
    // one without the other fails this test, not just a specific fixture.
    mockStats = { scoring_average: 74.2, best_round: 70, rounds_played: 12 };
    generateTextMock.mockResolvedValueOnce({
      text: 'Caden carded 74. Consistency next time is the target.' + claimsBlock([]),
      usage: { inputTokens: 20, outputTokens: 20 },
    });

    await generateRoundRecap('round-1');

    const prompt = (generateTextMock.mock.calls[0]?.[0] as { prompt?: string } | undefined)?.prompt ?? '';
    const factsMatch = prompt.match(/Round data:\n([\s\S]*?)\n\nOutput only the two sentences\. Nothing else\./);
    expect(factsMatch).toBeTruthy();
    const factsBlock = factsMatch![1]!;

    const packet = buildRecapEvidencePacket(mockRound!, mockStats, 71.4, 66.7);
    const packetValues = new Set(packet.entries.map((e) => normalize(String(e.value))));

    // "Front 9 / Back 9:" is a fixed label in round-recap.ts's own template
    // (facts.push(`Front 9 / Back 9: ${front} / ${back}`)) — its digits name
    // the nines, not a cited stat value; only the numbers AFTER the colon
    // (front_nine/back_nine's own values) are real citations, and those are
    // already covered by the packet's own front_nine/back_nine entries.
    const scannedFactsBlock = factsBlock.replace(/Front 9 \/ Back 9:/g, 'Front / Back:');

    const uncoveredTokens = extractNumericTokens(scannedFactsBlock).filter((tok) => {
      const normalized = normalize(tok);
      return !SAFE_NUMERIC_TOKENS.has(normalized) && !packetValues.has(normalized);
    });

    expect(uncoveredTokens).toEqual([]);
  });
});

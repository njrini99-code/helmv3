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

// --- Capture rows written to golf_coachhelm_llm_calls (by compose.ts) and
//     golf_round_recap_provenance (by round-recap.ts's own admin write,
//     Package 8 slice 3) — same mocked module, routed by table name since
//     both callers share it. ---
const loggedRows: Array<Record<string, unknown>> = [];
const provenanceRows: Array<Record<string, unknown>> = [];
let provenanceInsertResult: { error: { message: string; code?: string } | null } = { error: null };
let provenanceInsertThrows = false;

// --- Package 8 (migration 20260923100000) — single-flight lock harness. ---
// A tiny in-memory lease store keyed by "round_id:revision", plus the
// admin client's `golf_rounds` poll read a waiter uses. Untouched by any
// test outside the dedicated lock describe block below (default: no rows,
// no ai_recap) — existing tests never exercise this branch.
const lockRows = new Map<string, { holder_token: string; expires_at: number }>();
let lockClaimCallCount = 0;
let lockReleaseCallCount = 0;
let lockClaimError: { message: string; code?: string } | null = null;
let adminRoundsAiRecap: string | null = null;
// Key includes `kind` (Package 8 revision, same day: the lock now serves
// both round-recap.ts (kind = 'recap') and the narrative), so a recap lock
// and a narrative lock for the SAME round never share lease state.
const adminRpcMock = vi.fn(async (name: string, args: Record<string, unknown>) => {
  if (name === 'claim_round_recap_lock') {
    lockClaimCallCount += 1;
    if (lockClaimError) return { data: null, error: lockClaimError };
    const key = `${args.p_round_id as string}:${args.p_revision as number}:${args.p_kind as string}`;
    const now = Date.now();
    const existing = lockRows.get(key);
    if (existing && existing.expires_at > now) {
      return { data: [], error: null }; // a live, unexpired lease is held by someone else
    }
    const token = `token-${lockClaimCallCount}`;
    const ttlMs = (args.p_ttl_seconds as number) * 1000;
    lockRows.set(key, { holder_token: token, expires_at: now + ttlMs });
    return { data: [{ holder_token: token, expires_at: new Date(now + ttlMs).toISOString() }], error: null };
  }
  if (name === 'release_round_recap_lock') {
    lockReleaseCallCount += 1;
    const key = `${args.p_round_id as string}:${args.p_revision as number}:${args.p_kind as string}`;
    const existing = lockRows.get(key);
    if (existing && existing.holder_token === args.p_holder_token) lockRows.delete(key);
    return { data: null, error: null };
  }
  return { data: null, error: null };
});

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'golf_round_recap_provenance') {
        return {
          insert: (row: Record<string, unknown>) => {
            if (provenanceInsertThrows) {
              return Promise.reject(new Error('provenance insert threw'));
            }
            provenanceRows.push(row);
            return Promise.resolve(provenanceInsertResult);
          },
        };
      }
      if (table === 'golf_rounds') {
        // The single-flight lock's waiter poll — `admin.from('golf_rounds').select('ai_recap').eq(...).maybeSingle()`.
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { ai_recap: adminRoundsAiRecap }, error: null }),
            }),
          }),
        };
      }
      // golf_coachhelm_llm_calls (compose.ts's own call log).
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
    },
    rpc: (name: string, args: Record<string, unknown>) => adminRpcMock(name, args),
  }),
}));

vi.mock('@/lib/utils/transient-error', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/utils/transient-error')>();
  return { ...actual, delay: vi.fn(() => Promise.resolve()) };
});

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
// SHOULD-4 (single-flight race) fixtures: golf_rounds is read once for the
// round context, then a SECOND time only by the "lost the race, re-read the
// winner" branch — this counter distinguishes the two so a test can serve a
// different ai_recap on the re-read. `mockRpcOverridePersisted` lets a test
// simulate the RPC's `persisted: false` response without touching every
// other test's default (no `persisted` field at all — the pre-migration
// shape every other test in this file still exercises).
let golfRoundsFetchCount = 0;
let winnerAiRecap: string | null = null;
let mockRpcOverridePersisted: boolean | undefined;
let winnerReadError: { message: string; code?: string } | null = null;
// The single-flight lock's concurrent-pair test fires TWO independent
// generateRoundRecapImpl() calls, each with its own genuine FIRST
// golf_rounds fetch — the `golfRoundsFetchCount > 1` heuristic above cannot
// tell that apart from one call's own SHOULD-4 re-read and would hand the
// second caller's initial fetch the re-read stub (no `status`/`player_id`),
// failing it at the `status !== 'completed'` gate before it ever reaches the
// lock. Only that test opts out; every other test keeps the default (false)
// and the original serialized-re-read behavior.
let bypassGolfRoundsRereadHeuristic = false;

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
    golfRoundsFetchCount += 1;
    if (!bypassGolfRoundsRereadHeuristic && golfRoundsFetchCount > 1) {
      const chain = createChainableMock({ ai_recap: winnerAiRecap });
      if (winnerReadError) chain.maybeSingle = vi.fn(async () => ({ data: null, error: winnerReadError }));
      return chain;
    }
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
  const data: { success: boolean; persisted?: boolean } = { success: true };
  if (mockRpcOverridePersisted !== undefined) data.persisted = mockRpcOverridePersisted;
  return { data, error: null };
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ from: mockFrom, rpc: mockRpc, auth: { getUser: mockGetUser } })),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { generateRoundRecap } from '../round-recap';
import { logServerError } from '@/lib/server-error-logger';
import { buildRecapEvidencePacket } from '@/lib/coachhelm/v3/llm/recap-evidence';
import { extractNumericTokens, normalize, SAFE_NUMERIC_TOKENS } from '@/lib/coachhelm/v3/llm/citations';
import { delay } from '@/lib/utils/transient-error';

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
    provenanceRows.length = 0;
    provenanceInsertResult = { error: null };
    provenanceInsertThrows = false;
    golfRoundsFetchCount = 0;
    winnerAiRecap = null;
    mockRpcOverridePersisted = undefined;
    winnerReadError = null;
    lockRows.clear();
    lockClaimCallCount = 0;
    lockReleaseCallCount = 0;
    lockClaimError = null;
    adminRoundsAiRecap = null;
    adminRpcMock.mockClear();
    bypassGolfRoundsRereadHeuristic = false;
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

describe('round-recap.ts — recap provenance (Package 8, revision-keyed provenance + single-flight)', () => {
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
    provenanceRows.length = 0;
    provenanceInsertResult = { error: null };
    provenanceInsertThrows = false;
    golfRoundsFetchCount = 0;
    winnerAiRecap = null;
    mockRpcOverridePersisted = undefined;
    winnerReadError = null;
    lockRows.clear();
    lockClaimCallCount = 0;
    lockReleaseCallCount = 0;
    lockClaimError = null;
    adminRoundsAiRecap = null;
    adminRpcMock.mockClear();
    bypassGolfRoundsRereadHeuristic = false;
    isFlagEnabledMock.mockReset();
    isFlagEnabledMock.mockReturnValue(true);
  });

  it('writes source: "llm" provenance, linked to the compose() call-log row, on a verified LLM recap', async () => {
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

    await generateRoundRecap('round-1');

    expect(provenanceRows).toHaveLength(1);
    expect(provenanceRows[0]).toMatchObject({
      round_id: 'round-1',
      player_id: 'player-1',
      source: 'llm',
      call_log_id: 'log-1', // the mocked golf_coachhelm_llm_calls insert always returns this id
      claim_packet_engaged: true,
      stats_rounds_played_at_generation: null, // mockStats is null in this suite's default
    });
  });

  it('writes source: "deterministic" provenance when a rejected claim discards to the fallback', async () => {
    const text =
      'Caden carded 74, holding 71.4% of fairways to keep the card clean. Consistency next time is the target.';
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

    expect(result.recap).toBe(EXPECTED_DETERMINISTIC_RECAP);
    expect(provenanceRows).toHaveLength(1);
    expect(provenanceRows[0]).toMatchObject({
      round_id: 'round-1',
      player_id: 'player-1',
      source: 'deterministic',
      claim_packet_engaged: true, // the packet WAS engaged; it's what rejected the claim
    });
  });

  it('records stats_rounds_played_at_generation from the season-stats snapshot used at generation time', async () => {
    mockStats = { scoring_average: 74.7, best_round: 68, rounds_played: 12 };
    const goodText = 'Caden carded 74 at Pinehurst No. 2. Consistency next time is the target.';
    generateTextMock.mockResolvedValueOnce({ text: goodText, usage: { inputTokens: 20, outputTokens: 20 } });

    await generateRoundRecap('round-1');

    expect(provenanceRows[0]?.stats_rounds_played_at_generation).toBe(12);
  });

  it('a provenance write that returns an error never breaks the recap — it is already durably saved', async () => {
    isFlagEnabledMock.mockReturnValue(false); // no claims block needed; this test is about the provenance write, not the claim gate
    provenanceInsertResult = { error: { message: 'relation "golf_round_recap_provenance" does not exist', code: '42P01' } };
    const goodText = 'Caden carded 74 at Pinehurst No. 2. Consistency next time is the target.';
    generateTextMock.mockResolvedValueOnce({ text: goodText, usage: { inputTokens: 20, outputTokens: 20 } });

    const result = await generateRoundRecap('round-1');

    // The recap itself is unaffected — this is the "migration not applied yet
    // in this environment" case the best-effort write exists to survive.
    expect(result.recap).toBe(goodText);
    expect(persistedRecap).toEqual({ p_round_id: 'round-1', p_recap: goodText });
  });

  it('a provenance write that throws never breaks the recap', async () => {
    isFlagEnabledMock.mockReturnValue(false); // no claims block needed; this test is about the provenance write, not the claim gate
    provenanceInsertThrows = true;
    const goodText = 'Caden carded 74 at Pinehurst No. 2. Consistency next time is the target.';
    generateTextMock.mockResolvedValueOnce({ text: goodText, usage: { inputTokens: 20, outputTokens: 20 } });

    const result = await generateRoundRecap('round-1');

    expect(result.recap).toBe(goodText);
    expect(persistedRecap).toEqual({ p_round_id: 'round-1', p_recap: goodText });
  });

  it('SHOULD-4: a call that loses the single-flight race re-reads and returns the winner\'s stored recap, and skips provenance', async () => {
    isFlagEnabledMock.mockReturnValue(false); // no claims block needed; this test is about the race, not the claim gate
    mockRpcOverridePersisted = false; // this call's UPDATE touched zero rows — a concurrent call already won
    const winnerText = "Someone else's generation won the race and is what's actually stored.";
    winnerAiRecap = winnerText;
    const thisCallsOwnText = 'This call generated its own text, but it lost the race and was never stored.';
    generateTextMock.mockResolvedValueOnce({ text: thisCallsOwnText, usage: { inputTokens: 20, outputTokens: 20 } });

    const result = await generateRoundRecap('round-1');

    // Not this call's own (discarded) generation — the winner's stored text,
    // re-read from golf_rounds after the RPC reported persisted: false.
    expect(result.recap).toBe(winnerText);
    expect(result.cached).toBe(true);
    // The RPC was still called with this call's own text (it had no way to
    // know in advance it would lose) — persistedRecap reflects the attempt,
    // not what ended up stored.
    expect(persistedRecap).toEqual({ p_round_id: 'round-1', p_recap: thisCallsOwnText });
    // This call didn't produce what's stored, so it must not write provenance
    // for it — the winning call already did.
    expect(provenanceRows).toHaveLength(0);
  });

  it('SHOULD-4: a failed winner re-read logs and returns no recap, never this call\'s discarded text', async () => {
    isFlagEnabledMock.mockReturnValue(false);
    mockRpcOverridePersisted = false;
    winnerReadError = { message: 'connection reset', code: '08006' };
    const thisCallsOwnText = 'This call generated its own text, but it lost the race and was never stored.';
    generateTextMock.mockResolvedValueOnce({ text: thisCallsOwnText, usage: { inputTokens: 20, outputTokens: 20 } });

    const result = await generateRoundRecap('round-1');

    expect(result.recap).toBeNull();
    expect(result.cached).toBe(false);
    expect(vi.mocked(logServerError)).toHaveBeenCalledWith(
      expect.stringContaining('winner re-read failed'),
      expect.objectContaining({ action: 'generateRoundRecap.rereadWinner', roundId: 'round-1' }),
      'warning',
    );
    expect(provenanceRows).toHaveLength(0);
  });
});

describe('round-recap.ts — single-flight lock, taken BEFORE the LLM call (Package 8, migration 20260923100000)', () => {
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
    provenanceRows.length = 0;
    provenanceInsertResult = { error: null };
    provenanceInsertThrows = false;
    golfRoundsFetchCount = 0;
    winnerAiRecap = null;
    mockRpcOverridePersisted = undefined;
    winnerReadError = null;
    lockRows.clear();
    lockClaimCallCount = 0;
    lockReleaseCallCount = 0;
    lockClaimError = null;
    adminRoundsAiRecap = null;
    adminRpcMock.mockClear();
    bypassGolfRoundsRereadHeuristic = false;
    // The claim-packet gate is orthogonal to the lock — off here so every
    // response in this block is accepted on the flat scan alone, keeping
    // these fixtures about the lock, not the typed claim gate.
    isFlagEnabledMock.mockReset();
    isFlagEnabledMock.mockImplementation(
      (featureId?: string) => featureId === 'coachhelm_recap_single_flight_lock',
    );
    vi.mocked(delay).mockImplementation(() => Promise.resolve());
  });

  it('flag off: makes zero lock RPC calls (byte-for-byte the pre-lock behavior)', async () => {
    isFlagEnabledMock.mockImplementation(() => false);
    const goodText = 'Caden carded 74 at Pinehurst No. 2. Consistency next time is the target.';
    generateTextMock.mockResolvedValueOnce({ text: goodText, usage: { inputTokens: 20, outputTokens: 20 } });

    const result = await generateRoundRecap('round-1');

    expect(result.recap).toBe(goodText);
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(adminRpcMock).not.toHaveBeenCalled();
    expect(lockClaimCallCount).toBe(0);
    expect(lockReleaseCallCount).toBe(0);
  });

  it('a concurrent pair for the same round makes exactly ONE LLM call — the loser waits and reads the winner\'s stored result', async () => {
    // The loser's poll loop checks a REAL `Date.now() < deadline` each
    // iteration. With `delay` mocked to resolve via a bare `Promise.resolve()`
    // (this describe block's default), the loop never yields to a macrotask —
    // it re-queues itself as a microtask on every iteration, so the event
    // loop's microtask queue never drains and the winner's own chain (which
    // does depend on real macrotask turns further down its call stack) never
    // gets scheduled until the loop's real-clock deadline finally elapses.
    // A real, tiny `setTimeout`-based delay — same technique as the
    // "waiter timeout" test below — lets the loser's poll actually yield each
    // iteration, so the winner's chain runs and persists well inside one poll
    // interval instead of only after the full 6s wait is exhausted.
    vi.mocked(delay).mockImplementation((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

    // Hold the FIRST call's LLM response open until both calls have reached
    // the lock: the winner then finishes and persists; the loser (which
    // lost the claim) is still in its poll loop and picks up the result.
    let releaseLlm: () => void = () => {};
    const llmGate = new Promise<void>((resolve) => {
      releaseLlm = resolve;
    });
    const winnerText = 'Caden carded 74 at Pinehurst No. 2. Consistency next time is the target.';
    generateTextMock.mockImplementationOnce(async () => {
      await llmGate;
      return { text: winnerText, usage: { inputTokens: 20, outputTokens: 20 } };
    });
    // save_round_ai_recap's own mock (mockRpc, the regular client) already
    // records `persistedRecap` and reflects success — once it resolves,
    // this test also updates the admin client's golf_rounds poll read so
    // the waiter's next poll observes the persisted text, exactly like a
    // real `AND ai_recap IS NULL` write becoming visible to a fresh read.
    const originalMockRpcImpl = mockRpc.getMockImplementation()!;
    mockRpc.mockImplementationOnce(async (name, args) => {
      const result = await originalMockRpcImpl(name, args);
      adminRoundsAiRecap = args.p_recap;
      return result;
    });

    // Both calls make their own genuine FIRST golf_rounds fetch — opt out of
    // the shared SHOULD-4 "second fetch = re-read" heuristic (see
    // bypassGolfRoundsRereadHeuristic's declaration) so call b's initial
    // fetch gets the real round row, not the re-read stub.
    bypassGolfRoundsRereadHeuristic = true;

    const a = generateRoundRecap('round-1');
    const b = generateRoundRecap('round-1');

    // Let the auth/access/rate-limit microtasks settle so BOTH calls reach
    // the lock claim before either one wins it.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    releaseLlm();
    const [ra, rb] = await Promise.all([a, b]);

    // Exactly one LLM call across both — the definition of "single-flight".
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    // Exactly one claim SUCCEEDED (one holder_token minted); the other
    // claim attempt(s) returned "someone else holds it" (empty rows).
    const results = [ra, rb];
    const winner = results.find((r) => r.recap === winnerText && !r.cached);
    const waiter = results.find((r) => r !== winner);
    expect(winner).toBeTruthy();
    expect(waiter).toBeTruthy();
    expect(waiter?.recap).toBe(winnerText);
    expect(waiter?.cached).toBe(true);
    // The lease was claimed and released exactly once by the winner.
    expect(lockReleaseCallCount).toBe(1);
  }, 15_000);

  it('an expired lock is reclaimed — the new holder still makes exactly one LLM call', async () => {
    // Seed a stale lease (already past its own expiry) as if a prior
    // request crashed mid-generation without ever releasing it.
    lockRows.set('round-1:1:recap', { holder_token: 'crashed-holder', expires_at: Date.now() - 1_000 });
    const goodText = 'Caden carded 74 at Pinehurst No. 2. Consistency next time is the target.';
    generateTextMock.mockResolvedValueOnce({ text: goodText, usage: { inputTokens: 20, outputTokens: 20 } });

    const result = await generateRoundRecap('round-1');

    expect(result.recap).toBe(goodText);
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    // The claim succeeded on the FIRST attempt (expired row reclaimed
    // directly), not via the wait-then-reclaim fallback path.
    expect(lockClaimCallCount).toBe(1);
    expect(lockReleaseCallCount).toBe(1);
  });

  it('a lock claim RPC error fails closed: zero LLM calls, zero save_round_ai_recap calls, no recap returned', async () => {
    lockClaimError = { message: 'simulated connection failure', code: '08006' };

    const result = await generateRoundRecap('round-1');

    expect(result.recap).toBeNull();
    expect(result.cached).toBe(false);
    expect(generateTextMock).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled(); // save_round_ai_recap never called
    expect(persistedRecap).toBeNull();
    expect(vi.mocked(logServerError)).toHaveBeenCalledWith(
      expect.stringContaining('claim threw'),
      expect.objectContaining({ action: 'generateRoundRecap.lock.claim', roundId: 'round-1' }),
      'warning',
    );
  });

  it(
    'a waiter that never sees a result within the wait window fails closed — no persist, no second LLM call',
    async () => {
      // A live lease, held by someone else, that never resolves within this
      // test (the "winner" side is intentionally never simulated) and
      // never expires during the wait. Real timers here (not the file's
      // default instant-delay mock) so the poll loop's own bounded wait is
      // exercised end to end, not bypassed.
      lockRows.set('round-1:1:recap', { holder_token: 'still-working', expires_at: Date.now() + 999_000 });
      vi.mocked(delay).mockImplementation((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

      const result = await generateRoundRecap('round-1');

      expect(result.recap).toBeNull();
      expect(result.cached).toBe(false);
      expect(generateTextMock).not.toHaveBeenCalled();
      expect(mockRpc).not.toHaveBeenCalled(); // save_round_ai_recap never called — no persist
      expect(persistedRecap).toBeNull();
      // One initial claim attempt, then exactly one reclaim attempt after
      // the wait window — still denied (the lease is still live).
      expect(lockClaimCallCount).toBe(2);
    },
    15_000,
  );
});

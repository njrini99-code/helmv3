import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Regression tests for the round recap (stats-accuracy audit 2026-06-09):
//
// buildDeterministicRecap compared a possibly-9-hole total_score against the
// 18-hole stats-cache scoring_average / best_round, producing nonsense like
// "37 strokes below the season average" — and the recap is PERSISTED to
// golf_rounds.ai_recap. For non-18-hole rounds the average/best comparison
// ledes must be skipped, and the season-average/best-round facts must be
// withheld from the LLM prompt.
// ---------------------------------------------------------------------------

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
let mockStats: { scoring_average: number | null; best_round: number | null; rounds_played: number | null } | null = null;
let persistedUpdate: Record<string, unknown> | null = null;

function createChainableMock(maybeSingleData: unknown, onUpdate?: (payload: Record<string, unknown>) => void) {
  const chain: Record<string, unknown> = { data: null, error: null };
  const methods = ['select', 'eq', 'limit'];
  for (const method of methods) {
    chain[method] = vi.fn(() => chain);
  }
  chain.update = vi.fn((payload: Record<string, unknown>) => {
    onUpdate?.(payload);
    return chain;
  });
  chain.maybeSingle = vi.fn(async () => ({ data: maybeSingleData, error: null }));
  return chain;
}

const mockFrom = vi.fn((table: string) => {
  if (table === 'golf_rounds') {
    return createChainableMock(mockRound, (payload) => {
      persistedUpdate = payload;
    });
  }
  if (table === 'golf_player_stats_cache') {
    return createChainableMock(mockStats);
  }
  // golf_team_members / golf_team_coach_staff — no billing coach on file
  return createChainableMock(null);
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ from: mockFrom })),
}));

// compose() returns the deterministic fallback verbatim (budget gate denied /
// LLM unavailable path) and lets us capture the prompt it was handed.
const composeMock = vi.fn(
  async (_input: { prompt: string }, fallback: string) => ({ text: fallback }),
);
vi.mock('@/lib/coachhelm/v3/llm/compose', () => ({
  compose: (input: { prompt: string }, fallback: string) => composeMock(input, fallback),
}));

// generateRoundRecapImpl calls revalidatePath('/golf/dashboard/rounds/...')
// when explicitly opted into via { revalidate: true } (see the "prod incident
// d0a9265f" describe block below). Outside a real Next.js request, an
// unmocked revalidatePath throws "Invariant: static generation store
// missing" — mock it out like the other action test suites (program-
// onboarding, travel, etc.) do, and assert on the mock's call count.
const revalidatePathMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidatePath: (...args: [string]) => revalidatePathMock(...args),
}));

import { generateRoundRecap } from '../round-recap';

const baseRound: MockRoundRow = {
  id: 'round-1',
  player_id: 'player-1',
  course_name: 'Pinehurst No. 2',
  course_city: null,
  course_state: null,
  round_date: '2026-06-01',
  round_type: 'practice',
  total_score: 37,
  score_to_par: 1,
  total_putts: null,
  total_fairways: null,
  total_fairways_hit: null,
  total_gir: null,
  total_gir_possible: null,
  holes_played: 9,
  front_nine: null,
  back_nine: null,
  status: 'completed',
  ai_recap: null,
  ai_recap_generated_at: null,
};

describe('generateRoundRecap — 9-hole vs 18-hole average comparisons', () => {
  beforeEach(() => {
    mockRound = null;
    mockStats = null;
    persistedUpdate = null;
    composeMock.mockClear();
    mockFrom.mockClear();
    revalidatePathMock.mockClear();
  });

  it('skips the season-average and best-round comparisons for a 9-hole round', async () => {
    mockRound = { ...baseRound }; // 37 over 9 holes
    mockStats = { scoring_average: 74.2, best_round: 70, rounds_played: 12 };

    const result = await generateRoundRecap('round-1');

    // Old behavior: "37 on the card, 37.2 strokes below the season average."
    expect(result.recap).not.toContain('below the season average');
    expect(result.recap).not.toContain('sets a new low');
    expect(result.recap).toContain('37 on the card at Pinehurst No. 2');

    // The persisted recap must match what was returned (it lands in
    // golf_rounds.ai_recap, so a bad comparison would be permanent).
    expect(persistedUpdate?.ai_recap).toBe(result.recap);

    // The LLM prompt must not offer the 18-hole figures as comparison fodder
    // for a 9-hole score either.
    const prompt = composeMock.mock.calls[0]?.[0]?.prompt ?? '';
    expect(prompt).not.toContain('season scoring average');
    expect(prompt).not.toContain('best round of the season');
  });

  it('still leads with the season-average comparison for an 18-hole round', async () => {
    mockRound = { ...baseRound, total_score: 68, score_to_par: -2, holes_played: 18 };
    mockStats = { scoring_average: 74.2, best_round: 70, rounds_played: 12 };

    const result = await generateRoundRecap('round-1');

    expect(result.recap).toContain('68 on the card, 6.2 strokes below the season average.');

    const prompt = composeMock.mock.calls[0]?.[0]?.prompt ?? '';
    expect(prompt).toContain("Player's season scoring average: 74.2");
  });
});

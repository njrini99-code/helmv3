import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { MinedPattern } from '@/lib/coachhelm/v2/types';

// ---------------------------------------------------------------------------
// Regression guard for the "old stuff never goes away" stale-data bug.
//
// Every mine covers a rolling 90-day window. A pattern that stops reproducing
// in the current window is simply ABSENT from the fresh batch — before the fix
// its prior row stayed `is_active = true` forever and kept showing on the
// Patterns tab. `savePatterns()` now soft-supersedes those rows: flips them to
// `is_active = false`, scoped to the run's player(s), never touching coach-set
// lifecycle states, and NEVER deleting (project hard rule: no destructive
// delete in a save/sync path).
//
// These tests assert the exact PostgREST filter contract so a future refactor
// can't silently drop the deactivation or widen its blast radius.
// ---------------------------------------------------------------------------

const { upsertMock, supersedeChain, fromUntypedMock, adminFromMock } = vi.hoisted(
  () => {
    const selectInMock = vi.fn(async () => ({
      data: [] as Array<{ id: string; lifecycle_state: string | null }>,
    }));
    const upsertMock = vi.fn(async () => ({ error: null }));

    // Chainable builder double: .update().in().eq().not() return the builder,
    // .or() is the awaited terminal that resolves to { error }.
    const supersedeChain: Record<string, ReturnType<typeof vi.fn>> = {};
    supersedeChain.update = vi.fn(() => supersedeChain);
    supersedeChain.in = vi.fn(() => supersedeChain);
    supersedeChain.eq = vi.fn(() => supersedeChain);
    supersedeChain.not = vi.fn(() => supersedeChain);
    supersedeChain.or = vi.fn(async () => ({ error: null }));
    // Guard the no-delete rule: if a future edit reaches for .delete(), this
    // spy makes the violation visible to the assertions below.
    supersedeChain.delete = vi.fn(() => supersedeChain);

    const fromUntypedMock = vi.fn(() => supersedeChain);

    const adminFromMock = vi.fn(() => ({
      select: vi.fn(() => ({ in: selectInMock })),
      upsert: upsertMock,
    }));

    return { upsertMock, supersedeChain, fromUntypedMock, adminFromMock };
  },
);

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: adminFromMock }),
}));

vi.mock('@/lib/supabase/untyped', () => ({
  fromUntyped: fromUntypedMock,
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));

// Import AFTER mocks are registered.
const { PatternMiner } = await import('@/lib/coachhelm/v2/mining/pattern-miner');

type SavePatterns = { savePatterns: (p: MinedPattern[]) => Promise<void> };

function makePattern(i: number, overrides: Partial<MinedPattern> = {}): MinedPattern {
  return {
    id: `p-${i}`,
    playerId: 'player-1',
    patternType: 'conditional',
    conditions: [],
    outcome: { metric: 'score_to_par', direction: 'increase', magnitude: 1, comparison: 'vs_baseline' },
    support: 0.2,
    confidence: 0.8,
    lift: 1.5,
    conviction: 2,
    strokeImpact: 1.2,
    actionability: 0.7,
    sampleSize: 10,
    firstDetected: new Date().toISOString(),
    lastOccurrence: new Date().toISOString(),
    occurrenceCount: 10,
    trend: 'stable',
    isActive: true,
    ...overrides,
  };
}

describe('PatternMiner.savePatterns soft-supersede (stale-data fix)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retires this player\'s active patterns absent from the fresh batch', async () => {
    const miner = new PatternMiner('player-1');
    const patterns = [makePattern(1), makePattern(2)];

    await (miner as unknown as SavePatterns).savePatterns(patterns);

    expect(fromUntypedMock).toHaveBeenCalledWith(expect.anything(), 'golf_patterns_v2');
    // Supersede, not delete.
    expect(supersedeChain.update).toHaveBeenCalledWith(expect.objectContaining({ is_active: false }));
    expect(supersedeChain.delete).not.toHaveBeenCalled();
    // Scoped to this run's player(s) and to currently-active rows.
    expect(supersedeChain.in).toHaveBeenCalledWith('player_id', ['player-1']);
    expect(supersedeChain.eq).toHaveBeenCalledWith('is_active', true);
    // Exclude the ids we just upserted (quoted for the PostgREST in-list).
    expect(supersedeChain.not).toHaveBeenCalledWith('id', 'in', '("p-1","p-2")');
    // Preserve coach-curated lifecycle states; NULL handled explicitly so
    // three-valued logic doesn't leak detected rows back in.
    expect(supersedeChain.or).toHaveBeenCalledWith(
      'lifecycle_state.is.null,lifecycle_state.not.in.(confirmed,addressed,resolved,dismissed)',
    );
  });

  it('does not issue a supersede when there are no patterns', async () => {
    const miner = new PatternMiner('player-1');

    await (miner as unknown as SavePatterns).savePatterns([]);

    expect(fromUntypedMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('scopes the supersede to exactly the players in the batch', async () => {
    const miner = new PatternMiner('player-1');
    const patterns = [
      makePattern(1, { playerId: 'player-1' }),
      makePattern(2, { playerId: 'player-2' }),
      makePattern(3, { playerId: 'player-1' }),
    ];

    await (miner as unknown as SavePatterns).savePatterns(patterns);

    expect(supersedeChain.in).toHaveBeenCalledWith('player_id', ['player-1', 'player-2']);
    expect(supersedeChain.not).toHaveBeenCalledWith('id', 'in', '("p-1","p-2","p-3")');
  });
});

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
    const upsertMock = vi.fn(
      async (
        _row: Record<string, unknown>,
        _options: { onConflict: string },
      ): Promise<{ error: { message: string } | null }> => ({ error: null }),
    );

    // Chainable builder double: .update().in().eq().not() return the builder,
    // .or() is the awaited terminal that resolves to { error }.
    interface SupersedeChain {
      update: ReturnType<typeof vi.fn>;
      in: ReturnType<typeof vi.fn>;
      eq: ReturnType<typeof vi.fn>;
      not: ReturnType<typeof vi.fn>;
      or: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    }
    const supersedeChain = {} as SupersedeChain;
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

type TableRow = {
  id: string;
  player_id: string;
  pattern_type: string;
  is_active: boolean;
  lifecycle_state: string | null;
};

/**
 * Replay the filters recorded on the chainable double against an in-memory
 * table, so the assertion is "which rows would this UPDATE actually touch?"
 * rather than a filter-string comparison that can stay green while the blast
 * radius changes.
 */
function matchedBySupersede(row: TableRow): boolean {
  const PRESERVED = new Set(['confirmed', 'addressed', 'resolved', 'dismissed']);

  const inCalls = supersedeChain.in.mock.calls as unknown as Array<[string, string[]]>;
  for (const [column, values] of inCalls) {
    if (!values.includes(String(row[column as keyof TableRow]))) return false;
  }

  const eqCalls = supersedeChain.eq.mock.calls as unknown as Array<[string, unknown]>;
  for (const [column, value] of eqCalls) {
    if (row[column as keyof TableRow] !== value) return false;
  }

  const notCalls = supersedeChain.not.mock.calls as unknown as Array<[string, string, string]>;
  for (const [column, operator, list] of notCalls) {
    if (operator !== 'in') throw new Error(`unhandled not() operator: ${operator}`);
    const excluded = list.slice(1, -1).split(',').map((value) => value.replace(/"/g, ''));
    if (excluded.includes(String(row[column as keyof TableRow]))) return false;
  }

  // Exactly one .or(), the coach-curated lifecycle preservation asserted above.
  if (supersedeChain.or.mock.calls.length !== 1) {
    throw new Error(`expected exactly one or() filter, saw ${supersedeChain.or.mock.calls.length}`);
  }
  if (row.lifecycle_state !== null && PRESERVED.has(row.lifecycle_state)) return false;

  return true;
}

describe('PatternMiner.savePatterns soft-supersede (stale-data fix)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertMock.mockResolvedValue({ error: null });
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
    // Scoped to the pattern types THIS miner emits. golf_patterns_v2 is shared
    // with ShotPatternMiner ('contextual'), whose rows can never appear in this
    // batch and must not be retired by it.
    expect(supersedeChain.in).toHaveBeenCalledWith('pattern_type', [
      'conditional',
      'compound',
      'anomaly',
    ]);
    // Preserve coach-curated lifecycle states; NULL handled explicitly so
    // three-valued logic doesn't leak detected rows back in.
    expect(supersedeChain.or).toHaveBeenCalledWith(
      'lifecycle_state.is.null,lifecycle_state.not.in.(confirmed,addressed,resolved,dismissed)',
    );
  });

  it("leaves ShotPatternMiner's contextual patterns active for the same player", async () => {
    // golf_patterns_v2 is shared. ShotPatternMiner writes pattern_type
    // 'contextual' rows with lifecycle_state defaulting to 'detected' — which
    // is NOT in the preserved set — so before the pattern_type scope every
    // round-level mine silently retired that player's shot-dispersion
    // patterns, and nothing in the request could add them back.
    const miner = new PatternMiner('player-1');
    await (miner as unknown as SavePatterns).savePatterns([makePattern(1), makePattern(2)]);

    const table: TableRow[] = [
      // Freshly upserted by this run — excluded by the not-in id list.
      { id: 'p-1', player_id: 'player-1', pattern_type: 'conditional', is_active: true, lifecycle_state: 'detected' },
      // Genuinely stale round-level pattern — this is what the supersede is for.
      { id: 'stale-1', player_id: 'player-1', pattern_type: 'anomaly', is_active: true, lifecycle_state: 'detected' },
      // Another miner's row for the same player — must survive.
      { id: 'shot-1', player_id: 'player-1', pattern_type: 'contextual', is_active: true, lifecycle_state: 'detected' },
      // Coach-curated row — must survive (pre-existing contract).
      { id: 'kept-1', player_id: 'player-1', pattern_type: 'compound', is_active: true, lifecycle_state: 'confirmed' },
      // Different player — must survive.
      { id: 'other-1', player_id: 'player-2', pattern_type: 'anomaly', is_active: true, lifecycle_state: null },
    ];

    expect(table.filter(matchedBySupersede).map((r) => r.id)).toEqual(['stale-1']);
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

  it('upserts in deterministic id order before superseding', async () => {
    const miner = new PatternMiner('player-1');

    await (miner as unknown as SavePatterns).savePatterns([
      makePattern(3),
      makePattern(1),
      makePattern(2),
    ]);

    expect(upsertMock.mock.calls.map(([row]) => row.id)).toEqual(['p-1', 'p-2', 'p-3']);
    expect(supersedeChain.not).toHaveBeenCalledWith('id', 'in', '("p-1","p-2","p-3")');
  });

  it.each([
    {
      failure: 'rejected upsert',
      arrange: () => upsertMock.mockRejectedValueOnce(new Error('transport unavailable')),
    },
    {
      failure: 'database error',
      arrange: () => upsertMock.mockResolvedValueOnce({ error: { message: 'constraint failed' } }),
    },
  ])('does not supersede stale rows after a $failure', async ({ arrange }) => {
    const miner = new PatternMiner('player-1');
    arrange();

    await (miner as unknown as SavePatterns).savePatterns([
      makePattern(2),
      makePattern(1),
    ]);

    // Partial-success behavior remains: every fresh row is attempted.
    expect(upsertMock).toHaveBeenCalledTimes(2);
    expect(fromUntypedMock).not.toHaveBeenCalled();
    expect(supersedeChain.update).not.toHaveBeenCalled();
  });
});

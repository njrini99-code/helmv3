// =============================================================================
// src/lib/baseball/__tests__/import-registry-policy.test.ts
//
// Locks the LOAD-BEARING registry behavior the gap called out: the per-team
// import-source policy (baseball_import_sources) must actually drive matching
// and deduplication. These are the pure decision functions the commit path uses,
// so server (commit) and client (preview) agree by construction.
//
//   * player_match_strategy  -> matchRow path selection
//   * dedupe_strictness      -> detectDuplicate outcome
// =============================================================================

import { describe, it, expect } from 'vitest';

import {
  matchRow,
  detectDuplicate,
  type MatchablePlayer,
  type ExternalIdIndex,
  type ExistingStatKey,
} from '@/lib/baseball/import-matching';

const PLAYERS: MatchablePlayer[] = [
  { id: 'p1', first_name: 'Mike', last_name: 'Trout', jersey_number: 27, grad_year: 2010 },
  { id: 'p2', first_name: 'Aaron', last_name: 'Judge', jersey_number: 99, grad_year: 2013 },
];

// Two same-last-name players — the case jersey/class exists to resolve. The old
// scorer collapsed both "* Smith" candidates to an ambiguous 0.7 with nothing to
// break the tie.
const SMITHS: MatchablePlayer[] = [
  { id: 's1', first_name: 'Jake', last_name: 'Smith', jersey_number: 12, grad_year: 2026 },
  { id: 's2', first_name: 'John', last_name: 'Smith', jersey_number: 7, grad_year: 2025 },
];

function extIndex(entries: Array<[string, string]> = []): ExternalIdIndex {
  const m: ExternalIdIndex = new Map();
  for (const [extId, playerId] of entries) m.set(extId, { playerId, confidence: 1 });
  return m;
}

// ---------------------------------------------------------------------------
// player_match_strategy
// ---------------------------------------------------------------------------

describe('matchRow — player_match_strategy (registry-driven)', () => {
  it('name_then_external_id: exact name match resolves a roster player', () => {
    const r = matchRow(
      { rowIndex: 0, sourceName: 'Mike Trout' },
      PLAYERS,
      extIndex(),
      'name_then_external_id'
    );
    expect(r.playerId).toBe('p1');
    expect(r.action).toBe('update');
    // An unambiguous exact name is the exact_roster tier at full confidence.
    expect(r.matchTier).toBe('exact_roster');
    expect(r.confidence).toBe(1);
  });

  it('external_id_only: a NAME-only row never fuzzy-matches (stays unmatched/skip)', () => {
    const r = matchRow(
      { rowIndex: 0, sourceName: 'Mike Trout' },
      PLAYERS,
      extIndex(),
      'external_id_only'
    );
    expect(r.playerId).toBeNull();
    expect(r.action).toBe('skip');
  });

  it('external_id_only: a mapped external id still resolves deterministically', () => {
    const r = matchRow(
      { rowIndex: 0, sourceName: 'Device-42', externalId: 'TM-42' },
      PLAYERS,
      extIndex([['TM-42', 'p1']]),
      'external_id_only'
    );
    expect(r.playerId).toBe('p1');
    expect(r.confidence).toBe(1);
    expect(r.action).toBe('update');
    expect(r.matchTier).toBe('external_id');
  });

  it('manual_only: NOTHING auto-matches, even an exact name or a mapped ext id', () => {
    const exact = matchRow(
      { rowIndex: 0, sourceName: 'Aaron Judge' },
      PLAYERS,
      extIndex(),
      'manual_only'
    );
    expect(exact.playerId).toBeNull();
    expect(exact.action).toBe('skip');

    const mapped = matchRow(
      { rowIndex: 1, sourceName: 'x', externalId: 'TM-7' },
      PLAYERS,
      extIndex([['TM-7', 'p2']]),
      'manual_only'
    );
    expect(mapped.playerId).toBeNull();
    expect(mapped.action).toBe('skip');
  });

  it('defaults to name_then_external_id when no strategy is given (unregistered source)', () => {
    const r = matchRow({ rowIndex: 0, sourceName: 'Mike Trout' }, PLAYERS, extIndex());
    expect(r.playerId).toBe('p1');
  });
});

// ---------------------------------------------------------------------------
// Tiered cascade (player_matching_v2.md): exact external id, exact roster,
// normalized name + jersey + class, fuzzy name, manual review.
// ---------------------------------------------------------------------------

describe('matchRow — tiered resolution + jersey/class disambiguation', () => {
  it('external id outranks an exact name (tier 1 wins)', () => {
    // Source name would exact-match p1, but the ext id maps to p2 — id wins.
    const r = matchRow(
      { rowIndex: 0, sourceName: 'Mike Trout', externalId: 'TM-9' },
      PLAYERS,
      extIndex([['TM-9', 'p2']])
    );
    expect(r.playerId).toBe('p2');
    expect(r.matchTier).toBe('external_id');
  });

  it('an EXACT same-name tie with NO jersey/class stays unmatched (never guess)', () => {
    // Two players normalize to the identical "jake smith"; with no jersey/class
    // signal the matcher must NOT silently pick one — it leaves it for a coach.
    const ambiguous: MatchablePlayer[] = [
      { id: 'a', first_name: 'Jake', last_name: 'Smith' },
      { id: 'b', first_name: 'Jake', last_name: 'Smith' },
    ];
    const r = matchRow({ rowIndex: 0, sourceName: 'Jake Smith' }, ambiguous, extIndex());
    expect(r.playerId).toBeNull();
    expect(r.matchTier).toBe('unmatched');
  });

  it('jersey number breaks an exact same-name tie (tier 3)', () => {
    const ambiguous: MatchablePlayer[] = [
      { id: 'a', first_name: 'Jake', last_name: 'Smith', jersey_number: 12, grad_year: 2026 },
      { id: 'b', first_name: 'Jake', last_name: 'Smith', jersey_number: 7, grad_year: 2025 },
    ];
    const r = matchRow(
      { rowIndex: 0, sourceName: 'Jake Smith', sourceJersey: '#7' },
      ambiguous,
      extIndex()
    );
    expect(r.playerId).toBe('b');
    expect(r.matchTier).toBe('name_jersey_class');
  });

  it('class (grad year) breaks an exact same-name tie (tier 3)', () => {
    const ambiguous: MatchablePlayer[] = [
      { id: 'a', first_name: 'Jake', last_name: 'Smith', grad_year: 2026 },
      { id: 'b', first_name: 'Jake', last_name: 'Smith', grad_year: 2025 },
    ];
    const r = matchRow(
      { rowIndex: 0, sourceName: 'Jake Smith', sourceClass: '2025' },
      ambiguous,
      extIndex()
    );
    expect(r.playerId).toBe('b');
    expect(r.matchTier).toBe('name_jersey_class');
  });

  it('exact same-name tie with a jersey that matches NEITHER stays unmatched', () => {
    const ambiguous: MatchablePlayer[] = [
      { id: 'a', first_name: 'Jake', last_name: 'Smith', jersey_number: 12 },
      { id: 'b', first_name: 'Jake', last_name: 'Smith', jersey_number: 7 },
    ];
    const r = matchRow(
      { rowIndex: 0, sourceName: 'Jake Smith', sourceJersey: '99' },
      ambiguous,
      extIndex()
    );
    expect(r.playerId).toBeNull();
    expect(r.matchTier).toBe('unmatched');
  });

  it('jersey boost pulls apart a same-last-name fuzzy pair the old scorer tied', () => {
    // "J Smith" fuzzy-ties s1 (Jake) and s2 (John) at 0.7; the jersey that
    // matches s2 decisively pulls it ahead AND stamps the jersey/class tier.
    const r = matchRow(
      { rowIndex: 0, sourceName: 'J Smith', sourceJersey: '7' },
      SMITHS,
      extIndex()
    );
    expect(r.playerId).toBe('s2');
    expect(r.matchTier).toBe('name_jersey_class');
    expect(r.confidence).toBeGreaterThan(0.7);
  });

  it('a plain fuzzy match with no jersey/class is tagged fuzzy_name', () => {
    const r = matchRow({ rowIndex: 0, sourceName: 'Mike Troutt' }, PLAYERS, extIndex());
    expect(r.playerId).toBe('p1');
    expect(r.matchTier).toBe('fuzzy_name');
  });
});

// ---------------------------------------------------------------------------
// dedupe_strictness
// ---------------------------------------------------------------------------

describe('detectDuplicate — dedupe_strictness (registry-driven)', () => {
  const existing = (source: string | null): ExistingStatKey[] => [
    { statId: 's1', playerId: 'p1', source },
  ];

  it('loose: never a duplicate (always writes, overwriting in place)', () => {
    const out = detectDuplicate(
      { playerId: 'p1', incomingSource: 'import:trackman' },
      existing('import:gamechanger'),
      'loose'
    );
    expect(out.duplicate).toBe(false);
  });

  it('standard: blocks a DIFFERENT source from stomping an existing session row', () => {
    const out = detectDuplicate(
      { playerId: 'p1', incomingSource: 'import:trackman' },
      existing('import:gamechanger'),
      'standard'
    );
    expect(out.duplicate).toBe(true);
    if (out.duplicate) expect(out.existingStatId).toBe('s1');
  });

  it('standard: allows a SAME-source re-import (scoring correction)', () => {
    const out = detectDuplicate(
      { playerId: 'p1', incomingSource: 'import:gamechanger' },
      existing('import:gamechanger'),
      'standard'
    );
    expect(out.duplicate).toBe(false);
  });

  it('strict: ANY existing session row is a duplicate, regardless of source', () => {
    const same = detectDuplicate(
      { playerId: 'p1', incomingSource: 'import:gamechanger' },
      existing('import:gamechanger'),
      'strict'
    );
    expect(same.duplicate).toBe(true);

    const diff = detectDuplicate(
      { playerId: 'p1', incomingSource: 'import:trackman' },
      existing('import:gamechanger'),
      'strict'
    );
    expect(diff.duplicate).toBe(true);
  });

  it('no existing row for the player -> never a duplicate (any strictness)', () => {
    for (const s of ['loose', 'standard', 'strict'] as const) {
      const out = detectDuplicate(
        { playerId: 'p2', incomingSource: 'import:trackman' },
        existing('import:trackman'),
        s
      );
      expect(out.duplicate).toBe(false);
    }
  });
});

// =============================================================================
// src/lib/baseball/__tests__/import-duplicate-verdict.test.ts
//
// Locks the DUPLICATE / RE-IMPORT verdict the gap called out as missing
// (duplicate_resolution_v2.md: "Import runs must DETECT existing source rows and
// SHOW create/update/skip decisions before commit"). computeRowVerdicts is the
// pure decision the preview renders and the commit re-checks, so server + client
// agree by construction. Identity is keyed by external id first, else player +
// grain — re-importing the same file resolves the same row to the same record.
// =============================================================================

import { describe, it, expect } from 'vitest';

import {
  computeRowVerdicts,
  sourceRowIdentity,
  type ExistingStatRecord,
  type IncomingRowForVerdict,
} from '@/lib/baseball/import-matching';

const incoming = (over: Partial<IncomingRowForVerdict>): IncomingRowForVerdict => ({
  rowIndex: 0,
  playerId: 'p1',
  externalId: null,
  incomingSource: 'import:gamechanger',
  values: { at_bats: 4, hits: 2 },
  ...over,
});

const existing = (over: Partial<ExistingStatRecord>): ExistingStatRecord => ({
  statId: 's1',
  playerId: 'p1',
  source: 'import:gamechanger',
  externalId: null,
  values: { at_bats: 4, hits: 2 },
  ...over,
});

describe('computeRowVerdicts — create/update/skip before commit', () => {
  it('verdict NEW when no existing record for the player', () => {
    const out = computeRowVerdicts([incoming({})], []);
    expect(out[0]!.verdict).toBe('new');
    expect(out[0]!.existingStatId).toBeNull();
    expect(out[0]!.changedFields).toEqual([]);
  });

  it('verdict EXACT_DUPLICATE when same source + identical values (re-import no-op)', () => {
    const out = computeRowVerdicts([incoming({})], [existing({})]);
    expect(out[0]!.verdict).toBe('exact_duplicate');
    expect(out[0]!.existingStatId).toBe('s1');
    expect(out[0]!.changedFields).toEqual([]);
  });

  it('verdict WILL_UPDATE when same source but values changed, with a precise diff', () => {
    const out = computeRowVerdicts(
      [incoming({ values: { at_bats: 4, hits: 3 } })],
      [existing({ values: { at_bats: 4, hits: 2 } })],
    );
    expect(out[0]!.verdict).toBe('will_update');
    expect(out[0]!.changedFields).toEqual([{ field: 'hits', before: 2, after: 3 }]);
  });

  it('verdict WILL_UPDATE when a DIFFERENT source already owns the session row', () => {
    const out = computeRowVerdicts(
      [incoming({ incomingSource: 'import:trackman' })],
      [existing({ source: 'import:gamechanger' })],
    );
    // A different source overwriting an existing line IS an overwrite, even when
    // the mapped values happen to be equal — the source/trust stamp changes.
    expect(out[0]!.verdict).toBe('will_update');
    expect(out[0]!.existingSource).toBe('import:gamechanger');
  });

  it('keys identity by EXTERNAL ID first, so a re-import resolves the same line', () => {
    // The incoming row carries an external id matching an existing record stored
    // under a DIFFERENT player id (e.g. a prior mis-match the coach corrected) —
    // external-id identity still resolves it as the same line.
    const out = computeRowVerdicts(
      [incoming({ externalId: 'GC-EVENT-42', playerId: 'p1' })],
      [existing({ externalId: 'GC-EVENT-42', playerId: 'p2', statId: 's9' })],
    );
    expect(out[0]!.existingStatId).toBe('s9');
    expect(out[0]!.verdict).toBe('exact_duplicate');
  });

  it('carries the playerId the verdict was computed against (for stale invalidation)', () => {
    const out = computeRowVerdicts([incoming({ playerId: 'p7' })], []);
    expect(out[0]!.playerId).toBe('p7');
  });
});

describe('sourceRowIdentity — stable external-id-first key', () => {
  it('prefers the external id when present', () => {
    expect(
      sourceRowIdentity({ playerId: 'p1', externalId: 'X1', statType: 'game', sessionDate: '2026-04-12' }),
    ).toBe('ext:X1|game|2026-04-12');
  });

  it('falls back to player + grain when no external id', () => {
    expect(
      sourceRowIdentity({ playerId: 'p1', externalId: null, statType: 'game', sessionDate: '2026-04-12' }),
    ).toBe('pl:p1|game|2026-04-12');
  });
});

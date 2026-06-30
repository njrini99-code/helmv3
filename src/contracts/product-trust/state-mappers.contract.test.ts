import { describe, expect, it } from 'vitest';

import { mapAiResultState } from '@/lib/product-trust/ai-result-state';
import { mapImportResultState } from '@/lib/product-trust/import-result-state';
import { mapLoadState } from '@/lib/product-trust/load-state';
import { mapSaveState } from '@/lib/product-trust/save-state';

describe('Product trust state mapper contracts', () => {
  it('TRUST-001 maps failed load to error, not healthy empty', () => {
    expect(mapLoadState({ ok: false, error: 'DB timeout' })).toEqual({
      state: 'error',
      message: 'DB timeout',
      staleData: undefined,
    });
  });

  it('TRUST-002 maps empty success to empty, not error', () => {
    expect(mapLoadState({ ok: true, data: [] })).toEqual({ state: 'empty' });
  });

  it('TRUST-003 maps failed save to failed, never saved', () => {
    expect(mapSaveState({ ok: false, error: 'write rejected' })).toEqual({
      state: 'failed',
      message: 'write rejected',
    });
  });

  it('TRUST-004 surfaces partial import failed rows', () => {
    expect(
      mapImportResultState({
        importedRows: 2,
        failedRows: [{ row: 3, reason: 'missing score' }],
      }),
    ).toEqual({
      state: 'partial_failure',
      importedRows: 2,
      failedRows: [{ row: 3, reason: 'missing score' }],
    });
  });

  it('TRUST-005 maps AI failure to unavailable, not fake fresh insight', () => {
    expect(mapAiResultState({ ok: false, error: 'budget exhausted', staleText: 'Old note' })).toEqual({
      state: 'unavailable',
      message: 'budget exhausted',
      staleText: 'Old note',
    });
  });

  it('TRUST-006 labels stale successful data as stale', () => {
    expect(mapLoadState({ ok: true, data: [{ id: 'p1' }], stale: true })).toEqual({
      state: 'stale',
      data: [{ id: 'p1' }],
    });
    expect(mapAiResultState({ ok: true, text: 'Old pattern', generatedAt: '2026-06-01', stale: true })).toEqual({
      state: 'stale_insight',
      text: 'Old pattern',
      generatedAt: '2026-06-01',
    });
  });
});

// =============================================================================
// src/lib/baseball/__tests__/import-source-enabled.test.ts
//
// #407 — disabled import-source registry rows are blocked and hidden from merge.
// =============================================================================

import { describe, it, expect } from 'vitest';

import {
  BaseballDisabledSourceError,
  isImportSourceEnabled,
  assertImportSourceEnabled,
} from '@/lib/baseball/import-source-enabled';

describe('isImportSourceEnabled', () => {
  it('treats unregistered sources as enabled (adapter defaults)', () => {
    expect(isImportSourceEnabled(null)).toBe(true);
    expect(isImportSourceEnabled(undefined)).toBe(true);
  });

  it('returns false when the registry row is disabled', () => {
    expect(isImportSourceEnabled({ source_name: 'TrackMan', enabled: false })).toBe(false);
  });

  it('returns true when enabled is true', () => {
    expect(isImportSourceEnabled({ source_name: 'TrackMan', enabled: true })).toBe(true);
  });
});

describe('assertImportSourceEnabled', () => {
  it('does not throw for unregistered sources', () => {
    expect(() => assertImportSourceEnabled(null, 'trackman')).not.toThrow();
  });

  it('throws BaseballDisabledSourceError for disabled registry rows', () => {
    expect(() =>
      assertImportSourceEnabled({ source_name: 'TrackMan', enabled: false }, 'trackman'),
    ).toThrow(BaseballDisabledSourceError);
  });
});

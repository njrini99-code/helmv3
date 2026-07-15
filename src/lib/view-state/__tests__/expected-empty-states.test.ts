import { describe, it, expect } from 'vitest';

import {
  EXPECTED_EMPTY_STATES,
  EXPECTED_EMPTY_STATE_CODES,
  expectedEmptyStateCopy,
  isExpectedEmptyStateCode,
} from '@/lib/view-state/expected-empty-states';
import { isExpectedEmptyStateCode as observerIsExpectedEmptyStateCode } from '@/lib/admin/observe-action-result';

describe('expected-empty-states registry', () => {
  it('exposes copy with a next-action description for every code', () => {
    for (const [code, def] of Object.entries(EXPECTED_EMPTY_STATES)) {
      expect(def.title.length, `${code} title`).toBeGreaterThan(0);
      expect(def.description.length, `${code} description`).toBeGreaterThan(0);
    }
  });

  it('code set matches the copy map exactly', () => {
    expect([...EXPECTED_EMPTY_STATE_CODES].sort()).toEqual(
      Object.keys(EXPECTED_EMPTY_STATES).sort(),
    );
  });

  it('guards and copy lookup agree', () => {
    expect(isExpectedEmptyStateCode('no_completed_rounds')).toBe(true);
    expect(expectedEmptyStateCopy('no_completed_rounds')?.title).toBe('No rounds yet');
    expect(isExpectedEmptyStateCode('engine_session_expired')).toBe(false);
    expect(expectedEmptyStateCopy('engine_session_expired')).toBeNull();
    expect(expectedEmptyStateCopy(null)).toBeNull();
    expect(expectedEmptyStateCopy(undefined)).toBeNull();
  });

  // The whole point of the registry: the observer's telemetry classification
  // and the UI's copy source key off the SAME codes and cannot drift.
  it('observer classification agrees with the registry for every code', () => {
    for (const code of EXPECTED_EMPTY_STATE_CODES) {
      expect(observerIsExpectedEmptyStateCode(code), code).toBe(true);
    }
    expect(observerIsExpectedEmptyStateCode('not_a_registered_code')).toBe(false);
  });
});

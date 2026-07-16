/**
 * use-colleges — non-production fixture exclusion.
 *
 * Regression coverage for the visual-audit finding (player-journey-colleges.md,
 * [DISHONEST]): `useColleges()`'s query filtered `organizations` only to
 * `type = 'college'`, with no exclusion of seed/E2E/QA rows, so a real
 * player's "Discover Colleges" catalog was majority (12 of 21 observed) test
 * fixture data — "Codex Demo College", "Demo University Golf", "E2E Test
 * University", "QA Test University", "UI Test College 179805…", and a
 * college literally named "Yes" located in "Yes, YA" ("YA" is not a real US
 * state code).
 *
 * Covers both the pure predicate functions (exact fixture names/states from
 * the audit) and the hook's actual filtering behavior against a mixed
 * fixture+real result set.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import {
  isNonProductionOrgName,
  isInvalidUsStateCode,
  isNonProductionOrg,
  useColleges,
} from '../use-colleges';

// ── Supabase client mock — chainable query builder, mirrors the pattern in
// CreateDevPlanModal.test.tsx. ──────────────────────────────────────────────
let queryResult: { data: unknown[] | null; error: null } = { data: [], error: null };

function makeQueryChain() {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order', 'ilike', 'or', 'not']) {
    chain[method] = () => chain;
  }
  (chain as { then: (resolve: (v: unknown) => void) => void }).then = (resolve) => {
    resolve(queryResult);
  };
  return chain;
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => makeQueryChain(),
  }),
}));

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({ user: null }),
}));

describe('isNonProductionOrgName', () => {
  it.each([
    'Codex Demo College',
    'Codex Feature College',
    'Codex Golf',
    'Codex Test College',
    'Demo University Golf',
    'Demo University',
    'E2E Test University',
    'QA Test University',
    'Test College Baseball',
    'UI Test College 179805',
  ])('flags %s as non-production', (name) => {
    expect(isNonProductionOrgName(name)).toBe(true);
  });

  it.each([
    'Denison University',
    'Guilford College',
    'Hampden-Sydney College',
    'Lenoir-Rhyne University',
    'Methodist University',
    'Piedmont University',
    'University of Lynchburg',
    'Rini University',
  ])('does not flag a real program (%s)', (name) => {
    expect(isNonProductionOrgName(name)).toBe(false);
  });

  it('does not flag/throw on a missing name', () => {
    expect(isNonProductionOrgName(null)).toBe(false);
    expect(isNonProductionOrgName(undefined)).toBe(false);
  });
});

describe('isInvalidUsStateCode', () => {
  it('flags the "Yes, YA" seed fixture\'s bogus state code', () => {
    expect(isInvalidUsStateCode('YA')).toBe(true);
  });

  it('accepts a real state code, case-insensitively', () => {
    expect(isInvalidUsStateCode('nc')).toBe(false);
    expect(isInvalidUsStateCode('OH')).toBe(false);
  });

  it('accepts DC and US territories', () => {
    expect(isInvalidUsStateCode('DC')).toBe(false);
    expect(isInvalidUsStateCode('PR')).toBe(false);
  });

  it('does not flag a missing state (handled by the name check instead)', () => {
    expect(isInvalidUsStateCode(null)).toBe(false);
    expect(isInvalidUsStateCode(undefined)).toBe(false);
  });
});

describe('isNonProductionOrg', () => {
  it('flags "Yes" in "Yes, YA" purely on the invalid state code (name alone gives no signal)', () => {
    expect(isNonProductionOrg({ name: 'Yes', location_state: 'YA' })).toBe(true);
  });

  it('flags a name-pattern match regardless of a valid state', () => {
    expect(isNonProductionOrg({ name: 'Codex Test College', location_state: 'NC' })).toBe(true);
  });

  it('does not flag a real program', () => {
    expect(isNonProductionOrg({ name: 'Denison University', location_state: 'OH' })).toBe(false);
  });
});

describe('useColleges — fixture exclusion', () => {
  beforeEach(() => {
    queryResult = { data: [], error: null };
  });

  it('filters seed/E2E/QA fixture rows out of the live catalog, keeping real programs', async () => {
    queryResult = {
      data: [
        { id: '1', name: 'Denison University', location_state: 'OH', type: 'college' },
        { id: '2', name: 'Codex Demo College', location_state: 'NC', type: 'college' },
        { id: '3', name: 'Yes', location_state: 'YA', type: 'college' },
        { id: '4', name: 'Guilford College', location_state: 'NC', type: 'college' },
        { id: '5', name: 'E2E Test University', location_state: 'NC', type: 'college' },
      ],
      error: null,
    };

    const { result } = renderHook(() => useColleges());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.colleges.map((c) => c.name)).toEqual([
      'Denison University',
      'Guilford College',
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { TOUR_REFUSAL_CODES, TOUR_REFUSAL_COPY, isTourSchemaMissing, tourRefusalOf } from '../tournament-refusals';

describe('tournament refusal codes', () => {
  it('reads a P0001 refusal by its bare code', () => {
    for (const code of ['stale', 'round_order', 'round_started', 'locked', 'rounds_linked', 'not_coach'] as const) {
      expect(tourRefusalOf({ code: 'P0001', message: code })).toBe(code);
    }
  });

  it('an unknown P0001 message is a failure, not a guessed code', () => {
    expect(tourRefusalOf({ code: 'P0001', message: 'something else' })).toBe('failed');
  });

  it('a missing table, column or function is not set up', () => {
    for (const code of ['PGRST205', '42P01', 'PGRST204', '42703', 'PGRST202', '42883']) {
      expect(isTourSchemaMissing({ code })).toBe(true);
      expect(tourRefusalOf({ code, message: 'x' })).toBe('not_set_up');
    }
  });

  it('a check, key or cast failure is invalid; RLS is not_coach', () => {
    expect(tourRefusalOf({ code: '23514', message: 'check' })).toBe('invalid');
    expect(tourRefusalOf({ code: '22P02', message: 'cast' })).toBe('invalid');
    expect(tourRefusalOf({ code: '42501', message: 'rls' })).toBe('not_coach');
  });

  it('every code has its words', () => {
    for (const c of TOUR_REFUSAL_CODES) expect(TOUR_REFUSAL_COPY[c].length).toBeGreaterThan(10);
  });
});

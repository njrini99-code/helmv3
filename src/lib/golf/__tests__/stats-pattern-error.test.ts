import { describe, expect, it } from 'vitest';

import { isMissingGolfPatternsTableError } from '@/lib/golf/stats-pattern-error';

describe('isMissingGolfPatternsTableError', () => {
  it.each([
    [{ code: '42P01', message: 'relation "golf_patterns_v2" does not exist' }],
    [{ code: 'PGRST205', message: "Could not find the table 'public.golf_patterns_v2' in the schema cache" }],
  ])('accepts only the expected absent-table compatibility condition', (error) => {
    expect(isMissingGolfPatternsTableError(error)).toBe(true);
  });

  it.each([
    [{ code: '42501', message: 'permission denied for table golf_patterns_v2' }],
    [{ code: '57014', message: 'canceling statement due to statement timeout' }],
    [{ code: 'PGRST205', message: "Could not find the table 'public.other_table' in the schema cache" }],
    [{ code: '42703', message: 'column stroke_impact does not exist' }],
  ])('keeps RLS, timeout, other-table, and schema failures observable', (error) => {
    expect(isMissingGolfPatternsTableError(error)).toBe(false);
  });
});

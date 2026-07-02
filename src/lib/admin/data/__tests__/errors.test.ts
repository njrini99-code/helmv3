import { describe, it, expect } from 'vitest';
import { parseErrorsFilters } from '@/lib/admin/data/errors';

describe('parseErrorsFilters', () => {
  it('defaults to a 24h window with no filters', () => {
    expect(parseErrorsFilters({})).toEqual({ windowHours: 24 });
  });
  it('parses valid sport/severity/source/window from the URL', () => {
    expect(
      parseErrorsFilters({ sport: 'golf', severity: 'critical', source: 'rls_denial', window: '168' }),
    ).toEqual({ sport: 'golf', severity: 'critical', source: 'rls_denial', windowHours: 168 });
  });
  it('drops invalid values instead of trusting the URL', () => {
    expect(parseErrorsFilters({ sport: 'chess', severity: 'meh', window: '-5' })).toEqual({ windowHours: 24 });
  });

  // W16 Task 4 — drill-in from the Feature Health board.
  it('parses a valid feature key from the URL', () => {
    expect(parseErrorsFilters({ feature: 'round_tracking' })).toEqual({
      windowHours: 24,
      feature: 'round_tracking',
    });
  });
  it('drops an unknown feature key instead of trusting the URL (no crash, no filter)', () => {
    expect(parseErrorsFilters({ feature: 'not_a_real_feature' })).toEqual({ windowHours: 24 });
  });
  it('never accepts the excluded CRM key as a feature filter', () => {
    expect(parseErrorsFilters({ feature: 'crm_recruiting_pipeline' })).toEqual({ windowHours: 24 });
  });
});

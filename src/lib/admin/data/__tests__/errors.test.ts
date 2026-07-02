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
});

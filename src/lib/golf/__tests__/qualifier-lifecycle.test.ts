import { describe, expect, it } from 'vitest';
import { hasQualifierEndDatePassed } from '../qualifier-lifecycle';

describe('hasQualifierEndDatePassed', () => {
  it('keeps a qualifier open through the full final team-local day', () => {
    // This is still Aug 23 in New York, even though UTC is already Aug 24.
    expect(
      hasQualifierEndDatePassed(
        '2026-08-23',
        'America/New_York',
        new Date('2026-08-24T00:58:00.000Z'),
      ),
    ).toBe(false);
  });

  it('closes a qualifier only after the final team-local day has ended', () => {
    expect(
      hasQualifierEndDatePassed(
        '2026-08-23',
        'America/New_York',
        new Date('2026-08-24T04:01:00.000Z'),
      ),
    ).toBe(true);
  });
});

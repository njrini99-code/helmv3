// @vitest-environment node
// =============================================================================
// src/lib/baseball/daily-contract/__tests__/contract-day.test.ts
//
// Pins the TIMEZONE-CORRECT "today" anchor (Gap 1). The whole point: a player's
// late-night work must land on THEIR local contract day, not the server's UTC day,
// and the missed-sweep must not roll a day over before the TEAM's local midnight.
// =============================================================================

import { describe, it, expect } from 'vitest';

import {
  todayIsoInTz,
  isoMinusDays,
  resolveTeamTimezone,
} from '@/lib/baseball/daily-contract/contract-day';

describe('todayIsoInTz', () => {
  it('a Pacific player at 9pm on the 23rd is on the 23rd, not the 24th', () => {
    // 2026-06-24T04:00:00Z == 2026-06-23 21:00 PDT.
    expect(todayIsoInTz('America/Los_Angeles', new Date('2026-06-24T04:00:00Z'))).toBe(
      '2026-06-23',
    );
  });

  it('an Eastern player at 9pm on the 23rd is on the 23rd', () => {
    // 2026-06-24T01:00:00Z == 2026-06-23 21:00 EDT.
    expect(todayIsoInTz('America/New_York', new Date('2026-06-24T01:00:00Z'))).toBe(
      '2026-06-23',
    );
  });

  it('past the team local midnight, the day has rolled forward', () => {
    // 2026-06-24T05:00:00Z == 2026-06-24 01:00 EDT (Eastern already on the 24th).
    expect(todayIsoInTz('America/New_York', new Date('2026-06-24T05:00:00Z'))).toBe(
      '2026-06-24',
    );
    // ...but Pacific (22:00 on the 23rd) is still the 23rd at that same instant.
    expect(todayIsoInTz('America/Los_Angeles', new Date('2026-06-24T05:00:00Z'))).toBe(
      '2026-06-23',
    );
  });

  it('handles DST: America/New_York resolves EDT in summer', () => {
    // 2026-07-15T03:30:00Z == 2026-07-14 23:30 EDT (UTC-4), still the 14th.
    expect(todayIsoInTz('America/New_York', new Date('2026-07-15T03:30:00Z'))).toBe(
      '2026-07-14',
    );
  });

  it('honest degrade: an empty tz falls back to the UTC slice (never throws)', () => {
    expect(todayIsoInTz('', new Date('2026-06-24T04:00:00Z'))).toBe('2026-06-24');
  });

  it('honest degrade: an invalid IANA tz falls back to UTC (never throws)', () => {
    expect(
      todayIsoInTz('Not/A_Zone', new Date('2026-06-24T04:00:00Z')),
    ).toBe('2026-06-24');
  });
});

describe('isoMinusDays', () => {
  it('subtracts UTC-safe across a month boundary', () => {
    expect(isoMinusDays('2026-07-01', 1)).toBe('2026-06-30');
  });
  it('subtracts across a year boundary', () => {
    expect(isoMinusDays('2026-01-01', 1)).toBe('2025-12-31');
  });
});

describe('resolveTeamTimezone', () => {
  // A tiny fake of just the .from().select().eq().maybeSingle() path the resolver
  // uses. Cast through `unknown` to the wide supabase client type the param wants.
  function clientReturning(timezone: string | null | undefined) {
    const fake = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: timezone === undefined ? null : { timezone },
            }),
          }),
        }),
      }),
    };
    return fake as unknown as Parameters<typeof resolveTeamTimezone>[0];
  }

  it('returns the column value when present', async () => {
    expect(
      await resolveTeamTimezone(clientReturning('America/Chicago'), 't1'),
    ).toBe('America/Chicago');
  });

  it('defaults to ET when the row is missing', async () => {
    expect(await resolveTeamTimezone(clientReturning(undefined), 't1')).toBe(
      'America/New_York',
    );
  });

  it('defaults to ET when the column is null/empty', async () => {
    expect(await resolveTeamTimezone(clientReturning(null), 't1')).toBe(
      'America/New_York',
    );
    expect(await resolveTeamTimezone(clientReturning('   '), 't1')).toBe(
      'America/New_York',
    );
  });

  it('defaults to ET for an empty team id without querying', async () => {
    expect(await resolveTeamTimezone(clientReturning('America/Chicago'), '')).toBe(
      'America/New_York',
    );
  });
});

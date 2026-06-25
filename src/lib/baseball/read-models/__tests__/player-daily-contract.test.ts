// @vitest-environment node
// =============================================================================
// src/lib/baseball/read-models/__tests__/player-daily-contract.test.ts
//
// Pins the STREAK-CREDIT honesty rule (Gap 3): a completed day earns streak
// credit ONLY when it honored at least one item. A 0-honored "complete" closes
// the ritual honestly but does NOT extend the streak — the streak means "days you
// did the work," not "days you tapped complete."
// =============================================================================

import { describe, it, expect } from 'vitest';

import {
  computeStreak,
  isStreakCreditedDay,
  type DailyContractView,
} from '@/lib/baseball/read-models/player-daily-contract';
import type { DailyContractStatus } from '@/lib/types/baseball-passport';

function day(
  contractDate: string,
  status: DailyContractStatus,
  honoredCount: number,
): DailyContractView {
  return {
    id: contractDate,
    contractDate,
    status,
    items: [],
    reflection: null,
    committedAt: status === 'draft' ? null : `${contractDate}T12:00:00Z`,
    completedAt: status === 'completed' ? `${contractDate}T20:00:00Z` : null,
    missedAt: status === 'missed' ? `${contractDate}T23:59:59Z` : null,
    honoredCount,
    totalCount: 3,
    visibility: 'player_only',
    coachAcknowledgedAt: null,
  };
}

function byDate(days: DailyContractView[]): Map<string, DailyContractView> {
  return new Map(days.map((d) => [d.contractDate, d]));
}

describe('isStreakCreditedDay', () => {
  it('credits a completed day with >=1 honored', () => {
    expect(isStreakCreditedDay({ status: 'completed', honoredCount: 1 })).toBe(true);
  });
  it('does NOT credit a completed day with 0 honored', () => {
    expect(isStreakCreditedDay({ status: 'completed', honoredCount: 0 })).toBe(false);
  });
  it('does NOT credit a committed (not completed) day', () => {
    expect(isStreakCreditedDay({ status: 'committed', honoredCount: 3 })).toBe(false);
  });
  it('does NOT credit a missed day', () => {
    expect(isStreakCreditedDay({ status: 'missed', honoredCount: 2 })).toBe(false);
  });
});

describe('computeStreak — Gap 3 rule (a)', () => {
  const TODAY = '2026-06-24';

  it('commit -> skip all -> complete (0 honored) => streak 0 (NOT 1)', () => {
    const m = byDate([day(TODAY, 'completed', 0)]);
    expect(computeStreak(m, TODAY)).toBe(0);
  });

  it('commit -> honor 1 -> complete => streak 1', () => {
    const m = byDate([day(TODAY, 'completed', 1)]);
    expect(computeStreak(m, TODAY)).toBe(1);
  });

  it('a 0-honored completed day MID-RUN breaks the consecutive streak', () => {
    // 24 honored, 23 honored, 22 completed-but-0-honored, 21 honored.
    // Walking back from today: 24(+1), 23(+1), then 22 is NOT credited → stop.
    const m = byDate([
      day('2026-06-24', 'completed', 2),
      day('2026-06-23', 'completed', 1),
      day('2026-06-22', 'completed', 0), // empty close — breaks here
      day('2026-06-21', 'completed', 3),
    ]);
    expect(computeStreak(m, '2026-06-24')).toBe(2);
  });

  it("a completed-but-0-honored TODAY doesn't break a real prior streak (anchors yesterday)", () => {
    // Today closed empty (0 honored): it must neither count nor falsely reset the
    // streak — the walk anchors on yesterday and counts the honored run.
    const m = byDate([
      day('2026-06-24', 'completed', 0), // empty close today
      day('2026-06-23', 'completed', 2),
      day('2026-06-22', 'completed', 1),
    ]);
    expect(computeStreak(m, '2026-06-24')).toBe(2);
  });

  it('counts a normal consecutive honored run', () => {
    const m = byDate([
      day('2026-06-24', 'completed', 1),
      day('2026-06-23', 'completed', 2),
      day('2026-06-22', 'completed', 1),
    ]);
    expect(computeStreak(m, '2026-06-24')).toBe(3);
  });

  it('a gap (missing day) ends the streak', () => {
    const m = byDate([
      day('2026-06-24', 'completed', 1),
      // 23rd missing
      day('2026-06-22', 'completed', 1),
    ]);
    expect(computeStreak(m, '2026-06-24')).toBe(1);
  });
});

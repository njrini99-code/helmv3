/**
 * Pkg 9 gap 2 (owner decision, 2026-09-23) — `followUpEligibilityReason` /
 * `computeFollowUpEligibility` boundaries. The loader (`loadFollowUpRoundCounts`,
 * a `golf_rounds` read) is exercised against the real fake-Supabase fixture
 * in `src/test/coachhelm/focus-area-lifecycle.integration.test.ts`, not here
 * — this file is the pure core only, same split as `due-for-review.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import {
  followUpEligibilityReason,
  computeFollowUpEligibility,
  FOLLOW_UP_ROUNDS_THRESHOLD,
} from '@/lib/coachhelm/focus-areas/follow-up-eligibility';

const TODAY_ISO = '2026-09-23';

function area(
  overrides: Partial<{
    id: string;
    player_id: string;
    status: string | null;
    target_kind: string | null;
    target_date: string | null;
  }> = {},
) {
  return {
    id: 'fa-1',
    player_id: 'player-1',
    status: 'active',
    target_kind: 'date',
    target_date: '2026-09-30',
    ...overrides,
  };
}

describe('followUpEligibilityReason', () => {
  it('is "completed" when status is completed, regardless of target_kind/target_date', () => {
    expect(followUpEligibilityReason(area({ status: 'completed', target_kind: null, target_date: null }), TODAY_ISO)).toBe(
      'completed',
    );
  });

  it('is "past_target_date" when target_kind is date and target_date is before today', () => {
    expect(
      followUpEligibilityReason(area({ status: 'active', target_kind: 'date', target_date: '2026-09-22' }), TODAY_ISO),
    ).toBe('past_target_date');
  });

  it('is null when target_date is exactly today — not yet "past" it', () => {
    expect(
      followUpEligibilityReason(area({ status: 'active', target_kind: 'date', target_date: '2026-09-23' }), TODAY_ISO),
    ).toBeNull();
  });

  it('is null when target_date is in the future', () => {
    expect(
      followUpEligibilityReason(area({ status: 'active', target_kind: 'date', target_date: '2026-10-01' }), TODAY_ISO),
    ).toBeNull();
  });

  it('is null for a rounds-kind target that is not completed — no "past due" concept for rounds here', () => {
    expect(
      followUpEligibilityReason(
        area({ status: 'in_progress', target_kind: 'rounds', target_date: null }),
        TODAY_ISO,
      ),
    ).toBeNull();
  });

  it('is null when there is no target_date to compare and status is not completed', () => {
    expect(
      followUpEligibilityReason(area({ status: 'active', target_kind: 'date', target_date: null }), TODAY_ISO),
    ).toBeNull();
  });

  it('is null for a declined area with no timeframe to compare', () => {
    expect(followUpEligibilityReason(area({ status: 'declined', target_kind: null, target_date: null }), TODAY_ISO)).toBeNull();
  });

  it('the status leg does not itself gate a proposed area\'s past target_date — never-started areas are excluded downstream by having no started_at (see computeFollowUpEligibility\'s "missing round count" test and loadFollowUpRoundCounts)', () => {
    expect(
      followUpEligibilityReason(area({ status: 'proposed', target_kind: 'date', target_date: '2026-09-01' }), TODAY_ISO),
    ).toBe('past_target_date');
  });
});

describe('computeFollowUpEligibility', () => {
  it('is not eligible below the 3-round threshold and labels it "waiting for rounds (n/3)"', () => {
    const areas = [area({ id: 'fa-1', status: 'completed' })];
    const counts = new Map([['fa-1', 2]]);
    const result = computeFollowUpEligibility(areas, counts, { todayIso: TODAY_ISO });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      reason: 'completed',
      roundsSinceStart: 2,
      eligible: false,
      waitingLabel: 'waiting for rounds (2/3)',
    });
  });

  it('is eligible at exactly the 3-round threshold (inclusive)', () => {
    const areas = [area({ id: 'fa-1', status: 'completed' })];
    const counts = new Map([['fa-1', FOLLOW_UP_ROUNDS_THRESHOLD]]);
    const result = computeFollowUpEligibility(areas, counts, { todayIso: TODAY_ISO });
    expect(result[0]).toMatchObject({ eligible: true, roundsSinceStart: 3, waitingLabel: null });
  });

  it('treats a missing round-count entry as 0, not an error', () => {
    const areas = [area({ id: 'fa-no-count', status: 'completed' })];
    const result = computeFollowUpEligibility(areas, new Map(), { todayIso: TODAY_ISO });
    expect(result[0]).toMatchObject({ roundsSinceStart: 0, eligible: false, waitingLabel: 'waiting for rounds (0/3)' });
  });

  it('excludes areas with no eligibility reason (still active, target_date not yet past)', () => {
    const areas = [area({ id: 'fa-active', status: 'active', target_date: '2026-10-01' })];
    const result = computeFollowUpEligibility(areas, new Map([['fa-active', 10]]), { todayIso: TODAY_ISO });
    expect(result).toHaveLength(0);
  });

  it('honors a custom roundsThreshold override', () => {
    const areas = [area({ id: 'fa-1', status: 'completed' })];
    const counts = new Map([['fa-1', 1]]);
    const result = computeFollowUpEligibility(areas, counts, { todayIso: TODAY_ISO, roundsThreshold: 1 });
    expect(result[0]).toMatchObject({ eligible: true, waitingLabel: null });
  });

  it('classifies each area in a mixed batch independently', () => {
    const areas = [
      area({ id: 'fa-completed-ready', status: 'completed' }),
      area({ id: 'fa-completed-waiting', status: 'completed' }),
      area({ id: 'fa-overdue', status: 'active', target_kind: 'date', target_date: '2026-09-01' }),
      area({ id: 'fa-still-active', status: 'active', target_kind: 'date', target_date: '2026-10-01' }),
    ];
    const counts = new Map([
      ['fa-completed-ready', 5],
      ['fa-completed-waiting', 1],
      ['fa-overdue', 3],
    ]);
    const result = computeFollowUpEligibility(areas, counts, { todayIso: TODAY_ISO });
    const byId = new Map(result.map((r) => [r.area.id, r]));
    expect(byId.get('fa-completed-ready')).toMatchObject({ reason: 'completed', eligible: true });
    expect(byId.get('fa-completed-waiting')).toMatchObject({ reason: 'completed', eligible: false, waitingLabel: 'waiting for rounds (1/3)' });
    expect(byId.get('fa-overdue')).toMatchObject({ reason: 'past_target_date', eligible: true });
    expect(byId.has('fa-still-active')).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import {
  planRecurringPractice,
  practiceIdempotencyKey,
  offsetMinutesForZone,
  PracticePlanError,
} from '@/lib/coachhelm/v3/chat/practice-planner';
import type { CoachChatContext } from '@/lib/coachhelm/v3/chat/context';

const ctx: CoachChatContext = {
  coach_id: 'coach-1',
  user_id: 'user-1',
  team_id: 'team-1',
  team_name: 'Rini University',
  timezone: 'America/New_York',
  roster: [
    { id: 'p1', name: 'Nick Rini', first_name: 'Nick', last_name: 'Rini', graduation_year: 2027 },
    { id: 'p2', name: 'Sam Fox', first_name: 'Sam', last_name: 'Fox', graduation_year: 2028 },
    { id: 'p3', name: 'Alex Ward', first_name: 'Alex', last_name: 'Ward', graduation_year: 2026 },
  ],
};

/** Tuesday, 2 in JS weekday numbering. */
const TUESDAY = 2;

describe('planRecurringPractice', () => {
  it('resolves every occurrence date BEFORE anything is created', () => {
    // The coach approves eight specific dates, not the idea of eight practices.
    const { plan } = planRecurringPractice(ctx, {
      weekdays: [TUESDAY],
      start_time: '15:00',
      occurrence_count: 8,
      first_date: '2026-08-04',
    });
    expect(plan.occurrence_dates).toHaveLength(8);
    expect(plan.occurrence_dates[0]).toBe('2026-08-04');
    // Every date must actually be a Tuesday, weekly apart.
    for (const d of plan.occurrence_dates) {
      expect(new Date(`${d}T12:00:00Z`).getUTCDay()).toBe(TUESDAY);
    }
    expect(plan.occurrence_dates[7]).toBe('2026-09-22');
  });

  it('puts all eight dates on the proposal the coach reads', () => {
    const { proposal } = planRecurringPractice(ctx, {
      weekdays: [TUESDAY],
      start_time: '15:00',
      occurrence_count: 8,
      first_date: '2026-08-04',
    });
    const dates = proposal.facts.find((f) => f.label === 'Dates');
    expect(dates?.value.split('·')).toHaveLength(8);
    expect(proposal.facts.find((f) => f.label === 'Occurrences')?.value).toBe('8');
    expect(proposal.facts.find((f) => f.label === 'Timezone')?.value).toBe('America/New_York');
  });

  it('refuses to create an unbounded series', () => {
    // A recurring event with no end quietly fills a calendar forever. It must
    // never be reachable by phrasing a sentence loosely.
    expect(() =>
      planRecurringPractice(ctx, {
        weekdays: [TUESDAY],
        start_time: '15:00',
        occurrence_count: 0,
      }),
    ).toThrow(PracticePlanError);
  });

  it('asks for a day rather than guessing one', () => {
    expect(() =>
      planRecurringPractice(ctx, { weekdays: [], start_time: '15:00', occurrence_count: 8 }),
    ).toThrow(PracticePlanError);
  });

  it('invites the whole active roster by default, and says how many', () => {
    const { plan, proposal } = planRecurringPractice(ctx, {
      weekdays: [TUESDAY],
      start_time: '15:00',
      occurrence_count: 4,
    });
    expect(plan.invited_player_ids).toEqual(['p1', 'p2', 'p3']);
    expect(proposal.facts.find((f) => f.label === 'Invites')?.value).toBe('3 active players');
  });

  it('drops a player id that is not on the roster', () => {
    // Cross-team leakage must not be reachable through an invite list either.
    const { plan } = planRecurringPractice(ctx, {
      weekdays: [TUESDAY],
      start_time: '15:00',
      occurrence_count: 2,
      invited_player_ids: ['p1', 'someone-elses-player'],
    });
    expect(plan.invited_player_ids).toEqual(['p1']);
  });

  it('surfaces a missing location instead of blocking on it', () => {
    // A practice with no location is genuinely creatable, so this belongs on
    // the card as a fact — not as a question that stalls the coach.
    const { proposal } = planRecurringPractice(ctx, {
      weekdays: [TUESDAY],
      start_time: '15:00',
      occurrence_count: 4,
    });
    expect(proposal.missing).toEqual(['Location']);
    expect(proposal.facts.find((f) => f.label === 'Location')?.missing).toBe(true);
  });

  it('states every notification that will fire', () => {
    const { proposal } = planRecurringPractice(ctx, {
      weekdays: [TUESDAY],
      start_time: '15:00',
      occurrence_count: 4,
      requires_rsvp: true,
    });
    expect(proposal.notifications.join(' ')).toMatch(/3 players/);
    expect(proposal.notifications.join(' ')).toMatch(/RSVP/i);
  });

  it('caps a runaway series', () => {
    const { plan } = planRecurringPractice(ctx, {
      weekdays: [TUESDAY],
      start_time: '15:00',
      occurrence_count: 500,
      first_date: '2026-08-04',
    });
    expect(plan.occurrence_count).toBeLessThanOrEqual(26);
  });
});

describe('practiceIdempotencyKey', () => {
  it('is stable for the same plan, so a retried confirm cannot duplicate it', () => {
    const a = planRecurringPractice(ctx, {
      weekdays: [TUESDAY],
      start_time: '15:00',
      occurrence_count: 8,
      first_date: '2026-08-04',
    });
    const b = planRecurringPractice(ctx, {
      weekdays: [TUESDAY],
      start_time: '15:00',
      occurrence_count: 8,
      first_date: '2026-08-04',
    });
    expect(practiceIdempotencyKey(ctx, a.plan)).toBe(practiceIdempotencyKey(ctx, b.plan));
  });

  it('differs for a genuinely different series', () => {
    const a = planRecurringPractice(ctx, {
      weekdays: [TUESDAY],
      start_time: '15:00',
      occurrence_count: 8,
      first_date: '2026-08-04',
    });
    const b = planRecurringPractice(ctx, {
      weekdays: [TUESDAY],
      start_time: '16:00',
      occurrence_count: 8,
      first_date: '2026-08-04',
    });
    expect(practiceIdempotencyKey(ctx, a.plan)).not.toBe(practiceIdempotencyKey(ctx, b.plan));
  });
});

describe('offsetMinutesForZone', () => {
  it('resolves the offset for the series start, not for today', () => {
    // New York in August is EDT (UTC-4) → 240 in getTimezoneOffset convention.
    expect(offsetMinutesForZone('America/New_York', '2026-08-04', '15:00')).toBe(240);
    // …and EST (UTC-5) in January. A series crossing the boundary must not be
    // shifted by an hour because "now" happened to be summer.
    expect(offsetMinutesForZone('America/New_York', '2026-01-06', '15:00')).toBe(300);
  });

  it('does not silently become UTC on an unknown zone', () => {
    // Falling back to 0 would move every practice; falling back to the server's
    // own offset at least keeps it in a plausible local time.
    expect(offsetMinutesForZone('Not/AZone', '2026-08-04', '15:00')).toBe(
      new Date().getTimezoneOffset(),
    );
  });
});

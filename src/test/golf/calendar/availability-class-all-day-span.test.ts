import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * An ALL-DAY class occurrence must block its final day.
 *
 * `golf_events.end_time` on an all-day row is UTC midnight on the INCLUSIVE
 * last day, so reading it as an instant ends the block a day early. That is the
 * one-day-early bug #1493/#1494/#1495 each hit in turn, and `eventDaySpan` is
 * the settled answer.
 *
 * `getUserBusyPeriodsWithStatus` has four busy-period push sites. Three route
 * through `eventBusyInterval`, which branches on `all_day` and expands the span
 * in the TEAM's zone. The fourth — this player's own class occurrences — read
 * `new Date(event.end_time)` directly and was missed, because it is the only
 * site that does not go through the helper.
 *
 * Latent rather than live when found: measured 2026-08-19, 0 of 1,589 class
 * events carry `all_day`, and for a TIMED event the raw form is correct. This
 * pins the behaviour so it cannot regress the day an all-day class is created —
 * a recurring seminar, a field trip, an exam block.
 *
 * The zone is load-bearing and not cosmetic. For an Eastern team, a naive
 * instant end lands at 20:00 the previous evening, so the player reads as free
 * on a day they are in class, and the conflict checker lets a coach schedule
 * over it.
 */

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));

type Outcome = { data: unknown; error: unknown };
const outcomes = new Map<string, Outcome>();
const ok = (data: unknown): Outcome => ({ data, error: null });

function tableChain(table: string) {
  const settle = () => outcomes.get(table) ?? ok([]);
  const node: Record<string, unknown> = {};
  const self = () => node;
  Object.assign(node, {
    select: self, eq: self, in: self, not: self, or: self, is: self, neq: self,
    gt: self, lt: self, gte: self, lte: self, order: self, limit: self,
    range: self, filter: self,
    single: async () => settle(),
    maybeSingle: async () => settle(),
    then: (resolve: (v: Outcome) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(settle()).then(resolve, reject),
  });
  return node;
}

const supabase = { from: (t: string) => tableChain(t) } as never;

/** Two-day all-day class, Wed 2 Sept -> Thu 3 Sept, stored the way golf.ts writes it. */
const ALL_DAY_CLASS = {
  id: 'ev-1',
  title: 'Organic Chemistry field block',
  start_time: '2026-09-02T00:00:00+00:00',
  end_time: '2026-09-03T00:00:00+00:00', // INCLUSIVE last day
  all_day: true,
  created_by: 'coach-1',
  description: 'Weekly block [class:c1]',
};

async function busy() {
  const mod = await import('@/lib/calendar/availability');
  return mod.getUserBusyPeriodsWithStatus(
    'user-1',
    new Date('2026-09-01T00:00:00Z'),
    new Date('2026-09-08T00:00:00Z'),
    supabase,
  );
}

beforeEach(() => {
  outcomes.clear();
  outcomes.set('golf_players', ok({ id: 'p1', user_id: 'user-1' }));
  outcomes.set('golf_coaches', ok(null));
  outcomes.set('golf_team_members', ok([{ team_id: 't1' }]));
  outcomes.set('golf_team_settings', ok([{ team_id: 't1', timezone: 'America/New_York' }]));
  outcomes.set('golf_events', ok([ALL_DAY_CLASS]));
  outcomes.set('golf_player_classes', ok([{ id: 'c1' }]));
  outcomes.set('golf_coach_blocked_time', ok([]));
});

describe('all-day class occurrence — the inclusive last day must stay blocked', () => {
  it('produces a class busy period', async () => {
    const { periods } = await busy();
    expect(periods.filter((p) => p.type === 'class')).toHaveLength(1);
  });

  it('blocks through the END of the inclusive last day, not its UTC midnight', async () => {
    const { periods } = await busy();
    const cls = periods.find((p) => p.type === 'class')!;

    // Sept 3 is the inclusive last day, so the block must run to Sept 4
    // 00:00 Eastern = 04:00Z. The old code produced 2026-09-03T00:00:00Z,
    // which is 20:00 Eastern on Sept 2 -- a day and four hours short.
    expect(cls.end.toISOString()).toBe('2026-09-04T04:00:00.000Z');
    expect(cls.end.getTime()).toBeGreaterThan(new Date('2026-09-03T00:00:00Z').getTime());
  });

  it('still covers a moment in the middle of the final day', async () => {
    // The assertion that would have caught this in the field: is the player
    // busy at 2pm Eastern on the last day?
    const { periods } = await busy();
    const cls = periods.find((p) => p.type === 'class')!;
    const lastDayAfternoon = new Date('2026-09-03T18:00:00Z'); // 14:00 ET

    expect(cls.start.getTime()).toBeLessThanOrEqual(lastDayAfternoon.getTime());
    expect(cls.end.getTime()).toBeGreaterThan(lastDayAfternoon.getTime());
  });

  it('leaves a TIMED class occurrence exactly as it was', async () => {
    // The raw instant form was correct for timed events, which is every class
    // occurrence in production today. Routing through the helper must not
    // change them.
    outcomes.set('golf_events', ok([
      { ...ALL_DAY_CLASS, all_day: false,
        start_time: '2026-09-02T14:00:00+00:00',
        end_time: '2026-09-02T15:30:00+00:00' },
    ]));

    const cls = (await busy()).periods.find((p) => p.type === 'class')!;
    expect(cls.start.toISOString()).toBe('2026-09-02T14:00:00.000Z');
    expect(cls.end.toISOString()).toBe('2026-09-02T15:30:00.000Z');
  });
});

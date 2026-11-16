import { describe, expect, it, vi } from 'vitest';

/*
 * Launch readiness 2026-11-15.
 * DF-C-07: Practice read the team's clock from `golf_teams.timezone`, which Settings never writes; it reads the settings zone now.
 * DF-C-08: a practice the coach called off came back through the read of plans' practices by id (the window's read drops it).
 * DF-P-09: a player's Practice listed a called-off practice whose plan was still live.
 * DF-C-09: an all-day practice was zoned (a Friday sat on Thursday west of UTC) and its 24 hours were added to the week's hours.
 */

vi.mock('../../lib/track-server', () => ({ chLogServer: vi.fn() }));
const tables = vi.hoisted(() => ({ current: {} as import('../../__tests__/supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('../../__tests__/supabase-fake')).fakeServer(tables));
vi.mock('@/lib/coachhelm/v3/chat/context', () => ({ resolveCoachChatContext: vi.fn(async () => null) }));

import { loadCoachPracticeHome, loadPlayerPracticeHome } from '../practice-home';

// Tuesday 17 November 2026, 7 AM in Los Angeles. The team's week is Monday 16 to Sunday 22.
const NOW = new Date('2026-11-17T15:00:00Z');

const event = (id: string, start: string, end: string | null, extra: Record<string, unknown> = {}) => ({ id, title: 'Practice', start_time: start, end_time: end, location: 'Lakeside', all_day: false, status: null, cancelled_at: null, ...extra });
// Wednesday 18 Nov, 5 to 7 PM in Los Angeles: Thursday in UTC.
const timed = event('e-timed', '2026-11-19T01:00:00Z', '2026-11-19T03:00:00Z');
// Friday 20 Nov, all day, written by a calendar sync with an end at the next UTC midnight.
const allDay = event('e-allday', '2026-11-20T00:00:00+00:00', '2026-11-21T00:00:00+00:00', { all_day: true });
// Thursday 19 Nov, 3 PM in Los Angeles, called off. Its plan is the only thing that reads it, by id.
const calledOff = event('e-off', '2026-11-19T23:00:00Z', '2026-11-20T01:00:00Z', { status: 'cancelled', cancelled_at: '2026-11-16T18:00:00Z' });
const EVENTS = [timed, allDay, calledOff];

const plan = { id: 'p-off', title: 'Lag and wedges', status: 'published', event_id: 'e-off', version: 1, published_version: 1, edited_after_publish: false, updated_at: '2026-11-15T12:00:00Z', body: null, step: null, team_id: 't1' };

function setTables() {
  tables.current = {
    // The team row still carries a zone nothing writes; the settings zone is the team's clock.
    golf_teams: { data: { name: 'Varsity', organization_id: 'o1', timezone: 'UTC' } },
    golf_team_settings: { data: { timezone: 'America/Los_Angeles' } },
    golf_practice_plans: { data: [plan] },
    golf_team_members: { data: [] },
    // The window's read drops cancelled practices (`.is('cancelled_at', null)`); a read by id answers whatever it names.
    golf_events: (filters) => {
      const byId = filters.find(([k, a]) => k === 'in' && a[0] === 'id');
      if (byId) return { data: EVENTS.filter((e) => (byId[1][1] as string[]).includes(e.id)) };
      return { data: EVENTS.filter((e) => e.cancelled_at == null) };
    },
    golf_practice_plan_versions: (filters) =>
      filters.some(([k, a]) => k === 'eq' && a[0] === 'plan_id')
        ? { data: null }
        : { data: [{ plan_id: 'p-off', version: 1, title: 'Lag and wedges', event_id: 'e-off', body: null, published_at: '2026-11-15T12:00:00Z' }, { plan_id: 'p-on', version: 1, title: 'Wednesday', event_id: 'e-timed', body: null, published_at: '2026-11-15T12:00:00Z' }] },
  };
}

describe('Practice reads the team’s clock, drops called-off practices and keeps all-day ones on their day', () => {
  it('coach: the week strip, the hours and the practices waiting for a plan', async () => {
    setTables();
    const load = await loadCoachPracticeHome('t1', NOW);
    if (load.status !== 'ready') throw new Error(`expected ready, got ${load.status}`);
    const { week, weekLine, open, drafts, published, past, copies, zone } = load.data;
    expect(zone).toBe('America/Los_Angeles');
    const day = (key: string) => week.find((t) => t.key === key)!.items.map((i) => i.time);
    // Wednesday in the team's zone, never Thursday (UTC); the all-day practice on Friday, its own date; the called-off one nowhere.
    expect(day('2026-11-18')).toEqual(['5:00 PM']);
    expect(day('2026-11-19')).toEqual([]);
    expect(day('2026-11-20')).toEqual(['All day']);
    expect(week.flatMap((t) => t.items)).toHaveLength(2);
    // Two hours, not 26.
    expect(weekLine).toBe('2 h of practice this week');
    expect(open.map((o) => [o.label, o.detail])).toEqual([
      ['Wednesday, Nov 18', '5:00 to 7:00 PM · Lakeside'],
      ['Friday, Nov 20', 'All day · Lakeside'],
    ]);
    expect(open[1]!.minutes).toBeNull();
    // The called-off practice's plan is in no list, and stays copyable, said as cancelled.
    expect([...drafts, ...published, ...past].map((r) => r.id)).toEqual([]);
    expect(copies).toEqual([{ id: 'p-off', label: 'Lag and wedges · Thu, Nov 19 · Cancelled' }]);
  });

  it('player: a called-off practice is not on their Practice', async () => {
    setTables();
    const load = await loadPlayerPracticeHome('t1', 'me', NOW);
    if (load.status !== 'ready') throw new Error(`expected ready, got ${load.status}`);
    const listed = [...load.data.upcoming, ...load.data.past].map((r) => r.id);
    expect(listed).not.toContain('p-off');
    expect(load.data.week.flatMap((t) => t.items)).toHaveLength(1);
    expect(load.data.week.find((t) => t.key === '2026-11-18')!.items).toHaveLength(1);
  });
});

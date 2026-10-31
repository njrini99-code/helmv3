import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Audit A3: a player's "Since you last looked" shows a schedule change to any meeting they are invited to in the loaded week,
 * not only the one that is next or today. A meeting they are not invited to (no reply row of their own) stays hidden.
 */

vi.mock('../../lib/track-server', () => ({ chLogServer: vi.fn() }));
const tables = vi.hoisted(() => ({ current: {} as import('../../__tests__/supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('../../__tests__/supabase-fake')).fakeServer(tables));

import { loadPlayerHome } from '../player-home';

const AT = '2026-10-12T14:00:00.000Z';
const mark = (id: string) => ({
  v: 1,
  id,
  first_at: AT,
  at: AT,
  by: 'c2',
  by_names: ['Sam Okafor'],
  from: { start_time: '2026-10-15T17:00:00Z', end_time: '2026-10-15T17:45:00Z', all_day: false, location: 'Team room', title: 'Travel briefing', event_type: 'meeting', cancelled: false },
  fields: ['end_time', 'start_time'],
});
const meeting = (id: string, title: string, session: string) => ({
  id,
  title,
  event_type: 'meeting',
  start_time: '2026-10-15T17:30:00Z',
  end_time: '2026-10-15T18:15:00Z',
  all_day: false,
  location: 'Team room',
  status: 'confirmed',
  change: mark(session),
});

describe('player Home · schedule changes to meetings that are not next or today', () => {
  afterEach(() => vi.useRealTimers());

  it('A3 lists the change to Thursday’s invited meeting while Monday’s practice is Up next, and hides a meeting they are not invited to', async () => {
    // Monday 12 October, noon in New York.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-12T16:00:00Z'));
    tables.current = {
      golf_team_settings: { data: { timezone: 'America/New_York' } },
      golf_events: {
        data: [
          { id: 'e1', title: 'Putting ladder', event_type: 'practice', start_time: '2026-10-12T21:30:00Z', end_time: '2026-10-12T22:30:00Z', all_day: false, location: 'Green 2' },
          meeting('m1', 'Travel briefing', '6f1c2a90-aaaa-4bbb-8ccc-000000000001'),
          meeting('m2', 'Staff-only call', '6f1c2a90-aaaa-4bbb-8ccc-000000000002'),
        ],
      },
      // The player's own reply row is what makes m1 theirs; m2 has none.
      golf_event_attendance: { data: [{ id: 'x1', event_id: 'm1', player_id: 'p1', status: 'pending' }] },
      golf_rounds: { data: [] },
    };
    const data = await loadPlayerHome({ teamId: 't1', playerId: 'p1', firstName: 'Theo' });
    expect(data.next?.id).toBe('e1');
    expect(data.changes?.map((c) => c.eventId)).toEqual(['m1']);
  });
});

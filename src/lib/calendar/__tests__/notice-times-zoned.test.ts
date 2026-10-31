/**
 * F-0001 (audit 2026-10-29): every notice the server writes about an event (the Bell row, the push and the email) says
 * its time in the team's zone. The server runs in UTC, so a zone-less `toLocaleString` wrote "2:00 PM" for a 10:00 AM
 * New York start. rsvp-notices.test.ts covers the RSVP writers; this file covers the cancellation fan-out by behaviour
 * and pins the other writers (the coach's manual reminder and a series cancellation) by source, since each is a server
 * action whose setup dwarfs the one line under test.
 */
process.env.TZ = 'UTC';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';

const state = vi.hoisted(() => ({ admin: null as unknown, emails: [] as Array<Record<string, unknown>> }));

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => state.admin }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => undefined) }));
vi.mock('@/lib/notifications/email', () => ({
  sendEmailNotification: vi.fn(async (_kind: string, _id: string, _to: string, body: Record<string, unknown>) => {
    state.emails.push(body);
  }),
}));

import { fanOutEventCancelled } from '../fan-out';
import { formatNoticeWhen } from '../timezone';

type Fake = ReturnType<typeof createFakeSupabase>;

function admin(zone: string | null) {
  const fake = createFakeSupabase({
    tables: {
      golf_event_attendance: [],
      golf_team_members: [{ team_id: 't1', player_id: 'p1', status: 'active' }],
      golf_players: [{ id: 'p1', user_id: 'u1' }],
      golf_team_settings: zone ? [{ team_id: 't1', timezone: zone }] : [],
      users: [{ id: 'u1', email: 'mara@example.com' }],
      golf_calendar_notifications: [],
    },
  });
  state.admin = fake;
  return fake;
}

async function bellRows(fake: Fake) {
  const { data, error } = await fake.from('golf_calendar_notifications').select('*');
  if (error) throw new Error(`fake read failed: ${JSON.stringify(error)}`);
  return (data ?? []) as Array<Record<string, unknown>>;
}

beforeEach(() => {
  state.emails = [];
});

describe('formatNoticeWhen', () => {
  it('gives a timed start in the zone asked for', () => {
    expect(formatNoticeWhen('2026-10-31T14:00:00Z', false, 'America/New_York')).toBe('Sat, Oct 31 at 10:00 AM');
    expect(formatNoticeWhen('2026-10-31T14:00:00Z', false, 'America/Los_Angeles')).toBe('Sat, Oct 31 at 7:00 AM');
  });

  it('crosses midnight with the zone: a 02:00Z start is the evening before in New York', () => {
    expect(formatNoticeWhen('2026-11-01T02:00:00Z', false, 'America/New_York')).toBe('Sat, Oct 31 at 10:00 PM');
  });

  it('gives an all-day event its written date and no time, in any zone', () => {
    expect(formatNoticeWhen('2026-10-31T00:00:00+00:00', true, 'America/New_York')).toBe('Sat, Oct 31');
    expect(formatNoticeWhen('2026-10-31T00:00:00', true, 'Pacific/Honolulu')).toBe('Sat, Oct 31');
  });

  it('says TBD with no start', () => {
    expect(formatNoticeWhen(null, false, 'America/New_York')).toBe('TBD');
  });
});

describe('fanOutEventCancelled', () => {
  const notice = { eventId: 'e1', teamId: 't1', title: 'Qualifier', startTime: '2026-10-31T14:00:00Z', location: 'Range', reason: '', notifies: true };

  it("writes the Bell row and the email in the team's zone", async () => {
    const fake = admin('America/New_York');
    await fanOutEventCancelled(notice);
    const rows = await bellRows(fake);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.message).toBe('Sat, Oct 31 at 10:00 AM at Range');
    expect(String(state.emails[0]?.content)).toContain('Sat, Oct 31 at 10:00 AM');
    expect(String(state.emails[0]?.content)).not.toContain('2:00 PM');
  });

  it('an all-day event is cancelled by its date alone', async () => {
    const fake = admin('America/New_York');
    await fanOutEventCancelled({ ...notice, startTime: '2026-10-31T00:00:00+00:00', allDay: true, location: null });
    expect((await bellRows(fake))[0]!.message).toBe('Sat, Oct 31');
  });
});

describe('the other notice writers format with a zone', () => {
  // Every date or time the server puts in a notice goes through formatNoticeWhen (or names a timeZone). A bare
  // toLocale*String reads the server's own zone, which is UTC on Vercel.
  const files = [
    'src/lib/calendar/rsvp.ts',
    'src/lib/calendar/fan-out.ts',
    'src/app/golf/actions/calendar-events.ts',
    'src/app/golf/actions/recurring-events.ts',
  ];

  it.each(files)('%s has no zone-less toLocale*String', (file) => {
    const src = readFileSync(join(process.cwd(), file), 'utf8');
    const zoneless: string[] = [];
    for (const m of src.matchAll(/\.toLocale(?:Date|Time)?String\(/g)) {
      const close = src.indexOf('})', m.index);
      const call = src.slice(m.index, close === -1 ? m.index + 200 : close + 2);
      if (!/timeZone/.test(call)) zoneless.push(`${src.slice(0, m.index).split('\n').length}: ${call.split('\n')[0]}`);
    }
    expect(zoneless).toEqual([]);
  });
});

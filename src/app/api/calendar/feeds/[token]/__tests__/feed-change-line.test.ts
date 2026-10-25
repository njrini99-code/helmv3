import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * P-14: while an event's change mark is live, the iCal feed leads its DESCRIPTION with what changed ("Moved from 1:00 PM by
 * Coach Okafor on Wed 14 October."). A mark that is old, unreadable or on an event that has ended adds nothing, and an
 * event without one is exactly what it was.
 */

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));

const NOW = Date.parse('2026-10-14T18:40:00Z');
const AT = '2026-10-14T18:14:00.000Z';
const base = { start_time: '2026-10-15T17:00:00Z', end_time: '2026-10-15T17:45:00Z', all_day: false, location: 'Team room', title: 'Travel briefing', event_type: 'practice', cancelled: false };
const stored = (over: Record<string, unknown> = {}) => ({ v: 1, id: '6f1c2a90-aaaa-4bbb-8ccc-000000000001', first_at: AT, at: AT, by: 'c2', by_names: ['Sam Okafor'], from: base, fields: ['end_time', 'start_time'], ...over });
const ev = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  title: 'Travel briefing',
  description: id === 'moved' ? 'Bring rain gear; arrive early' : null,
  location: 'Team room',
  event_type: 'practice',
  start_time: '2026-10-15T17:30:00Z',
  end_time: '2026-10-15T18:15:00Z',
  all_day: false,
  status: 'confirmed',
  change: null,
  ...over,
});
const EVENTS = [
  ev('moved', { change: stored() }),
  ev('plain'),
  ev('old', { change: stored({ at: '2026-10-10T12:00:00.000Z', first_at: '2026-10-10T12:00:00.000Z' }) }),
  ev('garbled', { change: { v: 9, nonsense: true } }),
];

function builder(table: string) {
  const node: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'neq', 'gte', 'lte', 'order', 'update', 'in', 'limit']) node[m] = () => node;
  node.range = async (from: number, to: number) => (table === 'golf_events' ? { data: EVENTS.slice(from, to + 1), error: null } : { data: [], error: null });
  node.single = async () =>
    table === 'golf_calendar_feeds'
      ? { data: { id: 'feed-1', feed_token: 'x', feed_type: 'all_events', team_id: 'team-1', user_id: 'user-1', name: 'Team', is_active: true, last_synced_at: null }, error: null }
      : { data: null, error: null };
  node.maybeSingle = async () => (table === 'golf_team_settings' ? { data: { timezone: 'America/New_York' }, error: null } : { data: null, error: null });
  node.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve, reject);
  return node;
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => builder(t), rpc: async () => ({ data: true, error: null }) }) }));

import { GET } from '@/app/api/calendar/feeds/[token]/route';

let counter = 0;
async function feedText(): Promise<string> {
  const token = `change-line-feed-token-${String(++counter).padStart(16, '0')}`;
  const res = await GET(new Request(`http://x/api/calendar/feeds/${token}`) as never, { params: Promise.resolve({ token }) });
  return res.text();
}
const vevent = (ics: string, id: string): string => ics.split('BEGIN:VEVENT').find((b) => b.includes(`UID:${id}@helm-golf`)) ?? '';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
});
afterEach(() => vi.useRealTimers());

describe('iCal feed: the change line', () => {
  it('leads the description of an event with a live mark, ahead of the coach’s own notes', async () => {
    const ics = await feedText();
    expect(vevent(ics, 'moved')).toContain('DESCRIPTION:Moved from 1:00 PM by Coach Okafor on Wed 14 October.\\nBring rain gear\\; arrive early');
  });

  it('adds a description line even where the event had no description', async () => {
    const withBare = EVENTS.map((e) => (e.id === 'moved' ? { ...e, description: null } : e));
    EVENTS.splice(0, EVENTS.length, ...withBare);
    const ics = await feedText();
    expect(vevent(ics, 'moved')).toContain('DESCRIPTION:Moved from 1:00 PM by Coach Okafor on Wed 14 October.');
  });

  it('leaves an event with no mark, an old mark and a mark it cannot read exactly as it was', async () => {
    const ics = await feedText();
    for (const id of ['plain', 'old', 'garbled']) expect(vevent(ics, id)).not.toContain('DESCRIPTION');
  });
});

/**
 * ICS team-feed route tests (calendar audit 2026-06-10, findings #12 / #17).
 *
 * Covers:
 *   - the event query is WINDOWED (past ~90d → future ~400d), ordered ASC on
 *     a stable key, and paginated — so the PostgREST 1000-row cap can never
 *     silently drop UPCOMING events from subscribers
 *   - UID stability: the same event always exports `UID:<id>@helm-golf`, so
 *     external calendar apps update in place instead of duplicating
 *   - inverted-DTEND defense: end < start exports DTEND=DTSTART (the DB CHECK
 *     added 2026-06-10 makes this belt-and-braces)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface FeedEventRow {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  event_type: string | null;
  start_time: string;
  end_time: string | null;
  all_day: boolean | null;
  status: string | null;
}

interface RecordedCall {
  name: string;
  args: unknown[];
}

const eventQueryCalls: RecordedCall[][] = [];
let eventRows: FeedEventRow[] = [];

function makeBuilder(table: string) {
  const calls: RecordedCall[] = [];
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'neq', 'gte', 'lte', 'order', 'update', 'in']) {
    builder[m] = vi.fn((...args: unknown[]) => {
      calls.push({ name: m, args });
      return builder;
    });
  }
  builder.range = vi.fn((from: number, to: number) => {
    calls.push({ name: 'range', args: [from, to] });
    if (table === 'golf_events') {
      eventQueryCalls.push(calls);
      return Promise.resolve({ data: eventRows.slice(from, to + 1), error: null });
    }
    return Promise.resolve({ data: [], error: null });
  });
  builder.single = vi.fn(async () => {
    if (table === 'golf_calendar_feeds') {
      return {
        data: {
          id: 'feed-1',
          feed_token: TOKEN,
          feed_type: 'all_events',
          team_id: 'team-1',
          user_id: 'user-1',
          name: 'Team Feed',
          is_active: true,
          last_synced_at: null,
        },
        error: null,
      };
    }
    return { data: null, error: { message: `unexpected single on ${table}` } };
  });
  builder.maybeSingle = vi.fn(async () => {
    if (table === 'golf_team_settings') {
      return { data: { timezone: 'America/New_York' }, error: null };
    }
    return { data: null, error: null };
  });
  // The last_synced_at update is awaited fire-and-forget via .then().
  builder.then = (
    onfulfilled?: ((value: unknown) => unknown) | null,
    onrejected?: ((reason: unknown) => unknown) | null,
  ) => Promise.resolve({ data: null, error: null }).then(onfulfilled, onrejected);
  return builder;
}

function makeClient() {
  return {
    from: vi.fn((table: string) => makeBuilder(table)),
    rpc: vi.fn(async () => ({ data: true, error: null })),
  };
}

let currentClient: ReturnType<typeof makeClient>;

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => currentClient,
}));

import { GET } from '@/app/api/calendar/feeds/[token]/route';

const NOW = new Date('2026-06-10T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
// Distinct token per test run-position so the route's module-level rate
// limiter never trips across tests in this file.
let tokenCounter = 0;
let TOKEN = '';

async function callRoute(): Promise<Response> {
  return GET(new Request(`http://x/api/calendar/feeds/${TOKEN}`) as never, {
    params: Promise.resolve({ token: TOKEN }),
  });
}

describe('ICS team feed route — windowing + UID stability + DTEND defense', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    tokenCounter += 1;
    TOKEN = `feedtoken${String(tokenCounter).padStart(4, '0')}`.padEnd(40, 'f');
    eventQueryCalls.length = 0;
    eventRows = [];
    currentClient = makeClient();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('windows the event query to past ~90d → future ~400d and orders ASC with a stable tiebreaker', async () => {
    eventRows = [];
    const res = await callRoute();
    expect(res.status).toBe(200);

    expect(eventQueryCalls.length).toBeGreaterThan(0);
    const calls = eventQueryCalls[0]!;

    const gte = calls.find((c) => c.name === 'gte');
    const lte = calls.find((c) => c.name === 'lte');
    expect(gte?.args[0]).toBe('start_time');
    expect(lte?.args[0]).toBe('start_time');
    expect(gte?.args[1]).toBe(new Date(NOW.getTime() - 90 * DAY).toISOString());
    expect(lte?.args[1]).toBe(new Date(NOW.getTime() + 400 * DAY).toISOString());

    const orders = calls.filter((c) => c.name === 'order');
    expect(orders[0]?.args).toEqual(['start_time', { ascending: true }]);
    expect(orders[1]?.args).toEqual(['id', { ascending: true }]);

    // Paginated within the window (not a single capped request).
    expect(calls.some((c) => c.name === 'range')).toBe(true);

    // A subscribed TEAM calendar must not carry a player's class schedule.
    const neq = calls.find((c) => c.name === 'neq');
    expect(neq?.args).toEqual(['event_type', 'class']);
  });

  it('paginates past the 1000-row PostgREST cap inside the window', async () => {
    const COUNT = 1002;
    eventRows = Array.from({ length: COUNT }, (_, i) => ({
      id: `evt-${String(i).padStart(4, '0')}`,
      title: `Practice ${i}`,
      description: null,
      location: null,
      event_type: 'practice',
      start_time: new Date(NOW.getTime() + i * 60_000).toISOString(),
      end_time: null,
      all_day: false,
      status: 'confirmed',
    }));

    const res = await callRoute();
    const body = await res.text();
    expect((body.match(/BEGIN:VEVENT/g) ?? []).length).toBe(COUNT);
    // Both pages fetched.
    expect(eventQueryCalls.length).toBe(2);
  });

  it('exports a stable UID (<event.id>@helm-golf) for every VEVENT', async () => {
    eventRows = [
      {
        id: 'evt-abc',
        title: 'Qualifier',
        description: 'Round 1',
        location: 'Home Course',
        event_type: 'qualifying',
        start_time: new Date(NOW.getTime() + DAY).toISOString(),
        end_time: new Date(NOW.getTime() + DAY + 2 * 60 * 60 * 1000).toISOString(),
        all_day: false,
        status: 'confirmed',
      },
    ];

    const first = await (await callRoute()).text();
    const second = await (await callRoute()).text();
    expect(first).toContain('UID:evt-abc@helm-golf');
    // Stability across fetches — same UID both times (no per-request salt).
    expect(second).toContain('UID:evt-abc@helm-golf');
  });

  it('inverted end_time (end < start) exports DTEND equal to DTSTART, never a negative duration', async () => {
    const start = new Date(NOW.getTime() + DAY).toISOString();
    const invertedEnd = new Date(NOW.getTime() + DAY - 13 * DAY).toISOString();
    eventRows = [
      {
        id: 'evt-inverted',
        title: 'Corrupt Row',
        description: null,
        location: null,
        event_type: 'meeting',
        start_time: start,
        end_time: invertedEnd,
        all_day: false,
        status: 'confirmed',
      },
    ];

    const body = await (await callRoute()).text();
    const dtstart = body.match(/DTSTART:(\S+)/)?.[1];
    const dtend = body.match(/DTEND:(\S+)/)?.[1];
    expect(dtstart).toBeDefined();
    expect(dtend).toBe(dtstart);
  });

  it('valid end_time is exported unchanged', async () => {
    const start = new Date(NOW.getTime() + DAY);
    const end = new Date(start.getTime() + 90 * 60 * 1000);
    eventRows = [
      {
        id: 'evt-ok',
        title: 'Practice',
        description: null,
        location: null,
        event_type: 'practice',
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        all_day: false,
        status: 'confirmed',
      },
    ];

    const body = await (await callRoute()).text();
    const dtstart = body.match(/DTSTART:(\S+)/)?.[1];
    const dtend = body.match(/DTEND:(\S+)/)?.[1];
    expect(dtend).not.toBe(dtstart);
    expect(dtend).toBe(end.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z');
  });
});

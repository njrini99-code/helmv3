import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Messages badge after "Delete conversation" (wiring review 2026-10-27, item 3).
 *
 * Delete is a per-person hide: it sets the viewer's `hidden_at` and nothing else. Both badge counters
 * (getCoachNotificationCounts, getPlayerNotificationCounts) used to count every conversation, so a deleted
 * conversation's unread messages stayed on the badge for good. The rule now is the inbox's
 * (get_golf_conversations_with_details): a hidden conversation is skipped until a message arrives after the hide, and
 * from then on it counts as any other conversation does, from `last_read_at`.
 *
 * The counters run against a small in-memory table store that applies the filters they send, so a filter the code
 * forgets is a wrong number here, not a pass.
 */

type Row = Record<string, unknown>;

const VIEWER = 'u-viewer';
const OTHER = 'u-other';

const db = vi.hoisted(() => ({
  tables: new Map<string, Array<Record<string, unknown>>>(),
  /** When true, a select that names `hidden_at` fails as on a database without the column. */
  noHiddenAtColumn: false,
  /** Selects seen on golf_conversation_participants, to check the fallback read. */
  participantSelects: [] as string[],
}));

function query(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let columns = '*';
  let countOnly = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {};
  chain.select = (cols = '*', opts?: { count?: string; head?: boolean }) => {
    columns = cols;
    countOnly = !!opts?.head;
    if (table === 'golf_conversation_participants') db.participantSelects.push(cols);
    return chain;
  };
  const cmp = (col: string, test: (v: unknown) => boolean) => {
    filters.push((r) => test(r[col]));
    return chain;
  };
  chain.eq = (c: string, v: unknown) => cmp(c, (x) => x === v);
  chain.neq = (c: string, v: unknown) => cmp(c, (x) => x !== v);
  chain.gt = (c: string, v: string) => cmp(c, (x) => typeof x === 'string' && Date.parse(x) > Date.parse(v));
  chain.gte = (c: string, v: string) => cmp(c, (x) => typeof x === 'string' && Date.parse(x) >= Date.parse(v));
  chain.is = (c: string, v: unknown) => cmp(c, (x) => (x ?? null) === v);
  chain.in = (c: string, vs: unknown[]) => cmp(c, (x) => vs.includes(x));
  chain.not = () => chain;
  chain.order = () => chain;
  chain.limit = () => chain;
  const run = () => {
    if (db.noHiddenAtColumn && columns.includes('hidden_at')) {
      return { data: null, count: null, error: { code: '42703', message: 'column golf_conversation_participants.hidden_at does not exist' } };
    }
    const rows = (db.tables.get(table) ?? []).filter((r) => filters.every((f) => f(r)));
    return countOnly ? { data: null, count: rows.length, error: null } : { data: rows, count: rows.length, error: null };
  };
  chain.maybeSingle = async () => {
    const r = run();
    return { ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : null };
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chain.then = (ok: any, bad: any) => Promise.resolve(run()).then(ok, bad);
  return chain;
}

const client = vi.hoisted(() => ({ value: null as unknown }));

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client.value }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => client.value }));
vi.mock('@/lib/admin/observed-action', () => ({
  withAdminObserved: (_name: string, _meta: unknown, fn: (...a: unknown[]) => unknown) => fn,
}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/resilient-get-user', () => ({ getUserResilient: async () => ({ user: { id: VIEWER } }) }));
vi.mock('@/lib/auth/verify-player-access', () => ({
  verifyPlayerAccess: async () => ({ allowed: true, reason: 'self' }),
  verifyTeamAccess: async () => ({ allowed: true }),
}));

import { getCoachNotificationCounts } from '../coach-notifications';
import { getPlayerNotificationCounts } from '../player-notifications';

const T0 = '2026-10-20T10:00:00.000Z';
const at = (minutes: number) => new Date(Date.parse(T0) + minutes * 60_000).toISOString();

let seq = 0;
const msg = (conversation_id: string, minutes: number, o: Partial<Row> = {}): Row => ({
  id: `m${seq++}`,
  conversation_id,
  sender_id: OTHER,
  created_at: at(minutes),
  is_deleted: false,
  read: false,
  ...o,
});
const part = (conversation_id: string, last_read_at: string | null, hidden_at: string | null = null): Row => ({
  conversation_id,
  user_id: VIEWER,
  last_read_at,
  hidden_at,
});

function seed(participants: Row[], messages: Row[]) {
  db.tables.set('golf_conversation_participants', participants);
  db.tables.set('golf_messages', messages);
  db.tables.set('golf_team_members', [{ id: 'tm1', team_id: 'team1', player_id: 'p1', status: 'active' }]);
}

const counters = [
  {
    name: 'coach badge (getCoachNotificationCounts)',
    unread: async () => (await getCoachNotificationCounts(VIEWER)).data?.unreadMessages,
  },
  {
    name: 'player badge (getPlayerNotificationCounts)',
    unread: async () => (await getPlayerNotificationCounts('p1', VIEWER, 'team1')).data?.unreadMessages,
  },
];

beforeEach(() => {
  db.tables.clear();
  db.noHiddenAtColumn = false;
  db.participantSelects = [];
  client.value = { auth: { getUser: async () => ({ data: { user: { id: VIEWER } } }) }, from: query };
});

describe.each(counters)('$name: a deleted conversation', ({ unread }) => {
  it('drops off the badge: its unread messages no longer count, a visible conversation still does', async () => {
    seed(
      [part('kept', at(0)), part('deleted', at(0), at(30))],
      [msg('kept', 5), msg('kept', 6), msg('deleted', 10), msg('deleted', 11), msg('deleted', 12)],
    );
    expect(await unread()).toBe(2);
  });

  it('counts again once a new message brings it back, from last_read_at as the inbox row does', async () => {
    // Hidden at +30 with three unread from before; a new message at +40 puts it back in the inbox, whose row counts
    // every message since the viewer last read it.
    seed(
      [part('kept', at(0)), part('deleted', at(0), at(30))],
      [msg('kept', 5), msg('deleted', 10), msg('deleted', 11), msg('deleted', 12), msg('deleted', 40)],
    );
    expect(await unread()).toBe(1 + 4);
  });

  it('comes back on the viewer’s own new message too (the inbox rule), with nothing unread from them', async () => {
    seed([part('deleted', at(20), at(30))], [msg('deleted', 10), msg('deleted', 40, { sender_id: VIEWER })]);
    expect(await unread()).toBe(0);
    seed([part('deleted', at(5), at(30))], [msg('deleted', 10), msg('deleted', 40, { sender_id: VIEWER })]);
    expect(await unread()).toBe(1);
  });

  it('stays deleted when the only message after the hide was itself deleted', async () => {
    seed([part('deleted', at(0), at(30))], [msg('deleted', 10), msg('deleted', 40, { is_deleted: true })]);
    expect(await unread()).toBe(0);
  });

  it('never counts a message its sender deleted, as the inbox row does not', async () => {
    seed([part('kept', at(0))], [msg('kept', 5), msg('kept', 6, { is_deleted: true })]);
    expect(await unread()).toBe(1);
  });

  it('on a database without hidden_at, reads the rows again without it and counts every conversation', async () => {
    db.noHiddenAtColumn = true;
    seed([part('a', at(0)), part('b', null)], [msg('a', 5), msg('b', 6), msg('b', 7)]);
    expect(await unread()).toBe(3);
    expect(db.participantSelects).toEqual(['conversation_id, last_read_at, hidden_at', 'conversation_id, last_read_at']);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureGraph } from './fixtures';

vi.mock('@/lib/admin/clubhouse/graph-server', () => ({ loadBridgeGraph: vi.fn() }));

import { loadBridgeGraph } from '@/lib/admin/clubhouse/graph-server';
import { reportedSignalOf, stampFromStoredSignal } from '@/lib/admin/clubhouse/report-stamp';

const USER = '11111111-2222-4333-8444-555555555555';
const OTHER = '99999999-2222-4333-8444-555555555555';
const PLACE = { sessionId: 'sess_12345678', seq: 9 };

type Read = { data: unknown; error: { code: string } | null };
type Update = { payload: unknown; filters: [string, string, unknown][] };

function fakeDb(reads: { event?: Read; session?: Read; updateError?: { code: string } | null } = {}) {
  const updates: Update[] = [];
  const read = (r: Read | undefined) => {
    const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => r ?? { data: null, error: null } };
    return chain;
  };
  const db = {
    from: vi.fn((table: string) => {
      if (table === 'clubhouse_session_events') return read(reads.event);
      if (table === 'clubhouse_sessions') return read(reads.session);
      return {
        update: (payload: unknown) => {
          const call: Update = { payload, filters: [] };
          updates.push(call);
          const chain = {
            eq: (col: string, v: unknown) => (call.filters.push(['eq', col, v]), chain),
            is: (col: string, v: unknown) => (call.filters.push(['is', col, v]), chain),
            gte: (col: string, v: unknown) => (call.filters.push(['gte', col, v]), chain),
            then: (resolve: (r: { error: unknown; count: number }) => unknown) => resolve({ error: reads.updateError ?? null, count: reads.updateError ? 0 : 1 }),
          };
          return chain;
        },
      };
    }),
  };
  return { db: db as never, updates };
}

const FAILURE = {
  kind: 'action',
  outcome: 'failure',
  code: 'CH-7004',
  bridge_id: 70603,
  page_id: 'P007',
  action_id: 'ACT-P007-SEND-MESSAGE',
  control_id: 'CTL-P007-004',
  server_code: '42501',
};
const SESSION = { user_id: USER, release: 'abc1234', platform: 'ios-app' };

describe('reportedSignalOf', () => {
  it('reads the session and seq a report carries', () => {
    expect(reportedSignalOf({ ui: 'clubhouse', chSignal: { sessionId: 'sess_12345678', seq: 9, page: 'P007' } })).toEqual(PLACE);
  });

  it('ignores a report without a well-formed place', () => {
    expect(reportedSignalOf(null)).toBeNull();
    expect(reportedSignalOf([{ chSignal: PLACE }])).toBeNull();
    expect(reportedSignalOf({ ui: 'clubhouse' })).toBeNull();
    expect(reportedSignalOf({ chSignal: { sessionId: 'short', seq: 9 } })).toBeNull();
    expect(reportedSignalOf({ chSignal: { sessionId: "sess_1234' or 1=1", seq: 9 } })).toBeNull();
    expect(reportedSignalOf({ chSignal: { sessionId: 'sess_12345678', seq: 1.5 } })).toBeNull();
    expect(reportedSignalOf({ chSignal: { sessionId: 'sess_12345678', seq: '9' } })).toBeNull();
    expect(reportedSignalOf({ chSignal: { sessionId: 'sess_12345678', seq: -1 } })).toBeNull();
  });
});

describe('stampFromStoredSignal (the report landed after its signal)', () => {
  beforeEach(() => {
    vi.mocked(loadBridgeGraph).mockReturnValue(fixtureGraph());
  });

  it("gives the caller's report the columns the signal route would have", async () => {
    const { db, updates } = fakeDb({ event: { data: FAILURE, error: null }, session: { data: SESSION, error: null } });
    expect(await stampFromStoredSignal(db, USER, PLACE)).toBe(1);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.payload).toEqual({
      ch_code: 'CH-7004',
      bridge_id: 70603,
      page_id: 'P007',
      action_id: 'ACT-P007-SEND-MESSAGE',
      control_id: 'CTL-P007-004',
      release: 'abc1234',
      platform: 'ios-app',
      session_id: 'sess_12345678',
      server_code: '42501',
    });
    expect(updates[0]!.filters).toEqual(
      expect.arrayContaining([
        ['eq', 'source', 'client'],
        ['eq', 'user_id', USER],
        ['eq', 'metadata->context->chSignal->>sessionId', 'sess_12345678'],
        ['eq', 'metadata->context->chSignal->>seq', '9'],
        ['is', 'ch_code', null],
      ]),
    );
  });

  it('names the resolved row, as the signal route does, when the envelope sent a generic code', async () => {
    const generic = { ...FAILURE, code: 'CH-1206' };
    const { db, updates } = fakeDb({ event: { data: generic, error: null }, session: { data: SESSION, error: null } });
    await stampFromStoredSignal(db, USER, PLACE);
    expect(updates[0]!.payload).toMatchObject({ ch_code: 'CH-7004', bridge_id: 70603 });
  });

  it('keeps the sent code for a crash no row resolves, and still stamps without the graph', async () => {
    vi.mocked(loadBridgeGraph).mockReturnValue(null);
    const crash = { ...FAILURE, kind: 'crash', outcome: null, code: 'CH-1206', bridge_id: null, action_id: null, control_id: null, server_code: null };
    const { db, updates } = fakeDb({ event: { data: crash, error: null }, session: { data: SESSION, error: null } });
    expect(await stampFromStoredSignal(db, USER, PLACE)).toBe(1);
    expect(updates[0]!.payload).toMatchObject({ ch_code: 'CH-1206', bridge_id: null, page_id: 'P007' });
  });

  it("stamps nothing from another user's session", async () => {
    const { db, updates } = fakeDb({ event: { data: FAILURE, error: null }, session: { data: { ...SESSION, user_id: OTHER }, error: null } });
    expect(await stampFromStoredSignal(db, USER, PLACE)).toBe(0);
    expect(updates).toHaveLength(0);
  });

  it('does nothing when the signal is not stored yet (the usual order: the signal route stamps it)', async () => {
    const { db, updates } = fakeDb({ session: { data: SESSION, error: null } });
    expect(await stampFromStoredSignal(db, USER, PLACE)).toBe(0);
    expect(updates).toHaveLength(0);
  });

  it('does nothing for an envelope that is not a failure', async () => {
    const view = { ...FAILURE, kind: 'view', outcome: null };
    const { db, updates } = fakeDb({ event: { data: view, error: null }, session: { data: SESSION, error: null } });
    expect(await stampFromStoredSignal(db, USER, PLACE)).toBe(0);
    expect(updates).toHaveLength(0);
  });

  it('does nothing on a database the migration has not reached', async () => {
    const missing = fakeDb({ event: { data: null, error: { code: 'PGRST205' } }, session: { data: SESSION, error: null } });
    expect(await stampFromStoredSignal(missing.db, USER, PLACE)).toBe(0);
    const noColumns = fakeDb({ event: { data: FAILURE, error: null }, session: { data: SESSION, error: null }, updateError: { code: 'PGRST204' } });
    expect(await stampFromStoredSignal(noColumns.db, USER, PLACE)).toBe(0);
  });

  it('throws any other database error for the caller to log', async () => {
    const { db } = fakeDb({ event: { data: null, error: { code: '57014' } }, session: { data: SESSION, error: null } });
    await expect(stampFromStoredSignal(db, USER, PLACE)).rejects.toMatchObject({ code: '57014' });
  });
});

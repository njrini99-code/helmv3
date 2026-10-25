import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * P-10 class holds, the effectful half: the gate (holdOrPass), the release of one player's rows, and the minute job. A fake Supabase
 * client answers the RPCs by name so each test says exactly what the database returned.
 */

const logServerError = vi.fn(async (..._a: unknown[]) => {});
const logServerEvent = vi.fn(async (..._a: unknown[]) => {});
vi.mock('@/lib/server-error-logger', () => ({ logServerError: (...a: unknown[]) => logServerError(...a), logServerEvent: (...a: unknown[]) => logServerEvent(...a) }));
const prefs = vi.hoisted(() => ({ current: { push_messages: true } as Record<string, unknown> }));
vi.mock('../email', () => ({ getUserNotificationPreferences: async () => prefs.current }));
const sent = vi.hoisted(() => ({ calls: [] as [string, string, Record<string, unknown>][], next: [] as { success: boolean; delivered?: number }[] }));
// The release is handed the sender (push.ts imports class-hold, so class-hold cannot import push.ts back).
const push = {
  sendPushNotificationDirect: async (type: string, userId: string, data: Record<string, unknown>) => {
    sent.calls.push([type, userId, data]);
    return sent.next.shift() ?? { success: true, delivered: 1 };
  },
  shouldSendPush: (type: string, p: Record<string, unknown>) => (type === 'new_message' ? p.push_messages !== false : true),
} as never as import('../class-hold').PushDeps;

type Row = Record<string, unknown>;
type Reply = { data: unknown; error: { code?: string; message?: string } | null };
const rpcLog: { fn: string; args: Row }[] = [];
const replies: Record<string, Reply | ((args: Row) => Reply | Promise<Reply>)> = {};
let tables: Record<string, Row[]> = {};
let tableErrors: Record<string, { code: string; message: string }> = {};
let putDelayMs = 0;

function fakeAdmin() {
  return {
    rpc(fn: string, args: Row) {
      rpcLog.push({ fn, args });
      const run = async (signal?: AbortSignal): Promise<Reply> => {
        if (fn === 'golf_push_hold_put' && putDelayMs) {
          await new Promise<void>((resolve, reject) => {
            const t = setTimeout(resolve, putDelayMs);
            signal?.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')); });
          });
        }
        const r = replies[fn];
        return typeof r === 'function' ? r(args) : (r ?? { data: null, error: { code: 'PGRST202', message: 'no function' } });
      };
      const builder = { then: (a: (v: Reply) => unknown, b?: (e: unknown) => unknown) => run().then(a, b), abortSignal: (s: AbortSignal) => run(s) };
      return builder;
    },
    from(table: string) {
      const rows = tables[table] ?? [];
      const b: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in']) b[m] = () => b;
      b.then = (a: (v: unknown) => unknown, r?: (e: unknown) => unknown) => Promise.resolve(tableErrors[table] ? { data: null, error: tableErrors[table] } : { data: rows, error: null }).then(a, r);
      return b;
    },
  };
}
const admin = () => fakeAdmin() as never;

const USER = 'u1';
const CONV = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MSG = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
let n = 0;
const held = (over: Row = {}): Row => ({
  id: `h${++n}`, user_id: USER, notification_type: 'team_announcement', group_key: 'announcements', title: 'Team Announcement', body: 'Bus at 6',
  data: { title: 'Bus at 6' }, conversation_id: null, message_id: null, expires_at: null, release_at: '2026-10-26T15:50:00Z', held_at: `2026-10-26T15:00:0${n % 10}Z`, attempts: 1, ...over,
});

import { holdOrPass, releaseHeldForUser, runClassHoldRelease } from '../class-hold';

beforeEach(() => {
  rpcLog.length = 0;
  tableErrors = {};
  for (const k of Object.keys(replies)) delete replies[k];
  tables = {};
  putDelayMs = 0;
  sent.calls.length = 0;
  sent.next.length = 0;
  prefs.current = { push_messages: true };
  logServerError.mockClear();
  logServerEvent.mockClear();
});

const PAYLOAD = { title: 'Team Announcement', body: 'Bus at 6' };
const names = () => rpcLog.map((c) => c.fn);

describe('holdOrPass', () => {
  it('passes without asking the database when there is no instruction or it is bypass', async () => {
    expect(await holdOrPass(admin(), USER, 'x', PAYLOAD, {}, undefined, push)).toBe('pass');
    expect(await holdOrPass(admin(), USER, 'x', PAYLOAD, {}, 'bypass', push)).toBe('pass');
    expect(rpcLog).toHaveLength(0);
  });

  it('is held when the database says it stored the hold, and sends the whole instruction', async () => {
    replies.golf_push_hold_put = { data: { held: true, release_at: '2026-10-26T15:50:00Z', due_waiting: 0 }, error: null };
    const verdict = await holdOrPass(admin(), USER, 'new_message', PAYLOAD, { conversationId: CONV }, { group: 'group', conversationId: CONV, messageId: MSG, dedupeKey: 'k', expiresAt: '2026-10-26T17:00:00.000Z'  }, push);
    expect(verdict).toBe('held');
    const args = rpcLog[0]!.args;
    expect(args).toMatchObject({ p_user_id: USER, p_notification_type: 'new_message', p_group_key: 'group', p_dedupe_key: 'k', p_title: 'Team Announcement', p_body: 'Bus at 6', p_data: { conversationId: CONV }, p_conversation_id: CONV, p_message_id: MSG, p_expires_at: '2026-10-26T17:00:00.000Z' });
    expect(String(args.p_hold_id)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it.each([
    ['not in class', { held: false, why: 'not_in_class', due_waiting: 0 }],
    ['job stale', { held: false, why: 'job_stale', due_waiting: 0 }],
    ['other team', { held: false, why: 'other_team', due_waiting: 0 }],
    ['garbage', 'nope'],
    ['null', null],
  ])('passes when the database answers %s', async (_n, data) => {
    replies.golf_push_hold_put = { data, error: null };
    expect(await holdOrPass(admin(), USER, 'x', PAYLOAD, {}, { group: 'events' }, push)).toBe('pass');
  });

  it('never throws: a client with no rpc at all (a test double, a broken client) passes', async () => {
    expect(await holdOrPass({} as never, USER, 'x', PAYLOAD, {}, { group: 'events' }, push)).toBe('pass');
    expect(await holdOrPass({ rpc: () => { throw new Error('boom'); } } as never, USER, 'x', PAYLOAD, {}, { group: 'events' }, push)).toBe('pass');
  });

  it('fails open on an error, a missing function, and logs once a minute without the payload', async () => {
    replies.golf_push_hold_put = { data: null, error: { code: 'PGRST202', message: 'missing' } };
    expect(await holdOrPass(admin(), USER, 'x', { title: 'SECRET TITLE', body: 'SECRET BODY' }, {}, { group: 'events' }, push)).toBe('pass');
    expect(await holdOrPass(admin(), USER, 'x', PAYLOAD, {}, { group: 'events' }, push)).toBe('pass');
    expect(logServerEvent.mock.calls.length).toBeLessThanOrEqual(1);
    for (const c of logServerEvent.mock.calls) expect(JSON.stringify(c)).not.toContain('SECRET');
  });

  it('on a timeout cancels the hold by its id: a cancelled or tombstoned id means send directly', async () => {
    putDelayMs = 2000;
    replies.golf_push_hold_put = { data: { held: true, due_waiting: 0 }, error: null };
    replies.golf_push_holds_cancel = { data: true, error: null };
    expect(await holdOrPass(admin(), USER, 'x', PAYLOAD, {}, { group: 'events' }, push)).toBe('pass');
    const put = rpcLog.find((c) => c.fn === 'golf_push_hold_put')!;
    const cancel = rpcLog.find((c) => c.fn === 'golf_push_holds_cancel')!;
    expect(cancel.args).toEqual({ p_hold_id: put.args.p_hold_id, p_user_id: USER });
  });

  it('on a timeout, a hold a release is already delivering stays held (no second delivery)', async () => {
    putDelayMs = 2000;
    replies.golf_push_holds_cancel = { data: false, error: null };
    expect(await holdOrPass(admin(), USER, 'x', PAYLOAD, {}, { group: 'events' }, push)).toBe('held');
  });

  it('on a timeout whose cancel also fails, passes', async () => {
    putDelayMs = 2000;
    replies.golf_push_holds_cancel = { data: null, error: { message: 'down' } };
    expect(await holdOrPass(admin(), USER, 'x', PAYLOAD, {}, { group: 'events' }, push)).toBe('pass');
  });

  it('releases the user\'s due rows first when the put reports some waiting (a stopped job leaves rows behind)', async () => {
    replies.golf_push_hold_put = { data: { held: false, why: 'job_stale', due_waiting: 2 }, error: null };
    replies.golf_push_holds_claim_user = { data: [held(), held()], error: null };
    replies.golf_push_holds_mark = { data: 2, error: null };
    expect(await holdOrPass(admin(), USER, 'x', PAYLOAD, {}, { group: 'events' }, push)).toBe('pass');
    const claim = rpcLog.find((c) => c.fn === 'golf_push_holds_claim_user')!;
    expect(claim.args).toMatchObject({ p_user_id: USER, p_reason: 'class', p_due_only: true });
    expect(sent.calls).toHaveLength(1);
    expect(sent.calls[0]![0]).toBe('class_summary');
  });
});

describe('releaseHeldForUser', () => {
  it('Deliver now claims every open row, not only the due ones', async () => {
    replies.golf_push_holds_claim_user = { data: [], error: null };
    await releaseHeldForUser(admin(), USER, { dueOnly: false, push });
    expect(rpcLog[0]!.args).toMatchObject({ p_due_only: false, p_reason: 'class' });
  });

  it('one row goes out as itself, bypassing the gate, and is marked sent_alone', async () => {
    replies.golf_push_holds_claim_user = { data: [held({ data: { title: 'Bus at 6', content: 'x' } })], error: null };
    replies.golf_push_holds_mark = { data: 1, error: null };
    const tally = await releaseHeldForUser(admin(), USER, { push });
    expect(sent.calls).toHaveLength(1);
    expect(sent.calls[0]).toEqual(['team_announcement', USER, { title: 'Bus at 6', content: 'x', hold: 'bypass', interruptionLevel: 'active' }]);
    expect(rpcLog.find((c) => c.fn === 'golf_push_holds_mark')!.args).toMatchObject({ p_outcome: 'sent_alone' });
    expect(tally.sentAlone).toBe(1);
  });

  it('two rows go out as one summary and are both marked summarized', async () => {
    replies.golf_push_holds_claim_user = { data: [held(), held({ notification_type: 'event_rsvp_reminder', group_key: 'events', body: 'Practice moved to 3:30 PM' })], error: null };
    replies.golf_push_holds_mark = { data: 2, error: null };
    await releaseHeldForUser(admin(), USER, { push });
    expect(sent.calls).toHaveLength(1);
    const [type, , data] = sent.calls[0]!;
    expect(type).toBe('class_summary');
    expect(data).toMatchObject({ title: 'While you were in class', body: 'Announcement: Bus at 6 · Practice moved to 3:30 PM', hold: 'bypass', threadId: 'class-summary', interruptionLevel: 'active', relevanceScore: 0.6 });
    expect(String(data.collapseId)).toMatch(/^class-\d{4}-\d{2}-\d{2}-\d{4}$/);
    const mark = rpcLog.find((c) => c.fn === 'golf_push_holds_mark')!;
    expect(mark.args.p_outcome).toBe('summarized');
    expect((mark.args.p_ids as string[]).length).toBe(2);
  });

  it('drops a message the player read in the app, one that was deleted, and one in a conversation they muted since', async () => {
    const read = held({ notification_type: 'new_message', group_key: 'coach_dm', message_id: 'm-read', conversation_id: CONV, data: { preview: 'old' } });
    const deleted = held({ notification_type: 'new_message', group_key: 'coach_dm', message_id: 'm-del', conversation_id: CONV, data: {} });
    const muted = held({ notification_type: 'new_message', group_key: 'coach_dm', message_id: 'm-mute', conversation_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', data: {} });
    const keep = held({ notification_type: 'new_message', group_key: 'coach_dm', message_id: 'm-keep', conversation_id: CONV, data: { senderName: 'Coach Rivera', preview: 'old text' } });
    tables.golf_messages = [
      { id: 'm-read', content: 'a', created_at: '2026-10-26T14:00:00Z', is_deleted: false },
      { id: 'm-del', content: 'b', created_at: '2026-10-26T14:30:00Z', is_deleted: true },
      { id: 'm-mute', content: 'c', created_at: '2026-10-26T14:31:00Z', is_deleted: false },
      { id: 'm-keep', content: 'edited during class', created_at: '2026-10-26T15:30:00Z', is_deleted: false },
    ];
    tables.golf_conversation_participants = [
      { conversation_id: CONV, last_read_at: '2026-10-26T15:00:00Z', notification_level: 'all', muted_until: null },
      { conversation_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', last_read_at: null, notification_level: 'muted', muted_until: null },
    ];
    replies.golf_push_holds_claim_user = { data: [read, deleted, muted, keep], error: null };
    replies.golf_push_holds_mark = { data: 1, error: null };
    await releaseHeldForUser(admin(), USER, { push });
    const outcomes = Object.fromEntries(rpcLog.filter((c) => c.fn === 'golf_push_holds_mark').map((c) => [c.args.p_outcome as string, c.args.p_ids]));
    expect(outcomes.read_in_app).toEqual([read.id]);
    expect(outcomes.cancelled).toEqual(expect.arrayContaining([deleted.id, muted.id]));
    // What is left goes out as itself with the message as it reads now (an edit made during class).
    expect(sent.calls).toHaveLength(1);
    expect(sent.calls[0]![2]).toMatchObject({ senderName: 'Coach Rivera', preview: 'edited during class', hold: 'bypass' });
  });

  it('a failed read of the messages gives the rows back for the next tick: nothing is cancelled, nothing is sent', async () => {
    const row = held({ notification_type: 'new_message', group_key: 'coach_dm', message_id: 'm-keep', conversation_id: CONV, data: {} });
    tableErrors.golf_messages = { code: '57014', message: 'statement timeout' };
    replies.golf_push_holds_claim_user = { data: [row], error: null };
    replies.golf_push_holds_unclaim = { data: 1, error: null };
    const tally = await releaseHeldForUser(admin(), USER, { push });
    expect(sent.calls).toHaveLength(0);
    expect(rpcLog.some((c) => c.fn === 'golf_push_holds_mark')).toBe(false);
    expect(rpcLog.find((c) => c.fn === 'golf_push_holds_unclaim')!.args.p_ids).toEqual([row.id]);
    expect(tally.failed).toBe(1);
  });

  it('a failed read of the participation does the same', async () => {
    const row = held({ notification_type: 'new_message', group_key: 'coach_dm', message_id: 'm-keep', conversation_id: CONV, data: {} });
    tables.golf_messages = [{ id: 'm-keep', content: 'x', created_at: '2026-10-26T15:30:00Z', is_deleted: false }];
    tableErrors.golf_conversation_participants = { code: '57014', message: 'statement timeout' };
    replies.golf_push_holds_claim_user = { data: [row], error: null };
    replies.golf_push_holds_unclaim = { data: 1, error: null };
    await releaseHeldForUser(admin(), USER, { push });
    expect(sent.calls).toHaveLength(0);
    expect(rpcLog.some((c) => c.fn === 'golf_push_holds_mark')).toBe(false);
    expect(rpcLog.find((c) => c.fn === 'golf_push_holds_unclaim')!.args.p_ids).toEqual([row.id]);
  });

  it('a failed read of the group titles still sends the summary, without titles', async () => {
    const a = held({ notification_type: 'new_message', group_key: 'group', conversation_id: CONV, data: { senderName: 'Coach Rivera', preview: 'a' } });
    const b = held({ notification_type: 'new_message', group_key: 'group', conversation_id: CONV, data: { senderName: 'Coach Rivera', preview: 'b' } });
    tableErrors.golf_conversations = { code: '57014', message: 'statement timeout' };
    replies.golf_push_holds_claim_user = { data: [a, b], error: null };
    replies.golf_push_holds_mark = { data: 2, error: null };
    await releaseHeldForUser(admin(), USER, { push });
    expect(sent.calls).toHaveLength(1);
    expect(sent.calls[0]![0]).toBe('class_summary');
  });

  it('drops a type the player turned off since, and a row that expired', async () => {
    prefs.current = { push_messages: false };
    replies.golf_push_holds_claim_user = {
      data: [held({ notification_type: 'new_message', group_key: 'coach_dm', data: {} }), held({ expires_at: '2000-01-01T00:00:00Z' })],
      error: null,
    };
    replies.golf_push_holds_mark = { data: 1, error: null };
    await releaseHeldForUser(admin(), USER, { push });
    expect(sent.calls).toHaveLength(0);
    const outcomes = rpcLog.filter((c) => c.fn === 'golf_push_holds_mark').map((c) => c.args.p_outcome).sort();
    expect(outcomes).toEqual(['cancelled', 'expired']);
  });

  it('gives the rows back when the send fails, and marks no_device when nothing was owed', async () => {
    replies.golf_push_holds_claim_user = { data: [held()], error: null };
    replies.golf_push_holds_unclaim = { data: 1, error: null };
    sent.next.push({ success: false });
    await releaseHeldForUser(admin(), USER, { push });
    expect(names()).toContain('golf_push_holds_unclaim');
    expect(names()).not.toContain('golf_push_holds_mark');

    rpcLog.length = 0;
    replies.golf_push_holds_mark = { data: 1, error: null };
    sent.next.push({ success: true });
    await releaseHeldForUser(admin(), USER, { push });
    expect(rpcLog.find((c) => c.fn === 'golf_push_holds_mark')!.args.p_outcome).toBe('no_device');
  });

  it('does nothing when the function is not there', async () => {
    const tally = await releaseHeldForUser(admin(), USER, { push });
    expect(tally.rows).toBe(0);
    expect(sent.calls).toHaveLength(0);
  });
});

describe('runClassHoldRelease', () => {
  const NOW = new Date(Date.UTC(2026, 9, 26, 15, 7, 0));

  it('is unavailable (and touches nothing else) when the heartbeat function is missing', async () => {
    const out = await runClassHoldRelease(admin(), push, NOW);
    expect(out.unavailable).toBe(true);
    expect(names()).toEqual(['golf_push_holds_beat']);
  });

  it('runs in order: beat, reconcile, claim, safety net, then hourly cleanup at minute 7', async () => {
    replies.golf_push_holds_beat = { data: NOW.toISOString(), error: null };
    replies.golf_push_holds_reconcile = { data: { moved: 1, expired: 2, overdue: 0, checked: 3, full: false }, error: null };
    replies.golf_push_holds_claim = { data: [held(), held({ user_id: 'u2' }), held({ user_id: 'u2', notification_type: 'event_rsvp_reminder', group_key: 'events' })], error: null };
    replies.golf_push_holds_claim_failed = { data: [held({ attempts: 3 })], error: null };
    replies.golf_push_holds_mark = { data: 1, error: null };
    replies.golf_push_holds_cleanup = { data: 0, error: null };
    const out = await runClassHoldRelease(admin(), push, NOW);
    expect(names().filter((f) => f !== 'golf_push_holds_mark')).toEqual([
      'golf_push_holds_beat', 'golf_push_holds_reconcile', 'golf_push_holds_claim', 'golf_push_holds_claim_failed', 'golf_push_holds_cleanup',
    ]);
    expect(out).toMatchObject({ moved: 1, expired: 2, overdue: 0, unavailable: false, safetyNet: 1 });
    expect(out.tally.users).toBe(2);
    // u1: one row as itself; u2: a summary; the safety-net row as itself.
    expect(sent.calls.map((c) => c[0]).sort()).toEqual(['class_summary', 'team_announcement', 'team_announcement']);
  });

  it('reconciles fully every 15 minutes and warns about overdue rows', async () => {
    replies.golf_push_holds_beat = { data: null, error: null };
    replies.golf_push_holds_reconcile = { data: { moved: 0, expired: 0, overdue: 4 }, error: null };
    await runClassHoldRelease(admin(), push, new Date(Date.UTC(2026, 9, 26, 15, 30, 0)));
    expect(rpcLog.find((c) => c.fn === 'golf_push_holds_reconcile')!.args.p_full).toBe(true);
    expect(logServerError.mock.calls.some((c) => String(c[0]).includes('overdue'))).toBe(true);
    rpcLog.length = 0;
    await runClassHoldRelease(admin(), push, new Date(Date.UTC(2026, 9, 26, 15, 31, 0)));
    expect(rpcLog.find((c) => c.fn === 'golf_push_holds_reconcile')!.args.p_full).toBe(false);
  });

  it('the safety net marks failed when even the direct send fails', async () => {
    replies.golf_push_holds_beat = { data: null, error: null };
    replies.golf_push_holds_claim_failed = { data: [held({ attempts: 3 })], error: null };
    replies.golf_push_holds_mark = { data: 1, error: null };
    sent.next.push({ success: false });
    await runClassHoldRelease(admin(), push, new Date(Date.UTC(2026, 9, 26, 15, 8, 0)));
    expect(rpcLog.find((c) => c.fn === 'golf_push_holds_mark')!.args.p_outcome).toBe('failed');
  });
});

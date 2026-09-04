/**
 * Optimistic-send correctness for golf chat.
 *
 * Reported/verified 2026-09-04, three compounding defects in the send path:
 *
 * 1. Id collision: `optimistic-${Date.now()}` — two sends in the same
 *    millisecond produced the SAME id, corrupting both the duplicate guard
 *    and reconciliation below.
 * 2. Wrong-message reconciliation: the realtime INSERT echo of our own
 *    message was matched by `prev.findIndex(m => m.id.startsWith('optimistic-')
 *    && m.sender_id === currentUserIdRef.current)` — "the FIRST optimistic
 *    row from me", not "the row THIS echo corresponds to". Two sends in
 *    flight with echoes arriving out of order landed their contents in
 *    swapped slots.
 * 3. No chronological re-sort: realtime inserts were always appended
 *    (`[...prev, newMessage]`), so two users sending near-simultaneously
 *    could render out of `created_at` order.
 *
 * The fix threads a client-generated id (see `generateClientMessageId`)
 * through to the server as `golf_messages.id` itself (a normal
 * `DEFAULT uuid_generate_v4()` column, not GENERATED ALWAYS — confirmed
 * against supabase/migrations/20260527000000_prod_public_baseline.sql and
 * the RLS policies on that table, neither of which treats `id` specially),
 * so the optimistic row and its echo carry the SAME id from creation. That
 * turns reconciliation from a heuristic guess into an exact match, which
 * `applyRealtimeMessageInsert` performs, and which also serves as the
 * ordered-insert path for messages from anyone else.
 *
 * `applyRealtimeMessageInsert` is tested directly for the same reason
 * `applyRealtimeMessageUpdate` is in the sibling file — it's pure, and a
 * behavioural test would need a full realtime + auth harness to exercise
 * the same merge/ordering algorithm. The id-collision defect is asserted
 * structurally, on the source, because a functional test of "does
 * Date.now() collide" is either flaky or vacuous; reading the generator is
 * what actually distinguishes fixed from broken.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyRealtimeMessageInsert } from '../use-golf-messages';

const source = readFileSync(join(process.cwd(), 'src/hooks/golf/use-golf-messages.ts'), 'utf-8');

type Msg = { id: string; sender_id: string; content: string; created_at: string | null };

describe('use-golf-messages — optimistic id generation is collision-proof (defect 1)', () => {
  it('does not derive the optimistic id from Date.now() any more', () => {
    // The exact broken expression, byte for bit: `${Date.now()}` produces
    // the same value for every call within the same millisecond, which is
    // exactly the collision this fix removes.
    expect(source).not.toContain('optimistic-${Date.now()}');
    expect(source).not.toMatch(/`optimistic-\$\{Date\.now\(\)\}`/);
  });

  it('generates the optimistic id via generateClientMessageId, not a literal template', () => {
    const start = source.indexOf('const optimisticId = ');
    expect(start).toBeGreaterThan(-1);
    const line = source.slice(start, source.indexOf('\n', start));
    expect(line).toContain('generateClientMessageId()');
  });

  it('prefers crypto.randomUUID and keeps a UUID-shaped fallback (server validates client_message_id as a UUID)', () => {
    const start = source.indexOf('function generateClientMessageId()');
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf('\n}', start));
    expect(body).toContain('crypto.randomUUID');
    // The fallback must still look like a v4 UUID: MessageSchemas.send
    // validates `client_message_id` with z.string().uuid(), and a malformed
    // id would turn a low-entropy fallback into a hard send failure instead.
    expect(body).toMatch(/xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx/);
  });
});

describe('use-golf-messages — realtime INSERT no longer reconciles by "first optimistic row" (defect 2)', () => {
  it('the INSERT handler no longer searches for an optimistic-prefixed row', () => {
    const channelStart = source.indexOf('// Set up real-time subscription');
    const channelEnd = source.indexOf('observeRealtimeChannel(channel,', channelStart);
    expect(channelStart).toBeGreaterThan(-1);
    expect(channelEnd).toBeGreaterThan(channelStart);

    const handlers = source.slice(channelStart, channelEnd);
    expect(handlers).not.toContain("startsWith('optimistic-')");
    expect(handlers).toContain('applyRealtimeMessageInsert');
  });

  it('the same client id is reused across the transport retry, not regenerated per attempt', () => {
    // Locate the function, do not pin its full parameter list. This pinned
    // `'const sendMessage = async (content: string)'` and broke on 2026-09-04
    // when a second parameter (replyToId, §30) was added — a signature change
    // that has nothing to do with the retry/id invariant this test guards.
    const sendStart = source.indexOf('const sendMessage = async (content: string');
    expect(sendStart, 'sendMessage not found — has it been renamed?').toBeGreaterThan(-1);
    const retryStart = source.indexOf('withOneTransportRetry(', sendStart);
    expect(retryStart).toBeGreaterThan(sendStart);
    const retryCall = source.slice(retryStart, source.indexOf(');', retryStart));
    // Both the closure passed to withOneTransportRetry and the optimistic
    // row must reference the SAME `optimisticId` binding, generated once
    // above the try block — not a fresh id per attempt, which would defeat
    // both reconciliation and the idempotent-retry handling on the server.
    expect(retryCall).toContain('optimisticId');
    const generatorIdx = source.indexOf('function generateClientMessageId()');
    expect(generatorIdx).toBeGreaterThan(-1);
    expect(generatorIdx).toBeLessThan(retryStart);
  });
});

describe('applyRealtimeMessageInsert — exact-id reconciliation (defect 2, functional)', () => {
  it('replaces the optimistic row in place when the echo carries the SAME id, wherever it sits', () => {
    // Two sends in flight: 'a' from me, 'b' from someone else, both already
    // rendered. The echo of MY message (id 'a') must land in slot 0 even
    // though it is not "the first optimistic row" any more — there is no
    // such concept left, only an exact id match.
    const prev: Msg[] = [
      { id: 'a', sender_id: 'me', content: 'hello', created_at: '2026-09-04T10:00:00.000Z' },
      { id: 'b', sender_id: 'them', content: 'hi', created_at: '2026-09-04T10:00:01.000Z' },
    ];
    const echoOfA: Msg = { id: 'a', sender_id: 'me', content: 'hello', created_at: '2026-09-04T10:00:00.100Z' };

    const next = applyRealtimeMessageInsert(prev, echoOfA);

    expect(next).toHaveLength(2);
    expect(next[0]).toBe(echoOfA);
    // The untouched row keeps its identity — no incidental re-render.
    expect(next[1]).toBe(prev[1]);
  });

  it('never swaps two in-flight sends into each other\'s slots regardless of echo arrival order', () => {
    const prev: Msg[] = [
      { id: 'first', sender_id: 'me', content: 'one', created_at: '2026-09-04T10:00:00.000Z' },
      { id: 'second', sender_id: 'me', content: 'two', created_at: '2026-09-04T10:00:00.050Z' },
    ];
    // The SECOND message's echo arrives FIRST — the old "first optimistic
    // from me" heuristic would have overwritten slot 0 (id 'first') with
    // this row's content.
    const echoOfSecond: Msg = { id: 'second', sender_id: 'me', content: 'two', created_at: '2026-09-04T10:00:00.400Z' };
    let acc = applyRealtimeMessageInsert(prev, echoOfSecond);
    expect(acc.find((m) => m.id === 'first')!.content).toBe('one');
    expect(acc.find((m) => m.id === 'second')!.content).toBe('two');

    const echoOfFirst: Msg = { id: 'first', sender_id: 'me', content: 'one', created_at: '2026-09-04T10:00:00.300Z' };
    acc = applyRealtimeMessageInsert(acc, echoOfFirst);
    expect(acc.find((m) => m.id === 'first')!.content).toBe('one');
    expect(acc.find((m) => m.id === 'second')!.content).toBe('two');
  });

  it('does not append a second copy of a message already in view (the old plain dedupe guard)', () => {
    const prev: Msg[] = [
      { id: 'a', sender_id: 'them', content: 'hi', created_at: '2026-09-04T10:00:00.000Z' },
    ];
    const next = applyRealtimeMessageInsert(prev, { ...prev[0]! });
    expect(next).toHaveLength(1);
  });
});

describe('applyRealtimeMessageInsert — chronological ordering (defect 3)', () => {
  it('appends in the common case (already-ordered arrival) without scanning', () => {
    const prev: Msg[] = [
      { id: 'a', sender_id: 'them', content: 'hi', created_at: '2026-09-04T10:00:00.000Z' },
    ];
    const incoming: Msg = { id: 'b', sender_id: 'me', content: 'hey', created_at: '2026-09-04T10:00:01.000Z' };
    const next = applyRealtimeMessageInsert(prev, incoming);
    expect(next.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('inserts an out-of-order arrival at its correct chronological position', () => {
    const prev: Msg[] = [
      { id: 'a', sender_id: 'them', content: '1', created_at: '2026-09-04T10:00:00.000Z' },
      { id: 'c', sender_id: 'me', content: '3', created_at: '2026-09-04T10:00:02.000Z' },
    ];
    // Two users sent near-simultaneously; this INSERT's realtime event
    // arrives after 'c' even though it was created before it.
    const b: Msg = { id: 'b', sender_id: 'them', content: '2', created_at: '2026-09-04T10:00:01.000Z' };
    const next = applyRealtimeMessageInsert(prev, b);
    expect(next.map((m) => m.id)).toEqual(['a', 'b', 'c']);
    // Neither existing row was touched.
    expect(next[0]).toBe(prev[0]);
    expect(next[2]).toBe(prev[1]);
  });

  it('breaks a same-timestamp tie deterministically by id', () => {
    const prev: Msg[] = [
      { id: 'aaaa', sender_id: 'them', content: '1', created_at: '2026-09-04T10:00:00.000Z' },
    ];
    const incoming: Msg = { id: 'bbbb', sender_id: 'me', content: '2', created_at: '2026-09-04T10:00:00.000Z' };
    const next = applyRealtimeMessageInsert(prev, incoming);
    // 'aaaa' < 'bbbb' lexically, so it sorts first — and re-applying the
    // identical row is a no-op by reference (same bail-out as
    // applyRealtimeMessageUpdate), not just by value.
    expect(next.map((m) => m.id)).toEqual(['aaaa', 'bbbb']);
    expect(applyRealtimeMessageInsert(next, incoming)).toBe(next);
  });

  it('does not corrupt ordering when created_at is null', () => {
    const prev: Msg[] = [
      { id: 'a', sender_id: 'them', content: '1', created_at: null },
    ];
    const incoming: Msg = { id: 'b', sender_id: 'me', content: '2', created_at: '2026-09-04T10:00:00.000Z' };
    // Must not throw and must not silently drop either message.
    const next = applyRealtimeMessageInsert(prev, incoming);
    expect(next.map((m) => m.id).sort()).toEqual(['a', 'b']);
    expect(next).toHaveLength(2);
  });
});

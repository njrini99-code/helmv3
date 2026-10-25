import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * P-10 in push.ts: with class_awareness_v1 off the send is exactly what it was (no gate call, no extra field, one at a time); with it
 * on, a push the class holds ends at the gate, the hold instruction never reaches the device payload, and the presentation fields the
 * release job sets reach the edge function only when present.
 */

vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}), logServerEvent: vi.fn(async () => {}), logServerException: vi.fn(async () => {}) }));
const flag = vi.hoisted(() => ({ on: false }));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => flag.on }));
vi.mock('../email', () => ({ getUserNotificationPreferences: async () => ({ push_messages: true, push_announcements: true, push_events: true }) }));
const gate = vi.hoisted(() => ({ verdict: 'pass' as 'held' | 'pass', calls: [] as unknown[][] }));
vi.mock('../class-hold', () => ({
  holdOrPass: async (...a: unknown[]) => {
    gate.calls.push(a);
    return gate.verdict;
  },
}));
const invoked = vi.hoisted(() => ({ bodies: [] as Record<string, unknown>[], live: 0, peak: 0 }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const node: Record<string, unknown> = {};
      const self = () => node;
      Object.assign(node, {
        select: self, eq: self, update: self,
        single: async () => ({ data: { failed_count: 0 }, error: null }),
        then: (r: (v: unknown) => unknown) => Promise.resolve({ data: [{ token: 'tok_aaaaaaaa', platform: 'ios' }], error: null }).then(r),
      });
      return node;
    },
    functions: {
      invoke: async (_fn: string, opts: { body: Record<string, unknown> }) => {
        invoked.live++;
        invoked.peak = Math.max(invoked.peak, invoked.live);
        await new Promise((r) => setTimeout(r, 2));
        invoked.live--;
        invoked.bodies.push(opts.body);
        return { error: null };
      },
    },
  }),
}));

import { sendBulkPushNotification, sendPushNotificationDirect } from '../push';

beforeEach(() => {
  flag.on = false;
  gate.verdict = 'pass';
  gate.calls.length = 0;
  invoked.bodies.length = 0;
  invoked.live = 0;
  invoked.peak = 0;
});

describe('flag off: push.ts is what it was', () => {
  it('never calls the gate, and the invoke body has exactly the old fields', async () => {
    const r = await sendPushNotificationDirect('team_announcement', 'u1', { title: 'Bus at 6', urgency: 'normal', hold: { group: 'announcements' } });
    expect(r).toEqual({ success: true, delivered: 1 });
    expect(gate.calls).toHaveLength(0);
    expect(Object.keys(invoked.bodies[0]!).sort()).toEqual(['body', 'data', 'deviceToken', 'platform', 'title']);
  });

  it('a bulk send runs one recipient at a time', async () => {
    const out = await sendBulkPushNotification('team_announcement', ['a', 'b', 'c'], { title: 'x' });
    expect(out).toEqual({ sent: 3, failed: 0 });
    expect(invoked.peak).toBe(1);
  });
});

describe('flag on', () => {
  beforeEach(() => { flag.on = true; });

  it('a push the class holds ends at the gate: no device is called, and it reports no delivery', async () => {
    gate.verdict = 'held';
    const r = await sendPushNotificationDirect('team_announcement', 'u1', { title: 'Bus at 6', urgency: 'high' });
    expect(r).toEqual({ success: true });
    expect(invoked.bodies).toHaveLength(0);
    // The gate got the type, the generated text and the default instruction (a `high` announcement is held).
    expect(gate.calls[0]!.slice(1, 3)).toEqual(['u1', 'team_announcement']);
    expect(gate.calls[0]![3]).toMatchObject({ title: 'Team Announcement', body: 'Bus at 6' });
    expect(gate.calls[0]![5]).toEqual({ group: 'announcements' });
  });

  it('a pass sends as always, and the hold instruction is stripped from the stored data and the payload', async () => {
    const hold = { group: 'coach_dm', conversationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
    const r = await sendPushNotificationDirect('new_message', 'u1', { senderName: 'Coach', preview: 'hi', conversationId: 'c1', hold });
    expect(r.delivered).toBe(1);
    expect(gate.calls[0]![5]).toEqual(hold);
    expect(gate.calls[0]![4]).not.toHaveProperty('hold');
    expect(JSON.stringify(invoked.bodies[0])).not.toContain('hold');
  });

  it('never asks the gate about bypass, an urgent announcement or an unclassified type', async () => {
    await sendPushNotificationDirect('new_message', 'u1', { senderName: 'Coach', preview: 'hi', hold: 'bypass' });
    await sendPushNotificationDirect('team_announcement', 'u1', { title: 'x', urgency: 'urgent' });
    await sendPushNotificationDirect('round_submitted', 'u1', { playerName: 'P', totalScore: 72 });
    await sendPushNotificationDirect('new_message', 'u1', { senderName: 'Coach', preview: 'no instruction' });
    expect(gate.calls).toHaveLength(0);
    expect(invoked.bodies).toHaveLength(4);
  });

  it('forwards the presentation fields the release job sets, only when well formed', async () => {
    await sendPushNotificationDirect('class_summary', 'u1', {
      title: 'While you were in class', body: '2 updates', link: 'https://helmsportslabs.com/golf/dashboard/messages', hold: 'bypass',
      interruptionLevel: 'active', threadId: 'class-summary', collapseId: 'class-2026-10-26-1550', relevanceScore: 0.6,
    });
    expect(invoked.bodies[0]).toMatchObject({ title: 'While you were in class', body: '2 updates', interruptionLevel: 'active', threadId: 'class-summary', collapseId: 'class-2026-10-26-1550', relevanceScore: 0.6 });
    expect((invoked.bodies[0]!.data as { url: string }).url).toBe('https://helmsportslabs.com/golf/dashboard/messages');
    await sendPushNotificationDirect('class_summary', 'u1', { title: 't', body: 'b', interruptionLevel: 'loud', threadId: '', relevanceScore: 'high' });
    expect(Object.keys(invoked.bodies[1]!).sort()).toEqual(['body', 'data', 'deviceToken', 'platform', 'title']);
  });

  it('a bulk send runs a pool of 8 and still counts every recipient', async () => {
    const out = await sendBulkPushNotification('team_announcement', Array.from({ length: 30 }, (_, i) => `u${i}`), { title: 'x' });
    expect(out).toEqual({ sent: 30, failed: 0 });
    expect(invoked.bodies).toHaveLength(30);
    expect(invoked.peak).toBeGreaterThan(1);
    expect(invoked.peak).toBeLessThanOrEqual(8);
  });
});

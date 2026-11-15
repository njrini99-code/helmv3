import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const state = vi.hoisted(() => ({
  afterFns: [] as Array<() => Promise<void> | void>,
  inserted: [] as unknown[],
  released: { id: 'req-1' } as { id: string } | null,
  emailOn: true,
  sent: [] as Array<{ subject: string; text: string }>,
}));

vi.mock('next/server', () => ({ after: (fn: () => Promise<void>) => state.afterFns.push(fn) }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }));
vi.mock('@/lib/coachhelm/v3/chat/player-context', () => ({
  resolvePlayerChatContext: async () => ({ player_id: 'p1', team_id: 't1', team_name: 'Varsity', timezone: 'America/New_York', roster: [{ id: 'p1', name: 'Jamie Minor' }] }),
}));
vi.mock('@/lib/coachhelm/v3/chat/player-allowance', () => ({ weekStart: () => '2026-11-09' }));
vi.mock('@/lib/coachhelm/v3/chat/ask-db', () => ({ askTables: (sb: unknown) => sb }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: (row: unknown) => {
        state.inserted.push(row);
        return { select: () => ({ maybeSingle: async () => ({ data: { id: 'req-1' }, error: null }) }) };
      },
      update: () => {
        const chain = { eq: () => chain, is: () => chain, select: () => chain, maybeSingle: async () => ({ data: state.released, error: null }), then: (ok: (v: unknown) => void) => ok({ error: null }) };
        return chain;
      },
    }),
  }),
}));
vi.mock('@/lib/email/outbound-gate', () => ({ isCustomerEmailEnabled: () => state.emailOn }));
vi.mock('@/lib/admin/digest/transport', () => ({
  sendOpsAlert: async (m: { subject: string; text: string }) => {
    state.sent.push(m);
    return { sent: true };
  },
}));
vi.mock('@/lib/app-base-url', () => ({ getAppBaseUrl: () => 'https://app.test' }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn() }));
vi.mock('@/lib/admin/observed-action', () => ({ withAdminObserved: (_n: string, _o: unknown, fn: unknown) => fn }));

import { requestAskCredits } from '../coachhelm-ask-credits';

async function release() {
  const run = Promise.all(state.afterFns.map((f) => f()));
  await vi.advanceTimersByTimeAsync(10_000);
  await run;
}

beforeEach(() => {
  vi.useFakeTimers();
  state.afterFns = [];
  state.inserted = [];
  state.released = { id: 'req-1' };
  state.emailOn = true;
  state.sent = [];
});
afterEach(() => vi.useRealTimers());

describe('requestAskCredits: the ops e-mail', () => {
  it('names the request and the team only, never the player or their note, and points to the admin console', async () => {
    await expect(requestAskCredits('  I have a qualifier Friday, my mum says I can  ')).resolves.toMatchObject({ success: true, id: 'req-1' });
    await release();
    expect(state.sent).toHaveLength(1);
    const { subject, text } = state.sent[0]!;
    expect(subject).toBe('Ask: request for more (Varsity)');
    expect(text).toContain('req-1');
    expect(text).toContain('Varsity');
    expect(text).toContain('https://app.test/admin/golf#ask-requests');
    for (const s of [subject, text]) {
      expect(s).not.toContain('Jamie');
      expect(s).not.toContain('Minor');
      expect(s).not.toContain('qualifier Friday');
    }
  });

  it('the note is still stored for the admin view, and an empty note is stored as empty (the column is NOT NULL)', async () => {
    await requestAskCredits('  Need more this week  ');
    await requestAskCredits('   ');
    expect(state.inserted[0]).toMatchObject({ note: 'Need more this week' });
    expect(state.inserted[1]).toMatchObject({ note: '' });
  });

  it('an undone request sends nothing, and nothing goes while customer e-mail is off', async () => {
    state.released = null;
    await requestAskCredits('x');
    await release();
    expect(state.sent).toEqual([]);
    state.afterFns = [];
    state.released = { id: 'req-1' };
    state.emailOn = false;
    await requestAskCredits('x');
    await release();
    expect(state.sent).toEqual([]);
  });
});

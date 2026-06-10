/**
 * calendar-feeds action tests (calendar audit 2026-06-10, finding #29).
 *
 * The regenerate bug: regenerateCalendarFeedToken used to deactivate EVERY
 * active feed the user owned (blanket `.eq('user_id', ...)` update) before
 * minting the new token — killing e.g. a coach's separate team feed. The fix
 * scopes the deactivation to the ONE targeted feed (`.eq('id', <feed>)`).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface RecordedCall {
  name: string;
  args: unknown[];
}

interface TableOp {
  table: string;
  calls: RecordedCall[];
}

/** Per-table FIFO of scripted responses; each from(table) pops the next. */
let scripts: Record<string, Array<{ data: unknown; error: { message: string } | null }>>;
let ops: TableOp[];
let authedUserId: string | null;

function makeBuilder(table: string) {
  const op: TableOp = { table, calls: [] };
  ops.push(op);
  const response = scripts[table]?.shift() ?? { data: null, error: null };

  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'not', 'order', 'limit', 'update', 'insert', 'delete']) {
    builder[m] = vi.fn((...args: unknown[]) => {
      op.calls.push({ name: m, args });
      return builder;
    });
  }
  builder.maybeSingle = vi.fn(async () => response);
  builder.single = vi.fn(async () => response);
  builder.then = (
    onfulfilled?: ((value: unknown) => unknown) | null,
    onrejected?: ((reason: unknown) => unknown) | null,
  ) => Promise.resolve(response).then(onfulfilled, onrejected);
  return builder;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: authedUserId ? { id: authedUserId } : null },
      })),
    },
    from: vi.fn((table: string) => makeBuilder(table)),
  })),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/utils/env', () => ({
  getAppUrl: () => 'https://app.test',
}));

import { regenerateCalendarFeedToken, getOrCreateCalendarFeedToken } from '../calendar-feeds';

function feedOps(): TableOp[] {
  return ops.filter((o) => o.table === 'golf_calendar_feeds');
}

function coachContextScripts() {
  return {
    golf_coaches: [
      { data: { id: 'coach-1', full_name: 'Coach One', organization_id: 'org-1' }, error: null },
    ],
    golf_teams: [{ data: { id: 'team-1' }, error: null }],
  };
}

describe('regenerateCalendarFeedToken — single-feed scoping', () => {
  beforeEach(() => {
    ops = [];
    authedUserId = 'user-1';
    vi.clearAllMocks();
  });

  it('deactivates ONLY the targeted feed (by id), never a blanket user_id update', async () => {
    scripts = {
      ...coachContextScripts(),
      golf_calendar_feeds: [
        // 1. find latest active feed
        { data: { id: 'feed-OLD' }, error: null },
        // 2. deactivate it
        { data: null, error: null },
        // 3. insert replacement
        { data: { id: 'feed-NEW', feed_token: 'tok-new-123' }, error: null },
      ],
    };

    const result = await regenerateCalendarFeedToken();
    expect(result.success).toBe(true);
    expect(result.data?.token).toBe('tok-new-123');
    expect(result.data?.url).toBe('https://app.test/api/calendar/feeds/tok-new-123');

    const updates = feedOps().filter((o) => o.calls.some((c) => c.name === 'update'));
    expect(updates).toHaveLength(1);
    const updateOp = updates[0]!;
    expect(updateOp.calls.find((c) => c.name === 'update')?.args[0]).toEqual({ is_active: false });

    // The ONLY filter on the deactivation is the targeted feed's id.
    const eqFilters = updateOp.calls.filter((c) => c.name === 'eq');
    expect(eqFilters).toEqual([{ name: 'eq', args: ['id', 'feed-OLD'] }]);
    // Regression guard for the blanket form.
    expect(eqFilters.some((c) => c.args[0] === 'user_id')).toBe(false);
  });

  it('selects the latest active feed (created_at desc, limit 1) as the target', async () => {
    scripts = {
      ...coachContextScripts(),
      golf_calendar_feeds: [
        { data: { id: 'feed-OLD' }, error: null },
        { data: null, error: null },
        { data: { id: 'feed-NEW', feed_token: 'tok' }, error: null },
      ],
    };

    await regenerateCalendarFeedToken();

    const findOp = feedOps()[0]!;
    expect(findOp.calls.find((c) => c.name === 'order')?.args).toEqual([
      'created_at',
      { ascending: false },
    ]);
    expect(findOp.calls.find((c) => c.name === 'limit')?.args).toEqual([1]);
  });

  it('with no existing feed it just creates one (no update issued)', async () => {
    scripts = {
      ...coachContextScripts(),
      golf_calendar_feeds: [
        { data: null, error: null }, // no active feed
        { data: { id: 'feed-NEW', feed_token: 'tok-fresh' }, error: null },
      ],
    };

    const result = await regenerateCalendarFeedToken();
    expect(result.success).toBe(true);
    expect(result.data?.token).toBe('tok-fresh');
    expect(feedOps().some((o) => o.calls.some((c) => c.name === 'update'))).toBe(false);
  });

  it('surfaces a deactivation failure instead of minting a second live token', async () => {
    scripts = {
      ...coachContextScripts(),
      golf_calendar_feeds: [
        { data: { id: 'feed-OLD' }, error: null },
        { data: null, error: { message: 'rls denied' } },
      ],
    };

    const result = await regenerateCalendarFeedToken();
    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to invalidate old feed');
    // No insert after the failed deactivation.
    expect(feedOps().some((o) => o.calls.some((c) => c.name === 'insert'))).toBe(false);
  });

  it('requires authentication', async () => {
    authedUserId = null;
    scripts = {};
    const result = await regenerateCalendarFeedToken();
    expect(result.success).toBe(false);
    expect(ops).toHaveLength(0);
  });
});

describe('getOrCreateCalendarFeedToken — deterministic lookup', () => {
  beforeEach(() => {
    ops = [];
    authedUserId = 'user-1';
    vi.clearAllMocks();
  });

  it('returns the existing latest active feed without creating a new one', async () => {
    scripts = {
      ...coachContextScripts(),
      golf_calendar_feeds: [{ data: { id: 'feed-1', feed_token: 'tok-existing' }, error: null }],
    };

    const result = await getOrCreateCalendarFeedToken();
    expect(result.success).toBe(true);
    expect(result.data?.token).toBe('tok-existing');
    expect(feedOps().some((o) => o.calls.some((c) => c.name === 'insert'))).toBe(false);

    // Lookup is order+limit(1) so multi-feed users don't hit the
    // maybeSingle multi-row error.
    const findOp = feedOps()[0]!;
    expect(findOp.calls.find((c) => c.name === 'order')?.args).toEqual([
      'created_at',
      { ascending: false },
    ]);
    expect(findOp.calls.find((c) => c.name === 'limit')?.args).toEqual([1]);
  });

  it('creates a feed when none exists', async () => {
    scripts = {
      ...coachContextScripts(),
      golf_calendar_feeds: [
        { data: null, error: null },
        { data: { id: 'feed-NEW', feed_token: 'tok-created' }, error: null },
      ],
    };

    const result = await getOrCreateCalendarFeedToken();
    expect(result.success).toBe(true);
    expect(result.data?.token).toBe('tok-created');
  });
});

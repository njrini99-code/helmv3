import { describe, it, expect, vi } from 'vitest';
import {
  absorbIntoRecentEvent,
  bumpCollapsedMetadata,
  DURABLE_COLLAPSE_WINDOW_MS,
} from '@/lib/admin/durable-collapse';

/**
 * 99 identical `provider_vercel_unavailable` rows in 2h05m, `collapsed_count`
 * NULL on every one — the per-process throttle cannot see across lambdas.
 * These pin the durable half: same fingerprint inside the window → bump the
 * existing row, never insert; anything unreadable → fail OPEN to an insert.
 */

type Row = { id: string; metadata: unknown };

/** A fake admin client that records the filters the lookup applied and the update it made. */
function fakeAdmin(opts: {
  rows?: Row[];
  lookupError?: { message: string } | null;
  updateError?: { message: string } | null;
}) {
  const filters: Array<[string, unknown]> = [];
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const chain = {
    select: () => chain,
    eq: (col: string, v: unknown) => {
      filters.push([col, v]);
      return chain;
    },
    gte: (col: string, v: unknown) => {
      filters.push([col, v]);
      return chain;
    },
    order: () => chain,
    limit: async () => ({ data: opts.rows ?? [], error: opts.lookupError ?? null }),
    update: (patch: Record<string, unknown>) => ({
      eq: async (_col: string, id: string) => {
        updates.push({ id, patch });
        return { error: opts.updateError ?? null };
      },
    }),
  };
  const admin = { from: () => chain } as never;
  return { admin, filters, updates };
}

describe('bumpCollapsedMetadata', () => {
  it('increments the NESTED counter the Bridge reads (metadata.metadata.collapsed_count) and stamps last_seen_at', () => {
    const out = bumpCollapsedMetadata(
      { action: 'integration.vercel', metadata: { collapsed_count: 4 } },
      { by: 3, at: '2026-09-01T15:00:00.000Z' },
    );
    expect(out).toMatchObject({
      action: 'integration.vercel',
      metadata: { collapsed_count: 7, last_seen_at: '2026-09-01T15:00:00.000Z' },
    });
  });

  it('starts from 0 when the row carries no counter, and treats `by` < 1 as 1', () => {
    expect(bumpCollapsedMetadata({ metadata: {} }, { by: 0, at: 'now' })).toMatchObject({
      metadata: { collapsed_count: 1 },
    });
    expect(bumpCollapsedMetadata(null, { by: 1, at: 'now' })).toMatchObject({
      metadata: { collapsed_count: 1 },
    });
  });

  it('does not mutate its input', () => {
    const input = { metadata: { collapsed_count: 1 } };
    bumpCollapsedMetadata(input, { by: 1, at: 'now' });
    expect(input.metadata.collapsed_count).toBe(1);
  });
});

describe('absorbIntoRecentEvent', () => {
  it('bumps the most recent unresolved row for the fingerprint instead of inserting', async () => {
    const { admin, filters, updates } = fakeAdmin({
      rows: [{ id: 'evt-1', metadata: { metadata: { collapsed_count: 2 } } }],
    });
    const now = new Date('2026-09-01T15:00:00.000Z');

    const out = await absorbIntoRecentEvent(admin, { fingerprint: 'fp-a', by: 5, now });

    expect(out).toEqual({ collapsed: true, eventId: 'evt-1', reason: null });
    expect(updates).toHaveLength(1);
    expect(updates[0]!.id).toBe('evt-1');
    expect(updates[0]!.patch.metadata).toMatchObject({ metadata: { collapsed_count: 7 } });
    // The lookup is scoped to THIS fingerprint, unresolved error rows, inside the window.
    expect(filters).toContainEqual(['fingerprint', 'fp-a']);
    expect(filters).toContainEqual(['event_type', 'error']);
    expect(filters).toContainEqual(['resolved', false]);
    expect(filters).toContainEqual([
      'created_at',
      new Date(now.getTime() - DURABLE_COLLAPSE_WINDOW_MS).toISOString(),
    ]);
  });

  it('reports no_recent_row (caller inserts) when nothing is inside the window', async () => {
    const { admin, updates } = fakeAdmin({ rows: [] });
    const out = await absorbIntoRecentEvent(admin, { fingerprint: 'fp-a' });
    expect(out).toEqual({ collapsed: false, eventId: null, reason: 'no_recent_row' });
    expect(updates).toHaveLength(0);
  });

  it('FAILS OPEN on a lookup error — losing the collapse beats losing the signal', async () => {
    const { admin } = fakeAdmin({ lookupError: { message: 'statement timeout' } });
    const out = await absorbIntoRecentEvent(admin, { fingerprint: 'fp-a' });
    expect(out.collapsed).toBe(false);
    expect(out.reason).toBe('lookup_failed');
  });

  it('fails open on an update error too', async () => {
    const { admin } = fakeAdmin({
      rows: [{ id: 'evt-1', metadata: null }],
      updateError: { message: 'permission denied' },
    });
    const out = await absorbIntoRecentEvent(admin, { fingerprint: 'fp-a' });
    expect(out).toEqual({ collapsed: false, eventId: null, reason: 'update_failed' });
  });

  it('never throws, even when the client itself explodes', async () => {
    const admin = { from: () => { throw new Error('client exploded'); } } as never;
    await expect(absorbIntoRecentEvent(admin, { fingerprint: 'fp-a' })).resolves.toMatchObject({
      collapsed: false,
    });
    expect(vi.isMockFunction(admin)).toBe(false);
  });
});

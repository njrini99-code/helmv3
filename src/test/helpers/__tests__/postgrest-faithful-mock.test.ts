import { describe, it, expect } from 'vitest';
import {
  createFaithfulAdminClient,
  POSTGREST_MAX_ROWS,
  POSTGREST_MAX_IN_VALUES,
} from '@/test/helpers/postgrest-faithful-mock';

/**
 * The double is only worth anything if it fails the way production fails, so
 * these assert the two behaviours that let real bugs through on 2026-07-31.
 */
describe('postgrest-faithful mock', () => {
  const manyRows = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `row-${i}` }));

  it('rejects an oversized in() list the way the edge does — 400 "Bad Request"', async () => {
    const { client } = createFaithfulAdminClient({ rows: { admin_events: manyRows(2000) } });
    const ids = Array.from({ length: POSTGREST_MAX_IN_VALUES + 1 }, (_, i) => `row-${i}`);

    const { data, error } = await client
      .from('admin_events')
      .update({ resolved: true })
      .in('id', ids);

    expect(data).toBeNull();
    // The literal string matters: this is what surfaces in logs, and it reads
    // like a query bug rather than a URL-length problem.
    expect(error?.message).toBe('Bad Request');
  });

  it('accepts a chunked in() list', async () => {
    const { client, calls } = createFaithfulAdminClient({ rows: { admin_events: manyRows(2000) } });
    const ids = Array.from({ length: 200 }, (_, i) => `row-${i}`);

    const { error } = await client.from('admin_events').update({ resolved: true }).in('id', ids);

    expect(error).toBeNull();
    expect(calls[0]!.inValues).toHaveLength(200);
  });

  it('caps every read at 1000 rows however large the .limit()', async () => {
    const { client } = createFaithfulAdminClient({ rows: { admin_events: manyRows(5000) } });

    const { data } = await client.from('admin_events').select('id').limit(5000);

    // The exact trap: asking for 5000 returns 1000, and code that treats a
    // full page as "short" then stops draining after one batch.
    expect(data).toHaveLength(POSTGREST_MAX_ROWS);
  });

  it('records chunk sizes so a test can assert the caller chunked', async () => {
    const { client, calls } = createFaithfulAdminClient({ rows: { admin_events: manyRows(450) } });
    const all = Array.from({ length: 450 }, (_, i) => `row-${i}`);

    for (let i = 0; i < all.length; i += 200) {
      await client.from('admin_events').update({ resolved: true }).in('id', all.slice(i, i + 200));
    }

    expect(calls).toHaveLength(3);
    for (const c of calls) expect(c.inValues!.length).toBeLessThanOrEqual(200);
  });
});

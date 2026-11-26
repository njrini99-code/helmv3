/**
 * readPackVerdict (B13's queue): the three narrow reads on the pack's page decide fixed, regressed, waiting or "can't
 * decide yet", against a fake clubhouse_signal_hourly that applies the filters the read sends.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HourlyRow } from '../live-model';

const db = vi.hoisted(() => ({ table: [] as Array<Record<string, unknown>>, reads: [] as Array<Record<string, unknown>> }));

function hourly() {
  const f: { gte?: string; lt?: string; release?: string; pages?: string[]; ascending?: boolean } = {};
  const q = {
    select: () => q,
    gte: (_c: string, v: string) => ((f.gte = v), q),
    lt: (_c: string, v: string) => ((f.lt = v), q),
    eq: (c: string, v: string) => (c === 'release' && (f.release = v), q),
    in: (c: string, v: string[]) => (c === 'page_id' && (f.pages = v), q),
    order: (c: string, o: { ascending: boolean }) => (c === 'bucket_hour' && (f.ascending = o.ascending), q),
    range: async (from: number, to: number) => {
      db.reads.push({ ...f });
      const rows = (db.table as unknown as HourlyRow[])
        .filter((r) => (!f.gte || r.bucket_hour >= f.gte) && (!f.lt || r.bucket_hour < f.lt) && (!f.release || r.release === f.release) && (!f.pages || f.pages.includes(r.page_id)))
        .sort((a, b) => (f.ascending ? a.bucket_hour.localeCompare(b.bucket_hour) : b.bucket_hour.localeCompare(a.bucket_hour)));
      return { data: rows.slice(from, to + 1), error: null };
    },
  };
  return q;
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => hourly() }) }));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => false }));

import { readPackVerdict } from '../live';

const row = (bucket_hour: string, release: string, outcome = 'success', over: Partial<HourlyRow> = {}): HourlyRow => ({
  bucket_hour,
  code: 'CH-7004',
  kind: 'action',
  outcome,
  act: 'sendMessage',
  role: 'coach',
  platform: 'ios-app',
  release,
  bridge_id: 70603,
  page_id: 'P007',
  signal_count: 2,
  user_ids: ['u1'],
  duration_buckets: [],
  last_at: bucket_hour,
  ...over,
});
const set = (rows: HourlyRow[]) => {
  db.table = rows as unknown as Array<Record<string, unknown>>;
};

const sentAt = '2026-11-20T10:30:00.000Z';
const pack = { sentAt, page: 'P007', codes: ['CH-7004'] };

beforeEach(() => {
  db.table = [];
  db.reads.length = 0;
});

describe('readPackVerdict', () => {
  it('reads nothing for a pack with no codes or no page', async () => {
    expect((await readPackVerdict({ ...pack, codes: [] })).data.status).toBe('sent');
    expect((await readPackVerdict({ ...pack, page: null })).data.status).toBe('sent');
    expect(db.reads).toEqual([]);
  });

  it('every read is narrowed to the pack page; the search runs oldest first from the next hour', async () => {
    set([row('2026-11-20T09:00:00.000Z', 'aaaaaaa1', 'failure'), row('2026-11-21T09:00:00.000Z', 'bbbbbbb2')]);
    const v = await readPackVerdict(pack);
    expect(v.data).toEqual({ status: 'fixed', release: 'bbbbbbb2', firing: 0 });
    expect(db.reads.every((r) => JSON.stringify(r.pages) === '["P007"]')).toBe(true);
    expect(db.reads.some((r) => r.ascending === true && r.gte === '2026-11-20T11:00:00.000Z')).toBe(true);
  });

  it('the release already in use when it was sent never decides it, however long it keeps running', async () => {
    set([row('2026-11-20T09:00:00.000Z', 'aaaaaaa1'), row('2026-11-20T12:00:00.000Z', 'aaaaaaa1'), row('2026-11-23T12:00:00.000Z', 'aaaaaaa1')]);
    expect((await readPackVerdict(pack)).data.status).toBe('waiting');
  });

  it('a release used only on another page cannot fix it; failures on the page regress it', async () => {
    const rows = [row('2026-11-20T09:00:00.000Z', 'aaaaaaa1'), row('2026-11-21T09:00:00.000Z', 'bbbbbbb2', 'success', { page_id: 'P002', code: 'CH-1903' })];
    set(rows);
    expect((await readPackVerdict(pack)).data.status).toBe('waiting');
    set([...rows, row('2026-11-21T10:00:00.000Z', 'bbbbbbb2', 'failure')]);
    expect((await readPackVerdict(pack)).data).toEqual({ status: 'regressed', release: 'bbbbbbb2', firing: 2 });
  });

  it('a forward search cut short before a new release says "can\'t decide yet", never waiting or fixed', async () => {
    const rows = [row('2026-11-20T09:00:00.000Z', 'aaaaaaa1')];
    for (let h = 1; h <= 1500; h++) rows.push(row(new Date(Date.parse('2026-11-20T10:00:00.000Z') + h * 3_600_000).toISOString(), 'aaaaaaa1'));
    rows.push(row('2027-02-01T00:00:00.000Z', 'bbbbbbb2'));
    set(rows);
    expect((await readPackVerdict(pack)).data.status).toBe('undecided');
  });
});

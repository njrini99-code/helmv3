/**
 * The Bridge notes actions (B05 Mark expected and Watch, B13 Mark sent and Archive): super admin first, validated
 * against the graph, one service-role write, then a redirect back. A person's or a team's pack is refused (D7).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fixtureGraph } from '@/lib/admin/clubhouse/__tests__/fixtures';

const { requireSuperAdmin } = vi.hoisted(() => ({ requireSuperAdmin: vi.fn(async () => ({ userId: 'admin-1' })) }));
vi.mock('@/lib/admin/require-super-admin', () => ({ requireSuperAdmin }));
// The wrapper's logging has its own tests; here it passes through.
vi.mock('@/lib/admin/observed-action', () => ({ withAdminObserved: (_n: string, _o: unknown, fn: unknown) => fn }));
vi.mock('@/lib/admin/clubhouse/graph-server', () => ({ loadBridgeGraph: () => fixtureGraph() }));
vi.mock('next/navigation', () => ({
  redirect: (href: string) => {
    throw new Error(`REDIRECT:${href}`);
  },
}));

interface Call {
  table: string;
  op: 'select' | 'insert' | 'update';
  payload?: Record<string, unknown>;
  filters: Array<[string, string, unknown]>;
}
const calls: Call[] = [];
let openRows: unknown[] = [];
let writeError: { message: string } | null = null;

function builder(table: string) {
  const call: Call = { table, op: 'select', filters: [] };
  const b = {
    select: () => b,
    insert: (payload: Record<string, unknown>) => {
      call.op = 'insert';
      call.payload = payload;
      calls.push(call);
      return Promise.resolve({ error: writeError });
    },
    update: (payload: Record<string, unknown>) => {
      call.op = 'update';
      call.payload = payload;
      return b;
    },
    eq: (c: string, v: unknown) => (call.filters.push(['eq', c, v]), b),
    is: (c: string, v: unknown) => (call.filters.push(['is', c, v]), b),
    limit: () => {
      calls.push(call);
      return Promise.resolve({ data: openRows, error: null });
    },
    then: (res: (v: { error: unknown }) => unknown, rej?: (e: unknown) => unknown) => {
      calls.push(call);
      return Promise.resolve({ error: writeError }).then(res, rej);
    },
  };
  return b;
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => builder(t) }) }));

import { archivePack, markCodeExpected, markPackSent, setCodeWatch, unmarkCodeExpected } from '../bridge-notes';

const form = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};
const writes = () => calls.filter((c) => c.op !== 'select');

beforeEach(() => {
  calls.length = 0;
  openRows = [];
  writeError = null;
  requireSuperAdmin.mockClear();
});

describe('B05 Mark expected', () => {
  it('replaces any open mark with one row naming the code, the reason and who, then goes back to the dossier', async () => {
    await expect(markCodeExpected(form({ id: '70603', reason: '  Coaches without a roster see this on purpose. ' }))).rejects.toThrow('REDIRECT:/admin/clubhouse/codes/70603');
    expect(requireSuperAdmin).toHaveBeenCalledTimes(1);
    const [resolve, insert] = writes();
    expect(resolve).toMatchObject({ table: 'bridge_notes', op: 'update' });
    expect(resolve!.filters).toEqual(expect.arrayContaining([['eq', 'kind', 'expected'], ['eq', 'code', 'CH-7004'], ['is', 'resolved_at', null]]));
    expect(insert!.payload).toEqual({ kind: 'expected', code: 'CH-7004', bridge_id: 70603, page_id: 'P007', body: 'Coaches without a roster see this on purpose.', created_by: 'admin-1' });
  });

  it('needs a reason and a registered code, and writes nothing otherwise', async () => {
    await expect(markCodeExpected(form({ id: '70603', reason: '   ' }))).rejects.toThrow('A reason is required');
    await expect(markCodeExpected(form({ id: '99999', reason: 'x' }))).rejects.toThrow('Not a registered code');
    await expect(markCodeExpected(form({ id: '70603; drop', reason: 'x' }))).rejects.toThrow('Not a registered code');
    expect(writes()).toEqual([]);
  });

  it('refuses before reading anything when the caller is not a super admin', async () => {
    requireSuperAdmin.mockRejectedValueOnce(new Error('Forbidden'));
    await expect(markCodeExpected(form({ id: '70603', reason: 'x' }))).rejects.toThrow('Forbidden');
    expect(calls).toEqual([]);
  });

  it('Unmark resolves the open mark', async () => {
    await expect(unmarkCodeExpected(form({ id: '70603' }))).rejects.toThrow('REDIRECT:/admin/clubhouse/codes/70603');
    expect(writes()).toHaveLength(1);
    expect(writes()[0]!.payload).toHaveProperty('resolved_at');
  });

  it('a failed write is an error, not a silent success', async () => {
    writeError = { message: 'permission denied' };
    await expect(markCodeExpected(form({ id: '70603', reason: 'x' }))).rejects.toThrow('Could not update the note');
  });
});

describe('B05 Watch', () => {
  it('starts a watch once, and stops it', async () => {
    await expect(setCodeWatch(form({ id: '70603', watch: '1' }))).rejects.toThrow('REDIRECT:');
    expect(writes()[0]!.payload).toMatchObject({ kind: 'watch', code: 'CH-7004', created_by: 'admin-1' });
    calls.length = 0;
    openRows = [{ id: 'x' }];
    await expect(setCodeWatch(form({ id: '70603', watch: '1' }))).rejects.toThrow('REDIRECT:');
    expect(writes()).toEqual([]);
    await expect(setCodeWatch(form({ id: '70603', watch: '0' }))).rejects.toThrow('REDIRECT:');
    expect(writes()[0]).toMatchObject({ op: 'update' });
  });
});

describe('B13 Mark sent and Archive', () => {
  it('keeps the target key only, once, and goes back to the desk with the pack', async () => {
    await expect(markPackSent(form({ t: 'CH-7004' }))).rejects.toThrow('REDIRECT:/admin/clubhouse/duet?t=70603');
    expect(writes()[0]!.payload).toEqual({ kind: 'pack', code: 'CH-7004', bridge_id: 70603, page_id: 'P007', body: '70603', created_by: 'admin-1' });
    calls.length = 0;
    openRows = [{ id: 'x' }];
    await expect(markPackSent(form({ t: '70603' }))).rejects.toThrow('REDIRECT:');
    expect(writes()).toEqual([]);
  });

  it("never keeps a person's or a team's pack (D7), nor an unknown target", async () => {
    await expect(markPackSent(form({ t: 'user:11111111-2222-4333-8444-555555555555' }))).rejects.toThrow('D7');
    await expect(markPackSent(form({ t: 'team:11111111-2222-4333-8444-555555555555' }))).rejects.toThrow('D7');
    await expect(markPackSent(form({ t: 'P999' }))).rejects.toThrow('Not a pack target');
    expect(writes()).toEqual([]);
  });

  it('Archive takes a note id and resolves that pack only', async () => {
    await expect(archivePack(form({ note: 'not-a-uuid' }))).rejects.toThrow('Not a note id');
    const id = '00000000-0000-4000-8000-000000000001';
    await expect(archivePack(form({ note: id, t: 'P007' }))).rejects.toThrow('REDIRECT:/admin/clubhouse/duet?t=P007');
    const [w] = writes();
    expect(w!.filters).toEqual(expect.arrayContaining([['eq', 'kind', 'pack'], ['eq', 'id', id]]));
  });
});

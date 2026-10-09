import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';

/**
 * P014-C1. createRecruit and updateRecruit store a prospect's next step (next_step_label, next_step_date) only when the
 * caller passes it, validated (a label of at most 120 characters, trimmed; a real YYYY-MM-DD day). A call without them
 * names neither column, so nothing changes for a page that has not found the columns (before the migration is applied).
 */

vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn().mockResolvedValue(undefined) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/observability/supabase/observe-storage', () => ({ observeStorageResult: vi.fn() }));
vi.mock('@/lib/golf/resolve-team-server', () => ({ resolveCoachTeamIdWithCookie: vi.fn(async () => 'team-1') }));

const createClientMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient: () => createClientMock() }));

import { createRecruit, updateRecruit } from '@/app/golf/actions/recruiting';

type Row = Record<string, unknown>;

function world() {
  const tables: Record<string, Row[]> = {
    golf_coaches: [{ id: 'coach-1', user_id: 'user-1', organization_id: 'org-1' }],
    golf_recruits: [
      { id: 'rec-mine', team_id: 'team-1', first_name: 'Ellie', status: 'recruiting' },
      { id: 'rec-other', team_id: 'team-2', first_name: 'Owen', status: 'recruiting' },
    ],
  };
  const fake = createFakeSupabase({ user: { id: 'user-1' }, tables });
  const writes: Array<{ table: string; kind: 'insert' | 'update'; row: Row }> = [];
  createClientMock.mockResolvedValue({
    ...fake,
    from: (table: string) => {
      const b = fake.from(table) as unknown as Record<string, (...a: unknown[]) => unknown>;
      return {
        ...b,
        insert: (row: Row) => {
          writes.push({ table, kind: 'insert', row });
          return b.insert!(row);
        },
        update: (row: Row) => {
          writes.push({ table, kind: 'update', row });
          return b.update!(row);
        },
      };
    },
  });
  return { tables, writes };
}

beforeEach(() => vi.clearAllMocks());

describe('the next step on a recruit (P014-C1)', () => {
  it('an update without next-step fields names neither column', async () => {
    const { writes } = world();
    expect(await updateRecruit('rec-mine', { notes: 'Saw her at States' })).toEqual({ success: true });
    expect(writes).toHaveLength(1);
    expect(Object.keys(writes[0]!.row)).not.toContain('next_step_label');
    expect(Object.keys(writes[0]!.row)).not.toContain('next_step_date');
  });

  it('a create without next-step fields names neither column', async () => {
    const { writes } = world();
    expect((await createRecruit({ first_name: 'Ada' })).success).toBe(true);
    expect(Object.keys(writes[0]!.row)).not.toContain('next_step_label');
    expect(Object.keys(writes[0]!.row)).not.toContain('next_step_date');
  });

  it('stores a passed next step, trimmed, and clears it with null or blanks', async () => {
    const { tables, writes } = world();
    expect(await updateRecruit('rec-mine', { next_step_label: '  Official visit ', next_step_date: '2026-10-30' })).toEqual({ success: true });
    expect(writes[0]!.row).toMatchObject({ next_step_label: 'Official visit', next_step_date: '2026-10-30' });
    expect(tables.golf_recruits!.find((r) => r.id === 'rec-mine')).toMatchObject({ next_step_label: 'Official visit', next_step_date: '2026-10-30' });
    expect(await updateRecruit('rec-mine', { next_step_label: '   ', next_step_date: null })).toEqual({ success: true });
    expect(writes[1]!.row).toMatchObject({ next_step_label: null, next_step_date: null });
    expect((await createRecruit({ first_name: 'Ada', next_step_label: 'Call', next_step_date: '2026-11-02' })).success).toBe(true);
    expect(writes[2]!.row).toMatchObject({ next_step_label: 'Call', next_step_date: '2026-11-02', team_id: 'team-1', created_by: 'coach-1' });
  });

  it('refuses a label over 120 characters and a date that is not a real YYYY-MM-DD day, writing nothing', async () => {
    const { writes } = world();
    expect(await updateRecruit('rec-mine', { next_step_label: 'x'.repeat(121) })).toEqual({ success: false, error: 'Next step is too long' });
    for (const bad of ['2026-02-30', '10/30/2026', '2026-1-5', 'soon']) {
      expect((await updateRecruit('rec-mine', { next_step_date: bad })).success).toBe(false);
      expect((await createRecruit({ first_name: 'Ada', next_step_date: bad })).success).toBe(false);
    }
    expect(writes).toHaveLength(0);
  });

  it('keeps the team check: another team’s recruit is not updated', async () => {
    const { tables } = world();
    expect((await updateRecruit('rec-other', { next_step_label: 'Call' })).success).toBe(false);
    expect(tables.golf_recruits!.find((r) => r.id === 'rec-other')).not.toHaveProperty('next_step_label');
  });
});

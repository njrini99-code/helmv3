import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';

/**
 * C-12. A write that matches ZERO rows is not an error in PostgREST, so deleteRecruit and updateRecruit reported
 * success for a recruit that was never touched. deleteRecruit was worse: it went on to purge the recruit's storage
 * objects after a delete that removed nothing, destroying the files of a prospect that still existed. Its document
 * read also filtered on the recruit id alone, not the team.
 */

vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn().mockResolvedValue(undefined) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/observability/supabase/observe-storage', () => ({ observeStorageResult: vi.fn() }));
vi.mock('@/lib/golf/resolve-team-server', () => ({ resolveCoachTeamIdWithCookie: vi.fn(async () => 'team-1') }));

const createClientMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient: () => createClientMock() }));

import { deleteRecruit, updateRecruit } from '@/app/golf/actions/recruiting';

type Row = Record<string, unknown>;

function world(opts: { docsError?: boolean } = {}) {
  const tables: Record<string, Row[]> = {
    golf_coaches: [{ id: 'coach-1', user_id: 'user-1', organization_id: 'org-1' }],
    golf_recruits: [
      { id: 'rec-mine', team_id: 'team-1', first_name: 'Ellie', status: 'recruiting' },
      { id: 'rec-other', team_id: 'team-2', first_name: 'Owen', status: 'recruiting' },
    ],
    golf_recruit_documents: [
      { id: 'd1', recruit_id: 'rec-mine', team_id: 'team-1', storage_path: 'team-1/rec-mine/a.pdf' },
      { id: 'd2', recruit_id: 'rec-other', team_id: 'team-2', storage_path: 'team-2/rec-other/b.pdf' },
    ],
  };
  const fake = createFakeSupabase({ user: { id: 'user-1' }, tables });
  const remove = vi.fn(async () => ({ error: null }));
  createClientMock.mockResolvedValue({
    ...fake,
    from: (table: string) => {
      const b = fake.from(table);
      if (table === 'golf_recruit_documents' && opts.docsError) {
        const failing: Record<string, unknown> = {};
        Object.assign(failing, {
          eq: () => failing,
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }).then(resolve),
        });
        return { ...b, select: () => failing };
      }
      return b;
    },
    storage: { from: () => ({ remove }) },
  });
  return { tables, remove };
}

beforeEach(() => vi.clearAllMocks());

describe('deleteRecruit (C-12)', () => {
  it('removes the recruit and purges that recruit\'s files', async () => {
    const { tables, remove } = world();
    expect(await deleteRecruit('rec-mine')).toEqual({ success: true });
    expect(tables.golf_recruits!.map((r) => r.id)).toEqual(['rec-other']);
    expect(remove).toHaveBeenCalledWith(['team-1/rec-mine/a.pdf']);
  });

  it('fails, and purges nothing, when the delete removed no row (another team\'s recruit)', async () => {
    const { tables, remove } = world();
    const result = await deleteRecruit('rec-other');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/already removed|isn't on your team/);
    expect(tables.golf_recruits!.map((r) => r.id)).toContain('rec-other');
    expect(remove).not.toHaveBeenCalled();
  });

  it('fails, and purges nothing, for an id that does not exist', async () => {
    const { remove } = world();
    expect((await deleteRecruit('rec-gone')).success).toBe(false);
    expect(remove).not.toHaveBeenCalled();
  });

  it('stops before deleting anything when the document read fails, so no file is orphaned', async () => {
    const { tables, remove } = world({ docsError: true });
    const result = await deleteRecruit('rec-mine');
    expect(result).toEqual({ success: false, error: 'Failed to remove recruit' });
    expect(tables.golf_recruits!.map((r) => r.id)).toContain('rec-mine');
    expect(remove).not.toHaveBeenCalled();
  });
});

describe('updateRecruit (C-12)', () => {
  it('updates a recruit on this team', async () => {
    const { tables } = world();
    expect(await updateRecruit('rec-mine', { status: 'offered' })).toEqual({ success: true });
    expect(tables.golf_recruits!.find((r) => r.id === 'rec-mine')!.status).toBe('offered');
  });

  it('fails when no row matched (another team\'s recruit, or a stale id)', async () => {
    const { tables } = world();
    const other = await updateRecruit('rec-other', { status: 'offered' });
    expect(other).toEqual({ success: false, error: 'Recruit not found' });
    expect(tables.golf_recruits!.find((r) => r.id === 'rec-other')!.status).toBe('recruiting');
    expect((await updateRecruit('rec-gone', { status: 'offered' })).success).toBe(false);
  });
});

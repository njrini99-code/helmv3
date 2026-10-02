// =============================================================================
// src/app/golf/actions/__tests__/documents-uploader.test.ts
//
// Swap audit F-52: golf_documents.uploaded_by references auth.users, which
// PostgREST cannot embed, so `uploader:uploaded_by(full_name, email)` made
// every getDocuments read fail with PGRST200 ("Could not find a relationship")
// and Documents showed its error state for every team, in both UIs. The list,
// the single read and the version compare now select plain rows and resolve
// uploaders from golf_coaches afterwards.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const fromMock = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER_ID } } })) },
    from: fromMock,
  })),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}) }));
vi.mock('@/lib/golf/resolve-team', () => ({ validateCoachTeamAccess: vi.fn(async () => true) }));

import { compareVersions, getDocument, getDocuments } from '@/app/golf/actions/documents';

const TEAM_ID = '2acc63ce-1c29-5c57-b75b-93427a35720e';
const DOC_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = 'c8dcf7d5-da14-439b-93c6-58d1e0dd38a0';
const UPLOADER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

type Result = { data: unknown; error: unknown };
const selects: string[] = [];

function chain(result: () => Result) {
  const c: Record<string, unknown> = {};
  c.select = vi.fn((cols: string) => {
    selects.push(cols);
    return c;
  });
  for (const m of ['eq', 'in', 'order', 'limit']) c[m] = vi.fn(() => c);
  c.single = vi.fn(async () => result());
  c.maybeSingle = vi.fn(async () => result());
  c.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => Promise.resolve(result()).then(resolve, reject);
  return c;
}

/** PostgREST's answer to any embed on uploaded_by. */
const embedFails = (cols: string): Result | null =>
  /uploaded_by\s*\(/.test(cols) ? { data: null, error: { code: 'PGRST200', message: "Could not find a relationship between 'golf_documents' and 'uploaded_by'" } } : null;

const doc = { id: DOC_ID, team_id: TEAM_ID, is_public: true, uploaded_by: UPLOADER, title: 'Travel waiver' };
const version = (n: number) => ({ id: `v${n}`, document_id: DOC_ID, version_number: n, uploaded_by: UPLOADER, created_at: `2026-09-0${n}T12:00:00Z`, file_size: 100 * n });

beforeEach(() => {
  selects.length = 0;
  fromMock.mockReset();
  fromMock.mockImplementation((table: string) => {
    if (table === 'golf_coaches') {
      // The role check (a staffed coach) and the uploader lookup share the table.
      const c = chain(() => ({ data: [{ user_id: UPLOADER, full_name: 'Pat Coach', email: 'pat@example.test' }], error: null }));
      c.maybeSingle = vi.fn(async () => ({ data: { id: 'coach-1', organization_id: 'org-1' }, error: null }));
      return c;
    }
    if (table === 'golf_documents') {
      let cols = '';
      const c = chain(() => embedFails(cols) ?? { data: cols.includes('golf_document_versions') ? { ...doc, versions: [version(1), version(2)] } : cols === 'team_id, is_public' ? doc : [doc], error: null });
      const select = c.select as (s: string) => unknown;
      c.select = vi.fn((s: string) => {
        cols = s;
        return select(s);
      });
      return c;
    }
    if (table === 'golf_document_versions') {
      let cols = '';
      const c = chain(() => embedFails(cols) ?? { data: [version(1), version(2)], error: null });
      const select = c.select as (s: string) => unknown;
      c.select = vi.fn((s: string) => {
        cols = s;
        return select(s);
      });
      return c;
    }
    return chain(() => ({ data: null, error: null }));
  });
});

describe('documents: uploaders without an embed (F-52)', () => {
  it('getDocuments lists the team documents with the uploader resolved', async () => {
    const res = await getDocuments(TEAM_ID);
    expect(res.error).toBeNull();
    expect(res.data).toHaveLength(1);
    expect((res.data?.[0] as { uploader?: { full_name: string | null } } | undefined)?.uploader?.full_name).toBe('Pat Coach');
  });

  it('getDocument reads the document and its versions, uploaders resolved', async () => {
    const res = await getDocument(DOC_ID);
    expect(res.error).toBeNull();
    expect((res.data as { uploader?: { full_name: string | null } } | null)?.uploader?.full_name).toBe('Pat Coach');
    const versions = (res.data as unknown as { versions: Array<{ version_number: number; uploader?: { full_name: string | null } }> }).versions;
    expect(versions.map((v) => v.version_number)).toEqual([2, 1]);
    expect(versions[0]?.uploader?.full_name).toBe('Pat Coach');
  });

  it('compareVersions compares two versions, uploaders resolved', async () => {
    const res = await compareVersions(DOC_ID, 1, 2);
    expect(res.error).toBeNull();
    expect(res.data?.sizeDiff).toBe(100);
  });

  it('no read embeds uploaded_by', async () => {
    await getDocuments(TEAM_ID);
    await getDocument(DOC_ID);
    await compareVersions(DOC_ID, 1, 2);
    expect(selects.filter((s) => /uploaded_by\s*\(/.test(s))).toEqual([]);
  });
});

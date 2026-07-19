// =============================================================================
// src/app/golf/actions/__tests__/documents.test.ts
//
// Regression test for the Documents page (W4 audit): "Preview unavailable"
// for every document, and "Couldn't load version history" for every
// document, on /golf/dashboard/documents.
//
// Root causes:
//  1. getDocumentVersions (backing getVersionHistory) selected
//     `uploader:uploaded_by(full_name, email)` on golf_document_versions —
//     a PostgREST embed that assumes uploaded_by is a foreign key. It isn't
//     (confirmed against the baseline schema: golf_document_versions has NO
//     constraint on that column at all), so the query always threw and the
//     version-history modal unconditionally rendered its error state.
//     Fix: drop the embed, resolve uploader display info with a follow-up
//     query against golf_coaches (documents are only uploaded by coaches),
//     keyed by golf_coaches.user_id.
//  2. getPreviewUrl threw a generic, logged error whenever a document had
//     zero golf_document_versions rows (seed/legacy data inserted directly
//     into golf_documents, or a version-insert that silently failed at
//     upload time) — an honest "nothing to preview" case, not a technical
//     failure. Fix: maybeSingle() instead of single() for that lookup, and
//     return `{ data: null, error: null, noContent: true }` instead of
//     throwing/logging.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUserMock = vi.fn();
const fromMock = vi.fn();
const createSignedUrlMock = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: createSignedUrlMock,
        getPublicUrl: vi.fn((path: string) => ({ data: { publicUrl: `https://storage.example/${path}` } })),
      })),
    },
  })),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
}));
// resolveTeamRole's coach branch calls out to this for the staffed-team
// check; short-circuit it to "yes" so tests exercise the query logic under
// test, not the staffing rules (covered elsewhere).
vi.mock('@/lib/golf/resolve-team', () => ({
  validateCoachTeamAccess: vi.fn(async () => true),
}));

import { getDocumentVersions, getVersionHistory, getPreviewUrl } from '@/app/golf/actions/documents';

const TEAM_ID = '2acc63ce-1c29-5c57-b75b-93427a35720e';
const COACH_USER_ID = 'c8dcf7d5-da14-439b-93c6-58d1e0dd38a0';
const DOC_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

/** Chainable, awaitable Postgrest-style query-builder stub. */
function makeChain(
  resolveList: () => { data: unknown; error: unknown },
  resolveSingle?: () => { data: unknown; error: unknown },
) {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order', 'in', 'limit']) {
    chain[method] = vi.fn(() => chain);
  }
  chain.single = vi.fn(async () => (resolveSingle ? resolveSingle() : resolveList()));
  chain.maybeSingle = vi.fn(async () => (resolveSingle ? resolveSingle() : resolveList()));
  // Make the chain itself awaitable (mirrors PostgrestFilterBuilder's thenable behavior).
  chain.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
    Promise.resolve(resolveList()).then(resolve, reject);
  return chain;
}

let coachRow: Record<string, unknown> | null;
let coachesRows: Array<Record<string, unknown>>;
let versionsRows: Array<Record<string, unknown>>;

/** Every `select(...)` string passed to fromMock across a test, for the embed regression guard. */
let selectCalls: string[];

function latestVersionRow(): Record<string, unknown> | null {
  if (versionsRows.length === 0) return null;
  return [...versionsRows].sort(
    (a, b) => (b.version_number as number) - (a.version_number as number),
  )[0]!;
}

beforeEach(() => {
  vi.clearAllMocks();
  coachRow = { id: 'coach-row-id', organization_id: 'org-id' };
  coachesRows = [];
  versionsRows = [];
  selectCalls = [];

  createSignedUrlMock.mockResolvedValue({
    data: { signedUrl: 'https://signed.example/file' },
    error: null,
  });

  getUserMock.mockResolvedValue({
    data: { user: { id: COACH_USER_ID } },
    error: null,
  });

  fromMock.mockImplementation((table: string) => {
    const chain =
      table === 'golf_documents'
        ? makeChain(
            () => ({ data: null, error: null }),
            () => ({ data: { team_id: TEAM_ID }, error: null }),
          )
        : table === 'golf_coaches'
          ? makeChain(
              () => ({ data: coachesRows, error: null }),
              () => ({ data: coachRow, error: null }),
            )
          : table === 'golf_document_versions'
            ? makeChain(
                () => ({ data: versionsRows, error: null }),
                () => ({ data: latestVersionRow(), error: null }),
              )
            : makeChain(() => ({ data: null, error: null }));

    const originalSelect = chain.select as (...args: unknown[]) => unknown;
    chain.select = vi.fn((...args: unknown[]) => {
      selectCalls.push(String(args[0] ?? ''));
      return originalSelect(...args);
    });

    return chain;
  });
});

describe('getDocumentVersions / getVersionHistory (#w4-document-preview)', () => {
  it('never selects the broken uploader:uploaded_by(...) embed', async () => {
    versionsRows = [];
    await getVersionHistory(DOC_ID);
    for (const s of selectCalls) {
      expect(s).not.toMatch(/uploader\s*:\s*uploaded_by/);
    }
  });

  it('loads with zero versions and no error (previously always errored)', async () => {
    versionsRows = [];
    const result = await getVersionHistory(DOC_ID);
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.versions).toEqual([]);
  });

  it('attaches uploader full_name resolved from golf_coaches', async () => {
    versionsRows = [
      {
        id: 'v1',
        document_id: DOC_ID,
        version_number: 1,
        storage_path: 'golf-documents/team/file.pdf',
        uploaded_by: COACH_USER_ID,
      },
    ];
    coachesRows = [{ user_id: COACH_USER_ID, full_name: 'Nick Rini', email: 'njrini99@gmail.com' }];

    const result = await getDocumentVersions(DOC_ID);

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1);
    expect(result.data![0]!.uploader).toEqual({ id: COACH_USER_ID, full_name: 'Nick Rini' });
  });

  it('degrades to no uploader when no matching coach row exists', async () => {
    versionsRows = [
      {
        id: 'v1',
        document_id: DOC_ID,
        version_number: 1,
        storage_path: 'golf-documents/team/file.pdf',
        uploaded_by: 'someone-not-a-coach',
      },
    ];
    coachesRows = [];

    const result = await getDocumentVersions(DOC_ID);

    expect(result.error).toBeNull();
    expect(result.data![0]!.uploader).toBeUndefined();
  });
});

describe('getPreviewUrl (#w4-document-preview)', () => {
  it('returns noContent (not an error) when the document has zero version rows', async () => {
    versionsRows = [];
    const result = await getPreviewUrl(DOC_ID);
    expect(result.error).toBeNull();
    expect(result.data).toBeNull();
    expect(result.noContent).toBe(true);
  });

  it('signs the latest version storage_path when a version row exists', async () => {
    versionsRows = [
      {
        id: 'v1',
        document_id: DOC_ID,
        version_number: 1,
        storage_path: 'golf-documents/team/file.pdf',
        mime_type: 'application/pdf',
        uploaded_by: COACH_USER_ID,
      },
    ];

    const result = await getPreviewUrl(DOC_ID);

    expect(result.error).toBeNull();
    expect(result.noContent).toBeUndefined();
    expect(result.data).toEqual({ url: 'https://signed.example/file', mimeType: 'application/pdf' });
    expect(createSignedUrlMock).toHaveBeenCalledWith('golf-documents/team/file.pdf', 3600);
  });
});

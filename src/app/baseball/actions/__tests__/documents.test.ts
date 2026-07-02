// =============================================================================
// src/app/baseball/actions/__tests__/documents.test.ts
//
// Regression test for the "Documents could not load" bug on
// /baseball/dashboard/documents.
//
// Root cause: getTeamDocuments/getDocument/getVersionHistory selected
// `uploader:uploaded_by(full_name, email)` — a PostgREST embed that assumes
// the `uploaded_by` FK target (`public.users`) has a `full_name` column. It
// doesn't (confirmed against the live schema: public.users only has
// id/email/role/created_at/updated_at/notification_preferences/last_seen),
// so every query errored with `column users_1.full_name does not exist` and
// the page always rendered its error state — even with zero documents.
//
// Fix: drop the broken embed, resolve uploader display info with a
// follow-up query against `baseball_coaches` (which does have full_name,
// keyed by the same public.users.id via baseball_coaches.user_id — uploads
// require the can_manage_documents capability, so uploaders are coaches).
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
      from: vi.fn(() => ({ createSignedUrl: createSignedUrlMock })),
    },
  })),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
}));

import { getTeamDocuments, getDocument, getVersionHistory } from '@/app/baseball/actions/documents';

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
  // Make the chain itself awaitable (mirrors PostgrestFilterBuilder's thenable behavior).
  chain.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
    Promise.resolve(resolveList()).then(resolve, reject);
  return chain;
}

let documentsRows: Array<Record<string, unknown>>;
let documentSingleRow: Record<string, unknown> | null;
let coachesRows: Array<Record<string, unknown>>;
let versionsRows: Array<Record<string, unknown>>;

/** Every `select(...)` string passed to fromMock across a test, for the embed regression guard. */
let selectCalls: string[];

beforeEach(() => {
  vi.clearAllMocks();
  documentsRows = [];
  documentSingleRow = null;
  coachesRows = [];
  versionsRows = [];
  selectCalls = [];

  createSignedUrlMock.mockResolvedValue({
    data: { signedUrl: 'https://signed.example/file' },
    error: null,
  });

  fromMock.mockImplementation((table: string) => {
    const chain =
      table === 'baseball_documents'
        ? makeChain(
            () => ({ data: documentsRows, error: null }),
            () => ({ data: documentSingleRow, error: null }),
          )
        : table === 'baseball_coaches'
          ? makeChain(() => ({ data: coachesRows, error: null }))
          : table === 'baseball_document_versions'
            ? makeChain(
                () => ({ data: versionsRows, error: null }),
                () => ({ data: versionsRows[0] ?? null, error: null }),
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

describe('getTeamDocuments (#documents-load)', () => {
  it('never selects the broken uploader:uploaded_by(...) embed', async () => {
    documentsRows = [];
    await getTeamDocuments(TEAM_ID, true);
    for (const s of selectCalls) {
      expect(s).not.toMatch(/uploader\s*:\s*uploaded_by/);
    }
  });

  it('loads with zero documents and no error (previously always errored, even empty)', async () => {
    documentsRows = [];
    const result = await getTeamDocuments(TEAM_ID, true);
    expect(result.error).toBeNull();
    expect(result.data).toEqual([]);
  });

  it('attaches uploader full_name/email resolved from baseball_coaches', async () => {
    documentsRows = [
      {
        id: 'doc-1',
        team_id: TEAM_ID,
        title: 'Playbook',
        uploaded_by: COACH_USER_ID,
        is_player_visible: true,
      },
    ];
    coachesRows = [{ user_id: COACH_USER_ID, full_name: 'Nick Rini', email: 'njrini99@gmail.com' }];

    const result = await getTeamDocuments(TEAM_ID, true);

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1);
    expect(result.data![0]!.uploader).toEqual({ full_name: 'Nick Rini', email: 'njrini99@gmail.com' });
  });

  it('degrades to a null uploader when no matching coach row exists', async () => {
    documentsRows = [
      {
        id: 'doc-1',
        team_id: TEAM_ID,
        title: 'Playbook',
        uploaded_by: 'someone-not-a-coach',
        is_player_visible: true,
      },
    ];
    coachesRows = [];

    const result = await getTeamDocuments(TEAM_ID, true);

    expect(result.error).toBeNull();
    expect(result.data![0]!.uploader).toBeNull();
  });
});

describe('getDocument (#documents-load)', () => {
  it('never selects the broken uploader:uploaded_by(...) embed on the doc or its versions', async () => {
    documentSingleRow = {
      id: DOC_ID,
      team_id: TEAM_ID,
      title: 'Playbook',
      uploaded_by: COACH_USER_ID,
      versions: [],
    };
    await getDocument(DOC_ID);
    for (const s of selectCalls) {
      expect(s).not.toMatch(/uploader\s*:\s*uploaded_by/);
    }
  });

  it('resolves uploader on the document and each version', async () => {
    documentSingleRow = {
      id: DOC_ID,
      team_id: TEAM_ID,
      title: 'Playbook',
      uploaded_by: COACH_USER_ID,
      versions: [
        { id: 'v1', document_id: DOC_ID, version_number: 1, uploaded_by: COACH_USER_ID },
      ],
    };
    coachesRows = [{ user_id: COACH_USER_ID, full_name: 'Nick Rini', email: 'njrini99@gmail.com' }];

    const result = await getDocument(DOC_ID);

    expect(result.error).toBeNull();
    expect(result.data?.uploader).toEqual({ full_name: 'Nick Rini', email: 'njrini99@gmail.com' });
    expect(result.data?.versions?.[0]!.uploader).toEqual({ full_name: 'Nick Rini', email: 'njrini99@gmail.com' });
  });
});

describe('getVersionHistory (#documents-load)', () => {
  it('never selects the broken uploader:uploaded_by(...) embed', async () => {
    versionsRows = [];
    await getVersionHistory(DOC_ID);
    for (const s of selectCalls) {
      expect(s).not.toMatch(/uploader\s*:\s*uploaded_by/);
    }
  });

  it('attaches resolved uploader info to each version', async () => {
    versionsRows = [
      {
        id: 'v1',
        document_id: DOC_ID,
        version_number: 1,
        storage_path: 'baseball-documents/team/file.pdf',
        uploaded_by: COACH_USER_ID,
      },
    ];
    coachesRows = [{ user_id: COACH_USER_ID, full_name: 'Nick Rini', email: 'njrini99@gmail.com' }];

    const result = await getVersionHistory(DOC_ID);

    expect(result.success).toBe(true);
    expect(result.versions?.[0]!.uploader).toEqual({ full_name: 'Nick Rini', email: 'njrini99@gmail.com' });
  });
});

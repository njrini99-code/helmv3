// =============================================================================
// src/app/golf/actions/__tests__/documents-coach-only.test.ts
//
// Q-74 (owner-approved 2026-09-30): deleting and uploading team documents is
// coach-only, checked on the server.
//
// Before: deleteDocumentImpl (behind deleteDocument AND deleteGolfDocument)
// only required that the caller was ANY active team member, and
// uploadGolfDocumentImpl only that they were signed in. Row-level security
// already refuses a non-coach's delete (golf_documents_delete_coach, and the
// `documents` bucket's delete/insert policies), so a player's delete removed
// nothing and still reported success, and a player's upload reached storage
// before a policy refused it. Now both return an honest refusal before
// touching anything, and a delete that matched no row is a failure.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUserMock = vi.fn();
const fromMock = vi.fn();
const storageFromMock = vi.fn();
const validateCoachTeamAccessMock = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
    storage: { from: storageFromMock },
  })),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
}));
vi.mock('@/lib/golf/resolve-team', () => ({
  validateCoachTeamAccess: (...args: unknown[]) => validateCoachTeamAccessMock(...args),
}));

import {
  createDocument,
  deleteDocument,
  deleteGolfDocument,
  deleteVersion,
  getDocumentVersions,
  getPreviewUrl,
  revertToVersion,
  updateDocument,
  uploadGolfDocument,
} from '@/app/golf/actions/documents';

const TEAM_ID = '2acc63ce-1c29-5c57-b75b-93427a35720e';
const DOC_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = 'c8dcf7d5-da14-439b-93c6-58d1e0dd38a0';

type Result = { data: unknown; error: unknown };

/** Chainable, awaitable Postgrest-style stub: every filter returns the chain, the chain resolves to `result`. */
function chain(result: () => Result, single?: () => Result) {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'order', 'limit', 'delete']) c[m] = vi.fn(() => c);
  c.single = vi.fn(async () => (single ?? result)());
  c.maybeSingle = vi.fn(async () => (single ?? result)());
  c.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
    Promise.resolve(result()).then(resolve, reject);
  return c;
}

/** Who the caller is on the document's team. */
let role: 'coach' | 'player' | 'outsider';
let deletedRows: Array<{ id: string }>;
let isPublic: boolean;
let documentsChain: ReturnType<typeof chain>;
const removeMock = vi.fn();
const uploadMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  role = 'coach';
  deletedRows = [{ id: DOC_ID }];
  isPublic = false;
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  removeMock.mockResolvedValue({ error: null });
  uploadMock.mockResolvedValue({ error: null });
  storageFromMock.mockImplementation(() => ({
    remove: removeMock,
    upload: uploadMock,
    getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.example/${path}` } }),
  }));
  validateCoachTeamAccessMock.mockImplementation(async () => role === 'coach');

  documentsChain = chain(
    () => ({ data: deletedRows, error: null }),
    () => ({ data: { team_id: TEAM_ID, file_url: 'https://storage.example/x', is_public: isPublic }, error: null }),
  );
  fromMock.mockImplementation((table: string) => {
    switch (table) {
      case 'golf_documents':
        return documentsChain;
      case 'golf_coaches':
        return chain(
          () => ({ data: null, error: null }),
          () => ({ data: role === 'coach' ? { id: 'coach-1', organization_id: 'org-1' } : null, error: null }),
        );
      case 'golf_players':
        return chain(
          () => ({ data: null, error: null }),
          () => ({ data: role === 'player' ? { id: 'player-1' } : null, error: null }),
        );
      case 'golf_team_members':
        return chain(
          () => ({ data: null, error: null }),
          () => ({ data: role === 'player' ? { id: 'member-1' } : null, error: null }),
        );
      case 'golf_document_versions':
        return chain(() => ({ data: [{ storage_path: `golf-documents/${TEAM_ID}/v1.pdf` }], error: null }));
      default:
        return chain(() => ({ data: null, error: null }));
    }
  });
});

function pdf(): File {
  return new File(['%PDF'], 'lineup.pdf', { type: 'application/pdf' });
}

describe('deleteGolfDocument / deleteDocument: coach-only (Q-74)', () => {
  it('refuses a player on the team with the reason, and removes nothing', async () => {
    role = 'player';

    const res = await deleteGolfDocument(DOC_ID);

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/only a coach/i);
    expect(removeMock).not.toHaveBeenCalled();
    expect(documentsChain.delete).not.toHaveBeenCalled();
  });

  it('refuses the same player through deleteDocument (both entry points share the check)', async () => {
    role = 'player';

    const res = await deleteDocument(DOC_ID);

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/only a coach/i);
    expect(removeMock).not.toHaveBeenCalled();
    expect(documentsChain.delete).not.toHaveBeenCalled();
  });

  it('refuses someone with no place on the team', async () => {
    role = 'outsider';

    const res = await deleteGolfDocument(DOC_ID);

    expect(res.success).toBe(false);
    expect(removeMock).not.toHaveBeenCalled();
    expect(documentsChain.delete).not.toHaveBeenCalled();
  });

  it('lets a coach staffed on the team delete: storage objects, then the row', async () => {
    const res = await deleteGolfDocument(DOC_ID);

    expect(res).toEqual({ success: true, error: undefined });
    expect(removeMock).toHaveBeenCalledWith([`golf-documents/${TEAM_ID}/v1.pdf`]);
    expect(documentsChain.delete).toHaveBeenCalledTimes(1);
  });

  it('reports a delete that matched no row as a failure, not a success', async () => {
    deletedRows = [];

    const res = await deleteGolfDocument(DOC_ID);

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/not found or not permitted/i);
  });

  it('rejects a signed-out caller', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });

    const res = await deleteGolfDocument(DOC_ID);

    expect(res.success).toBe(false);
    expect(removeMock).not.toHaveBeenCalled();
  });
});

describe('uploadGolfDocument: coach-only (Q-74)', () => {
  it('refuses a player on the team before anything is written to storage', async () => {
    role = 'player';

    const res = await uploadGolfDocument(pdf(), TEAM_ID);

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/only a coach/i);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('refuses a signed-in user who is not on the team, even though the team id is theirs to supply', async () => {
    role = 'outsider';

    const res = await uploadGolfDocument(pdf(), TEAM_ID);

    expect(res.success).toBe(false);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('lets a coach staffed on the team upload under that team folder', async () => {
    const res = await uploadGolfDocument(pdf(), TEAM_ID);

    expect(res.success).toBe(true);
    expect(uploadMock).toHaveBeenCalledTimes(1);
    const [path] = uploadMock.mock.calls[0] as [string];
    expect(path).toMatch(new RegExp(`^golf-documents/${TEAM_ID}/[0-9a-f-]+\\.pdf$`));
    expect(res.storage_path).toBe(path);
  });

  it('rejects a signed-out caller', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });

    const res = await uploadGolfDocument(pdf(), TEAM_ID);

    expect(res.success).toBe(false);
    expect(uploadMock).not.toHaveBeenCalled();
  });
});

// The rest of the document surface, gated the same way (security review, 2026-09-30).
describe('the other document writes are coach-only too', () => {
  it('refuses a player editing a document (title, visibility)', async () => {
    role = 'player';
    const res = await updateDocument(DOC_ID, { playerVisible: true });
    expect(res.data).toBeNull();
    expect(res.error).toMatch(/only a coach/i);
  });

  it('refuses a player deleting a version', async () => {
    role = 'player';
    const res = await deleteVersion(DOC_ID, 'version-1');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/only a coach/i);
    expect(removeMock).not.toHaveBeenCalled();
  });

  it('refuses a restore by anyone who is not a coach on the team (it had no team check at all)', async () => {
    for (const who of ['player', 'outsider'] as const) {
      role = who;
      const res = await revertToVersion(DOC_ID, 'version-1');
      expect(res.success).toBe(false);
    }
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('refuses a player creating a document, before the storage write', async () => {
    role = 'player';
    const res = await createDocument(TEAM_ID, 'Lineup', pdf());
    expect(res.data).toBeNull();
    expect(uploadMock).not.toHaveBeenCalled();
  });
});

describe('a player reads only documents shared with players', () => {
  it("refuses a coach-only document's versions and preview", async () => {
    role = 'player';
    isPublic = false;
    expect((await getDocumentVersions(DOC_ID)).error).toMatch(/not authorized/i);
    expect((await getPreviewUrl(DOC_ID)).error).toMatch(/not authorized/i);
  });

  it("lets the player read a shared document's versions", async () => {
    role = 'player';
    isPublic = true;
    expect((await getDocumentVersions(DOC_ID)).error).toBeNull();
  });
});

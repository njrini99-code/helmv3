// =============================================================================
// src/app/baseball/actions/__tests__/documents-write-capability.test.ts
//
// Deepens documents test coverage (test-documents-depth). The pre-existing
// suite left two things unexercised:
//   - src/lib/baseball/__tests__/documents-capability.test.ts is a single
//     assertion that 'can_manage_documents' is in BASEBALL_CAPABILITY_KEYS —
//     it never invokes requireBaseballCapability or exercises a write.
//   - src/app/baseball/actions/__tests__/documents.test.ts only covers the
//     uploader-embed regression on the three READ paths (getTeamDocuments /
//     getDocument / getVersionHistory); create/update/delete/upload/revert
//     have zero coverage.
//
// This file (new, additive — the two files above are left untouched per the
// task's "new test files only" scope) covers what's missing:
//   1. All six write actions (upload/create/update/delete/uploadNewVersion/
//      revert) reject a capability-less caller and succeed for a capability
//      holder — using a REAL baseball_team_coach_staff row so
//      requireBaseballCapability's actual resolution logic runs, not a
//      stubbed stand-in (mirrors dev-plans-coach-gating.test.ts's idiom).
//   2. Team-id-forging is blocked: upload/create re-check capability against
//      an explicit teamId/team_id argument when it differs from the active
//      team (documents.ts:309-311, 370-372); update/delete resolve the
//      capability-checked team from the EXISTING document row, never from
//      the caller's active team; uploadNewVersion's optional `teamId` arg is
//      never used for the capability gate at all (only document.team_id is —
//      it only feeds the storage path), so passing a forged teamId can
//      neither grant nor block access on its own.
//   3. Signed-URL call sites (getPreviewUrl, getVersionHistory,
//      getTeamDocuments/withFreshDocumentUrls, upload, uploadNewVersion,
//      revertToVersion) are exercised for the exact storage_path + the
//      3600s TTL (SIGNED_URL_TTL_SECONDS), including the honest nuance that
//      revertToVersion re-signs the ORIGINAL reverted-to path rather than
//      uploading a new file.
//   4. deleteBaseballDocument's storage.remove is asserted to receive
//      exactly this document's version storage_paths, never another
//      document's.
// =============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';
import type { ActiveBaseballContext } from '@/lib/baseball/active-context-shared';

type Row = Record<string, unknown>;

interface StorageMock {
  createSignedUrl: ReturnType<typeof vi.fn>;
  upload: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
}

type FakeClient = FakeSupabase & { storage: { from: (bucket: string) => StorageMock } };

const TEAM_ID = 'team-1';
const OTHER_TEAM_ID = 'team-2';
const CAP_USER_ID = 'user-cap';
const CAP_COACH_ID = 'coach-cap';
const NOCAP_USER_ID = 'user-nocap';
const NOCAP_COACH_ID = 'coach-nocap';
const DOC_ID = 'doc-1';

const CAPABILITY_DENIED_RAW = 'Missing baseball capability: can_manage_documents';
const CAPABILITY_DENIED_MAPPED = 'You do not have permission to manage documents';

let fake: FakeClient;
let storage: StorageMock;
let activeContext: ActiveBaseballContext | null = null;

function buildStorage(): StorageMock {
  return {
    createSignedUrl: vi.fn(async (path: string, _expiresIn: number) => ({
      data: { signedUrl: `https://signed.example/${path}` },
      error: null,
    })),
    upload: vi.fn(async (_path: string, _file: File) => ({ data: { path: _path }, error: null })),
    remove: vi.fn(async (_paths: string[]) => ({ data: null, error: null })),
  };
}

/**
 * Rebuild the fake client. Always seeds:
 *   - baseball_coaches: CAP_COACH_ID (user CAP_USER_ID) and NOCAP_COACH_ID
 *     (user NOCAP_USER_ID).
 *   - baseball_team_coach_staff: CAP holds can_manage_documents on TEAM_ID
 *     but NOT on OTHER_TEAM_ID; NOCAP holds it on neither — this is what
 *     lets the forging tests prove the gate is checked against the RIGHT
 *     team, not just "any team this coach happens to be capable on".
 * `extraTables` may override/add rows (e.g. seed baseball_documents /
 * baseball_document_versions per test).
 */
function seed(opts: { userId: string | null; extraTables?: Record<string, Row[]> }) {
  storage = buildStorage();
  const tables: Record<string, Row[]> = {
    baseball_coaches: [
      { id: CAP_COACH_ID, user_id: CAP_USER_ID, full_name: 'Cap Coach', email: 'cap@example.com' },
      { id: NOCAP_COACH_ID, user_id: NOCAP_USER_ID, full_name: 'NoCap Coach', email: 'nocap@example.com' },
    ],
    baseball_team_coach_staff: [
      {
        id: 'staff-cap-team1',
        team_id: TEAM_ID,
        coach_id: CAP_COACH_ID,
        is_primary: false,
        is_head_coach: false,
        status: 'active',
        can_manage_documents: true,
      },
      {
        id: 'staff-nocap-team1',
        team_id: TEAM_ID,
        coach_id: NOCAP_COACH_ID,
        is_primary: false,
        is_head_coach: false,
        status: 'active',
        can_manage_documents: false,
      },
      {
        id: 'staff-cap-team2',
        team_id: OTHER_TEAM_ID,
        coach_id: CAP_COACH_ID,
        is_primary: false,
        is_head_coach: false,
        status: 'active',
        can_manage_documents: false,
      },
    ],
    baseball_documents: [],
    baseball_document_versions: [],
    ...opts.extraTables,
  };
  const base = createFakeSupabase({
    user: opts.userId ? { id: opts.userId } : null,
    tables,
  });
  fake = Object.assign(base, { storage: { from: vi.fn(() => storage) } });
}

function setActiveContext(userId: string, coachId: string, teamId: string = TEAM_ID) {
  activeContext = {
    userId,
    activeTeamId: teamId,
    activeRole: 'coach',
    activePlayerId: null,
    activeCoachId: coachId,
    fellBackFromStale: false,
  };
}

function fakeFile(name = 'file.pdf', size = 2048, type = 'application/pdf'): File {
  return { name, size, type } as unknown as File;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

vi.mock('@/lib/baseball/active-context', () => ({
  getActiveBaseballContext: vi.fn(async () => activeContext),
}));

vi.mock('@/lib/demo/baseball-config.server', () => ({
  isCurrentSessionBaseballDemo: vi.fn(async () => false),
  isBaseballDemoCoachEmail: vi.fn(() => false),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerException: vi.fn(async () => undefined),
  logServerError: vi.fn(async () => undefined),
}));

vi.mock('@sentry/nextjs', () => ({
  withScope: (fn: (scope: unknown) => unknown) =>
    fn({ setTag: vi.fn(), setUser: vi.fn(), addBreadcrumb: vi.fn() }),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import {
  uploadBaseballDocument,
  createBaseballDocument,
  updateBaseballDocument,
  deleteBaseballDocument,
  uploadNewVersion,
  revertToVersion,
  getPreviewUrl,
  getVersionHistory,
  getTeamDocuments,
} from '@/app/baseball/actions/documents';

beforeEach(() => {
  seed({ userId: CAP_USER_ID });
  setActiveContext(CAP_USER_ID, CAP_COACH_ID, TEAM_ID);
});

// -----------------------------------------------------------------------------
// 1a/2. uploadBaseballDocument
// -----------------------------------------------------------------------------
describe('uploadBaseballDocument — capability gate', () => {
  it('rejects a capability-less coach and never touches storage', async () => {
    setActiveContext(NOCAP_USER_ID, NOCAP_COACH_ID, TEAM_ID);
    seed({ userId: NOCAP_USER_ID });

    const result = await uploadBaseballDocument(fakeFile(), TEAM_ID);

    expect(result.success).toBe(false);
    expect(result.error).toBe(CAPABILITY_DENIED_RAW);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('succeeds for a coach who holds can_manage_documents', async () => {
    const result = await uploadBaseballDocument(fakeFile(), TEAM_ID);

    expect(result.success).toBe(true);
    expect(storage.upload).toHaveBeenCalledTimes(1);
  });

  it('re-checks capability against an explicit teamId that differs from the active team (forging blocked)', async () => {
    // Cap coach holds can_manage_documents on TEAM_ID (their active team) but
    // NOT on OTHER_TEAM_ID — being capable on your own team must not let you
    // write into a team you were never granted on.
    const result = await uploadBaseballDocument(fakeFile(), OTHER_TEAM_ID);

    expect(result.success).toBe(false);
    expect(result.error).toBe(CAPABILITY_DENIED_RAW);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('signs the SAME storage_path it just uploaded to, at the 3600s TTL', async () => {
    const result = await uploadBaseballDocument(fakeFile('handbook.pdf'), TEAM_ID);

    expect(result.success).toBe(true);
    const uploadCall = storage.upload.mock.calls[0] as [string, File] | undefined;
    expect(uploadCall).toBeDefined();
    const uploadedPath = uploadCall![0];

    expect(storage.createSignedUrl).toHaveBeenCalledWith(uploadedPath, 3600);
    expect(result.storage_path).toBe(uploadedPath);
    expect(result.file_url).toBe(`https://signed.example/${uploadedPath}`);
  });
});

// -----------------------------------------------------------------------------
// createBaseballDocument
// -----------------------------------------------------------------------------
describe('createBaseballDocument — capability gate', () => {
  function payload(teamId: string) {
    return {
      team_id: teamId,
      title: 'Playbook',
      file_url: 'https://signed.example/baseball-documents/x/y.pdf',
      file_type: 'application/pdf',
      file_size: 2048,
      is_player_visible: true,
      uploaded_by: CAP_USER_ID,
    };
  }

  it('rejects a capability-less coach', async () => {
    setActiveContext(NOCAP_USER_ID, NOCAP_COACH_ID, TEAM_ID);
    seed({ userId: NOCAP_USER_ID });

    const result = await createBaseballDocument(payload(TEAM_ID));

    expect(result.success).toBe(false);
    expect(result.error).toBe(CAPABILITY_DENIED_MAPPED);
  });

  it('succeeds for a coach who holds can_manage_documents, and inserts an initial version row', async () => {
    const result = await createBaseballDocument(payload(TEAM_ID));

    expect(result.success).toBe(true);
    expect(result.data?.title).toBe('Playbook');

    const { data: versions } = await fake
      .from('baseball_document_versions')
      .select('*')
      .eq('document_id', result.data!.id);
    const versionRows = versions as Row[];
    expect(versionRows).toHaveLength(1);
    expect(versionRows[0]!.change_notes).toBe('Initial upload');
    expect(versionRows[0]!.version_number).toBe(1);
  });

  it('re-checks capability against an explicit team_id that differs from the active team (forging blocked)', async () => {
    const result = await createBaseballDocument(payload(OTHER_TEAM_ID));

    expect(result.success).toBe(false);
    expect(result.error).toBe(CAPABILITY_DENIED_MAPPED);
  });
});

// -----------------------------------------------------------------------------
// updateBaseballDocument — capability resolved from the EXISTING row
// -----------------------------------------------------------------------------
describe('updateBaseballDocument — capability resolved from the EXISTING row, not caller input', () => {
  it('rejects a capability-less coach', async () => {
    seed({
      userId: NOCAP_USER_ID,
      extraTables: { baseball_documents: [{ id: DOC_ID, team_id: TEAM_ID, title: 'Old' }] },
    });
    setActiveContext(NOCAP_USER_ID, NOCAP_COACH_ID, TEAM_ID);

    const result = await updateBaseballDocument({ id: DOC_ID, title: 'New' });

    expect(result.success).toBe(false);
    expect(result.error).toBe(CAPABILITY_DENIED_MAPPED);
  });

  it("succeeds for a coach who holds can_manage_documents on the document's own team", async () => {
    seed({
      userId: CAP_USER_ID,
      extraTables: { baseball_documents: [{ id: DOC_ID, team_id: TEAM_ID, title: 'Old' }] },
    });
    setActiveContext(CAP_USER_ID, CAP_COACH_ID, TEAM_ID);

    const result = await updateBaseballDocument({ id: DOC_ID, title: 'New' });

    expect(result.success).toBe(true);
    expect(result.data?.title).toBe('New');
  });

  it("rejects a coach capable on their OWN active team when the document actually belongs to a different team", async () => {
    seed({
      userId: CAP_USER_ID,
      extraTables: { baseball_documents: [{ id: DOC_ID, team_id: OTHER_TEAM_ID, title: 'Old' }] },
    });
    // Active team is TEAM_ID (where this coach IS capable) — but the document
    // itself lives in OTHER_TEAM_ID, so the gate must resolve from the row,
    // not the caller's active team.
    setActiveContext(CAP_USER_ID, CAP_COACH_ID, TEAM_ID);

    const result = await updateBaseballDocument({ id: DOC_ID, title: 'New' });

    expect(result.success).toBe(false);
    expect(result.error).toBe(CAPABILITY_DENIED_MAPPED);
  });
});

// -----------------------------------------------------------------------------
// deleteBaseballDocument — capability + precise storage.remove scoping
// -----------------------------------------------------------------------------
describe('deleteBaseballDocument — capability resolved from the EXISTING row', () => {
  it('rejects a capability-less coach and never touches storage', async () => {
    seed({
      userId: NOCAP_USER_ID,
      extraTables: {
        baseball_documents: [{ id: DOC_ID, team_id: TEAM_ID }],
        baseball_document_versions: [{ id: 'v1', document_id: DOC_ID, storage_path: 'doc1/a' }],
      },
    });
    setActiveContext(NOCAP_USER_ID, NOCAP_COACH_ID, TEAM_ID);

    const result = await deleteBaseballDocument(DOC_ID);

    expect(result.success).toBe(false);
    expect(result.error).toBe(CAPABILITY_DENIED_MAPPED);
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("rejects a coach capable on their OWN active team when the document actually belongs to a different team", async () => {
    seed({
      userId: CAP_USER_ID,
      extraTables: { baseball_documents: [{ id: DOC_ID, team_id: OTHER_TEAM_ID }] },
    });
    setActiveContext(CAP_USER_ID, CAP_COACH_ID, TEAM_ID);

    const result = await deleteBaseballDocument(DOC_ID);

    expect(result.success).toBe(false);
    expect(result.error).toBe(CAPABILITY_DENIED_MAPPED);
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("removes exactly this document's version storage_paths, nothing broader", async () => {
    seed({
      userId: CAP_USER_ID,
      extraTables: {
        baseball_documents: [
          { id: 'doc-1', team_id: TEAM_ID },
          { id: 'doc-2', team_id: TEAM_ID },
        ],
        baseball_document_versions: [
          { id: 'd1v1', document_id: 'doc-1', storage_path: 'doc1/a' },
          { id: 'd1v2', document_id: 'doc-1', storage_path: 'doc1/b' },
          { id: 'd2v1', document_id: 'doc-2', storage_path: 'doc2/a' },
        ],
      },
    });
    setActiveContext(CAP_USER_ID, CAP_COACH_ID, TEAM_ID);

    const result = await deleteBaseballDocument('doc-1');

    expect(result.success).toBe(true);
    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(storage.remove).toHaveBeenCalledWith(['doc1/a', 'doc1/b']);

    const { data: remaining } = await fake.from('baseball_documents').select('*').eq('id', 'doc-2');
    expect((remaining as Row[]).length).toBe(1);
  });
});

// -----------------------------------------------------------------------------
// uploadNewVersion — capability resolved from document.team_id, NEVER the
// caller-suppliable teamId argument (that arg only feeds the storage path).
// -----------------------------------------------------------------------------
describe('uploadNewVersion — capability resolved from the real document team, ignoring the passed teamId arg', () => {
  it('rejects a capability-less coach', async () => {
    seed({
      userId: NOCAP_USER_ID,
      extraTables: { baseball_documents: [{ id: DOC_ID, team_id: TEAM_ID, version_count: 1 }] },
    });
    setActiveContext(NOCAP_USER_ID, NOCAP_COACH_ID, TEAM_ID);

    const result = await uploadNewVersion(DOC_ID, fakeFile(), TEAM_ID);

    expect(result.success).toBe(false);
    expect(result.error).toBe(CAPABILITY_DENIED_MAPPED);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('succeeds even when the passed teamId points at a DIFFERENT team the coach lacks capability on — the real gate is document.team_id', async () => {
    seed({
      userId: CAP_USER_ID,
      extraTables: { baseball_documents: [{ id: DOC_ID, team_id: TEAM_ID, version_count: 1 }] },
    });
    setActiveContext(CAP_USER_ID, CAP_COACH_ID, TEAM_ID);

    // The document really lives in TEAM_ID (where this coach IS capable), but
    // the caller passes teamId=OTHER_TEAM_ID (where they are NOT). Since the
    // capability check reads document.team_id, not the teamId argument, this
    // must still succeed.
    const result = await uploadNewVersion(DOC_ID, fakeFile(), OTHER_TEAM_ID);

    expect(result.success).toBe(true);
    expect(result.version?.version_number).toBe(2);
  });

  it("still rejects when the passed teamId points at the coach's OWN capable team but the document really lives elsewhere", async () => {
    seed({
      userId: CAP_USER_ID,
      extraTables: { baseball_documents: [{ id: DOC_ID, team_id: OTHER_TEAM_ID, version_count: 1 }] },
    });
    setActiveContext(CAP_USER_ID, CAP_COACH_ID, TEAM_ID);

    // Attacker passes teamId=TEAM_ID (their own capable team) hoping it is
    // used for the gate — but the document really lives in OTHER_TEAM_ID,
    // where this coach has no capability, so the write must still fail.
    const result = await uploadNewVersion(DOC_ID, fakeFile(), TEAM_ID);

    expect(result.success).toBe(false);
    expect(result.error).toBe(CAPABILITY_DENIED_MAPPED);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('signs the SAME new storage_path it just uploaded to, at the 3600s TTL', async () => {
    seed({
      userId: CAP_USER_ID,
      extraTables: { baseball_documents: [{ id: DOC_ID, team_id: TEAM_ID, version_count: 1 }] },
    });
    setActiveContext(CAP_USER_ID, CAP_COACH_ID, TEAM_ID);

    const result = await uploadNewVersion(DOC_ID, fakeFile('v2.pdf'), TEAM_ID, undefined, 'v2 notes');

    expect(result.success).toBe(true);
    const uploadCall = storage.upload.mock.calls[0] as [string, File] | undefined;
    expect(uploadCall).toBeDefined();
    const uploadedPath = uploadCall![0];

    expect(storage.createSignedUrl).toHaveBeenCalledWith(uploadedPath, 3600);
    expect(result.version?.file_url).toBe(`https://signed.example/${uploadedPath}`);
  });
});

// -----------------------------------------------------------------------------
// revertToVersion — capability resolved from document.team_id (no team_id
// argument exists on this action at all, so there is nothing to forge).
// -----------------------------------------------------------------------------
describe('revertToVersion — capability resolved from the document team', () => {
  function seedRevert(userId: string, docTeamId: string) {
    seed({
      userId,
      extraTables: {
        baseball_documents: [{ id: DOC_ID, team_id: docTeamId, version_count: 2 }],
        baseball_document_versions: [
          {
            id: 'v-old',
            document_id: DOC_ID,
            version_number: 1,
            file_name: 'old.pdf',
            file_size: 111,
            mime_type: 'application/pdf',
            storage_path: 'baseball-documents/team/old.pdf',
          },
        ],
      },
    });
  }

  it('rejects a capability-less coach — surfaces the raw capability error (revertToVersion has no mapDocumentActionError wrapper)', async () => {
    seedRevert(NOCAP_USER_ID, TEAM_ID);

    const result = await revertToVersion(DOC_ID, 'v-old');

    expect(result.success).toBe(false);
    expect(result.error).toBe(CAPABILITY_DENIED_RAW);
  });

  it("succeeds for a coach who holds can_manage_documents on the document's own team", async () => {
    seedRevert(CAP_USER_ID, TEAM_ID);

    const result = await revertToVersion(DOC_ID, 'v-old');

    expect(result.success).toBe(true);
    expect(result.error).toBeNull();
  });

  it('re-signs the ORIGINAL reverted-to storage_path (never re-uploads a new file)', async () => {
    seedRevert(CAP_USER_ID, TEAM_ID);

    const result = await revertToVersion(DOC_ID, 'v-old');

    expect(result.success).toBe(true);
    expect(storage.createSignedUrl).toHaveBeenCalledWith('baseball-documents/team/old.pdf', 3600);
    expect(storage.upload).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// Signed URL call sites on the read paths
// -----------------------------------------------------------------------------
describe('signed URL generation — exact storage_path + 3600s TTL', () => {
  it('getPreviewUrl (no version arg) signs the LATEST version storage_path', async () => {
    seed({
      userId: CAP_USER_ID,
      extraTables: {
        baseball_document_versions: [
          { id: 'v1', document_id: DOC_ID, version_number: 1, storage_path: 'path/v1', mime_type: 'application/pdf' },
          { id: 'v2', document_id: DOC_ID, version_number: 2, storage_path: 'path/v2', mime_type: 'application/pdf' },
        ],
      },
    });

    const result = await getPreviewUrl(DOC_ID);

    expect(result.error).toBeNull();
    expect(storage.createSignedUrl).toHaveBeenCalledWith('path/v2', 3600);
    expect(result.data?.url).toBe('https://signed.example/path/v2');
  });

  it('getPreviewUrl (explicit version arg) signs that EXACT version storage_path', async () => {
    seed({
      userId: CAP_USER_ID,
      extraTables: {
        baseball_document_versions: [
          { id: 'v1', document_id: DOC_ID, version_number: 1, storage_path: 'path/v1', mime_type: 'application/pdf' },
          { id: 'v2', document_id: DOC_ID, version_number: 2, storage_path: 'path/v2', mime_type: 'application/pdf' },
        ],
      },
    });

    const result = await getPreviewUrl(DOC_ID, 1);

    expect(result.error).toBeNull();
    expect(storage.createSignedUrl).toHaveBeenCalledWith('path/v1', 3600);
    expect(result.data?.url).toBe('https://signed.example/path/v1');
  });

  it('getVersionHistory signs every version at the 3600s TTL with its own storage_path', async () => {
    seed({
      userId: CAP_USER_ID,
      extraTables: {
        baseball_document_versions: [
          { id: 'v1', document_id: DOC_ID, version_number: 1, storage_path: 'path/v1' },
          { id: 'v2', document_id: DOC_ID, version_number: 2, storage_path: 'path/v2' },
        ],
      },
    });

    const result = await getVersionHistory(DOC_ID);

    expect(result.success).toBe(true);
    expect(storage.createSignedUrl).toHaveBeenCalledWith('path/v1', 3600);
    expect(storage.createSignedUrl).toHaveBeenCalledWith('path/v2', 3600);
    expect(result.versions).toHaveLength(2);
  });

  it("getTeamDocuments re-signs each document from its LATEST version only", async () => {
    seed({
      userId: CAP_USER_ID,
      extraTables: {
        baseball_documents: [
          { id: 'doc-1', team_id: TEAM_ID, title: 'Doc 1', is_player_visible: true, uploaded_by: CAP_USER_ID },
          { id: 'doc-2', team_id: TEAM_ID, title: 'Doc 2', is_player_visible: true, uploaded_by: CAP_USER_ID },
        ],
        baseball_document_versions: [
          { id: 'd1v1', document_id: 'doc-1', version_number: 1, storage_path: 'doc1/v1' },
          { id: 'd1v2', document_id: 'doc-1', version_number: 2, storage_path: 'doc1/v2' },
          { id: 'd2v1', document_id: 'doc-2', version_number: 1, storage_path: 'doc2/v1' },
        ],
      },
    });

    const result = await getTeamDocuments(TEAM_ID, true);

    expect(result.error).toBeNull();
    expect(storage.createSignedUrl).toHaveBeenCalledWith('doc1/v2', 3600);
    expect(storage.createSignedUrl).toHaveBeenCalledWith('doc2/v1', 3600);
    expect(storage.createSignedUrl).not.toHaveBeenCalledWith('doc1/v1', 3600);
  });
});

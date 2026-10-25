import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * UP-1: a team document's signed direct upload. Only a coach staffed on the team gets a URL, the object path is built on
 * the server inside that team's folder, and an over-size file is refused before anything is signed.
 */

vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/admin/rls-denial', () => ({ maybeCaptureRlsDenial: vi.fn() }));
vi.mock('@/lib/observability/supabase/observe-storage', () => ({ observeStorageResult: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
const access = vi.hoisted(() => ({ coach: true }));
vi.mock('@/lib/golf/resolve-team', () => ({ validateCoachTeamAccess: vi.fn(async () => access.coach) }));
const createClientMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient: () => createClientMock() }));

import { createGolfDocument, prepareGolfDocumentUpload } from '@/app/golf/actions/documents';

const TEAM = '22222222-2222-4222-8222-222222222222';
const MB = 1024 * 1024;

/** Any read resolves to nothing, except the caller's coach row. */
function chain(data: unknown): unknown {
  const self: Record<string, unknown> = {};
  for (const k of ['select', 'eq', 'in', 'is', 'order', 'limit']) self[k] = () => self;
  self.maybeSingle = async () => ({ data, error: null });
  self.single = async () => ({ data, error: null });
  self.then = (ok: (v: unknown) => unknown) => ok({ data: [], error: null });
  return self;
}

function world() {
  const signed: string[] = [];
  createClientMock.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    from: (table: string) => chain(table === 'golf_coaches' ? { id: 'c1', organization_id: 'o1' } : null),
    storage: {
      from: (bucket: string) => {
        expect(bucket).toBe('documents');
        return {
          createSignedUploadUrl: async (path: string) => {
            signed.push(path);
            return { data: { signedUrl: `https://storage.example/upload/sign/documents/${path}?token=t`, token: 't', path }, error: null };
          },
          getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.example/public/documents/${path}` } }),
        };
      },
    },
  });
  return signed;
}

beforeEach(() => {
  access.coach = true;
  createClientMock.mockReset();
});

describe('prepareGolfDocumentUpload (UP-1)', () => {
  it('signs one server-built path in the team’s folder for a 10 MB file, with its type', async () => {
    const signed = world();
    const res = await prepareGolfDocumentUpload(TEAM, { fileName: 'Pairings.PDF', fileType: '', fileSize: 10 * MB });
    expect(res.success).toBe(true);
    expect(signed).toHaveLength(1);
    expect(signed[0]).toMatch(new RegExp(`^golf-documents/${TEAM}/[0-9a-f-]{36}\\.pdf$`));
    expect(res.data).toMatchObject({ storagePath: signed[0], contentType: 'application/pdf' });
    expect(res.data!.fileUrl).toContain(signed[0]);
  });

  it('a caller who does not coach the team gets no URL', async () => {
    access.coach = false;
    const signed = world();
    const res = await prepareGolfDocumentUpload(TEAM, { fileName: 'a.pdf', fileType: 'application/pdf', fileSize: MB });
    expect(res).toMatchObject({ success: false, error: 'Only a coach on this team can upload documents' });
    expect(signed).toEqual([]);
  });

  it('over 25 MB, or empty, is refused before anything is signed', async () => {
    const signed = world();
    expect(await prepareGolfDocumentUpload(TEAM, { fileName: 'a.pdf', fileType: 'application/pdf', fileSize: 25 * MB + 1 })).toMatchObject({ success: false, refused: 'size' });
    expect((await prepareGolfDocumentUpload(TEAM, { fileName: 'a.pdf', fileType: 'application/pdf', fileSize: 0 })).success).toBe(false);
    expect(signed).toEqual([]);
  });

  it('a file name cannot steer the path', async () => {
    const signed = world();
    await prepareGolfDocumentUpload(TEAM, { fileName: 'x.pdf/../../other-team/evil', fileType: 'application/pdf', fileSize: MB });
    expect(signed[0]).toMatch(new RegExp(`^golf-documents/${TEAM}/[0-9a-f-]{36}(\\.[a-z0-9]+)?$`));
  });

  it('a team id that is not a UUID, or a file whose type nothing names, is refused before anything is signed', async () => {
    const signed = world();
    expect((await prepareGolfDocumentUpload(`${TEAM}/../${TEAM}`, { fileName: 'a.pdf', fileType: 'application/pdf', fileSize: MB })).success).toBe(false);
    expect(await prepareGolfDocumentUpload(TEAM, { fileName: 'notes.xyz', fileType: '', fileSize: MB })).toMatchObject({ success: false, refused: 'type' });
    expect(signed).toEqual([]);
  });
});

describe('createGolfDocument: the object it records is in the team’s own folder (UP-1 review)', () => {
  it('refuses a path outside golf-documents/{team}/, or one that climbs out of it, before writing anything', async () => {
    world();
    for (const storage_path of [`golf-documents/33333333-3333-4333-8333-333333333333/x.pdf`, `golf-documents/${TEAM}/../other/x.pdf`, `golf-documents/${TEAM}/a/b.pdf`, `golf-documents/${TEAM}/`]) {
      const res = await createGolfDocument({ team_id: TEAM, title: 'x', file_url: 'https://x', file_type: 'application/pdf', file_size: 1, player_visible: true, storage_path });
      expect(res, storage_path).toEqual({ success: false, error: 'That file isn’t in this team’s documents' });
    }
  });
});

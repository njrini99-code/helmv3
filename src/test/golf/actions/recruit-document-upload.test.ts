import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Recruiting documents, the direct-upload path the Clubhouse page uses (prepare, then complete): what a coach may send,
 * what the server builds itself, and that a repeat with the same upload id never sends or records a file twice.
 */

const logged = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: logged }));
vi.mock('@/lib/admin/rls-denial', () => ({ maybeCaptureRlsDenial: vi.fn() }));
const observe = vi.hoisted(() => vi.fn());
vi.mock('@/lib/observability/supabase/observe-storage', () => ({ observeStorageResult: observe }));

const createClientMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient: () => createClientMock() }));

import { completeRecruitDocumentUpload, prepareRecruitDocumentUpload } from '@/app/golf/actions/recruit-documents';

const MB = 1024 * 1024;
const RECRUIT = '11111111-1111-4111-8111-111111111111';
const TEAM = '22222222-2222-4222-8222-222222222222';
const UPLOAD = '33333333-3333-4333-8333-333333333333';

interface World {
  user?: { id: string } | null;
  recruit?: { id: string; team_id: string } | null;
  /** What Storage lists for the recruit's folder. */
  stored?: Array<{ name: string; metadata?: { size?: number } | null }>;
  listError?: boolean;
  removeError?: { message: string } | null;
  existingDoc?: { id: string } | null;
  insertError?: { code: string; message: string } | null;
  sign?: { signedUrl: string } | null;
}

function world(w: World = {}) {
  const calls = { insert: [] as Record<string, unknown>[], remove: [] as string[][], sign: [] as string[], list: [] as string[] };
  const recruit = w.recruit === undefined ? { id: RECRUIT, team_id: TEAM } : w.recruit;
  createClientMock.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: w.user === undefined ? { id: 'user-1' } : w.user } }) },
    from: (table: string) => {
      if (table === 'golf_recruits') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: recruit, error: null }) }) }) };
      }
      if (table === 'golf_recruit_documents') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: w.existingDoc ?? null, error: null }) }) }) }),
          insert: (row: Record<string, unknown>) => {
            calls.insert.push(row);
            return { select: () => ({ single: async () => (w.insertError ? { data: null, error: w.insertError } : { data: { id: 'doc-1' }, error: null }) }) };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    storage: {
      from: (bucket: string) => {
        expect(bucket).toBe('recruit-documents');
        return {
          list: async (folder: string) => {
            calls.list.push(folder);
            return w.listError ? { data: null, error: { message: 'list failed' } } : { data: w.stored ?? [], error: null };
          },
          createSignedUploadUrl: async (path: string) => {
            calls.sign.push(path);
            const signed = w.sign === undefined ? { signedUrl: `https://storage.example/upload/sign/recruit-documents/${path}?token=t` } : w.sign;
            return signed ? { data: signed, error: null } : { data: null, error: { message: 'cannot sign' } };
          },
          remove: async (paths: string[]) => {
            calls.remove.push(paths);
            return { error: w.removeError ?? null };
          },
        };
      },
    },
  });
  return calls;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('prepareRecruitDocumentUpload', () => {
  const meta = (over: Partial<{ fileName: string; fileSize: number; uploadId: string }> = {}) => ({ fileName: 'Swing, down the line.mov', fileSize: 64 * MB, uploadId: UPLOAD, ...over });

  it('signs an upload to the path the server builds from the recruit\'s own team, with the type from the extension', async () => {
    const calls = world();
    const r = await prepareRecruitDocumentUpload(RECRUIT, meta());
    expect(r.success).toBe(true);
    expect(calls.sign).toEqual([`${TEAM}/${RECRUIT}/${UPLOAD}.mov`]);
    expect(r.data?.contentType).toBe('video/quicktime');
    expect(r.data?.signedUrl).toContain(`${TEAM}/${RECRUIT}/${UPLOAD}.mov`);
  });

  it('takes film (mp4, mov, m4v) up to 100 MB and refuses more, and keeps every other file at 25 MB', async () => {
    world();
    expect((await prepareRecruitDocumentUpload(RECRUIT, meta({ fileName: 'a.mp4', fileSize: 100 * MB }))).success).toBe(true);
    expect((await prepareRecruitDocumentUpload(RECRUIT, meta({ fileName: 'a.m4v', fileSize: 100 * MB }))).data?.contentType).toBe('video/x-m4v');
    const big = await prepareRecruitDocumentUpload(RECRUIT, meta({ fileName: 'a.mov', fileSize: 100 * MB + 1 }));
    expect(big).toMatchObject({ success: false, refused: 'size', error: 'File is too large (max 100 MB)' });
    const pdf = await prepareRecruitDocumentUpload(RECRUIT, meta({ fileName: 'a.pdf', fileSize: 25 * MB + 1 }));
    expect(pdf).toMatchObject({ success: false, refused: 'size', error: 'File is too large (max 25 MB)' });
    expect((await prepareRecruitDocumentUpload(RECRUIT, meta({ fileName: 'a.pdf', fileSize: 25 * MB }))).success).toBe(true);
  });

  it('refuses a type the bucket does not take, including names that are only object properties, before it reads anything', async () => {
    const calls = world();
    for (const fileName of ['virus.exe', 'noextension', 'a.constructor', 'a.__proto__', 'clip.avi']) {
      const r = await prepareRecruitDocumentUpload(RECRUIT, meta({ fileName }));
      expect(r, fileName).toMatchObject({ success: false, refused: 'type', error: 'Unsupported file type' });
    }
    expect(calls.sign).toEqual([]);
    expect(calls.list).toEqual([]);
  });

  it('needs an upload id that is a UUID, a file with bytes, a signed-in coach and a recruit the coach can read', async () => {
    world();
    expect((await prepareRecruitDocumentUpload(RECRUIT, meta({ uploadId: '../../etc' }))).error).toBe('Upload id required');
    expect((await prepareRecruitDocumentUpload(RECRUIT, meta({ fileSize: 0 }))).error).toBe('Choose a file to upload');
    world({ user: null });
    expect((await prepareRecruitDocumentUpload(RECRUIT, meta())).error).toBe('Not authenticated');
    const calls = world({ recruit: null });
    expect((await prepareRecruitDocumentUpload(RECRUIT, meta())).error).toBe('Recruit not found');
    expect(calls.sign).toEqual([]);
  });

  it('a repeat finds the object already stored and sends no second transfer', async () => {
    const calls = world({ stored: [{ name: `${UPLOAD}.mov` }] });
    const r = await prepareRecruitDocumentUpload(RECRUIT, meta());
    expect(r).toMatchObject({ success: true, data: { contentType: 'video/quicktime', signedUrl: null } });
    expect(calls.sign).toEqual([]);
  });

  it('a listing that fails is not read as "not there": it signs, and Storage refuses a true duplicate', async () => {
    const calls = world({ listError: true });
    const r = await prepareRecruitDocumentUpload(RECRUIT, meta());
    expect(r.success).toBe(true);
    expect(calls.sign).toHaveLength(1);
  });

  it('says so when it cannot sign, without a stack or a code, and records the failed Storage call', async () => {
    world({ sign: null });
    expect(await prepareRecruitDocumentUpload(RECRUIT, meta())).toEqual({ success: false, error: "Couldn't start the upload. Try again." });
    expect(observe).toHaveBeenCalledWith(expect.objectContaining({ action: 'sign_recruit_document_upload', operation: 'upload', error: { message: 'cannot sign' } }));
  });
});

describe('completeRecruitDocumentUpload', () => {
  const meta = (over: Partial<{ uploadId: string; fileName: string; title: string; category: string }> = {}) => ({ uploadId: UPLOAD, fileName: 'Swing, down the line.mov', title: 'Swing, down the line', category: 'film', ...over });
  const there = (size = 64 * MB) => [{ name: `${UPLOAD}.mov`, metadata: { size } }];

  it('records the file with the path built here and the size Storage holds, never one from the browser', async () => {
    const calls = world({ stored: there(48_000_000) });
    const r = await completeRecruitDocumentUpload(RECRUIT, meta());
    expect(r).toEqual({ success: true, data: { id: 'doc-1' } });
    expect(calls.insert).toEqual([
      expect.objectContaining({
        recruit_id: RECRUIT,
        team_id: TEAM,
        storage_path: `${TEAM}/${RECRUIT}/${UPLOAD}.mov`,
        file_type: 'video/quicktime',
        file_size: 48_000_000,
        category: 'film',
        file_name: 'Swing, down the line.mov',
        uploaded_by: 'user-1',
      }),
    ]);
  });

  it('a repeat returns the document its first attempt recorded and inserts nothing', async () => {
    const calls = world({ stored: there(), existingDoc: { id: 'doc-first' } });
    expect(await completeRecruitDocumentUpload(RECRUIT, meta())).toEqual({ success: true, data: { id: 'doc-first' } });
    expect(calls.insert).toEqual([]);
  });

  it('refuses when the file never reached Storage, and when Storage cannot be read', async () => {
    const calls = world({ stored: [] });
    expect(await completeRecruitDocumentUpload(RECRUIT, meta())).toEqual({ success: false, error: 'The file did not reach storage. Try again.' });
    expect(calls.insert).toEqual([]);
    world({ listError: true });
    expect((await completeRecruitDocumentUpload(RECRUIT, meta())).error).toBe("Couldn't check the file. Try again.");
    expect(observe).toHaveBeenCalledWith(expect.objectContaining({ action: 'list_recruit_document_object', error: { message: 'list failed' } }));
  });

  it('takes out, and refuses, an object larger than its type may be', async () => {
    const calls = world({ stored: [{ name: `${UPLOAD}.pdf`, metadata: { size: 30 * MB } }] });
    const r = await completeRecruitDocumentUpload(RECRUIT, meta({ fileName: 'Season.pdf' }));
    expect(r).toMatchObject({ success: false, refused: 'size' });
    expect(calls.remove).toEqual([[`${TEAM}/${RECRUIT}/${UPLOAD}.pdf`]]);
    expect(calls.insert).toEqual([]);
  });

  it('an over-size object that cannot be taken out is recorded, and the refusal still stands', async () => {
    world({ stored: [{ name: `${UPLOAD}.pdf`, metadata: { size: 30 * MB } }], removeError: { message: 'remove denied' } });
    const r = await completeRecruitDocumentUpload(RECRUIT, meta({ fileName: 'Season.pdf' }));
    expect(r).toMatchObject({ success: false, refused: 'size' });
    expect(observe).toHaveBeenCalledWith(expect.objectContaining({ action: 'complete_recruit_document_upload_oversize_remove', operation: 'delete', error: { message: 'remove denied' } }));
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('oversize remove failed'), expect.objectContaining({ action: 'recruit_documents.completeRecruitDocumentUpload' }));
  });

  it('keeps the object when the row fails to save, so a Retry records it without sending the file again', async () => {
    const calls = world({ stored: there(), insertError: { code: '57014', message: 'timeout' } });
    expect(await completeRecruitDocumentUpload(RECRUIT, meta())).toEqual({ success: false, error: 'Failed to save document' });
    expect(calls.remove).toEqual([]);
  });

  it('says it is for the team\'s coaches when the row is refused by policy', async () => {
    world({ stored: there(), insertError: { code: '42501', message: 'new row violates row-level security policy' } });
    expect((await completeRecruitDocumentUpload(RECRUIT, meta())).error).toBe("Only this team's coaches can add recruit documents");
  });

  it('refuses a type the bucket does not take and an upload id that is not a UUID', async () => {
    world({ stored: there() });
    expect(await completeRecruitDocumentUpload(RECRUIT, meta({ fileName: 'a.exe' }))).toMatchObject({ success: false, refused: 'type' });
    expect((await completeRecruitDocumentUpload(RECRUIT, meta({ uploadId: 'x/../y' }))).error).toBe('Upload id required');
  });

  it('files an unknown category as other and a missing title under the file name', async () => {
    const calls = world({ stored: there() });
    await completeRecruitDocumentUpload(RECRUIT, meta({ category: 'bogus', title: '  ' }));
    expect(calls.insert[0]).toMatchObject({ category: 'other', title: 'Swing, down the line.mov' });
  });
});

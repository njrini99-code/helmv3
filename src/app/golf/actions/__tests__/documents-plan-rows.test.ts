// =============================================================================
// The N-10 reader shim (HELD.md, 20261026010400_golf_documents_practice_plan).
//
// N-00 files every published practice plan in golf_documents as a row with no
// file: practice_plan_id set, file_url NULL. Applied before the readers know
// that, the first published plan would show in Documents as a broken file, be
// offered by the event attachment picker, and make the signed-URL helper
// throw. So every reader that lists, attaches, opens or signs FILES leaves a
// row with no file out, or refuses it without throwing; only Team Hub, which
// draws plans in their folders, asks for plan rows.
//
// The golf_documents stub here really filters (eq, in, and `not file_url is
// null`), so a reader that forgets the filter returns the plan row and fails.
// =============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getUserMock, fromMock, createSignedUrlMock, logServerErrorMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  fromMock: vi.fn(),
  createSignedUrlMock: vi.fn(),
  logServerErrorMock: vi.fn(async () => {}),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
    storage: { from: () => ({ createSignedUrl: createSignedUrlMock }) },
  })),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: logServerErrorMock, logServerEvent: vi.fn(async () => {}) }));
vi.mock('@/lib/golf/resolve-team', () => ({ validateCoachTeamAccess: vi.fn(async () => true) }));

import { getDocument, getDocuments, getPreviewUrl } from '@/app/golf/actions/documents';
import { attachDocumentToEvent, getEventDocuments } from '@/app/golf/actions/event-documents';

const TEAM = '2acc63ce-1c29-5c57-b75b-93427a35720e';
const EVENT = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const FILE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PLAN_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

type Row = Record<string, unknown>;
const fileDoc: Row = {
  id: FILE_ID,
  team_id: TEAM,
  title: 'Travel packet',
  is_public: true,
  file_url: `https://x.supabase.co/storage/v1/object/public/documents/golf-documents/${TEAM}/packet.pdf`,
  file_type: 'application/pdf',
  file_size: 1024,
  practice_plan_id: null,
  uploaded_by: null,
  updated_at: '2026-11-10T12:00:00Z',
};
// A published practice plan as 010400 files it: a plan id, no file.
const planDoc: Row = { ...fileDoc, id: PLAN_ID, title: 'Tuesday short game', file_url: null, file_type: null, file_size: null, practice_plan_id: 'plan-1' };

let documentCalls: Array<{ method: string; args: unknown[] }>;
let inserted: string[];

/** A golf_documents read that filters as PostgREST would: eq, in, and not(col, 'is', null). */
function documentsQuery() {
  let rows = [fileDoc, planDoc];
  const q: Record<string, unknown> = {};
  const log = (method: string, args: unknown[]) => documentCalls.push({ method, args });
  q.select = (...a: unknown[]) => (log('select', a), q);
  q.eq = (c: string, v: unknown) => (log('eq', [c, v]), (rows = rows.filter((r) => r[c] === v)), q);
  q.in = (c: string, vs: unknown[]) => (log('in', [c, vs]), (rows = rows.filter((r) => vs.includes(r[c]))), q);
  q.not = (c: string, op: string, v: unknown) => (log('not', [c, op, v]), (rows = op === 'is' && v === null ? rows.filter((r) => r[c] != null) : rows), q);
  for (const m of ['order', 'limit']) q[m] = (...a: unknown[]) => (log(m, a), q);
  q.single = async () => (rows[0] ? { data: rows[0], error: null } : { data: null, error: { message: 'no rows', code: 'PGRST116' } });
  q.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
  q.then = (ok: (r: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok, bad);
  return q;
}

/** Any other table: every filter returns the chain, and the chain answers `result`. */
function stub(result: { data: unknown; error: unknown }, onInsert?: () => void) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'not', 'order', 'limit']) q[m] = () => q;
  q.single = async () => result;
  q.maybeSingle = async () => result;
  q.insert = () => (onInsert?.(), q);
  q.upsert = () => (onInsert?.(), q);
  q.then = (ok: (r: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(result).then(ok, bad);
  return q;
}

beforeEach(() => {
  vi.clearAllMocks();
  documentCalls = [];
  inserted = [];
  getUserMock.mockResolvedValue({ data: { user: { id: 'user-coach' } }, error: null });
  createSignedUrlMock.mockResolvedValue({ data: { signedUrl: 'https://signed.example/packet.pdf' }, error: null });
  fromMock.mockImplementation((table: string) => {
    switch (table) {
      case 'golf_documents':
        return documentsQuery();
      case 'golf_coaches':
        return stub({ data: { id: 'coach-1', organization_id: 'org-1' }, error: null });
      case 'golf_document_versions':
        // Neither row has a version row: a plan never does, and the file is a legacy upload signed from its file_url.
        return stub({ data: null, error: null });
      case 'golf_events':
        return stub({ data: { team_id: TEAM }, error: null });
      case 'golf_event_documents':
        return stub(
          { data: [{ attached_at: '2026-11-10T12:00:00Z', note: null, document: fileDoc }, { attached_at: '2026-11-10T12:01:00Z', note: null, document: planDoc }], error: null },
          () => inserted.push('golf_event_documents'),
        );
      default:
        return stub({ data: null, error: null });
    }
  });
});

describe('Documents listings leave a practice-plan row (no file) out', () => {
  it('getDocuments lists files only, by asking the server for rows with a file', async () => {
    const res = await getDocuments(TEAM);
    expect(res.error).toBeNull();
    expect(res.data?.map((d) => d.id)).toEqual([FILE_ID]);
    expect(documentCalls).toContainEqual({ method: 'not', args: ['file_url', 'is', null] });
  });

  it('Team Hub, which draws plans in their folders, asks for plan rows and gets them', async () => {
    const res = await getDocuments(TEAM, { plans: true });
    expect(res.data?.map((d) => d.id).sort()).toEqual([FILE_ID, PLAN_ID].sort());
    expect(documentCalls.some((c) => c.method === 'not')).toBe(false);
  });
});

describe('The event attachment picker and an event’s files leave a plan row out', () => {
  it('an event’s attachments list the file and not the plan', async () => {
    const res = await getEventDocuments(EVENT);
    expect(res.success).toBe(true);
    expect(res.success && res.data.map((r) => r.document.id)).toEqual([FILE_ID]);
  });

  it('attaching a plan row is refused with the reason, before anything is written', async () => {
    const res = await attachDocumentToEvent(EVENT, PLAN_ID);
    expect(res).toEqual({ success: false, error: 'A practice plan isn’t a file, so it can’t be attached to an event.' });
    expect(inserted).toEqual([]);
  });
});

describe('The signed-URL helper refuses a plan row cleanly', () => {
  it('returns the empty state for a plan row, latest or a numbered version: no signing, no throw, nothing logged', async () => {
    await expect(getPreviewUrl(PLAN_ID)).resolves.toEqual({ data: null, error: null, noContent: true });
    await expect(getPreviewUrl(PLAN_ID, 2)).resolves.toEqual({ data: null, error: null, noContent: true });
    expect(createSignedUrlMock).not.toHaveBeenCalled();
    expect(logServerErrorMock).not.toHaveBeenCalled();
  });

  it('still signs a real file (the legacy path from its file_url)', async () => {
    const res = await getPreviewUrl(FILE_ID);
    expect(res.data?.url).toBe('https://signed.example/packet.pdf');
    expect(createSignedUrlMock).toHaveBeenCalledWith(`golf-documents/${TEAM}/packet.pdf`, 3600);
  });

  it('getDocument says a plan row is a plan, not a file, without throwing', async () => {
    await expect(getDocument(PLAN_ID)).resolves.toEqual({ data: null, error: 'This is a practice plan, not a file. Open it from Practice plans.' });
  });
});

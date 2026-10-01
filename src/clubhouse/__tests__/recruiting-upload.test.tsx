import { LazyMotion, domAnimation } from 'framer-motion';
import { readFileSync } from 'node:fs';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Recruiting (P014): film and file drop for a prospect's documents, the direct transfer to Storage, and an Add that cannot
 * add a prospect twice. Every numbered state is in docs/clubhouse/catalog/recruiting.md, found by its number.
 */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
const report = vi.hoisted(() => vi.fn());
vi.mock('../lib/track', () => ({ chReport: report, chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard/recruiting' }));
const actions = vi.hoisted(() => ({
  createRecruit: vi.fn(),
  prepare: vi.fn(),
  complete: vi.fn(),
}));
vi.mock('@/app/golf/actions/recruiting', () => ({
  createRecruit: actions.createRecruit,
  updateRecruit: vi.fn(),
  deleteRecruit: vi.fn(),
  getRecruits: vi.fn(),
}));
vi.mock('@/app/golf/actions/recruit-documents', () => ({
  getRecruitDocuments: vi.fn(),
  uploadRecruitDocument: vi.fn(),
  deleteRecruitDocument: vi.fn(),
  getRecruitDocumentUrl: vi.fn(),
  prepareRecruitDocumentUpload: actions.prepare,
  completeRecruitDocumentUpload: actions.complete,
}));
vi.mock('@/lib/utils/capacitor', () => ({ isNativeApp: () => false, openExternalUrl: vi.fn() }));

import { DOC_ACCEPT, MAX_FILM_BYTES, refusedProblem, screenDrop, screenFile, type ChDocument, type ChRecruiting } from '../data/recruiting-shape';
import { RECRUIT_DOC_MIME_BY_EXT, RECRUIT_FILM_EXTENSIONS, RECRUIT_FILM_MAX_BYTES } from '@/app/golf/actions/recruit-documents-limits';
import { RecruitingView, type RecInitial } from '../screens/recruiting/RecruitingView';
import { createLiveRecruitingWrites, type ChRecruitingWrites } from '../screens/recruiting/writes';
import { putWithProgress, uploadRecruitFile, type ChUploadIo } from '../screens/recruiting/upload';
import { ClubhouseMarker } from '../shell/context';
import { PhoneChromeProvider, usePhoneChromeState } from '../shell/phone-chrome';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';
import { PREVIEW_DOCUMENTS, PREVIEW_RECRUITING } from '../preview/fixtures-recruiting';

const MB = 1024 * 1024;
const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
async function expectCode(c: string, text?: RegExp) {
  await waitFor(() => expect(code(c)).not.toBeNull());
  if (text) expect(code(c)!.textContent).toMatch(text);
}
const dlg = () => document.querySelector('dialog[open]') as HTMLElement;
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const ok = <T,>(data?: T) => Promise.resolve({ success: true as const, data });
const fail = (error = 'nope') => Promise.resolve({ success: false as const, error });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type UploadResult = { success: boolean; data?: { id: string }; error?: string; refused?: 'size' | 'type' };
function fakeWrites() {
  return {
    create: vi.fn((): Promise<{ success: boolean; data?: { id: string }; error?: string }> => ok({ id: 'new-1' })),
    update: vi.fn((): Promise<{ success: boolean; error?: string }> => ok()),
    remove: vi.fn((): Promise<{ success: boolean; error?: string }> => ok()),
    documents: {
      list: vi.fn((id: string): Promise<{ success: boolean; data?: ChDocument[]; error?: string }> => ok((PREVIEW_DOCUMENTS[id] ?? []).map((d) => ({ ...d })))),
      upload: vi.fn((): Promise<UploadResult> => ok({ id: 'd-new' })),
      remove: vi.fn((): Promise<{ success: boolean; error?: string }> => ok()),
      open: vi.fn((): Promise<{ success: boolean; error?: string }> => ok()),
    },
  };
}
type Fake = ReturnType<typeof fakeWrites>;

const tree = (data: ChRecruiting, w: Fake, initial?: RecInitial) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <PhoneChromeProvider>
        {/* eslint-disable-next-line jsx-a11y/aria-role -- role is a component prop, not an ARIA role */}
        <ClubhouseMarker role="coach">
          <div className="ch-root" data-ui="clubhouse">
            <SlotHost />
            <RecruitingView data={data} writes={w as unknown as ChRecruitingWrites} initial={initial} />
          </div>
        </ClubhouseMarker>
      </PhoneChromeProvider>
    </ToastProvider>
  </LazyMotion>
);
function SlotHost() {
  const { setSlot } = usePhoneChromeState();
  return <div ref={setSlot} data-testid="phone-top" />;
}
function wrap(w: Fake = fakeWrites(), initial: RecInitial = {}) {
  return { w, ...render(tree(PREVIEW_RECRUITING, w, initial)) };
}
const panel = (name: string) => screen.getByRole('complementary', { name });
const section = () => screen.getByRole('region', { name: 'Documents' });
const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;

/** What a browser hands a drop handler: the files, the items (for folders), and the kinds of thing dragged. */
function drag(files: File[], opts: { folder?: boolean; types?: string[] } = {}) {
  return {
    dataTransfer: {
      types: opts.types ?? ['Files'],
      files,
      items: files.map(() => ({ kind: 'file', webkitGetAsEntry: () => ({ isDirectory: !!opts.folder }) })),
      dropEffect: 'none',
    },
  };
}
const film = (name = 'Swing, down the line.mov', size = 64 * MB) => {
  const f = new File(['x'], name, { type: 'video/quicktime' });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};
const pdf = (name = 'Spring transcript.pdf') => new File(['%PDF'], name, { type: 'application/pdf' });

beforeEach(() => {
  hapticSpy.mockClear();
  report.mockClear();
  router.refresh.mockClear();
  for (const f of Object.values(actions)) f.mockReset();
  localStorage.clear();
});

// ── The rules ────────────────────────────────────────────────────────────────

describe('Recruiting · film and file drop · the rules', () => {
  it('CH-14105 CH-14106 the picker offers film, and the page takes MP4, MOV and M4V to 100 MB and everything else to 25 MB', () => {
    expect(DOC_ACCEPT.split(',')).toEqual(expect.arrayContaining(['.mp4', '.mov', '.m4v', '.pdf']));
    // By type as well as by extension: on an iPhone a video type is what makes the picker offer the Photo Library.
    expect(DOC_ACCEPT.split(',')).toEqual(expect.arrayContaining(['video/mp4', 'video/quicktime', 'video/x-m4v']));
    expect(MAX_FILM_BYTES).toBe(100 * MB);
    expect(screenFile({ name: 'a.m4v', size: 100 * MB })).toBeNull();
    expect(screenFile({ name: 'a.mov', size: 100 * MB + 1 })?.title).toBe('That film is over 100 MB');
    expect(screenFile({ name: 'a.webm', size: 1 })?.code).toBe('CH-14106');
  });

  it('CH-14107 CH-14108 a file Storage refused after the page let it through is named, never called a failure, and promises no limit it cannot know', () => {
    const f = { name: 'Swing.mov', size: 64 * MB };
    expect(refusedProblem('type', f)).toMatchObject({ code: 'CH-14107', title: "Storage won't take that file type" });
    expect(refusedProblem('type', f).body).toBe('Swing.mov was refused, so nothing was added. Try another file, or keep a link to it in the notes.');
    expect(refusedProblem('size', f)).toMatchObject({ code: 'CH-14108', title: "Storage won't take a file this large" });
    expect(refusedProblem('size', f).body).toBe('Swing.mov (64.0 MB) was refused, so nothing was added. Try a smaller file, or keep a link to it in the notes.');
    expect(refusedProblem('size', f).body).not.toMatch(/\b\d+ MB limit|max\b/);
  });

  it('CH-14109 CH-14110 a drop is one file: several are refused, and so are a folder and an empty file', () => {
    const one = { name: 'a.pdf', size: 10 };
    expect(screenDrop({ count: 1, folder: false, file: one })).toBeNull();
    expect(screenDrop({ count: 2, folder: false, file: one })?.code).toBe('CH-14109');
    expect(screenDrop({ count: 1, folder: true, file: one })?.code).toBe('CH-14110');
    expect(screenDrop({ count: 2, folder: true, file: one })?.code).toBe('CH-14110');
    expect(screenDrop({ count: 1, folder: false, file: { name: 'a.pdf', size: 0 } })?.code).toBe('CH-14110');
    expect(screenDrop({ count: 0, folder: false, file: null })?.code).toBe('CH-14110');
  });

  it('the page refuses with the numbers the migration sets on the bucket: the same size cap, and only types the bucket takes', () => {
    const sql = readFileSync('supabase/migrations/20260930140000_recruit_documents_film.sql', 'utf8');
    expect(sql).toContain(`file_size_limit = ${RECRUIT_FILM_MAX_BYTES}`);
    const original = readFileSync('supabase/migrations/20260614020000_recruit_documents.sql', 'utf8');
    const allowed = new Set([...(/allowed_mime_types\)[\s\S]*?array\[([\s\S]*?)\]/i.exec(original)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]));
    for (const ext of RECRUIT_FILM_EXTENSIONS) {
      const mime = RECRUIT_DOC_MIME_BY_EXT[ext]!;
      expect(sql, ext).toContain(`'${mime}'`);
      allowed.add(mime);
    }
    for (const [ext, mime] of Object.entries(RECRUIT_DOC_MIME_BY_EXT)) expect(allowed.has(mime), `${ext} ${mime}`).toBe(true);
  });
});

// ── The transfer ─────────────────────────────────────────────────────────────

describe('Recruiting · film and file drop · the transfer to Storage', () => {
  const UPLOAD = '33333333-3333-4333-8333-333333333333';
  const io = (over: Partial<{ signedUrl: string | null; put: { status: number; body: string }; prepare: object; complete: object }> = {}) => {
    const log: string[] = [];
    const fake = {
      prepare: vi.fn(async () => {
        log.push('prepare');
        return (over.prepare ?? { success: true, data: { contentType: 'video/quicktime', signedUrl: over.signedUrl === undefined ? 'https://storage.example/sign?token=t' : over.signedUrl } }) as never;
      }),
      put: vi.fn(async (_url: string, _file: File, _type: string, onProgress?: (p: number) => void) => {
        log.push('put');
        onProgress?.(40);
        return over.put ?? { status: 200, body: '' };
      }),
      complete: vi.fn(async () => {
        log.push('complete');
        return (over.complete ?? { success: true, data: { id: 'doc-1' } }) as never;
      }),
    };
    return { fake, log, io: fake as unknown as ChUploadIo };
  };
  const meta = { title: 'Swing', category: 'film' as const };

  it('CH-14404 CH-14407 it asks the server to prepare, sends the file on the signed URL with the type the server chose, then records it, reporting progress to 100', async () => {
    const { fake, log, io: i } = io();
    const progress: number[] = [];
    const file = film();
    const r = await uploadRecruitFile(i, 'p-mason', file, meta, { uploadId: UPLOAD, onProgress: (p) => progress.push(p) });
    expect(r).toEqual({ success: true, data: { id: 'doc-1' } });
    expect(log).toEqual(['prepare', 'put', 'complete']);
    expect(fake.prepare).toHaveBeenCalledWith('p-mason', { fileName: file.name, fileSize: 64 * MB, uploadId: UPLOAD });
    expect(fake.put).toHaveBeenCalledWith('https://storage.example/sign?token=t', file, 'video/quicktime', expect.any(Function));
    expect(fake.complete).toHaveBeenCalledWith('p-mason', { uploadId: UPLOAD, fileName: file.name, title: 'Swing', category: 'film' });
    expect(progress).toEqual([40, 100]);
  });

  it('CH-14916 a file Storage already holds (an earlier attempt landed) is not sent again: it goes straight to being recorded', async () => {
    const { fake, log, io: i } = io({ signedUrl: null });
    expect((await uploadRecruitFile(i, 'p-mason', film(), meta, { uploadId: UPLOAD })).success).toBe(true);
    expect(log).toEqual(['prepare', 'complete']);
    expect(fake.put).not.toHaveBeenCalled();
    // Storage answering 409 to a second transfer means the same thing.
    const dup = io({ put: { status: 409, body: '{"error":"Duplicate"}' } });
    expect((await uploadRecruitFile(dup.io, 'p-mason', film(), meta, { uploadId: UPLOAD })).success).toBe(true);
    expect(dup.log).toEqual(['prepare', 'put', 'complete']);
  });

  it('CH-14916 without an upload id it makes one, and every step of one attempt carries the same', async () => {
    const { fake, io: i } = io();
    await uploadRecruitFile(i, 'p-mason', film(), meta);
    const id = (fake.prepare.mock.calls[0] as unknown as [string, { uploadId: string }])[1].uploadId;
    expect(id).toMatch(UUID);
    expect((fake.complete.mock.calls[0] as unknown as [string, { uploadId: string }])[1].uploadId).toBe(id);
  });

  it('CH-14108 Storage answering 413 is a refusal of the size, and nothing is recorded', async () => {
    const { fake, io: i } = io({ put: { status: 413, body: '{"statusCode":"413","error":"Payload too large"}' } });
    const r = await uploadRecruitFile(i, 'p-mason', film('Swing.mov'), meta);
    expect(r).toMatchObject({ success: false, refused: 'size', error: 'Storage refused Swing.mov: it is over the size it takes.' });
    expect(fake.complete).not.toHaveBeenCalled();
  });

  it('CH-14107 Storage answering 415, or naming the mime type, is a refusal of the type', async () => {
    const bodies = [
      { status: 415, body: '' },
      { status: 400, body: '{"error":"invalid_mime_type","message":"mime type video/quicktime is not supported"}' },
      { status: 400, body: '{"statusCode":"415","error":"invalid_mime_type","message":"mime type video/quicktime is not supported"}' },
      { status: 400, body: '{"statusCode":415,"error":"Unsupported Media Type"}' },
    ];
    for (const put of bodies) {
      const r = await uploadRecruitFile(io({ put }).io, 'p-mason', film('Swing.mov'), meta);
      expect(r, JSON.stringify(put)).toMatchObject({ success: false, refused: 'type' });
    }
  });

  it('CH-14108 a size refusal that arrives as a 400 with the real code only in the body is still a refusal of the size', async () => {
    const bodies = [
      '{"statusCode":"413","error":"Payload too large","message":"The object exceeded the maximum allowed size"}',
      '{"statusCode":413,"error":"EntityTooLarge"}',
      '{"message":"The object exceeded the maximum allowed size"}',
    ];
    for (const body of bodies) {
      const r = await uploadRecruitFile(io({ put: { status: 400, body } }).io, 'p-mason', film('Swing.mov'), meta);
      expect(r, body).toMatchObject({ success: false, refused: 'size', error: 'Storage refused Swing.mov: it is over the size it takes.' });
    }
    // A 400 that says neither is not called a refusal of the file.
    const other = await uploadRecruitFile(io({ put: { status: 400, body: '{"error":"InvalidRequest"}' } }).io, 'p-mason', film('Swing.mov'), meta);
    expect(other).not.toHaveProperty('refused');
  });

  it('CH-14903 a refusal by policy says it is for the team\'s coaches; a dropped connection says the file did not finish sending, and neither is a refusal of the file', async () => {
    const policy = await uploadRecruitFile(io({ put: { status: 403, body: '' } }).io, 'p-mason', film(), meta);
    expect(policy).toEqual({ success: false, error: "Only this team's coaches can add recruit documents" });
    const lost = await uploadRecruitFile(io({ put: { status: 0, body: '' } }).io, 'p-mason', film(), meta);
    expect(lost).toEqual({ success: false, error: "The file didn't finish sending. Check your connection and try again." });
    const server = await uploadRecruitFile(io({ put: { status: 503, body: '' } }).io, 'p-mason', film(), meta);
    expect(server.success).toBe(false);
    expect(server).not.toHaveProperty('refused');
  });

  it('what the server refuses in prepare or complete comes back with its reason and the kind of refusal', async () => {
    const tooBig = io({ prepare: { success: false, refused: 'size', error: 'File is too large (max 100 MB)' } });
    expect(await uploadRecruitFile(tooBig.io, 'p-mason', film(), meta)).toEqual({ success: false, refused: 'size', error: 'File is too large (max 100 MB)' });
    expect(tooBig.fake.put).not.toHaveBeenCalled();
    const saveFailed = io({ complete: { success: false, error: 'Failed to save document' } });
    expect(await uploadRecruitFile(saveFailed.io, 'p-mason', film(), meta)).toEqual({ success: false, error: 'Failed to save document', refused: undefined });
  });

  describe('the request itself', () => {
    const real = globalThis.XMLHttpRequest;
    class FakeXhr {
      static last: FakeXhr;
      headers: Record<string, string> = {};
      upload: { onprogress: ((e: Partial<ProgressEvent>) => void) | null } = { onprogress: null };
      status = 200;
      responseText = '';
      method = '';
      url = '';
      body: unknown;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      ontimeout: (() => void) | null = null;
      onabort: (() => void) | null = null;
      constructor() {
        FakeXhr.last = this;
      }
      open(method: string, url: string) {
        this.method = method;
        this.url = url;
      }
      setRequestHeader(k: string, v: string) {
        this.headers[k] = v;
      }
      send(body: unknown) {
        this.body = body;
      }
    }
    beforeEach(() => {
      globalThis.XMLHttpRequest = FakeXhr as never;
    });
    afterEach(() => {
      globalThis.XMLHttpRequest = real;
    });

    it('CH-14407 PUTs the file with the chosen type and no credentials, and reports bytes that have really left, never 100 until Storage has answered', async () => {
      const seen: number[] = [];
      const file = film();
      const done = putWithProgress('https://storage.example/sign?token=t', file, 'video/quicktime', (p) => seen.push(p));
      const x = FakeXhr.last;
      expect(x.method).toBe('PUT');
      expect(x.url).toBe('https://storage.example/sign?token=t');
      expect(x.headers).toEqual({ 'content-type': 'video/quicktime', 'cache-control': 'max-age=3600', 'x-upsert': 'false' });
      expect(x.body).toBe(file);
      x.upload.onprogress!({ lengthComputable: true, loaded: 25, total: 100 });
      x.upload.onprogress!({ lengthComputable: true, loaded: 100, total: 100 });
      x.upload.onprogress!({ lengthComputable: false, loaded: 50, total: 0 });
      x.status = 413;
      x.responseText = 'too big';
      x.onload!();
      expect(await done).toEqual({ status: 413, body: 'too big' });
      expect(seen).toEqual([25, 99]);
    });

    it('a dropped connection, a timeout and an abort all answer status 0', async () => {
      for (const fire of ['onerror', 'ontimeout', 'onabort'] as const) {
        const done = putWithProgress('https://storage.example/x', film(), 'video/mp4');
        FakeXhr.last[fire]!();
        expect(await done, fire).toEqual({ status: 0, body: '' });
      }
    });
  });

  it('the live writes send an Add\'s request id to createRecruit, leave the current page\'s call as it was, and run an upload as prepare then complete', async () => {
    const w = createLiveRecruitingWrites();
    actions.createRecruit.mockResolvedValue({ success: true, data: { id: 'x' } });
    await w.create({ first_name: 'Ellie' }, UPLOAD);
    expect(actions.createRecruit).toHaveBeenLastCalledWith({ first_name: 'Ellie' }, { requestId: UPLOAD });
    await w.create({ first_name: 'Ellie' });
    expect(actions.createRecruit).toHaveBeenLastCalledWith({ first_name: 'Ellie' }, undefined);

    actions.prepare.mockResolvedValue({ success: true, data: { contentType: 'video/quicktime', signedUrl: null } });
    actions.complete.mockResolvedValue({ success: true, data: { id: 'doc-9' } });
    const file = film();
    expect(await w.documents.upload('p-mason', file, meta, { uploadId: UPLOAD })).toEqual({ success: true, data: { id: 'doc-9' } });
    expect(actions.prepare).toHaveBeenCalledWith('p-mason', { fileName: file.name, fileSize: 64 * MB, uploadId: UPLOAD });
    expect(actions.complete).toHaveBeenCalledWith('p-mason', { uploadId: UPLOAD, fileName: file.name, title: 'Swing', category: 'film' });
  });
});

// ── The page: desktop ────────────────────────────────────────────────────────

describe('Recruiting · film and file drop · the page', () => {
  it('CH-14917 a file dragged over the documents shows where it will land, and leaving takes it away; other drags do nothing', async () => {
    wrap();
    await within(panel('Mason Reilly')).findByRole('button', { name: /^Fall tournament schedule\.pdf/ });
    expect(code('CH-14917')).toBeNull();
    // Dragging text, not a file: the browser's own behaviour is left alone.
    expect(fireEvent.dragEnter(section(), drag([], { types: ['text/plain'] }))).toBe(true);
    expect(fireEvent.dragOver(section(), drag([], { types: ['text/plain'] }))).toBe(true);
    expect(fireEvent.drop(section(), drag([], { types: ['text/plain'] }))).toBe(true);
    expect(code('CH-14917')).toBeNull();
    expect(dlg()).toBeNull();
    // A file: the drop is allowed (default prevented) and the section says so.
    expect(fireEvent.dragEnter(section(), drag([pdf()]))).toBe(false);
    expect(fireEvent.dragOver(section(), drag([pdf()]))).toBe(false);
    expect(code('CH-14917')?.textContent).toMatch(/Drop a file to add it/);
    // Moving across the section's own children does not flicker it off; leaving it does.
    fireEvent.dragEnter(section().querySelector('ul') ?? section(), drag([pdf()]));
    fireEvent.dragLeave(section().querySelector('ul') ?? section(), drag([pdf()]));
    expect(code('CH-14917')).not.toBeNull();
    fireEvent.dragLeave(section(), drag([pdf()]));
    expect(code('CH-14917')).toBeNull();
  });

  it('CH-14917 CH-14404 a dropped file opens the same dialog as Upload, with its title and category, and uploads from it', async () => {
    const user = userEvent.setup();
    const w = fakeWrites();
    wrap(w);
    await within(panel('Mason Reilly')).findByRole('button', { name: /^Fall tournament schedule\.pdf/ });
    fireEvent.dragEnter(section(), drag([pdf()]));
    fireEvent.drop(section(), drag([pdf()]));
    expect(code('CH-14917')).toBeNull();
    const d = within(dlg());
    expect(d.getByText('Add a document')).toBeTruthy();
    expect(dlg().textContent).toContain('Spring transcript.pdf');
    expect((d.getByRole('textbox', { name: 'Title' }) as HTMLInputElement).value).toBe('Spring transcript');
    expect(d.getByRole('button', { name: 'Note' }).getAttribute('aria-pressed')).toBe('true');
    await user.click(d.getByRole('button', { name: 'Upload' }));
    await waitFor(() => expect(w.documents.upload).toHaveBeenCalledTimes(1));
    expect(w.documents.upload).toHaveBeenCalledWith('p-mason', expect.any(File), { title: 'Spring transcript', category: 'note' }, { uploadId: expect.any(String), onProgress: expect.any(Function) });
  });

  it('a dropped film starts as Film, and so does a chosen one; a document starts as a Note', async () => {
    const user = userEvent.setup({ applyAccept: false });
    wrap();
    await within(panel('Mason Reilly')).findByRole('button', { name: /^Fall tournament schedule\.pdf/ });
    fireEvent.drop(section(), drag([film()]));
    expect(within(dlg()).getByRole('button', { name: 'Film' }).getAttribute('aria-pressed')).toBe('true');
    await user.click(within(dlg()).getByRole('button', { name: 'Cancel' }));
    await user.upload(fileInput(), film('Drill.m4v'));
    expect(within(dlg()).getByRole('button', { name: 'Film' }).getAttribute('aria-pressed')).toBe('true');
    expect(fileInput().accept).toContain('.mov');
  });

  it('CH-14109 several files dropped at once are refused with a sentence, and nothing is sent', async () => {
    const user = userEvent.setup();
    const w = fakeWrites();
    wrap(w);
    await within(panel('Mason Reilly')).findByRole('button', { name: /^Fall tournament schedule\.pdf/ });
    fireEvent.drop(section(), drag([pdf('a.pdf'), pdf('b.pdf')]));
    expect(code('CH-14109')?.textContent).toMatch(/Drop one file at a time.*Each document gets its own title and category/);
    expect(within(dlg()).queryByRole('button', { name: 'Upload' })).toBeNull();
    await user.click(within(dlg()).getByRole('button', { name: 'Cancel' }));
    expect(dlg()).toBeNull();
    expect(w.documents.upload).not.toHaveBeenCalled();
  });

  it('CH-14110 a folder, or a file with nothing in it, is refused with a sentence', async () => {
    wrap();
    await within(panel('Mason Reilly')).findByRole('button', { name: /^Fall tournament schedule\.pdf/ });
    fireEvent.drop(section(), drag([film('Swings', 4096)], { folder: true }));
    expect(code('CH-14110')?.textContent).toMatch(/That isn't a file.*A folder can't be added/);
    await userEvent.setup().click(within(dlg()).getByRole('button', { name: 'Cancel' }));
    fireEvent.drop(section(), drag([film('Empty.mov', 0)]));
    expect(code('CH-14110')?.textContent).toMatch(/It is empty, or it is a folder/);
  });

  it('CH-14105 CH-14106 a dropped film over 100 MB, or a type the bucket does not take, is refused in the same dialog as a chosen one', async () => {
    const user = userEvent.setup();
    const w = fakeWrites();
    wrap(w);
    await within(panel('Mason Reilly')).findByRole('button', { name: /^Fall tournament schedule\.pdf/ });
    fireEvent.drop(section(), drag([film('Whole summer.mov', 101 * MB)]));
    expect(code('CH-14105')?.textContent).toMatch(/That film is over 100 MB.*Choose a shorter clip/);
    await user.click(within(dlg()).getByRole('button', { name: 'Cancel' }));
    fireEvent.drop(section(), drag([new File(['x'], 'Swing.avi', { type: 'video/x-msvideo' })]));
    expect(code('CH-14106')?.textContent).toMatch(/We can't take that file type/);
    expect(w.documents.upload).not.toHaveBeenCalled();
  });

  it('the drop zone says so on desktop, and while the dialog is open a second drop is not taken', async () => {
    wrap();
    await within(panel('Mason Reilly')).findByRole('button', { name: /^Fall tournament schedule\.pdf/ });
    expect(within(section()).getByText('Drop a file here to add it. Film can be an MP4, MOV or M4V.')).toBeTruthy();
    // With no dialog open, a file dropped elsewhere on the page is the browser's own business.
    expect(fireEvent.drop(document.body, drag([pdf('stray.pdf')]))).toBe(true);
    fireEvent.drop(section(), drag([pdf('first.pdf')]));
    expect(dlg().textContent).toContain('first.pdf');
    // With it open (and so while a file is being sent) a file dropped anywhere would be opened by the browser in place of the
    // page, so the drop is refused, and only a file: dragging text is left alone.
    expect(fireEvent.dragOver(document.body, drag([pdf('stray.pdf')]))).toBe(false);
    expect(fireEvent.drop(document.body, drag([pdf('stray.pdf')]))).toBe(false);
    expect(fireEvent.drop(document.body, drag([], { types: ['text/plain'] }))).toBe(true);
    // The dialog is modal, so the section behind it no longer handles a drag: the browser's own behaviour is left alone.
    expect(fireEvent.dragEnter(section(), drag([pdf('second.pdf')]))).toBe(true);
    fireEvent.drop(section(), drag([pdf('second.pdf')]));
    expect(dlg().textContent).toContain('first.pdf');
    expect(dlg().textContent).not.toContain('second.pdf');
    await userEvent.setup().click(within(dlg()).getByRole('button', { name: 'Cancel' }));
    expect(fireEvent.drop(document.body, drag([pdf('stray.pdf')]))).toBe(true);
  });

  it('CH-14407 a transfer shows how much has been sent, on the button and as a progress bar, with "Keep this page open"', async () => {
    const user = userEvent.setup();
    const w = fakeWrites();
    const gate = deferred<UploadResult>();
    w.documents.upload.mockImplementation(((_id: string, _f: File, _m: unknown, opts?: { onProgress?: (p: number) => void }) => {
      opts?.onProgress?.(42);
      return gate.promise;
    }) as never);
    wrap(w);
    await within(panel('Mason Reilly')).findByRole('button', { name: /^Fall tournament schedule\.pdf/ });
    fireEvent.drop(section(), drag([film()]));
    await user.click(within(dlg()).getByRole('button', { name: 'Upload' }));
    await waitFor(() => expect(code('CH-14404')?.textContent).toBe('Uploading 42%'));
    const bar = within(dlg()).getByRole('progressbar', { name: 'Upload progress' });
    expect(bar.getAttribute('aria-valuenow')).toBe('42');
    expect(code('CH-14407')?.textContent).toMatch(/Keep this page open until it finishes/);
    await act(async () => gate.resolve({ success: true, data: { id: 'd-new' } }));
    await waitFor(() => expect(dlg()).toBeNull());
    expect(code('CH-14407')).toBeNull();
  });

  it('CH-14404 with no progress to report the button says Uploading, as before, and no bar is drawn', async () => {
    const user = userEvent.setup();
    const w = fakeWrites();
    const gate = deferred<UploadResult>();
    w.documents.upload.mockReturnValue(gate.promise as never);
    wrap(w);
    await within(panel('Mason Reilly')).findByRole('button', { name: /^Fall tournament schedule\.pdf/ });
    fireEvent.drop(section(), drag([pdf()]));
    await user.click(within(dlg()).getByRole('button', { name: 'Upload' }));
    expect(code('CH-14404')?.textContent).toBe('Uploading');
    expect(within(dlg()).queryByRole('progressbar')).toBeNull();
    await act(async () => gate.resolve({ success: true, data: { id: 'd-new' } }));
  });

  it('CH-14107 CH-14703 Storage turning down the file\'s type says so in the dialog, with Choose another file, an error felt once, and no Retry toast', async () => {
    const user = userEvent.setup();
    const w = fakeWrites();
    w.documents.upload.mockImplementation(() => Promise.resolve({ success: false, refused: 'type', error: 'Storage refused Swing.mov: it doesn\'t take that type of file.' }));
    wrap(w);
    await within(panel('Mason Reilly')).findByRole('button', { name: /^Fall tournament schedule\.pdf/ });
    fireEvent.drop(section(), drag([film('Swing.mov')]));
    await user.click(within(dlg()).getByRole('button', { name: 'Upload' }));
    await expectCode('CH-14107', /Storage won't take that file type.*Swing\.mov was refused, so nothing was added/);
    expect(within(dlg()).queryByRole('button', { name: 'Upload' })).toBeNull();
    expect(within(dlg()).getByRole('button', { name: 'Choose another file' })).toBeTruthy();
    expect(code('CH-14005')).toBeNull();
    expect(hapticSpy.mock.calls.filter((c) => c[0] === 'error')).toHaveLength(1);
    expect(hapticSpy.mock.calls.filter((c) => c[0] === 'success')).toHaveLength(0);
    expect(w.documents.list).toHaveBeenCalledTimes(1);
  });

  it('CH-14108 Storage turning down the size says so in the dialog, with the file\'s size', async () => {
    const user = userEvent.setup();
    const w = fakeWrites();
    w.documents.upload.mockImplementation(() => Promise.resolve({ success: false, refused: 'size', error: 'Storage refused Swing.mov: it is over the size it takes.' }));
    wrap(w);
    await within(panel('Mason Reilly')).findByRole('button', { name: /^Fall tournament schedule\.pdf/ });
    fireEvent.drop(section(), drag([film('Swing.mov', 64 * MB)]));
    await user.click(within(dlg()).getByRole('button', { name: 'Upload' }));
    await expectCode('CH-14108', /Storage won't take a file this large.*Swing\.mov \(64\.0 MB\) was refused, so nothing was added/);
    expect(code('CH-14005')).toBeNull();
  });

  it('CH-14005 CH-14916 a failure that is not a refusal of the file keeps the Retry toast, and Retry sends the same upload id, so nothing is sent or recorded twice', async () => {
    const user = userEvent.setup();
    const w = fakeWrites();
    w.documents.upload.mockImplementation(() => fail("The file didn't finish sending. Check your connection and try again."));
    wrap(w);
    await within(panel('Mason Reilly')).findByRole('button', { name: /^Fall tournament schedule\.pdf/ });
    fireEvent.drop(section(), drag([film()]));
    await user.click(within(dlg()).getByRole('button', { name: 'Upload' }));
    await expectCode('CH-14005', /Couldn't upload Swing, down the line.*The file didn't finish sending/);
    expect(dlg()).not.toBeNull();
    w.documents.upload.mockImplementation(() => ok({ id: 'd-x' }));
    await user.click(within(code('CH-14005') as HTMLElement).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(w.documents.upload).toHaveBeenCalledTimes(2));
    const ids = w.documents.upload.mock.calls.map((c) => (c as unknown as [string, File, unknown, { uploadId: string }])[3].uploadId);
    expect(ids[0]).toMatch(UUID);
    expect(ids[1]).toBe(ids[0]);
    await waitFor(() => expect(dlg()).toBeNull());
    // A different file is a different upload.
    fireEvent.drop(section(), drag([film('Another.mov')]));
    await user.click(within(dlg()).getByRole('button', { name: 'Upload' }));
    await waitFor(() => expect(w.documents.upload).toHaveBeenCalledTimes(3));
    expect((w.documents.upload.mock.calls[2] as unknown as [string, File, unknown, { uploadId: string }])[3].uploadId).not.toBe(ids[0]);
  });
});

// ── The page: phone ──────────────────────────────────────────────────────────

describe('Recruiting · film and file drop · the phone keeps the picker', () => {
  const realMatchMedia = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({
      matches: q === '(max-width: 820px)',
      media: q,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as never;
    window.history.replaceState(null, '', '/golf/dashboard/recruiting');
  });
  afterEach(() => {
    window.matchMedia = realMatchMedia;
    window.history.replaceState(null, '', '/');
  });

  it('there is no drop zone and no hint: a drag is left to the browser, and Upload still opens the picker, which offers film', async () => {
    const w = fakeWrites();
    wrap(w, { openId: 'p-mason', detail: true });
    const docs = await screen.findByRole('region', { name: 'Documents' });
    await within(docs).findByRole('button', { name: /^Fall tournament schedule\.pdf/ });
    expect(within(docs).queryByText(/Drop a file here/)).toBeNull();
    expect(fireEvent.dragEnter(docs, drag([pdf()]))).toBe(true);
    expect(fireEvent.drop(docs, drag([pdf()]))).toBe(true);
    expect(code('CH-14917')).toBeNull();
    expect(dlg()).toBeNull();
    expect(within(docs).getByRole('button', { name: 'Upload' })).toBeTruthy();
    expect(fileInput().accept).toContain('.mp4');
  });
});

// ── An Add that cannot add a prospect twice ──────────────────────────────────

describe('Recruiting · an Add cannot add a prospect twice', () => {
  const sent = (w: Fake) => w.create.mock.calls.map((c) => (c as unknown as [unknown, string])[1]);
  const fillAndAdd = async (user: ReturnType<typeof userEvent.setup>, first: string, hometown?: string) => {
    await user.click(screen.getByRole('button', { name: 'Add prospect' }));
    await user.type(within(dlg()).getByRole('textbox', { name: 'First name' }), first);
    if (hometown) await user.type(within(dlg()).getByRole('textbox', { name: 'Hometown' }), hometown);
    await user.click(within(dlg()).getByRole('button', { name: 'Add prospect' }));
  };

  it('CH-14915 a Retry after a failed or lost Add sends the same request id, and pressing Save again with the same contents does too', async () => {
    const user = userEvent.setup();
    const w = fakeWrites();
    w.create.mockImplementation(() => fail('Failed to add recruit'));
    wrap(w);
    await fillAndAdd(user, 'Ellie');
    await expectCode('CH-14001', /Couldn't add Ellie/);
    await user.click(within(code('CH-14001') as HTMLElement).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(w.create).toHaveBeenCalledTimes(2));
    await user.click(within(dlg()).getByRole('button', { name: 'Add prospect' }));
    await waitFor(() => expect(w.create).toHaveBeenCalledTimes(3));
    const ids = sent(w);
    expect(ids[0]).toMatch(UUID);
    expect(ids[1]).toBe(ids[0]);
    expect(ids[2]).toBe(ids[0]);
  });

  it('CH-14915 a changed form is a different prospect and gets its own id; the next Add after a saved one does too', async () => {
    const user = userEvent.setup();
    const w = fakeWrites();
    w.create.mockImplementationOnce(() => fail('Failed to add recruit'));
    wrap(w);
    await fillAndAdd(user, 'Ellie');
    await expectCode('CH-14001');
    await user.type(within(dlg()).getByRole('textbox', { name: 'Hometown' }), 'Wilmington');
    await user.click(within(dlg()).getByRole('button', { name: 'Add prospect' }));
    await waitFor(() => expect(w.create).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(dlg()).toBeNull());
    // A second Add with exactly the same contents is another prospect, and gets another id.
    await fillAndAdd(user, 'Ellie', 'Wilmington');
    await waitFor(() => expect(w.create).toHaveBeenCalledTimes(3));
    const [a, b, c] = sent(w);
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('CH-14915 the same Add repeated after the server stored it (its answer was the prospect, found again) shows one prospect, not two', async () => {
    const user = userEvent.setup();
    const w = fakeWrites();
    // The first reply is lost; the repeat is answered with the row the first attempt stored, under the same id.
    let stored: string | null = null;
    w.create.mockImplementation(((_input: unknown, id: string) => {
      if (stored === null) {
        stored = id;
        return fail('network down');
      }
      return ok({ id: stored });
    }) as never);
    wrap(w);
    await fillAndAdd(user, 'Ellie');
    await expectCode('CH-14001');
    await user.click(within(code('CH-14001') as HTMLElement).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(dlg()).toBeNull());
    expect(screen.getAllByRole('row').filter((r) => /Ellie/.test(r.textContent ?? ''))).toHaveLength(1);
    expect(w.create).toHaveBeenCalledTimes(2);
    expect(sent(w)[1]).toBe(stored);
  });
});

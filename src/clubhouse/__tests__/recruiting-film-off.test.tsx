import { LazyMotion, domAnimation } from 'motion/react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * Recruiting (P014) with film switched off (data/recruiting-film.ts; film is on now that
 * supabase/migrations/20260930140000_recruit_documents_film.sql is applied, and this is the kill switch): no Film category to pick, no video in the picker, a video refused before anything is
 * sent, and no film in the page's copy; a document already filed as Film keeps its tag, and the rest of Documents
 * works as before. Film on (the state after the apply) is recruiting-upload.test.tsx and recruiting.test.tsx.
 */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn() }), usePathname: () => '/golf/dashboard/recruiting' }));
vi.mock('@/app/golf/actions/recruiting', () => ({ createRecruit: vi.fn(), updateRecruit: vi.fn(), deleteRecruit: vi.fn(), getRecruits: vi.fn() }));
vi.mock('@/app/golf/actions/recruit-documents', () => ({
  getRecruitDocuments: vi.fn(),
  deleteRecruitDocument: vi.fn(),
  getRecruitDocumentUrl: vi.fn(),
  prepareRecruitDocumentUpload: vi.fn(),
  completeRecruitDocumentUpload: vi.fn(),
}));
vi.mock('../data/recruiting-film', () => ({ RECRUIT_FILM_ENABLED: false }));
vi.mock('@/lib/utils/capacitor', () => ({ isNativeApp: () => false, openExternalUrl: vi.fn() }));

import { RECRUIT_FILM_ENABLED } from '../data/recruiting-film';
import { CH_DOC_CATEGORIES, CH_DOC_PICK_CATEGORIES, DOC_ACCEPT, categoryLabel, screenFile, type ChDocument, type ChRecruiting } from '../data/recruiting-shape';
import { RECRUIT_DOC_MIME_BY_EXT, RECRUIT_FILM_EXTENSIONS } from '@/app/golf/actions/recruit-documents-limits';
import { RecruitingView } from '../screens/recruiting/RecruitingView';
import type { ChRecruitingWrites } from '../screens/recruiting/writes';
import { ClubhouseMarker } from '../shell/context';
import { PhoneChromeProvider, usePhoneChromeState } from '../shell/phone-chrome';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';
import { PREVIEW_DOCUMENTS, PREVIEW_RECRUITING } from '../preview/fixtures-recruiting';

const MB = 1024 * 1024;
const ok = <T,>(data?: T) => Promise.resolve({ success: true as const, data });

function fakeWrites(docs: Record<string, ChDocument[]> = PREVIEW_DOCUMENTS) {
  return {
    create: vi.fn(() => ok({ id: 'new-1' })),
    update: vi.fn(() => ok()),
    remove: vi.fn(() => ok()),
    documents: {
      list: vi.fn((id: string) => ok((docs[id] ?? []).map((d) => ({ ...d })))),
      upload: vi.fn(() => ok({ id: 'd-new' })),
      remove: vi.fn(() => ok()),
      open: vi.fn(() => ok()),
    },
  };
}
type Fake = ReturnType<typeof fakeWrites>;

function SlotHost() {
  const { setSlot } = usePhoneChromeState();
  return <div ref={setSlot} />;
}
function wrap(w: Fake = fakeWrites(), data: ChRecruiting = PREVIEW_RECRUITING) {
  render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <PhoneChromeProvider>
          {/* eslint-disable-next-line jsx-a11y/aria-role -- role is a component prop, not an ARIA role */}
          <ClubhouseMarker role="coach">
            <div className="ch-root" data-ui="clubhouse">
              <SlotHost />
              <RecruitingView data={data} writes={w as unknown as ChRecruitingWrites} />
            </div>
          </ClubhouseMarker>
        </PhoneChromeProvider>
      </ToastProvider>
    </LazyMotion>,
  );
  return w;
}
const panel = (name: string) => screen.getByRole('complementary', { name });
const section = () => screen.getByRole('region', { name: 'Documents' });
const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;
const dlg = () => document.querySelector('dialog[open]') as HTMLElement;
const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
const film = (name = 'Swing, down the line.mov', size = 64 * MB) => {
  const f = new File(['x'], name, { type: 'video/quicktime' });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};
const pdf = (name = 'Spring transcript.pdf') => new File(['%PDF'], name, { type: 'application/pdf' });
const drag = (files: File[]) => ({
  dataTransfer: { types: ['Files'], files, items: files.map(() => ({ kind: 'file', webkitGetAsEntry: () => ({ isDirectory: false }) })), dropEffect: 'none' },
});

describe('Recruiting · film switched off · the rules', () => {
  it('this file runs with the switch off (mocked); the shipped default is on', async () => {
    expect(RECRUIT_FILM_ENABLED).toBe(false);
    const real = await vi.importActual<typeof import('../data/recruiting-film')>('../data/recruiting-film');
    expect(real.RECRUIT_FILM_ENABLED).toBe(true);
  });

  it('CH-14106 the picker offers no video, and a video is refused as a type the page does not take, before anything is sent', () => {
    const accept = DOC_ACCEPT.split(',');
    for (const ext of RECRUIT_FILM_EXTENSIONS) {
      expect(accept, ext).not.toContain(`.${ext}`);
      expect(accept, ext).not.toContain(RECRUIT_DOC_MIME_BY_EXT[ext]);
    }
    expect(accept).toEqual(expect.arrayContaining(['.pdf', '.jpg', '.heic', '.docx', '.xlsx']));
    expect(accept.some((a) => a.startsWith('video/'))).toBe(false);
    for (const name of ['swing.mov', 'Swing.MP4', 'drill.m4v']) expect(screenFile({ name, size: 1 * MB })?.code, name).toBe('CH-14106');
    const refused = screenFile({ name: 'swing.mov', size: 1 * MB })!;
    expect(refused.title).toBe("We can't take that file type");
    expect(refused.body).toBe('Use a PDF, an image, a text or spreadsheet file, or a Word or PowerPoint document.');
    expect(refused.body).not.toMatch(/film|MP4|MOV/i);
    // Documents and images keep their rules.
    expect(screenFile({ name: 'Transcript.PDF', size: 25 * MB })).toBeNull();
    expect(screenFile({ name: 'scan.png', size: 25 * MB + 1 })).toMatchObject({ code: 'CH-14105', title: 'That file is over 25 MB' });
  });

  it('offers no Film category, and a document already filed as Film keeps its tag', () => {
    expect(CH_DOC_PICK_CATEGORIES.map((c) => c.label)).toEqual(['Note', 'Schedule', 'Transcript', 'Other']);
    expect(CH_DOC_CATEGORIES.map((c) => c.value)).toContain('film');
    expect(categoryLabel('film')).toBe('Film');
  });
});

describe('Recruiting · film switched off · the page', () => {
  it('a chosen document opens the dialog with no Film category, and uploads as before', async () => {
    const user = userEvent.setup();
    const w = wrap();
    await within(panel('Mason Reilly')).findByRole('button', { name: /^Fall tournament schedule\.pdf/ });
    expect(fileInput().accept).not.toMatch(/\.mov|\.mp4|\.m4v|video\//);
    await user.upload(fileInput(), pdf());
    const d = within(dlg());
    expect(d.getAllByRole('button').map((b) => b.textContent)).toEqual(expect.arrayContaining(['Note', 'Schedule', 'Transcript', 'Other']));
    expect(d.queryByRole('button', { name: 'Film' })).toBeNull();
    expect(d.getByRole('button', { name: 'Note' }).getAttribute('aria-pressed')).toBe('true');
    await user.click(d.getByRole('button', { name: 'Transcript' }));
    await user.click(d.getByRole('button', { name: 'Upload' }));
    await waitFor(() => expect(w.documents.upload).toHaveBeenCalledTimes(1));
    expect(w.documents.upload).toHaveBeenCalledWith('p-mason', expect.any(File), { title: 'Spring transcript', category: 'transcript' }, { uploadId: expect.any(String), onProgress: expect.any(Function) });
  });

  it('CH-14106 a dropped or chosen video is refused in the dialog, and nothing is sent', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const w = wrap();
    await within(panel('Mason Reilly')).findByRole('button', { name: /^Fall tournament schedule\.pdf/ });
    fireEvent.drop(section(), drag([film()]));
    expect(code('CH-14106')?.textContent).toMatch(/We can't take that file type/);
    expect(within(dlg()).queryByRole('button', { name: 'Upload' })).toBeNull();
    await user.click(within(dlg()).getByRole('button', { name: 'Cancel' }));
    await user.upload(fileInput(), film('Drill.m4v'));
    expect(code('CH-14106')).not.toBeNull();
    expect(w.documents.upload).not.toHaveBeenCalled();
  });

  it('the drop hint and the empty row say nothing of film', async () => {
    wrap();
    await within(panel('Mason Reilly')).findByRole('button', { name: /^Fall tournament schedule\.pdf/ });
    expect(section().querySelector('.ch-rec-drophint')!.textContent).toBe('Drop a file here to add it.');
    // No film among the sample documents either: none can be stored until the bucket takes video.
    expect(section().textContent).not.toMatch(/film|\.mov/i);
  });

  it('CH-14305 a prospect with no documents: the empty row names what goes there, without film', async () => {
    wrap(fakeWrites({}));
    await waitFor(() => expect(code('CH-14305')).not.toBeNull());
    expect(code('CH-14305')!.textContent).toMatch(/No documents yet.*Schedules, transcripts and notes, private to your staff\./);
    expect(code('CH-14305')!.textContent).not.toMatch(/film/i);
  });

  it('a document filed as Film before still lists with its Film tag', async () => {
    const filed: ChDocument = { id: 'd-film', title: 'Swing notes', category: 'film', fileName: 'swing-notes.pdf', fileType: 'application/pdf', size: 1000, createdAt: '2026-09-01T00:00:00Z' };
    wrap(fakeWrites({ 'p-mason': [filed] }));
    const row = await within(panel('Mason Reilly')).findByRole('button', { name: /^Swing notes/ });
    expect(row.textContent).toContain('Film');
  });
});

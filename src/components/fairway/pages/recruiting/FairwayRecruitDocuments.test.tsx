/**
 * FairwayRecruitDocuments — the upload goes from the browser straight to
 * Storage on a signed URL (prepare, uploadToSignedUrl, complete). The File is
 * never an argument to a server action: Vercel refuses a request body over
 * about 4.5 MB with a 413 before the action runs, and a recruit document may be
 * up to 25 MB. The panel's size and type refusals keep their copy.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const MB = 1024 * 1024;
const RECRUIT = '11111111-1111-4111-8111-111111111111';
const PATH = `team-1/${RECRUIT}/upload.pdf`;

const calls: string[] = [];

const actions = vi.hoisted(() => ({
  list: vi.fn(),
  prepare: vi.fn(),
  complete: vi.fn(),
  remove: vi.fn(),
  url: vi.fn(),
}));

vi.mock('@/app/golf/actions/recruit-documents', () => ({
  getRecruitDocuments: actions.list,
  prepareRecruitDocumentUpload: actions.prepare,
  completeRecruitDocumentUpload: actions.complete,
  deleteRecruitDocument: actions.remove,
  getRecruitDocumentUrl: actions.url,
}));

const storage = vi.hoisted(() => ({ bucket: vi.fn(), uploadToSignedUrl: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    storage: {
      from: (bucket: string) => {
        storage.bucket(bucket);
        return { uploadToSignedUrl: storage.uploadToSignedUrl };
      },
    },
  }),
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@/components/fairway/feedback/ToastStack', () => ({ fairwayToast: toast }));

import { FairwayRecruitDocuments } from './FairwayRecruitDocuments';

function pick(container: HTMLElement, file: File) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

function fileOf(name: string, bytes: number, type: string): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

/** Every argument any server action received, flattened one level into objects. */
function everyActionArg(): unknown[] {
  const out: unknown[] = [];
  for (const fn of Object.values(actions)) {
    for (const args of fn.mock.calls) {
      for (const a of args as unknown[]) {
        out.push(a);
        if (a && typeof a === 'object') out.push(...Object.values(a as Record<string, unknown>));
      }
    }
  }
  return out;
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  actions.list.mockResolvedValue({ success: true, data: [] });
  actions.prepare.mockImplementation(async () => {
    calls.push('prepare');
    return { success: true, data: { contentType: 'application/pdf', signedUrl: `https://storage.example/${PATH}?token=tok`, path: PATH, token: 'tok' } };
  });
  storage.uploadToSignedUrl.mockImplementation(async () => {
    calls.push('upload');
    return { data: { path: PATH, fullPath: `recruit-documents/${PATH}` }, error: null };
  });
  actions.complete.mockImplementation(async () => {
    calls.push('complete');
    return { success: true, data: { id: 'doc-1' } };
  });
});

describe('FairwayRecruitDocuments upload', () => {
  it('sends a 10 MB file prepare → uploadToSignedUrl → complete, and never as a server action argument', async () => {
    const { container } = render(<FairwayRecruitDocuments recruitId={RECRUIT} />);
    await waitFor(() => expect(actions.list).toHaveBeenCalled());

    const file = fileOf('Fall schedule.pdf', 10 * MB, 'application/pdf');
    pick(container, file);
    fireEvent.click(screen.getByRole('button', { name: /^upload$/i }));

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(calls).toEqual(['prepare', 'upload', 'complete']);

    const uploadId = actions.prepare.mock.calls[0]![1].uploadId as string;
    expect(actions.prepare).toHaveBeenCalledWith(RECRUIT, { fileName: 'Fall schedule.pdf', fileSize: 10 * MB, uploadId });
    expect(uploadId).toMatch(/^[0-9a-f-]{36}$/);

    expect(storage.bucket).toHaveBeenCalledWith('recruit-documents');
    const [path, token, body] = storage.uploadToSignedUrl.mock.calls[0]!;
    expect(path).toBe(PATH);
    expect(token).toBe('tok');
    expect((body as Blob).size).toBe(10 * MB);
    expect((body as Blob).type).toBe('application/pdf');

    expect(actions.complete).toHaveBeenCalledWith(RECRUIT, { uploadId, fileName: 'Fall schedule.pdf', title: 'Fall schedule', category: 'note' });

    // The bytes never ride a server action: no action got a File or Blob, at the top level or inside its argument object.
    expect(everyActionArg().some((a) => a instanceof Blob)).toBe(false);
  });

  it('a retry after a failed record keeps the same upload id, so the stored file is not sent twice', async () => {
    actions.complete.mockResolvedValueOnce({ success: false, error: 'Failed to save document' });
    const { container } = render(<FairwayRecruitDocuments recruitId={RECRUIT} />);
    await waitFor(() => expect(actions.list).toHaveBeenCalled());

    pick(container, fileOf('Transcript.pdf', 2 * MB, 'application/pdf'));
    fireEvent.click(screen.getByRole('button', { name: /^upload$/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Upload failed', { description: 'Failed to save document' }));

    fireEvent.click(screen.getByRole('button', { name: /^upload$/i }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    const ids = actions.prepare.mock.calls.map((c) => c[1].uploadId);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
  });

  it.each([
    ['over 25 MB', fileOf('Film.pdf', 25 * MB + 1, 'application/pdf'), 'File is too large (max 25 MB)'],
    ['an unsupported type', fileOf('swing.mp4', 1 * MB, 'video/mp4'), 'Unsupported file type'],
    ['an unknown type', fileOf('setup.exe', 1 * MB, 'application/x-msdownload'), 'Unsupported file type'],
  ])('refuses a file %s with the same copy, before anything is sent', async (_label, file, message) => {
    const { container } = render(<FairwayRecruitDocuments recruitId={RECRUIT} />);
    await waitFor(() => expect(actions.list).toHaveBeenCalled());

    pick(container, file);
    fireEvent.click(screen.getByRole('button', { name: /^upload$/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Upload failed', { description: message }));
    expect(actions.prepare).not.toHaveBeenCalled();
    expect(storage.uploadToSignedUrl).not.toHaveBeenCalled();
    expect(actions.complete).not.toHaveBeenCalled();
  });

  it("says the server's refusal as the server words it, and sends nothing", async () => {
    actions.prepare.mockResolvedValueOnce({ success: false, refused: 'size', error: 'File is too large (max 25 MB)' });
    const { container } = render(<FairwayRecruitDocuments recruitId={RECRUIT} />);
    await waitFor(() => expect(actions.list).toHaveBeenCalled());

    pick(container, fileOf('Notes.pdf', 1 * MB, 'application/pdf'));
    fireEvent.click(screen.getByRole('button', { name: /^upload$/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Upload failed', { description: 'File is too large (max 25 MB)' }));
    expect(storage.uploadToSignedUrl).not.toHaveBeenCalled();
    expect(actions.complete).not.toHaveBeenCalled();
  });

  it('a Storage refusal of the transfer reads as the old upload failure and records nothing', async () => {
    storage.uploadToSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'Payload too large', status: 413, statusCode: '413' } });
    const { container } = render(<FairwayRecruitDocuments recruitId={RECRUIT} />);
    await waitFor(() => expect(actions.list).toHaveBeenCalled());

    pick(container, fileOf('Notes.pdf', 1 * MB, 'application/pdf'));
    fireEvent.click(screen.getByRole('button', { name: /^upload$/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Upload failed', { description: 'Upload failed. Try again.' }));
    expect(actions.complete).not.toHaveBeenCalled();
  });

  it('a transfer Storage already holds (a lost answer, then a retry) goes on to record it', async () => {
    storage.uploadToSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'The resource already exists', status: 409, statusCode: '409' } });
    const { container } = render(<FairwayRecruitDocuments recruitId={RECRUIT} />);
    await waitFor(() => expect(actions.list).toHaveBeenCalled());

    pick(container, fileOf('Notes.pdf', 1 * MB, 'application/pdf'));
    fireEvent.click(screen.getByRole('button', { name: /^upload$/i }));

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(actions.complete).toHaveBeenCalledTimes(1);
  });

  it('when the object is already stored, prepare returns no signed URL and nothing is sent', async () => {
    actions.prepare.mockResolvedValueOnce({ success: true, data: { contentType: 'application/pdf', signedUrl: null, path: PATH, token: null } });
    const { container } = render(<FairwayRecruitDocuments recruitId={RECRUIT} />);
    await waitFor(() => expect(actions.list).toHaveBeenCalled());

    pick(container, fileOf('Notes.pdf', 1 * MB, 'application/pdf'));
    fireEvent.click(screen.getByRole('button', { name: /^upload$/i }));

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(storage.uploadToSignedUrl).not.toHaveBeenCalled();
    expect(actions.complete).toHaveBeenCalledTimes(1);
  });
});

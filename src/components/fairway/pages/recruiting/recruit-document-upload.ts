/**
 * Fairway · Recruiting · sending a recruit document to Storage.
 *
 * The File never travels through a server action. Vercel Functions refuse a
 * request body over about 4.5 MB with a 413 before the action runs, and a
 * recruit document may be up to 25 MB. So the panel asks the server for a
 * signed upload (prepareRecruitDocumentUpload), sends the bytes from the
 * browser straight to Storage with `uploadToSignedUrl`, then asks the server
 * to record the row (completeRecruitDocumentUpload). The server builds the
 * object path from the recruit's own team, and the signed token is bound to
 * that one path, so the browser cannot send the file anywhere else.
 *
 * The panel's own checks and copy are the ones it had when the file went
 * through the action (25 MB, the document and image types, and the same
 * messages), and they run before anything is sent. The server checks again.
 */

import type {
  completeRecruitDocumentUpload,
  prepareRecruitDocumentUpload,
} from '@/app/golf/actions/recruit-documents';
import {
  RECRUIT_DOC_MAX_BYTES,
  RECRUIT_DOC_MIME_BY_EXT,
  isRecruitFilmExtension,
  recruitDocExtension,
} from '@/app/golf/actions/recruit-documents-limits';

export interface RecruitUploadResult {
  success: boolean;
  data?: { id: string };
  error?: string;
}

/** What Storage answered to the transfer, in the shape the Supabase client returns. */
export interface SignedUploadAnswer {
  error: { message?: string; status?: number; statusCode?: string; code?: string } | null;
}

export interface RecruitUploadIo {
  prepare: typeof prepareRecruitDocumentUpload;
  complete: typeof completeRecruitDocumentUpload;
  /** `supabase.storage.from('recruit-documents').uploadToSignedUrl(path, token, body)` from the browser client. */
  uploadToSignedUrl: (path: string, token: string, body: Blob) => Promise<SignedUploadAnswer>;
}

// The types this panel took before (the bucket's document and image types; film is the Clubhouse page's).
const DOC_MIME_BY_EXT: Record<string, string> = Object.fromEntries(
  Object.entries(RECRUIT_DOC_MIME_BY_EXT).filter(([ext]) => !isRecruitFilmExtension(ext)),
);
const DOC_MIMES = new Set(Object.values(DOC_MIME_BY_EXT));

const UPLOAD_FAILED = 'Upload failed. Try again.';

/**
 * The panel's own refusal of a file, before anything is sent, with the copy it
 * has always used. Null when the file may go.
 */
export function checkRecruitDocument(file: File | null | undefined): string | null {
  if (!file || file.size === 0) return 'Choose a file to upload';
  if (file.size > RECRUIT_DOC_MAX_BYTES) return 'File is too large (max 25 MB)';
  const ext = recruitDocExtension(file.name);
  const effectiveType = file.type || (Object.prototype.hasOwnProperty.call(DOC_MIME_BY_EXT, ext) ? DOC_MIME_BY_EXT[ext] : '');
  if (!effectiveType || !DOC_MIMES.has(effectiveType)) return 'Unsupported file type';
  return null;
}

/** One per chosen file, kept across a Retry so a repeat finds what its first attempt did. */
export function newUploadId(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Storage already holds this object: an earlier attempt's transfer landed, which is the state we want. */
function alreadyStored(error: NonNullable<SignedUploadAnswer['error']>): boolean {
  return (
    error.status === 409 ||
    error.statusCode === '409' ||
    error.code === 'ResourceAlreadyExists' ||
    /duplicate|already exists/i.test(error.message ?? '')
  );
}

export async function uploadRecruitDocumentDirect(
  io: RecruitUploadIo,
  recruitId: string,
  file: File,
  meta: { title?: string; category?: string },
  uploadId: string,
): Promise<RecruitUploadResult> {
  const refused = checkRecruitDocument(file);
  if (refused) return { success: false, error: refused };

  const prepared = await io.prepare(recruitId, { fileName: file.name, fileSize: file.size, uploadId });
  if (!prepared.success || !prepared.data) return { success: false, error: prepared.error };

  const { signedUrl, path, token, contentType } = prepared.data;
  if (signedUrl) {
    if (!path || !token) return { success: false, error: UPLOAD_FAILED };
    let answer: SignedUploadAnswer;
    try {
      // Re-typed to the canonical type the server chose (a slice shares the bytes; nothing is copied).
      answer = await io.uploadToSignedUrl(path, token, file.slice(0, file.size, contentType));
    } catch {
      return { success: false, error: UPLOAD_FAILED };
    }
    if (answer.error && !alreadyStored(answer.error)) return { success: false, error: UPLOAD_FAILED };
  }

  const done = await io.complete(recruitId, {
    uploadId,
    fileName: file.name,
    title: meta.title,
    category: meta.category,
  });
  return done.success && done.data ? { success: true, data: done.data } : { success: false, error: done.error };
}

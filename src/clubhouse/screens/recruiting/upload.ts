import type { completeRecruitDocumentUpload, prepareRecruitDocumentUpload } from '@/app/golf/actions/recruit-documents';
import type { ServerResult } from '../../lib/use-action';
import { newRequestId, type ChDocCategory } from '../../data/recruiting-shape';

/**
 * Sending a recruit's file to Storage (P014). A server action carries its arguments in one request body, which is capped
 * far below a film, so the file goes straight to Storage on a signed URL the server made for this coach and this
 * prospect, and the server then records it (src/app/golf/actions/recruit-documents.ts: prepare, then complete). Both
 * server steps are safe to repeat with the same `uploadId`, so a Retry after a lost answer never sends the file or records it twice.
 */

/** The upload's answer. `refused` is set when Storage or the server turned the file itself down, so the dialog can say so beside the file. */
export type ChUploadResult = ServerResult<{ id: string }> & { refused?: 'size' | 'type' };

export interface ChUploadOpts {
  /** Names the stored object. The page makes one per chosen file and keeps it across a Retry. */
  uploadId?: string;
  /** Real transfer progress, 0 to 99 while bytes are moving and 100 once Storage has answered. */
  onProgress?: (percent: number) => void;
}

/** What Storage answered to the transfer. `status` is 0 when no answer was read (offline, dropped). */
export interface ChPutOutcome {
  status: number;
  body: string;
}

export interface ChUploadIo {
  prepare: typeof prepareRecruitDocumentUpload;
  complete: typeof completeRecruitDocumentUpload;
  put: (signedUrl: string, file: File, contentType: string, onProgress?: (percent: number) => void) => Promise<ChPutOutcome>;
}

/**
 * PUT the file to a signed upload URL and report real progress. An XMLHttpRequest, because it is the one browser call
 * that says how many bytes have left. The token travels in the URL, so nothing else is sent with it.
 */
export function putWithProgress(signedUrl: string, file: File, contentType: string, onProgress?: (percent: number) => void): Promise<ChPutOutcome> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', signedUrl, true);
    xhr.setRequestHeader('content-type', contentType);
    xhr.setRequestHeader('cache-control', 'max-age=3600');
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (e: ProgressEvent) => {
      // No number when there is no number: an unknown total is not reported as a fraction. Held below 100 while bytes are still moving.
      if (!onProgress || !e.lengthComputable || e.total <= 0) return;
      onProgress(Math.min(99, Math.floor((e.loaded / e.total) * 100)));
    };
    xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText || '' });
    xhr.onerror = () => resolve({ status: 0, body: '' });
    xhr.ontimeout = () => resolve({ status: 0, body: '' });
    xhr.onabort = () => resolve({ status: 0, body: '' });
    xhr.send(file);
  });
}

/**
 * Storage's refusal of a transfer, in words the coach can act on. Storage names a refusal twice, by the HTTP status and by a
 * `statusCode`, error and message in the body, and the two have not always agreed (a refusal can arrive as a 400 whose body
 * says 413), so both are read.
 */
const SIZE_REFUSED = /"statusCode"\s*:\s*"?413"?|payload too large|EntityTooLarge|exceeded the maximum allowed size/i;
const TYPE_REFUSED = /"statusCode"\s*:\s*"?415"?|invalid_?mime_?type|mime type .* is not supported/i;
function refusalOf(put: ChPutOutcome, fileName: string): ChUploadResult {
  if (put.status === 413 || SIZE_REFUSED.test(put.body)) return { success: false, refused: 'size', error: `Storage refused ${fileName}: it is over the size it takes.` };
  if (put.status === 415 || TYPE_REFUSED.test(put.body)) {
    return { success: false, refused: 'type', error: `Storage refused ${fileName}: it doesn't take that type of file.` };
  }
  if (put.status === 401 || put.status === 403) return { success: false, error: "Only this team's coaches can add recruit documents" };
  return { success: false, error: "The file didn't finish sending. Check your connection and try again." };
}

export async function uploadRecruitFile(
  io: ChUploadIo,
  recruitId: string,
  file: File,
  meta: { title: string; category: ChDocCategory },
  opts: ChUploadOpts = {},
): Promise<ChUploadResult> {
  const uploadId = opts.uploadId ?? newRequestId();
  const prepared = await io.prepare(recruitId, { fileName: file.name, fileSize: file.size, uploadId });
  if (!prepared.success || !prepared.data) return { success: false, error: prepared.error, refused: prepared.refused };

  if (prepared.data.signedUrl) {
    const put = await io.put(prepared.data.signedUrl, file, prepared.data.contentType, opts.onProgress);
    // 409: Storage already holds this object, so an earlier attempt's transfer landed. That is the state we want.
    if (!(put.status >= 200 && put.status < 300) && put.status !== 409) return refusalOf(put, file.name);
  }
  opts.onProgress?.(100);

  const done = await io.complete(recruitId, { uploadId, fileName: file.name, title: meta.title, category: meta.category });
  return done.success && done.data ? { success: true, data: done.data } : { success: false, error: done.error, refused: done.refused };
}

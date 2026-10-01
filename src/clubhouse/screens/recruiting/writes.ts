'use client';

import {
  createRecruit,
  deleteRecruit,
  updateRecruit,
  type RecruitInput,
} from '@/app/golf/actions/recruiting';
import {
  completeRecruitDocumentUpload,
  deleteRecruitDocument,
  getRecruitDocuments,
  getRecruitDocumentUrl,
  prepareRecruitDocumentUpload,
} from '@/app/golf/actions/recruit-documents';
import { isNativeApp, openExternalUrl } from '@/lib/utils/capacitor';
import type { ServerResult } from '../../lib/use-action';
import { toDocument, type ChDocCategory, type ChDocument } from '../../data/recruiting-shape';
import { putWithProgress, uploadRecruitFile, type ChUploadOpts, type ChUploadResult } from './upload';

/**
 * Every Recruiting write and read the page calls after first paint. The live set is the current page's own server
 * actions, unchanged (one write path per behaviour): src/app/golf/actions/recruiting.ts and recruit-documents.ts,
 * which scope every call to the coach's team and leave the rest to RLS. Two additions, both optional arguments or new
 * steps that the current page never uses: an Add carries a request id (createRecruit), and a document's bytes go straight to
 * Storage on a signed URL (prepare and complete, ./upload.ts), so a film is not held to a server action's body limit.
 * The preview and the tests pass their own set.
 * Email and Call are plain mailto: and tel: links, so nothing here sends anything from GolfHelm.
 */
export interface ChRecruitingWrites {
  /** `requestId` is made once per Add and kept across a Retry, so a repeat after a lost answer cannot add the prospect twice. */
  create(input: RecruitInput, requestId?: string): Promise<ServerResult<{ id: string }>>;
  update(id: string, patch: Partial<RecruitInput>): Promise<ServerResult>;
  remove(id: string): Promise<ServerResult>;
  documents: {
    list(recruitId: string): Promise<ServerResult<ChDocument[]>>;
    /** The file goes straight to Storage (./upload.ts), so a film is not held to a server action's body limit. A refusal of the file itself comes back as `refused`. */
    upload(recruitId: string, file: File, meta: { title: string; category: ChDocCategory }, opts?: ChUploadOpts): Promise<ChUploadResult>;
    remove(id: string): Promise<ServerResult>;
    /** Asks for a link that expires and opens it: the file is never public. */
    open(doc: ChDocument): Promise<ServerResult>;
  };
}

export function createLiveRecruitingWrites(): ChRecruitingWrites {
  return {
    create: (input, requestId) => createRecruit(input, requestId ? { requestId } : undefined),
    update: (id, patch) => updateRecruit(id, patch),
    remove: (id) => deleteRecruit(id),
    documents: {
      async list(recruitId) {
        const r = await getRecruitDocuments(recruitId);
        return r.success ? { success: true, data: (r.data ?? []).map(toDocument) } : { success: false, error: r.error };
      },
      upload: (recruitId, file, meta, opts) =>
        uploadRecruitFile({ prepare: prepareRecruitDocumentUpload, complete: completeRecruitDocumentUpload, put: putWithProgress }, recruitId, file, meta, opts),
      remove: (id) => deleteRecruitDocument(id),
      async open(doc) {
        const r = await getRecruitDocumentUrl(doc.id);
        if (!r.success || !r.data) return { success: false, error: r.error ?? 'Failed to open document' };
        if (isNativeApp()) {
          // The in-app browser isn't held back by the pop-up blocker, so opening after the await is fine.
          await openExternalUrl(r.data.url);
          return { success: true };
        }
        // On the web the link arrives after an await, where window.open is blocked. An anchor click survives it.
        const a = document.createElement('a');
        a.href = r.data.url;
        a.download = r.data.fileName || doc.fileName;
        a.rel = 'noopener';
        a.click();
        return { success: true };
      },
    },
  };
}

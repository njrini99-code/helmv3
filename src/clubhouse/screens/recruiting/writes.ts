'use client';

import {
  createRecruit,
  deleteRecruit,
  updateRecruit,
  type RecruitInput,
} from '@/app/golf/actions/recruiting';
import { deleteRecruitDocument, getRecruitDocuments, getRecruitDocumentUrl, uploadRecruitDocument } from '@/app/golf/actions/recruit-documents';
import { isNativeApp, openExternalUrl } from '@/lib/utils/capacitor';
import type { ServerResult } from '../../lib/use-action';
import { toDocument, type ChDocCategory, type ChDocument } from '../../data/recruiting-shape';

/**
 * Every Recruiting write and read the page calls after first paint. The live set is the current page's own server
 * actions, unchanged (one write path per behaviour): src/app/golf/actions/recruiting.ts and recruit-documents.ts,
 * which scope every call to the coach's team and leave the rest to RLS. The preview and the tests pass their own set.
 * Email and Call are plain mailto: and tel: links, so nothing here sends anything from GolfHelm.
 */
export interface ChRecruitingWrites {
  create(input: RecruitInput): Promise<ServerResult<{ id: string }>>;
  update(id: string, patch: Partial<RecruitInput>): Promise<ServerResult>;
  remove(id: string): Promise<ServerResult>;
  documents: {
    list(recruitId: string): Promise<ServerResult<ChDocument[]>>;
    upload(recruitId: string, file: File, meta: { title: string; category: ChDocCategory }): Promise<ServerResult<{ id: string }>>;
    remove(id: string): Promise<ServerResult>;
    /** Asks for a link that expires and opens it: the file is never public. */
    open(doc: ChDocument): Promise<ServerResult>;
  };
}

export function createLiveRecruitingWrites(): ChRecruitingWrites {
  return {
    create: (input) => createRecruit(input),
    update: (id, patch) => updateRecruit(id, patch),
    remove: (id) => deleteRecruit(id),
    documents: {
      async list(recruitId) {
        const r = await getRecruitDocuments(recruitId);
        return r.success ? { success: true, data: (r.data ?? []).map(toDocument) } : { success: false, error: r.error };
      },
      upload: (recruitId, file, meta) => uploadRecruitDocument(recruitId, file, meta),
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

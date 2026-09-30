'use client';

import { useMemo } from 'react';
import type { ChDocument, ChRecruiting } from '../data/recruiting-shape';
import { RecruitingView, type RecInitial } from '../screens/recruiting/RecruitingView';
import type { ChRecruitingWrites } from '../screens/recruiting/writes';
import { PREVIEW_DOCUMENTS } from './fixtures-recruiting';
import '../styles/recruiting.css';

const later = <T,>(value: T, ms = 250) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

/**
 * Recruiting's writes for the preview: an in-memory list that never reaches Supabase, so the page can be used and
 * its outcomes seen. `failwrites` refuses every write, `failstage` only a stage change, `docsfailed` the documents'
 * read, `slow` answers after five seconds (the "still saving" notice).
 */
function previewWrites(state: string | undefined): ChRecruitingWrites {
  const docs: Record<string, ChDocument[]> = Object.fromEntries(Object.entries(PREVIEW_DOCUMENTS).map(([k, v]) => [k, [...v]]));
  const refuse = state === 'failwrites';
  const answer = <T,>(ok: T, ms?: number) => later(ok, state === 'slow' ? 5200 : (ms ?? 250));
  const no = () => answer({ success: false as const, error: 'The preview refused this write.' });
  return {
    create: async () => (refuse ? no() : answer({ success: true as const, data: { id: `new-${Math.random().toString(36).slice(2, 8)}` } })),
    update: async (_id, patch) => (refuse || (state === 'failstage' && patch.status) ? no() : answer({ success: true as const })),
    remove: async () => (refuse ? no() : answer({ success: true as const })),
    documents: {
      list: async (id) => (state === 'docsfailed' ? later({ success: false as const, error: 'nope' }) : later({ success: true as const, data: docs[id] ?? [] }, 400)),
      upload: async (id, file, meta) => {
        if (refuse) return no();
        const doc: ChDocument = { id: `d-${Date.now()}`, title: meta.title, category: meta.category, fileName: file.name, fileType: file.type, size: file.size, createdAt: new Date().toISOString() };
        docs[id] = [doc, ...(docs[id] ?? [])];
        return answer({ success: true as const, data: { id: doc.id } });
      },
      remove: async (docId) => {
        if (refuse) return no();
        for (const k of Object.keys(docs)) docs[k] = (docs[k] ?? []).filter((d) => d.id !== docId);
        return answer({ success: true as const });
      },
      open: async () => (refuse ? no() : answer({ success: true as const }, 100)),
    },
  };
}

export function PreviewRecruiting({ data, state, initial }: { data: ChRecruiting; state?: string; initial?: RecInitial }) {
  const writes = useMemo(() => previewWrites(state), [state]);
  return <RecruitingView data={data} writes={writes} initial={initial ?? {}} />;
}

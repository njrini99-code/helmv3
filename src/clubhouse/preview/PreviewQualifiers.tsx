'use client';

import { useMemo } from 'react';
import type { ChQDetail, ChQFormData, ChQSelectionData } from '../data/qualifiers';
import { QualifierDetail } from '../screens/qualifiers/QualifierDetail';
import { QualifierForm } from '../screens/qualifiers/QualifierForm';
import { QualifierSelection } from '../screens/qualifiers/QualifierSelection';
import type { ChQSelectionWrites, ChQWrites } from '../screens/qualifiers/writes';
import { PREVIEW_COURSES, PREVIEW_TEES } from './fixtures-qualifiers';

/** Qualifiers with fake writes for the dev preview. `failwrites` makes every write and lookup fail. */
const wait = <T,>(v: T, ms = 450) => new Promise<T>((r) => setTimeout(() => r(v), ms));

function useFakeWrites(fail: boolean): ChQWrites {
  return useMemo<ChQWrites>(
    () => ({
      create: () => wait(fail ? { success: false, error: 'preview' } : { success: true, data: { qualifierId: '10000000-0000-4000-8000-000000000002' } }),
      saveEdit: () => wait(fail ? { success: false, error: 'Saved the details, but not the players. One player has a round in this qualifier. Save again to finish.' } : { success: true }),
      setStatus: () => wait(fail ? { success: false, error: 'preview' } : { success: true }),
      courses: (q) =>
        fail ? wait(null).then(() => Promise.reject(new Error('preview'))) : wait(PREVIEW_COURSES.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase())), 250),
      tees: () => (fail ? wait(null).then(() => Promise.reject(new Error('preview'))) : wait(PREVIEW_TEES, 250)),
    }),
    [fail],
  );
}

export function PreviewQualifierDetail({ data, state }: { data: ChQDetail; state?: string }) {
  const writes = useFakeWrites(state === 'failwrites');
  return <QualifierDetail data={data} writes={writes} live={false} />;
}

export function PreviewQualifierForm({ data, state }: { data: ChQFormData; state?: string }) {
  const writes = useFakeWrites(state === 'failwrites');
  return <QualifierForm data={data} writes={writes} />;
}

/** Manage selections with fake writes. `failwrites` refuses every one with the server's words for a filled pick. */
export function PreviewQualifierSelection({ data, state }: { data: ChQSelectionData; state?: string }) {
  const fail = state === 'failwrites';
  const writes = useMemo<ChQSelectionWrites>(() => {
    const r = () => wait(fail ? { success: false, error: 'Every pick is taken. Remove one first.' } : { success: true });
    return { advance: r, setPick: r, removePick: r, confirm: r };
  }, [fail]);
  return <QualifierSelection data={data} writes={writes} />;
}

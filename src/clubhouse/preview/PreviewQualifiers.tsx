'use client';

import { startTransition, useEffect, useMemo, useState } from 'react';
import type { ChQDetail, ChQFormData, ChQSelectionData } from '../data/qualifiers';
import { QualifierDetail } from '../screens/qualifiers/QualifierDetail';
import { QualifierForm } from '../screens/qualifiers/QualifierForm';
import { QualifierSelection } from '../screens/qualifiers/QualifierSelection';
import type { ChQSelectionWrites, ChQWrites } from '../screens/qualifiers/writes';
import { DETAIL_INDEX, PREVIEW_COURSES, PREVIEW_TEES, previewDetail } from './fixtures-qualifiers';

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

/** The preview's stand-in for the realtime feed, read at 4:12 PM on the day the standings are from. */
const PREVIEW_READ_AT = new Date('2026-09-28T16:12:00').getTime();

/**
 * A qualifier with fake writes and a stand-in feed (it draws without a realtime channel). `paused` shows the feed
 * dropped (P009-B2); `ended` holds it against Oct 8, a week after its last day (D3); `reorder` refreshes to the
 * standings after three more signed rounds two seconds in, inside a transition like router.refresh, so the rows that
 * changed rank slide (B1).
 */
export function PreviewQualifierDetail({ data, state }: { data: ChQDetail; state?: string }) {
  const writes = useFakeWrites(state === 'failwrites');
  const [shown, setShown] = useState(data);
  const after = useMemo(() => (state === 'reorder' ? previewDetail(DETAIL_INDEX.live!, data.role, 'jonah', true) : null), [state, data.role]);
  useEffect(() => {
    if (!after) return;
    const t = window.setTimeout(() => startTransition(() => setShown(after)), 2000);
    return () => window.clearTimeout(t);
  }, [after]);
  const view = state === 'ended' ? { ...shown, today: '2026-10-08' } : shown;
  return <QualifierDetail data={view} writes={writes} live={false} feed={{ feed: state === 'paused' ? 'paused' : 'live', updatedAt: PREVIEW_READ_AT }} />;
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
    return { advance: r, setPick: r, removePick: r, chooseTie: r, confirm: r };
  }, [fail]);
  return <QualifierSelection data={data} writes={writes} />;
}

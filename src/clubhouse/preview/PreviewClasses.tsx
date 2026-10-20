'use client';

import { useMemo, useRef } from 'react';
import { classNameOf, importKey, sortDays, toImportRow, type ChClassesPage, type ChClassInput, type ChClassRow } from '../data/classes-shape';
import { readScheduleLive } from '../screens/classes/import-read';
import { ClassesView } from '../screens/classes/ClassesView';
import type { ChClassesWrites } from '../screens/classes/writes';
import { PREVIEW_PARSED } from './fixtures-classes';

const wait = <T,>(v: T, ms = 400) => new Promise<T>((r) => setTimeout(() => r(v), ms));

const rowOf = (id: string, i: ChClassInput, color: string | null): ChClassRow => ({
  id,
  class_name: classNameOf(i.code, i.name),
  instructor: i.instructor || null,
  days: sortDays(i.days),
  start_time: i.start || null,
  end_time: i.end || null,
  building: i.building || null,
  room: i.room || null,
  credits: i.credits,
  color: color ?? '#3B82F6',
  notes: i.notes || null,
  semester: i.semester || null,
  created_at: new Date().toISOString(),
});

/**
 * Classes with fake writes for the dev preview. Nothing reaches the server.
 *   ?state=failwrites   saving, removing, importing and Delete all classes fail
 *   ?state=failsync     saves work, but the calendar sync fails
 *   ?state=failpartial  Delete all classes stops half-way the first time (one kept, one off the calendar but still saved), and its Retry finishes
 *   ?state=read-notschedule | read-fault | read-none | read-warn   a file is read as that (pasted text is really read)
 */
export function PreviewClasses({ data, state }: { data: ChClassesPage; state?: string }) {
  const next = useRef(100);
  const partialOnce = useRef(true);
  const writes = useMemo<ChClassesWrites>(() => {
    const failWrites = state === 'failwrites';
    const refuse = { success: false, error: 'Preview: this save is set to fail.' };
    const newId = () => `c0000000-0000-4000-8000-${String(++next.current).padStart(12, '0')}`;
    return {
      save: (input, editing, id) => wait(failWrites ? refuse : { success: true, data: { row: rowOf(editing?.id ?? id, input, editing?.color ?? null) } }),
      remove: () => wait(failWrites ? refuse : { success: true }),
      removeAll: (ids) => {
        // Every calendar removal fails, so nothing is deleted.
        if (failWrites) return wait({ ...refuse, data: { removed: [], kept: ids.map((id) => ({ id, reason: 'Preview: the calendar removal is set to fail.' })), offCalendar: [] } });
        // The first attempt stops half-way (the last two classes), and its Retry finishes.
        if (state === 'failpartial' && partialOnce.current && ids.length >= 3) {
          partialOnce.current = false;
          const cut = ids.length - 2;
          return wait({
            success: false,
            error: 'Preview: the delete is set to stop half-way.',
            data: { removed: ids.slice(0, cut), kept: [{ id: ids[cut]!, reason: 'Preview: the calendar removal is set to fail.' }], offCalendar: [ids[cut + 1]!] },
          });
        }
        return wait({ success: true, data: { removed: ids, kept: [], offCalendar: [] } });
      },
      sync: () => wait(state === 'failsync' ? { success: false, error: 'Preview: the calendar sync is set to fail.' } : { success: true }, 700),
      importRows: async (rows) => {
        if (failWrites) return wait(refuse);
        // A class saved with no term is in the current one, as the live import reads it.
        const have = new Set(data.classes.list.map((c) => importKey(classNameOf(c.code, c.name), c.semester ?? data.term.label)));
        const fresh = rows.filter((r) => !have.has(importKey(classNameOf(r.code, r.name), r.semester || data.term.label)));
        return wait({
          success: true,
          data: {
            rows: fresh.map((r) => rowOf(newId(), { ...r, semester: r.semester || data.term.label }, r.color)),
            skipped: rows.filter((r) => !fresh.includes(r)).map((r) => classNameOf(r.code, r.name)),
          },
        });
      },
      read: async (source) => {
        if (source.kind === 'text') return readScheduleLive(source);
        await wait(null, 1200);
        if (state === 'read-notschedule')
          return { ok: false, kind: 'notSchedule', message: "This doesn't look like a class schedule (it reads as: receipt). Please upload a screenshot of your class schedule." };
        if (state === 'read-fault') return { ok: false, kind: 'fault', message: 'The image reader timed out. Your schedule can still be added with Paste text.' };
        if (state === 'read-none') return { ok: false, kind: 'none', message: "We read the file but couldn't find course codes or times. Try pasting your schedule text again." };
        return { ok: true, rows: PREVIEW_PARSED.map(toImportRow), warnings: state === 'read-warn' ? ['ART 101: the room was cropped out of the screenshot.'] : [] };
      },
    };
  }, [state, data]);
  return <ClassesView data={data} writes={writes} />;
}

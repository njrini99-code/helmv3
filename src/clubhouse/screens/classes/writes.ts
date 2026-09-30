'use client';

import { removeClassFromCalendar, syncClassToCalendar } from '@/app/golf/actions/calendar-sync';
import { createClient } from '@/lib/supabase/client';
import { generateClassColor } from '@/lib/utils/schedule-parser';
import { chReport } from '../../lib/track';
import type { ServerResult } from '../../lib/use-action';
import { classNameOf, hasTime, importKey, sortDays, type ChClass, type ChClassInput, type ChClassRow, type ChImportRow } from '../../data/classes-shape';
import { readScheduleLive, type ChReadResult, type ChReadSource } from './import-read';

/**
 * Every Classes write and read the page calls. The live set keeps the table,
 * columns and server actions the current Classes page uses, unchanged (one
 * write path per behaviour): `golf_player_classes` through the RLS-scoped
 * browser client, then `syncClassToCalendar` and `removeClassFromCalendar`,
 * and the schedule reader. Preview and tests pass their own set.
 *
 * Saving a class and putting it on the calendar are separate calls on
 * purpose. A failed sync must be retried on its own: the class row exists, and
 * repeating the insert made a second copy of it (audit DATA-02). The same goes
 * for a save whose answer was lost after the row was stored: the page makes the
 * new row's id, so its retry reaches that row instead of adding another.
 */
export interface ChClassesWrites {
  /** Insert (`editing` null, as the row `newId`) or update a class row. Returns the row as stored. A retry with the same `newId` finds the row its first attempt stored. */
  save(input: ChClassInput, editing: ChClass | null, newId: string): Promise<ServerResult<{ row: ChClassRow }>>;
  /** Take a class off the calendar, then delete it. The row stays when the calendar removal failed, so a retry finds it. */
  remove(id: string): Promise<ServerResult>;
  /** Put one saved class on the team calendar (a diff-upsert, so repeating it is safe). A class with no start or no end time is taken off the calendar instead. */
  sync(c: ChClass, opts?: { semesterStartDate?: string }): Promise<ServerResult>;
  /** Save the reviewed rows of an import, skipping classes already on the schedule. */
  importRows(rows: ChImportRow[]): Promise<ServerResult<{ rows: ChClassRow[]; skipped: string[] }>>;
  /** Read a screenshot, PDF, TXT file or pasted text into review rows. */
  read(source: ChReadSource): Promise<ChReadResult>;
}

const COLUMNS = 'id, class_name, instructor, days, start_time, end_time, building, room, credits, color, notes, semester, created_at';

const res = <T = unknown>(error: { message?: string; code?: string } | null | undefined): ServerResult<T> => (error ? { success: false, error: error.message || 'failed' } : { success: true });

/** A fresh row id. The page makes it once per sheet, so a save retried after a lost answer carries the id its first attempt did. */
export function newClassId(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** The columns a class form writes, exactly as the current page writes them, except the color: each write says which one it keeps. */
function valuesOf(input: ChClassInput, term: string) {
  return {
    class_name: classNameOf(input.code, input.name),
    instructor: input.instructor.trim() || null,
    days: sortDays(input.days),
    // NULL when no time is given: the class then reads as "no time set". Its sync takes it off the calendar (`sync` below), because a sync
    // would send no time and the server would put it on the calendar from 08:00 to 09:00.
    start_time: input.start || null,
    end_time: input.end || null,
    building: input.building.trim() || null,
    room: input.room.trim() || null,
    credits: input.credits,
    notes: input.notes.trim() || null,
    // Written once, so the calendar sync's window and the row never disagree, and an edit can't re-date the series to a re-guessed term.
    semester: input.semester.trim() || term,
  };
}

/** What `syncClassToCalendar` takes for a saved class. The stored term is kept; a row with none gets the current one, as every legacy path does. */
export function syncDataOf(c: ChClass, term: string, opts?: { semesterStartDate?: string }): Parameters<typeof syncClassToCalendar>[0] {
  return {
    id: c.id,
    course_code: c.code,
    course_name: c.name || c.code || 'Untitled class',
    instructor: c.instructor ?? '',
    days: c.days,
    start_time: c.start ?? '',
    end_time: c.end ?? '',
    location: c.location ?? '',
    building: c.building ?? '',
    room: c.room ?? '',
    credits: c.credits,
    semester: c.semester || term,
    ...(opts?.semesterStartDate ? { semesterStartDate: opts.semesterStartDate } : {}),
    color: c.color || generateClassColor(),
    notes: c.notes ?? '',
    // The wall-clock time typed is the time every meeting keeps: the zone name resolves the offset per date, across a daylight-saving change.
    timezoneOffset: new Date().getTimezoneOffset(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

export function createLiveClassesWrites(ctx: { playerId: string; teamId: string; term: string }): ChClassesWrites {
  const sb = createClient();
  return {
    async save(input, editing, newId) {
      const values = valuesOf(input, ctx.term);
      const update = async (id: string, set: ReturnType<typeof valuesOf> & { color?: string | null }): Promise<ServerResult<{ row: ChClassRow }>> => {
        const { data, error } = await sb.from('golf_player_classes').update(set).eq('id', id).eq('player_id', ctx.playerId).select(COLUMNS);
        if (error) return res<{ row: ChClassRow }>(error);
        // An UPDATE a policy hides comes back with no error and no row: say so rather than "saved".
        return data?.length ? { success: true, data: { row: data[0] as ChClassRow } } : { success: false, error: "Nothing was saved. This class was not found, or you can't change it." };
      };
      if (editing) return update(editing.id, { ...values, color: editing.color });
      const { data, error } = await sb
        .from('golf_player_classes')
        .insert({ id: newId, player_id: ctx.playerId, team_id: ctx.teamId, ...values, color: generateClassColor() })
        .select(COLUMNS)
        .single();
      if (!error && data) return { success: true, data: { row: data as ChClassRow } };
      if (error?.code !== '23505') return res<{ row: ChClassRow }>(error ?? { message: 'insert failed' });
      // 23505 on this id: an earlier attempt stored the row and its answer was lost (the id is the table's only unique column). That class is
      // saved, so there is no second copy. Bring it up to what was sent this time, and keep the color it has.
      return update(newId, values);
    },

    async remove(id) {
      // The calendar first, and the class only if that worked. Once the row is gone nothing can target its [class:<id>] tag,
      // which strands the events on the team calendar. Keeping the row on failure is what makes a retry possible.
      let removal: Awaited<ReturnType<typeof removeClassFromCalendar>>;
      try {
        removal = await removeClassFromCalendar(id);
      } catch (err) {
        chReport(err, { surface: 'classes.remove', action: 'removeClassFromCalendar', severity: 'low' });
        return { success: false, error: 'The calendar removal did not finish. The class was kept, so you can try again.' };
      }
      if (!removal?.success) return { success: false, error: `Couldn't take this class off your calendar: ${removal?.error ?? 'unknown error'}. The class was kept so you can try again.` };
      const { error } = await sb.from('golf_player_classes').delete().eq('id', id).eq('player_id', ctx.playerId);
      return res(error);
    },

    async sync(c, opts) {
      try {
        // No start or no end: nothing to put on the calendar. A sync would send no time and the server would default the class to 08:00 to 09:00,
        // a block the coach could plan around that isn't real. It comes off the calendar instead (a no-op when it was never on it, and it clears
        // blocks an earlier save put there).
        if (!hasTime(c)) {
          const off = await removeClassFromCalendar(c.id);
          return off?.success ? { success: true } : { success: false, error: off?.error ?? 'The calendar sync failed.' };
        }
        const r = await syncClassToCalendar(syncDataOf(c, ctx.term, opts), c.id, ctx.playerId, ctx.teamId);
        if (!r.success) return { success: false, error: r.error ?? 'The calendar sync failed.' };
        // A sync that wrote nothing for a class that has days and a time is the failure the other checks miss: no error, an empty calendar.
        if (r.noMeetings && c.days.length > 0) return { success: false, error: r.noMeetingsReason ?? 'No meetings were scheduled.' };
        return { success: true };
      } catch (err) {
        chReport(err, { surface: 'classes.sync', action: 'syncClassToCalendar', severity: 'low' });
        return { success: false, error: 'The calendar sync did not finish. Try again, or open the class and save it.' };
      }
    },

    async importRows(rows) {
      const payloads = rows.map((r) => ({
        player_id: ctx.playerId,
        team_id: ctx.teamId,
        ...valuesOf({ ...r, name: r.name || r.code || 'Untitled class' }, ctx.term),
        color: r.color || generateClassColor(),
      }));
      // `golf_player_classes` has no uniqueness beyond its id, and calendar-sync reconciles per class id, so importing the same
      // schedule twice doubled the calendar. Skip what is already there. A failed read is not evidence that nothing is, so it stops.
      const existing = await sb.from('golf_player_classes').select('class_name, semester').eq('player_id', ctx.playerId);
      if (existing.error) return { success: false, error: `Couldn't check for classes you already have: ${existing.error.message}` };
      // A row saved before the term column was filled is in the current term (the page reads it so); every new row carries a term.
      const taken = new Set((existing.data ?? []).map((r) => importKey(r.class_name, r.semester?.trim() || ctx.term)));
      const fresh = payloads.filter((p) => !taken.has(importKey(p.class_name, p.semester)));
      const skipped = payloads.filter((p) => taken.has(importKey(p.class_name, p.semester))).map((p) => p.class_name);
      if (!fresh.length) return { success: true, data: { rows: [], skipped } };
      const { data, error } = await sb.from('golf_player_classes').insert(fresh).select(COLUMNS);
      if (error) return res<{ rows: ChClassRow[]; skipped: string[] }>(error);
      return { success: true, data: { rows: (data ?? []) as ChClassRow[], skipped } };
    },

    read: readScheduleLive,
  };
}

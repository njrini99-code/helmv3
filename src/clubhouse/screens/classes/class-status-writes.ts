'use client';

import { createClient } from '@/lib/supabase/client';
import { fromUntyped } from '@/lib/supabase/untyped';
import type { ServerResult } from '../../lib/use-action';

/**
 * P-10 class awareness: the player's own writes (the sharing switch, "No class today", a class's status switch, tagging
 * untagged classes and exams). Browser client, RLS-scoped, exactly like the rest of Classes' writes
 * (screens/classes/writes.ts): the policies in 20261025070000 decide, these only shape the calls. The generated types do
 * not list the new tables and column until the migration is applied, so the tables are reached through `fromUntyped`.
 *
 * A table or column that is not there yet (the migration is held) answers as a failure the caller words; nothing here is
 * reachable with `class_awareness_v1` off.
 */

export interface ChExam {
  id: string;
  /** YYYY-MM-DD, the class zone's day. */
  on: string;
  /** "HH:MM". */
  start: string;
  end: string;
  label: string;
}

export interface ChClassStatusWrites {
  /** The sharing switch: `share_status`. Off also stops holds (the database reads it that way). */
  setShare(shareStatus: boolean): Promise<ServerResult>;
  /** "No class today": one `off` exception for a class, or for all of today (classId null). Returns the new row ids for Undo. */
  markNoClass(input: { on: string; classId: string | null }): Promise<ServerResult<{ ids: string[] }>>;
  undoNoClass(ids: string[]): Promise<ServerResult>;
  /** "Use for class status" on one class. */
  setClassStatusEnabled(classId: string, enabled: boolean): Promise<ServerResult>;
  /** Give the classes with no term this one. */
  tagUntagged(term: string): Promise<ServerResult>;
  loadExams(fromDay: string): Promise<ChExam[]>;
  addExam(input: { on: string; start: string; end: string; label: string }): Promise<ServerResult<{ id: string }>>;
  removeExam(id: string): Promise<ServerResult>;
}

type Failure = { message?: string; code?: string } | null;
const fail = <T = unknown>(error: Failure): ServerResult<T> => ({ success: false, error: error?.message || 'failed' });
const str = (v: unknown) => (typeof v === 'string' && v ? v : null);

export function createLiveClassStatusWrites(ctx: { playerId: string; teamId: string }): ChClassStatusWrites {
  const sb = createClient();
  return {
    async setShare(shareStatus) {
      const { error } = await fromUntyped(sb, 'golf_player_class_settings').upsert(
        { player_id: ctx.playerId, share_status: shareStatus, updated_at: new Date().toISOString() },
        { onConflict: 'player_id' },
      );
      return error ? fail(error) : { success: true };
    },

    async markNoClass({ on, classId }) {
      const { data, error } = await fromUntyped(sb, 'golf_class_exceptions')
        .insert({ team_id: ctx.teamId, player_id: ctx.playerId, class_id: classId, kind: 'off', starts_on: on, ends_on: on })
        .select('id');
      if (error) return fail(error);
      const ids = Array.isArray(data) ? (data as Array<{ id: string }>).map((r) => r.id) : [];
      return ids.length ? { success: true, data: { ids } } : { success: false, error: 'Nothing was saved.' };
    },

    async undoNoClass(ids) {
      if (!ids.length) return { success: true };
      const { error } = await fromUntyped(sb, 'golf_class_exceptions').delete().in('id', ids).eq('player_id', ctx.playerId);
      return error ? fail(error) : { success: true };
    },

    async setClassStatusEnabled(classId, enabled) {
      const { error } = await fromUntyped(sb, 'golf_player_classes').update({ status_enabled: enabled }).eq('id', classId).eq('player_id', ctx.playerId);
      return error ? fail(error) : { success: true };
    },

    async tagUntagged(term) {
      // Only classes with no term at all: a class tagged with another term is not touched.
      const { error } = await fromUntyped(sb, 'golf_player_classes').update({ semester: term }).eq('player_id', ctx.playerId).eq('team_id', ctx.teamId).is('semester', null);
      return error ? fail(error) : { success: true };
    },

    async loadExams(fromDay) {
      const { data, error } = await fromUntyped(sb, 'golf_class_exceptions')
        .select('id, starts_on, start_time, end_time, label')
        .eq('player_id', ctx.playerId)
        .eq('kind', 'extra')
        .gte('starts_on', fromDay)
        .order('starts_on', { ascending: true });
      if (error || !Array.isArray(data)) return [];
      const out: ChExam[] = [];
      for (const r of data as Array<Record<string, unknown>>) {
        const id = str(r.id);
        const on = str(r.starts_on);
        const start = str(r.start_time)?.slice(0, 5);
        const end = str(r.end_time)?.slice(0, 5);
        if (id && on && start && end) out.push({ id, on, start, end, label: str(r.label) ?? '' });
      }
      return out;
    },

    async addExam({ on, start, end, label }) {
      const { data, error } = await fromUntyped(sb, 'golf_class_exceptions')
        .insert({ team_id: ctx.teamId, player_id: ctx.playerId, class_id: null, kind: 'extra', starts_on: on, ends_on: on, start_time: start, end_time: end, label: label.slice(0, 60) })
        .select('id');
      if (error) return fail(error);
      const id = Array.isArray(data) ? (data as Array<{ id: string }>)[0]?.id : undefined;
      return id ? { success: true, data: { id } } : { success: false, error: 'Nothing was saved.' };
    },

    async removeExam(id) {
      const { error } = await fromUntyped(sb, 'golf_class_exceptions').delete().in('id', [id]).eq('player_id', ctx.playerId);
      return error ? fail(error) : { success: true };
    },
  };
}

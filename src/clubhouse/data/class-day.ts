import type { SupabaseClient } from '@supabase/supabase-js';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { inferTermForImport } from '@/lib/golf/semester';
import { toClassDay, toMyClassDay, type ChClassDay, type ChClassTerm, type ChMyClassDay } from './class-day-shape';

/**
 * P-10 class awareness: the client-safe reads. Nothing here imports a server-only module, so the hooks and the
 * screens run the same code the tests do.
 *
 * The migrations are held, and the generated Supabase types list neither the RPCs nor the new tables until they are
 * applied, so every call is cast (the way the Classes import calls golf_import_player_classes). A missing function or
 * table (PGRST202, 42883, 42P01), a refused call (42501) and a payload that does not parse all read as "no class
 * status": the safe direction, so shipping the app before the migrations is invisible.
 */

type Failure = { code?: string; message?: string } | null;
type Rpc = (fn: string, args: object) => PromiseLike<{ data: unknown; error: Failure }>;
type RowsQuery = PromiseLike<{ data: unknown; error: Failure }>;

/** Not applied yet, or not allowed: neither is an error worth showing, and neither is a failed read. */
export const isUnavailable = (error: Failure) => !!error && (error.code === 'PGRST202' || error.code === '42883' || error.code === '42P01' || error.code === '42501' || error.code === 'PGRST205');

const rpcOf = (sb: SupabaseClient): Rpc => (sb as unknown as { rpc: Rpc }).rpc.bind(sb);

export type ChClassRead<T> = { kind: 'ok'; value: T } | { kind: 'unavailable' } | { kind: 'error'; error: unknown };

/** The coach's payload for a team and a date (the class zone's today when omitted). */
export async function readTeamClassDay(sb: SupabaseClient, teamId: string, on?: string, fetchedAt: number = Date.now()): Promise<ChClassRead<ChClassDay>> {
  try {
    const { data, error } = await rpcOf(sb)('golf_team_class_day', { p_team_id: teamId, p_on: on ?? null });
    if (isUnavailable(error)) return { kind: 'unavailable' };
    if (error) return { kind: 'error', error };
    const day = toClassDay(data, fetchedAt);
    return day ? { kind: 'ok', value: day } : { kind: 'unavailable' };
  } catch (error) {
    return { kind: 'error', error };
  }
}

/** The player's own payload. */
export async function readMyClassDay(sb: SupabaseClient, on?: string, fetchedAt: number = Date.now()): Promise<ChClassRead<ChMyClassDay>> {
  try {
    const { data, error } = await rpcOf(sb)('golf_my_class_day', { p_on: on ?? null });
    if (isUnavailable(error)) return { kind: 'unavailable' };
    if (error) return { kind: 'error', error };
    const day = toMyClassDay(data, fetchedAt);
    return day ? { kind: 'ok', value: day } : { kind: 'unavailable' };
  } catch (error) {
    return { kind: 'error', error };
  }
}

/** `loadTeamClassDay` and `loadMyClassDay` for callers that only want the value: null for unavailable and for an error. */
export async function loadTeamClassDay(sb: SupabaseClient, teamId: string, on?: string): Promise<ChClassDay | null> {
  const r = await readTeamClassDay(sb, teamId, on);
  return r.kind === 'ok' ? r.value : null;
}
export async function loadMyClassDay(sb: SupabaseClient, on?: string): Promise<ChMyClassDay | null> {
  const r = await readMyClassDay(sb, on);
  return r.kind === 'ok' ? r.value : null;
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : null);

/** The team's terms, newest first. Empty when the table is not applied, the read failed, or none is saved. */
export async function loadTeamTerms(sb: SupabaseClient, teamId: string): Promise<ChClassTerm[]> {
  try {
    const query = (sb as unknown as { from: (t: string) => { select: (c: string) => { eq: (c: string, v: string) => { order: (c: string, o: { ascending: boolean }) => RowsQuery } } } })
      .from('golf_team_terms')
      .select('id, label, classes_start, classes_end, exams_end, time_zone')
      .eq('team_id', teamId)
      .order('classes_start', { ascending: false });
    const { data, error } = await query;
    if (error || !Array.isArray(data)) return [];
    const out: ChClassTerm[] = [];
    for (const r of data as Record<string, unknown>[]) {
      const id = str(r.id);
      const label = str(r.label);
      const timeZone = str(r.time_zone);
      const classesStart = str(r.classes_start);
      const classesEnd = str(r.classes_end);
      const examsEnd = str(r.exams_end);
      if (id && label && timeZone && classesStart && classesEnd && examsEnd) out.push({ id, label, classesStart, classesEnd, examsEnd, timeZone, phase: 'classes' });
    }
    return out;
  } catch {
    return [];
  }
}

export type ChTeamBreak = { id: string; startsOn: string; endsOn: string; label: string | null };

/** The team's no-class ranges that have not ended (`fromDay` onward), soonest first. Empty when the table is not applied or the read failed. */
export async function loadTeamBreaks(sb: SupabaseClient, teamId: string, fromDay: string): Promise<ChTeamBreak[]> {
  try {
    const query = (sb as unknown as { from: (t: string) => { select: (c: string) => { eq: (c: string, v: string) => { is: (c: string, v: null) => { eq: (c: string, v: string) => { gte: (c: string, v: string) => { order: (c: string, o: { ascending: boolean }) => RowsQuery } } } } } } })
      .from('golf_class_exceptions')
      .select('id, starts_on, ends_on, label')
      .eq('team_id', teamId)
      .is('player_id', null)
      .eq('kind', 'off')
      .gte('ends_on', fromDay)
      .order('starts_on', { ascending: true });
    const { data, error } = await query;
    if (error || !Array.isArray(data)) return [];
    const out: ChTeamBreak[] = [];
    for (const r of data as Record<string, unknown>[]) {
      const id = str(r.id);
      const startsOn = str(r.starts_on);
      const endsOn = str(r.ends_on);
      if (id && startsOn && endsOn) out.push({ id, startsOn, endsOn, label: str(r.label) });
    }
    return out;
  } catch {
    return [];
  }
}

export type ChScheduleCoverage = {
  /** Players with at least one saved class (whatever its term or the sharing switch: the schedule exists). */
  players: number;
  /** The most common term label among their classes, or the term the date falls in when none is tagged. */
  label: string | null;
};

/**
 * How many of the team's players have entered any schedule, and the term label most of them use: what the Home line
 * says when no confirmed term covers today (the payload can't: with no term nobody is tracked), and what the Term
 * sheet prefills. Coaches read their players' classes directly (golf_classes_select_coaches). It counts schedules,
 * never the sharing switch, so a coach can't learn who turned sharing off from it.
 */
export async function loadScheduleCoverage(sb: SupabaseClient, playerIds: readonly string[], todayIso: string): Promise<ChScheduleCoverage | null> {
  if (playerIds.length === 0) return { players: 0, label: inferTermForImport(todayIso) };
  try {
    const have = new Set<string>();
    const labels = new Map<string, { n: number; label: string }>();
    for (const ids of chunkIds(playerIds)) {
      const { data, error } = await (sb.from('golf_player_classes').select('player_id, semester').in('player_id', ids).limit(1000) as unknown as RowsQuery);
      if (error || !Array.isArray(data)) return null;
      for (const r of data as { player_id: string; semester: string | null }[]) {
        have.add(r.player_id);
        const label = r.semester?.trim().replace(/\s+/g, ' ');
        if (!label) continue;
        const key = label.toLowerCase();
        const seen = labels.get(key);
        labels.set(key, { n: (seen?.n ?? 0) + 1, label: seen?.label ?? label });
      }
    }
    const top = [...labels.values()].sort((a, b) => b.n - a.n)[0];
    return { players: have.size, label: top?.label ?? inferTermForImport(todayIso) };
  } catch {
    return null;
  }
}

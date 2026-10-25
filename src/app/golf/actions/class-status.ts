'use server';

/**
 * P-10 class awareness: the coach's two writes, a confirmed term (golf_team_terms) and a team break
 * (golf_class_exceptions, player_id null).
 *
 * Both go through the signed-in user's own client, so the row level security of
 * 20261025070000_golf_class_awareness_tables.sql is the authority: only a coach of the team inserts, updates or
 * deletes a term or a team-wide break. These actions add input checks (so the coach reads a sentence, not a Postgres
 * code) and the mapping from a refused write to a sentence. They are held with the migration: until it is applied the
 * tables do not exist and every call answers "not available yet", which changes nothing.
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { logServerError } from '@/lib/server-error-logger';
import { fromUntyped } from '@/lib/supabase/untyped';

type Result<T = undefined> = { success: true; data?: T } | { success: false; error: string };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const day = z.string().regex(DAY, 'Pick a date');
const uuid = z.string().uuid();

const termSchema = z.object({
  teamId: uuid,
  /** Present when editing the term that already covers today. */
  id: uuid.optional(),
  label: z.string().trim().min(1, 'Name the term').max(40, 'Keep the name to 40 characters'),
  classesStart: day,
  classesEnd: day,
  examsEnd: day,
  timeZone: z.string().min(1).max(64),
});

const breakSchema = z.object({
  teamId: uuid,
  startsOn: day,
  endsOn: day,
  label: z.string().trim().max(60, 'Keep the name to 60 characters').optional(),
});

const MISSING = new Set(['42P01', 'PGRST205', 'PGRST202', '42883']);

const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

/** The sentence for a write the database refused, or null for one it did not. */
function refusal(error: { code?: string; message?: string } | null): string | null {
  if (!error) return null;
  const code = String(error.code ?? '');
  if (MISSING.has(code)) return 'Class status is not available yet';
  if (code === '42501') return 'Only a coach of this team can do that';
  if (code === '23P01') return 'This overlaps another term';
  if (code === '22023') return 'That time zone is not recognised';
  if (code === '23514') return 'Those dates are not allowed';
  return 'Could not save. Try again';
}

async function user() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

async function saveTeamTermImpl(input: z.input<typeof termSchema>): Promise<Result<{ id: string }>> {
  const parsed = termSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Check the dates' };
  const t = parsed.data;
  const lead = dayNumber(t.classesEnd) - dayNumber(t.classesStart);
  if (lead < 0) return { success: false, error: 'Last day of classes must be after classes start' };
  if (lead < 27 || lead > 200) return { success: false, error: 'A term is 4 weeks to about 6 months' };
  const exams = dayNumber(t.examsEnd) - dayNumber(t.classesEnd);
  if (exams < 0 || exams > 21) return { success: false, error: 'Exams end within 3 weeks of the last class' };
  try {
    const { supabase, user: u } = await user();
    if (!u) return { success: false, error: 'You must be signed in' };
    const table = fromUntyped(supabase, 'golf_team_terms');
    const row = { team_id: t.teamId, label: t.label, classes_start: t.classesStart, classes_end: t.classesEnd, exams_end: t.examsEnd, time_zone: t.timeZone };
    const { data, error } = t.id
      ? await table.update(row).eq('id', t.id).eq('team_id', t.teamId).select('id').maybeSingle()
      : await table.insert(row).select('id').single();
    const said = refusal(error);
    if (said) {
      if (!MISSING.has(String(error?.code)) && error?.code !== '42501' && error?.code !== '23P01') {
        await logServerError(`saveTeamTerm failed: ${error?.message}`, { action: 'classes.saveTeamTerm', teamId: t.teamId });
      }
      return { success: false, error: said };
    }
    if (!data) return { success: false, error: 'Only a coach of this team can do that' };
    revalidatePath('/golf/dashboard');
    return { success: true, data: { id: String(data.id) } };
  } catch (err) {
    await logServerError(`saveTeamTerm threw: ${err instanceof Error ? err.message : String(err)}`, { action: 'classes.saveTeamTerm', teamId: t.teamId });
    return { success: false, error: 'Could not save. Try again' };
  }
}

async function addTeamBreakImpl(input: z.input<typeof breakSchema>): Promise<Result<{ id: string }>> {
  const parsed = breakSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Check the dates' };
  const b = parsed.data;
  const span = dayNumber(b.endsOn) - dayNumber(b.startsOn);
  if (span < 0) return { success: false, error: 'The last day must be on or after the first' };
  if (span > 20) return { success: false, error: 'A break is at most 21 days' };
  try {
    const { supabase, user: u } = await user();
    if (!u) return { success: false, error: 'You must be signed in' };
    const { data, error } = await fromUntyped(supabase, 'golf_class_exceptions')
      .insert({ team_id: b.teamId, player_id: null, kind: 'off', starts_on: b.startsOn, ends_on: b.endsOn, label: b.label || null })
      .select('id')
      .single();
    const said = refusal(error);
    if (said) {
      if (!MISSING.has(String(error?.code)) && error?.code !== '42501') {
        await logServerError(`addTeamBreak failed: ${error?.message}`, { action: 'classes.addTeamBreak', teamId: b.teamId });
      }
      return { success: false, error: said };
    }
    revalidatePath('/golf/dashboard');
    return { success: true, data: { id: String(data?.id) } };
  } catch (err) {
    await logServerError(`addTeamBreak threw: ${err instanceof Error ? err.message : String(err)}`, { action: 'classes.addTeamBreak', teamId: b.teamId });
    return { success: false, error: 'Could not save. Try again' };
  }
}

async function removeTeamBreakImpl(input: { id: string; teamId: string }): Promise<Result> {
  const parsed = z.object({ id: uuid, teamId: uuid }).safeParse(input);
  if (!parsed.success) return { success: false, error: 'That break is not available' };
  try {
    const { supabase, user: u } = await user();
    if (!u) return { success: false, error: 'You must be signed in' };
    // Team-wide rows only: a player's own "No class today" is theirs to undo, never a coach's to delete.
    const { data, error } = await fromUntyped(supabase, 'golf_class_exceptions')
      .delete()
      .eq('id', parsed.data.id)
      .eq('team_id', parsed.data.teamId)
      .is('player_id', null)
      .select('id');
    const said = refusal(error);
    if (said) {
      if (!MISSING.has(String(error?.code)) && error?.code !== '42501') {
        await logServerError(`removeTeamBreak failed: ${error?.message}`, { action: 'classes.removeTeamBreak', teamId: parsed.data.teamId });
      }
      return { success: false, error: said };
    }
    if (!Array.isArray(data) || data.length === 0) return { success: false, error: 'That break is already gone' };
    revalidatePath('/golf/dashboard');
    return { success: true };
  } catch (err) {
    await logServerError(`removeTeamBreak threw: ${err instanceof Error ? err.message : String(err)}`, { action: 'classes.removeTeamBreak', teamId: parsed.data.teamId });
    return { success: false, error: 'Could not remove it. Try again' };
  }
}

const observedSaveTeamTerm = withAdminObserved('saveTeamTerm', { demoSafe: true, sport: 'golf', feature: 'academics_classes', observeSoftFailures: false, contextFrom: ([i]) => ({ teamId: i.teamId }) }, saveTeamTermImpl);
const observedAddTeamBreak = withAdminObserved('addTeamBreak', { demoSafe: true, sport: 'golf', feature: 'academics_classes', observeSoftFailures: false, contextFrom: ([i]) => ({ teamId: i.teamId }) }, addTeamBreakImpl);
const observedRemoveTeamBreak = withAdminObserved('removeTeamBreak', { demoSafe: true, sport: 'golf', feature: 'academics_classes', observeSoftFailures: false, contextFrom: ([i]) => ({ teamId: i.teamId }) }, removeTeamBreakImpl);

/** Confirm this term's dates (insert, or update with `id`). The coach's confirmation is the only way a term exists. */
export async function saveTeamTerm(input: z.input<typeof termSchema>): Promise<Result<{ id: string }>> {
  return observedSaveTeamTerm(input);
}

/** Mark a team-wide no-class range (at most 21 days). */
export async function addTeamBreak(input: z.input<typeof breakSchema>): Promise<Result<{ id: string }>> {
  return observedAddTeamBreak(input);
}

/** Remove a team-wide break. The screen asks first. */
export async function removeTeamBreak(input: { id: string; teamId: string }): Promise<Result> {
  return observedRemoveTeamBreak(input);
}

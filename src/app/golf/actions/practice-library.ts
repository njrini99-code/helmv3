'use server';

import { createClient } from '@/lib/supabase/server';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { practiceTables, type TeamDrillRow } from '@/lib/golf/practice-db';
import { isPracticeMissing } from '@/lib/golf/practice-errors';
import type { PracticeResult } from './practice-plans';

export interface DrillInput {
  teamId: string;
  name: string;
  area: string;
  kind: TeamDrillRow['kind'];
  minutes: number;
  setup?: string;
  goal?: string;
  /**
   * Optional. A UUID the caller keeps for one request: it becomes the drill's own id, so the same request sent twice
   * (a retry after a lost response) answers with the first drill and never makes a second. Left out, nothing changes.
   */
  requestId?: string;
}

const REQUEST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const check = (d: DrillInput): string | null => {
  if (!d.name.trim()) return 'Name the drill.';
  if (!Number.isInteger(d.minutes) || d.minutes < 1 || d.minutes > 180) return 'Minutes are 1 to 180.';
  return null;
};

async function who() {
  const sb = await createClient();
  const { data } = await sb.auth.getUser();
  return { sb, userId: data.user?.id ?? null };
}

async function createTeamDrillImpl(input: DrillInput): Promise<PracticeResult<{ id: string }>> {
  const bad = check(input);
  if (bad) return { success: false, error: bad, code: 'CH-17112' };
  const { sb, userId } = await who();
  if (!userId) return { success: false, error: 'Not signed in.' };
  if (input.requestId !== undefined && !REQUEST_ID_RE.test(input.requestId)) return { success: false, error: 'Couldn’t save the drill. It wasn’t added to the plan.', code: 'CH-17112' };
  const { data, error } = await practiceTables(sb).from('golf_team_drills').insert({ ...(input.requestId ? { id: input.requestId } : {}), team_id: input.teamId, name: input.name.trim(), area: input.area, kind: input.kind, minutes: input.minutes, setup: input.setup ?? '', goal: input.goal ?? '', created_by: userId } as never).select('id').maybeSingle();
  // The same request again: the drill it made the first time is the answer (the id is the request's, and it is this team's).
  if (error?.code === '23505' && input.requestId) {
    const { data: first } = await practiceTables(sb).from('golf_team_drills').select('id').eq('id', input.requestId).eq('team_id', input.teamId).maybeSingle();
    if (first) return { success: true, id: (first as { id: string }).id };
  }
  if (error || !data) return { success: false, error: 'Couldn’t save the drill. It wasn’t added to the plan.', code: 'CH-17006', unavailable: isPracticeMissing(error?.code) };
  return { success: true, id: data.id };
}

async function copyLibraryDrillImpl(input: { teamId: string; drillId: string }): Promise<PracticeResult<{ id: string }>> {
  const { sb, userId } = await who();
  if (!userId) return { success: false, error: 'Not signed in.' };
  const db = practiceTables(sb);
  const { data: src, error: srcError } = await sb.from('golf_drills').select('title, category, duration_min, description').eq('id', input.drillId).maybeSingle();
  if (srcError) return { success: false, error: 'Couldn’t copy the drill.', code: 'CH-17006' };
  if (!src) return { success: false, error: 'That drill is gone.', code: 'CH-17006' };
  const { data, error } = await db.from('golf_team_drills').insert({ team_id: input.teamId, name: src.title, area: 'short_game', kind: 'skill', minutes: src.duration_min, setup: src.description, copied_from_drill_id: input.drillId, created_by: userId } as never).select('id').maybeSingle();
  if (error || !data) return { success: false, error: 'Couldn’t copy the drill.', code: 'CH-17006', unavailable: isPracticeMissing(error?.code) };
  return { success: true, id: data.id };
}

async function archiveTeamDrillImpl(input: { drillId: string; archived: boolean }): Promise<PracticeResult<object>> {
  const { sb } = await who();
  const { error } = await practiceTables(sb).from('golf_team_drills').update({ archived_at: input.archived ? new Date().toISOString() : null }).eq('id', input.drillId);
  return error ? { success: false, error: 'Couldn’t save the drill.', code: 'CH-17006', unavailable: isPracticeMissing(error.code) } : { success: true };
}

/** The drill page's Edit (N-00 4.7): drafts pick up the change; published plans keep their frozen copy. */
async function updateTeamDrillImpl(input: DrillInput & { drillId: string }): Promise<PracticeResult<object>> {
  const bad = check(input);
  if (bad) return { success: false, error: bad, code: 'CH-17112' };
  const { sb, userId } = await who();
  if (!userId) return { success: false, error: 'Not signed in.' };
  const { error } = await practiceTables(sb).from('golf_team_drills').update({ name: input.name.trim(), area: input.area, kind: input.kind, minutes: input.minutes, setup: input.setup ?? '', goal: input.goal ?? '', updated_by: userId }).eq('id', input.drillId).eq('team_id', input.teamId);
  if (error) return { success: false, error: 'Couldn’t save the drill.', code: 'CH-17006', unavailable: isPracticeMissing(error.code) };
  return { success: true };
}

export interface GroupInput {
  teamId: string;
  groupId: string | null;
  name: string;
  playerIds: string[];
}
async function saveGroupImpl(input: GroupInput): Promise<PracticeResult<{ id: string }>> {
  const name = input.name.trim();
  if (!name || name.length > 40) return { success: false, error: 'Name the group, up to 40 characters.', code: 'CH-17113' };
  if (input.playerIds.length > 30) return { success: false, error: 'A group holds up to 30 players.', code: 'CH-17113' };
  const { sb, userId } = await who();
  if (!userId) return { success: false, error: 'Not signed in.' };
  const db = practiceTables(sb).from('golf_practice_groups');
  const res = input.groupId
    ? await db.update({ name, player_ids: input.playerIds }).eq('id', input.groupId).eq('team_id', input.teamId).select('id').single()
    : await db.insert({ team_id: input.teamId, name, player_ids: input.playerIds, created_by: userId }).select('id').single();
  if (res.error || !res.data) {
    if (res.error?.code === '23505') return { success: false, error: 'You already have a group with that name.', code: 'CH-17113' };
    return { success: false, error: 'Couldn’t save the group.', code: 'CH-17006', unavailable: isPracticeMissing(res.error?.code) };
  }
  return { success: true, id: (res.data as { id: string }).id };
}
async function deleteGroupImpl(input: { teamId: string; groupId: string }): Promise<PracticeResult<object>> {
  const { sb } = await who();
  const { error } = await practiceTables(sb).from('golf_practice_groups').delete().eq('id', input.groupId).eq('team_id', input.teamId);
  if (error) return { success: false, error: 'Couldn’t delete the group.', code: 'CH-17006', unavailable: isPracticeMissing(error.code) };
  return { success: true };
}

async function duplicateTemplateImpl(input: { teamId: string; name: string; kind: 'session' | 'block'; minutes: number; body: unknown }): Promise<PracticeResult<{ id: string }>> {
  const { sb, userId } = await who();
  if (!userId) return { success: false, error: 'Not signed in.' };
  const { data, error } = await practiceTables(sb).from('golf_practice_templates').insert({ team_id: input.teamId, name: input.name.trim().slice(0, 60), kind: input.kind, minutes: input.minutes, body: input.body, created_by: userId }).select('id').single();
  if (error || !data) return { success: false, error: 'Couldn’t save the template.', code: 'CH-17006', unavailable: isPracticeMissing(error?.code) };
  return { success: true, id: (data as { id: string }).id };
}
async function renameTemplateImpl(input: { teamId: string; templateId: string; name: string }): Promise<PracticeResult<object>> {
  const name = input.name.trim();
  if (!name || name.length > 60) return { success: false, error: 'Name it, up to 60 characters.', code: 'CH-17112' };
  const { sb } = await who();
  const { error } = await practiceTables(sb).from('golf_practice_templates').update({ name }).eq('id', input.templateId).eq('team_id', input.teamId);
  if (error) return { success: false, error: 'Couldn’t rename the template.', code: 'CH-17006', unavailable: isPracticeMissing(error.code) };
  return { success: true };
}
async function deleteTemplateImpl(input: { teamId: string; templateId: string }): Promise<PracticeResult<object>> {
  const { sb } = await who();
  const { error } = await practiceTables(sb).from('golf_practice_templates').delete().eq('id', input.templateId).eq('team_id', input.teamId);
  if (error) return { success: false, error: 'Couldn’t delete the template.', code: 'CH-17006', unavailable: isPracticeMissing(error.code) };
  return { success: true };
}

const observedUpdate = withAdminObserved('updateTeamDrill', { sport: 'golf', feature: 'practice_plans' }, updateTeamDrillImpl);
const observedSaveGroup = withAdminObserved('savePracticeGroup', { sport: 'golf', feature: 'practice_plans' }, saveGroupImpl);
const observedDeleteGroup = withAdminObserved('deletePracticeGroup', { sport: 'golf', feature: 'practice_plans' }, deleteGroupImpl);
const observedDuplicate = withAdminObserved('savePracticeTemplate', { sport: 'golf', feature: 'practice_plans' }, duplicateTemplateImpl);
const observedRename = withAdminObserved('renamePracticeTemplate', { sport: 'golf', feature: 'practice_plans' }, renameTemplateImpl);
const observedDeleteTemplate = withAdminObserved('deletePracticeTemplate', { sport: 'golf', feature: 'practice_plans' }, deleteTemplateImpl);
export async function updateTeamDrill(input: DrillInput & { drillId: string }) {
  return observedUpdate(input);
}
export async function savePracticeGroup(input: GroupInput) {
  return observedSaveGroup(input);
}
export async function deletePracticeGroup(input: { teamId: string; groupId: string }) {
  return observedDeleteGroup(input);
}
export async function savePracticeTemplate(input: { teamId: string; name: string; kind: 'session' | 'block'; minutes: number; body: unknown }) {
  return observedDuplicate(input);
}
export async function renamePracticeTemplate(input: { teamId: string; templateId: string; name: string }) {
  return observedRename(input);
}
export async function deletePracticeTemplate(input: { teamId: string; templateId: string }) {
  return observedDeleteTemplate(input);
}

const observedCreate = withAdminObserved('createTeamDrill', { sport: 'golf', feature: 'practice_plans' }, createTeamDrillImpl);
const observedCopy = withAdminObserved('copyLibraryDrill', { sport: 'golf', feature: 'practice_plans' }, copyLibraryDrillImpl);
const observedArchive = withAdminObserved('archiveTeamDrill', { sport: 'golf', feature: 'practice_plans' }, archiveTeamDrillImpl);

export async function createTeamDrill(input: DrillInput) {
  return observedCreate(input);
}
export async function copyLibraryDrill(input: { teamId: string; drillId: string }) {
  return observedCopy(input);
}
export async function archiveTeamDrill(input: { drillId: string; archived: boolean }) {
  return observedArchive(input);
}

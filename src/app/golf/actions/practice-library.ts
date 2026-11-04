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
}

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
  const { data, error } = await practiceTables(sb).from('golf_team_drills').insert({ team_id: input.teamId, name: input.name.trim(), area: input.area, kind: input.kind, minutes: input.minutes, setup: input.setup ?? '', goal: input.goal ?? '', created_by: userId } as never).select('id').maybeSingle();
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

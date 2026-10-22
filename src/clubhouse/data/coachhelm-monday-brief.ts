import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { loadMondayBrief } from '@/lib/coachhelm/v3/monday-brief/loader';
import { chLogServer } from '../lib/track-server';
import { loadCoachHelmGate } from './coachhelm';
import { toChMondayBrief, type ChMondayBrief } from './coachhelm-monday-brief-shape';
import type { ChViewLoad } from './coachhelm-views-shape';

export type * from './coachhelm-monday-brief-shape';

/**
 * The coach's Monday brief for one team (P013 `?view=monday-brief`, flag `coachhelm_monday_brief_v1`; the route checks the flag).
 * Read only once CoachHelm is on for this coach and this team, as the Track record is. Never throws: a read that failed is
 * `failed`, never an empty brief. The computing is `computeMondayBrief`'s (pure); the reads are `loadMondayBrief`'s.
 */
/**
 * Whether this coach may read this team's brief: CoachHelm on for the coach (`loadCoachHelmGate`) and for the team
 * (`golf_team_coachhelm_settings`, no row = on). `null` when both are on; otherwise the view's `off` or `failed` answer.
 * The Monday brief and the coach Brief (data/coachhelm-coach-brief.ts) both check it before any read.
 */
export async function briefGate(supabase: Awaited<ReturnType<typeof createClient>>, coachId: string, teamId: string): Promise<ChViewLoad<never> | null> {
  const gate = await loadCoachHelmGate(coachId);
  if (gate.status === 'off') return { status: 'off', reason: gate.off.reason };
  if (gate.status === 'failed') return { status: 'failed' };
  // The gate above is the coach's; the brief is one team's, so that team must be on too.
  const { data, error } = await supabase.from('golf_team_coachhelm_settings').select('enabled, disabled_reason').eq('team_id', teamId).maybeSingle();
  if (error) {
    chLogServer('coachhelm', 'monday_brief_team_gate', error);
    return { status: 'failed' };
  }
  if (data?.enabled === false) {
    const reason = data.disabled_reason && !/^Disabled by (user|team)$/.test(data.disabled_reason) ? data.disabled_reason : null;
    return { status: 'off', reason };
  }
  return null;
}

export async function loadCoachMondayBrief(input: { coachId: string; teamId: string; now?: Date }): Promise<ChViewLoad<ChMondayBrief>> {
  try {
    const supabase = await createClient();
    const closed = await briefGate(supabase, input.coachId, input.teamId);
    if (closed) return closed;

    const brief = await loadMondayBrief(supabase, input.teamId, input.now ?? new Date());
    if (!brief) return { status: 'failed' };
    return { status: 'ready', data: toChMondayBrief(brief) };
  } catch (err) {
    chLogServer('coachhelm', 'monday_brief', err);
    return { status: 'failed' };
  }
}

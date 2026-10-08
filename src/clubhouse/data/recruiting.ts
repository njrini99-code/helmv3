import 'server-only';
import { getRecruits } from '@/app/golf/actions/recruiting';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { createClient } from '@/lib/supabase/server';
import { chLogServer } from '../lib/track-server';
import { isProgramGender, parseDivision } from './recruiting-calendar';
import { toProspect, type ChRecruiting } from './recruiting-shape';

/**
 * The Recruiting page's one read (Clubhouse, coach only). It is the current page's own action, `getRecruits`, which
 * resolves the coach's active team from the session and filters the read on it, with RLS behind that, so this loader
 * adds no team logic of its own and a player's session has no path to the rows. A read that fails is flagged, never
 * thrown and never turned into an empty list; a coach with no resolvable team gets its own answer.
 *
 * Two quiet extras, both guarded so neither can fail the page:
 * - Whether golf_recruits has the next-step columns yet (P014 C1). A zero-row probe names one column; any error,
 *   42703 before the migration is applied included, reads as "not yet" and the page hides every next-step surface.
 *   The list itself stays on `select('*')`, so it never names a column that may not exist.
 * - The program the recruiting calendar reads (C2): the team's gender and its organization's free-text division.
 */
export type ChRecruitingLoad = { kind: 'ready'; data: ChRecruiting } | { kind: 'noTeam' };

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function hasNextStepColumns(supabase: Supabase): Promise<boolean> {
  const { error } = await supabase.from('golf_recruits').select('next_step_date', { head: true }).limit(0);
  return !error;
}

async function programOf(supabase: Supabase): Promise<NonNullable<ChRecruiting['program']> | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: coach } = await supabase.from('golf_coaches').select('id, organization_id').eq('user_id', user.id).maybeSingle();
  if (!coach?.organization_id) return null;
  const teamId = await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id);
  if (!teamId) return null;
  const { data: team, error } = await supabase.from('golf_teams').select('gender, organization:organizations(division)').eq('id', teamId).maybeSingle();
  if (error || !team) return null;
  const t = team as { gender: string | null; organization: { division: string | null } | null };
  return { division: parseDivision(t.organization?.division), gender: isProgramGender(t.gender) ? t.gender : null };
}

/** The extras, never thrown: a failure is "feature off" and "program unknown". */
async function extras(): Promise<Pick<ChRecruiting, 'nextStep' | 'program'>> {
  let supabase: Supabase;
  try {
    supabase = await createClient();
  } catch {
    return {};
  }
  const [nextStep, program] = await Promise.all([hasNextStepColumns(supabase).catch(() => false), programOf(supabase).catch(() => null)]);
  return { ...(nextStep ? { nextStep: true } : {}), ...(program ? { program } : {}) };
}

export async function loadRecruiting(now: Date = new Date()): Promise<ChRecruitingLoad> {
  let result: Awaited<ReturnType<typeof getRecruits>>;
  const more = extras();
  try {
    result = await getRecruits();
  } catch (e) {
    chLogServer('recruiting', 'prospects', e, 'recruiting');
    return { kind: 'ready', data: { prospects: [], error: true, now: now.toISOString(), ...(await more) } };
  }
  if (!result.success && result.errorCode === 'no_team') return { kind: 'noTeam' };
  if (!result.success) chLogServer('recruiting', 'prospects', result.error ?? 'unknown', 'recruiting');
  return {
    kind: 'ready',
    data: { prospects: result.success ? (result.data ?? []).map(toProspect) : [], error: !result.success, now: now.toISOString(), ...(await more) },
  };
}

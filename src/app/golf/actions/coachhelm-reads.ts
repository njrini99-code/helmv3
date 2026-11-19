'use server';

/**
 * CoachHelm reads: the coach's three actions on a card (Set focus from this card, Not useful, Wrong), behind
 * `coachhelm_reads_v1` for the listed team. The work is in src/lib/coachhelm/v3/analyst/reads/actions.ts; this file
 * resolves who is asking and in which team from the session (never from the client), and wraps each action so a
 * failure reaches the incident queue. Mutating: blocked for the shared demo account.
 */

import { withAdminObserved } from '@/lib/admin/observed-action';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { pickGolfDashboardRole } from '@/lib/auth/golf-dashboard-role';
import { getValidTimezone } from '@/lib/calendar/timezone';
import { markRead, setFocusFromRead, type FeedbackSaved, type FocusSet, type ReadActionResult, type ReadActionScope } from '@/lib/coachhelm/v3/analyst/reads/actions';
import type { CoachVerdict } from '@/lib/coachhelm/v3/analyst/reads/memory';
import { resolveCoachActiveTeamForRequest } from '@/lib/golf/dashboard-request-cache';
import { logServerError } from '@/lib/server-error-logger';
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

type Scope = { ok: true; scope: ReadActionScope } | { ok: false; error: string };

/** The signed-in coach, their active team (the one their pages are in) and the team's zone. */
async function coachScope(): Promise<Scope> {
  const session = await getGolfSessionProfile();
  if (!session || pickGolfDashboardRole(session) !== 'coach' || !session.coach) return { ok: false, error: 'Only a coach can do this.' };
  const team = await resolveCoachActiveTeamForRequest(session.coach.organization_id ?? null, session.coach.id);
  if (team.status !== 'ok') return { ok: false, error: team.status === 'failed' ? 'Your team could not be read. Try again.' : 'You are not on a team yet.' };
  const supabase = await createClient();
  const zone = await supabase.from('golf_team_settings').select('timezone').eq('team_id', team.teamId).maybeSingle();
  if (zone.error) await logServerError(`coachhelm.reads action: reading the team zone failed: ${zone.error.message}`, { action: 'coachhelm.reads.action', featureArea: 'coachhelm', teamId: team.teamId }, 'warning').catch(() => undefined);
  return { ok: true, scope: { sb: supabase as unknown as SupabaseClient, coachId: session.coach.id, teamId: team.teamId, zone: getValidTimezone((zone.data as { timezone?: string | null } | null)?.timezone ?? null) } };
}

const observedSetFocus = withAdminObserved(
  'setFocusFromCoachHelmRead',
  { sport: 'golf', feature: 'coachhelm_ai_engine', featureArea: 'coachhelm', demoSafe: true, contextFrom: ([input]) => ({ playerId: input.playerId }) },
  async (input: { id: string; playerId: string; cardKey: string }): Promise<ReadActionResult<FocusSet>> => {
    const s = await coachScope();
    if (!s.ok) return { success: false, error: s.error };
    return setFocusFromRead(s.scope, input);
  },
);

const observedMark = withAdminObserved(
  'markCoachHelmRead',
  { sport: 'golf', feature: 'coachhelm_ai_engine', featureArea: 'coachhelm', demoSafe: true, contextFrom: ([input]) => ({ playerId: input.playerId }) },
  async (input: { id: string; playerId: string; cardKey: string; verdict: CoachVerdict; reason?: string | null }): Promise<ReadActionResult<FeedbackSaved>> => {
    const s = await coachScope();
    if (!s.ok) return { success: false, error: s.error };
    return markRead(s.scope, input);
  },
);

/** Set a focus from the card. `id` is made once per tap by the page, so a Retry writes nothing twice. */
export async function setFocusFromCoachHelmRead(input: { id: string; playerId: string; cardKey: string }): Promise<ReadActionResult<FocusSet>> {
  return observedSetFocus(input);
}

/** "Not useful" (reason optional) or "Wrong" (reason required). The card steps down until the evidence changes materially. */
export async function markCoachHelmRead(input: { id: string; playerId: string; cardKey: string; verdict: CoachVerdict; reason?: string | null }): Promise<ReadActionResult<FeedbackSaved>> {
  return observedMark(input);
}

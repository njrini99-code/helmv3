import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSessionProfile, type CoachType } from '@/lib/auth/session';
import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import { getDefaultProgramSettings } from '@/lib/baseball/program-type-variants';
import { fromUntyped } from '@/lib/supabase/untyped';
import {
  BASEBALL_PROGRAM_TYPES,
  type BaseballProgramType,
} from '@/lib/types/baseball-settings';

const RECRUITING_PROGRAM_TYPES = new Set<BaseballProgramType>([
  'college',
  'juco',
  'showcase',
  'academy',
  'club',
]);

const SHOWCASE_PROGRAM_TYPES = new Set<BaseballProgramType>([
  'showcase',
  'academy',
  'club',
]);

async function getActiveProgramType(): Promise<BaseballProgramType | null> {
  const ctx = await getActiveBaseballContext();
  if (!ctx?.activeTeamId) return null;

  const supabase = await createClient();
  const { data } = await fromUntyped(supabase, 'baseball_teams')
    .select('program_type')
    .eq('id', ctx.activeTeamId)
    .maybeSingle();

  const raw = (data as { program_type?: unknown } | null)?.program_type;
  return typeof raw === 'string' && (BASEBALL_PROGRAM_TYPES as readonly string[]).includes(raw)
    ? (raw as BaseballProgramType)
    : null;
}

export async function requireBaseballCoachRoute(options?: {
  allowedCoachTypes?: readonly CoachType[];
  allowedProgramTypes?: readonly BaseballProgramType[];
  redirectTo?: string;
}) {
  const redirectTo = options?.redirectTo ?? '/baseball/dashboard/command-center';
  const session = await getSessionProfile();

  if (!session) redirect('/baseball/login');
  if (session.role !== 'coach' || !session.coach) redirect(redirectTo);

  const hasCoachTypeGate = Boolean(options?.allowedCoachTypes);
  const hasProgramTypeGate = Boolean(options?.allowedProgramTypes);
  const coachTypeAllowed = options?.allowedCoachTypes?.includes(session.coach.coach_type) ?? false;
  let programTypeAllowed = false;

  if (hasProgramTypeGate) {
    const programType = await getActiveProgramType();
    programTypeAllowed = Boolean(programType && options?.allowedProgramTypes?.includes(programType));
  }

  if (hasCoachTypeGate || hasProgramTypeGate) {
    const allowed = (hasCoachTypeGate && coachTypeAllowed) || (hasProgramTypeGate && programTypeAllowed);
    if (!allowed) redirect(redirectTo);
  }

  return session;
}

export async function requireRecruitingCoachRoute(redirectTo = '/baseball/dashboard/command-center') {
  return requireBaseballCoachRoute({
    allowedCoachTypes: ['college', 'juco', 'showcase'],
    allowedProgramTypes: [...RECRUITING_PROGRAM_TYPES],
    redirectTo,
  });
}

export async function requireShowcaseOrgRoute(redirectTo = '/baseball/dashboard/command-center') {
  return requireBaseballCoachRoute({
    allowedCoachTypes: ['showcase'],
    allowedProgramTypes: [...SHOWCASE_PROGRAM_TYPES],
    redirectTo,
  });
}

/**
 * Academics is a capability-gated feature module (`can_view_academics`), not a
 * program-type-only surface (fixes #508 — college programs were hard-blocked
 * even though nav + program-type defaults enable Academics for them). Every
 * program type can turn the module on or off via
 * `baseball_program_settings.academics_module_enabled`. College/JUCO default
 * the module ON, HS/showcase/academy/club default it OFF, but a team can
 * override that default either way, so this guard reads the team's actual
 * persisted setting rather than hard-coding a single allowed program type.
 * Falls back to the program-type default only when the team has no settings
 * row yet (matches getProgramSettings' lazy-create behavior).
 */
export async function requireAcademicsCoachRoute(redirectTo = '/baseball/dashboard/command-center') {
  const session = await requireBaseballCoachRoute({ redirectTo });

  const ctx = await getActiveBaseballContext();
  if (!ctx?.activeTeamId) redirect(redirectTo);

  const programType = await getActiveProgramType();
  const supabase = await createClient();
  const { data } = await fromUntyped(supabase, 'baseball_program_settings')
    .select('academics_module_enabled')
    .eq('team_id', ctx.activeTeamId)
    .maybeSingle();

  const raw = (data as { academics_module_enabled?: unknown } | null)?.academics_module_enabled;
  const academicsEnabled =
    typeof raw === 'boolean'
      ? raw
      : getDefaultProgramSettings(programType ?? 'college').academics_module_enabled;

  if (!academicsEnabled) redirect(redirectTo);

  return session;
}

export async function requireBaseballPlayerRoute(options?: {
  redirectTo?: string;
}) {
  const coachRedirect = options?.redirectTo ?? '/baseball/dashboard/stats-center';
  const session = await getSessionProfile();

  if (!session) redirect('/baseball/login');
  if (session.role === 'coach' || session.coach) redirect(coachRedirect);
  if (session.role !== 'player' || !session.player) redirect('/baseball/login');

  return session;
}

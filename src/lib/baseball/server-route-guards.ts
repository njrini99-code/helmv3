import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSessionProfile, type CoachType } from '@/lib/auth/session';
import { getActiveBaseballContext } from '@/lib/baseball/active-context';
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

export async function requireAcademicsCoachRoute(redirectTo = '/baseball/dashboard/command-center') {
  return requireBaseballCoachRoute({
    allowedCoachTypes: ['juco'],
    allowedProgramTypes: ['juco'],
    redirectTo,
  });
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

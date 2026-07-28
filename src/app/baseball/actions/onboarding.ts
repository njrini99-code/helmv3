'use server';

import { withAdminObserved } from '@/lib/admin/observed-action';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { randomBytes } from 'crypto';
import { checkRateLimit, RATE_LIMITS, formatTimeRemaining } from '@/lib/auth/supabase-rate-limit';
import { validatePassword } from '@/lib/auth/password-validation';
import type { User } from '@supabase/supabase-js';
import { logServerError } from '@/lib/server-error-logger';
import { CommonSchemas } from '@/lib/validation/server-action-validator';
import {
  withBaseballAction,
  BaseballUnauthorizedError,
  BaseballActionError,
} from '@/lib/baseball/with-baseball-action';
import { describeError } from '@/lib/utils/describe-error';

// ─── Types ──────────────────────────────────────────────────────────────────

type CoachType = 'college' | 'juco' | 'high_school' | 'showcase';
type PlayerType = 'high_school' | 'showcase' | 'juco' | 'college';

export type OnboardingResult = {
  success: boolean;
  error?: string;
  redirectTo?: string;
};

// ─── Validation Helpers ─────────────────────────────────────────────────────

const VALID_COACH_TYPES: CoachType[] = ['college', 'juco', 'high_school', 'showcase'];
const VALID_PLAYER_TYPES: PlayerType[] = ['high_school', 'showcase', 'juco', 'college'];
const VALID_BATS = ['L', 'R', 'S'];
const VALID_THROWS = ['L', 'R'];

function generateJoinCode(): string {
  return randomBytes(4).toString('hex').toUpperCase().slice(0, 8);
}

function sanitizeString(input: string, maxLength = 255): string {
  return input.trim().slice(0, maxLength);
}

/** Coerce to a finite number within [min, max], or null for anything else (empty/NaN/out of range). */
function clampNullableNumber(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.max(min, Math.min(max, num));
}

/** Whitelist-validate a handedness value; anything not in `allowed` is dropped (null). */
function sanitizeHandedness(value: string | null | undefined, allowed: string[]): string | null {
  if (!value) return null;
  const upper = value.trim().toUpperCase();
  return allowed.includes(upper) ? upper : null;
}

/**
 * Ensure the public.users row exists with the requested self-service role,
 * WITHOUT demoting an existing 'admin'. A plain upsert here runs as
 * service_role (bypasses the self-escalation trigger) and clobbered
 * admin@helmsportslabs.com down to 'coach' on 2026-07-03, locking the only
 * admin out of /golf/admin. player<->coach conversion stays allowed.
 */
async function ensureUserRowPreservingAdmin(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  email: string,
  role: 'coach' | 'player',
): Promise<{ error: unknown }> {
  const { data: existing, error: readError } = await admin
    .from('users')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  if (readError) return { error: readError };

  if (!existing) {
    const { error } = await admin
      .from('users')
      .upsert({ id: userId, email, role }, { onConflict: 'id', ignoreDuplicates: true });
    return { error };
  }
  if (existing.role === 'admin' || existing.role === role) return { error: null };

  const { error } = await admin.from('users').update({ role }).eq('id', userId);
  return { error };
}

/**
 * Supabase PostgrestError objects are plain objects, not Error instances, so
 * `String(err)` / `err instanceof Error` produced the useless "[object Object]"
 * in our logs — which is exactly what hid the real cause of the silent
 * team-creation failure. Extract message/code/details/hint for actionable logs.
 */
function describeDbError(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { message?: string; code?: string; details?: string; hint?: string };
    const parts = [
      e.message,
      e.code ? `code=${e.code}` : null,
      e.details ? `details=${e.details}` : null,
      e.hint ? `hint=${e.hint}` : null,
    ].filter(Boolean);
    if (parts.length > 0) return parts.join(' | ');
  }
  return err instanceof Error ? err.message : String(err);
}

type CoachOnboardingInput = {
  coachType: string;
  schoolName: string;
  division?: string;
  city?: string;
  state?: string;
  fullName: string;
  title?: string;
};

function mapOnboardingCoachActionError(error: unknown): OnboardingResult {
  if (error instanceof BaseballUnauthorizedError) {
    return { success: false, error: 'You must be signed in to complete onboarding.' };
  }
  if (error instanceof BaseballActionError) {
    return { success: false, error: error.message };
  }
  if (error instanceof Error) {
    return { success: false, error: error.message };
  }
  return { success: false, error: 'An unexpected error occurred.' };
}

async function runCompleteCoachOnboardingCore(
  user: User,
  data: CoachOnboardingInput,
): Promise<OnboardingResult> {
  const admin = createAdminClient();

  const coachType = data.coachType as CoachType;
  if (!VALID_COACH_TYPES.includes(coachType)) {
    return { success: false, error: 'Invalid coach type.' };
  }

  const schoolName = sanitizeString(data.schoolName);
  if (!schoolName) {
    return { success: false, error: 'School name is required.' };
  }

  const fullName = sanitizeString(data.fullName);
  const title = data.title ? sanitizeString(data.title) : null;
  const division = data.division ? sanitizeString(data.division) : null;
  const city = data.city ? sanitizeString(data.city, 100) : null;
  const state = data.state ? sanitizeString(data.state, 2) : null;

  const { data: existingCoach } = await admin
    .from('baseball_coaches')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existingCoach) {
    return {
      success: true,
      redirectTo: '/baseball/dashboard/command-center',
    };
  }

  const { error: userError } = await ensureUserRowPreservingAdmin(
    admin, user.id, user.email || '', 'coach',
  );

  if (userError) {
    await logServerError(`[Onboarding] Failed to upsert user: ${describeDbError(userError)}`, { action: 'onboarding.completeCoachOnboarding' });
    return { success: false, error: 'Unable to set up your account. Please try again.' };
  }

  const { data: org, error: orgError } = await admin
    .from('organizations')
    .insert({
      name: schoolName,
      type: coachType,
      division,
      location_city: city,
      location_state: state,
    })
    .select('id')
    .single();

  if (orgError) {
    await logServerError(`[Onboarding] Failed to create organization: ${describeDbError(orgError)}`, { action: 'onboarding.completeCoachOnboarding' });
    return { success: false, error: 'Unable to create your program. Please try again.' };
  }

  const { data: coachRow, error: coachError } = await admin
    .from('baseball_coaches')
    .insert({
      user_id: user.id,
      coach_type: coachType,
      organization_id: org.id,
      full_name: fullName,
      email: user.email || '',
      title,
      onboarding_completed: true,
    })
    .select('id')
    .single();

  if (coachError || !coachRow) {
    await logServerError(`[Onboarding] Failed to create coach profile: ${describeDbError(coachError)}`, { action: 'onboarding.completeCoachOnboarding' });
    return { success: false, error: 'Unable to create your profile. Please try again.' };
  }

  const joinCode = generateJoinCode();
  const { data: teamRow, error: teamError } = await admin
    .from('baseball_teams')
    .insert({
      name: `${schoolName} Baseball`,
      team_type: coachType,
      organization_id: org.id,
      join_code: joinCode,
      created_by: coachRow.id,
    })
    .select('id')
    .single();

  if (teamError || !teamRow) {
    await logServerError(`[Onboarding] Failed to create team (non-fatal): ${describeDbError(teamError)}`, { action: 'onboarding.completeCoachOnboarding' });
  } else {
    const { error: staffError } = await admin
      .from('baseball_team_coach_staff')
      .insert({
        team_id: teamRow.id,
        coach_id: coachRow.id,
        role: 'head_coach',
        is_head_coach: true,
        is_primary: true,
        status: 'active',
        title: title ?? 'Head Coach',
        can_manage_roster: true,
        can_manage_practice: true,
        can_manage_lifting: true,
        can_view_academics: true,
        can_manage_imports: true,
        can_manage_stats: true,
        can_invite_staff: true,
        can_manage_settings: true,
        can_view_medical: true,
        can_message_team: true,
        can_manage_calendar: true,
      });

    if (staffError) {
      await logServerError(`[Onboarding] Failed to staff-link coach to team (non-fatal): ${describeDbError(staffError)}`, { action: 'onboarding.completeCoachOnboarding' });
    }
  }

  revalidatePath('/baseball');

  return {
    success: true,
    redirectTo: '/baseball/dashboard/command-center',
  };
}

// ─── Complete Coach Onboarding (authenticated users) ────────────────────────

export async function completeCoachOnboarding(
  data: CoachOnboardingInput,
  // Optional: pass pre-verified user from signupAndCompleteCoachOnboarding
  // to avoid a redundant getUser() round-trip when the session cookie is not
  // yet readable in the same request.
  _preVerifiedUser?: User,
): Promise<OnboardingResult> {
  if (_preVerifiedUser) {
    return runCompleteCoachOnboardingCore(_preVerifiedUser, data);
  }

  try {
    return await completeCoachOnboardingAction(data);
  } catch (error) {
    await logServerError(
      `Unexpected error: ${describeError(error)}`,
      { action: 'onboarding.completeCoachOnboarding', featureArea: 'baseball-onboarding' },
    );
    return mapOnboardingCoachActionError(error);
  }
}

const completeCoachOnboardingAction = withBaseballAction(
  'completeCoachOnboarding',
  { featureArea: 'baseball-onboarding', requireActiveContext: false },
  async (ctx, data: CoachOnboardingInput): Promise<OnboardingResult> => {
    return runCompleteCoachOnboardingCore(ctx.user, data);
  },
);

// ─── Signup + Complete Coach Onboarding (unauthenticated users) ─────────────

async function signupAndCompleteCoachOnboardingImpl(data: {
  email: string;
  password: string;
  fullName: string;
  coachType: string;
  schoolName: string;
  division?: string;
  city?: string;
  state?: string;
  title?: string;
}): Promise<OnboardingResult> {
  const normalizedEmail = data.email.toLowerCase().trim();

  // Validate password with full server-side rules
  const passwordValidation = validatePassword(data.password);
  if (!passwordValidation.valid) {
    return {
      success: false,
      error: passwordValidation.feedback[0] || 'Password does not meet security requirements.',
    };
  }

  // Rate limiting
  const headersList = await headers();
  const ip = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'unknown';
  const rateLimit = await checkRateLimit(`signup:ip:${ip}`, RATE_LIMITS.SIGNUP);

  if (!rateLimit.allowed) {
    const remaining = formatTimeRemaining(rateLimit.resetAt - Date.now());
    return {
      success: false,
      error: `Too many signup attempts. Please try again in ${remaining}.`,
    };
  }

  // Validate onboarding inputs
  const coachType = data.coachType as CoachType;
  if (!VALID_COACH_TYPES.includes(coachType)) {
    return { success: false, error: 'Invalid coach type.' };
  }

  const schoolName = sanitizeString(data.schoolName);
  if (!schoolName) {
    return { success: false, error: 'School name is required.' };
  }

  const fullName = sanitizeString(data.fullName);
  if (!fullName) {
    return { success: false, error: 'Full name is required.' };
  }

  // Create account via Supabase (server-side)
  const supabase = await createClient();
  const [firstName, ...lastParts] = fullName.split(' ');

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: normalizedEmail,
    password: data.password,
    options: {
      data: {
        role: 'coach',
        sport: 'baseball',
        coach_type: coachType,
        first_name: firstName || '',
        last_name: lastParts.join(' ') || '',
      },
    },
  });

  if (authError) {
    // Handle rate limit from Supabase
    if (authError.message.includes('security purposes') || authError.message.includes('rate limit')) {
      const match = authError.message.match(/after (\d+) seconds/);
      const seconds = match ? match[1] : '60';
      return { success: false, error: `Please wait ${seconds} seconds before trying again.` };
    }

    // Handle duplicate email — fall back to completing onboarding for the existing user.
    // This handles the race condition where checkAuth() hasn't resolved yet on the client,
    // so signupAndCompleteCoachOnboarding() is called for an already-authenticated email.
    // Also handles users who started onboarding but abandoned before their coach record was created.
    if (authError.message.includes('already registered') || authError.message.includes('already exists')
      || authError.status === 422 || (authError as { code?: string }).code === 'user_already_exists') {
      // signUp erroring "already exists" says nothing about WHO is calling —
      // the previous service-role lookup here resumed onboarding for any
      // caller who merely knew the email. Require proof of ownership:
      //  (a) the caller is already signed in as that email (the client-side
      //      checkAuth() race this fallback was built for), or
      //  (b) the submitted password actually signs in as that account (the
      //      abandoned-onboarding retry — this also sets their session).
      const { data: { user: authedUser } } = await supabase.auth.getUser();
      let ownerUser: User | null =
        authedUser?.email?.toLowerCase() === normalizedEmail ? authedUser : null;

      if (!ownerUser) {
        const { data: signInData } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password: data.password,
        });
        ownerUser = signInData?.user ?? null;
      }

      if (ownerUser) {
        console.info('[Onboarding] Email already registered — completing onboarding for verified owner:', ownerUser.id);
        return completeCoachOnboarding(
          {
            coachType,
            schoolName,
            division: data.division,
            city: data.city,
            state: data.state,
            fullName,
            title: data.title,
          },
          ownerUser
        );
      }

      // Caller could not prove ownership of the existing account.
      return {
        success: false,
        error: 'An account with this email already exists. Please sign in to continue your setup.',
      };
    }

    await logServerError(`[Onboarding] Signup error: ${authError.message}`, { action: 'onboarding.signupAndCompleteCoachOnboarding', metadata: { email: normalizedEmail, ip } });
    return { success: false, error: 'Unable to create account. Please try again.' };
  }

  if (!authData.user) {
    return { success: false, error: 'Unable to create account. Please try again.' };
  }

  console.info('[Onboarding] Coach signup successful:', {
    userId: authData.user.id,
    coachType,
    ip,
  });

  // Pass the pre-verified user directly — no second getUser() round-trip needed
  return completeCoachOnboarding(
    {
      coachType,
      schoolName,
      division: data.division,
      city: data.city,
      state: data.state,
      fullName,
      title: data.title,
    },
    authData.user
  );
}

// ─── Complete Signup (for OAuth users who need role selection) ───────────────

export async function completeBaseballSignup(data: {
  role: 'coach' | 'player';
  coachType?: string;
  playerType?: string;
}): Promise<OnboardingResult> {
  // Verify identity via SSR client
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'You must be signed in.' };
  }

  const userEmail = user.email;
  if (!userEmail) {
    return { success: false, error: 'Email is required.' };
  }

  // Use admin client for all writes — bypasses RLS safely since user is verified above
  const admin = createAdminClient();

  // Check for existing profiles
  const [coachCheck, playerCheck] = await Promise.all([
    admin.from('baseball_coaches').select('id').eq('user_id', user.id).maybeSingle(),
    admin.from('baseball_players').select('id').eq('user_id', user.id).maybeSingle(),
  ]);

  if (coachCheck.data) {
    return { success: true, redirectTo: '/baseball/dashboard/command-center' };
  }
  if (playerCheck.data) {
    return { success: true, redirectTo: '/baseball/player/today' };
  }

  // Ensure user record exists (never demotes an existing admin)
  await ensureUserRowPreservingAdmin(
    admin, user.id, userEmail, data.role === 'coach' ? 'coach' : 'player',
  );

  if (data.role === 'coach') {
    try {
      return await completeBaseballSignupCoachAction(data);
    } catch (error) {
      await logServerError(
        `Unexpected error: ${describeError(error)}`,
        { action: 'onboarding.completeBaseballSignup', featureArea: 'baseball-onboarding' },
      );
      return mapOnboardingCoachActionError(error);
    }
  } else {
    const playerType = data.playerType as PlayerType;
    if (!playerType || !VALID_PLAYER_TYPES.includes(playerType)) {
      return { success: false, error: 'Please select a valid player type.' };
    }

    const fullName = user.user_metadata?.full_name || userEmail.split('@')[0] || 'Player';
    const [firstName, ...lastParts] = fullName.split(' ');

    const recruitingActivated = playerType !== 'college';
    CommonSchemas.recruitingPlayerState.parse({
      player_type: playerType,
      recruiting_activated: recruitingActivated,
    });

    const { error: playerError } = await admin.from('baseball_players').insert({
      user_id: user.id,
      player_type: playerType,
      first_name: firstName,
      last_name: lastParts.join(' ') || '',
      recruiting_activated: recruitingActivated,
      onboarding_completed: false,
      profile_completion_percent: 0,
    });

    if (playerError) {
      await logServerError(`[Onboarding] Failed to create player profile: ${describeDbError(playerError)}`, { action: 'onboarding.completeBaseballSignup' });
      return { success: false, error: 'Unable to create your profile. Please try again.' };
    }

    revalidatePath('/baseball');
    return { success: true, redirectTo: '/baseball/player' };
  }
}

const completeBaseballSignupCoachAction = withBaseballAction(
  'completeBaseballSignupCoach',
  { featureArea: 'baseball-onboarding', requireActiveContext: false },
  async (ctx, data: { coachType?: string }): Promise<OnboardingResult> => {
    const coachType = data.coachType as CoachType;
    if (!coachType || !VALID_COACH_TYPES.includes(coachType)) {
      return { success: false, error: 'Please select a valid coach type.' };
    }

    const userEmail = ctx.user.email;
    if (!userEmail) {
      return { success: false, error: 'Email is required.' };
    }

    const admin = createAdminClient();
    const { error: coachError } = await admin.from('baseball_coaches').insert({
      user_id: ctx.user.id,
      coach_type: coachType,
      full_name: ctx.user.user_metadata?.full_name || userEmail.split('@')[0] || 'Coach',
      email: userEmail,
      onboarding_completed: false,
    });

    if (coachError) {
      await logServerError(`[Onboarding] Failed to create coach profile: ${describeDbError(coachError)}`, { action: 'onboarding.completeBaseballSignup' });
      return { success: false, error: 'Unable to create your profile. Please try again.' };
    }

    revalidatePath('/baseball');
    return { success: true, redirectTo: '/baseball/coach-onboarding' };
  },
);

// ─── Complete Player Onboarding (authenticated players) ───────────────────────

export type PlayerOnboardingInput = {
  playerType: string;
  firstName: string;
  lastName: string;
  gradYear?: number | null;
  primaryPosition?: string | null;
  secondaryPosition?: string | null;
  city?: string | null;
  state?: string | null;
  highSchoolName?: string | null;
  // Measurables — these are core recruiting metrics (read by Discover's
  // velo/exit filters, the recruiting match-calculator + min-standards
  // gate, and the public player profile headline cards). height_feet,
  // pitch_velo, exit_velo, and sixty_time have NO other write path in the
  // app (updateMyPlayerProfile's whitelist omits all four); bats/throws
  // only recover via a coach-gated toggle. All six must be threaded
  // through here or they become permanently uncapturable on the normal
  // signup → onboarding happy path.
  heightFeet?: number | null;
  heightInches?: number | null;
  weightLbs?: number | null;
  bats?: string | null;
  throws?: string | null;
  pitchVelo?: number | null;
  exitVelo?: number | null;
  sixtyTime?: number | null;
  profileCompletionPercent?: number | null;
};

/**
 * Complete player onboarding for an authenticated player.
 *
 * GUARD (defect #1): the web email/password golden path creates NO
 * baseball_players row. A bare `.update().eq('user_id', ...)` matched 0 rows,
 * returned a null error, and silently never set onboarding_completed — trapping
 * the player in an onboarding bounce loop. This UPSERTS (onConflict: user_id)
 * via the admin client so the row is created-or-updated and onboarding_completed
 * is actually persisted.
 *
 * Privacy-first: recruiting is NEVER auto-activated at onboarding — the player
 * opts in later. Identity is verified via the SSR client (getUser); all writes
 * use the admin client so RLS never blocks first-write onboarding.
 */
async function completePlayerOnboardingImpl(
  input: PlayerOnboardingInput,
): Promise<OnboardingResult> {
  // Verify identity via the SSR client (reads session cookies).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'You must be signed in to complete onboarding.' };
  }

  // Validate inputs.
  const playerType = input.playerType as PlayerType;
  if (!VALID_PLAYER_TYPES.includes(playerType)) {
    return { success: false, error: 'Please select a valid player type.' };
  }

  const firstName = sanitizeString(input.firstName ?? '', 100);
  const lastName = sanitizeString(input.lastName ?? '', 100);
  if (!firstName || !lastName) {
    return { success: false, error: 'First and last name are required.' };
  }

  // Clamp profile completion into 0..100 (honest bounds; never trust the client).
  const rawPercent = input.profileCompletionPercent ?? 0;
  const profileCompletionPercent = Math.max(0, Math.min(100, Math.round(rawPercent)));

  const gradYear = input.gradYear ?? null;
  const primaryPosition = input.primaryPosition ? sanitizeString(input.primaryPosition, 10) : null;
  const secondaryPosition = input.secondaryPosition ? sanitizeString(input.secondaryPosition, 10) : null;
  const city = input.city ? sanitizeString(input.city, 100) : null;
  const state = input.state ? sanitizeString(input.state, 2) : null;
  const highSchoolName = input.highSchoolName ? sanitizeString(input.highSchoolName) : null;

  // Measurables — same bounds as updateMyPlayerProfile's whitelist where one
  // exists (height_inches, weight_lbs), sane physical/on-field ranges otherwise.
  const heightFeet = clampNullableNumber(input.heightFeet, 3, 8);
  const heightInches = clampNullableNumber(input.heightInches, 0, 11);
  const weightLbs = clampNullableNumber(input.weightLbs, 60, 400);
  const pitchVelo = clampNullableNumber(input.pitchVelo, 30, 110);
  const exitVelo = clampNullableNumber(input.exitVelo, 30, 130);
  const sixtyTime = clampNullableNumber(input.sixtyTime, 5, 12);
  const bats = sanitizeHandedness(input.bats, VALID_BATS);
  const throwsHand = sanitizeHandedness(input.throws, VALID_THROWS);

  // All writes use the admin client (service role) so RLS never blocks the
  // first-write onboarding. Identity is already verified above via getUser().
  const admin = createAdminClient();

  // UPSERT on user_id — the create-or-update the old bare .update() lacked.
  const { error } = await admin.from('baseball_players').upsert(
    {
      user_id: user.id,
      player_type: playerType,
      first_name: firstName,
      last_name: lastName,
      email: user.email || null,
      grad_year: gradYear,
      primary_position: primaryPosition,
      secondary_position: secondaryPosition,
      city,
      state,
      high_school_name: highSchoolName,
      height_feet: heightFeet,
      height_inches: heightInches,
      weight_lbs: weightLbs,
      bats,
      throws: throwsHand,
      pitch_velo: pitchVelo,
      exit_velo: exitVelo,
      sixty_time: sixtyTime,
      profile_completion_percent: profileCompletionPercent,
      // Privacy-first: NEVER auto-activate recruiting at onboarding.
      recruiting_activated: false,
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );

  if (error) {
    await logServerError(
      `[Onboarding] Failed to upsert player profile: ${describeDbError(error)}`,
      { action: 'onboarding.completePlayerOnboarding' },
    );
    return { success: false, error: 'Unable to complete your profile. Please try again.' };
  }

  revalidatePath('/baseball');
  revalidatePath('/baseball/player');

  return { success: true, redirectTo: '/baseball/player/today' };
}

export const signupAndCompleteCoachOnboarding = withAdminObserved(
  'signupAndCompleteCoachOnboarding',
  { sport: 'baseball', feature: 'baseball_onboarding', featureArea: 'baseball-onboarding' },
  signupAndCompleteCoachOnboardingImpl,
);

export const completePlayerOnboarding = withAdminObserved(
  'completePlayerOnboarding',
  { sport: 'baseball', feature: 'baseball_onboarding', featureArea: 'baseball-onboarding' },
  completePlayerOnboardingImpl,
);

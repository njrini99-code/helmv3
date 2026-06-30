'use server';

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

function generateJoinCode(): string {
  return randomBytes(4).toString('hex').toUpperCase().slice(0, 8);
}

function sanitizeString(input: string, maxLength = 255): string {
  return input.trim().slice(0, maxLength);
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

// ─── Complete Coach Onboarding (authenticated users) ────────────────────────

export async function completeCoachOnboarding(
  data: {
    coachType: string;
    schoolName: string;
    division?: string;
    city?: string;
    state?: string;
    fullName: string;
    title?: string;
  },
  // Optional: pass pre-verified user from signupAndCompleteCoachOnboarding
  // to avoid a redundant getUser() round-trip
  _preVerifiedUser?: User
): Promise<OnboardingResult> {
  // Verify identity via the SSR client (reads session cookies)
  // Use pre-verified user if provided (from signUp in the same server action)
  let user: User | null = _preVerifiedUser ?? null;

  if (!user) {
    const supabase = await createClient();
    const { data: { user: sessionUser } } = await supabase.auth.getUser();
    user = sessionUser;
  }

  if (!user) {
    return { success: false, error: 'You must be signed in to complete onboarding.' };
  }

  // All DB writes use the admin client (service role) so RLS never blocks onboarding.
  // Identity is already verified above via getUser() — this is intentional.
  const admin = createAdminClient();

  // Validate inputs
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

  // Check if coach profile already exists
  const { data: existingCoach } = await admin
    .from('baseball_coaches')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existingCoach) {
    // Already onboarded — redirect to dashboard
    return {
      success: true,
      redirectTo: '/baseball/dashboard/command-center',
    };
  }

  // Upsert user record (ensure role is set correctly)
  const { error: userError } = await admin
    .from('users')
    .upsert({ id: user.id, email: user.email || '', role: 'coach' }, { onConflict: 'id' });

  if (userError) {
    await logServerError(`[Onboarding] Failed to upsert user: ${describeDbError(userError)}`, { action: 'onboarding.completeCoachOnboarding' });
    return { success: false, error: 'Unable to set up your account. Please try again.' };
  }

  // Create organization
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

  // Create coach profile. Capture the new coach id — baseball_teams.created_by is a
  // FK to baseball_coaches(id), NOT auth.users(id). Passing user.id here was an FK
  // violation that silently failed team creation for EVERY coach at onboarding.
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

  // Create team. created_by references baseball_coaches(id) — use the coach row id.
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
    // Non-fatal — log but don't block onboarding
    await logServerError(`[Onboarding] Failed to create team (non-fatal): ${describeDbError(teamError)}`, { action: 'onboarding.completeCoachOnboarding' });
  } else {
    // Staff-link the new coach to their team as head coach. WITHOUT this row,
    // getActiveBaseballContext() resolves zero memberships, the coach dashboard has
    // no active team, and the user is bounced back into onboarding — the trap.
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

// ─── Signup + Complete Coach Onboarding (unauthenticated users) ─────────────

export async function signupAndCompleteCoachOnboarding(data: {
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
      const admin = createAdminClient();

      // Look up the existing user in our public.users table (fast, indexed on email)
      const { data: dbUser } = await admin
        .from('users')
        .select('id')
        .eq('email', normalizedEmail)
        .maybeSingle();

      if (dbUser?.id) {
        const { data: { user: existingUser } } = await admin.auth.admin.getUserById(dbUser.id);
        if (existingUser) {
          console.info('[Onboarding] Email already registered — completing onboarding for existing user:', existingUser.id);
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
            existingUser
          );
        }
      }

      // User exists in Supabase Auth but not in our public.users table yet.
      // This can happen if they abandoned onboarding before the first DB write.
      // Guide them to sign in so their session cookie is set, then they can complete onboarding.
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

  // Upsert user record
  await admin
    .from('users')
    .upsert({ id: user.id, email: userEmail, role: data.role }, { onConflict: 'id' });

  if (data.role === 'coach') {
    const coachType = data.coachType as CoachType;
    if (!coachType || !VALID_COACH_TYPES.includes(coachType)) {
      return { success: false, error: 'Please select a valid coach type.' };
    }

    const { error: coachError } = await admin.from('baseball_coaches').insert({
      user_id: user.id,
      coach_type: coachType,
      full_name: user.user_metadata?.full_name || userEmail.split('@')[0] || 'Coach',
      email: userEmail,
      onboarding_completed: false,
    });

    if (coachError) {
      await logServerError(`[Onboarding] Failed to create coach profile: ${describeDbError(coachError)}`, { action: 'onboarding.completeBaseballSignup' });
      return { success: false, error: 'Unable to create your profile. Please try again.' };
    }

    revalidatePath('/baseball');
    return { success: true, redirectTo: '/baseball/coach-onboarding' };
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
export async function completePlayerOnboarding(
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

  return { success: true, redirectTo: '/baseball/dashboard' };
}

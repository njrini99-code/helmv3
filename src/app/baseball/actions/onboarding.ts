'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { randomBytes } from 'crypto';
import { checkRateLimit, RATE_LIMITS, formatTimeRemaining } from '@/lib/auth/supabase-rate-limit';
import { validatePassword } from '@/lib/auth/password-validation';
import type { User } from '@supabase/supabase-js';

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
      redirectTo: `/baseball/coach/${coachType.replace('_', '-')}`,
    };
  }

  // Upsert user record (ensure role is set correctly)
  const { error: userError } = await admin
    .from('users')
    .upsert({ id: user.id, email: user.email || '', role: 'coach' }, { onConflict: 'id' });

  if (userError) {
    console.error('[Onboarding] Failed to upsert user:', userError);
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
    console.error('[Onboarding] Failed to create organization:', orgError);
    return { success: false, error: 'Unable to create your program. Please try again.' };
  }

  // Create coach profile
  const { error: coachError } = await admin
    .from('baseball_coaches')
    .insert({
      user_id: user.id,
      coach_type: coachType,
      organization_id: org.id,
      full_name: fullName,
      email: user.email || '',
      title,
      onboarding_completed: true,
    });

  if (coachError) {
    console.error('[Onboarding] Failed to create coach profile:', coachError);
    return { success: false, error: 'Unable to create your profile. Please try again.' };
  }

  // Create team
  const joinCode = generateJoinCode();
  const { error: teamError } = await admin
    .from('baseball_teams')
    .insert({
      name: `${schoolName} Baseball`,
      team_type: coachType,
      organization_id: org.id,
      join_code: joinCode,
      created_by: user.id,
    });

  if (teamError) {
    // Non-fatal — log but don't block onboarding
    console.error('[Onboarding] Failed to create team (non-fatal):', teamError);
  }

  revalidatePath('/baseball');

  return {
    success: true,
    redirectTo: `/baseball/coach/${coachType.replace('_', '-')}`,
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

    // Handle duplicate email
    if (authError.message.includes('already registered') || authError.message.includes('already exists')
      || authError.status === 422 || (authError as { code?: string }).code === 'user_already_exists') {
      return {
        success: false,
        error: 'An account with this email already exists. Please sign in instead.',
      };
    }

    console.error('[Onboarding] Signup error:', { email: normalizedEmail, error: authError.message, ip });
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
    return { success: true, redirectTo: '/baseball/coach' };
  }
  if (playerCheck.data) {
    return { success: true, redirectTo: '/baseball/player' };
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
      console.error('[Onboarding] Failed to create coach profile:', coachError);
      return { success: false, error: 'Unable to create your profile. Please try again.' };
    }

    revalidatePath('/baseball');
    return { success: true, redirectTo: '/baseball/coach' };
  } else {
    const playerType = data.playerType as PlayerType;
    if (!playerType || !VALID_PLAYER_TYPES.includes(playerType)) {
      return { success: false, error: 'Please select a valid player type.' };
    }

    const fullName = user.user_metadata?.full_name || userEmail.split('@')[0] || 'Player';
    const [firstName, ...lastParts] = fullName.split(' ');

    const { error: playerError } = await admin.from('baseball_players').insert({
      user_id: user.id,
      player_type: playerType,
      first_name: firstName,
      last_name: lastParts.join(' ') || '',
      recruiting_activated: playerType !== 'college',
      onboarding_completed: false,
      profile_completion_percent: 0,
    });

    if (playerError) {
      console.error('[Onboarding] Failed to create player profile:', playerError);
      return { success: false, error: 'Unable to create your profile. Please try again.' };
    }

    revalidatePath('/baseball');
    return { success: true, redirectTo: '/baseball/player' };
  }
}

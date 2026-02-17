'use client';

import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useOnboardingFlow } from './hooks/useOnboardingFlow';
import { SignUpAs } from './components/SignUpAs';
import { CinematicIntro } from './components/CinematicIntro';
import { TeamLevel } from './components/TeamLevel';
import { Division } from './components/Division';
import { SchoolInfo } from './components/SchoolInfo';
import { AccountInfo } from './components/AccountInfo';
import { PlanSelection } from './components/PlanSelection';
import { WelcomeTransition } from './components/WelcomeTransition';

export default function CoachOnboarding() {
  const router = useRouter();
  const supabase = createClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    currentStep,
    data,
    updateData,
    nextStep,
    previousStep,
    getProgressStep,
    getTotalProgressSteps,
    clearOnboarding,
  } = useOnboardingFlow();

  // Handle role selection
  const handleRoleSelect = (role: 'coach' | 'player') => {
    updateData({ role });
    if (role === 'coach') {
      nextStep(); // Go to cinematic
    } else {
      // Redirect to player onboarding
      router.push('/baseball/player');
    }
  };

  // Handle plan selection and show welcome transition
  const handlePlanSelect = async (plan: 'free' | 'elite') => {
    updateData({ plan });
    nextStep(); // Show welcome transition
  };

  // Handle completion after welcome transition
  const handleComplete = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    try {
      // Determine coach_type early for metadata
      let coachType: 'college' | 'juco' | 'high_school' | 'showcase' = 'college';
      if (data.teamLevel === 'high-school') {
        coachType = 'high_school';
      } else if (data.teamLevel === 'showcase') {
        coachType = 'showcase';
      } else if (data.division === 'JUCO') {
        coachType = 'juco';
      }

      // Step 1: Create auth user account WITH METADATA
      // This ensures the trigger creates the correct record type
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email?.trim(),
        password: data.password,
        options: {
          data: {
            role: 'coach',
            sport: 'baseball',
            coach_type: coachType,
            first_name: data.fullName?.split(' ')[0] || '',
            last_name: data.fullName?.split(' ').slice(1).join(' ') || '',
          },
        },
      });

      if (authError) {

        // Handle user already exists - try to sign them in instead
        if (authError.status === 422 || authError.message?.includes('already registered') || (authError as { code?: string }).code === 'user_already_exists') {
          // Try signing in with the provided credentials
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email: data.email?.trim() || '',
            password: data.password || '',
          });

          if (signInError) {
            setError(
              'An account with this email already exists. Please go to the login page to sign in, or use a different email address.'
            );
            setIsSubmitting(false);
            return;
          }

          // Successfully signed in - check if they have a coach profile
          if (signInData.user) {
            const { data: existingCoach } = await supabase
              .from('baseball_coaches')
              .select('id')
              .eq('user_id', signInData.user.id)
              .single();

            if (existingCoach) {
              // Already has a coach profile, redirect to dashboard
              clearOnboarding();
              router.push('/baseball/dashboard');
              router.refresh();
              return;
            }

            // No coach profile yet - continue with setup using existing user
            // This handles the case where auth user exists but profile was never created
            const existingUserId = signInData.user.id;
            const existingUserEmail = signInData.user.email || data.email;

            // Create user record with role
            await supabase
              .from('users')
              .upsert(
                {
                  id: existingUserId,
                  email: existingUserEmail,
                  role: 'coach',
                },
                { onConflict: 'id' }
              );

            // Determine organization type
            const existingOrgType = coachType === 'college' ? 'college'
              : coachType === 'juco' ? 'juco'
              : coachType === 'high_school' ? 'high_school'
              : 'showcase';

            // Create organization
            const { data: existingOrg, error: existingOrgError } = await supabase
              .from('organizations')
              .insert({
                name: data.schoolName,
                type: existingOrgType,
                division: data.division || null,
                location_city: data.city || null,
                location_state: data.state || null,
              })
              .select()
              .single();

            if (existingOrgError) {
              setError(`Failed to create organization: ${existingOrgError.message}`);
              setIsSubmitting(false);
              return;
            }

            // Create coach record for existing user
            const { error: existingCoachError } = await supabase
              .from('baseball_coaches')
              .insert({
                user_id: existingUserId,
                coach_type: coachType,
                organization_id: existingOrg.id,
                full_name: data.fullName,
                coach_title: data.title,
                school_name: data.schoolName,
                school_city: data.city || null,
                school_state: data.state || null,
                program_division: data.division || null,
                onboarding_completed: true,
              });

            if (existingCoachError) {
              setError(`Failed to create coach profile: ${existingCoachError.message}`);
              setIsSubmitting(false);
              return;
            }

            // Create team for the coach
            const teamType = coachType === 'college' ? 'college'
              : coachType === 'juco' ? 'juco'
              : coachType === 'high_school' ? 'high_school'
              : 'showcase';

            // Generate a unique 6-character join code
            const joinCode = Math.random().toString(36).substring(2, 8).toUpperCase();

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any)
              .from('baseball_teams')
              .insert({
                name: `${data.schoolName} Baseball`,
                team_type: teamType,
                organization_id: existingOrg.id,
                join_code: joinCode,
                created_by: existingUserId,
              });

            // Success! Clear onboarding and redirect
            clearOnboarding();
            router.push('/baseball/dashboard');
            router.refresh();
            return;
          }
        }

        // Check if this is an auth hook error
        if (authError.message?.includes('validate email') || authError.message?.includes('invalid format')) {
          setError(
            'Email validation failed. Please check your email format and try again.'
          );
        } else {
          setError(`Failed to create account: ${authError.message}`);
        }
        setIsSubmitting(false);
        return;
      }

      if (!authData.user) {
        setError('Failed to create account. Please try again.');
        setIsSubmitting(false);
        return;
      }

      const userId = authData.user.id;
      const userEmail = authData.user.email || data.email;

      // Validate role
      if (!data.role) {
        setError('User role is required');
        setIsSubmitting(false);
        return;
      }

      // Step 2: Create user record with role
      const { error: userError } = await supabase
        .from('users')
        .upsert(
          {
            id: userId,
            email: userEmail,
            role: data.role,
          },
          {
            onConflict: 'id',
          }
        );

      if (userError) {
        console.error('User creation error:', userError);
        setError(`Failed to set user role: ${userError.message}`);
        setIsSubmitting(false);
        return;
      }

      // Handle player signup (redirect to player onboarding)
      if (data.role === 'player') {
        router.push('/baseball/player');
        router.refresh();
        return;
      }

      // Continue with coach setup
      // coachType already determined above for metadata

      // Determine organization type
      const orgType = coachType === 'college' ? 'college'
        : coachType === 'juco' ? 'juco'
        : coachType === 'high_school' ? 'high_school'
        : 'showcase';

      // Step 3: Create organization
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .insert({
          name: data.schoolName,
          type: orgType,
          division: data.division || null,
          location_city: data.city || null,
          location_state: data.state || null,
        })
        .select()
        .single();

      if (orgError) {
        console.error('Organization creation error:', orgError);
        setError(`Failed to create organization: ${orgError.message}`);
        setIsSubmitting(false);
        return;
      }

      // Step 4: Create coach record
      const { error: coachError } = await supabase
        .from('baseball_coaches')
        .insert({
          user_id: userId,
          coach_type: coachType,
          organization_id: org.id,
          full_name: data.fullName,
          coach_title: data.title,
          school_name: data.schoolName,
          school_city: data.city || null,
          school_state: data.state || null,
          program_division: data.division || null,
          onboarding_completed: true,
        });

      if (coachError) {
        console.error('Coach creation error:', coachError);
        setError(`Failed to create coach profile: ${coachError.message}`);
        setIsSubmitting(false);
        return;
      }

      // Clear onboarding data from localStorage
      clearOnboarding();

      // Check for stored returnTo URL (from invite link flow)
      const storedReturnTo = sessionStorage.getItem('baseball_signup_returnTo');

      if (storedReturnTo) {
        // Clear the stored URL
        sessionStorage.removeItem('baseball_signup_returnTo');
        // Redirect to the stored URL
        router.push(storedReturnTo);
      } else {
        // Redirect to dashboard
        router.push('/baseball/dashboard');
      }
      router.refresh();

    } catch (err) {
      console.error('Onboarding completion error:', err);
      setError('An unexpected error occurred. Please try again.');
      setIsSubmitting(false);
    }
  };

  // Show loading state during submission
  if (isSubmitting && currentStep !== 'welcome') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-green-50/30 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex h-12 w-12 animate-spin rounded-full border-4 border-green-200 border-t-green-600 mb-4" />
          <p className="text-slate-600 font-medium">Setting up your account...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-[env(safe-area-inset-bottom)]">
    <AnimatePresence mode="wait">
      {currentStep === 'role-selection' && (
        <SignUpAs key="role-selection" onSelect={handleRoleSelect} />
      )}

      {currentStep === 'cinematic' && (
        <CinematicIntro key="cinematic" onComplete={nextStep} />
      )}

      {currentStep === 'team-level' && (
        <TeamLevel
          key="team-level"
          onSelect={(level) => {
            updateData({ teamLevel: level });
            // Pass the level to nextStep so it knows whether to skip division
            nextStep(level);
          }}
          onBack={previousStep}
          currentProgress={getProgressStep()}
          totalSteps={getTotalProgressSteps()}
        />
      )}

      {currentStep === 'division' && (
        <Division
          key="division"
          onSelect={(division) => {
            updateData({ division });
            nextStep();
          }}
          onBack={previousStep}
          currentProgress={getProgressStep()}
          totalSteps={getTotalProgressSteps()}
        />
      )}

      {currentStep === 'school-info' && (
        <SchoolInfo
          key="school-info"
          initialData={{
            schoolName: data.schoolName,
            city: data.city,
            state: data.state,
          }}
          onSubmit={(schoolData) => {
            updateData(schoolData);
            nextStep();
          }}
          onBack={previousStep}
          currentProgress={getProgressStep()}
          totalSteps={getTotalProgressSteps()}
        />
      )}

      {currentStep === 'account-info' && (
        <AccountInfo
          key="account-info"
          initialData={{
            fullName: data.fullName,
            title: data.title,
            email: data.email,
            password: data.password,
          }}
          onSubmit={(accountData) => {
            updateData(accountData);
            nextStep();
          }}
          onBack={previousStep}
          currentProgress={getProgressStep()}
          totalSteps={getTotalProgressSteps()}
        />
      )}

      {currentStep === 'plan-selection' && (
        <PlanSelection
          key="plan-selection"
          onSelect={handlePlanSelect}
          onBack={previousStep}
          currentProgress={getProgressStep()}
          totalSteps={getTotalProgressSteps()}
        />
      )}

      {currentStep === 'welcome' && (
        <WelcomeTransition
          key="welcome"
          onComplete={handleComplete}
        />
      )}

      {error && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl shadow-lg z-50" style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
          {error}
        </div>
      )}
    </AnimatePresence>
    </div>
  );
}

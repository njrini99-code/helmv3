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
      // Get authenticated user
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        console.error('No authenticated user found');
        router.push('/baseball/login');
        return;
      }

      // Determine coach_type based on teamLevel and division
      let coachType: 'college' | 'juco' | 'high_school' | 'showcase';
      
      if (data.teamLevel === 'high-school') {
        coachType = 'high_school';
      } else if (data.teamLevel === 'showcase') {
        coachType = 'showcase';
      } else if (data.division === 'JUCO') {
        coachType = 'juco';
      } else {
        coachType = 'college';
      }

      // Determine organization type
      const orgType = coachType === 'college' ? 'college'
        : coachType === 'juco' ? 'juco'
        : coachType === 'high_school' ? 'high_school'
        : 'showcase_org';

      // Step 1: Create organization
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

      // Step 2: Update coach record with onboarding data
      const { error: updateError } = await supabase
        .from('coaches')
        .update({
          coach_type: coachType,
          organization_id: org.id,
          full_name: data.fullName,
          coach_title: data.title,
          school_name: data.schoolName,
          school_city: data.city || null,
          school_state: data.state || null,
          program_division: data.division || null,
          onboarding_completed: true,
        })
        .eq('user_id', user.id);

      if (updateError) {
        console.error('Coach update error:', updateError);
        setError(`Failed to update profile: ${updateError.message}`);
        setIsSubmitting(false);
        return;
      }

      // Clear onboarding data from localStorage
      clearOnboarding();

      // Redirect to dashboard
      router.push('/baseball/dashboard');
      router.refresh();

    } catch (err) {
      console.error('Onboarding completion error:', err);
      setError('An unexpected error occurred. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
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
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl shadow-lg z-50">
          {error}
        </div>
      )}
    </AnimatePresence>
  );
}

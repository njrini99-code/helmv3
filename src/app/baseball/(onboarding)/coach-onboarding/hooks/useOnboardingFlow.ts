'use client';

import { useState, useEffect, useCallback } from 'react';

export type OnboardingStep =
  | 'role-selection'
  | 'cinematic'
  | 'team-level'
  | 'division'
  | 'school-info'
  | 'account-info'
  | 'plan-selection'
  | 'welcome';

export interface OnboardingData {
  role: 'coach' | 'player' | null;
  teamLevel: 'college' | 'high-school' | 'showcase' | null;
  division: 'D1' | 'D2' | 'D3' | 'JUCO' | 'NAIA' | null;
  schoolName: string;
  city: string;
  state: string;
  fullName: string;
  title: string;
  plan: 'free' | 'elite' | null;
}

const STORAGE_KEY = 'baseballhelm_onboarding';

export function useOnboardingFlow() {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('role-selection');
  const [data, setData] = useState<OnboardingData>({
    role: null,
    teamLevel: null,
    division: null,
    schoolName: '',
    city: '',
    state: '',
    fullName: '',
    title: '',
    plan: null,
  });

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setData(parsed.data || data);
        setCurrentStep(parsed.currentStep || 'role-selection');
      } catch (e) {
        console.error('Failed to parse stored onboarding data');
      }
    }
  }, []);

  // Save to localStorage on change
  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ currentStep, data })
    );
  }, [currentStep, data]);

  const updateData = useCallback((updates: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...updates }));
  }, []);

  // Check if division step should be skipped
  const shouldSkipDivision = useCallback((teamLevel: OnboardingData['teamLevel']) => {
    return teamLevel === 'high-school' || teamLevel === 'showcase';
  }, []);

  // Get the steps array based on team level
  const getSteps = useCallback((teamLevel: OnboardingData['teamLevel']): OnboardingStep[] => {
    if (shouldSkipDivision(teamLevel)) {
      return [
        'role-selection',
        'cinematic',
        'team-level',
        'school-info', // Skip division
        'account-info',
        'plan-selection',
        'welcome',
      ];
    }
    return [
      'role-selection',
      'cinematic',
      'team-level',
      'division',
      'school-info',
      'account-info',
      'plan-selection',
      'welcome',
    ];
  }, [shouldSkipDivision]);

  // nextStep can optionally take a teamLevel override for when we just set it
  const nextStep = useCallback((teamLevelOverride?: OnboardingData['teamLevel']) => {
    const effectiveTeamLevel = teamLevelOverride ?? data.teamLevel;
    const steps = getSteps(effectiveTeamLevel);
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1]!);
    }
  }, [currentStep, data.teamLevel, getSteps]);

  const previousStep = useCallback(() => {
    const steps = getSteps(data.teamLevel);
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex > 0) {
      // Skip cinematic and welcome when going back
      const prevStep = steps[currentIndex - 1];
      if (prevStep === 'cinematic' || prevStep === 'welcome') {
        setCurrentStep(steps[currentIndex - 2]!);
      } else {
        setCurrentStep(prevStep!);
      }
    }
  }, [currentStep, data.teamLevel, getSteps]);

  const goToStep = useCallback((step: OnboardingStep) => {
    setCurrentStep(step);
  }, []);

  const clearOnboarding = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setData({
      role: null,
      teamLevel: null,
      division: null,
      schoolName: '',
      city: '',
      state: '',
      fullName: '',
      title: '',
      plan: null,
    });
    setCurrentStep('role-selection');
  }, []);

  const getProgressStep = useCallback((): number => {
    // Progress steps (excludes role-selection, cinematic, welcome)
    const progressSteps = shouldSkipDivision(data.teamLevel)
      ? ['team-level', 'school-info', 'account-info', 'plan-selection']
      : ['team-level', 'division', 'school-info', 'account-info', 'plan-selection'];
    
    const index = progressSteps.indexOf(currentStep);
    return index >= 0 ? index + 1 : 1;
  }, [currentStep, data.teamLevel, shouldSkipDivision]);

  const getTotalProgressSteps = useCallback((): number => {
    return shouldSkipDivision(data.teamLevel) ? 4 : 5;
  }, [data.teamLevel, shouldSkipDivision]);

  return {
    currentStep,
    data,
    updateData,
    nextStep,
    previousStep,
    goToStep,
    clearOnboarding,
    getProgressStep,
    getTotalProgressSteps,
  };
}

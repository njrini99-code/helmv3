'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import { OnboardingInput } from './OnboardingInput';
import { OnboardingButton } from './OnboardingButton';
import { ProgressDots } from './ProgressDots';
import { slideInFromRight } from '../animations/variants';

interface SchoolInfoProps {
  initialData: { schoolName: string; city: string; state: string };
  onSubmit: (data: { schoolName: string; city: string; state: string }) => void;
  onBack: () => void;
  currentProgress: number;
  totalSteps: number;
}

export function SchoolInfo({ initialData, onSubmit, onBack, currentProgress, totalSteps }: SchoolInfoProps) {
  const [schoolName, setSchoolName] = useState(initialData.schoolName);
  const [city, setCity] = useState(initialData.city);
  const [state, setState] = useState(initialData.state);

  const isValid = schoolName && city && state;

  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={slideInFromRight}
      className="min-h-screen bg-onboarding-cream flex flex-col items-center p-6"
    >
      <div className="w-full max-w-md pt-12 space-y-16">
        <div className="text-center">
          <div className="text-xl sm:text-2xl font-semibold tracking-tight mb-4 font-sf-pro">
            <span className="text-onboarding-kelly-green">Baseball</span>
            <span className="text-onboarding-rich-black">Helm</span>
          </div>
          <ProgressDots total={totalSteps} current={currentProgress} />
        </div>

        <div className="space-y-8">
          <h1 className="text-xl sm:text-2xl font-semibold text-onboarding-text-primary text-center font-sf-pro">
            Tell us about your program
          </h1>

          <div className="space-y-4">
            <OnboardingInput
              label="School Name"
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              placeholder="University of Baseball"
            />

            <div className="grid grid-cols-2 gap-4">
              <OnboardingInput
                label="City"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="City"
              />
              <OnboardingInput
                label="State"
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="CA"
                maxLength={2}
              />
            </div>
          </div>

          <div className="space-y-4">
            <OnboardingButton
              disabled={!isValid}
              onClick={() => onSubmit({ schoolName, city, state })}
            >
              Next
            </OnboardingButton>

            <button
              onClick={onBack}
              className="text-sm text-onboarding-text-secondary hover:text-onboarding-text-primary transition-colors flex items-center gap-2 font-sf-pro"
            >
              <span>←</span> Back
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

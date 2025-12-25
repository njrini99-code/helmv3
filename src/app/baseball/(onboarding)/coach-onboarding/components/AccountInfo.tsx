'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import { OnboardingInput } from './OnboardingInput';
import { OnboardingButton } from './OnboardingButton';
import { ProgressDots } from './ProgressDots';
import { slideInFromRight } from '../animations/variants';

interface AccountInfoProps {
  initialData: { fullName: string; title: string };
  onSubmit: (data: { fullName: string; title: string }) => void;
  onBack: () => void;
  currentProgress: number;
  totalSteps: number;
}

export function AccountInfo({ initialData, onSubmit, onBack, currentProgress, totalSteps }: AccountInfoProps) {
  const [fullName, setFullName] = useState(initialData.fullName);
  const [title, setTitle] = useState(initialData.title);

  const isValid = fullName.trim() && title.trim();

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
          <div className="text-2xl font-semibold tracking-tight mb-4 font-sf-pro">
            <span className="text-onboarding-kelly-green">Baseball</span>
            <span className="text-onboarding-rich-black">Helm</span>
          </div>
          <ProgressDots total={totalSteps} current={currentProgress} />
        </div>

        <div className="space-y-8">
          <h1 className="text-2xl font-semibold text-onboarding-text-primary text-center font-sf-pro">
            Tell us about yourself
          </h1>

          <div className="space-y-4">
            <OnboardingInput
              label="Full Name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="John Smith"
            />
            <OnboardingInput
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Head Coach"
            />
          </div>

          <div className="space-y-4">
            <OnboardingButton
              disabled={!isValid}
              onClick={() => onSubmit({ fullName, title })}
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

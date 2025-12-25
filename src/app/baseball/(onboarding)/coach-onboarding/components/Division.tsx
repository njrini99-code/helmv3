'use client';

import { motion } from 'framer-motion';
import { OnboardingCard } from './OnboardingCard';
import { ProgressDots } from './ProgressDots';
import { slideInFromRight } from '../animations/variants';

interface DivisionProps {
  onSelect: (division: 'D1' | 'D2' | 'D3' | 'JUCO' | 'NAIA') => void;
  onBack: () => void;
  currentProgress: number;
  totalSteps: number;
}

export function Division({ onSelect, onBack, currentProgress, totalSteps }: DivisionProps) {
  const options = [
    { value: 'D1' as const, label: 'Division 1' },
    { value: 'D2' as const, label: 'Division 2' },
    { value: 'D3' as const, label: 'Division 3' },
    { value: 'JUCO' as const, label: 'JUCO' },
    { value: 'NAIA' as const, label: 'NAIA' },
  ];

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
            What division is your team?
          </h1>

          <div className="space-y-3">
            {options.map((option) => (
              <OnboardingCard key={option.value} onClick={() => onSelect(option.value)}>
                {option.label}
              </OnboardingCard>
            ))}
          </div>

          <button
            onClick={onBack}
            className="text-sm text-onboarding-text-secondary hover:text-onboarding-text-primary transition-colors flex items-center gap-2 font-sf-pro"
          >
            <span>←</span> Back
          </button>
        </div>
      </div>
    </motion.div>
  );
}

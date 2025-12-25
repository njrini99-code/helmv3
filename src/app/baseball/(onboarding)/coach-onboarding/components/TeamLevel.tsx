'use client';

import { motion } from 'framer-motion';
import { OnboardingCard } from './OnboardingCard';
import { ProgressDots } from './ProgressDots';
import { fadeInUp, slideInFromRight, staggerContainer } from '../animations/variants';

interface TeamLevelProps {
  onSelect: (level: 'college' | 'high-school' | 'showcase') => void;
  onBack: () => void;
  currentProgress: number;
  totalSteps: number;
}

export function TeamLevel({ onSelect, onBack, currentProgress, totalSteps }: TeamLevelProps) {
  const options = [
    { value: 'college' as const, label: 'College' },
    { value: 'high-school' as const, label: 'High School' },
    { value: 'showcase' as const, label: 'Showcase' },
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
        {/* Logo */}
        <div className="text-center">
          <div className="text-2xl font-semibold tracking-tight mb-4 font-sf-pro">
            <span className="text-onboarding-kelly-green">Baseball</span>
            <span className="text-onboarding-rich-black">Helm</span>
          </div>
          <ProgressDots total={totalSteps} current={currentProgress} />
        </div>

        {/* Content */}
        <motion.div variants={staggerContainer} className="space-y-8">
          {/* Heading */}
          <motion.h1 variants={fadeInUp} className="text-2xl font-semibold text-onboarding-text-primary text-center font-sf-pro">
            What level is your team?
          </motion.h1>

          {/* Options */}
          <div className="space-y-4">
            {options.map((option, index) => (
              <motion.div
                key={option.value}
                variants={fadeInUp}
                transition={{ delay: index * 0.06 }}
              >
                <OnboardingCard onClick={() => onSelect(option.value)}>
                  {option.label}
                </OnboardingCard>
              </motion.div>
            ))}
          </div>

          {/* Back button */}
          <motion.button
            variants={fadeInUp}
            onClick={onBack}
            className="text-sm text-onboarding-text-secondary hover:text-onboarding-text-primary transition-colors flex items-center gap-2 font-sf-pro"
          >
            <span>←</span> Back
          </motion.button>
        </motion.div>
      </div>
    </motion.div>
  );
}

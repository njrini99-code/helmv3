'use client';

import { motion } from 'framer-motion';
import { OnboardingCard } from './OnboardingCard';
import { fadeInUp, staggerContainer } from '../animations/variants';

interface SignUpAsProps {
  onSelect: (role: 'coach' | 'player') => void;
}

export function SignUpAs({ onSelect }: SignUpAsProps) {
  return (
    <div className="min-h-screen bg-onboarding-cream flex flex-col items-center justify-center p-6">
      <motion.div
        initial="initial"
        animate="animate"
        variants={staggerContainer}
        className="w-full max-w-md space-y-8"
      >
        {/* Logo */}
        <motion.div variants={fadeInUp} className="flex justify-center">
          <div className="text-xl sm:text-2xl font-semibold tracking-tight font-sf-pro">
            <span className="text-onboarding-kelly-green">Baseball</span>
            <span className="text-onboarding-rich-black">Helm</span>
          </div>
        </motion.div>

        {/* Heading */}
        <motion.div variants={fadeInUp} className="text-center">
          <p className="text-sm font-medium text-onboarding-text-secondary uppercase tracking-wider font-sf-pro">
            Sign up as
          </p>
        </motion.div>

        {/* Selection Cards */}
        <motion.div variants={fadeInUp} className="space-y-4">
          <OnboardingCard icon="🎓" onClick={() => onSelect('coach')}>
            Coach
          </OnboardingCard>
          <OnboardingCard icon="⚾" onClick={() => onSelect('player')}>
            Player
          </OnboardingCard>
        </motion.div>
      </motion.div>
    </div>
  );
}

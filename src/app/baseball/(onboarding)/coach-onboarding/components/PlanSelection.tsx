'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import { Check } from 'lucide-react';
import { OnboardingButton } from './OnboardingButton';
import { ProgressDots } from './ProgressDots';
import { PlanComparisonModal } from './PlanComparisonModal';
import { slideInFromRight } from '../animations/variants';

interface PlanSelectionProps {
  onSelect: (plan: 'free' | 'elite') => void;
  onBack: () => void;
  currentProgress: number;
  totalSteps: number;
}

export function PlanSelection({ onSelect, onBack, currentProgress, totalSteps }: PlanSelectionProps) {
  const [selectedPlan, setSelectedPlan] = useState<'free' | 'elite' | null>(null);
  const [showComparison, setShowComparison] = useState(false);

  const handleSelect = (plan: 'free' | 'elite') => {
    setSelectedPlan(plan);
    setTimeout(() => onSelect(plan), 200);
  };

  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={slideInFromRight}
      className="min-h-screen bg-onboarding-cream flex flex-col items-center p-6"
    >
      <div className="w-full max-w-4xl pt-12 space-y-16">
        <div className="text-center">
          <div className="text-2xl font-semibold tracking-tight mb-4 font-sf-pro">
            <span className="text-onboarding-kelly-green">Baseball</span>
            <span className="text-onboarding-rich-black">Helm</span>
          </div>
          <ProgressDots total={totalSteps} current={currentProgress} />
        </div>

        <div className="space-y-12">
          <h1 className="text-2xl font-semibold text-onboarding-text-primary text-center font-sf-pro">
            Choose your plan
          </h1>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Free Plan */}
            <motion.div
              className="bg-white rounded-xl border border-onboarding-border-light p-8 space-y-6"
              whileHover={{ scale: 1.02 }}
              transition={{ duration: 0.2 }}
            >
              <div>
                <h3 className="text-xl font-semibold text-onboarding-text-primary font-sf-pro">Free Recruiting</h3>
                <div className="mt-4">
                  <span className="text-4xl font-bold text-onboarding-text-primary font-sf-pro">$0</span>
                  <span className="text-onboarding-text-secondary font-sf-pro">/month</span>
                </div>
              </div>

              <div className="border-t border-onboarding-border-light pt-6 space-y-3">
                {['Player discovery', 'View profiles', 'Save to watchlist', 'Basic messaging'].map((feature) => (
                  <div key={feature} className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-onboarding-kelly-green flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-onboarding-text-secondary font-sf-pro">{feature}</span>
                  </div>
                ))}
              </div>

              <OnboardingButton onClick={() => handleSelect('free')}>
                Select Free
              </OnboardingButton>
            </motion.div>

            {/* Elite Plan */}
            <motion.div
              className="bg-white rounded-xl border-2 border-onboarding-kelly-green p-8 space-y-6 relative shadow-[0_0_20px_rgba(22,155,69,0.1)]"
              whileHover={{ scale: 1.02 }}
              transition={{ duration: 0.2 }}
            >
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="bg-onboarding-kelly-green text-white text-xs font-semibold px-3 py-1 rounded-full font-sf-pro">
                  ✦ RECOMMENDED
                </span>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-onboarding-text-primary font-sf-pro">Elite Program Management</h3>
                <div className="mt-4">
                  <span className="text-4xl font-bold text-onboarding-text-primary font-sf-pro">$200</span>
                  <span className="text-onboarding-text-secondary font-sf-pro">/month</span>
                </div>
              </div>

              <div className="border-t border-onboarding-border-light pt-6 space-y-3">
                <p className="text-sm font-medium text-onboarding-text-primary mb-3 font-sf-pro">Everything in Free, plus:</p>
                {[
                  'Full roster management',
                  'Practice & workout plans',
                  'Team analytics',
                  'Player development',
                  'Compliance calendar',
                  'Unlimited messaging',
                  'Priority support'
                ].map((feature) => (
                  <div key={feature} className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-onboarding-kelly-green flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-onboarding-text-secondary font-sf-pro">{feature}</span>
                  </div>
                ))}
              </div>

              <OnboardingButton onClick={() => handleSelect('elite')}>
                Select Elite
              </OnboardingButton>
            </motion.div>
          </div>

          <div className="text-center">
            <button
              onClick={() => setShowComparison(true)}
              className="text-sm text-onboarding-kelly-green hover:underline font-sf-pro"
            >
              Compare all features
            </button>
          </div>

          <button
            onClick={onBack}
            className="text-sm text-onboarding-text-secondary hover:text-onboarding-text-primary transition-colors flex items-center gap-2 font-sf-pro"
          >
            <span>←</span> Back
          </button>
        </div>
      </div>

      <PlanComparisonModal isOpen={showComparison} onClose={() => setShowComparison(false)} />
    </motion.div>
  );
}

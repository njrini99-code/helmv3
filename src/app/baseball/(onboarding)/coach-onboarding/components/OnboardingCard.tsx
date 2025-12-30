'use client';

import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface OnboardingCardProps {
  children: ReactNode;
  icon?: ReactNode;
  onClick?: () => void;
  selected?: boolean;
  className?: string;
}

export function OnboardingCard({
  children,
  icon,
  onClick,
  selected = false,
  className = '',
}: OnboardingCardProps) {
  return (
    <motion.button
      type="button"
      className={`
        w-full h-20 flex items-center justify-center gap-3
        bg-white rounded-xl border transition-all duration-200
        text-lg font-medium font-sf-pro
        ${
          selected
            ? 'border-onboarding-kelly-green bg-onboarding-kelly-green-muted text-onboarding-kelly-green shadow-md'
            : 'border-onboarding-border-light text-onboarding-text-primary hover:border-onboarding-kelly-green hover:shadow-lg hover:-translate-y-0.5'
        }
        ${className}
      `}
      onClick={onClick}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
    >
      {icon && (
        <motion.span
          className="text-2xl"
          whileHover={{ scale: 1.1 }}
          transition={{ duration: 0.2 }}
        >
          {icon}
        </motion.span>
      )}
      {children}
    </motion.button>
  );
}
